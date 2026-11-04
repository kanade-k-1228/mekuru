pub use crate::analysis::Diagnostic;
use serde::Serialize;

#[derive(Clone, PartialEq, Serialize)]
pub struct Preview {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration: f64,
    pub elements: Vec<Element>,
    pub timeline: Timeline,
}

#[derive(Clone, PartialEq, Serialize)]
pub struct Element {
    pub(super) kind: &'static str,
    pub(super) start: f64,
    pub(super) end: f64,
    pub(super) opacity: f32,
    pub(super) fades: Vec<[f64; 5]>,
    pub(super) drawings: Vec<String>,
    pub(super) key: String,
    pub(super) media: Option<Media>,
    pub(super) bounds: Option<[f32; 4]>,
    pub(super) repeat: Vec<[f64; 3]>,
    pub(super) hidden: Vec<[f64; 2]>,
}

#[derive(Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Op {
    Text {
        text: String,
        x: f32,
        y: f32,
        width: Option<f32>,
        font: String,
        font_src: Option<String>,
        font_revision: Option<String>,
        size: f32,
        color: String,
        bold: bool,
        align: &'static str,
        line_height: f32,
        stroke: Option<String>,
        stroke_width: f32,
        transform: Option<[f32; 6]>,
    },
    Path {
        d: String,
        color: String,
        stroke: Option<Stroke>,
    },
    Image {
        src: String,
        revision: String,
        bounds: [f32; 4],
        transform: Option<[f32; 6]>,
    },
}

#[derive(Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stroke {
    pub(super) width: f32,
    pub(super) line_cap: &'static str,
    pub(super) line_join: &'static str,
    pub(super) dash: Vec<f32>,
}

#[derive(Clone, PartialEq, Serialize)]
pub struct Media {
    pub(super) revision: String,
    pub(super) src: String,
    pub(super) gain: f32,
    pub(super) map: MediaMap,
}
#[derive(Clone, PartialEq, Serialize)]
pub struct MediaMap {
    pub(super) from: f64,
    pub(super) end: f64,
    pub(super) segments: Vec<[f64; 4]>,
}

#[derive(Clone, PartialEq, Serialize, Default)]
pub struct Timeline {
    pub(super) nodes: Vec<TimelineNode>,
    pub(super) clips: Vec<Clip>,
}
#[derive(Clone, PartialEq, Serialize)]
pub struct TimelineNode {
    pub(super) key: String,
    pub(super) depth: usize,
    pub(super) tag: &'static str,
    pub(super) label: String,
    pub(super) line: u32,
    pub(super) start: f64,
    pub(super) end: f64,
    pub(super) pin: Option<f64>,
}
#[derive(Clone, PartialEq, Serialize)]
pub struct Clip {
    pub(super) key: String,
    pub(super) tag: String,
    pub(super) lane: &'static str,
    pub(super) line: u32,
    pub(super) start: f64,
    pub(super) end: f64,
    pub(super) label: String,
    pub(super) estimated: bool,
    pub(super) freezes: Vec<[f64; 2]>,
}
