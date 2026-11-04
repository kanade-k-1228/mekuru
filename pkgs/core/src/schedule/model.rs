use super::*;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SrcSeg {
    pub t0: f64,
    pub t1: f64,
    pub s0: f64,
    pub rate: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SrcMap {
    pub segs: Vec<SrcSeg>,
    pub from: f64,
    pub end: f64,
}

impl SrcMap {
    pub fn at(&self, t: f64) -> f64 {
        let i = self.segs.partition_point(|s| s.t0 <= t + EPS);
        let seg = self.segs.get(i.saturating_sub(1));
        let pos = seg.map_or(self.from, |s| s.s0 + s.rate * (t - s.t0).max(0.0));
        pos.min(self.end)
    }

    pub fn freezes(&self) -> impl Iterator<Item = (f64, f64)> + '_ {
        self.segs
            .iter()
            .filter(|g| g.rate == 0.0 && (up(g.t0) as f64) < g.t1 - EPS)
            .map(|g| (g.t0, g.t1))
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct NodeTime {
    pub start: i64,
    pub end: i64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Fade {
    pub start: f64,
    pub end: f64,
    pub fade_in: f64,
    pub fade_out: f64,
    pub level: usize,
}

impl Fade {
    pub(super) fn shifted(self, by: f64) -> Fade {
        Fade {
            start: self.start + by,
            end: self.end + by,
            level: 0,
            ..self
        }
    }

    pub fn at(&self, t: f64) -> f64 {
        let mut a = 1.0f64;
        if self.fade_in > EPS {
            a = a.min((t - self.start) / self.fade_in);
        }
        if self.fade_out > EPS {
            a = a.min((self.end - t) / self.fade_out);
        }
        a.clamp(0.0, 1.0)
    }
}

/// The fades, shortened in proportion (with W553) when together they are longer than `span`.
pub(super) fn fit_fades(fade_in: i64, fade_out: i64, span: i64, site: Span, diags: &mut Vec<Diag>) -> (f64, f64) {
    let (fi, fo) = (fade_in as f64, fade_out as f64);
    if fade_in + fade_out > span && span > 0 {
        diags.push(Diag::new("W553", site, "fades are longer than the element is shown; they were shortened"));
        let k = span as f64 / (fi + fo);
        (fi * k, fo * k)
    } else {
        (fi, fo)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Repeat {
    pub from: i64,
    pub period: i64,
    pub until: i64,
}

impl Repeat {
    pub fn first_round(&self, t: f64) -> Option<f64> {
        let (from, until) = (self.from as f64, self.until as f64);
        (from <= t && t < until).then(|| from + (t - from).rem_euclid(self.period as f64))
    }
}

#[derive(Clone, Debug, Default)]
pub struct ElemTime {
    pub start: i64,
    pub end: i64,
    pub fade_in: f64,
    pub fade_out: f64,
    pub outer: Vec<Fade>,
    pub src: Option<SrcMap>,
    pub repeat: Vec<Repeat>,
    pub hidden: Vec<(i64, i64)>,
}

impl ElemTime {
    pub fn rounds(&self, t: f64) -> Option<Vec<f64>> {
        let mut out = vec![t];
        for r in &self.repeat {
            out.push(r.first_round(*out.last()?)?);
        }
        Some(out)
    }

    pub fn local(&self, t: f64) -> Option<f64> {
        self.repeat.iter().try_fold(t, |u, r| r.first_round(u))
    }

    pub fn active(&self, t: f64) -> bool {
        let within = |a: i64, b: i64, u: f64| a as f64 <= u && u < b as f64;
        self.local(t).is_some_and(|u| within(self.start, self.end, u)) && !self.hidden.iter().any(|&(a, b)| within(a, b, t))
    }

    pub(super) fn own_fade(&self) -> Fade {
        Fade {
            start: self.start as f64,
            end: self.end as f64,
            fade_in: self.fade_in,
            fade_out: self.fade_out,
            level: self.repeat.len(),
        }
    }

    pub fn fades(&self) -> Vec<Fade> {
        std::iter::once(self.own_fade()).chain(self.outer.iter().copied()).collect()
    }

    pub fn envelope(&self, t: f64) -> f64 {
        let Some(u) = self.rounds(t) else { return 0.0 };
        self.fades().iter().map(|f| f.at(u[f.level])).product()
    }
}

pub(super) fn unroll(chain: &[Repeat], a: f64, b: f64) -> Vec<(f64, f64, Vec<f64>)> {
    let mut out = vec![(a, b, vec![0.0; chain.len() + 1])];
    for (level, r) in chain.iter().enumerate().rev() {
        let mut next = vec![];
        for (a, b, shift) in out {
            let mut k = 0;
            while r.from + k * r.period < r.until {
                let by = (k * r.period) as f64;
                let (x, y) = (a + by, (b + by).min(r.until as f64));
                if y > x + EPS {
                    let mut shift = shift.clone();
                    shift[level + 1..].iter_mut().for_each(|s| *s += by);
                    next.push((x, y, shift));
                }
                k += 1;
            }
        }
        out = next;
    }
    out.into_iter().map(|(a, b, shift)| (a, b - a, shift)).collect()
}

pub(super) fn merge(mut v: Vec<(i64, i64)>) -> Vec<(i64, i64)> {
    v.sort();
    let mut out: Vec<(i64, i64)> = Vec::with_capacity(v.len());
    for (a, b) in v {
        match out.last_mut() {
            Some(last) if a <= last.1 => last.1 = last.1.max(b),
            _ => out.push((a, b)),
        }
    }
    out
}

#[derive(Clone, Debug, PartialEq)]
pub struct AudioClip {
    pub elem: ElemId,
    pub at: f64,
    pub len: f64,
    pub src: f64,
    pub rate: f64,
    pub gain: f32,
    pub env: Vec<Fade>,
}

#[derive(Clone, Debug, Default)]
pub struct Schedule {
    pub total: i64,
    pub nodes: Vec<NodeTime>,
    pub elems: Vec<ElemTime>,
    pub audio: Vec<AudioClip>,
    pub diags: Vec<Diag>,
}

impl Schedule {
    pub(super) fn failed(s: &Script, diags: Vec<Diag>) -> Schedule {
        Schedule {
            nodes: vec![NodeTime::default(); s.nodes.len()],
            elems: vec![ElemTime::default(); s.elems.len()],
            diags,
            ..Schedule::default()
        }
    }
}
