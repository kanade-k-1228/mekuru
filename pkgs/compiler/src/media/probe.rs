use super::args;
use crate::util::proc::run_checked;
use anyhow::{Context, Result};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

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
    type Memo = Mutex<HashMap<(PathBuf, u64, Option<SystemTime>), MediaProbe>>;
    static MEMO: OnceLock<Memo> = OnceLock::new();
    let meta = std::fs::metadata(src).with_context(|| format!("file not found: {}", src.display()))?;
    let key = (src.to_path_buf(), meta.len(), meta.modified().ok());
    let memo = MEMO.get_or_init(Default::default);
    if let Some(p) = memo.lock().unwrap_or_else(|e| e.into_inner()).get(&key) {
        return Ok(*p);
    }
    let p = probe(src)?;
    memo.lock().unwrap_or_else(|e| e.into_inner()).insert(key, p);
    Ok(p)
}

pub fn probe(src: &Path) -> Result<MediaProbe> {
    let out = run_checked(&args::probe(src))?;
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

pub fn parse(v: &Value) -> Result<MediaProbe> {
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
