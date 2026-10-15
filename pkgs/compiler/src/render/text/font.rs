use cosmic_text::skrifa::{
    FontRef, GlyphId, MetadataProvider,
    instance::Size,
    outline::{DrawSettings, OutlinePen},
};
use cosmic_text::{FontSystem, LayoutGlyph, fontdb};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tiny_skia::{Path as SkPath, PathBuilder};

const DEFAULT_FAMILIES: &[&str] = &[
    "Rounded Mplus 1c",
    "M PLUS Rounded 1c",
    "Noto Sans CJK JP",
    "Noto Sans JP",
    "Source Han Sans JP",
    "IPAexGothic",
    "IPAGothic",
    "TakaoGothic",
    "VL Gothic",
    "Yu Gothic",
    "Meiryo",
    "MS Gothic",
    "DejaVu Sans",
    "Liberation Sans",
];

type GlyphKey = (fontdb::ID, fontdb::Weight, u16);
type GlyphPath = Option<Arc<SkPath>>;

pub struct FontBook {
    pub(super) system: Mutex<FontSystem>,
    glyphs: Mutex<HashMap<GlyphKey, GlyphPath>>,
    defaults: Vec<String>,
}

impl FontBook {
    pub fn new(defaults: &[String], extra: &[&Path]) -> Self {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        for path in extra {
            if path.is_dir() {
                db.load_fonts_dir(path);
            } else {
                let _ = db.load_font_file(path);
            }
        }
        Self {
            system: Mutex::new(FontSystem::new_with_locale_and_db("ja-JP".into(), db)),
            glyphs: Mutex::new(HashMap::new()),
            defaults: defaults.to_vec(),
        }
    }

    pub fn shared(defaults: &[String], extra: &[std::path::PathBuf]) -> Arc<Self> {
        type Key = (Vec<String>, Vec<std::path::PathBuf>);
        static CACHE: std::sync::LazyLock<Mutex<HashMap<Key, Arc<FontBook>>>> = std::sync::LazyLock::new(Default::default);
        let key = (defaults.to_vec(), extra.to_vec());
        CACHE
            .lock()
            .unwrap()
            .entry(key)
            .or_insert_with(|| {
                let refs: Vec<&Path> = extra.iter().map(std::path::PathBuf::as_path).collect();
                Arc::new(Self::new(defaults, &refs))
            })
            .clone()
    }

    pub(super) fn family(&self, system: &mut FontSystem, requested: Option<&str>) -> Option<String> {
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

    pub(super) fn glyph_path(&self, glyph: &LayoutGlyph) -> GlyphPath {
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
        self.glyphs.lock().unwrap().insert(key, path.clone());
        path
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
