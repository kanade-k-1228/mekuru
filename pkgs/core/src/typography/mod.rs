pub mod font;
pub(crate) mod layout;
use crate::{
    ir::TextSpec,
    lang::ast::Tag,
    settings::{Settings, resolve_font},
};
use font::FontBook;
use layout::layout;
use std::{path::Path, sync::Arc};
pub fn measure_text(fonts: &FontBook, spec: &TextSpec) -> Option<(f32, f32)> {
    // Coordinates do not affect measurement; style, wrapping width and text do.
    let key = format!("{:?}|{:?}|{:?}", spec.text, spec.width, spec.style);
    if let Some(size) = fonts.measurements.lock().unwrap().get(&key) {
        return *size;
    }
    let size = measure_uncached(fonts, spec);
    let bytes = key.len() + 64;
    fonts.measurements.lock().unwrap().insert(key, size, bytes);
    size
}
fn measure_uncached(fonts: &FontBook, spec: &TextSpec) -> Option<(f32, f32)> {
    let buffer = layout(fonts, spec)?;
    Some(
        buffer
            .layout_runs()
            .fold((0.0_f32, 0.0_f32), |(w, h), run| (w.max(run.line_w), h.max(run.line_top + run.line_height))),
    )
}

pub(crate) fn font_book(st: &Settings, base: &Path, root: &Tag) -> Arc<FontBook> {
    let fonts: Vec<String> = st.fonts.iter().map(|f| resolve_font(f, base)).collect();
    let requested = root.descendants().into_iter().filter(|t| t.name == "text").filter_map(|t| t.attribute("font"));
    // Preload the entire input's file fonts. Lazy loading a new font halfway
    // through layout could change fallback selection behind cached measurements.
    let mut extra: Vec<_> = fonts
        .iter()
        .cloned()
        .chain(requested.map(|f| resolve_font(f, base)))
        .map(std::path::PathBuf::from)
        .filter(|p| p.is_absolute())
        .collect();
    extra.sort();
    extra.dedup();
    FontBook::shared(&fonts, &extra)
}
