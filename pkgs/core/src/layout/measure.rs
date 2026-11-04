use super::*;
pub(super) enum Measure {
    Text(TextSpec, bool),
    Natural((f32, f32)),
}

pub(super) struct Ids {
    pub(super) id: Option<taffy::NodeId>,
    pub(super) content: Option<taffy::NodeId>,
    pub(super) kids: Vec<Ids>,
}

pub(super) fn absolute(n: &VNode) -> bool {
    n.style.position == Position::Absolute
}

pub(super) fn add(tree: &mut TaffyTree<Measure>, n: &VNode) -> Ids {
    if !n.boxed() {
        return Ids {
            id: None,
            content: None,
            kids: vec![],
        };
    }
    let kids: Vec<Ids> = n.children.iter().map(|c| add(tree, c)).collect();
    if n.transparent() {
        return Ids { id: None, content: None, kids };
    }
    let ctx = match &n.kind {
        Kind::Leaf(Leaf::Text(spec)) => Some(Measure::Text(spec.clone(), absolute(n) && n.style.max_size.width.is_auto())),
        Kind::Leaf(Leaf::Image { natural, .. } | Leaf::Video(_, natural)) => Some(Measure::Natural(*natural)),
        _ => None,
    };
    if let Some(c) = ctx {
        return Ids {
            id: Some(tree.new_leaf_with_context(n.style.clone(), c).expect("taffy node")),
            content: None,
            kids,
        };
    }
    let mut items = vec![];
    boxes(&kids, &n.children, &mut items);
    let boxed = |placed: bool| items.iter().filter(move |(_, a)| *a == placed).map(|(id, _)| *id);
    let p = n.style.padding;
    let padded = [p.left, p.right, p.top, p.bottom].iter().any(|v| *v != LengthPercentage::length(0.0));
    let content = (padded && boxed(true).next().is_some()).then(|| {
        let style = Style {
            position: Position::Absolute,
            inset: taffy::Rect {
                left: p.left.into(),
                right: p.right.into(),
                top: p.top.into(),
                bottom: p.bottom.into(),
            },
            ..Default::default()
        };
        tree.new_with_children(style, &boxed(true).collect::<Vec<_>>()).expect("taffy node")
    });
    let flow: Vec<taffy::NodeId> = if content.is_some() {
        boxed(false).chain(content).collect()
    } else {
        items.iter().map(|(id, _)| *id).collect()
    };
    Ids {
        id: Some(tree.new_with_children(n.style.clone(), &flow).expect("taffy node")),
        content,
        kids,
    }
}

pub(super) fn boxes(kids: &[Ids], children: &[VNode], out: &mut Vec<(taffy::NodeId, bool)>) {
    for (k, c) in kids.iter().zip(children) {
        match k.id {
            Some(id) => out.push((id, absolute(c))),
            None if c.transparent() => boxes(&k.kids, &c.children, out),
            None => {}
        }
    }
}

pub(super) fn measure(fonts: &FontBook, m: &mut Measure, known: Size<Option<f32>>, avail: Size<AvailableSpace>) -> Size<f32> {
    match m {
        Measure::Text(spec, free) => {
            let max_w = known.width.or(match avail.width {
                _ if *free => None,
                AvailableSpace::Definite(w) => Some(w),
                AvailableSpace::MinContent => Some(0.0),
                AvailableSpace::MaxContent => None,
            });
            let spec = TextSpec {
                width: max_w.map(|w| w + 0.5),
                ..spec.clone()
            };
            let (w, h) = measure_text(fonts, &spec).unwrap_or((0.0, 0.0));
            Size {
                width: known.width.unwrap_or(w),
                height: known.height.unwrap_or(h),
            }
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
