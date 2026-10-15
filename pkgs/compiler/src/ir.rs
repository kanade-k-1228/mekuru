use crate::lang::span::Span;
use crate::settings::{Rgba, Settings, TextStyle};
use std::collections::BTreeMap;
use std::path::PathBuf;
use tiny_skia::Transform;

pub type NodeId = usize;
pub type ElemId = usize;

#[derive(Clone, Debug)]
pub struct Script {
    pub settings: Settings,
    pub nodes: Vec<Node>,
    pub elems: Vec<Elem>,
    pub ids: BTreeMap<String, Target>,
    pub base_dir: PathBuf,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NodeKind {
    Seq,
    Par,
    Repeat,
}

impl NodeKind {
    pub fn chains(self) -> bool {
        self == NodeKind::Seq
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Target {
    Node(NodeId),
    Elem(ElemId),
}

#[derive(Clone, Debug, PartialEq)]
pub struct Ref {
    pub id: String,
    pub pos: i64,
}

impl std::fmt::Display for Ref {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{}:{}", self.id, self.pos)
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum Dur {
    Own,
    Len(i64),
    #[default]
    Fill,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Time {
    pub at: Option<Ref>,
    pub delay: i64,
    pub dur: Dur,
    pub fade_in: i64,
    pub fade_out: i64,
    pub slot: Option<String>,
}

impl Time {
    pub fn timed(&self) -> bool {
        self.dur != Dur::Fill
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Hold {
    pub media: ElemId,
    pub at: i64,
}

#[derive(Clone, Debug)]
pub struct Node {
    pub id: NodeId,
    pub parent: Option<NodeId>,
    pub kind: NodeKind,
    pub tag: &'static str,
    pub t: Time,
    pub head: Span,
    pub span: Span,
    pub order: Vec<Target>,
    pub hold: Option<Hold>,
}

#[derive(Clone, Debug)]
pub struct Elem {
    pub id: ElemId,
    pub node: NodeId,
    pub site: Span,
    pub order: u32,
    pub z: i32,
    pub opacity: f32,
    pub t: Time,
    pub kind: ElemKind,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ElemKind {
    View(ViewSpec),
    Video(VideoSpec),
    Audio(AudioSpec),
    DraftAudio,
}

impl ElemKind {
    pub fn name(&self) -> &'static str {
        match self {
            ElemKind::View(_) => "view",
            ElemKind::Video(_) => "video",
            ElemKind::Audio(_) | ElemKind::DraftAudio => "audio",
        }
    }

    pub fn media(&self) -> Option<&MediaSrc> {
        match self {
            ElemKind::Video(v) => Some(&v.media),
            ElemKind::Audio(a) => Some(&a.media),
            ElemKind::View(_) | ElemKind::DraftAudio => None,
        }
    }

    pub fn is_visual(&self) -> bool {
        matches!(self, ElemKind::View(_) | ElemKind::Video(_))
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextSpec {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub width: Option<f32>,
    pub style: TextStyle,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RectSpec {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub fill: Option<Rgba>,
    pub stroke: Option<Rgba>,
    pub stroke_width: f32,
    pub radius: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CircleSpec {
    pub x: f32,
    pub y: f32,
    pub rx: f32,
    pub ry: f32,
    pub fill: Option<Rgba>,
    pub stroke: Option<Rgba>,
    pub stroke_width: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Dash {
    Solid,
    Dashed,
    Dotted,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PolySpec {
    pub pts: Vec<(f32, f32)>,
    pub closed: bool,
    pub fill: Option<Rgba>,
    pub stroke: Option<Rgba>,
    pub stroke_width: f32,
    pub head_start: bool,
    pub head_end: bool,
    pub dash: Dash,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ImageSpec {
    pub path: PathBuf,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ViewOp {
    Rect(RectSpec),
    Circle(CircleSpec),
    Poly(PolySpec),
    Text(TextSpec),
    Image(ImageSpec),
    Transformed(Transform, Box<ViewOp>),
}

impl ViewOp {
    pub fn transformed(self, t: Transform) -> ViewOp {
        if t.is_identity() { self } else { ViewOp::Transformed(t, Box::new(self)) }
    }
}

pub fn scaled(t: Transform, scale: f32) -> Transform {
    Transform::from_row(t.sx, t.ky, t.kx, t.sy, t.tx * scale, t.ty * scale)
}

#[derive(Clone, Debug, PartialEq)]
pub struct ViewSpec {
    pub ops: Vec<ViewOp>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MediaSrc {
    pub path: PathBuf,
    pub from: i64,
    pub to: Option<i64>,
    pub volume: f32,
    pub speeds: Vec<Speed>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Speed {
    pub from: Option<i64>,
    pub to: Option<i64>,
    pub rate: f64,
    pub site: Span,
}

#[derive(Clone, Debug, PartialEq)]
pub struct VideoSpec {
    pub media: MediaSrc,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AudioSpec {
    pub media: MediaSrc,
}

impl Elem {
    pub fn timed(&self) -> bool {
        self.t.timed()
    }
}
