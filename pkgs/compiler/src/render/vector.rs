use super::{Sprite, shapes::paint};
use crate::settings::Rgba;
use tiny_skia::{FillRule, Path, Pixmap, Stroke, Transform};

pub struct PaintedPath {
    pub path: Path,
    pub color: Rgba,
    pub stroke: Option<Stroke>,
    pub dash: Vec<f32>,
}

impl PaintedPath {
    pub fn fill(path: Path, color: Rgba) -> Self { Self { path, color, stroke: None, dash: vec![] } }
    pub fn stroke(path: Path, color: Rgba, stroke: Stroke) -> Self { Self { path, color, stroke: Some(stroke), dash: vec![] } }
    pub fn dashed(mut self, dash: Vec<f32>) -> Self {
        if let Some(stroke) = &mut self.stroke { stroke.dash = tiny_skia::StrokeDash::new(dash.clone(), 0.0); }
        self.dash = dash;
        self
    }
}

pub fn rasterize(paths: &[PaintedPath]) -> Option<Sprite> {
    let mut bounds: Option<(f32, f32, f32, f32)> = None;
    for p in paths {
        let b = p.path.bounds();
        let pad = p.stroke.as_ref().map_or(0.0, |s| s.width);
        let (l, t, r, b) = (b.left() - pad, b.top() - pad, b.right() + pad, b.bottom() + pad);
        bounds = Some(bounds.map_or((l, t, r, b), |a| (a.0.min(l), a.1.min(t), a.2.max(r), a.3.max(b))));
    }
    let (l, t, r, b) = bounds?;
    let (x, y) = ((l - 2.0).floor() as i32, (t - 2.0).floor() as i32);
    let mut pixmap = Pixmap::new(((r + 2.0).ceil() - x as f32).max(1.0) as u32, ((b + 2.0).ceil() - y as f32).max(1.0) as u32)?;
    let transform = Transform::from_translate(-x as f32, -y as f32);
    for p in paths {
        if let Some(stroke) = &p.stroke {
            pixmap.stroke_path(&p.path, &paint(p.color), stroke, transform, None);
        } else {
            pixmap.fill_path(&p.path, &paint(p.color), FillRule::Winding, transform, None);
        }
    }
    Some(Sprite { pixmap, x, y })
}
