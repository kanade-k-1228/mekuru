use super::span::Span;
use crate::settings::Settings;

#[derive(Clone, Debug)]
pub struct Document {
    pub settings: Settings,
    pub root: Tag,
}

/// What a group tag does with the tags in it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Flow {
    Root,
    Seq,
    Stack,
    Row,
    Column,
    Hold,
    Repeat,
    Dur,
}

const FLOWS: [(&str, Flow); 8] = [
    ("mekuru", Flow::Root),
    ("hold", Flow::Hold),
    ("seq", Flow::Seq),
    ("row", Flow::Row),
    ("column", Flow::Column),
    ("stack", Flow::Stack),
    ("repeat", Flow::Repeat),
    ("dur", Flow::Dur),
];

/// Tags that draw or play something; they hold no group.
pub const LEAVES: &[&str] = &["text", "image", "video", "audio", "rect", "circle", "line"];

impl Flow {
    pub fn of(name: &str) -> Option<Flow> {
        FLOWS.iter().find(|(n, _)| *n == name).map(|&(_, f)| f)
    }

    pub fn name(self) -> &'static str {
        FLOWS.iter().find(|(_, f)| *f == self).map_or("", |(n, _)| n)
    }

    /// Groups that go in other groups: not the root, and not `<hold>`, which goes in media.
    pub fn nests(self) -> bool {
        !matches!(self, Flow::Root | Flow::Hold)
    }

    pub fn groups() -> impl Iterator<Item = &'static str> {
        FLOWS.iter().filter(|(_, f)| f.nests()).map(|(n, _)| *n)
    }
}

#[derive(Clone, Debug)]
pub struct Tag {
    pub name: String,
    pub name_span: Span,
    pub head: Span,
    pub attrs: Vec<Attr>,
    /// The string a `<text>` shows: its `text` attribute as written, with `\n` breaking the line; other tags
    /// have none.
    pub text: String,
    pub children: Vec<Tag>,
    pub span: Span,
}

impl Tag {
    pub fn attribute(&self, name: &str) -> Option<&str> {
        self.attrs.iter().find(|a| a.key == name).map(|a| a.value.as_str())
    }

    pub fn descendants(&self) -> Vec<&Tag> {
        std::iter::once(self).chain(self.children.iter().flat_map(Tag::descendants)).collect()
    }

    pub fn label(&self) -> String {
        std::iter::once(self.text.clone()).chain(self.children.iter().map(Tag::label)).collect()
    }
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
