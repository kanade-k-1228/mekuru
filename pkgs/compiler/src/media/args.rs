use super::Fps;
use crate::util::proc::{ffmpeg, ffprobe};
use std::path::Path;

fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

fn common() -> Vec<String> {
    vec![ffmpeg(), "-hide_banner".into(), "-nostdin".into(), "-loglevel".into(), "error".into()]
}

pub fn probe(src: &Path) -> Vec<String> {
    vec![ffprobe(), "-v".into(), "error".into(), "-print_format".into(), "json".into(), "-show_format".into(), "-show_streams".into(), s(src)]
}

pub fn to_pcm(src: &Path, dst: &Path) -> Vec<String> {
    let mut a = common();
    a.extend(
        ["-y", "-i"].map(String::from).into_iter().chain([s(src)]).chain(
            ["-map", "0:a:0", "-vn", "-sn", "-dn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", "-f", "s16le"].map(String::from),
        ),
    );
    a.push(s(dst));
    a
}

pub fn stretch_pcm(src: &Path, from: f64, len: f64, rate: f64, dst: &Path) -> Vec<String> {
    let mut a = common();
    a.extend(["-y", "-f", "s16le", "-ar", "48000", "-ac", "2"].map(String::from));
    a.extend(["-ss".to_string(), format!("{from:.6}"), "-t".into(), format!("{len:.6}"), "-i".into(), s(src)]);
    a.extend(["-af".to_string(), tempo(rate)]);
    a.extend(["-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", "-f", "s16le"].map(String::from));
    a.push(s(dst));
    a
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

pub fn video_frames(src: &Path, start: f64, fps: Fps, w: u32, h: u32) -> Vec<String> {
    let mut a = common();
    a.extend(["-ss".to_string(), format!("{start:.6}"), "-i".into(), s(src)]);
    a.extend(["-map", "0:v:0", "-an", "-sn", "-dn"].map(String::from));
    a.push("-vf".into());
    a.push(format!("fps={}/{},scale={w}:{h}:flags=bicubic,format=rgba", fps.num, fps.den));
    a.extend(["-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"].map(String::from));
    a
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

pub fn encode(e: &EncodeArgs) -> Vec<String> {
    let mut a = common();
    a.push("-y".into());
    a.extend(["-f", "rawvideo", "-pix_fmt", "rgba"].map(String::from));
    a.extend(["-video_size".to_string(), format!("{}x{}", e.w, e.h)]);
    a.extend(["-framerate".to_string(), format!("{}/{}", e.fps.num, e.fps.den)]);
    a.extend(["-i".to_string(), "pipe:0".into()]);
    if let Some(wav) = e.audio {
        a.extend(["-i".to_string(), s(wav), "-map".into(), "0:v:0".into(), "-map".into(), "1:a:0".into()]);
    }
    a.extend(["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"].map(String::from));
    a.extend(["-c:v".to_string(), "libx264".into(), "-preset".into(), e.preset.into(), "-crf".into(), e.crf.to_string()]);
    let gop = (e.fps.as_f64() * 2.0).round().max(1.0) as u32;
    a.extend(["-g".to_string(), gop.to_string()]);
    a.extend(["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"].map(String::from));
    if e.audio.is_some() {
        a.extend(["-c:a".to_string(), "aac".into(), "-b:a".into(), e.audio_bitrate.into()]);
    }
    a.extend(["-movflags", "+faststart", "-f", "mp4"].map(String::from));
    a.push(s(e.out));
    a
}
