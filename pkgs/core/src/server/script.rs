use super::App;
use std::{io::Write, process::Stdio, time::Duration};
use tokio::{io::AsyncReadExt, process::Command, task::JoinHandle};

struct ProcessGroup(u32);
impl ProcessGroup {
    fn terminate(&self, force: bool) {
        #[cfg(unix)]
        unsafe {
            libc::kill(-(self.0 as i32), if force { libc::SIGKILL } else { libc::SIGTERM });
        }
        #[cfg(windows)]
        {
            let _ = force;
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &self.0.to_string(), "/T", "/F"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
    }
}
impl Drop for ProcessGroup {
    fn drop(&mut self) {
        self.terminate(true);
    }
}

fn plain(bytes: &[u8]) -> String {
    let mut result = vec![];
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == 0x1b && bytes.get(at + 1) == Some(&b'[') {
            at += 2;
            while at < bytes.len() {
                let b = bytes[at];
                at += 1;
                if (0x40..=0x7e).contains(&b) {
                    break;
                }
            }
        } else {
            result.push(bytes[at]);
            at += 1;
        }
    }
    String::from_utf8_lossy(&result).into_owned()
}

pub(super) fn start(command: String, app: App) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut cmd = if cfg!(windows) {
            let mut cmd = Command::new("cmd");
            cmd.args(["/C", &command]);
            cmd
        } else {
            let mut cmd = Command::new("sh");
            cmd.args(["-c", &command]);
            cmd
        };
        cmd.current_dir(&app.root)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        if std::env::var_os("BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD").is_none() {
            cmd.env("BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD", "1");
        }
        #[cfg(unix)]
        cmd.process_group(0);
        let mut child = match cmd.spawn() {
            Ok(child) => child,
            Err(error) => {
                let mut live = app.live.lock().unwrap();
                live.script_error = Some(error.to_string());
                app.status(&mut live);
                return;
            }
        };
        let group = ProcessGroup(child.id().expect("running script PID"));
        let mut stderr = child.stderr.take().unwrap();
        let mut buffer = [0; 4096];
        let mut message = vec![];
        let mut writes = app.live.lock().unwrap().writes;
        let mut deadline = None;
        let mut eof = false;
        let mut exited = false;
        loop {
            tokio::select! {
                biased;
                _ = app.cancel.cancelled() => break,
                status = child.wait(), if !exited => {
                    exited = true;
                    eprintln!("`{command}` exited ({status:?})");
                    if status.as_ref().is_ok_and(|s| !s.success()) && message.is_empty() {
                        message.extend_from_slice(format!("`{command}` exited ({status:?})").as_bytes());
                        deadline = Some(tokio::time::Instant::now() + Duration::from_millis(150));
                    }
                }
                read = stderr.read(&mut buffer), if !eof => {
                    match read {
                        Ok(0) | Err(_) => eof = true,
                        Ok(n) => {
                            let _ = std::io::stderr().write_all(&buffer[..n]);
                            let current = app.live.lock().unwrap().writes;
                            if current != writes { message.clear(); writes = current; }
                            message.extend_from_slice(&buffer[..n]);
                            if message.len() > 64000 { message.drain(..message.len() - 64000); }
                            deadline = Some(tokio::time::Instant::now() + Duration::from_millis(150));
                        }
                    }
                }
                _ = async { tokio::time::sleep_until(deadline.unwrap_or_else(tokio::time::Instant::now)).await }, if deadline.is_some() => {
                    deadline = None;
                    let mut live = app.live.lock().unwrap();
                    if live.writes == writes && !message.is_empty() {
                        live.script_error = Some(plain(&message)); app.status(&mut live);
                    }
                }
            }
            if eof && exited && deadline.is_none() {
                break;
            }
        }
        group.terminate(false);
        if tokio::time::timeout(Duration::from_millis(300), child.wait()).await.is_err() {
            group.terminate(true);
            let _ = child.wait().await;
        }
    })
}
