use super::*;
const BOX: &[&str] = &["x", "y", "anchor", "w", "h", "min-w", "max-w", "min-h", "max-h", "grow", "shrink", "rotate"];
const DECO: &[&str] = &["fill", "stroke", "stroke-width", "radius"];
const GROUP: &[&str] = &["padding", "align"];
const FLOW: &[&str] = &["gap", "justify", "wrap"];
const TEXT: &[&str] = &[
    "size",
    "color",
    "font",
    "weight",
    "align",
    "line-height",
    "stroke",
    "stroke-width",
    "background",
    "radius",
    "pre",
    "padding",
];
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

impl Flow {
    pub(super) fn kind(self) -> NodeKind {
        match self {
            Flow::Seq => NodeKind::Seq,
            Flow::Repeat => NodeKind::Repeat,
            _ => NodeKind::Par,
        }
    }

    pub(super) fn overlays(self) -> bool {
        !matches!(self, Flow::Row | Flow::Column) && !self.transparent()
    }

    pub(super) fn transparent(self) -> bool {
        matches!(self, Flow::Repeat | Flow::Dur)
    }
}

#[derive(Default, Clone)]
pub(super) struct Deco {
    pub(super) fill: Option<Rgba>,
    pub(super) stroke: Option<Rgba>,
    pub(super) stroke_width: Option<f32>,
    pub(super) radius: f32,
}

pub(super) enum Leaf {
    Text(TextSpec),
    Image { path: PathBuf, natural: (f32, f32) },
    Rect,
    Circle,
    Line(Vec<(Dim, Dim)>, PolySpec),
    Video(MediaSrc, (f32, f32)),
    Audio(ElemKind),
}

pub(super) enum Kind {
    Group(Flow),
    Leaf(Leaf),
}

pub(super) struct VNode {
    pub(super) span: Span,
    pub(super) head: Span,
    pub(super) style: Style,
    pub(super) anchor: Option<Anchor>,
    pub(super) rotate: Option<f32>,
    pub(super) deco: Deco,
    pub(super) times: Times,
    pub(super) dur: Dur,
    pub(super) kind: Kind,
    pub(super) children: Vec<VNode>,
    pub(super) own: bool,
    pub(super) split: bool,
    pub(super) hold: Option<i64>,
    pub(super) holds: Vec<VNode>,
}

impl VNode {
    pub(super) fn timed(&self) -> bool {
        self.dur != Dur::Fill
    }

    pub(super) fn has_video(&self) -> bool {
        matches!(self.kind, Kind::Leaf(Leaf::Video(..))) || self.children.iter().any(VNode::has_video)
    }

    pub(super) fn boxed(&self) -> bool {
        !matches!(self.kind, Kind::Leaf(Leaf::Audio(_)))
    }

    pub(super) fn transparent(&self) -> bool {
        matches!(self.kind, Kind::Group(f) if f.transparent())
    }

    pub(super) fn folds(&self) -> bool {
        let mut inside = self.children.iter().filter(|c| c.hold.is_none());
        matches!(self.kind, Kind::Group(Flow::Dur))
            && !self.times.any()
            && matches!((inside.next(), inside.next()), (Some(c), None) if c.times.at.is_none() && c.times.delay.is_none() && c.dur != Dur::Fill)
    }

    pub(super) fn unfold(self) -> Vec<VNode> {
        if !self.folds() {
            return vec![self];
        }
        self.children
            .into_iter()
            .map(|c| VNode {
                own: c.own || c.hold.is_none(),
                ..c
            })
            .collect()
    }
}

pub(super) fn in_cell(n: &mut VNode) {
    if n.transparent() {
        n.children.iter_mut().filter(|c| c.hold.is_none()).for_each(in_cell);
    } else if n.anchor.is_none() {
        n.style.grid_row = Line { start: line(1), end: span(1) };
        n.style.grid_column = Line { start: line(1), end: span(1) };
    }
}

/// A `Dimension` or `LengthPercentageAuto`.
pub(super) fn length_auto<T: TaffyAuto + FromLength + FromPercent>(d: Dim) -> T {
    match d {
        Dim::Auto => auto(),
        Dim::Px(v) => length(v),
        Dim::Frac(f) => percent(f),
    }
}

pub(super) fn lp(d: Dim) -> LengthPercentage {
    match d {
        Dim::Px(v) => LengthPercentage::length(v),
        Dim::Frac(f) => LengthPercentage::percent(f),
        Dim::Auto => LengthPercentage::length(0.0),
    }
}

pub(super) fn padding(k: &ValKind) -> Result<taffy::Rect<LengthPercentage>, String> {
    let items = match k {
        ValKind::List(items) => items.as_slice(),
        k => std::slice::from_ref(k),
    };
    let v: Vec<LengthPercentage> = items.iter().map(|k| dim(k).map(lp)).collect::<Result<_, _>>()?;
    let [top, right, bottom, left] = match *v.as_slice() {
        [a] => [a; 4],
        [y, x] => [y, x, y, x],
        [t, r, b, l] => [t, r, b, l],
        _ => return Err("padding takes 1, 2 or 4 values".into()),
    };
    Ok(taffy::Rect { left, right, top, bottom })
}

pub(super) fn alignment(a: &str) -> AlignItems {
    match a {
        "start" => AlignItems::START,
        "center" => AlignItems::CENTER,
        "end" => AlignItems::END,
        _ => AlignItems::STRETCH,
    }
}

impl Ctx<'_> {
    pub(super) fn node(&self, tag: &Tag, diags: &mut Vec<Diag>) -> Option<VNode> {
        let name = tag.name.as_str();
        let at = Attrs::new(name, &keys(name), &tag.attrs, tag.span, diags);
        let flow = Flow::of(name);
        let (mut style, anchor, deco) = self.appearance(name, flow, &at, diags);
        let times = at.times(diags);
        let hold = (flow == Some(Flow::Hold)).then(|| {
            at.require("at", diags);
            at.frames("at", diags).unwrap_or(0)
        });
        let len = (flow == Some(Flow::Dur))
            .then(|| at.require("len", diags).and(at.frames("len", diags)))
            .flatten();
        let rotate = at.num("rotate", diags).filter(|d| *d % 360.0 != 0.0);
        let kind = match flow {
            Some(f) => Kind::Group(f),
            None => Kind::Leaf(self.leaf(tag, &at, &mut style, diags)?),
        };
        let mut children = vec![];
        let mut holds = vec![];
        for t in &tag.children {
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
        let n = VNode {
            span: tag.span,
            head: tag.head,
            style,
            anchor,
            rotate,
            deco,
            times,
            dur,
            kind,
            children,
            own,
            split,
            hold,
            holds,
        };
        if n.rotate.is_some() && n.has_video() {
            diags.push(Diag::new(
                "E322",
                at.span("rotate"),
                "`rotate` cannot turn a `<video>` (or a group that has one)",
            ));
        }
        Some(n)
    }

    fn appearance(&self, name: &str, flow: Option<Flow>, at: &Attrs, diags: &mut Vec<Diag>) -> (Style, Option<Anchor>, Deco) {
        // taffy 0.15 defaults to `Position::Static`; keep every box a containing block so `x`/`y` stay relative to the parent.
        let mut style = Style {
            position: Position::Relative,
            ..Style::default()
        };
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
            style.size = Size {
                width: Dimension::length(self.settings.width as f32),
                height: Dimension::length(self.settings.height as f32),
            };
        }
        if flow == Some(Flow::Hold) {
            style.position = Position::Absolute;
            style.inset = taffy::Rect {
                left: LengthPercentageAuto::length(0.0),
                top: LengthPercentageAuto::length(0.0),
                right: LengthPercentageAuto::auto(),
                bottom: LengthPercentageAuto::auto(),
            };
            style.size = Size {
                width: Dimension::percent(1.0),
                height: Dimension::percent(1.0),
            };
        }
        if let Some(w) = at.dim("w", diags) {
            style.size.width = length_auto(w);
        }
        if let Some(h) = at.dim("h", diags) {
            style.size.height = length_auto(h);
        }
        if let Some(v) = at.dim("min-w", diags) {
            style.min_size.width = length_auto(v);
        }
        if let Some(v) = at.dim("max-w", diags) {
            style.max_size.width = length_auto(v);
        }
        if let Some(v) = at.dim("min-h", diags) {
            style.min_size.height = length_auto(v);
        }
        if let Some(v) = at.dim("max-h", diags) {
            style.max_size.height = length_auto(v);
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
            style.align_items = alignment(&a);
            if f.overlays() {
                style.justify_items = alignment(&a);
            }
        }
        if let Some(j) = at.word("justify", diags, &["start", "center", "end", "between", "around", "evenly"]) {
            style.justify_content = match j.as_str() {
                "start" => JustifyContent::START,
                "center" => JustifyContent::CENTER,
                "end" => JustifyContent::END,
                "between" => JustifyContent::SPACE_BETWEEN,
                "around" => JustifyContent::SPACE_AROUND,
                _ => JustifyContent::SPACE_EVENLY,
            };
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
                left: length_auto(x.unwrap_or(Dim::Px(0.0))),
                top: length_auto(y.unwrap_or(Dim::Px(0.0))),
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
        (style, anchor, deco)
    }

    pub(super) fn length(&self, tag: &Tag, kind: &Kind, len: Option<i64>, timed: bool, diags: &mut Vec<Diag>) -> Dur {
        let need = match kind {
            Kind::Group(Flow::Hold) => Some((
                "E320",
                tag.head,
                "`<hold>` keeps its media waiting while what is in it plays, so it needs a length: put something with a length in it (`<dur len>` gives one)",
            )),
            Kind::Group(Flow::Repeat) => Some((
                "E321",
                tag.head,
                "`<repeat>` repeats what is in it, but nothing there has a length: put something with a length (a `<video>`, an `<audio>`, or a `<dur>`) in it",
            )),
            Kind::Group(Flow::Root) => Some((
                "E323",
                tag.children.first().map_or(tag.head, |t| t.head),
                "the video needs a length: put something with a length (speech, a `<video>`, an `<audio>`, or a `<dur>`) in it",
            )),
            _ => None,
        };
        if let Some((code, span, msg)) = need
            && !timed
        {
            diags.push(Diag::new(code, span, msg));
        }
        match (kind, len) {
            (Kind::Group(Flow::Dur), Some(n)) => Dur::Len(n),
            (Kind::Group(Flow::Repeat) | Kind::Leaf(Leaf::Audio(ElemKind::DraftAudio)), _) => Dur::Fill,
            (Kind::Leaf(Leaf::Video(..) | Leaf::Audio(_)) | Kind::Group(Flow::Hold | Flow::Root), _) => Dur::Own,
            (Kind::Group(_), _) if timed => Dur::Own,
            _ => Dur::Fill,
        }
    }

    pub(super) fn leaf(&self, tag: &Tag, at: &Attrs, style: &mut Style, diags: &mut Vec<Diag>) -> Option<Leaf> {
        Some(match tag.name.as_str() {
            "text" => {
                let size = at.num("size", diags).unwrap_or(48.0);
                let stroke = at.color("stroke", diags);
                let style_t = TextStyle {
                    size,
                    color: at.color("color", diags).unwrap_or([255, 255, 255, 255]),
                    stroke,
                    stroke_width: at
                        .num("stroke-width", diags)
                        .unwrap_or(if stroke.is_some() { (size * 0.12).max(1.0) } else { 0.0 }),
                    font: at
                        .string("font")
                        .or_else(|| self.settings.fonts.first().cloned())
                        .map(|f| resolve_font(&f, self.base_dir)),
                    bold: at.word("weight", diags, &["normal", "bold"]).as_deref() == Some("bold"),
                    align: match at.word("align", diags, &["left", "center", "right"]).as_deref() {
                        Some("center") => Align::Center,
                        Some("right") => Align::Right,
                        _ => Align::Left,
                    },
                    line_height: at.num("line-height", diags).unwrap_or(1.4),
                };
                Leaf::Text(TextSpec {
                    text: tag.text.clone(),
                    x: 0.0,
                    y: 0.0,
                    width: None,
                    style: style_t,
                })
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
                    diags.push(Diag::new(
                        "E303",
                        at.span("p"),
                        format!("a {}`<line>` needs at least {least} points", if closed { "closed " } else { "" }),
                    ));
                    return None;
                }
                style.position = Position::Absolute;
                let fill = at.color("fill", diags);
                let stroke = at
                    .color("stroke", diags)
                    .or(if closed && fill.is_some() { None } else { Some([255, 255, 255, 255]) });
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
                    diags.push(Diag::new(
                        "E107",
                        c.name_span,
                        format!("a speech not made yet (`draft`) has no source for `<{}>`", c.name),
                    ));
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

    pub(super) fn speeds(&self, tag: &Tag, diags: &mut Vec<Diag>) -> Vec<Speed> {
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
                        diags.push(Diag::new(
                            "E303",
                            at.span("rate"),
                            "`rate` is how many times as fast it plays: a number above 0 (`2`, `0.5`); `<cut>` skips a part",
                        ));
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

pub(super) fn is_speed(t: &Tag) -> bool {
    matches!(t.name.as_str(), "speed" | "cut")
}

pub(super) fn speeds(tag: &Tag) -> impl Iterator<Item = &Tag> {
    tag.children.iter().filter(|t| is_speed(t))
}

pub(super) fn keep_ratio(style: &mut Style, natural: (f32, f32)) {
    if style.size.width.is_auto() && style.size.height.is_auto() {
        style.aspect_ratio = Some(natural.0 / natural.1.max(1.0));
    }
}

pub(super) fn video_size(path: &Path) -> (f32, f32) {
    let probed = path.is_file().then(|| crate::media::probe::probe_cached(path).ok()).flatten();
    probed
        .and_then(|p| p.video)
        .filter(|v| v.w > 0 && v.h > 0)
        .map_or((16.0, 9.0), |v| (v.w as f32, v.h as f32))
}
