use super::vector::PaintedPath;
use crate::ir::{CircleSpec, Dash, PolySpec, RectSpec};
use crate::settings::Rgba;
use tiny_skia::{LineCap, LineJoin, Paint, Path, PathBuilder, Rect, Stroke};

pub fn paint(c: Rgba) -> Paint<'static> {
    let mut p = Paint::default();
    p.set_color_rgba8(c[0], c[1], c[2], c[3]);
    p.anti_alias = true;
    p
}

pub fn rounded_rect(x: f32, y: f32, w: f32, h: f32, r: f32) -> Option<Path> {
    let r = r.min(w / 2.0).min(h / 2.0).max(0.0);
    if r <= 0.01 {
        return Some(PathBuilder::from_rect(Rect::from_xywh(x, y, w, h)?));
    }
    let k = 0.552_284_8 * r;
    let mut b = PathBuilder::new();
    b.move_to(x + r, y);
    b.line_to(x + w - r, y);
    b.cubic_to(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
    b.line_to(x + w, y + h - r);
    b.cubic_to(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
    b.line_to(x + r, y + h);
    b.cubic_to(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
    b.line_to(x, y + r);
    b.cubic_to(x, y + r - k, x + r - k, y, x + r, y);
    b.close();
    b.finish()
}

pub fn rect_paths(r: &RectSpec, s: f32) -> Vec<PaintedPath> {
    let Some(path) = rounded_rect(r.x * s, r.y * s, (r.w * s).max(0.01), (r.h * s).max(0.01), r.radius * s) else {
        return vec![];
    };
    let mut out = vec![];
    if let Some(c) = r.fill {
        out.push(PaintedPath::fill(path.clone(), c));
    }
    if let Some(c) = r.stroke.filter(|_| r.stroke_width > 0.0) {
        out.push(PaintedPath::stroke(
            path,
            c,
            Stroke {
                width: r.stroke_width * s,
                line_join: LineJoin::Round,
                ..Default::default()
            },
        ));
    }
    out
}

pub fn circle_paths(c: &CircleSpec, s: f32) -> Vec<PaintedPath> {
    let mut b = PathBuilder::new();
    let Some(rect) = Rect::from_xywh((c.x - c.rx) * s, (c.y - c.ry) * s, (2.0 * c.rx * s).max(0.01), (2.0 * c.ry * s).max(0.01)) else {
        return vec![];
    };
    b.push_oval(rect);
    let Some(path) = b.finish() else { return vec![] };
    let mut out = vec![];
    if let Some(color) = c.fill {
        out.push(PaintedPath::fill(path.clone(), color));
    }
    if let Some(color) = c.stroke.filter(|_| c.stroke_width > 0.0) {
        out.push(PaintedPath::stroke(
            path,
            color,
            Stroke {
                width: c.stroke_width * s,
                ..Default::default()
            },
        ));
    }
    out
}

pub fn poly_paths(l: &PolySpec, s: f32) -> Vec<PaintedPath> {
    let mut out = vec![];
    let mut pts: Vec<(f32, f32)> = vec![];
    for &(x, y) in &l.pts {
        let q = (x * s, y * s);
        if pts.last().is_none_or(|p| (q.0 - p.0).hypot(q.1 - p.1) >= 0.01) {
            pts.push(q);
        }
    }
    let n = pts.len();
    if n < 2 {
        return out;
    }
    let w = if l.stroke.is_some() { l.stroke_width * s } else { 0.0 };
    let head_len = (w * 4.0).max(10.0 * s);
    let head_w = (w * 3.0).max(8.0 * s);
    let (head_start, head_end) = if l.closed || w <= 0.0 { (false, false) } else { (l.head_start, l.head_end) };
    let path = |pts: &[(f32, f32)], close: bool| {
        let mut b = PathBuilder::new();
        b.move_to(pts[0].0, pts[0].1);
        for p in &pts[1..] {
            b.line_to(p.0, p.1);
        }
        if close {
            b.close();
        }
        b.finish()
    };
    if let Some(f) = l.fill
        && n >= 3
        && let Some(area) = path(&pts, true)
    {
        out.push(PaintedPath::fill(area, f));
    }
    let Some(c) = l.stroke.filter(|_| w > 0.0) else {
        return out;
    };
    let unit = |a: (f32, f32), b: (f32, f32)| {
        let len = (b.0 - a.0).hypot(b.1 - a.1);
        ((b.0 - a.0) / len, (b.1 - a.1) / len)
    };
    let (us, ue) = (unit(pts[1], pts[0]), unit(pts[n - 2], pts[n - 1]));
    let mut shaft = pts.clone();
    if head_start {
        shaft[0].0 -= us.0 * head_len * 0.8;
        shaft[0].1 -= us.1 * head_len * 0.8;
    }
    if head_end {
        shaft[n - 1].0 -= ue.0 * head_len * 0.8;
        shaft[n - 1].1 -= ue.1 * head_len * 0.8;
    }
    let mut st = Stroke {
        width: w,
        line_cap: LineCap::Round,
        line_join: LineJoin::Round,
        ..Default::default()
    };
    let dash = match l.dash {
        Dash::Solid => vec![],
        Dash::Dashed => {
            st.line_cap = LineCap::Butt;
            vec![w * 3.0, w * 2.0]
        }
        Dash::Dotted => vec![0.01, w * 2.0],
    };
    if let Some(shaft) = path(&shaft, l.closed) {
        out.push(PaintedPath::stroke(shaft, c, st).dashed(dash));
    }
    let mut head = |(tx, ty): (f32, f32), (dx, dy): (f32, f32)| {
        let (bx, by) = (tx - dx * head_len, ty - dy * head_len);
        let (nx, ny) = (-dy * head_w / 2.0, dx * head_w / 2.0);
        let mut b = PathBuilder::new();
        b.move_to(tx, ty);
        b.line_to(bx + nx, by + ny);
        b.line_to(bx - nx, by - ny);
        b.close();
        if let Some(path) = b.finish() {
            out.push(PaintedPath::fill(path, c));
        }
    };
    if head_end {
        head(pts[n - 1], ue);
    }
    if head_start {
        head(pts[0], us);
    }
    out
}
