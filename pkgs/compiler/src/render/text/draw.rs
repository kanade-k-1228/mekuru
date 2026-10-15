use super::{font::FontBook, layout::layout};
use crate::ir::TextSpec;
use crate::render::vector::PaintedPath;
use crate::settings::Align;
use tiny_skia::{LineCap, LineJoin, Stroke, Transform};

pub fn measure_text(fonts: &FontBook, spec: &TextSpec) -> Option<(f32, f32)> {
    let buffer = layout(fonts, spec)?;
    Some(buffer.layout_runs().fold((0.0_f32, 0.0_f32), |(w, h), run| {
        (w.max(run.line_w), h.max(run.line_top + run.line_height))
    }))
}

pub fn text_paths(fonts: &FontBook, spec: &TextSpec, scale: f32) -> Option<Vec<PaintedPath>> {
    let buffer = layout(fonts, spec)?;
    let st = &spec.style;
    let width = buffer.layout_runs().map(|run| run.line_w).fold(spec.width.unwrap_or(0.0), f32::max);
    let mut placed = vec![];
    for run in buffer.layout_runs() {
        let offset = match st.align { Align::Left => 0.0, Align::Center => (width - run.line_w) / 2.0, Align::Right => width - run.line_w };
        for glyph in run.glyphs {
            if let Some(path) = fonts.glyph_path(glyph) {
                let x = spec.x + offset + glyph.x + glyph.font_size * glyph.x_offset;
                let y = spec.y + run.line_y + glyph.y - glyph.font_size * glyph.y_offset;
                let k = glyph.font_size * scale;
                if let Some(path) = path.as_ref().clone().transform(Transform::from_row(k, 0.0, 0.0, -k, x * scale, y * scale)) {
                    placed.push(path);
                }
            }
        }
    }
    if placed.is_empty() { return None; }
    let mut out = vec![];
    if let Some(stroke) = st.stroke.filter(|_| st.stroke_width > 0.0) {
        for path in &placed {
            out.push(PaintedPath::stroke(path.clone(), stroke, Stroke { width: 2.0 * st.stroke_width * scale, line_join: LineJoin::Round, line_cap: LineCap::Round, ..Default::default() }));
        }
    }
    out.extend(placed.into_iter().map(|path| PaintedPath::fill(path, st.color)));
    Some(out)
}
