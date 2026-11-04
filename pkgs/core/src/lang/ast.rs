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
    /// The text of a `<text>`, with `<br/>` as a line break; other tags have none.
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
