use super::span::Span;
use crate::settings::Settings;

#[derive(Clone, Debug)]
pub struct Document {
    pub settings: Settings,
    pub root: Tag,
}

#[derive(Clone, Debug)]
pub struct Tag {
    pub name: String,
    pub name_span: Span,
    pub head: Span,
    pub attrs: Vec<Attr>,
    pub children: Vec<Child>,
    pub span: Span,
}

#[derive(Clone, Debug)]
pub enum Child {
    Tag(Tag),
    Text(Label),
}

impl Tag {
    pub fn text(&self) -> Label {
        let mut segs = vec![];
        let mut span: Option<Span> = None;
        for c in &self.children {
            if let Child::Text(l) = c {
                if !segs.is_empty() && !matches!(segs.last(), Some(Seg::Break)) && !l.segs.is_empty() {
                    segs.push(Seg::Text(" ".into()));
                }
                segs.extend(l.segs.iter().cloned());
                span = Some(span.map_or(l.span, |s| s.to(l.span)));
            }
        }
        Label { segs, span: span.unwrap_or(self.span) }
    }
}

#[derive(Clone, Debug, Default)]
pub struct Label {
    pub segs: Vec<Seg>,
    pub span: Span,
}

impl Label {
    pub fn display(&self) -> String {
        let mut s = String::new();
        for seg in &self.segs {
            match seg {
                Seg::Text(t) => s.push_str(t),
                Seg::Break => s.push('\n'),
            }
        }
        s
    }

    pub fn is_empty(&self) -> bool {
        self.segs.iter().all(|s| matches!(s, Seg::Text(t) if t.trim().is_empty()))
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Seg {
    Text(String),
    Break,
}

#[derive(Clone, Debug)]
pub struct Attr {
    pub key: String,
    pub key_span: Span,
    pub value: String,
    pub value_span: Span,
    pub span: Span,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ValKind {
    Num(f64, Unit),
    Color([u8; 4]),
    Str(String),
    Bool(bool),
    List(Vec<ValKind>),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Unit {
    None,
    Pct,
}
