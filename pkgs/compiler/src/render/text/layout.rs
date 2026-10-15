use super::font::FontBook;
use crate::{ir::TextSpec, settings::Align};
use cosmic_text::{Attrs, Buffer, Family, Metrics, Shaping, Weight, Wrap};
use cosmic_text::{fontdb, skrifa::{FontRef, MetadataProvider, Tag}};

pub(super) fn layout(fonts: &FontBook, spec: &TextSpec) -> Option<Buffer> {
    let st = &spec.style;
    if !st.size.is_finite() || st.size <= 0.0 || !st.line_height.is_finite() || st.line_height <= 0.0 {
        return None;
    }
    let mut system = fonts.system.lock().unwrap();
    let family = fonts.family(&mut system, st.font.as_deref())?;
    let requested = if st.bold { Weight::BOLD } else { Weight::NORMAL };
    let db = system.db();
    let id = db.query(&fontdb::Query { families: &[Family::Name(&family)], weight: requested, ..Default::default() })?;
    let face_weight = db.face(id)?.weight;
    let variable_weight = face_weight != requested && db.with_face_data(id, |data, index| {
        let face = FontRef::from_index(data, index).ok()?;
        let axis = face.axes().get_by_tag(Tag::new(b"wght"))?;
        Some((axis.min_value()..=axis.max_value()).contains(&(requested.0 as f32)))
    }) == Some(Some(true));
    let attrs = Attrs::new().family(Family::Name(&family)).weight(if variable_weight { requested } else { face_weight });
    let mut buffer = Buffer::new(&mut system, Metrics::new(st.size, st.size * st.line_height));
    buffer.set_wrap(Wrap::WordOrGlyph);
    buffer.set_size(spec.width.map(|w| w.max(0.0)), None);
    buffer.set_text(&spec.text, &attrs, Shaping::Advanced, Some(cosmic_text::Align::Left));
    buffer.shape_until_scroll(&mut system, false);

    let count = buffer.layout_runs().count();
    if let Some(width) = spec.width.filter(|w| *w > 0.0)
        && st.align == Align::Center && count > 1
    {
        let (mut lo, mut hi) = (width / count as f32, width);
        for _ in 0..14 {
            let mid = (lo + hi) / 2.0;
            buffer.set_size(Some(mid), None);
            buffer.shape_until_scroll(&mut system, false);
            if buffer.layout_runs().count() <= count { hi = mid; } else { lo = mid; }
        }
        buffer.set_size(Some(hi), None);
        buffer.shape_until_scroll(&mut system, false);
    }
    Some(buffer)
}
