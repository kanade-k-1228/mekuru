use super::{EPS, SrcSeg};
use crate::{
    ir::*,
    media::{Fps, probe::MediaProbe},
};

#[derive(Clone, Copy)]
pub(super) struct Clock {
    pub(super) from: f64,
    pub(super) to: f64,
}

fn clock(e: &Elem, probe: Option<MediaProbe>, fps: Fps) -> Option<Clock> {
    let (from, to, len) = match &e.kind {
        ElemKind::Video(VideoSpec { media: m, .. }) | ElemKind::Audio(AudioSpec { media: m }) => {
            (m.from as f64, m.to, probe.map_or(0.0, |p| fps.of(p.duration)))
        }
        ElemKind::DraftAudio | ElemKind::View(_) => return None,
    };
    Some(Clock {
        from,
        to: to.map_or(len, |t| t as f64).min(len).max(from),
    })
}

fn paces(e: &Elem, c: Option<Clock>) -> Vec<(f64, f64, f64)> {
    let (Some(m), Some(c)) = (e.kind.media(), c) else { return vec![] };
    let at = |p: Option<i64>, or: f64| p.map_or(or, |p| p as f64);
    let parts: Vec<(f64, f64, f64)> = m
        .speeds
        .iter()
        .map(|p| (at(p.from, c.from).max(c.from), at(p.to, c.to).min(c.to), p.rate))
        .filter(|p| p.1 > p.0 + EPS)
        .collect();
    let mut marks: Vec<f64> = parts.iter().flat_map(|p| [p.0, p.1]).collect();
    marks.sort_by(f64::total_cmp);
    marks.dedup_by(|a, b| (*a - *b).abs() <= EPS);
    let mut out: Vec<(f64, f64, f64)> = vec![];
    for w in marks.windows(2) {
        let (a, b) = (w[0], w[1]);
        let mid = (a + b) / 2.0;
        let rate: f64 = parts.iter().filter(|p| p.0 <= mid && mid < p.1).map(|p| p.2).product();
        match out.last_mut() {
            _ if (rate - 1.0).abs() <= EPS => {}
            Some(l) if (l.1 - a).abs() <= EPS && l.2 == rate => l.1 = b,
            _ => out.push((a, b, rate)),
        }
    }
    out
}

fn runs(paces: &[(f64, f64, f64)], a: f64, b: f64) -> Vec<(f64, f64, f64)> {
    let (mut out, mut p) = (vec![], a);
    for &(x, y, r) in paces.iter().filter(|q| q.1 > a + EPS && q.0 < b - EPS) {
        if x > p + EPS {
            out.push((p, x, 1.0));
        }
        let e = y.min(b);
        out.push((p.max(x), e, r));
        p = e;
    }
    if b > p + EPS {
        out.push((p, b, 1.0));
    }
    out
}

pub(super) struct MediaTiming {
    pub(super) probe: Option<MediaProbe>,
    pub(super) clock: Option<Clock>,
    paces: Vec<(f64, f64, f64)>,
}

impl MediaTiming {
    pub(super) fn new(element: &Elem, probe: Option<MediaProbe>, fps: Fps) -> Self {
        let clock = clock(element, probe, fps);
        Self {
            probe,
            clock,
            paces: paces(element, clock),
        }
    }
    pub(super) fn played(&self, a: f64, b: f64) -> f64 {
        self.paces.iter().fold(b - a, |u, &(x, y, r)| {
            let o = (y.min(b) - x.max(a)).max(0.0);
            u - o + o / r
        })
    }

    fn waits_at(&self, q: f64) -> f64 {
        self.paces
            .iter()
            .find(|p| p.2.is_infinite() && p.0 <= q + EPS && q <= p.1 + EPS)
            .map_or(q, |p| p.1.max(q))
    }

    pub(super) fn segments(&self, c: Clock, start: i64, end: i64, holds: impl Iterator<Item = (i64, i64)>) -> Vec<SrcSeg> {
        let end = end as f64;
        let mut segs: Vec<SrcSeg> = vec![];
        let add = |segs: &mut Vec<SrcSeg>, t0: f64, t1: f64, s0: f64, rate: f64| {
            let t1 = t1.min(end);
            if t1 <= t0 + EPS {
                return;
            }
            match segs.last_mut() {
                Some(g) if g.rate == rate && (g.t1 - t0).abs() <= EPS && (g.s0 + g.rate * (g.t1 - g.t0) - s0).abs() <= EPS => g.t1 = t1,
                _ => segs.push(SrcSeg { t0, t1, s0, rate }),
            }
        };
        let play = |segs: &mut Vec<SrcSeg>, t: f64, pos: f64, q: f64| {
            runs(&self.paces, pos, q).into_iter().fold(t, |t, (a, b, r)| {
                let dt = (b - a) / r;
                add(segs, t, t + dt, a, r);
                t + dt
            })
        };
        let (mut t, mut pos) = (start as f64, c.from);
        for (at, hold_end) in holds {
            let q = self.waits_at(at as f64).max(pos);
            let arrive = play(&mut segs, t, pos, q);
            let resume = arrive.max(hold_end as f64);
            add(&mut segs, arrive, resume, q, 0.0);
            (t, pos) = (resume, q);
        }
        let arrive = play(&mut segs, t, pos, c.to);
        add(&mut segs, arrive, f64::INFINITY, c.to, 0.0);
        segs
    }
}
