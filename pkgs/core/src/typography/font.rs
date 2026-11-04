use crate::settings::parse_lang;
use crate::util::{FileStamp, file_stamp, lru::Lru};
use cosmic_text::skrifa::{
    FontRef, GlyphId, MetadataProvider,
    instance::Size,
    outline::{DrawSettings, OutlinePen},
};
use cosmic_text::{FontSystem, LayoutGlyph, fontdb};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tiny_skia::{Path as SkPath, PathBuilder};

/// Characters missing from the chosen family fall back to a font for their
/// script; `FontBook::lang` picks the Chinese, Japanese or Korean glyph forms.
const DEFAULT_FAMILIES: &[&str] = &["Noto Sans", "DejaVu Sans", "Liberation Sans", "Arial", "Helvetica"];

type GlyphKey = (fontdb::ID, fontdb::Weight, u16);
type GlyphPath = Option<Arc<SkPath>>;

pub struct FontBook {
    pub(super) system: Mutex<FontSystem>,
    glyphs: Mutex<Lru<GlyphKey, GlyphPath>>,
    pub(crate) measurements: Mutex<Lru<String, Option<(f32, f32)>>>,
    files: Mutex<HashMap<PathBuf, FileStamp>>,
    pub(crate) generation: u64,
    /// BCP 47 tag for the preview's `lang`.
    pub(crate) lang: String,
    defaults: Vec<String>,
}

impl FontBook {
    fn new(lang: &str, defaults: &[String], extra: &[PathBuf]) -> Self {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        for path in extra {
            if path.is_dir() {
                db.load_fonts_dir(path);
            } else {
                let _ = db.load_font_file(path);
            }
        }
        static GENERATION: AtomicU64 = AtomicU64::new(0);
        Self {
            generation: GENERATION.fetch_add(1, Ordering::Relaxed),
            measurements: Mutex::new(Lru::new(4 * 1024 * 1024)),
            files: Mutex::new(extra.iter().map(|p| (p.clone(), file_stamp(p))).collect()),
            system: Mutex::new(FontSystem::new_with_locale_and_db(fallback_locale(lang), db)),
            glyphs: Mutex::new(Lru::new(16 * 1024 * 1024)),
            lang: lang.to_owned(),
            defaults: defaults.to_vec(),
        }
    }

    pub fn shared(lang: &str, defaults: &[String], extra: &[PathBuf]) -> Arc<Self> {
        type Key = (String, Vec<String>, Vec<PathBuf>);
        static CACHE: std::sync::LazyLock<Mutex<Lru<Key, Arc<FontBook>>>> = std::sync::LazyLock::new(|| Mutex::new(Lru::new(4)));
        let key = (lang.to_owned(), defaults.to_vec(), extra.to_vec());
        let mut cache = CACHE.lock().unwrap();
        if let Some(book) = cache.get(&key)
            && book.files.lock().unwrap().iter().all(|(p, stamp)| file_stamp(p) == *stamp)
        {
            return book.clone();
        }
        let book = Arc::new(Self::new(lang, defaults, extra));
        cache.insert(key, book.clone(), 1);
        book
    }

    /// Resolve the same requested/default font as layout, preserving its file source.
    pub(crate) fn preview_font(&self, requested: Option<&str>) -> (String, Option<PathBuf>) {
        let mut system = self.system.lock().unwrap();
        let selected = self.family(&mut system, requested).unwrap_or_else(|| "sans-serif".into());
        let path = Path::new(&selected).is_file().then(|| PathBuf::from(&selected));
        let family = path
            .as_ref()
            .and_then(|path| {
                // File fonts are preloaded with their original family names before
                // layout registers a path alias. Send the real family for CSS fallback.
                system
                    .db()
                    .faces()
                    .filter(|face| match &face.source {
                        fontdb::Source::File(p) | fontdb::Source::SharedFile(p, _) => p == path,
                        _ => false,
                    })
                    .flat_map(|face| &face.families)
                    .find(|(name, _)| name != &selected)
                    .map(|(name, _)| name.clone())
            })
            .unwrap_or_else(|| if path.is_some() { "sans-serif".into() } else { selected });
        (family, path)
    }

    pub(super) fn family(&self, system: &mut FontSystem, requested: Option<&str>) -> Option<String> {
        if let Some(name) = requested {
            let path = Path::new(name);
            if path.is_absolute() {
                self.files.lock().unwrap().entry(path.to_path_buf()).or_insert_with(|| file_stamp(path));
            }
        }
        for name in requested
            .into_iter()
            .chain(self.defaults.iter().map(String::as_str))
            .chain(DEFAULT_FAMILIES.iter().copied())
        {
            if let Some(family) = resolve_family(system, name) {
                return Some(family);
            }
        }
        system.db().faces().find_map(|f| f.families.first().map(|(name, _)| name.clone()))
    }

    pub(crate) fn glyph_path(&self, glyph: &LayoutGlyph) -> GlyphPath {
        let key = (glyph.font_id, glyph.font_weight, glyph.glyph_id);
        if let Some(path) = self.glyphs.lock().unwrap().get(&key) {
            return path.clone();
        }
        let path = (|| {
            let mut system = self.system.lock().unwrap();
            let index = system.db().face(glyph.font_id)?.index;
            let font = system.get_font(glyph.font_id, glyph.font_weight)?;
            let face = FontRef::from_index(font.data(), index).ok()?;
            let location = face.axes().location([("wght", glyph.font_weight.0 as f32)]);
            let outlines = face.outline_glyphs();
            let outline = outlines.get(GlyphId::new(glyph.glyph_id as u32))?;
            let mut pen = Builder(PathBuilder::new());
            outline.draw(DrawSettings::unhinted(Size::new(1.0), &location), &mut pen).ok()?;
            pen.0.finish().map(Arc::new)
        })();
        let bytes = path.as_ref().map_or(64, |p| 64 + p.points().len() * 16);
        self.glyphs.lock().unwrap().insert(key, path.clone(), bytes);
        path
    }
}

/// The OS locale as a BCP 47 tag; `en` when unset or `C`/`POSIX`.
pub(crate) fn system_lang() -> String {
    sys_locale::get_locale().filter(|l| parse_lang(l)).unwrap_or_else(|| "en".into())
}

/// cosmic-text keys Han fallback on exactly `ja`, `ko`, `zh-HK` and `zh-TW`
/// (anything else gets Simplified Chinese), so reduce the tag to those keys.
fn fallback_locale(lang: &str) -> String {
    let lower = lang.to_ascii_lowercase();
    let (primary, rest) = lower.split_once('-').unwrap_or((&lower, ""));
    let has = |codes: &[&str]| rest.split('-').any(|p| codes.contains(&p));
    match primary {
        "ja" | "ko" => primary.to_owned(),
        "zh" if has(&["hk", "mo"]) => "zh-HK".into(),
        "zh" if has(&["tw", "hant"]) => "zh-TW".into(),
        _ => lang.to_owned(),
    }
}

fn resolve_family(system: &mut FontSystem, name: &str) -> Option<String> {
    if let Some(face) = system.db().faces().find(|f| f.families.iter().any(|(n, _)| n.eq_ignore_ascii_case(name))) {
        return face.families.iter().find(|(n, _)| n.eq_ignore_ascii_case(name)).map(|(n, _)| n.clone());
    }
    let faces = if Path::new(name).is_file() {
        let db = system.db_mut();
        db.load_font_source(fontdb::Source::File(name.into()))
            .iter()
            .filter_map(|id| db.face(*id).cloned())
            .collect::<Vec<_>>()
    } else {
        system.db().faces().filter(|f| f.post_script_name.eq_ignore_ascii_case(name)).cloned().collect()
    };
    if faces.is_empty() {
        return None;
    }
    for mut face in faces {
        for (family, _) in &mut face.families {
            *family = name.to_owned();
        }
        system.db_mut().push_face_info(face);
    }
    Some(name.to_owned())
}

struct Builder(PathBuilder);

impl OutlinePen for Builder {
    fn move_to(&mut self, x: f32, y: f32) {
        self.0.move_to(x, y);
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.0.line_to(x, y);
    }
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        self.0.quad_to(x1, y1, x, y);
    }
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        self.0.cubic_to(x1, y1, x2, y2, x, y);
    }
    fn close(&mut self) {
        self.0.close();
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn fallback_locale_matches_cosmic_text_han_keys() {
        for (lang, key) in [
            ("ja", "ja"),
            ("ja-JP", "ja"),
            ("ko-KR", "ko"),
            ("zh-TW", "zh-TW"),
            ("zh-Hant", "zh-TW"),
            ("zh-Hant-HK", "zh-HK"),
            ("zh-MO", "zh-HK"),
            ("zh-CN", "zh-CN"),
            ("en-US", "en-US"),
        ] {
            assert_eq!(super::fallback_locale(lang), key, "{lang}");
        }
    }
}
