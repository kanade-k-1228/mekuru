pub mod font;
pub(crate) mod layout;
use crate::{
    ir::TextSpec,
    settings::{Settings, resolve_font},
};
use font::FontBook;
use layout::layout;
use std::{path::Path, sync::Arc};
pub fn measure_text(fonts: &FontBook, spec: &TextSpec) -> Option<(f32, f32)> {
    let buffer = layout(fonts, spec)?;
    Some(
        buffer
            .layout_runs()
            .fold((0.0_f32, 0.0_f32), |(w, h), run| (w.max(run.line_w), h.max(run.line_top + run.line_height))),
    )
}

pub(crate) fn font_book(st: &Settings, base: &Path) -> Arc<FontBook> {
    let fonts: Vec<String> = st.fonts.iter().map(|f| resolve_font(f, base)).collect();
    let extra: Vec<std::path::PathBuf> = fonts.iter().map(std::path::PathBuf::from).filter(|p| p.is_file()).collect();
    FontBook::shared(&fonts, &extra)
}
