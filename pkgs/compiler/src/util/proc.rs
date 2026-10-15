use anyhow::{Context, Result, bail};
use std::io::{BufRead, BufReader, Read};
use std::process::{Child, Command, Output, Stdio};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

pub fn ffmpeg() -> String {
    std::env::var("MEKURU_FFMPEG").unwrap_or_else(|_| "ffmpeg".into())
}

pub fn ffprobe() -> String {
    std::env::var("MEKURU_FFPROBE").unwrap_or_else(|_| "ffprobe".into())
}

pub fn command(argv: &[String]) -> Command {
    let mut c = Command::new(&argv[0]);
    c.args(&argv[1..]);
    c
}

pub fn display_argv(argv: &[String]) -> String {
    argv.iter()
        .map(|a| if a.contains([' ', '"', '\'']) { format!("'{a}'") } else { a.clone() })
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn run_checked(argv: &[String]) -> Result<Output> {
    let out = command(argv)
        .stdin(Stdio::null())
        .output()
        .with_context(|| format!("failed to start `{}` (is it installed and on PATH?)", argv[0]))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        bail!("`{}` failed ({}):\n{}", display_argv(argv), out.status, tail(&err, 20));
    }
    Ok(out)
}

pub fn tail(s: &str, lines: usize) -> String {
    let v: Vec<&str> = s.lines().collect();
    v[v.len().saturating_sub(lines)..].join("\n")
}

pub struct ChildGuard(pub Option<Child>);

impl ChildGuard {
    pub fn child(&mut self) -> &mut Child {
        self.0.as_mut().expect("child taken")
    }
}

impl Drop for ChildGuard {
    fn drop(&mut self) {
        if let Some(mut c) = self.0.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

pub struct StderrTail {
    buf: Arc<Mutex<Vec<String>>>,
    handle: Option<JoinHandle<()>>,
}

impl StderrTail {
    pub fn spawn(stderr: impl Read + Send + 'static) -> Self {
        let buf = Arc::new(Mutex::new(Vec::new()));
        let b = buf.clone();
        let handle = std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let mut v = b.lock().unwrap();
                v.push(line);
                if v.len() > 40 {
                    v.remove(0);
                }
            }
        });
        StderrTail { buf, handle: Some(handle) }
    }

    pub fn text(&mut self) -> String {
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
        self.buf.lock().unwrap().join("\n")
    }
}
