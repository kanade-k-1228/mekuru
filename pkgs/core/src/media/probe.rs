use crate::util::{FileMemo, proc::run_checked};
use anyhow::{Context, Result, bail};
use serde_json::Value;
use std::path::Path;
use std::process::Command;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VideoStream {
    pub w: u32,
    pub h: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MediaProbe {
    pub duration: f64,
    pub video: Option<VideoStream>,
    pub has_audio: bool,
}

pub fn probe_cached(src: &Path) -> Result<MediaProbe> {
    static MEMO: FileMemo<MediaProbe> = FileMemo::new();
    if !src.exists() {
        bail!("file not found: {}", src.display());
    }
    MEMO.get(src, || probe(src))
}

fn probe(src: &Path) -> Result<MediaProbe> {
    let mut c = Command::new(std::env::var("MEKURU_FFPROBE").unwrap_or_else(|_| "ffprobe".into()));
    c.args(["-v", "error", "-print_format", "json", "-show_format", "-show_streams"]).arg(src);
    let out = run_checked(c)?;
    let v: Value = serde_json::from_slice(&out.stdout).context("ffprobe returned invalid JSON")?;
    parse(&v).with_context(|| format!("cannot read media info of {}", src.display()))
}

fn num(v: &Value) -> Option<f64> {
    match v {
        Value::String(s) => s.parse().ok(),
        Value::Number(n) => n.as_f64(),
        _ => None,
    }
}

fn parse(v: &Value) -> Result<MediaProbe> {
    let streams = v["streams"].as_array().cloned().unwrap_or_default();
    let mut video = None;
    let mut has_audio = false;
    let mut duration = num(&v["format"]["duration"]);
    for st in &streams {
        match st["codec_type"].as_str() {
            Some("video") if video.is_none() && st["disposition"]["attached_pic"].as_i64() != Some(1) => {
                let mut w = st["width"].as_u64().unwrap_or(0) as u32;
                let mut h = st["height"].as_u64().unwrap_or(0) as u32;
                let rot = st["tags"]["rotate"]
                    .as_str()
                    .and_then(|r| r.parse::<i64>().ok())
                    .or_else(|| st["side_data_list"].as_array().and_then(|l| l.iter().find_map(|s| s["rotation"].as_i64())))
                    .unwrap_or(0);
                if rot.rem_euclid(180) == 90 {
                    std::mem::swap(&mut w, &mut h);
                }
                video = Some(VideoStream { w, h });
                duration = duration.or_else(|| num(&st["duration"]));
            }
            Some("audio") => {
                has_audio = true;
                duration = duration.or_else(|| num(&st["duration"]));
            }
            _ => {}
        }
    }
    let duration = duration.context("unknown duration")?;
    Ok(MediaProbe { duration, video, has_audio })
}
