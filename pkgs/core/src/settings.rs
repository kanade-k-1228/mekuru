use crate::media::Fps;
use std::path::Path;

pub type Rgba = [u8; 4];

#[derive(Clone, Debug)]
pub struct EncodeSettings {
    pub preset: String,
    pub crf: u8,
    pub audio_bitrate: String,
}

impl Default for EncodeSettings {
    fn default() -> Self {
        EncodeSettings {
            preset: "medium".into(),
            crf: 20,
            audio_bitrate: "192k".into(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Align {
    Left,
    Center,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Anchor(pub f32, pub f32);

impl Anchor {
    pub const TL: Anchor = Anchor(0.0, 0.0);
    pub const C: Anchor = Anchor(0.5, 0.5);

    pub fn parse(s: &str) -> Option<Anchor> {
        Some(match s {
            "tl" => Anchor(0.0, 0.0),
            "t" => Anchor(0.5, 0.0),
            "tr" => Anchor(1.0, 0.0),
            "l" => Anchor(0.0, 0.5),
            "c" => Anchor(0.5, 0.5),
            "r" => Anchor(1.0, 0.5),
            "bl" => Anchor(0.0, 1.0),
            "b" => Anchor(0.5, 1.0),
            "br" => Anchor(1.0, 1.0),
            _ => return None,
        })
    }

    pub const NAMES: &'static [&'static str] = &["tl", "t", "tr", "l", "c", "r", "bl", "b", "br"];
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextStyle {
    pub size: f32,
    pub color: Rgba,
    pub stroke: Option<Rgba>,
    pub stroke_width: f32,
    pub font: Option<String>,
    pub bold: bool,
    pub align: Align,
    pub line_height: f32,
}

#[derive(Clone, Debug)]
pub struct Settings {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub fonts: Vec<String>,
    pub encode: EncodeSettings,
}

impl Settings {
    pub fn rate(&self) -> Fps {
        Fps::from_f64(self.fps)
    }
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            width: 1920,
            height: 1080,
            fps: 30.0,
            fonts: vec![],
            encode: EncodeSettings::default(),
        }
    }
}

pub fn resolve_font(f: &str, base: &Path) -> String {
    let lower = f.to_ascii_lowercase();
    if [".ttf", ".otf", ".ttc", ".otc"].iter().any(|e| lower.ends_with(e)) {
        base.join(f).to_string_lossy().into_owned()
    } else {
        f.to_string()
    }
}

pub fn parse_size(s: &str) -> Option<(u32, u32)> {
    let (w, h) = s.split_once('x')?;
    let (w, h): (u32, u32) = (w.parse().ok()?, h.parse().ok()?);
    ((16..=7680).contains(&w) && (16..=4320).contains(&h)).then_some((w, h))
}
