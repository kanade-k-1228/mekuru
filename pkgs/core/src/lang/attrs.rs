use super::ast::Attr;
use super::diag::{Diag, did_you_mean};
use super::lex;
use super::span::Span;
use crate::ir::{Dur, MediaSrc, Ref, Time};
use crate::settings::{Anchor, Rgba};
use std::path::Path;

pub const TIMES: &[&str] = &["id", "at", "delay", "fadein", "fadeout", "slot", "z", "opacity"];
pub const MEDIA: &[&str] = &["src", "from", "to", "volume"];

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Dim {
    Auto,
    Px(f32),
    Frac(f32),
}

#[derive(Default, Clone, PartialEq)]
pub struct Times {
    pub id: Option<String>,
    pub at: Option<Ref>,
    pub delay: Option<i64>,
    pub fadein: Option<i64>,
    pub fadeout: Option<i64>,
    pub slot: Option<String>,
    pub z: Option<i32>,
    pub opacity: Option<f32>,
}

impl Times {
    pub fn any(&self) -> bool {
        *self != Times::default()
    }

    pub fn time(&self, dur: Dur) -> Time {
        Time {
            at: self.at.clone(),
            delay: self.delay.unwrap_or(0),
            dur,
            fade_in: self.fadein.unwrap_or(0),
            fade_out: self.fadeout.unwrap_or(0),
            slot: self.slot.clone(),
        }
    }
}

pub struct Attrs<'a> {
    name: &'a str,
    span: Span,
    list: Vec<&'a Attr>,
}

impl<'a> Attrs<'a> {
    pub fn new(name: &'a str, known: &[&str], attrs: &'a [Attr], span: Span, diags: &mut Vec<Diag>) -> Attrs<'a> {
        let mut list = vec![];
        for a in attrs {
            if !known.contains(&a.key.as_str()) {
                let hint = did_you_mean(&a.key, known.iter().copied());
                diags.push(Diag::new("E301", a.key_span, format!("`<{name}>` has no attribute `{}`{hint}", a.key)));
                continue;
            }
            list.push(a);
        }
        Attrs { name, span, list }
    }

    pub fn get(&self, key: &str) -> Option<&'a Attr> {
        self.list.iter().rev().find(|a| a.key == key).copied()
    }

    pub fn span(&self, key: &str) -> Span {
        self.get(key).map_or(self.span, |a| a.span)
    }

    /// The value of `key` as `f` reads it; a value it rejects is E303.
    pub fn conv<T>(&self, key: &str, diags: &mut Vec<Diag>, f: impl Fn(&str) -> Result<T, String>) -> Option<T> {
        let a = self.get(key)?;
        match f(&a.value) {
            Ok(v) => Some(v),
            Err(m) => {
                diags.push(Diag::new("E303", a.value_span, format!("`{key}`: {m}")));
                None
            }
        }
    }

    pub fn require(&self, key: &str, diags: &mut Vec<Diag>) -> Option<&'a Attr> {
        let a = self.get(key);
        if a.is_none() {
            diags.push(Diag::new("E302", self.span, format!("`<{}>` requires `{key}`", self.name)));
        }
        a
    }

    /// The number in `key` when `ok` accepts it.
    fn number(&self, key: &str, diags: &mut Vec<Diag>, expected: &str, ok: impl Fn(f64) -> bool) -> Option<f64> {
        self.conv(key, diags, |s| lex::number(s).filter(|n| ok(*n)).ok_or_else(|| expected.into()))
    }

    pub fn num(&self, key: &str, diags: &mut Vec<Diag>) -> Option<f32> {
        self.number(key, diags, "expected a number", |_| true).map(|n| n as f32)
    }

    pub fn int(&self, key: &str, diags: &mut Vec<Diag>) -> Option<i32> {
        self.number(key, diags, "expected an integer", |n| n.fract() == 0.0).map(|n| n as i32)
    }

    pub fn ratio(&self, key: &str, diags: &mut Vec<Diag>) -> Option<f32> {
        self.number(key, diags, "expected a number such as 0.5", |n| n >= 0.0).map(|n| n as f32)
    }

    pub fn frames(&self, key: &str, diags: &mut Vec<Diag>) -> Option<i64> {
        let expected = "expected frames: a whole number from 0, such as 30";
        self.number(key, diags, expected, |n| frames(n).is_some()).map(|n| n as i64)
    }

    pub fn at(&self, diags: &mut Vec<Diag>) -> Option<Ref> {
        self.conv("at", diags, |s| {
            let r = s.split_once(':').and_then(|(id, q)| {
                Some(Ref {
                    target: None,
                    id: id.to_string(),
                    pos: frames(lex::number(q)?)?,
                })
            });
            r.ok_or_else(|| "expected `id:frame`, such as `intro:0` (`delay` puts it off by frames)".into())
        })
    }

    pub fn dim(&self, key: &str, diags: &mut Vec<Diag>) -> Option<Dim> {
        self.conv(key, diags, dim)
    }

    pub fn color(&self, key: &str, diags: &mut Vec<Diag>) -> Option<Rgba> {
        self.conv(key, diags, |s| {
            lex::parse_color(s).ok_or_else(|| "expected a color such as #7FD1AE (write #rgb, #rrggbb or #rrggbbaa)".into())
        })
    }

    pub fn flag(&self, key: &str, diags: &mut Vec<Diag>) -> Option<bool> {
        self.conv(key, diags, |s| match s {
            "true" => Ok(true),
            "false" => Ok(false),
            _ => Err("expected true or false".into()),
        })
    }

    /// What the word in `key` means, with `options` pairing each word with its meaning.
    pub fn pick<T: Copy>(&self, key: &str, diags: &mut Vec<Diag>, options: &[(&str, T)]) -> Option<T> {
        self.conv(key, diags, |s| {
            let words: Vec<&str> = options.iter().map(|(w, _)| *w).collect();
            let found = options.iter().find(|(w, _)| *w == s);
            found.map(|&(_, v)| v).ok_or_else(|| format!("expected one of {}", words.join(", ")))
        })
    }

    pub fn anchor(&self, placed: bool, diags: &mut Vec<Diag>) -> Option<Anchor> {
        let a = self.conv("anchor", diags, |s| {
            Anchor::parse(s).ok_or_else(|| format!("unknown anchor `{s}` (use one of {})", Anchor::NAMES.join(", ")))
        })?;
        if !placed {
            diags.push(Diag::new("W357", self.span("anchor"), "`anchor` only applies with `x` / `y`"));
            return None;
        }
        Some(a)
    }

    pub fn times(&self, diags: &mut Vec<Diag>) -> Times {
        Times {
            id: self.string("id"),
            at: if self.name == "hold" { None } else { self.at(diags) },
            delay: self.frames("delay", diags),
            fadein: self.frames("fadein", diags),
            fadeout: self.frames("fadeout", diags),
            slot: self.string("slot").map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            z: self.int("z", diags),
            opacity: self.ratio("opacity", diags).filter(|o| {
                let ok = *o <= 1.0;
                if !ok {
                    diags.push(Diag::new("E303", self.span("opacity"), "`opacity` must be between 0 and 1"));
                }
                ok
            }),
        }
    }

    pub fn media(&self, base_dir: &Path, diags: &mut Vec<Diag>) -> Option<MediaSrc> {
        let src = self.require("src", diags)?;
        let from = self.frames("from", diags).unwrap_or(0);
        let to = self.frames("to", diags).filter(|&t| {
            if t <= from {
                diags.push(Diag::new("E314", self.span("to"), "`to` must be greater than `from`"));
            }
            t > from
        });
        let volume = self.ratio("volume", diags).unwrap_or(1.0);
        Some(MediaSrc {
            path: base_dir.join(src.value.trim()),
            from,
            to,
            volume,
            speeds: vec![],
        })
    }

    pub fn string(&self, key: &str) -> Option<String> {
        Some(self.get(key)?.value.clone())
    }

    pub fn points(&self, key: &str, diags: &mut Vec<Diag>) -> Option<Vec<(Dim, Dim)>> {
        let a = self.get(key)?;
        let one = |s: &str| dim(s).ok().filter(|d| !matches!(d, Dim::Auto));
        let pts: Option<Vec<_>> = a
            .value
            .split(',')
            .map(|p| p.split_once(':').and_then(|(x, y)| Some((one(x)?, one(y)?))))
            .collect();
        if pts.is_none() {
            diags.push(Diag::new(
                "E303",
                a.value_span,
                format!("`{key}`: expected points such as `0:0,100:50` (x:y in px or %, separated by commas)"),
            ));
        }
        pts
    }
}

fn frames(n: f64) -> Option<i64> {
    (n >= 0.0 && n.fract() == 0.0 && n < 1e15).then_some(n as i64)
}

pub fn dim(s: &str) -> Result<Dim, String> {
    let read = || match s.strip_suffix('%') {
        _ if s == "auto" => Some(Dim::Auto),
        Some(pct) => lex::number(pct).map(|n| Dim::Frac(n as f32 / 100.0)),
        None => lex::number(s).map(|n| Dim::Px(n as f32)),
    };
    read().ok_or_else(|| "expected a length (px, or % of the parent)".into())
}
