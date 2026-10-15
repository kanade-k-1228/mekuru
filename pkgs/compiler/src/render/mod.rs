pub mod shapes;
pub mod vector;
pub mod text;

use crate::ir::{ElemId, ElemKind, ImageSpec, VideoSpec, ViewOp, scaled};
use crate::media::Fps;
use crate::media::probe::VideoStream;
use crate::media::video::VideoReader;
use crate::pipeline::RenderCtx;
use crate::render::text::font::FontBook;
use crate::settings::Settings;
use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use tiny_skia::{Color, FilterQuality, Pixmap, PixmapPaint, Point, Transform};
use vector::{PaintedPath, rasterize};

pub struct Sprite {
    pub pixmap: Pixmap,
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Copy, Debug)]
pub struct RenderTarget {
    pub width: u32,
    pub height: u32,
    pub scale: f32,
    pub fps: Fps,
}

impl RenderTarget {
    pub fn new(s: &Settings, scale: f32, fps: Option<f64>) -> RenderTarget {
        let even = |v: f32| ((v.round() as u32).max(2) + 1) & !1;
        let width = even(s.width as f32 * scale);
        let height = even(s.height as f32 * scale);
        RenderTarget { width, height, scale: width as f32 / s.width as f32, fps: Fps::from_f64(fps.unwrap_or(s.fps)) }
    }
}

pub fn contain(natural: (f32, f32), [x, y, w, h]: [f32; 4]) -> [f32; 4] {
    let (nw, nh) = (natural.0.max(1.0), natural.1.max(1.0));
    let k = (w / nw).min(h / nh);
    let (fw, fh) = (nw * k, nh * k);
    [x + (w - fw) / 2.0, y + (h - fh) / 2.0, fw, fh]
}

pub(crate) fn video_bounds(v: &VideoSpec, natural: VideoStream) -> [f32; 4] {
    contain((natural.w as f32, natural.h as f32), [v.x, v.y, v.w, v.h])
}

fn image_sprite(img: &ImageSpec, s: f32) -> Result<Sprite> {
    let (nw, nh) = crate::media::image::dims(&img.path)?;
    let [x, y, w, h] = contain((nw as f32, nh as f32), [img.x, img.y, img.w, img.h]);
    let (pw, ph) = ((w * s).round().max(1.0) as u32, (h * s).round().max(1.0) as u32);
    let pm = crate::media::image::load(&img.path, pw, ph)?;
    Ok(Sprite { pixmap: pm, x: (x * s).round() as i32, y: (y * s).round() as i32 })
}

pub(crate) fn transform_paths(paths: Vec<PaintedPath>, t: Transform) -> Vec<PaintedPath> {
    if t.is_identity() {
        return paths;
    }
    paths.into_iter().filter_map(|p| Some(PaintedPath { path: p.path.transform(t)?, ..p })).collect()
}

fn transform_sprite(sp: Sprite, t: Transform) -> Option<Sprite> {
    if t.is_identity() {
        return Some(sp);
    }
    let place = t.pre_concat(Transform::from_translate(sp.x as f32, sp.y as f32));
    let (w, h) = (sp.pixmap.width() as f32, sp.pixmap.height() as f32);
    let mut corners = [Point::from_xy(0.0, 0.0), Point::from_xy(w, 0.0), Point::from_xy(0.0, h), Point::from_xy(w, h)];
    place.map_points(&mut corners);
    let x0 = corners.iter().map(|p| p.x).fold(f32::INFINITY, f32::min).floor();
    let y0 = corners.iter().map(|p| p.y).fold(f32::INFINITY, f32::min).floor();
    let x1 = corners.iter().map(|p| p.x).fold(f32::NEG_INFINITY, f32::max).ceil();
    let y1 = corners.iter().map(|p| p.y).fold(f32::NEG_INFINITY, f32::max).ceil();
    let mut pm = Pixmap::new((x1 - x0).max(1.0) as u32, (y1 - y0).max(1.0) as u32)?;
    let paint = PixmapPaint { quality: FilterQuality::Bicubic, ..Default::default() };
    pm.draw_pixmap(0, 0, sp.pixmap.as_ref(), &paint, Transform::from_translate(-x0, -y0).pre_concat(place), None);
    Some(Sprite { pixmap: pm, x: x0 as i32, y: y0 as i32 })
}

fn composite(parts: Vec<Sprite>) -> Option<Sprite> {
    if parts.len() <= 1 {
        return parts.into_iter().next();
    }
    let x0 = parts.iter().map(|p| p.x).min()?;
    let y0 = parts.iter().map(|p| p.y).min()?;
    let x1 = parts.iter().map(|p| p.x + p.pixmap.width() as i32).max()?;
    let y1 = parts.iter().map(|p| p.y + p.pixmap.height() as i32).max()?;
    let mut pm = Pixmap::new((x1 - x0).max(1) as u32, (y1 - y0).max(1) as u32)?;
    for p in &parts {
        pm.draw_pixmap(p.x - x0, p.y - y0, p.pixmap.as_ref(), &PixmapPaint::default(), Transform::identity(), None);
    }
    Some(Sprite { pixmap: pm, x: x0, y: y0 })
}

struct VideoSlot {
    reader: VideoReader,
    x: i32,
    y: i32,
}

type Key = Vec<(ElemId, u8, i64)>;

pub struct FrameRenderer<'a> {
    ctx: RenderCtx<'a>,
    fonts: Arc<FontBook>,
    pub target: RenderTarget,
    order: Vec<ElemId>,
    sprites: HashMap<ElemId, Option<Arc<Sprite>>>,
    sprite_bytes: usize,
    videos: HashMap<ElemId, VideoSlot>,
    canvas: Pixmap,
    last_key: Option<Key>,
    pub warnings: Vec<String>,
}

const SPRITE_BUDGET: usize = 512 << 20;

impl<'a> FrameRenderer<'a> {
    pub fn new(ctx: &RenderCtx<'a>, target: RenderTarget) -> Result<Self> {
        let ctx = *ctx;
        let script = &ctx.project.script;
        let mut order: Vec<ElemId> = script.elems.iter().filter(|e| e.kind.is_visual()).map(|e| e.id).collect();
        order.sort_by_key(|&id| (script.elems[id].z, script.elems[id].order));
        let canvas = Pixmap::new(target.width, target.height).ok_or_else(|| anyhow::anyhow!("invalid output size"))?;
        Ok(FrameRenderer {
            ctx,
            fonts: ctx.project.fonts(),
            target,
            order,
            sprites: HashMap::new(),
            sprite_bytes: 0,
            videos: HashMap::new(),
            canvas,
            last_key: None,
            warnings: vec![],
        })
    }

    pub fn canvas(&self) -> &Pixmap {
        &self.canvas
    }

    fn sprite(&mut self, id: ElemId) -> Option<Arc<Sprite>> {
        if let Some(s) = self.sprites.get(&id) {
            return s.clone();
        }
        let s = self.target.scale;
        let elem = &self.ctx.project.script.elems[id];
        let sprite = match &elem.kind {
            ElemKind::View(v) => {
                let ops = v.ops.clone();
                let parts = ops.iter().filter_map(|op| self.op_sprite(op, s, Transform::identity())).collect();
                composite(parts)
            }
            _ => None,
        };
        let arc = sprite.map(Arc::new);
        if let Some(sp) = &arc {
            self.sprite_bytes += sp.pixmap.data().len();
            if self.sprite_bytes > SPRITE_BUDGET {
                self.sprites.clear();
                self.sprite_bytes = sp.pixmap.data().len();
            }
        }
        self.sprites.insert(id, arc.clone());
        arc
    }

    fn op_sprite(&mut self, op: &ViewOp, s: f32, t: Transform) -> Option<Sprite> {
        let paths = match op {
            ViewOp::Transformed(m, inner) => return self.op_sprite(inner, s, t.pre_concat(scaled(*m, s))),
            ViewOp::Image(img) => {
                return match image_sprite(img, s) {
                    Ok(sp) => transform_sprite(sp, t),
                    Err(e) => {
                        self.warnings.push(format!("{e:#}"));
                        None
                    }
                };
            }
            ViewOp::Rect(r) => shapes::rect_paths(r, s),
            ViewOp::Circle(c) => shapes::circle_paths(c, s),
            ViewOp::Poly(l) => shapes::poly_paths(l, s),
            ViewOp::Text(text) => {
                let paths = text::draw::text_paths(&self.fonts, text, s);
                if paths.is_none() && !text.text.trim().is_empty() {
                    self.warnings.push("no usable font found; text is not drawn (install a Japanese font or set `font` on `<mekuru>`)".into());
                }
                paths?
            }
        };
        rasterize(&transform_paths(paths, t))
    }

    fn video_slot(&mut self, id: ElemId) -> Option<&mut VideoSlot> {
        if !self.videos.contains_key(&id) {
            let script = &self.ctx.project.script;
            let ElemKind::Video(v) = &script.elems[id].kind else { return None };
            let probe = self.ctx.prepared.media.get(&id)?.probe;
            let vs = probe.video?;
            let s = self.target.scale;
            let [x, y, w, h] = video_bounds(v, vs);
            let (pw, ph) = ((w * s).round().max(2.0) as u32, (h * s).round().max(2.0) as u32);
            let reader = VideoReader::new(&v.media.path, pw, ph, self.target.fps, probe.duration);
            self.videos.insert(id, VideoSlot { reader, x: (x * s).round() as i32, y: (y * s).round() as i32 });
        }
        self.videos.get_mut(&id)
    }

    pub fn render(&mut self, t: f64) -> Result<bool> {
        let fps = self.target.fps.as_f64();
        let RenderCtx { project, sched, .. } = self.ctx;
        let script = &project.script;
        let doc = script.settings.rate();
        let mut key: Key = vec![];
        for &id in &self.order {
            let et = &sched.elems[id];
            if !et.active(t) {
                continue;
            }
            let alpha = (script.elems[id].opacity as f64 * et.envelope(t)).clamp(0.0, 1.0);
            let a8 = (alpha * 255.0).round() as u8;
            if a8 == 0 {
                continue;
            }
            let frame = match &et.src {
                Some(src) if matches!(script.elems[id].kind, ElemKind::Video(_)) => (doc.secs(src.at(et.local(t).unwrap_or(t))) * fps).round() as i64,
                _ => -1,
            };
            key.push((id, a8, frame));
        }
        if self.last_key.as_ref() == Some(&key) {
            return Ok(false);
        }
        self.videos.retain(|id, _| key.iter().any(|k| k.0 == *id));
        self.canvas.fill(Color::BLACK);
        for &(id, a8, _) in &key {
            let opacity = a8 as f32 / 255.0;
            if matches!(script.elems[id].kind, ElemKind::Video(_)) {
                let et = &sched.elems[id];
                let pos = doc.secs(et.src.as_ref().map_or(0.0, |s| s.at(et.local(t).unwrap_or(t))));
                if self.video_slot(id).is_none() {
                    continue;
                }
                let slot = self.videos.get_mut(&id).unwrap();
                let (x, y) = (slot.x, slot.y);
                let frame = match slot.reader.frame_at(pos) {
                    Ok(f) => f,
                    Err(e) => {
                        let msg = format!("{e:#}");
                        if !self.warnings.contains(&msg) {
                            self.warnings.push(msg);
                        }
                        continue;
                    }
                };
                if a8 == 255 {
                    blit_opaque(&mut self.canvas, frame, x, y);
                } else {
                    let paint = PixmapPaint { opacity, ..Default::default() };
                    self.canvas.draw_pixmap(x, y, frame.as_ref(), &paint, Transform::identity(), None);
                }
                continue;
            }
            let Some(sp) = self.sprite(id) else { continue };
            let paint = PixmapPaint { opacity, ..Default::default() };
            self.canvas.draw_pixmap(sp.x, sp.y, sp.pixmap.as_ref(), &paint, Transform::identity(), None);
        }
        self.last_key = Some(key);
        Ok(true)
    }
}

fn blit_opaque(dst: &mut Pixmap, src: &Pixmap, x: i32, y: i32) {
    let (dw, dh) = (dst.width() as i32, dst.height() as i32);
    let (sw, sh) = (src.width() as i32, src.height() as i32);
    let x0 = x.max(0);
    let x1 = (x + sw).min(dw);
    if x1 <= x0 {
        return;
    }
    let sdata = src.data();
    let ddata = dst.data_mut();
    for row in y.max(0)..(y + sh).min(dh) {
        let sy = row - y;
        let s0 = ((sy * sw + (x0 - x)) * 4) as usize;
        let d0 = ((row * dw + x0) * 4) as usize;
        let n = ((x1 - x0) * 4) as usize;
        ddata[d0..d0 + n].copy_from_slice(&sdata[s0..s0 + n]);
    }
}
