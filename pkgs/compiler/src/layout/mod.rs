use crate::ir::{
    AudioSpec, CircleSpec, Dash, Dur, Elem, ElemId, ElemKind, Hold, ImageSpec, MediaSrc, Node, NodeKind, PolySpec, RectSpec, Speed, Target, TextSpec, Time,
    VideoSpec, ViewOp, ViewSpec,
};
use crate::lang::ast::{Tag, ValKind};
use crate::lang::attrs::{Attrs, Dim, MEDIA, TIMES, Times, dim};
use crate::lang::diag::Diag;
use crate::lang::span::Span;
use crate::settings::{Align, Anchor, Rgba, Settings, TextStyle, resolve_font};
use crate::typography::font::FontBook;
use crate::typography::measure_text;
use std::path::{Path, PathBuf};
use taffy::prelude::*;
use tiny_skia::Transform;

mod parse;
use parse::*;
pub use parse::{Ctx, Lowered};

mod measure;
use measure::*;

pub fn lower(root: &Tag, ctx: &Ctx, diags: &mut Vec<Diag>) -> Lowered {
    let mut out = Out {
        tree: TaffyTree::new(),
        nodes: vec![],
        elems: vec![],
        names: vec![],
    };
    let root = ctx.node(root, diags).expect("`<mekuru>` is a group");
    out.tree.disable_rounding();
    let ids = add(&mut out.tree, &root);
    let (cw, ch) = (ctx.settings.width as f32, ctx.settings.height as f32);
    let fonts = ctx.fonts;
    let result = out.tree.compute_layout_with_measure(
        ids.id.expect("`<mekuru>` takes space"),
        Size {
            width: AvailableSpace::Definite(cw),
            height: AvailableSpace::Definite(ch),
        },
        |inputs, _id, m, style| {
            taffy::compute_leaf_layout(
                inputs,
                style,
                |_, _| 0.0,
                |known, avail| match m {
                    Some(m) => measure(fonts, m, known, avail),
                    None => Size::ZERO,
                },
            )
        },
    );
    if result.is_err() {
        diags.push(Diag::new("E317", root.span, "layout failed"));
    }
    out.node(&root, None, Flow::Root, None);
    let screen = Frame { x: 0.0, y: 0.0, w: cw, h: ch };
    let look = Look { node: 0, z: 0, opacity: 1.0 };
    out.children(&root, &ids, Bx { ids: &ids, r: screen }, Transform::identity(), look);
    Lowered {
        nodes: out.nodes,
        elems: out.elems,
        names: out.names,
    }
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
        self.nodes.push(Node {
            id,
            parent,
            kind: flow.kind(),
            tag: flow.name(),
            t: n.times.time(n.dur),
            head: n.head,
            span: n.span,
            order: vec![],
            hold,
        });
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
        self.elems.push(Elem {
            id,
            node: look.node,
            site: n.span,
            order: 0,
            z,
            opacity,
            t: n.times.time(n.dur),
            kind,
        });
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
            && let Elem {
                t,
                z,
                opacity,
                kind: ElemKind::View(v),
                ..
            } = &mut self.elems[e]
            && *t == Time::default()
            && (*z, *opacity) == (look.z, look.opacity)
        {
            v.ops.extend(ops);
            return;
        }
        let id = self.elems.len();
        let kind = ElemKind::View(ViewSpec { ops });
        self.elems.push(Elem {
            id,
            node: look.node,
            site,
            order: 0,
            z: look.z,
            opacity: look.opacity,
            t: Time::default(),
            kind,
        });
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
                let inner = Look {
                    node,
                    z: n.times.z.unwrap_or(look.z),
                    opacity: look.opacity * n.times.opacity.unwrap_or(1.0),
                };
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
                Some(self.elem(
                    n,
                    look,
                    ElemKind::Video(VideoSpec {
                        media: media.clone(),
                        x: r.x,
                        y: r.y,
                        w: r.w,
                        h: r.h,
                    }),
                ))
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
        let xf = n
            .rotate
            .map_or(xf, |deg| xf.pre_concat(Transform::from_rotate_at(deg, x + w / 2.0, y + h / 2.0)));
        Some((Frame { x, y, w, h }, xf))
    }

    fn inner(&self, ids: &Ids, child: &VNode, r: Frame) -> Frame {
        match ids.content.map(|c| self.tree.layout(c).expect("laid out")) {
            Some(b) if absolute(child) => Frame {
                x: r.x + b.location.x,
                y: r.y + b.location.y,
                w: b.size.width,
                h: b.size.height,
            },
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
        let deco_rect = |fill: Option<Rgba>, stroke: Option<Rgba>| RectSpec {
            x,
            y,
            w,
            h,
            fill,
            stroke,
            stroke_width: stroke_width(stroke),
            radius: d.radius,
        };
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
                draw(ViewOp::Text(TextSpec {
                    x: x + pl,
                    y: y + pt,
                    width: Some(cw + 0.5),
                    ..spec.clone()
                }));
            }
            Kind::Leaf(Leaf::Image { path, .. }) => draw(ViewOp::Image(ImageSpec {
                path: path.clone(),
                x,
                y,
                w,
                h,
            })),
            Kind::Leaf(Leaf::Rect) => draw(ViewOp::Rect(deco_rect(d.fill, outline))),
            Kind::Leaf(Leaf::Circle) => {
                let (rx, ry) = (w / 2.0, h / 2.0);
                draw(ViewOp::Circle(CircleSpec {
                    x: x + rx,
                    y: y + ry,
                    rx,
                    ry,
                    fill: d.fill,
                    stroke: outline,
                    stroke_width: stroke_width(outline),
                }));
            }
            Kind::Group(_) if d.fill.is_some() || d.stroke.is_some() => draw(ViewOp::Rect(deco_rect(d.fill, d.stroke))),
            _ => {}
        }
    }
}
