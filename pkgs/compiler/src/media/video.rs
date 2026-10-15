use super::{Fps, args};
use crate::util::proc::{ChildGuard, command};
use anyhow::{Context, Result};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{ChildStdout, Stdio};
use tiny_skia::Pixmap;

pub struct VideoReader {
    src: PathBuf,
    w: u32,
    h: u32,
    fps: Fps,
    dur: f64,
    child: Option<(ChildGuard, BufReader<ChildStdout>)>,
    c0: f64,
    read: u64,
    cur: Option<(f64, Pixmap)>,
    buf: Vec<u8>,
}

impl VideoReader {
    pub fn new(src: &Path, w: u32, h: u32, fps: Fps, dur: f64) -> VideoReader {
        VideoReader { src: src.to_path_buf(), w: w.max(2), h: h.max(2), fps, dur, child: None, c0: 0.0, read: 0, cur: None, buf: vec![] }
    }

    fn period(&self) -> f64 {
        1.0 / self.fps.as_f64()
    }

    fn spawn(&mut self, c: f64) -> Result<()> {
        self.child = None;
        let argv = args::video_frames(&self.src, c, self.fps, self.w, self.h);
        let mut child = command(&argv)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .with_context(|| format!("failed to start ffmpeg for {}", self.src.display()))?;
        let out = BufReader::with_capacity(1 << 20, child.stdout.take().unwrap());
        self.child = Some((ChildGuard(Some(child)), out));
        self.c0 = c;
        self.read = 0;
        Ok(())
    }

    fn next(&mut self) -> Result<bool> {
        let Some((_, out)) = self.child.as_mut() else { return Ok(false) };
        let size = (self.w * self.h * 4) as usize;
        self.buf.resize(size, 0);
        match out.read_exact(&mut self.buf) {
            Ok(()) => {
                let t = self.c0 + self.read as f64 * self.period();
                self.read += 1;
                let pm = Pixmap::from_vec(std::mem::take(&mut self.buf), tiny_skia::IntSize::from_wh(self.w, self.h).unwrap())
                    .context("bad frame")?;
                if let Some((_, old)) = self.cur.replace((t, pm)) {
                    self.buf = old.take();
                }
                Ok(true)
            }
            Err(_) => {
                self.child = None;
                Ok(false)
            }
        }
    }

    pub fn frame_at(&mut self, c: f64) -> Result<&Pixmap> {
        let p = self.period();
        let c = c.clamp(0.0, (self.dur - p).max(0.0));
        let half = p * 0.5;
        if let Some((t, _)) = &self.cur
            && (t - c).abs() < half
        {
            return Ok(&self.cur.as_ref().unwrap().1);
        }
        let next_t = self.c0 + self.read as f64 * p;
        let sequential = self.child.is_some() && c >= next_t - half && c < next_t + 2.0;
        if !sequential {
            self.spawn(c)?;
        }
        loop {
            let next_t = self.c0 + self.read as f64 * p;
            if !self.next()? {
                break;
            }
            if next_t + half > c {
                break;
            }
        }
        if self.cur.is_none() {
            let mut pm = Pixmap::new(self.w, self.h).context("bad video size")?;
            pm.fill(tiny_skia::Color::BLACK);
            self.cur = Some((c, pm));
        }
        Ok(&self.cur.as_ref().unwrap().1)
    }
}
