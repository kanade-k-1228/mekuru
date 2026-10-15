use super::ast::*;
use super::diag::{Diag, did_you_mean, suggest};
use super::lex;
use super::span::Span;
use crate::settings::{self, Settings};
use roxmltree::{Node, NodeType};

const SETTING_ATTRS: &[&str] = &["size", "fps", "font", "preset", "crf", "audio-bitrate"];
pub const GROUPS: &[&str] = &["seq", "row", "column", "stack", "repeat", "dur"];
pub const LEAVES: &[&str] = &["text", "image", "video", "audio", "rect", "circle", "line"];

fn known_names() -> impl Iterator<Item = &'static str> {
    ["mekuru", "br", "hold", "cut", "speed"]
        .into_iter()
        .chain(GROUPS.iter().copied())
        .chain(LEAVES.iter().copied())
}

pub fn parse(src: &str) -> (Document, Vec<Diag>) {
    let mut b = Builder {
        src,
        settings: Settings::default(),
        diags: vec![],
    };
    let root = b.run().unwrap_or_else(|| Tag {
        name: "mekuru".into(),
        name_span: Span::default(),
        head: Span::default(),
        attrs: vec![],
        children: vec![],
        span: Span::new(0, src.len()),
    });
    (Document { settings: b.settings, root }, b.diags)
}

struct Builder<'a> {
    src: &'a str,
    settings: Settings,
    diags: Vec<Diag>,
}

fn span_of(r: std::ops::Range<usize>) -> Span {
    Span::new(r.start, r.end)
}

impl Builder<'_> {
    fn run(&mut self) -> Option<Tag> {
        let body = self.src.trim_start_matches('\u{feff}').trim_start();
        if !body.starts_with('<') {
            let end = self.src.find('\n').unwrap_or(self.src.len());
            self.diags.push(Diag::new(
                "E100",
                Span::new(0, end),
                "mekuru-compiler reads XML: write it with the script (`bun src/main.tsx`), or write `<mekuru>…</mekuru>`",
            ));
            return None;
        }
        let opts = roxmltree::ParsingOptions {
            allow_dtd: false,
            ..Default::default()
        };
        let doc = match roxmltree::Document::parse_with_options(self.src, opts) {
            Ok(d) => d,
            Err(e) => {
                let p = e.pos();
                let lo = offset_of(self.src, p.row, p.col);
                let msg = e.to_string();
                let msg = msg.rsplit_once(" at ").map_or(msg.as_str(), |(m, _)| m).to_string();
                self.diags
                    .push(Diag::new("E100", Span::new(lo, (lo + 1).min(self.src.len())), format!("invalid XML: {msg}")));
                return None;
            }
        };
        let root = doc.root_element();
        if root.tag_name().name() != "mekuru" {
            self.diags.push(Diag::new("E100", self.name_span(root), "the root element must be `<mekuru>`"));
            return None;
        }
        self.settings(root);
        let mut tag = self.tag(root);
        tag.attrs.clear();
        Some(tag)
    }

    fn span(&self, n: Node) -> Span {
        span_of(n.range())
    }

    fn name_span(&self, n: Node) -> Span {
        let lo = n.range().start + 1;
        Span::new(lo, lo + n.tag_name().name().len())
    }

    fn start_tag(&self, n: Node) -> Span {
        let r = n.range();
        let bytes = self.src.as_bytes();
        let mut quote = None;
        let mut i = r.start;
        while i < r.end {
            match (quote, bytes[i]) {
                (Some(q), b) if b == q => quote = None,
                (None, b'"' | b'\'') => quote = Some(bytes[i]),
                (None, b'>') => return Span::new(r.start, i + 1),
                _ => {}
            }
            i += 1;
        }
        span_of(r)
    }

    fn tag(&mut self, n: Node) -> Tag {
        let name = n.tag_name().name();
        let children = match name {
            "text" => self.content(n, n.attribute("pre") == Some("true")),
            "mekuru" => self.screen(n),
            "video" | "audio" => self.holds(n),
            "hold" => self.children(n),
            _ if GROUPS.contains(&name) => self.children(n),
            _ => {
                self.leaf(n);
                vec![]
            }
        };
        let attrs = self.attrs(n);
        Tag {
            name: name.to_string(),
            name_span: self.name_span(n),
            head: self.start_tag(n),
            attrs,
            children,
            span: self.span(n),
        }
    }

    fn screen(&mut self, n: Node) -> Vec<Child> {
        let children = self.children(n);
        let groups = children
            .iter()
            .filter(|c| matches!(c, Child::Tag(t) if GROUPS.contains(&t.name.as_str())))
            .count();
        if children.len() != 1 || groups != 1 {
            let span = match children.get(1).or(children.first()) {
                Some(Child::Tag(t)) => t.head,
                _ => self.start_tag(n),
            };
            self.diags.push(Diag::new(
                "E107",
                span,
                "`<mekuru>` holds one group, the screen: put everything in one `<seq>`, `<stack>`, `<row>` or `<column>`",
            ));
        }
        children
    }

    fn holds(&mut self, n: Node) -> Vec<Child> {
        let mut out = vec![];
        for c in n.children() {
            let span = match c.node_type() {
                NodeType::Element if matches!(c.tag_name().name(), "hold" | "cut" | "speed") => {
                    out.push(Child::Tag(self.tag(c)));
                    continue;
                }
                NodeType::Element => self.name_span(c),
                NodeType::Text if !c.text().unwrap_or("").trim().is_empty() => self.trimmed(c),
                _ => continue,
            };
            self.diags.push(Diag::new(
                "E107",
                span,
                format!("`<{}>` can only contain `<hold>`, `<speed>` and `<cut>`", n.tag_name().name()),
            ));
        }
        out
    }

    fn trimmed(&self, c: Node) -> Span {
        let raw = &self.src[c.range()];
        let lo = c.range().start + (raw.len() - raw.trim_start().len());
        let hi = c.range().start + raw.trim_end().len();
        Span::new(lo, hi.max(lo + 1))
    }

    fn children(&mut self, parent: Node) -> Vec<Child> {
        let mut out = vec![];
        for c in parent.children() {
            match c.node_type() {
                NodeType::Element => {
                    if let Some(t) = self.element(c, parent) {
                        out.push(Child::Tag(t));
                    }
                }
                NodeType::Text if !c.text().unwrap_or("").trim().is_empty() => {
                    let msg = format!("text cannot be in `<{}>`: put it in `<text>`", parent.tag_name().name());
                    self.diags.push(Diag::new("E107", self.trimmed(c), msg));
                }
                _ => {}
            }
        }
        out
    }

    fn element(&mut self, n: Node, parent: Node) -> Option<Tag> {
        let name = n.tag_name().name();
        if GROUPS.contains(&name) || LEAVES.contains(&name) {
            return Some(self.tag(n));
        }
        let msg = match name {
            "br" => format!("`<br/>` breaks a line in `<text>`; it cannot be in `<{}>`", parent.tag_name().name()),
            "hold" => format!(
                "`<hold>` goes in the `<video>` or `<audio>` it stops; it cannot be in `<{}>`",
                parent.tag_name().name()
            ),
            "cut" | "speed" => format!(
                "`<{name}>` goes in the `<video>` or `<audio>` it plays; it cannot be in `<{}>`",
                parent.tag_name().name()
            ),
            "mekuru" => "`<mekuru>` is the root; it cannot be inside another element".to_string(),
            _ if name.starts_with(|c: char| c.is_uppercase()) => {
                format!("unknown element `<{name}>`: components are TSX functions; run the script (`bun src/main.tsx`) to write the XML")
            }
            _ => format!(
                "unknown element `<{name}>`{}",
                suggest(name, known_names()).map_or(String::new(), |s| format!(" (did you mean `<{s}>`?)"))
            ),
        };
        let code = if matches!(name, "br" | "mekuru" | "hold" | "cut" | "speed") {
            "E107"
        } else {
            "E300"
        };
        self.diags.push(Diag::new(code, self.name_span(n), msg));
        None
    }

    fn leaf(&mut self, n: Node) {
        for c in n.children() {
            let span = match c.node_type() {
                NodeType::Element => self.span(c),
                NodeType::Text if !c.text().unwrap_or("").trim().is_empty() => self.trimmed(c),
                _ => continue,
            };
            self.diags
                .push(Diag::new("E107", span, format!("`<{}>` cannot contain text or tags", n.tag_name().name())));
        }
    }

    fn content(&mut self, n: Node, pre: bool) -> Vec<Child> {
        let mut run: Vec<Piece> = vec![];
        for c in n.children() {
            match c.node_type() {
                NodeType::Text => run.push(Piece::Text(c.text().unwrap_or("").to_string(), self.span(c))),
                NodeType::Element if c.tag_name().name() == "br" => run.push(Piece::Br(self.span(c))),
                NodeType::Element => self
                    .diags
                    .push(Diag::new("E107", self.name_span(c), "`<text>` can only contain text and `<br/>`")),
                _ => {}
            }
        }
        text_run(&run, pre).map(Child::Text).into_iter().collect()
    }

    fn settings(&mut self, n: Node) {
        for a in n.attributes() {
            let v = a.value().to_string();
            let key_span = span_of(a.range_qname());
            let value_span = span_of(a.range_value());
            match a.name() {
                "size" => match settings::parse_size(&v) {
                    Some((w, h)) => (self.settings.width, self.settings.height) = (w, h),
                    None => self.diags.push(Diag::new("E200", value_span, "`size` must look like 1920x1080")),
                },
                "fps" => match lex::number(&v) {
                    Some(fps) if fps > 0.0 && fps <= 240.0 => self.settings.fps = fps,
                    _ => self.diags.push(Diag::new("E200", value_span, "`fps` must be a number between 0 and 240")),
                },
                "font" => self.settings.fonts = v.split(',').map(|f| f.trim().to_string()).filter(|f| !f.is_empty()).collect(),
                "preset" => self.settings.encode.preset = v,
                "crf" => match v.parse() {
                    Ok(crf) => self.settings.encode.crf = crf,
                    Err(_) => self.diags.push(Diag::new("E200", value_span, "`crf` must be an integer")),
                },
                "audio-bitrate" => self.settings.encode.audio_bitrate = v,
                k => {
                    let hint = did_you_mean(k, SETTING_ATTRS.iter().copied());
                    self.diags.push(Diag::new("E301", key_span, format!("`<mekuru>` has no attribute `{k}`{hint}")));
                }
            }
        }
    }

    fn attrs(&self, n: Node) -> Vec<Attr> {
        let attr = |a: roxmltree::Attribute| Attr {
            key: a.name().to_string(),
            key_span: span_of(a.range_qname()),
            value: a.value().to_string(),
            value_span: span_of(a.range_value()),
            span: span_of(a.range()),
        };
        n.attributes().map(attr).collect()
    }
}

enum Piece {
    Text(String, Span),
    Br(Span),
}

fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{2E80}'..='\u{2FFF}' | '\u{3000}'..='\u{30FF}' | '\u{31F0}'..='\u{31FF}' | '\u{3400}'..='\u{4DBF}'
        | '\u{4E00}'..='\u{9FFF}' | '\u{F900}'..='\u{FAFF}' | '\u{FE30}'..='\u{FE4F}' | '\u{FF00}'..='\u{FFEF}')
}

fn collapse(text: &str) -> String {
    let mut out = String::new();
    let lines: Vec<&str> = text.split('\n').collect();
    let n = lines.len();
    for (i, line) in lines.iter().enumerate() {
        let mut l = *line;
        if i > 0 {
            l = l.trim_start();
        }
        if i + 1 < n {
            l = l.trim_end();
        }
        if l.is_empty() {
            continue;
        }
        if i > 0 && !out.is_empty() {
            let a = out.chars().last();
            let b = l.chars().next();
            let cjk_pair = a.is_some_and(is_cjk) && b.is_some_and(is_cjk);
            if !cjk_pair && !a.is_some_and(char::is_whitespace) {
                out.push(' ');
            }
        }
        out.push_str(l);
    }
    out
}

fn dedent(raw: &str) -> String {
    let mut lines: Vec<&str> = raw.lines().collect();
    while lines.first().is_some_and(|l| l.trim().is_empty()) {
        lines.remove(0);
    }
    while lines.last().is_some_and(|l| l.trim().is_empty()) {
        lines.pop();
    }
    let indent = lines
        .iter()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.len() - l.trim_start_matches(' ').len())
        .min()
        .unwrap_or(0);
    lines.iter().map(|l| l.get(indent..).unwrap_or("").trim_end()).collect::<Vec<_>>().join("\n")
}

fn text_run(run: &[Piece], pre: bool) -> Option<Label> {
    let lo = run.iter().map(|p| match p {
        Piece::Text(_, s) | Piece::Br(s) => s.lo,
    });
    let hi = run.iter().map(|p| match p {
        Piece::Text(_, s) | Piece::Br(s) => s.hi,
    });
    let span = Span { lo: lo.min()?, hi: hi.max()? };
    if pre {
        let raw: String = run
            .iter()
            .map(|p| match p {
                Piece::Text(t, _) => t.as_str(),
                Piece::Br(_) => "\n",
            })
            .collect();
        let text = dedent(&raw);
        return (!text.is_empty()).then(|| Label {
            segs: vec![Seg::Text(text)],
            span,
        });
    }
    let mut segs = vec![];
    let count = run.len();
    for (i, p) in run.iter().enumerate() {
        match p {
            Piece::Text(t, _) => {
                let mut c = collapse(t);
                if i == 0 || matches!(run[i - 1], Piece::Br(_)) {
                    c = c.trim_start().to_string();
                }
                if i + 1 == count || matches!(run[i + 1], Piece::Br(_)) {
                    c = c.trim_end().to_string();
                }
                if !c.is_empty() {
                    segs.push(Seg::Text(lex::strip_ruby(&c)));
                }
            }
            Piece::Br(_) => segs.push(Seg::Break),
        }
    }
    let label = Label { segs, span };
    (!label.segs.is_empty()).then_some(label)
}

fn offset_of(src: &str, row: u32, col: u32) -> usize {
    let mut lo = 0;
    for (i, line) in src.split_inclusive('\n').enumerate() {
        if i + 1 == row as usize {
            return lo + line.char_indices().nth(col.saturating_sub(1) as usize).map_or(line.len(), |(b, _)| b);
        }
        lo += line.len();
    }
    src.len()
}
