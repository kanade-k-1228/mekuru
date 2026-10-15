use crate::media::pcm::{CHANNELS, Pcm, PcmReader, RATE};
use crate::schedule::Fade;
use anyhow::Result;
use std::collections::HashMap;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug)]
pub struct Track {
    pub pcm: Pcm,
    pub at: f64,
    pub len: f64,
    pub src: f64,
    pub gain: f32,
    pub env: Vec<Fade>,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct MixStats {
    pub peak: f32,
    pub clipped: u64,
}

const BLOCK: usize = 4800;

fn envelope(env: &[Fade], t: f64) -> f32 {
    env.iter().map(|f| f.at(t)).product::<f64>() as f32
}

pub fn write_wav_header(w: &mut impl Write, frames: u64) -> std::io::Result<()> {
    let data = (frames * 4).min(u32::MAX as u64 - 36) as u32;
    w.write_all(b"RIFF")?;
    w.write_all(&(36 + data).to_le_bytes())?;
    w.write_all(b"WAVEfmt ")?;
    w.write_all(&16u32.to_le_bytes())?;
    w.write_all(&1u16.to_le_bytes())?;
    w.write_all(&(CHANNELS as u16).to_le_bytes())?;
    w.write_all(&RATE.to_le_bytes())?;
    w.write_all(&(RATE * 4).to_le_bytes())?;
    w.write_all(&4u16.to_le_bytes())?;
    w.write_all(&16u16.to_le_bytes())?;
    w.write_all(b"data")?;
    w.write_all(&data.to_le_bytes())
}

pub fn mix_wav(tracks: &[Track], from: f64, frames: u64, out: &Path) -> Result<MixStats> {
    let mut w = BufWriter::with_capacity(1 << 20, std::fs::File::create(out)?);
    write_wav_header(&mut w, frames)?;
    let mut readers: HashMap<PathBuf, PcmReader> = HashMap::new();
    let mut stats = MixStats::default();
    let mut acc = vec![0f32; BLOCK * CHANNELS];
    let mut tmp = vec![];
    let rate = RATE as f64;
    let mut b0 = 0u64;
    while b0 < frames {
        let n = (BLOCK as u64).min(frames - b0) as usize;
        acc[..n * CHANNELS].fill(0.0);
        let (bt0, bt1) = (from + b0 as f64 / rate, from + (b0 + n as u64) as f64 / rate);
        for tr in tracks {
            if tr.at >= bt1 || tr.at + tr.len <= bt0 || tr.gain <= 0.0 {
                continue;
            }
            let s_lo = (((tr.at - from) * rate).round().max(b0 as f64) as u64).min(b0 + n as u64);
            let s_hi = (((tr.at + tr.len - from) * rate).round().min((b0 + n as u64) as f64).max(0.0)) as u64;
            if s_hi <= s_lo {
                continue;
            }
            let reader = match readers.get_mut(&tr.pcm.path) {
                Some(r) => r,
                None => readers.entry(tr.pcm.path.clone()).or_insert(PcmReader::open(&tr.pcm)?),
            };
            let pos = tr.src + (from + s_lo as f64 / rate - tr.at);
            let run = s_hi - s_lo;
            reader.read((pos * rate).round().max(0.0) as u64, run as usize, &mut tmp)?;
            for j in 0..run as usize {
                let oi = (s_lo - b0) as usize + j;
                let tt = from + (s_lo as f64 + j as f64) / rate;
                let g = tr.gain * envelope(&tr.env, tt);
                acc[oi * 2] += tmp[j * 2] * g;
                acc[oi * 2 + 1] += tmp[j * 2 + 1] * g;
            }
        }
        let mut bytes = Vec::with_capacity(n * 4);
        for &v in &acc[..n * CHANNELS] {
            stats.peak = stats.peak.max(v.abs());
            if v.abs() > 1.0 {
                stats.clipped += 1;
            }
            let s = (v.clamp(-1.0, 1.0) * 32767.0).round() as i16;
            bytes.extend_from_slice(&s.to_le_bytes());
        }
        w.write_all(&bytes)?;
        b0 += n as u64;
    }
    w.flush()?;
    Ok(stats)
}
