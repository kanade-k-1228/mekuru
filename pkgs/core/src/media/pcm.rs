use super::args;
use crate::util::proc::run_checked;
use crate::util::temp::TempFile;
use anyhow::{Context, Result};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

pub const RATE: u32 = 48_000;
pub const CHANNELS: usize = 2;
pub const BYTES_PER_FRAME: u64 = 4;

#[derive(Clone, Debug, PartialEq)]
pub struct Pcm {
    pub path: PathBuf,
    pub frames: u64,
}

impl Pcm {
    pub fn open(path: &Path) -> Result<Pcm> {
        let len = std::fs::metadata(path)
            .with_context(|| format!("missing audio cache {}", path.display()))?
            .len();
        Ok(Pcm {
            path: path.to_path_buf(),
            frames: len / BYTES_PER_FRAME,
        })
    }
}

pub fn convert(src: &Path, dst: &Path) -> Result<Pcm> {
    write(dst, |tmp| {
        run_checked(&args::to_pcm(src, tmp)).with_context(|| format!("cannot decode audio of {}", src.display()))
    })
}

pub fn stretch(base: &Pcm, from: f64, len: f64, rate: f64, dst: &Path) -> Result<Pcm> {
    write(dst, |tmp| {
        run_checked(&args::stretch_pcm(&base.path, from, len, rate, tmp)).with_context(|| format!("cannot change the speed of {}", base.path.display()))
    })
}

fn write<T>(dst: &Path, make: impl FnOnce(&Path) -> Result<T>) -> Result<Pcm> {
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
    Pcm::open(dst)
}

pub struct PcmReader {
    file: File,
    pub frames: u64,
    buf: Vec<u8>,
}

impl PcmReader {
    pub fn open(p: &Pcm) -> Result<PcmReader> {
        Ok(PcmReader {
            file: File::open(&p.path).with_context(|| format!("cannot open {}", p.path.display()))?,
            frames: p.frames,
            buf: vec![],
        })
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
