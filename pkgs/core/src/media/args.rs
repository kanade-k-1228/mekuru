use super::{Fps, pcm};
use std::path::Path;
use std::process::Command;

fn ffmpeg() -> Command {
    let mut c = Command::new(std::env::var("MEKURU_FFMPEG").unwrap_or_else(|_| "ffmpeg".into()));
    c.args(["-hide_banner", "-nostdin", "-loglevel", "error"]);
    c
}

/// Raw PCM as the mixer reads it: 16-bit little-endian samples at `pcm::RATE` with `pcm::CHANNELS` channels.
fn pcm_out(c: &mut Command, dst: &Path) {
    c.args([
        "-ac",
        &pcm::CHANNELS.to_string(),
        "-ar",
        &pcm::RATE.to_string(),
        "-c:a",
        "pcm_s16le",
        "-f",
        "s16le",
    ]);
    c.arg(dst);
}

pub fn probe(src: &Path) -> Command {
    let mut c = Command::new(std::env::var("MEKURU_FFPROBE").unwrap_or_else(|_| "ffprobe".into()));
    c.args(["-v", "error", "-print_format", "json", "-show_format", "-show_streams"]).arg(src);
    c
}

pub fn to_pcm(src: &Path, dst: &Path) -> Command {
    let mut c = ffmpeg();
    c.args(["-y", "-i"]).arg(src).args(["-map", "0:a:0", "-vn", "-sn", "-dn"]);
    pcm_out(&mut c, dst);
    c
}

pub fn stretch_pcm(src: &Path, from: f64, len: f64, rate: f64, dst: &Path) -> Command {
    let mut c = ffmpeg();
    c.args(["-y", "-f", "s16le", "-ar", &pcm::RATE.to_string(), "-ac", &pcm::CHANNELS.to_string()]);
    c.args(["-ss", &format!("{from:.6}"), "-t", &format!("{len:.6}"), "-i"]).arg(src);
    c.args(["-af", &tempo(rate)]);
    pcm_out(&mut c, dst);
    c
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

pub fn video_frames(src: &Path, start: f64, fps: Fps, w: u32, h: u32) -> Command {
    let mut c = ffmpeg();
    c.args(["-ss", &format!("{start:.6}"), "-i"]).arg(src);
    c.args(["-map", "0:v:0", "-an", "-sn", "-dn"]);
    c.args(["-vf", &format!("fps={}/{},scale={w}:{h}:flags=bicubic,format=rgba", fps.num, fps.den)]);
    c.args(["-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"]);
    c
}

pub struct EncodeArgs<'a> {
    pub w: u32,
    pub h: u32,
    pub fps: Fps,
    pub audio: Option<&'a Path>,
    pub preset: &'a str,
    pub crf: u8,
    pub audio_bitrate: &'a str,
    pub out: &'a Path,
}

pub fn encode(e: &EncodeArgs) -> Command {
    let mut c = ffmpeg();
    c.args(["-y", "-f", "rawvideo", "-pix_fmt", "rgba"]);
    c.args(["-video_size", &format!("{}x{}", e.w, e.h)]);
    c.args(["-framerate", &format!("{}/{}", e.fps.num, e.fps.den)]);
    c.args(["-i", "pipe:0"]);
    if let Some(wav) = e.audio {
        c.arg("-i").arg(wav).args(["-map", "0:v:0", "-map", "1:a:0"]);
    }
    c.args(["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"]);
    c.args(["-c:v", "libx264", "-preset", e.preset, "-crf", &e.crf.to_string()]);
    let gop = (e.fps.as_f64() * 2.0).round().max(1.0) as u32;
    c.args(["-g", &gop.to_string()]);
    c.args(["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]);
    if e.audio.is_some() {
        c.args(["-c:a", "aac", "-b:a", e.audio_bitrate]);
    }
    c.args(["-movflags", "+faststart", "-f", "mp4"]).arg(e.out);
    c
}
