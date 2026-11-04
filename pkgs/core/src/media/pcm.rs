use super::ffmpeg;
use crate::util::TempFile;
use crate::util::proc::run_checked;
use anyhow::{Context, Result};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::Command;

pub const RATE: u32 = 48_000;
pub const CHANNELS: usize = 2;
pub const BYTES_PER_FRAME: u64 = 4;

#[derive(Clone, Debug, PartialEq)]
pub struct Pcm {
    pub path: PathBuf,
}

pub fn convert(src: &Path, dst: &Path) -> Result<Pcm> {
    write(dst, |tmp| {
        let mut c = ffmpeg();
        c.args(["-y", "-i"]).arg(src).args(["-map", "0:a:0", "-vn", "-sn", "-dn"]);
        pcm_out(&mut c, tmp);
        run_checked(c).with_context(|| format!("cannot decode audio of {}", src.display()))
    })
}

pub fn stretch(base: &Pcm, from: f64, len: f64, rate: f64, dst: &Path) -> Result<Pcm> {
    write(dst, |tmp| {
        let mut c = ffmpeg();
        c.args(["-y", "-f", "s16le", "-ar", &RATE.to_string(), "-ac", &CHANNELS.to_string()]);
        c.args(["-ss", &format!("{from:.6}"), "-t", &format!("{len:.6}"), "-i"]).arg(&base.path);
        c.args(["-af", &tempo(rate)]);
        pcm_out(&mut c, tmp);
        run_checked(c).with_context(|| format!("cannot change the speed of {}", base.path.display()))
    })
}

/// Raw PCM as the mixer reads it: 16-bit little-endian samples at `RATE` with `CHANNELS` channels.
fn pcm_out(c: &mut Command, dst: &Path) {
    c.args(["-ac", &CHANNELS.to_string(), "-ar", &RATE.to_string(), "-c:a", "pcm_s16le", "-f", "s16le"]);
    c.arg(dst);
}

fn tempo(mut rate: f64) -> String {
    let mut out = vec![];
    while rate < 0.5 {
        out.push("atempo=0.5".to_string());
        rate /= 0.5;
    }
    while rate > 100.0 {
        out.push("atempo=100".to_string());
        rate /= 100.0;
    }
    out.push(format!("atempo={rate:.6}"));
    out.join(",")
}

/// The PCM at `dst`, which `make` writes unless an earlier run left it there.
fn write<T>(dst: &Path, make: impl FnOnce(&Path) -> Result<T>) -> Result<Pcm> {
    if !dst.exists() {
        if let Some(dir) = dst.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let name = dst.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let n = std::process::id()
            ^ (std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |d| d.subsec_nanos()));
        let tmp = TempFile(dst.with_file_name(format!(".{name}.{n:x}.tmp")));
        make(tmp.as_ref())?;
        std::fs::rename(tmp.as_ref(), dst)?;
    }
    Ok(Pcm { path: dst.to_path_buf() })
}

pub struct PcmReader {
    file: File,
    frames: u64,
    buf: Vec<u8>,
}

impl PcmReader {
    pub fn open(p: &Pcm) -> Result<PcmReader> {
        let file = File::open(&p.path).with_context(|| format!("cannot open {}", p.path.display()))?;
        let frames = file.metadata()?.len() / BYTES_PER_FRAME;
        Ok(PcmReader { file, frames, buf: vec![] })
    }

    pub fn read(&mut self, start: u64, n: usize, out: &mut Vec<f32>) -> Result<()> {
        out.clear();
        out.resize(n * CHANNELS, 0.0);
        if start >= self.frames {
            return Ok(());
        }
        let avail = ((self.frames - start) as usize).min(n);
        self.buf.resize(avail * BYTES_PER_FRAME as usize, 0);
        self.file.seek(SeekFrom::Start(start * BYTES_PER_FRAME))?;
        self.file.read_exact(&mut self.buf)?;
        for (i, ch) in self.buf.as_chunks::<2>().0.iter().enumerate() {
            out[i] = i16::from_le_bytes(*ch) as f32 / 32768.0;
        }
        Ok(())
    }
}
