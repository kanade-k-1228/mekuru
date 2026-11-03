use serde::Serialize;
#[derive(Clone, Serialize)]
pub struct Compilation {
    pub preview: Option<Preview>,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Clone, Serialize)]
pub struct Diagnostic {
    pub code: String,
    pub severity: &'static str,
    pub line: u32,
    pub message: String,
}

#[derive(Clone, Serialize)]
pub struct Preview {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration: f64,
    pub elements: Vec<Element>,
    pub timeline: Timeline,
}

#[derive(Clone, Serialize)]
pub struct Element {
    pub(super) id: usize,
    pub(super) kind: &'static str,
    pub(super) start: f64,
    pub(super) end: f64,
    pub(super) opacity: f32,
    pub(super) fades: Vec<[f64; 5]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) ops: Option<Vec<Op>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) drawings: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) key: Option<String>,
    pub(super) media: Option<Media>,
    pub(super) bounds: Option<[f32; 4]>,
    pub(super) repeat: Vec<[f64; 3]>,
    pub(super) hidden: Vec<[f64; 2]>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Op {
    Path {
        d: String,
        color: String,
        stroke: Option<Stroke>,
    },
    Image {
        src: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        revision: Option<String>,
        bounds: [f32; 4],
        transform: Option<[f32; 6]>,
    },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stroke {
    pub(super) width: f32,
    pub(super) line_cap: &'static str,
    pub(super) line_join: &'static str,
    pub(super) dash: Vec<f32>,
}

#[derive(Clone, Serialize)]
pub struct Media {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) revision: Option<String>,
    pub(super) src: String,
    pub(super) gain: f32,
    pub(super) map: MediaMap,
}
#[derive(Clone, Serialize)]
pub struct MediaMap {
    pub(super) from: f64,
    pub(super) end: f64,
    pub(super) segments: Vec<[f64; 4]>,
}

#[derive(Clone, Serialize, Default)]
pub struct Timeline {
    pub(super) nodes: Vec<TimelineNode>,
    pub(super) clips: Vec<Clip>,
}
#[derive(Clone, Serialize)]
pub struct TimelineNode {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) key: Option<String>,
    pub(super) id: usize,
    pub(super) parent: Option<usize>,
    pub(super) depth: usize,
    pub(super) kind: &'static str,
    pub(super) tag: &'static str,
    pub(super) label: String,
    pub(super) line: u32,
    pub(super) start: f64,
    pub(super) end: f64,
    pub(super) pin: Option<f64>,
}
#[derive(Clone, Serialize)]
pub struct Clip {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) key: Option<String>,
    pub(super) tag: String,
    pub(super) lane: &'static str,
    pub(super) line: u32,
    pub(super) start: f64,
    pub(super) end: f64,
    pub(super) label: String,
    pub(super) estimated: bool,
    pub(super) freezes: Vec<[f64; 2]>,
}
