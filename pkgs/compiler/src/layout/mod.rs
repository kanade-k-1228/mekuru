use crate::ir::{AudioSpec, CircleSpec, Dash, Dur, Elem, ElemId, ElemKind, Hold, ImageSpec, MediaSrc, Node, NodeKind, PolySpec, RectSpec, Speed, Target, TextSpec, Time, VideoSpec, ViewOp, ViewSpec};
use crate::lang::ast::{Tag, ValKind};
use crate::lang::attrs::{Attrs, Dim, MEDIA, TIMES, Times, dim};
use crate::lang::diag::Diag;
use crate::lang::span::Span;
use crate::render::text::draw::measure_text;
use crate::render::text::font::FontBook;
use crate::settings::{Align, Anchor, Rgba, Settings, TextStyle, resolve_font};
use std::path::{Path, PathBuf};
use taffy::prelude::*;
use tiny_skia::Transform;

const BOX: &[&str] = &["x", "y", "anchor", "w", "h", "min-w", "max-w", "min-h", "max-h", "grow", "shrink", "rotate"];
const DECO: &[&str] = &["fill", "stroke", "stroke-width", "radius"];
const GROUP: &[&str] = &["padding", "align"];
const FLOW: &[&str] = &["gap", "justify", "wrap"];
const TEXT: &[&str] = &["size", "color", "font", "weight", "align", "line-height", "stroke", "stroke-width", "background", "radius", "pre", "padding"];
const LINE: &[&str] = &["p", "closed", "fill", "stroke", "stroke-width", "head", "dashed", "dotted"];

pub fn keys(tag: &str) -> Vec<&'static str> {
    let mut k: Vec<&'static str> = match tag {
        "audio" => vec!["id", "at", "delay", "fadein", "fadeout", "label", "draft"],
        "hold" => vec!["id", "at", "fadein", "fadeout", "slot", "z", "opacity"],
        "cut" => vec!["from", "to"],
        "speed" => vec!["from", "to", "rate"],
        _ => TIMES.to_vec(),
    };
    match tag {
        "seq" | "stack" => k.extend(BOX.iter().chain(DECO).chain(GROUP)),
        "dur" => k.push("len"),
        "row" | "column" => k.extend(BOX.iter().chain(DECO).chain(GROUP).chain(FLOW)),
        "text" => k.extend(BOX.iter().chain(TEXT)),
        "image" => k.extend(BOX.iter().chain(&["src"])),
        "video" => k.extend(BOX.iter().chain(MEDIA)),
        "audio" => k.extend(MEDIA.iter().chain(&["label"])),
        "rect" | "circle" => k.extend(BOX.iter().chain(DECO)),
        "line" => k.extend(LINE),
        _ => {}
    }
    k
}

pub struct Ctx<'a> {
    pub settings: &'a Settings,
    pub base_dir: &'a Path,
    pub fonts: &'a FontBook,
    pub preview: bool,
}

pub struct Lowered {
    pub nodes: Vec<Node>,
    pub elems: Vec<Elem>,
    pub names: Vec<(String, Target, Span)>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Flow {
    Root,
    Seq,
    Stack,
    Row,
    Column,
    Hold,
    Repeat,
    Dur,
}

impl Flow {
    fn kind(self) -> NodeKind {
        match self {
            Flow::Seq => NodeKind::Seq,
            Flow::Repeat => NodeKind::Repeat,
            _ => NodeKind::Par,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Flow::Root => "mekuru",
            Flow::Seq => "seq",
            Flow::Stack => "stack",
            Flow::Row => "row",
            Flow::Column => "column",
            Flow::Hold => "hold",
            Flow::Repeat => "repeat",
            Flow::Dur => "dur",
        }
    }

    fn overlays(self) -> bool {
        !matches!(self, Flow::Row | Flow::Column) && !self.transparent()
    }

    fn transparent(self) -> bool {
        matches!(self, Flow::Repeat | Flow::Dur)
    }
}

#[derive(Default, Clone)]
struct Deco {
    fill: Option<Rgba>,
    stroke: Option<Rgba>,
    stroke_width: Option<f32>,
    radius: f32,
}

enum Leaf {
    Text(TextSpec),
    Image { path: PathBuf, natural: (f32, f32) },
    Rect,
    Circle,
    Line(Vec<(Dim, Dim)>, PolySpec),
    Video(MediaSrc, (f32, f32)),
    Audio(ElemKind),
}

enum Kind {
    Group(Flow),
    Leaf(Leaf),
}

struct VNode {
    span: Span,
    head: Span,
    style: Style,
    anchor: Option<Anchor>,
    rotate: Option<f32>,
    deco: Deco,
    times: Times,
    dur: Dur,
    kind: Kind,
    children: Vec<VNode>,
    own: bool,
    split: bool,
    hold: Option<i64>,
    holds: Vec<VNode>,
}

impl VNode {
    fn timed(&self) -> bool {
        self.dur != Dur::Fill
    }

    fn has_video(&self) -> bool {
        matches!(self.kind, Kind::Leaf(Leaf::Video(..))) || self.children.iter().any(VNode::has_video)
    }

    fn boxed(&self) -> bool {
        !matches!(self.kind, Kind::Leaf(Leaf::Audio(_)))
    }

    fn transparent(&self) -> bool {
        matches!(self.kind, Kind::Group(f) if f.transparent())
    }

    fn folds(&self) -> bool {
        let mut inside = self.children.iter().filter(|c| c.hold.is_none());
        matches!(self.kind, Kind::Group(Flow::Dur))
            && !self.times.any()
            && matches!((inside.next(), inside.next()), (Some(c), None) if c.times.at.is_none() && c.times.delay.is_none() && c.dur != Dur::Fill)
    }

    fn unfold(self) -> Vec<VNode> {
        if !self.folds() {
            return vec![self];
        }
        self.children.into_iter().map(|c| VNode { own: c.own || c.hold.is_none(), ..c }).collect()
    }
}

fn in_cell(n: &mut VNode) {
    if n.transparent() {
        n.children.iter_mut().filter(|c| c.hold.is_none()).for_each(in_cell);
    } else if n.anchor.is_none() {
        n.style.grid_row = Line { start: line(1), end: span(1) };
        n.style.grid_column = Line { start: line(1), end: span(1) };
    }
}

fn dimension(d: Dim) -> Dimension {
    match d {
        Dim::Auto => Dimension::auto(),
        Dim::Px(v) => Dimension::length(v),
        Dim::Frac(f) => Dimension::percent(f),
    }
}

fn lpa(d: Dim) -> LengthPercentageAuto {
    match d {
        Dim::Auto => LengthPercentageAuto::auto(),
        Dim::Px(v) => LengthPercentageAuto::length(v),
        Dim::Frac(f) => LengthPercentageAuto::percent(f),
    }
}

fn lp(d: Dim) -> LengthPercentage {
    match d {
        Dim::Px(v) => LengthPercentage::length(v),
        Dim::Frac(f) => LengthPercentage::percent(f),
        Dim::Auto => LengthPercentage::length(0.0),
    }
}

fn padding(k: &ValKind) -> Result<taffy::Rect<LengthPercentage>, String> {
    let one = |k: &ValKind| dim(k).map(lp);
    match k {
        ValKind::List(items) => {
            let v: Vec<LengthPercentage> = items.iter().map(one).collect::<Result<_, _>>()?;
            match v.as_slice() {
                [a] => Ok(taffy::Rect { left: *a, right: *a, top: *a, bottom: *a }),
                [y, x] => Ok(taffy::Rect { left: *x, right: *x, top: *y, bottom: *y }),
                [t, r, b, l] => Ok(taffy::Rect { left: *l, right: *r, top: *t, bottom: *b }),
                _ => Err("padding takes 1, 2 or 4 values".into()),
            }
        }
        k => {
            let a = one(k)?;
            Ok(taffy::Rect { left: a, right: a, top: a, bottom: a })
        }
    }
}

fn alignment(a: &str) -> AlignItems {
    match a {
        "start" => AlignItems::START,
        "center" => AlignItems::CENTER,
        "end" => AlignItems::END,
        _ => AlignItems::STRETCH,
    }
}

impl Ctx<'_> {
    fn node(&self, tag: &Tag, diags: &mut Vec<Diag>) -> Option<VNode> {
        let name = tag.name.as_str();
        let at = Attrs::new(name, &keys(name), &tag.attrs, tag.span, diags);
        let flow = match name {
            "mekuru" => Some(Flow::Root),
            "seq" => Some(Flow::Seq),
            "stack" => Some(Flow::Stack),
            "row" => Some(Flow::Row),
            "column" => Some(Flow::Column),
            "hold" => Some(Flow::Hold),
            "repeat" => Some(Flow::Repeat),
            "dur" => Some(Flow::Dur),
            _ => None,
        };
        let mut style = Style::default();
        match flow {
            Some(Flow::Row) => style.flex_direction = FlexDirection::Row,
            Some(Flow::Column) => style.flex_direction = FlexDirection::Column,
            Some(f) if f.transparent() => {}
            Some(_) => {
                style.display = Display::Grid;
                style.grid_template_columns = vec![fr(1.0)];
                style.grid_template_rows = vec![fr(1.0)];
            }
            None => {}
        }
        if flow == Some(Flow::Root) {
            style.size = Size { width: Dimension::length(self.settings.width as f32), height: Dimension::length(self.settings.height as f32) };
        }
        if flow == Some(Flow::Hold) {
            style.position = Position::Absolute;
            style.inset = taffy::Rect { left: LengthPercentageAuto::length(0.0), top: LengthPercentageAuto::length(0.0), right: LengthPercentageAuto::auto(), bottom: LengthPercentageAuto::auto() };
            style.size = Size { width: Dimension::percent(1.0), height: Dimension::percent(1.0) };
        }
        if let Some(w) = at.dim("w", diags) {
            style.size.width = dimension(w);
        }
        if let Some(h) = at.dim("h", diags) {
            style.size.height = dimension(h);
        }
        if let Some(v) = at.dim("min-w", diags) {
            style.min_size.width = lpa(v);
        }
        if let Some(v) = at.dim("max-w", diags) {
            style.max_size.width = lpa(v);
        }
        if let Some(v) = at.dim("min-h", diags) {
            style.min_size.height = lpa(v);
        }
        if let Some(v) = at.dim("max-h", diags) {
            style.max_size.height = lpa(v);
        }
        if let Some(g) = at.num("grow", diags) {
            style.flex_grow = g.max(0.0);
        }
        if let Some(s) = at.num("shrink", diags) {
            style.flex_shrink = s;
        }
        if let Some(p) = at.conv("padding", diags, padding) {
            style.padding = p;
        }
        if let Some(g) = at.dim("gap", diags) {
            style.gap = Size { width: lp(g), height: lp(g) };
        }
        if let Some(f) = flow
            && let Some(a) = at.word("align", diags, &["start", "center", "end", "stretch"])
        {
            style.align_items = Some(alignment(&a));
            if f.overlays() {
                style.justify_items = Some(alignment(&a));
            }
        }
        if let Some(j) = at.word("justify", diags, &["start", "center", "end", "between", "around", "evenly"]) {
            style.justify_content = Some(match j.as_str() {
                "start" => JustifyContent::START,
                "center" => JustifyContent::CENTER,
                "end" => JustifyContent::END,
                "between" => JustifyContent::SPACE_BETWEEN,
                "around" => JustifyContent::SPACE_AROUND,
                _ => JustifyContent::SPACE_EVENLY,
            });
        }
        if at.flag("wrap", diags) == Some(true) {
            style.flex_wrap = FlexWrap::Wrap;
        }
        let x = at.dim("x", diags);
        let y = at.dim("y", diags);
        let placed = x.is_some() || y.is_some();
        if placed {
            style.position = Position::Absolute;
            style.inset = taffy::Rect {
                left: lpa(x.unwrap_or(Dim::Px(0.0))),
                top: lpa(y.unwrap_or(Dim::Px(0.0))),
                right: LengthPercentageAuto::auto(),
                bottom: LengthPercentageAuto::auto(),
            };
        }
        let anchor = at.anchor(placed, diags);
        let anchor = placed.then_some(anchor.unwrap_or(Anchor::TL));
        let text = name == "text";
        let deco = Deco {
            fill: if text { at.color("background", diags) } else { at.color("fill", diags) },
            stroke: if text { None } else { at.color("stroke", diags) },
            stroke_width: if text { None } else { at.num("stroke-width", diags) },
            radius: at.num("radius", diags).unwrap_or(0.0),
        };
        let times = at.times(diags);
        let hold = (flow == Some(Flow::Hold)).then(|| {
            at.require("at", diags);
            at.frames("at", diags).unwrap_or(0)
        });
        let len = (flow == Some(Flow::Dur)).then(|| at.require("len", diags).and(at.frames("len", diags))).flatten();
        let rotate = at.num("rotate", diags).filter(|d| *d % 360.0 != 0.0);
        let kind = match flow {
            Some(f) => Kind::Group(f),
            None => Kind::Leaf(self.leaf(tag, &at, &mut style, diags)?),
        };
        let mut children = vec![];
        let mut holds = vec![];
        for c in &tag.children {
            let crate::lang::ast::Child::Tag(t) = c else { continue };
            if is_speed(t) {
                continue;
            }
            let Some(n) = self.node(t, diags) else { continue };
            for mut n in n.unfold() {
                if flow.is_some_and(Flow::overlays) && n.hold.is_none() {
                    in_cell(&mut n);
                }
                let after = std::mem::take(&mut n.holds);
                match flow {
                    Some(_) => children.push(n),
                    None => holds.push(n),
                }
                children.extend(after);
            }
        }
        if let Some(n) = len {
            children.iter_mut().filter(|c| c.hold.is_none()).for_each(|c| c.dur = Dur::Len(n));
        }
        let timed = children.iter().any(|c: &VNode| c.hold.is_none() && c.timed());
        let dur = self.length(tag, &kind, len, timed, diags);
        let split = hold.is_some() || children.iter().any(|c: &VNode| c.own);
        let own = split || times.any() || matches!(kind, Kind::Leaf(Leaf::Video(..) | Leaf::Audio(_)) | Kind::Group(Flow::Repeat | Flow::Dur));
        let n = VNode { span: tag.span, head: tag.head, style, anchor, rotate, deco, times, dur, kind, children, own, split, hold, holds };
        if n.rotate.is_some() && n.has_video() {
            diags.push(Diag::new("E322", at.span("rotate"), "`rotate` cannot turn a `<video>` (or a group that has one)"));
        }
        Some(n)
    }

    fn length(&self, tag: &Tag, kind: &Kind, len: Option<i64>, timed: bool, diags: &mut Vec<Diag>) -> Dur {
        let need = match kind {
            Kind::Group(Flow::Hold) => Some(("E320", tag.head, "`<hold>` keeps its media waiting while what is in it plays, so it needs a length: put something with a length in it (`<dur len>` gives one)")),
            Kind::Group(Flow::Repeat) => Some(("E321", tag.head, "`<repeat>` repeats what is in it, but nothing there has a length: put something with a length (a `<video>`, an `<audio>`, or a `<dur>`) in it")),
            Kind::Group(Flow::Root) => {
                let head = tag.children.iter().find_map(|c| match c {
                    crate::lang::ast::Child::Tag(t) => Some(t.head),
                    _ => None,
                });
                Some(("E323", head.unwrap_or(tag.head), "the video needs a length: put something with a length (speech, a `<video>`, an `<audio>`, or a `<dur>`) in it"))
            }
            _ => None,
        };
        if let Some((code, span, msg)) = need
            && !timed
        {
            diags.push(Diag::new(code, span, msg));
        }
        match kind {
            Kind::Group(Flow::Dur) if let Some(n) = len => Dur::Len(n),
            Kind::Group(Flow::Repeat) | Kind::Leaf(Leaf::Audio(ElemKind::DraftAudio)) => Dur::Fill,
            Kind::Leaf(Leaf::Video(..) | Leaf::Audio(_)) | Kind::Group(Flow::Hold | Flow::Root) => Dur::Own,
            Kind::Group(_) if timed => Dur::Own,
            _ => Dur::Fill,
        }
    }

    fn leaf(&self, tag: &Tag, at: &Attrs, style: &mut Style, diags: &mut Vec<Diag>) -> Option<Leaf> {
        Some(match tag.name.as_str() {
            "text" => {
                let text = tag.text();
                let size = at.num("size", diags).unwrap_or(48.0);
                let stroke = at.color("stroke", diags);
                let style_t = TextStyle {
                    size,
                    color: at.color("color", diags).unwrap_or([255, 255, 255, 255]),
                    stroke,
                    stroke_width: at.num("stroke-width", diags).unwrap_or(if stroke.is_some() { (size * 0.12).max(1.0) } else { 0.0 }),
                    font: at.string("font").or_else(|| self.settings.fonts.first().cloned()).map(|f| resolve_font(&f, self.base_dir)),
                    bold: at.word("weight", diags, &["normal", "bold"]).as_deref() == Some("bold"),
                    align: match at.word("align", diags, &["left", "center", "right"]).as_deref() {
                        Some("center") => Align::Center,
                        Some("right") => Align::Right,
                        _ => Align::Left,
                    },
                    line_height: at.num("line-height", diags).unwrap_or(1.4),
                };
                Leaf::Text(TextSpec { text: text.display(), x: 0.0, y: 0.0, width: None, style: style_t })
            }
            "image" => {
                let src = at.require("src", diags)?;
                let path = self.base_dir.join(src.value.trim());
                let natural = match crate::media::image::dims(&path) {
                    Ok((w, h)) => (w as f32, h as f32),
                    Err(_) => {
                        diags.push(Diag::new("E400", at.span("src"), format!("image not found or unreadable: {}", path.display())));
                        (16.0, 9.0)
                    }
                };
                keep_ratio(style, natural);
                Leaf::Image { path, natural }
            }
            "rect" => Leaf::Rect,
            "circle" => Leaf::Circle,
            "line" => {
                let Some(pts) = at.points("p", diags) else {
                    if at.get("p").is_none() {
                        diags.push(Diag::new("E302", tag.span, "`<line>` requires `p`"));
                    }
                    return None;
                };
                let closed = at.flag("closed", diags) == Some(true);
                let least = if closed { 3 } else { 2 };
                if pts.len() < least {
                    diags.push(Diag::new("E303", at.span("p"), format!("a {}`<line>` needs at least {least} points", if closed { "closed " } else { "" })));
                    return None;
                }
                style.position = Position::Absolute;
                let fill = at.color("fill", diags);
                let stroke = at.color("stroke", diags).or(if closed && fill.is_some() { None } else { Some([255, 255, 255, 255]) });
                let head = at.word("head", diags, &["none", "start", "end", "both"]).unwrap_or_else(|| "none".into());
                let spec = PolySpec {
                    pts: vec![],
                    closed,
                    fill,
                    stroke,
                    stroke_width: at.num("stroke-width", diags).unwrap_or(4.0),
                    head_start: head == "start" || head == "both",
                    head_end: head == "end" || head == "both",
                    dash: if at.flag("dotted", diags) == Some(true) {
                        Dash::Dotted
                    } else if at.flag("dashed", diags) == Some(true) {
                        Dash::Dashed
                    } else {
                        Dash::Solid
                    },
                };
                Leaf::Line(pts, spec)
            }
            "video" => {
                let mut media = at.media(self.base_dir, diags)?;
                media.speeds = self.speeds(tag, diags);
                let natural = video_size(&media.path);
                keep_ratio(style, natural);
                Leaf::Video(media, natural)
            }
            "audio" if at.flag("draft", diags) == Some(true) => {
                let msg = if at.get("src").is_some() {
                    Some("a speech not made yet (`draft`) has no `src`")
                } else if !self.preview {
                    Some("this speech is not made yet (`draft`), which only the preview can show: run the script to the end")
                } else {
                    None
                };
                if let Some(m) = msg {
                    diags.push(Diag::new("E323", at.span("draft"), m));
                    return None;
                }
                for c in speeds(tag) {
                    diags.push(Diag::new("E107", c.name_span, format!("a speech not made yet (`draft`) has no source for `<{}>`", c.name)));
                }
                Leaf::Audio(ElemKind::DraftAudio)
            }
            "audio" => {
                let mut media = at.media(self.base_dir, diags)?;
                media.speeds = self.speeds(tag, diags);
                Leaf::Audio(ElemKind::Audio(AudioSpec { media }))
            }
            _ => return None,
        })
    }

    fn speeds(&self, tag: &Tag, diags: &mut Vec<Diag>) -> Vec<Speed> {
        let mut out = vec![];
        for c in speeds(tag) {
            let name = c.name.as_str();
            let at = Attrs::new(name, &keys(name), &c.attrs, c.span, diags);
            let (from, to) = (at.frames("from", diags), at.frames("to", diags));
            if let (Some(a), Some(b)) = (from, to)
                && b <= a
            {
                diags.push(Diag::new("E314", at.span("to"), "`to` must be greater than `from`"));
                continue;
            }
            let rate = if name == "cut" {
                f64::INFINITY
            } else {
                at.require("rate", diags);
                match at.num("rate", diags) {
                    Some(r) if r > 0.0 && r.is_finite() => r as f64,
                    Some(_) => {
                        diags.push(Diag::new("E303", at.span("rate"), "`rate` is how many times as fast it plays: a number above 0 (`2`, `0.5`); `<cut>` skips a part"));
                        continue;
                    }
                    None => continue,
                }
            };
            out.push(Speed { from, to, rate, site: c.head });
        }
        out
    }
}

fn is_speed(t: &Tag) -> bool {
    matches!(t.name.as_str(), "speed" | "cut")
}

fn speeds(tag: &Tag) -> impl Iterator<Item = &Tag> {
    tag.children.iter().filter_map(|c| match c {
        crate::lang::ast::Child::Tag(t) if is_speed(t) => Some(t),
        _ => None,
    })
}

fn keep_ratio(style: &mut Style, natural: (f32, f32)) {
    if style.size.width.is_auto() && style.size.height.is_auto() {
        style.aspect_ratio = Some(natural.0 / natural.1.max(1.0));
    }
}

fn video_size(path: &Path) -> (f32, f32) {
    let probed = path.is_file().then(|| crate::media::probe::probe_cached(path).ok()).flatten();
    probed.and_then(|p| p.video).filter(|v| v.w > 0 && v.h > 0).map_or((16.0, 9.0), |v| (v.w as f32, v.h as f32))
}

enum Measure {
    Text(TextSpec, bool, Vec<(Option<f32>, (f32, f32))>),
    Natural((f32, f32)),
}

struct Ids {
    id: Option<taffy::NodeId>,
    content: Option<taffy::NodeId>,
    kids: Vec<Ids>,
}

fn absolute(n: &VNode) -> bool {
    n.style.position == Position::Absolute
}

fn add(tree: &mut TaffyTree<Measure>, n: &VNode) -> Ids {
    if !n.boxed() {
        return Ids { id: None, content: None, kids: vec![] };
    }
    let kids: Vec<Ids> = n.children.iter().map(|c| add(tree, c)).collect();
    if n.transparent() {
        return Ids { id: None, content: None, kids };
    }
    let ctx = match &n.kind {
        Kind::Leaf(Leaf::Text(spec)) => Some(Measure::Text(spec.clone(), absolute(n) && n.style.max_size.width.is_auto(), vec![])),
        Kind::Leaf(Leaf::Image { natural, .. } | Leaf::Video(_, natural)) => Some(Measure::Natural(*natural)),
        _ => None,
    };
    if let Some(c) = ctx {
        return Ids { id: Some(tree.new_leaf_with_context(n.style.clone(), c).expect("taffy node")), content: None, kids };
    }
    let mut items = vec![];
    boxes(&kids, &n.children, &mut items);
    let boxed = |placed: bool| items.iter().filter(move |(_, a)| *a == placed).map(|(id, _)| *id);
    let p = n.style.padding;
    let padded = [p.left, p.right, p.top, p.bottom].iter().any(|v| *v != LengthPercentage::length(0.0));
    let content = (padded && boxed(true).next().is_some()).then(|| {
        let style = Style {
            position: Position::Absolute,
            inset: taffy::Rect { left: p.left.into(), right: p.right.into(), top: p.top.into(), bottom: p.bottom.into() },
            ..Default::default()
        };
        tree.new_with_children(style, &boxed(true).collect::<Vec<_>>()).expect("taffy node")
    });
    let flow: Vec<taffy::NodeId> = if content.is_some() { boxed(false).chain(content).collect() } else { items.iter().map(|(id, _)| *id).collect() };
    Ids { id: Some(tree.new_with_children(n.style.clone(), &flow).expect("taffy node")), content, kids }
}

fn boxes(kids: &[Ids], children: &[VNode], out: &mut Vec<(taffy::NodeId, bool)>) {
    for (k, c) in kids.iter().zip(children) {
        match k.id {
            Some(id) => out.push((id, absolute(c))),
            None if c.transparent() => boxes(&k.kids, &c.children, out),
            None => {}
        }
    }
}

fn measure(fonts: &FontBook, m: &mut Measure, known: Size<Option<f32>>, avail: Size<AvailableSpace>) -> Size<f32> {
    match m {
        Measure::Text(spec, free, seen) => {
            let max_w = known.width.or(match avail.width {
                _ if *free => None,
                AvailableSpace::Definite(w) => Some(w),
                AvailableSpace::MinContent => Some(0.0),
                AvailableSpace::MaxContent => None,
            });
            let (w, h) = match seen.iter().find(|(k, _)| *k == max_w) {
                Some(&(_, size)) => size,
                None => {
                    let spec = TextSpec { width: max_w.map(|w| w + 0.5), ..spec.clone() };
                    let size = measure_text(fonts, &spec).unwrap_or((0.0, 0.0));
                    seen.push((max_w, size));
                    size
                }
            };
            Size { width: known.width.unwrap_or(w), height: known.height.unwrap_or(h) }
        }
        Measure::Natural((nw, nh)) => {
            let (nw, nh) = (nw.max(1.0), nh.max(1.0));
            match (known.width, known.height) {
                (Some(w), Some(h)) => Size { width: w, height: h },
                (Some(w), None) => Size { width: w, height: w * nh / nw },
                (None, Some(h)) => Size { width: h * nw / nh, height: h },
                (None, None) => {
                    let mut k: f32 = 1.0;
                    if let AvailableSpace::Definite(aw) = avail.width {
                        k = k.min(aw / nw);
                    }
                    if let AvailableSpace::Definite(ah) = avail.height {
                        k = k.min(ah / nh);
                    }
                    Size { width: nw * k, height: nh * k }
                }
            }
        }
    }
}

pub fn lower(root: &Tag, ctx: &Ctx, diags: &mut Vec<Diag>) -> Lowered {
    let mut out = Out { tree: TaffyTree::new(), nodes: vec![], elems: vec![], names: vec![] };
    let root = ctx.node(root, diags).expect("`<mekuru>` is a group");
    out.tree.disable_rounding();
    let ids = add(&mut out.tree, &root);
    let (cw, ch) = (ctx.settings.width as f32, ctx.settings.height as f32);
    let fonts = ctx.fonts;
    let result = out.tree.compute_layout_with_measure(
        ids.id.expect("`<mekuru>` takes space"),
        Size { width: AvailableSpace::Definite(cw), height: AvailableSpace::Definite(ch) },
        |inputs, _id, m, style| {
            taffy::compute_leaf_layout(inputs, style, |_, _| 0.0, |known, avail| match m {
                Some(m) => measure(fonts, m, known, avail),
                None => Size::ZERO,
            })
        },
    );
    if result.is_err() {
        diags.push(Diag::new("E317", root.span, "layout failed"));
    }
    out.node(&root, None, Flow::Root, None);
    let screen = Frame { x: 0.0, y: 0.0, w: cw, h: ch };
    let look = Look { node: 0, z: 0, opacity: 1.0 };
    out.children(&root, &ids, Bx { ids: &ids, r: screen }, Transform::identity(), look);
    Lowered { nodes: out.nodes, elems: out.elems, names: out.names }
}

#[derive(Clone, Copy)]
struct Frame {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

#[derive(Clone, Copy)]
struct Bx<'a> {
    ids: &'a Ids,
    r: Frame,
}

#[derive(Clone, Copy)]
struct Look {
    node: usize,
    z: i32,
    opacity: f32,
}

struct Out {
    tree: TaffyTree<Measure>,
    nodes: Vec<Node>,
    elems: Vec<Elem>,
    names: Vec<(String, Target, Span)>,
}

impl Out {
    fn node(&mut self, n: &VNode, parent: Option<usize>, flow: Flow, hold: Option<Hold>) -> usize {
        let id = self.nodes.len();
        self.nodes.push(Node { id, parent, kind: flow.kind(), tag: flow.name(), t: n.times.time(n.dur), head: n.head, span: n.span, order: vec![], hold });
        if let Some(p) = parent
            && hold.is_none()
        {
            self.nodes[p].order.push(Target::Node(id));
        }
        if let Some(name) = &n.times.id {
            self.names.push((name.clone(), Target::Node(id), n.head));
        }
        id
    }

    fn elem(&mut self, n: &VNode, look: Look, kind: ElemKind) -> ElemId {
        let id = self.elems.len();
        let z = n.times.z.unwrap_or(look.z);
        let opacity = look.opacity * n.times.opacity.unwrap_or(1.0);
        self.elems.push(Elem { id, node: look.node, site: n.span, order: 0, z, opacity, t: n.times.time(n.dur), kind });
        self.nodes[look.node].order.push(Target::Elem(id));
        if let Some(name) = &n.times.id {
            self.names.push((name.clone(), Target::Elem(id), n.head));
        }
        id
    }

    fn draw(&mut self, look: Look, site: Span, ops: Vec<ViewOp>) {
        if ops.is_empty() {
            return;
        }
        if let Some(&Target::Elem(e)) = self.nodes[look.node].order.last()
            && let Elem { t, z, opacity, kind: ElemKind::View(v), .. } = &mut self.elems[e]
            && *t == Time::default()
            && (*z, *opacity) == (look.z, look.opacity)
        {
            v.ops.extend(ops);
            return;
        }
        let id = self.elems.len();
        let kind = ElemKind::View(ViewSpec { ops });
        self.elems.push(Elem { id, node: look.node, site, order: 0, z: look.z, opacity: look.opacity, t: Time::default(), kind });
        self.nodes[look.node].order.push(Target::Elem(id));
    }

    fn children(&mut self, n: &VNode, ids: &Ids, bx: Bx, xf: Transform, look: Look) {
        let mut media = None;
        for (k, c) in ids.kids.iter().zip(&n.children) {
            let frame = self.inner(bx.ids, c, bx.r);
            match (c.hold, media) {
                (Some(at), Some(media)) => _ = self.emit(c, k, frame, bx, xf, look, Some(Hold { media, at })),
                (Some(_), None) => {}
                (None, _) => media = self.emit(c, k, frame, bx, xf, look, None),
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn emit(&mut self, n: &VNode, ids: &Ids, parent: Frame, bx: Bx, xf: Transform, look: Look, hold: Option<Hold>) -> Option<ElemId> {
        if !n.own {
            let mut ops = vec![];
            self.paint(n, ids, parent, bx, xf, &mut ops);
            self.draw(look, n.span, ops);
            return None;
        }
        match &n.kind {
            Kind::Group(flow) if n.split => {
                let node = self.node(n, Some(look.node), *flow, hold);
                let inner = Look { node, z: n.times.z.unwrap_or(look.z), opacity: look.opacity * n.times.opacity.unwrap_or(1.0) };
                if flow.transparent() {
                    self.children(n, ids, bx, xf, inner);
                    return None;
                }
                let (r, xf) = self.place(n, ids, parent, xf)?;
                let mut ops = vec![];
                self.decorate(n, ids, r, xf, &mut ops);
                self.draw(inner, n.span, ops);
                self.children(n, ids, Bx { ids, r }, xf, inner);
                None
            }
            Kind::Leaf(Leaf::Video(media, _)) => {
                let (r, _) = self.place(n, ids, parent, xf)?;
                Some(self.elem(n, look, ElemKind::Video(VideoSpec { media: media.clone(), x: r.x, y: r.y, w: r.w, h: r.h })))
            }
            Kind::Leaf(Leaf::Audio(kind)) => Some(self.elem(n, look, kind.clone())),
            _ => {
                let mut ops = vec![];
                self.paint(n, ids, parent, bx, xf, &mut ops);
                self.elem(n, look, ElemKind::View(ViewSpec { ops }));
                None
            }
        }
    }

    fn place(&self, n: &VNode, ids: &Ids, parent: Frame, xf: Transform) -> Option<(Frame, Transform)> {
        let l = self.tree.layout(ids.id?).expect("laid out");
        let (w, h) = (l.size.width, l.size.height);
        let mut x = parent.x + l.location.x;
        let mut y = parent.y + l.location.y;
        if let Some(a) = n.anchor {
            x -= a.0 * w;
            y -= a.1 * h;
        }
        let xf = n.rotate.map_or(xf, |deg| xf.pre_concat(Transform::from_rotate_at(deg, x + w / 2.0, y + h / 2.0)));
        Some((Frame { x, y, w, h }, xf))
    }

    fn inner(&self, ids: &Ids, child: &VNode, r: Frame) -> Frame {
        match ids.content.map(|c| self.tree.layout(c).expect("laid out")) {
            Some(b) if absolute(child) => Frame { x: r.x + b.location.x, y: r.y + b.location.y, w: b.size.width, h: b.size.height },
            _ => r,
        }
    }

    fn paint(&self, n: &VNode, ids: &Ids, parent: Frame, bx: Bx, xf: Transform, out: &mut Vec<ViewOp>) {
        if let Kind::Leaf(Leaf::Line(pts, spec)) = &n.kind {
            let at = |d: Dim, size: f32| match d {
                Dim::Px(v) => v,
                Dim::Frac(f) => f * size,
                Dim::Auto => 0.0,
            };
            let pts = pts.iter().map(|&(px, py)| (parent.x + at(px, parent.w), parent.y + at(py, parent.h))).collect();
            out.push(ViewOp::Poly(PolySpec { pts, ..spec.clone() }).transformed(xf));
            return;
        }
        if n.transparent() {
            for (k, c) in ids.kids.iter().zip(&n.children) {
                self.paint(c, k, self.inner(bx.ids, c, bx.r), bx, xf, out);
            }
            return;
        }
        let Some((r, xf)) = self.place(n, ids, parent, xf) else { return };
        self.decorate(n, ids, r, xf, out);
        for (k, c) in ids.kids.iter().zip(&n.children) {
            self.paint(c, k, self.inner(ids, c, r), Bx { ids, r }, xf, out);
        }
    }

    fn decorate(&self, n: &VNode, ids: &Ids, r: Frame, xf: Transform, out: &mut Vec<ViewOp>) {
        let Frame { x, y, w, h } = r;
        let d = &n.deco;
        let stroke_width = |stroke: Option<Rgba>| d.stroke_width.unwrap_or(if stroke.is_some() { 4.0 } else { 0.0 });
        let deco_rect = |fill: Option<Rgba>, stroke: Option<Rgba>| RectSpec { x, y, w, h, fill, stroke, stroke_width: stroke_width(stroke), radius: d.radius };
        let outline = d.stroke.or(if d.fill.is_none() { Some([255, 255, 255, 255]) } else { None });
        let mut draw = |op: ViewOp| out.push(op.transformed(xf));
        match &n.kind {
            Kind::Leaf(Leaf::Text(spec)) => {
                if d.fill.is_some() {
                    draw(ViewOp::Rect(deco_rect(d.fill, None)));
                }
                let pad = ids.id.map(|id| self.tree.layout(id).expect("laid out").padding);
                let (pl, pr, pt) = pad.map_or((0.0, 0.0, 0.0), |p| (p.left, p.right, p.top));
                let cw = (w - pl - pr).max(0.0);
                draw(ViewOp::Text(TextSpec { x: x + pl, y: y + pt, width: Some(cw + 0.5), ..spec.clone() }));
            }
            Kind::Leaf(Leaf::Image { path, .. }) => draw(ViewOp::Image(ImageSpec { path: path.clone(), x, y, w, h })),
            Kind::Leaf(Leaf::Rect) => draw(ViewOp::Rect(deco_rect(d.fill, outline))),
            Kind::Leaf(Leaf::Circle) => {
                let (rx, ry) = (w / 2.0, h / 2.0);
                draw(ViewOp::Circle(CircleSpec { x: x + rx, y: y + ry, rx, ry, fill: d.fill, stroke: outline, stroke_width: stroke_width(outline) }));
            }
            Kind::Group(_) if d.fill.is_some() || d.stroke.is_some() => draw(ViewOp::Rect(deco_rect(d.fill, d.stroke))),
            _ => {}
        }
    }
}
