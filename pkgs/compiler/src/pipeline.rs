use crate::Project;
use crate::audio::{Track, mix_wav};
use crate::encode::Encoder;
use crate::media::args::EncodeArgs;
use crate::media::pcm::{self, Pcm, RATE};
use crate::prepare::Prepared;
use crate::progress::{Progress, Stage};
use crate::render::{FrameRenderer, RenderTarget};
use crate::schedule::{AudioClip, EPS, Fade, Schedule};
use crate::util::hash::sha256_hex;
use crate::util::temp::TempFile;
use anyhow::Result;
use rayon::prelude::*;
use std::collections::HashMap;
use std::path::Path;
use std::time::Instant;

#[derive(Clone, Copy)]
pub struct RenderCtx<'a> {
    pub project: &'a Project,
    pub prepared: &'a Prepared,
    pub sched: &'a Schedule,
}

#[derive(Clone, Debug)]
pub struct RenderOptions {
    pub scale: f32,
    pub fps: Option<f64>,
    pub from: f64,
    pub to: Option<f64>,
    pub preset: Option<String>,
    pub crf: Option<u8>,
    pub audio: bool,
}

impl Default for RenderOptions {
    fn default() -> Self {
        RenderOptions {
            scale: 1.0,
            fps: None,
            from: 0.0,
            to: None,
            preset: None,
            crf: None,
            audio: true,
        }
    }
}

impl RenderOptions {
    pub fn preview() -> Self {
        RenderOptions {
            scale: 0.5,
            fps: Some(15.0),
            preset: Some("ultrafast".into()),
            crf: Some(30),
            ..Default::default()
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct RenderStats {
    pub frames: u64,
    pub drawn: u64,
    pub seconds: f64,
    pub elapsed: f64,
    pub warnings: Vec<String>,
    pub width: u32,
    pub height: u32,
}

pub fn audio_tracks(ctx: &RenderCtx) -> Result<Vec<Track>> {
    let pcm = |c: &AudioClip| ctx.prepared.media.get(&c.elem).and_then(|m| m.pcm.as_ref());
    let cache = ctx.project.cache();
    let fps = ctx.project.script.settings.rate();
    let secs = |c: &AudioClip| AudioClip {
        at: fps.secs(c.at),
        len: fps.secs(c.len),
        src: fps.secs(c.src),
        env: c
            .env
            .iter()
            .map(|f| Fade {
                start: fps.secs(f.start),
                end: fps.secs(f.end),
                fade_in: fps.secs(f.fade_in),
                fade_out: fps.secs(f.fade_out),
                ..*f
            })
            .collect(),
        ..c.clone()
    };
    let clips: Vec<AudioClip> = ctx.sched.audio.iter().map(secs).collect();
    let key = |c: &AudioClip, base: &Pcm| sha256_hex(format!("{}|{}|{}|{}", base.path.display(), c.src, c.len, c.rate).as_bytes());
    let mut todo: HashMap<String, (&AudioClip, &Pcm)> = HashMap::new();
    for c in clips.iter().filter(|c| (c.rate - 1.0).abs() > EPS) {
        if let Some(base) = pcm(c) {
            todo.entry(key(c, base)).or_insert((c, base));
        }
    }
    let made: HashMap<String, Pcm> = todo
        .into_par_iter()
        .map(|(k, (c, base))| {
            let dst = cache.pcm(&k);
            let p = if dst.exists() {
                Pcm::open(&dst)?
            } else {
                pcm::stretch(base, c.src, c.len * c.rate, c.rate, &dst)?
            };
            Ok((k, p))
        })
        .collect::<Result<_>>()?;
    let mut out = vec![];
    for c in &clips {
        let Some(base) = pcm(c) else { continue };
        let (pcm, src) = match made.get(&key(c, base)) {
            Some(p) if (c.rate - 1.0).abs() > EPS => (p.clone(), 0.0),
            _ => (base.clone(), c.src),
        };
        out.push(Track {
            pcm,
            at: c.at,
            len: c.len,
            src,
            gain: c.gain,
            env: c.env.clone(),
        });
    }
    Ok(out)
}

pub fn render_video(ctx: &RenderCtx, out: &Path, opts: &RenderOptions, progress: &dyn Fn(Progress)) -> Result<RenderStats> {
    let started = Instant::now();
    let st = &ctx.project.script.settings;
    let target = RenderTarget::new(st, opts.scale, opts.fps);
    let doc = st.rate();
    let total = doc.secs(ctx.sched.total as f64);
    let from = opts.from.clamp(0.0, total);
    let to = opts.to.unwrap_or(total).clamp(from, total);
    let frames = target.fps.frames(to - from).max(1);
    let seconds = target.fps.time(frames);
    let step = (doc.num as f64 * target.fps.den as f64) / (doc.den as f64 * target.fps.num as f64);
    let first = doc.of(from);

    let mut stats = RenderStats {
        frames,
        seconds,
        width: target.width,
        height: target.height,
        ..Default::default()
    };
    let tmp = ctx.project.cache().tmp();
    std::fs::create_dir_all(&tmp)?;
    let wav: Option<TempFile> = if opts.audio {
        progress(Progress::Stage { stage: Stage::Mix });
        let path = TempFile(tmp.join(format!("mix-{}.wav", std::process::id())));
        let samples = (seconds * RATE as f64).round() as u64;
        let mix = mix_wav(&audio_tracks(ctx)?, from, samples, path.as_ref())?;
        if mix.clipped > 0 {
            stats
                .warnings
                .push(format!("audio clipped in {} samples (peak {:.2}); lower some volumes", mix.clipped, mix.peak));
        }
        Some(path)
    } else {
        None
    };

    progress(Progress::Stage { stage: Stage::Render });
    let preset = opts.preset.clone().unwrap_or_else(|| st.encode.preset.clone());
    let args = EncodeArgs {
        w: target.width,
        h: target.height,
        fps: target.fps,
        audio: wav.as_ref().map(AsRef::as_ref),
        preset: &preset,
        crf: opts.crf.unwrap_or(st.encode.crf),
        audio_bitrate: &st.encode.audio_bitrate,
        out,
    };
    let mut enc = Encoder::spawn(&args)?;
    let mut renderer = FrameRenderer::new(ctx, target)?;
    let mut last_report = Instant::now();
    for k in 0..frames {
        let t = first + k as f64 * step;
        if renderer.render(t)? {
            stats.drawn += 1;
            enc.push(renderer.canvas().data())?;
        } else {
            enc.repeat()?;
        }
        if last_report.elapsed().as_millis() >= 100 || k + 1 == frames {
            last_report = Instant::now();
            progress(Progress::Frames {
                done: k + 1,
                total: frames,
                elapsed: started.elapsed().as_secs_f64(),
            });
        }
    }
    stats.warnings.append(&mut renderer.warnings);
    progress(Progress::Stage { stage: Stage::Finalize });
    enc.finish()?;
    stats.elapsed = started.elapsed().as_secs_f64();
    Ok(stats)
}
