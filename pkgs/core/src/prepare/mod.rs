use crate::ir::{ElemId, ElemKind, Script};
use crate::lang::diag::Diag;
use crate::media::pcm::{self, Pcm};
use crate::media::probe::{self, MediaProbe};
use crate::util::{file_stamp, sha256_hex};
use rayon::prelude::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug)]
pub struct Cache {
    pub root: PathBuf,
}

impl Cache {
    fn sharded(&self, kind: &str, key: &str, ext: &str) -> PathBuf {
        self.root.join("cache").join(kind).join(&key[..2.min(key.len())]).join(format!("{key}.{ext}"))
    }

    pub fn pcm(&self, key: &str) -> PathBuf {
        self.sharded("pcm", key, "s16")
    }

    pub fn tmp(&self) -> PathBuf {
        self.root.join("tmp")
    }
}

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

pub fn prepare(script: &Script, cache: &Cache) -> Prepared {
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
    let stamp = file_stamp(p);
    if stamp.1.is_none() {
        anyhow::bail!("file not found: {}", p.display());
    }
    let key = sha256_hex(format!("{stamp:?}").as_bytes());
    pcm::convert(p, &cache.pcm(&key))
}
