use super::ast::{Attr, Unit, ValKind};
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

#[derive(Default, Clone)]
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
        self.id.is_some()
            || self.at.is_some()
            || self.delay.is_some()
            || self.fadein.is_some()
            || self.fadeout.is_some()
            || self.slot.is_some()
            || self.z.is_some()
            || self.opacity.is_some()
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

    pub fn val(&self, key: &str, diags: &mut Vec<Diag>) -> Option<(ValKind, Span)> {
        let a = self.get(key)?;
        match lex::value(&a.value) {
            Ok(k) => Some((k, a.value_span)),
            Err(m) => {
                diags.push(Diag::new("E303", a.value_span, format!("`{key}`: {m}")));
                None
            }
        }
    }

    pub fn conv<T>(&self, key: &str, diags: &mut Vec<Diag>, f: impl Fn(&ValKind) -> Result<T, String>) -> Option<T> {
        let (k, span) = self.val(key, diags)?;
        match f(&k) {
            Ok(v) => Some(v),
            Err(m) => {
                diags.push(Diag::new("E303", span, format!("`{key}`: {m}")));
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

    pub fn num(&self, key: &str, diags: &mut Vec<Diag>) -> Option<f32> {
        self.conv(key, diags, |k| match k {
            ValKind::Num(n, Unit::None) => Ok(*n as f32),
            _ => Err("expected a number".into()),
        })
    }

    pub fn int(&self, key: &str, diags: &mut Vec<Diag>) -> Option<i32> {
        self.conv(key, diags, |k| match k {
            ValKind::Num(n, Unit::None) if n.fract() == 0.0 => Ok(*n as i32),
            _ => Err("expected an integer".into()),
        })
    }

    pub fn ratio(&self, key: &str, diags: &mut Vec<Diag>) -> Option<f32> {
        self.conv(key, diags, |k| match k {
            ValKind::Num(n, Unit::None) if *n >= 0.0 => Ok(*n as f32),
            _ => Err("expected a number such as 0.5".into()),
        })
    }

    pub fn frames(&self, key: &str, diags: &mut Vec<Diag>) -> Option<i64> {
        self.conv(key, diags, |k| match k {
            ValKind::Num(n, Unit::None) => frames(*n).ok_or_else(|| "expected frames: a whole number from 0, such as 30".into()),
            _ => Err("expected frames: a whole number from 0, such as 30".into()),
        })
    }

    pub fn at(&self, diags: &mut Vec<Diag>) -> Option<Ref> {
        self.conv("at", diags, |k| {
            let r = match k {
                ValKind::Str(s) => s.split_once(':').and_then(|(id, q)| {
                    Some(Ref {
                        id: id.to_string(),
                        pos: frames(lex::number(q)?)?,
                    })
                }),
                _ => None,
            };
            r.ok_or_else(|| "expected `id:frame`, such as `intro:0` (`delay` puts it off by frames)".into())
        })
    }

    pub fn dim(&self, key: &str, diags: &mut Vec<Diag>) -> Option<Dim> {
        self.conv(key, diags, dim)
    }

    pub fn color(&self, key: &str, diags: &mut Vec<Diag>) -> Option<Rgba> {
        self.conv(key, diags, |k| match k {
            ValKind::Color(c) => Ok(*c),
            _ => Err("expected a color such as #7FD1AE".into()),
        })
    }

    pub fn flag(&self, key: &str, diags: &mut Vec<Diag>) -> Option<bool> {
        self.conv(key, diags, |k| match k {
            ValKind::Bool(b) => Ok(*b),
            _ => Err("expected true or false".into()),
        })
    }

    pub fn word(&self, key: &str, diags: &mut Vec<Diag>, opts: &[&str]) -> Option<String> {
        self.conv(key, diags, |k| match k {
            ValKind::Str(s) if opts.is_empty() || opts.contains(&s.as_str()) => Ok(s.clone()),
            _ => Err(format!("expected one of {}", opts.join(", "))),
        })
    }

    pub fn anchor(&self, placed: bool, diags: &mut Vec<Diag>) -> Option<Anchor> {
        let a = self.conv("anchor", diags, |k| match k {
            ValKind::Str(s) => Anchor::parse(s).ok_or_else(|| format!("unknown anchor `{s}` (use one of {})", Anchor::NAMES.join(", "))),
            _ => Err("expected an anchor".into()),
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
        let one = |s: &str| match lex::value(s) {
            Ok(k) => dim(&k).ok().filter(|d| !matches!(d, Dim::Auto)),
            Err(_) => None,
        };
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

pub fn dim(k: &ValKind) -> Result<Dim, String> {
    match k {
        ValKind::Num(n, Unit::None) => Ok(Dim::Px(*n as f32)),
        ValKind::Num(n, Unit::Pct) => Ok(Dim::Frac(*n as f32 / 100.0)),
        ValKind::Str(s) if s == "auto" => Ok(Dim::Auto),
        _ => Err("expected a length (px, or % of the parent)".into()),
    }
}
