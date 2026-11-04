use super::ast::*;
use super::diag::{Diag, did_you_mean, suggest};
use super::lex;
use super::span::Span;
use crate::settings::{self, Settings};
use roxmltree::{Node, NodeType};

const SETTING_ATTRS: &[&str] = &["size", "fps", "font", "preset", "crf", "audio-bitrate"];

fn known_names() -> impl Iterator<Item = &'static str> {
    ["mekuru", "hold", "cut", "speed"]
        .into_iter()
        .chain(Flow::groups())
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
        text: String::new(),
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
            "mekuru" => self.screen(n),
            "video" | "audio" => self.holds(n),
            _ if Flow::of(name).is_some() => self.children(n),
            _ => {
                self.leaf(n);
                vec![]
            }
        };
        let text = match (name, n.attribute("text")) {
            ("text", Some(t)) => t.to_string(),
            _ => String::new(),
        };
        Tag {
            name: name.to_string(),
            name_span: self.name_span(n),
            head: self.start_tag(n),
            attrs: self.attrs(n),
            text,
            children,
            span: self.span(n),
        }
    }

    fn screen(&mut self, n: Node) -> Vec<Tag> {
        let children = self.children(n);
        let groups = children.iter().filter(|t| Flow::of(&t.name).is_some_and(Flow::nests)).count();
        if children.len() != 1 || groups != 1 {
            let span = children.get(1).or(children.first()).map_or_else(|| self.start_tag(n), |t| t.head);
            self.diags.push(Diag::new(
                "E107",
                span,
                "`<mekuru>` holds one group, the screen: put everything in one `<seq>`, `<stack>`, `<row>` or `<column>`",
            ));
        }
        children
    }

    fn holds(&mut self, n: Node) -> Vec<Tag> {
        let mut out = vec![];
        for c in n.children() {
            let span = match c.node_type() {
                NodeType::Element if matches!(c.tag_name().name(), "hold" | "cut" | "speed") => {
                    out.push(self.tag(c));
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

    fn children(&mut self, parent: Node) -> Vec<Tag> {
        let mut out = vec![];
        for c in parent.children() {
            match c.node_type() {
                NodeType::Element => out.extend(self.element(c, parent)),
                NodeType::Text if !c.text().unwrap_or("").trim().is_empty() => {
                    let msg = format!("text cannot be in `<{}>`: write it in `<text text=\"…\"/>`", parent.tag_name().name());
                    self.diags.push(Diag::new("E107", self.trimmed(c), msg));
                }
                _ => {}
            }
        }
        out
    }

    fn element(&mut self, n: Node, parent: Node) -> Option<Tag> {
        let name = n.tag_name().name();
        if Flow::of(name).is_some_and(Flow::nests) || LEAVES.contains(&name) {
            return Some(self.tag(n));
        }
        let parent = parent.tag_name().name();
        let (code, msg) = match name {
            "hold" => (
                "E107",
                format!("`<hold>` goes in the `<video>` or `<audio>` it stops; it cannot be in `<{parent}>`"),
            ),
            "cut" | "speed" => (
                "E107",
                format!("`<{name}>` goes in the `<video>` or `<audio>` it plays; it cannot be in `<{parent}>`"),
            ),
            "mekuru" => ("E107", "`<mekuru>` is the root; it cannot be inside another element".to_string()),
            _ if name.starts_with(|c: char| c.is_uppercase()) => (
                "E300",
                format!("unknown element `<{name}>`: components are TSX functions; run the script (`bun src/main.tsx`) to write the XML"),
            ),
            _ => (
                "E300",
                format!(
                    "unknown element `<{name}>`{}",
                    suggest(name, known_names()).map_or(String::new(), |s| format!(" (did you mean `<{s}>`?)"))
                ),
            ),
        };
        self.diags.push(Diag::new(code, self.name_span(n), msg));
        None
    }

    fn leaf(&mut self, n: Node) {
        let name = n.tag_name().name();
        let hint = if name == "text" { ": write the string in `text`" } else { "" };
        for c in n.children() {
            let span = match c.node_type() {
                NodeType::Element => self.span(c),
                NodeType::Text if !c.text().unwrap_or("").trim().is_empty() => self.trimmed(c),
                _ => continue,
            };
            self.diags
                .push(Diag::new("E107", span, format!("`<{name}>` cannot contain text or tags{hint}")));
        }
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

#[cfg(test)]
mod tests {
    use super::super::diag::Diag;

    fn texts(src: &str) -> (Vec<String>, Vec<Diag>) {
        let (doc, diags) = super::parse(&format!("<mekuru><stack>{src}</stack></mekuru>"));
        let texts = doc
            .root
            .descendants()
            .into_iter()
            .filter(|t| t.name == "text")
            .map(|t| t.text.clone())
            .collect();
        (texts, diags)
    }

    #[test]
    fn text_is_its_attribute_as_written() {
        let (texts, diags) = texts(r#"<text text="｜表示《よみ》と漢字《かんじ》"/><text text="  一行目&#10;  二行目 "/>"#);
        assert!(diags.is_empty(), "{diags:?}");
        assert_eq!(texts, ["｜表示《よみ》と漢字《かんじ》", "  一行目\n  二行目 "]);
    }

    #[test]
    fn text_cannot_contain_text_or_tags() {
        for src in [r#"<text text="a">b</text>"#, r#"<text text="a"><br/></text>"#, r#"<text>a</text>"#] {
            let (_, diags) = texts(src);
            assert!(
                diags.iter().any(|d| d.code == "E107" && d.msg.contains("write the string in `text`")),
                "{src}: {diags:?}"
            );
        }
        let (_, diags) = texts("<text text=\"a\">\n  </text>");
        assert!(diags.is_empty(), "{diags:?}");
    }
}
