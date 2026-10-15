use super::span::{LineIndex, Span};
use std::fmt::Write;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Clone, Debug)]
pub struct Diag {
    pub code: &'static str,
    pub sev: Severity,
    pub span: Span,
    pub msg: String,
}

impl Diag {
    pub fn new(code: &'static str, span: Span, msg: impl Into<String>) -> Self {
        let sev = if code.starts_with('E') { Severity::Error } else { Severity::Warning };
        Diag {
            code,
            sev,
            span,
            msg: msg.into(),
        }
    }

    pub fn is_error(&self) -> bool {
        self.sev == Severity::Error
    }

    pub fn render(&self, file: &str, src: &str, idx: &LineIndex) -> String {
        let line = idx.line(self.span.lo);
        let col = idx.col_chars(src, self.span.lo);
        let sev = match self.sev {
            Severity::Error => "error",
            Severity::Warning => "warning",
        };
        let mut out = format!("{file}:{line}:{col}: {sev}[{}]: {}\n", self.code, self.msg);
        let (lo, hi) = idx.line_range(src, line);
        let text = &src[lo..hi];
        let _ = writeln!(out, "  {line:>4} | {text}");
        out
    }
}

pub fn has_errors(diags: &[Diag]) -> bool {
    diags.iter().any(Diag::is_error)
}

pub fn suggest<'a>(word: &str, candidates: impl IntoIterator<Item = &'a str>) -> Option<&'a str> {
    let mut best: Option<(usize, &str)> = None;
    for c in candidates {
        let d = edit_distance(word, c);
        let limit = (word.chars().count().max(c.chars().count()) / 3).max(1);
        if d <= limit && best.is_none_or(|(bd, _)| d < bd) {
            best = Some((d, c));
        }
    }
    best.map(|(_, c)| c)
}

pub fn did_you_mean<'a>(word: &str, candidates: impl IntoIterator<Item = &'a str>) -> String {
    suggest(word, candidates).map_or(String::new(), |s| format!(" (did you mean `{s}`?)"))
}

fn edit_distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut cur = vec![i + 1; b.len() + 1];
        for (j, cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            cur[j + 1] = (prev[j] + cost).min(prev[j + 1] + 1).min(cur[j] + 1);
        }
        prev = cur;
    }
    prev[b.len()]
}
