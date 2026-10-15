use crate::media::args::{self, EncodeArgs};
use crate::util::proc::{ChildGuard, StderrTail, command, tail};
use crate::util::temp::TempFile;
use anyhow::{Context, Result, bail};
use std::io::Write;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::mpsc::{Receiver, SyncSender, sync_channel};
use std::thread::JoinHandle;

enum Msg {
    Frame(Vec<u8>),
    Repeat,
}

pub struct Encoder {
    child: ChildGuard,
    tx: Option<SyncSender<Msg>>,
    pool: Receiver<Vec<u8>>,
    writer: Option<JoinHandle<std::io::Result<()>>>,
    stderr: StderrTail,
    part: TempFile,
    out: PathBuf,
}

impl Encoder {
    pub fn spawn(e: &EncodeArgs) -> Result<Encoder> {
        let out = e.out.to_path_buf();
        if let Some(d) = out.parent()
            && !d.as_os_str().is_empty()
        {
            std::fs::create_dir_all(d)?;
        }
        let mut part = out.clone().into_os_string();
        part.push(".part");
        let part = TempFile(PathBuf::from(part));
        let argv = args::encode(&EncodeArgs { out: part.as_ref(), ..*e });
        let mut child = command(&argv)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .context("failed to start ffmpeg (is it installed and on PATH?)")?;
        let mut stdin = child.stdin.take().unwrap();
        let stderr = StderrTail::spawn(child.stderr.take().unwrap());
        let (tx, rx) = sync_channel::<Msg>(3);
        let (pool_tx, pool) = sync_channel::<Vec<u8>>(4);
        let writer = std::thread::spawn(move || -> std::io::Result<()> {
            let mut last: Option<Vec<u8>> = None;
            for m in rx {
                match m {
                    Msg::Frame(buf) => {
                        stdin.write_all(&buf)?;
                        if let Some(old) = last.replace(buf) {
                            let _ = pool_tx.try_send(old);
                        }
                    }
                    Msg::Repeat => {
                        if let Some(b) = &last {
                            stdin.write_all(b)?;
                        }
                    }
                }
            }
            stdin.flush()
        });
        Ok(Encoder {
            child: ChildGuard(Some(child)),
            tx: Some(tx),
            pool,
            writer: Some(writer),
            stderr,
            part,
            out,
        })
    }

    fn send(&mut self, m: Msg) -> Result<()> {
        if self.tx.as_ref().unwrap().send(m).is_err() {
            return Err(self.failure("ffmpeg stopped accepting frames"));
        }
        Ok(())
    }

    pub fn push(&mut self, rgba: &[u8]) -> Result<()> {
        let mut buf = self.pool.try_recv().unwrap_or_default();
        buf.clear();
        buf.extend_from_slice(rgba);
        self.send(Msg::Frame(buf))
    }

    pub fn repeat(&mut self) -> Result<()> {
        self.send(Msg::Repeat)
    }

    fn failure(&mut self, what: &str) -> anyhow::Error {
        self.tx = None;
        if let Some(w) = self.writer.take() {
            let _ = w.join();
        }
        let _ = self.child.child().wait();
        anyhow::anyhow!("{what}:\n{}", tail(&self.stderr.text(), 20))
    }

    pub fn finish(mut self) -> Result<()> {
        self.tx = None;
        let wres = self.writer.take().unwrap().join();
        let status = self.child.child().wait()?;
        self.child.0 = None;
        if !status.success() || !matches!(wres, Ok(Ok(()))) {
            bail!("ffmpeg failed ({status}):\n{}", tail(&self.stderr.text(), 20));
        }
        std::fs::rename(self.part.as_ref(), &self.out)?;
        Ok(())
    }
}

impl Drop for Encoder {
    fn drop(&mut self) {
        self.tx = None;
        self.child = ChildGuard(None);
        if let Some(writer) = self.writer.take() {
            let _ = writer.join();
        }
    }
}
