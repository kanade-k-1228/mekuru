//! The compiler and preview server share typed scenes in one native process.
mod files;
mod script;
mod socket;
mod watch;

use crate::preview::{Diagnostic, Request, Session, delta::Published};
use anyhow::{Context, Result};
use axum::{
    Router,
    body::Body,
    extract::State,
    extract::ws::Utf8Bytes,
    http::{Method, Request as HttpRequest, StatusCode},
    response::Response,
    routing::get,
    serve::ListenerExt,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Condvar, Mutex},
    time::{Duration, Instant},
};
use tokio::{net::TcpListener, sync::broadcast, task::JoinHandle};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

#[derive(Clone, Debug)]
pub struct Options {
    pub xml: PathBuf,
    pub root: Option<PathBuf>,
    pub run: Option<String>,
    pub port: u16,
    pub title: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewState {
    path: String,
    version: u64,
    preview_version: u64,
    status: &'static str,
    error: Option<String>,
    diagnostics: Vec<Diagnostic>,
}

struct Live {
    state: PreviewState,
    scene: Option<Published>,
    xml: String,
    writes: u64,
    script_error: Option<String>,
    compile_error: Option<String>,
}
impl Live {
    fn snapshot(&self) -> serde_json::Result<String> {
        #[derive(Serialize)]
        struct Snapshot<'a> {
            r#type: &'static str,
            state: &'a PreviewState,
            preview: Option<&'a crate::preview::delta::SharedPreview>,
            resources: &'a crate::preview::delta::Resources,
        }
        serde_json::to_string(&Snapshot {
            r#type: "snapshot",
            state: &self.state,
            preview: self.scene.as_ref().map(|s| &s.preview),
            resources: self.scene.as_ref().map(|s| s.resources.as_ref()).unwrap_or(&HashMap::new()),
        })
    }
    fn refresh_error(&mut self) {
        self.state.error = self.script_error.clone().or_else(|| self.compile_error.clone());
    }
}

#[derive(Clone)]
struct App {
    root: PathBuf,
    live: Arc<Mutex<Live>>,
    events: broadcast::Sender<Utf8Bytes>,
    cancel: CancellationToken,
    connections: TaskTracker,
    queue: Arc<Queue>,
}

#[derive(Default)]
struct Pending {
    input: Option<(u64, String)>,
    closed: bool,
}
#[derive(Default)]
struct Queue {
    pending: Mutex<Pending>,
    wake: Condvar,
}
impl Queue {
    fn push(&self, version: u64, xml: String) {
        self.pending.lock().unwrap().input = Some((version, xml));
        self.wake.notify_one();
    }
    fn take(&self) -> Option<(u64, String)> {
        let mut pending = self.pending.lock().unwrap();
        while pending.input.is_none() && !pending.closed {
            pending = self.wake.wait(pending).unwrap();
        }
        if pending.closed { None } else { pending.input.take() }
    }
    fn close(&self) {
        let mut pending = self.pending.lock().unwrap();
        pending.closed = true;
        pending.input = None;
        self.wake.notify_all();
    }
}

impl App {
    fn status(&self, live: &mut Live) {
        live.refresh_error();
        let json = serde_json::to_string(&serde_json::json!({"type": "status", "state": live.state})).expect("preview state JSON");
        let _ = self.events.send(json.into());
    }
    fn changed(&self, xml: String) {
        let mut live = self.live.lock().unwrap();
        if self.cancel.is_cancelled() {
            return;
        }
        live.writes += 1;
        live.script_error = None;
        if live.xml != xml {
            live.xml = xml.clone();
            live.compile_error = None;
            live.state.version += 1;
            live.state.status = "building";
            live.state.diagnostics.clear();
            self.queue.push(live.state.version, xml);
        }
        self.status(&mut live);
    }
}

/// A bounded queue retains only the newest pending XML. Compilation stays off Tokio's I/O threads.
fn compile(app: App, path: PathBuf) {
    let mut worker = Session::default();
    while let Some((version, xml)) = app.queue.take() {
        let base_version = app.live.lock().unwrap().scene.as_ref().map(|s| s.preview.version);
        let started = Instant::now();
        let mut result = None;
        for _ in 0..2 {
            let attempt = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                worker.compile(
                    &path,
                    Some(&app.root),
                    Request {
                        version,
                        xml: xml.clone(),
                        base_version,
                    },
                )
            }));
            match attempt {
                Ok(response) => {
                    result = Some(response);
                    break;
                }
                Err(_) => {
                    worker = Session::default();
                }
            }
            if app.cancel.is_cancelled() || app.live.lock().unwrap().state.version != version {
                break;
            }
        }
        let mut live = app.live.lock().unwrap();
        if app.cancel.is_cancelled() || live.state.version != version {
            continue;
        }
        let Some(result) = result else {
            live.state.status = "error";
            live.state.diagnostics.clear();
            live.compile_error = Some("preview compilation panicked twice".into());
            app.status(&mut live);
            continue;
        };
        live.state.diagnostics = result.diagnostics;
        live.state.status = if result.preview_version.is_some() { "ready" } else { "error" };
        live.compile_error = result.preview_version.is_none().then(|| {
            live.state
                .diagnostics
                .iter()
                .map(|d| format!("L{} {}: {}", d.line, d.code, d.message))
                .collect::<Vec<_>>()
                .join("\n")
        });
        live.refresh_error();
        if let Some(version) = result.preview_version {
            live.state.preview_version = version;
            live.scene = worker.scene();
        }
        if let Some(update) = result.update {
            #[derive(Serialize)]
            struct Message<'a> {
                state: &'a PreviewState,
                #[serde(flatten)]
                update: crate::preview::delta::Update,
            }
            let json = serde_json::to_string(&Message { state: &live.state, update }).expect("preview JSON");
            let _ = app.events.send(json.into());
        } else {
            app.status(&mut live);
        }
        eprintln!("preview {} in {:.1}ms", live.state.status, started.elapsed().as_secs_f64() * 1000.0);
        for d in &live.state.diagnostics {
            eprintln!("  L{} {}: {}", d.line, d.code, d.message);
        }
    }
}

pub struct Server {
    pub address: SocketAddr,
    app: App,
    tasks: Vec<JoinHandle<()>>,
}
impl Server {
    pub fn url(&self) -> String {
        format!("http://{}", self.address)
    }
    pub async fn terminated(&self) {
        self.app.cancel.cancelled().await;
    }
    pub fn close(&self) {
        self.app.cancel.cancel();
        self.app.queue.close();
    }
    pub async fn wait(mut self) {
        self.app.cancel.cancelled().await;
        self.close();
        self.app.connections.close();
        for mut task in self.tasks.drain(..) {
            if tokio::time::timeout(Duration::from_secs(2), &mut task).await.is_err() {
                task.abort();
            }
        }
        // Upgraded sockets outlive Axum's HTTP requests; let their close frames finish.
        let _ = tokio::time::timeout(Duration::from_secs(2), self.app.connections.wait()).await;
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        self.close();
    }
}

pub async fn start(opts: Options) -> Result<Server> {
    let path = crate::normalize(&std::path::absolute(&opts.xml)?);
    let parent = path.parent().context("XML has no parent folder")?;
    let root = opts.root.unwrap_or_else(|| {
        if parent.file_name().is_some_and(|n| n == ".mekuru") {
            parent.parent().unwrap_or(parent).into()
        } else {
            parent.into()
        }
    });
    let xml = match tokio::fs::read_to_string(&path).await {
        Ok(xml) => xml,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && opts.run.is_some() => {
            tokio::fs::create_dir_all(parent).await?;
            "<mekuru><seq/></mekuru>".into()
        }
        Err(e) => return Err(e).with_context(|| format!("cannot read {}", path.display())),
    };
    let root = tokio::fs::canonicalize(root).await.context("cannot open project root")?;
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, opts.port))
        .await
        .with_context(|| format!("cannot listen on 127.0.0.1:{} (is the port in use? try --port)", opts.port))?;
    let address = listener.local_addr()?;
    // Send small status and patch messages immediately, without delayed-ACK/Nagle stalls.
    let listener = listener.tap_io(|socket| {
        if let Err(error) = socket.set_nodelay(true) {
            eprintln!("preview TCP_NODELAY: {error}");
        }
    });
    let (events, _) = broadcast::channel(64);
    let app = App {
        root,
        live: Arc::new(Mutex::new(Live {
            state: PreviewState {
                path: opts.title.unwrap_or_else(|| opts.xml.to_string_lossy().into_owned()),
                version: 1,
                preview_version: 0,
                status: "building",
                error: None,
                diagnostics: vec![],
            },
            scene: None,
            xml: xml.clone(),
            writes: 0,
            script_error: None,
            compile_error: None,
        })),
        events,
        cancel: CancellationToken::new(),
        connections: TaskTracker::new(),
        queue: Arc::default(),
    };
    app.queue.push(1, xml);
    let watcher = watch::start(path.clone(), app.clone())?;
    let mut server = Server {
        address,
        app: app.clone(),
        tasks: vec![watcher],
    };
    let worker_app = app.clone();
    std::thread::Builder::new()
        .name("preview-compiler".into())
        .spawn(move || compile(worker_app, path))?;
    if let Some(command) = opts.run {
        server.tasks.push(script::start(command, app.clone()));
    }
    let router = Router::new().route("/api/ws", get(socket::upgrade)).fallback(http).with_state(app.clone());
    server.tasks.push(tokio::spawn(async move {
        if let Err(error) = axum::serve(listener, router).with_graceful_shutdown(app.cancel.clone().cancelled_owned()).await {
            eprintln!("preview server: {error}");
        }
        app.cancel.cancel();
        app.queue.close();
    }));
    Ok(server)
}

async fn http(State(app): State<App>, request: HttpRequest<Body>) -> Response {
    let (request, _) = request.into_parts();
    if request.method != Method::GET && request.method != Method::HEAD {
        return Response::builder()
            .status(StatusCode::METHOD_NOT_ALLOWED)
            .header("allow", "GET, HEAD")
            .body(Body::empty())
            .unwrap();
    }
    let path = request.uri.path();
    if path == "/api/state" || path == "/api/preview" {
        let live = app.live.lock().unwrap();
        let json = if path == "/api/state" {
            serde_json::to_string(&live.state)
        } else {
            if live.scene.is_none() {
                return files::empty(StatusCode::NOT_FOUND);
            }
            live.snapshot()
        }
        .expect("preview JSON");
        return Response::builder()
            .header("content-type", "application/json")
            .header("cache-control", "no-store")
            .header("content-length", json.len())
            .body(if request.method == Method::HEAD { Body::empty() } else { Body::from(json) })
            .unwrap();
    }
    if let Some(rel) = path.strip_prefix("/files/") {
        return files::serve(&app.root, rel, &request).await;
    }
    if path.starts_with("/api/") {
        return files::empty(StatusCode::NOT_FOUND);
    }
    files::viewer(&request)
}

pub fn open_browser(url: &str) {
    let wsl = cfg!(target_os = "linux") && (std::env::var_os("WSL_INTEROP").is_some() || std::path::Path::new("/proc/sys/fs/binfmt_misc/WSLInterop").exists());
    let commands: &[(&str, &[&str])] = if wsl {
        &[("wslview", &[]), ("cmd.exe", &["/C", "start", ""])]
    } else if cfg!(target_os = "windows") {
        &[("cmd", &["/C", "start", ""])]
    } else if cfg!(target_os = "macos") {
        &[("open", &[])]
    } else {
        &[("xdg-open", &[])]
    };
    for (program, args) in commands {
        let mut command = std::process::Command::new(program);
        command
            .args(*args)
            .arg(url)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        if wsl {
            command.current_dir("/mnt/c");
        }
        if let Ok(mut child) = command.spawn() {
            std::thread::spawn(move || {
                let _ = child.wait();
            });
            break;
        }
    }
}

pub async fn shutdown_signal() -> Result<()> {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
        tokio::select! { result = tokio::signal::ctrl_c() => result?, _ = term.recv() => {} }
    }
    #[cfg(not(unix))]
    tokio::signal::ctrl_c().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_latest_pending_input_survives_and_close_wakes_the_compiler() {
        let queue = Arc::new(Queue::default());
        queue.push(1, "old".into());
        queue.push(2, "latest".into());
        assert_eq!(queue.take(), Some((2, "latest".into())));
        let other = queue.clone();
        let thread = std::thread::spawn(move || other.take());
        queue.close();
        assert_eq!(thread.join().unwrap(), None);
    }

    #[tokio::test]
    async fn slow_subscribers_resynchronize_without_unbounded_event_queues() {
        let (events, _) = broadcast::channel(2);
        let app = App {
            root: PathBuf::new(),
            live: Arc::new(Mutex::new(Live {
                state: PreviewState {
                    path: "test.xml".into(),
                    version: 1,
                    preview_version: 0,
                    status: "building",
                    error: None,
                    diagnostics: vec![],
                },
                scene: None,
                xml: String::new(),
                writes: 0,
                script_error: None,
                compile_error: None,
            })),
            events,
            cancel: CancellationToken::new(),
            connections: TaskTracker::new(),
            queue: Arc::default(),
        };
        let mut subscription = socket::Subscription::new(app.clone());
        let first: serde_json::Value = serde_json::from_str(&subscription.snapshot()).unwrap();
        assert_eq!(first["type"], "snapshot");
        for version in 2..=8 {
            let mut live = app.live.lock().unwrap();
            live.state.version = version;
            app.status(&mut live);
        }
        let restored: serde_json::Value = serde_json::from_str(&subscription.next().await.unwrap()).unwrap();
        assert_eq!(restored["type"], "snapshot");
        assert_eq!(restored["state"]["version"], 8);
        {
            let mut live = app.live.lock().unwrap();
            live.state.version = 9;
            app.status(&mut live);
        }
        let next: serde_json::Value = serde_json::from_str(&subscription.next().await.unwrap()).unwrap();
        assert_eq!(next["type"], "status");
        assert_eq!(next["state"]["version"], 9);
        // An explicit client resync also discards any queued events preceding its snapshot.
        app.status(&mut app.live.lock().unwrap());
        let full: serde_json::Value = serde_json::from_str(&subscription.snapshot()).unwrap();
        assert_eq!(full["state"]["version"], 9);
        assert!(tokio::time::timeout(Duration::from_millis(10), subscription.next()).await.is_err());
    }
}
