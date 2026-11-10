use super::pcm::{CHANNELS, RATE};
use super::{Fps, ffmpeg};
use crate::util::TempFile;
use crate::util::proc::{ChildGuard, tail};
use anyhow::{Context, Result, bail};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc::{Receiver, SyncSender, sync_channel};
use std::thread::JoinHandle;

pub struct EncodeArgs<'a> {
    pub w: u32,
    pub h: u32,
    pub fps: Fps,
    pub audio: Option<&'a Path>,
    pub preset: &'a str,
    pub crf: u8,
    pub audio_bitrate: &'a str,
}

impl EncodeArgs<'_> {
    fn command(&self, out: &Path) -> Command {
        let mut c = ffmpeg();
        c.args(["-y", "-f", "rawvideo", "-pix_fmt", "rgba"]);
        c.args(["-video_size", &format!("{}x{}", self.w, self.h)]);
        c.args(["-framerate", &format!("{}/{}", self.fps.num, self.fps.den)]);
        c.args(["-i", "pipe:0"]);
        if let Some(pcm) = self.audio {
            c.args(["-f", "s16le", "-ar", &RATE.to_string(), "-ac", &CHANNELS.to_string()]);
            c.arg("-i").arg(pcm).args(["-map", "0:v:0", "-map", "1:a:0"]);
        }
        c.args(["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"]);
        c.args(["-c:v", "libx264", "-preset", self.preset, "-crf", &self.crf.to_string()]);
        let gop = (self.fps.as_f64() * 2.0).round().max(1.0) as u32;
        c.args(["-g", &gop.to_string()]);
        c.args(["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]);
        if self.audio.is_some() {
            c.args(["-c:a", "aac", "-b:a", self.audio_bitrate]);
        }
        c.args(["-movflags", "+faststart", "-f", "mp4"]).arg(out);
        c
    }
}

enum Msg {
    Frame(Vec<u8>),
    Repeat,
}

pub struct Encoder {
    child: ChildGuard,
    tx: Option<SyncSender<Msg>>,
    pool: Receiver<Vec<u8>>,
    writer: Option<JoinHandle<std::io::Result<()>>>,
    stderr: Option<JoinHandle<String>>,
    part: TempFile,
    out: PathBuf,
}

impl Encoder {
    pub fn spawn(e: &EncodeArgs, out: &Path) -> Result<Encoder> {
        let out = out.to_path_buf();
        if let Some(d) = out.parent()
            && !d.as_os_str().is_empty()
        {
            std::fs::create_dir_all(d)?;
        }
        let mut part = out.clone().into_os_string();
        part.push(".part");
        let part = TempFile(PathBuf::from(part));
        let mut child = e
            .command(part.as_ref())
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .context("failed to start ffmpeg (is it installed and on PATH?)")?;
        let mut stdin = child.stdin.take().unwrap();
        // At `-loglevel error` ffmpeg writes only its errors here, so keep them all.
        let mut err = child.stderr.take().unwrap();
        let stderr = std::thread::spawn(move || {
            let mut bytes = vec![];
            let _ = err.read_to_end(&mut bytes);
            String::from_utf8_lossy(&bytes).into_owned()
        });
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
            stderr: Some(stderr),
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
        anyhow::anyhow!("{what}:\n{}", self.stderr())
    }

    fn stderr(&mut self) -> String {
        let text = self.stderr.take().map(|h| h.join().unwrap_or_default()).unwrap_or_default();
        tail(&text, 20)
    }

    pub fn finish(mut self) -> Result<()> {
        self.tx = None;
        let wres = self.writer.take().unwrap().join();
        let status = self.child.child().wait()?;
        self.child.0 = None;
        if !status.success() || !matches!(wres, Ok(Ok(()))) {
            bail!("ffmpeg failed ({status}):\n{}", self.stderr());
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
