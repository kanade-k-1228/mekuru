pub mod cache;

use crate::ir::{ElemId, ElemKind, Script};
use crate::lang::diag::Diag;
use crate::media::pcm::{self, Pcm};
use crate::media::probe::{self, MediaProbe};
use crate::progress::{Progress, Stage};
use crate::schedule::{MediaDb, MediaInfo};
use crate::util::hash::sha256_hex;
use cache::Cache;
use rayon::prelude::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug)]
pub struct MediaAsset {
    pub probe: MediaProbe,
    pub pcm: Option<Pcm>,
}

#[derive(Clone, Debug, Default)]
pub struct Prepared {
    pub media: HashMap<ElemId, MediaAsset>,
    pub diags: Vec<Diag>,
}

impl MediaDb for Prepared {
    fn info(&self, e: &crate::ir::Elem) -> Option<MediaInfo> {
        self.media.get(&e.id).map(|m| MediaInfo {
            len: m.probe.duration,
            has_audio: m.probe.has_audio,
        })
    }
}

fn file_stamp(p: &Path) -> Option<(u64, i64)> {
    let m = std::fs::metadata(p).ok()?;
    let mtime = m.modified().ok()?.duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64);
    Some((m.len(), mtime))
}

pub fn prepare(script: &Script, cache: &Cache, progress: &dyn Fn(Progress)) -> Prepared {
    progress(Progress::Stage { stage: Stage::Prepare });
    let mut out = inspect(script);
    let sources: std::collections::HashSet<_> = script
        .elems
        .iter()
        .filter(|e| out.media.get(&e.id).is_some_and(|m| m.probe.has_audio))
        .filter_map(|e| e.kind.media().map(|m| m.path.clone()))
        .collect();
    let pcm: HashMap<_, _> = sources
        .par_iter()
        .map(|p| (p.clone(), prepare_pcm(p, cache).map_err(|e| format!("{e:#}"))))
        .collect();
    for e in &script.elems {
        let Some(src) = e.kind.media() else { continue };
        if let Some(result) = pcm.get(&src.path) {
            match result {
                Ok(pcm) => {
                    if let Some(m) = out.media.get_mut(&e.id) {
                        m.pcm = Some(pcm.clone());
                    }
                }
                Err(msg) => out.diags.push(Diag::new("E401", e.site, msg.clone())),
            }
        }
    }
    out
}

pub fn inspect(script: &Script) -> Prepared {
    let fps = script.settings.rate();
    let mut out = Prepared::default();
    let mut paths: Vec<PathBuf> = script.elems.iter().filter_map(|e| Some(e.kind.media()?.path.clone())).collect();
    paths.sort();
    paths.dedup();
    let results: HashMap<PathBuf, Result<MediaProbe, String>> = paths
        .par_iter()
        .map(|p| (p.clone(), probe::probe_cached(p).map_err(|e| format!("{e:#}"))))
        .collect();
    for e in &script.elems {
        let Some(m) = e.kind.media() else { continue };
        let path = &m.path;
        match &results[path] {
            Ok(probe) => {
                if matches!(e.kind, ElemKind::Video(_)) && probe.video.is_none() {
                    out.diags.push(Diag::new("E401", e.site, format!("{} has no video stream", path.display())));
                    continue;
                }
                if matches!(e.kind, ElemKind::Audio(_)) && !probe.has_audio {
                    out.diags.push(Diag::new("E401", e.site, format!("{} has no audio stream", path.display())));
                    continue;
                }
                let len = fps.of(probe.duration);
                if m.from as f64 >= len {
                    out.diags.push(Diag::new(
                        "E403",
                        e.site,
                        format!("`from` (frame {}) is past the end of {} ({len:.2} frames)", m.from, path.display()),
                    ));
                    continue;
                }
                if m.to.is_some_and(|t| t as f64 > len + 1.0) {
                    out.diags.push(Diag::new(
                        "W450",
                        e.site,
                        format!("`to` is past the end of {} ({len:.2} frames); clamped", path.display()),
                    ));
                }
                out.media.insert(e.id, MediaAsset { probe: *probe, pcm: None });
            }
            Err(msg) => {
                let code = if path.exists() { "E401" } else { "E400" };
                let msg = if path.exists() {
                    msg.clone()
                } else {
                    format!("file not found: {}", path.display())
                };
                out.diags.push(Diag::new(code, e.site, msg));
            }
        }
    }
    out
}

fn prepare_pcm(p: &Path, cache: &Cache) -> anyhow::Result<Pcm> {
    let (len, mtime) = file_stamp(p).ok_or_else(|| anyhow::anyhow!("file not found: {}", p.display()))?;
    let key = sha256_hex(format!("{}|{len}|{mtime}", p.display()).as_bytes());
    let dst = cache.pcm(&key);
    if dst.exists() { Pcm::open(&dst) } else { pcm::convert(p, &dst) }
}
