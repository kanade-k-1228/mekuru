mod source;

use crate::{Project, ir::*, lang::diag::Diag, media::Fps, prepare, render::{video_bounds, shapes, text::{draw::text_paths, font::FontBook}, transform_paths, vector::PaintedPath}, schedule::{Schedule, SrcMap}};
use serde::Serialize;
use std::{collections::BTreeMap, fmt::Write, path::Path};
use tiny_skia::{LineCap, LineJoin, PathSegment, Transform};

#[derive(Serialize)]
pub struct Compilation {
    pub preview: Option<Preview>,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Serialize)]
pub struct Diagnostic { pub code: String, pub severity: &'static str, pub line: u32, pub message: String }

#[derive(Serialize)]
pub struct Preview {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration: f64,
    pub elements: Vec<Element>,
    pub timeline: Timeline,
}

#[derive(Serialize)]
pub struct Element {
    id: usize,
    kind: &'static str,
    start: f64,
    end: f64,
    opacity: f32,
    fades: Vec<[f64; 5]>,
    ops: Vec<Op>,
    media: Option<Media>,
    bounds: Option<[f32; 4]>,
    repeat: Vec<[f64; 3]>,
    hidden: Vec<[f64; 2]>,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Op {
    Path { d: String, color: String, stroke: Option<Stroke> },
    Image { src: String, bounds: [f32; 4], transform: Option<[f32; 6]> },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stroke { width: f32, line_cap: &'static str, line_join: &'static str, dash: Vec<f32> }

#[derive(Serialize)]
pub struct Media { src: String, gain: f32, map: MediaMap }
#[derive(Serialize)]
pub struct MediaMap { from: f64, end: f64, segments: Vec<[f64; 4]> }

#[derive(Serialize, Default)]
pub struct Timeline { nodes: Vec<TimelineNode>, clips: Vec<Clip> }
#[derive(Serialize)]
pub struct TimelineNode { id: usize, parent: Option<usize>, depth: usize, kind: &'static str, tag: &'static str, label: String, line: u32, start: f64, end: f64, pin: Option<f64> }
#[derive(Serialize)]
pub struct Clip { tag: String, lane: &'static str, line: u32, start: f64, end: f64, label: String, estimated: bool, freezes: Vec<[f64; 2]> }

pub fn compile(path: &Path, root: Option<&Path>, xml: String) -> Compilation {
    let source = source::format(&xml).unwrap_or(xml);
    let p = Project::from_source_mode(path, root, source, true);
    let mut diags = p.diags.clone();
    let preview = if p.has_errors() { None } else {
        let prepared = prepare::inspect(&p.script);
        diags.extend(prepared.diags.iter().cloned());
        if diags.iter().any(Diag::is_error) { None } else {
            let sched = p.schedule(&prepared);
            diags.extend(sched.diags.iter().cloned());
            if diags.iter().any(Diag::is_error) { None } else { Some(scene(&p, &prepared, &sched, &mut diags)) }
        }
    };
    let diagnostics = diags.iter().map(|d| Diagnostic {
        code: d.code.into(), severity: if d.is_error() { "error" } else { "warning" }, line: p.index.line(d.span.lo), message: d.msg.clone(),
    }).collect();
    Compilation { preview, diagnostics }
}

fn file_src(path: &Path, root: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

fn media_map(src: &SrcMap, fps: Fps) -> MediaMap {
    let s = |f: f64| fps.secs(f);
    MediaMap { from: s(src.from), end: s(src.end),
        segments: src.segs.iter().map(|g| [s(g.t0), s(g.t1), s(g.s0), g.rate]).collect() }
}

fn path_op(p: PaintedPath) -> Op {
    let mut d = String::new();
    for segment in p.path.segments() {
        match segment {
            PathSegment::MoveTo(a) => { let _ = write!(d, "M{} {}", a.x, a.y); }
            PathSegment::LineTo(a) => { let _ = write!(d, "L{} {}", a.x, a.y); }
            PathSegment::QuadTo(a, b) => { let _ = write!(d, "Q{} {} {} {}", a.x, a.y, b.x, b.y); }
            PathSegment::CubicTo(a, b, c) => { let _ = write!(d, "C{} {} {} {} {} {}", a.x, a.y, b.x, b.y, c.x, c.y); }
            PathSegment::Close => d.push('Z'),
        }
    }
    let [r, g, b, a] = p.color;
    let stroke = p.stroke.map(|s| Stroke {
        width: s.width,
        line_cap: match s.line_cap { LineCap::Butt => "butt", LineCap::Round => "round", LineCap::Square => "square" },
        line_join: match s.line_join { LineJoin::Round => "round", LineJoin::Bevel => "bevel", _ => "miter" },
        dash: p.dash,
    });
    Op::Path { d, color: format!("#{r:02x}{g:02x}{b:02x}{a:02x}"), stroke }
}

fn draw_op(op: &ViewOp, t: Transform, fonts: &FontBook, base_dir: &Path, ops: &mut Vec<Op>) -> Result<(), ()> {
    let paths = match op {
        ViewOp::Transformed(m, inner) => return draw_op(inner, t.pre_concat(*m), fonts, base_dir, ops),
        ViewOp::Rect(r) => shapes::rect_paths(r, 1.0),
        ViewOp::Circle(c) => shapes::circle_paths(c, 1.0),
        ViewOp::Poly(l) => shapes::poly_paths(l, 1.0),
        ViewOp::Text(text) => match text_paths(fonts, text, 1.0) {
            Some(paths) => paths,
            None if text.text.trim().is_empty() => vec![],
            None => return Err(()),
        },
        ViewOp::Image(img) => {
            let transform = (!t.is_identity()).then_some([t.sx, t.ky, t.kx, t.sy, t.tx, t.ty]);
            ops.push(Op::Image { src: file_src(&img.path, base_dir), bounds: [img.x, img.y, img.w, img.h], transform });
            vec![]
        }
    };
    ops.extend(transform_paths(paths, t).into_iter().map(path_op));
    Ok(())
}

fn scene(p: &Project, prepared: &prepare::Prepared, sched: &Schedule, diags: &mut Vec<Diag>) -> Preview {
    let script = &p.script;
    let st = &script.settings;
    let fps = st.rate();
    let s = |f: f64| fps.secs(f);
    let i = |f: i64| fps.secs(f as f64);
    let fonts = p.fonts();
    let mut elements = vec![];
    let mut order: Vec<_> = script.elems.iter().collect();
    order.sort_by_key(|e| (e.z, e.order));
    for e in order {
        let et = &sched.elems[e.id];
        if !e.kind.is_visual() && !matches!(e.kind, ElemKind::Audio(_)) { continue; }
        let mut ops = vec![];
        let mut bounds = None;
        match &e.kind {
            ElemKind::View(view) => for op in &view.ops {
                if let Err(()) = draw_op(op, Transform::identity(), &fonts, &script.base_dir, &mut ops) {
                    diags.push(Diag::new("W560", e.site, "text could not be drawn; install a font or set `font`"));
                }
            },
            ElemKind::Video(v) => if let Some(vs) = prepared.media.get(&e.id).and_then(|m| m.probe.video) {
                bounds = Some(video_bounds(v, vs));
            },
            _ => {}
        }
        let media = e.kind.media().zip(et.src.as_ref()).map(|(m, src)| Media {
            src: file_src(&m.path, &script.base_dir), gain: if prepared.media.get(&e.id).is_some_and(|m| m.probe.has_audio) { m.volume } else { 0.0 }, map: media_map(src, fps),
        });
        elements.push(Element { id: e.id, kind: e.kind.name(), start: i(et.start), end: i(et.end), opacity: e.opacity,
            fades: et.fades().iter().filter(|f| f.fade_in > 0.0 || f.fade_out > 0.0).map(|f| [s(f.start), s(f.end), s(f.fade_in), s(f.fade_out), f.level as f64]).collect(), ops, media, bounds,
            repeat: et.repeat.iter().map(|r| [i(r.from), i(r.period), i(r.until)]).collect(), hidden: et.hidden.iter().map(|&(a, b)| [i(a), i(b)]).collect() });
    }
    Preview { width: st.width, height: st.height, fps: st.fps, duration: i(sched.total),
        elements, timeline: timeline(p, sched) }
}

fn timeline(p: &Project, sched: &Schedule) -> Timeline {
    let fps = p.script.settings.rate();
    let i = |f: i64| fps.secs(f as f64);
    let s = &p.script;
    let mut out = Timeline::default();
    let doc = roxmltree::Document::parse(&p.source).expect("validated XML");
    let tags: BTreeMap<_, _> = doc.descendants().filter(|n| n.is_element()).map(|n| (n.range().start as u32, n)).collect();
    let mut depths = vec![0; s.nodes.len()];
    let mut labels = vec![String::new(); s.nodes.len()];
    for n in &s.nodes {
        if let Some(parent) = n.parent { depths[n.id] = depths[parent] + 1; }
    }
    for e in &s.elems {
        let et = &sched.elems[e.id];
        let tag = tags.get(&e.site.lo);
        let name = tag.map_or(e.kind.name(), |t| t.tag_name().name());
        let speech = tag.and_then(|t| t.attribute("label"));
        let lane = match &e.kind { ElemKind::Audio(_) | ElemKind::DraftAudio => if speech.is_some() { "speech" } else { "audio" }, ElemKind::Video(_) => "video", _ => "visual" };
        let label = speech.map(str::to_string).unwrap_or_else(|| e.kind.media().map(|m| m.path.file_name().unwrap_or_default().to_string_lossy().into_owned())
            .unwrap_or_else(|| tag.map_or_else(String::new, |t| t.descendants().filter(|n| n.is_text()).filter_map(|n| n.text()).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" "))));
        if lane == "speech" && labels[e.node].is_empty() { labels[e.node] = label.clone(); }
        let line = p.index.line(e.site.lo);
        if matches!(&e.kind, ElemKind::View(v) if v.ops.is_empty()) { continue; }
        out.clips.push(Clip { tag: name.into(), lane, line, start: i(et.start), end: i(et.end), label: label.chars().take(80).collect(),
            estimated: matches!(e.kind, ElemKind::DraftAudio), freezes: et.src.as_ref().map_or_else(Vec::new, |s| s.freezes().map(|(a,b)| [fps.secs(a), fps.secs(b)]).collect()) });
    }
    for n in s.nodes.iter().rev() {
        if labels[n.id].is_empty() {
            labels[n.id] = n.order.iter().find_map(|child| match child {
                Target::Node(id) if !labels[*id].is_empty() => Some(labels[*id].clone()),
                _ => None,
            }).unwrap_or_default();
        }
    }
    let top = |id: usize| id == 0 || s.nodes[0].order.first() == Some(&Target::Node(id));
    for n in s.nodes.iter().filter(|n| !top(n.id)) {
        let t = sched.nodes[n.id];
        let line = p.index.line(n.head.lo);
        out.nodes.push(TimelineNode { id: n.id, parent: n.parent.filter(|&id| !top(id)), depth: depths[n.id] - 1,
            kind: match n.kind { NodeKind::Seq => "seq", NodeKind::Par => "par", NodeKind::Repeat => "repeat" }, tag: n.tag,
            label: labels[n.id].clone(), line, start: i(t.start), end: i(t.end), pin: (n.t.delay > 0).then(|| i(n.t.delay)) });
    }
    out
}
