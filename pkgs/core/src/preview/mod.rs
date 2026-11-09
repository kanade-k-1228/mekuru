use crate::typography::font::FontBook;
pub mod delta;
mod identity;
mod session;
pub use session::{Session, Stats};

use crate::{
    Project,
    ir::*,
    lang::ast::Flow,
    media::Fps,
    prepare,
    render::{
        shapes::{self, PaintedPath},
        transform_paths, video_bounds,
    },
    schedule::{Schedule, SrcMap},
};
use std::{collections::BTreeMap, fmt::Write, path::Path};
use tiny_skia::{LineCap, LineJoin, PathSegment, Transform};

pub(crate) mod dto;
pub use dto::*;

fn file_src(path: &Path, root: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

fn media_map(src: &SrcMap, fps: Fps) -> MediaMap {
    let s = |f: f64| fps.secs(f);
    MediaMap {
        from: s(src.from),
        end: s(src.end),
        segments: src.segs.iter().map(|g| [s(g.t0), s(g.t1), s(g.s0), g.rate]).collect(),
    }
}

fn color([r, g, b, a]: [u8; 4]) -> String {
    format!("#{r:02x}{g:02x}{b:02x}{a:02x}")
}

fn path_op(p: PaintedPath) -> Op {
    let mut d = String::new();
    for segment in p.path.segments() {
        match segment {
            PathSegment::MoveTo(a) => {
                let _ = write!(d, "M{} {}", a.x, a.y);
            }
            PathSegment::LineTo(a) => {
                let _ = write!(d, "L{} {}", a.x, a.y);
            }
            PathSegment::QuadTo(a, b) => {
                let _ = write!(d, "Q{} {} {} {}", a.x, a.y, b.x, b.y);
            }
            PathSegment::CubicTo(a, b, c) => {
                let _ = write!(d, "C{} {} {} {} {} {}", a.x, a.y, b.x, b.y, c.x, c.y);
            }
            PathSegment::Close => d.push('Z'),
        }
    }
    let stroke = p.stroke.map(|s| Stroke {
        width: s.width,
        line_cap: match s.line_cap {
            LineCap::Butt => "butt",
            LineCap::Round => "round",
            LineCap::Square => "square",
        },
        line_join: match s.line_join {
            LineJoin::Round => "round",
            LineJoin::Bevel => "bevel",
            _ => "miter",
        },
        dash: p.dash,
    });
    Op::Path {
        d,
        color: color(p.color),
        stroke,
    }
}

fn draw_op(op: &ViewOp, t: Transform, fonts: &FontBook, base_dir: &Path, ops: &mut Vec<Op>) {
    let transform = (!t.is_identity()).then_some([t.sx, t.ky, t.kx, t.sy, t.tx, t.ty]);
    let paths = match op {
        ViewOp::Transformed(m, inner) => return draw_op(inner, t.pre_concat(*m), fonts, base_dir, ops),
        ViewOp::Rect(_) | ViewOp::Circle(_) | ViewOp::Poly(_) => shapes::paths(op, 1.0),
        ViewOp::Text(text) => {
            let st = &text.style;
            let (font, path) = fonts.preview_font(st.font.as_deref());
            let font_src = path.as_deref().and_then(|path| {
                let path = path.canonicalize().ok()?;
                let root = base_dir.canonicalize().ok()?;
                path.strip_prefix(root).ok().map(|p| p.to_string_lossy().replace('\\', "/"))
            });
            let font_revision = font_src.as_ref().and(path.as_deref()).map(session::revision);
            ops.push(Op::Text {
                text: text.text.clone(),
                x: text.x,
                y: text.y,
                width: text.width,
                font,
                font_src,
                font_revision,
                lang: fonts.lang.clone(),
                size: st.size,
                color: color(st.color),
                bold: st.bold,
                align: match st.align {
                    crate::settings::Align::Left => "left",
                    crate::settings::Align::Center => "center",
                    crate::settings::Align::Right => "right",
                },
                line_height: st.line_height,
                stroke: st.stroke.map(color),
                stroke_width: st.stroke_width,
                transform,
            });
            vec![]
        }
        ViewOp::Image(img) => {
            let src = file_src(&img.path, base_dir);
            ops.push(Op::Image {
                revision: session::revision(&base_dir.join(&src)),
                src,
                bounds: [img.x, img.y, img.w, img.h],
                transform,
            });
            vec![]
        }
    };
    ops.extend(transform_paths(paths, t).into_iter().map(path_op));
}

fn scene(p: &Project, prepared: &prepare::Prepared, sched: &Schedule, session: &mut Session) -> Preview {
    let script = &p.script;
    let st = &script.settings;
    let fps = st.rate();
    let s = |f: f64| fps.secs(f);
    let i = |f: i64| fps.secs(f as f64);
    let keys = session.identities.update(&p.syntax);
    let mut counts = std::collections::HashMap::<String, usize>::new();
    let elem_keys: Vec<_> = script
        .elems
        .iter()
        .map(|e| {
            let base = format!("{}:{}", keys[&(e.site.lo as usize)], e.kind.name());
            let count = counts.entry(base.clone()).or_default();
            *count += 1;
            format!("{base}:{count}")
        })
        .collect();
    let mut elements = vec![];
    for e in script.stacked() {
        let et = &sched.elems[e.id];
        if !e.kind.is_visual() && !matches!(e.kind, ElemKind::Audio(_)) {
            continue;
        }
        let mut drawings = vec![];
        let mut bounds = None;
        match &e.kind {
            ElemKind::View(view) => {
                for op in &view.ops {
                    let drawing = session.draw(op, &p.fonts, &script.base_dir);
                    drawings.push(drawing.id);
                }
            }
            ElemKind::Video(v) => {
                if let Some(vs) = prepared.media.get(&e.id).and_then(|m| m.probe.video) {
                    bounds = Some(video_bounds(v, vs));
                }
            }
            _ => {}
        }
        let media = e.kind.media().zip(et.src.as_ref()).map(|(m, src)| Media {
            revision: session::revision(&m.path),
            src: file_src(&m.path, &script.base_dir),
            gain: if prepared.media.get(&e.id).is_some_and(|m| m.probe.has_audio) {
                m.volume
            } else {
                0.0
            },
            map: media_map(src, fps),
        });
        elements.push(Element {
            kind: e.kind.name(),
            start: i(et.start),
            end: i(et.end),
            opacity: e.opacity,
            fades: et
                .fades()
                .iter()
                .filter(|f| f.fade_in > 0.0 || f.fade_out > 0.0)
                .map(|f| [s(f.start), s(f.end), s(f.fade_in), s(f.fade_out), f.level as f64])
                .collect(),
            drawings,
            key: elem_keys[e.id].clone(),
            media,
            bounds,
            repeat: et.repeat.iter().map(|r| [i(r.from), i(r.period), i(r.until)]).collect(),
            hidden: et.hidden.iter().map(|&(a, b)| [i(a), i(b)]).collect(),
        });
    }
    Preview {
        width: st.width,
        height: st.height,
        fps: st.fps,
        duration: i(sched.total),
        elements,
        timeline: timeline(p, sched, &keys, &elem_keys),
    }
}

fn timeline(p: &Project, sched: &Schedule, keys: &std::collections::HashMap<usize, String>, elem_keys: &[String]) -> Timeline {
    let fps = p.script.settings.rate();
    let i = |f: i64| fps.secs(f as f64);
    let s = &p.script;
    let mut out = Timeline::default();
    let tags: BTreeMap<_, _> = p.syntax.descendants().into_iter().map(|tag| (tag.head.lo, tag)).collect();
    let mut depths = vec![0; s.nodes.len()];
    let mut labels = vec![String::new(); s.nodes.len()];
    for n in &s.nodes {
        if let Some(parent) = n.parent {
            depths[n.id] = depths[parent] + 1;
        }
    }
    for e in &s.elems {
        let et = &sched.elems[e.id];
        let tag = tags.get(&e.site.lo);
        let name = tag.map_or(e.kind.name(), |t| t.name.as_str());
        let speech = tag.and_then(|t| t.attribute("label"));
        let lane = match &e.kind {
            ElemKind::Audio(_) | ElemKind::DraftAudio => {
                if speech.is_some() {
                    "speech"
                } else {
                    "audio"
                }
            }
            ElemKind::Video(_) => "video",
            _ => "visual",
        };
        let label = speech.map(str::to_string).unwrap_or_else(|| {
            e.kind
                .media()
                .map(|m| m.path.file_name().unwrap_or_default().to_string_lossy().into_owned())
                .unwrap_or_else(|| tag.map_or_else(String::new, |t| t.label().split_whitespace().collect::<Vec<_>>().join(" ")))
        });
        if lane == "speech" && labels[e.node].is_empty() {
            labels[e.node] = label.clone();
        }
        let line = p.index.line(e.site.lo);
        if matches!(&e.kind, ElemKind::View(v) if v.ops.is_empty()) {
            continue;
        }
        out.clips.push(Clip {
            key: format!("{}:clip", elem_keys[e.id]),
            tag: name.into(),
            lane,
            line,
            start: i(et.start),
            end: i(et.end),
            label: label.chars().take(80).collect(),
            estimated: matches!(e.kind, ElemKind::DraftAudio),
            freezes: et
                .src
                .as_ref()
                .map_or_else(Vec::new, |s| s.freezes().map(|(a, b)| [fps.secs(a), fps.secs(b)]).collect()),
        });
    }
    for n in s.nodes.iter().rev() {
        if labels[n.id].is_empty() {
            labels[n.id] = n
                .order
                .iter()
                .find_map(|child| match child {
                    Target::Node(id) if !labels[*id].is_empty() => Some(labels[*id].clone()),
                    _ => None,
                })
                .unwrap_or_default();
        }
    }
    let top = |id: usize| id == 0 || s.nodes[0].order.first() == Some(&Target::Node(id));
    // Sequences are drawn as their children only.
    for n in s.nodes.iter().filter(|n| !top(n.id) && n.flow != Flow::Seq) {
        let t = sched.nodes[n.id];
        let line = p.index.line(n.head.lo);
        out.nodes.push(TimelineNode {
            key: format!("{}:node", keys[&(n.head.lo as usize)]),
            depth: depths[n.id] - 1,
            tag: n.flow.name(),
            label: labels[n.id].clone(),
            line,
            start: i(t.start),
            end: i(t.end),
            pin: (n.t.delay > 0).then(|| i(n.t.delay)),
        });
    }
    out
}
