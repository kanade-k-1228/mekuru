use crate::ir::*;
use crate::lang::diag::Diag;
use crate::lang::span::Span;
use crate::media::Fps;
use std::collections::{BTreeMap, BTreeSet};

pub const EPS: f64 = 1e-6;
const NONE: i64 = i64::MIN / 4;

fn up(frames: f64) -> i64 {
    (frames - EPS).ceil() as i64
}

fn show(frames: f64) -> String {
    if frames.fract() == 0.0 { format!("{frames}") } else { format!("{frames:.2}") }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MediaInfo {
    pub len: f64,
    pub has_audio: bool,
}

pub trait MediaDb {
    fn info(&self, e: &Elem) -> Option<MediaInfo>;
}

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
        self.segs.iter().filter(|g| g.rate == 0.0 && (up(g.t0) as f64) < g.t1 - EPS).map(|g| (g.t0, g.t1))
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
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
    fn shifted(self, by: f64) -> Fade {
        Fade { start: self.start + by, end: self.end + by, level: 0, ..self }
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

fn fit_fades(fade_in: i64, fade_out: i64, span: i64) -> ((f64, f64), bool) {
    let (fi, fo) = (fade_in as f64, fade_out as f64);
    if fade_in + fade_out > span && span > 0 {
        let k = span as f64 / (fi + fo);
        ((fi * k, fo * k), true)
    } else {
        ((fi, fo), false)
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

#[derive(Clone, Debug)]
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

    fn own_fade(&self) -> Fade {
        Fade { start: self.start as f64, end: self.end as f64, fade_in: self.fade_in, fade_out: self.fade_out, level: self.repeat.len() }
    }

    pub fn fades(&self) -> Vec<Fade> {
        std::iter::once(self.own_fade()).chain(self.outer.iter().copied()).collect()
    }

    pub fn envelope(&self, t: f64) -> f64 {
        let Some(u) = self.rounds(t) else { return 0.0 };
        self.fades().iter().map(|f| f.at(u[f.level])).product()
    }
}

fn unroll(chain: &[Repeat], a: f64, b: f64) -> Vec<(f64, f64, Vec<f64>)> {
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

fn merge(mut v: Vec<(i64, i64)>) -> Vec<(i64, i64)> {
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
    fn failed(s: &Script, diags: Vec<Diag>) -> Schedule {
        let nothing = ElemTime { start: 0, end: 0, fade_in: 0.0, fade_out: 0.0, outer: vec![], src: None, repeat: vec![], hidden: vec![] };
        Schedule { total: 0, nodes: vec![NodeTime { start: 0, end: 0 }; s.nodes.len()], elems: vec![nothing; s.elems.len()], audio: vec![], diags }
    }
}

struct Edge {
    from: usize,
    to: usize,
    w: i64,
    cause: Option<Target>,
}

struct Graph {
    base: Vec<i64>,
    edges: Vec<Edge>,
}

impl Graph {
    fn add(&mut self, from: usize, to: usize, w: i64, cause: Option<Target>) {
        self.edges.push(Edge { from, to, w, cause });
    }

    fn solve(&self) -> (Vec<i64>, Vec<bool>) {
        let n = self.base.len();
        let mut waits = vec![0usize; n];
        let mut out = vec![vec![]; n];
        for (k, e) in self.edges.iter().enumerate() {
            waits[e.to] += 1;
            out[e.from].push(k);
        }
        let mut val = self.base.clone();
        let mut done = vec![false; n];
        let mut ready: Vec<usize> = (0..n).filter(|&v| waits[v] == 0).collect();
        while let Some(v) = ready.pop() {
            done[v] = true;
            for &k in &out[v] {
                let e = &self.edges[k];
                val[e.to] = val[e.to].max(val[v] + e.w);
                waits[e.to] -= 1;
                if waits[e.to] == 0 {
                    ready.push(e.to);
                }
            }
        }
        (val, done)
    }

    fn loops(&self, done: &[bool]) -> BTreeSet<Target> {
        let left = |e: &Edge| !done[e.from] && !done[e.to];
        let mut out = vec![vec![]; self.base.len()];
        for e in self.edges.iter().filter(|e| left(e)) {
            out[e.from].push(e.to);
        }
        let mut found = BTreeSet::new();
        for e in self.edges.iter().filter(|e| left(e)) {
            let Some(x) = e.cause.filter(|x| !found.contains(x)) else { continue };
            let mut seen = vec![false; self.base.len()];
            let mut todo = vec![e.to];
            while let Some(v) = todo.pop() {
                if v == e.from {
                    found.insert(x);
                    break;
                }
                if !std::mem::replace(&mut seen[v], true) {
                    todo.extend(&out[v]);
                }
            }
        }
        found
    }
}

#[derive(Clone, Copy)]
struct Clock {
    from: f64,
    to: f64,
}

fn clock(e: &Elem, info: Option<MediaInfo>, fps: Fps) -> Option<Clock> {
    let (from, to, len) = match &e.kind {
        ElemKind::Video(VideoSpec { media: m, .. }) | ElemKind::Audio(AudioSpec { media: m }) => (m.from as f64, m.to, info.map_or(0.0, |i| fps.of(i.len))),
        ElemKind::DraftAudio | ElemKind::View(_) => return None,
    };
    Some(Clock { from, to: to.map_or(len, |t| t as f64).min(len).max(from) })
}

fn paces(e: &Elem, c: Option<Clock>) -> Vec<(f64, f64, f64)> {
    let (Some(m), Some(c)) = (e.kind.media(), c) else { return vec![] };
    let at = |p: Option<i64>, or: f64| p.map_or(or, |p| p as f64);
    let parts: Vec<(f64, f64, f64)> =
        m.speeds.iter().map(|p| (at(p.from, c.from).max(c.from), at(p.to, c.to).min(c.to), p.rate)).filter(|p| p.1 > p.0 + EPS).collect();
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

#[derive(Clone, Copy)]
enum V {
    Start,
    End,
    Flow,
}

fn targets(s: &Script) -> impl Iterator<Item = Target> + '_ {
    (0..s.nodes.len()).map(Target::Node).chain((0..s.elems.len()).map(Target::Elem))
}

pub fn schedule(s: &Script, m: &dyn MediaDb) -> Schedule {
    let fps = s.settings.rate();
    let info: Vec<Option<MediaInfo>> = s.elems.iter().map(|e| m.info(e)).collect();
    let clocks: Vec<Option<Clock>> = s.elems.iter().zip(&info).map(|(e, i)| clock(e, *i, fps)).collect();
    let paces = s.elems.iter().zip(&clocks).map(|(e, c)| paces(e, *c)).collect();
    let mut holds: BTreeMap<ElemId, Vec<(i64, NodeId)>> = BTreeMap::new();
    for n in &s.nodes {
        if let Some(h) = n.hold {
            holds.entry(h.media).or_default().push((h.at, n.id));
        }
    }
    for list in holds.values_mut() {
        list.sort();
    }
    let all = s.nodes.len() + s.elems.len();
    let mut solver = Solver {
        s,
        info,
        clocks,
        paces,
        holds,
        diags: vec![],
        val: vec![],
        shown: vec![(0, 0); all],
        dropped: vec![false; all],
        inner: vec![0; s.nodes.len()],
        round: vec![None; s.nodes.len()],
    };
    let g = solver.graph();
    let (val, done) = g.solve();
    if done.contains(&false) {
        solver.loops(&g, &done);
        return Schedule::failed(s, solver.diags);
    }
    solver.val = val;
    solver.intervals();
    solver.unreached();
    solver.past();
    solver.finish()
}

struct Solver<'a> {
    s: &'a Script,
    info: Vec<Option<MediaInfo>>,
    clocks: Vec<Option<Clock>>,
    paces: Vec<Vec<(f64, f64, f64)>>,
    holds: BTreeMap<ElemId, Vec<(i64, NodeId)>>,
    diags: Vec<Diag>,
    val: Vec<i64>,
    shown: Vec<(i64, i64)>,
    dropped: Vec<bool>,
    inner: Vec<i64>,
    round: Vec<Option<i64>>,
}

impl<'a> Solver<'a> {
    fn ix(&self, x: Target) -> usize {
        match x {
            Target::Node(n) => n,
            Target::Elem(e) => self.s.nodes.len() + e,
        }
    }

    fn var(&self, x: Target, v: V) -> usize {
        3 * self.ix(x) + v as usize
    }

    fn time(&self, x: Target) -> &'a Time {
        match x {
            Target::Node(n) => &self.s.nodes[n].t,
            Target::Elem(e) => &self.s.elems[e].t,
        }
    }

    fn timed(&self, x: Target) -> bool {
        self.time(x).timed()
    }

    fn within(&self, x: Target) -> Option<Target> {
        match x {
            Target::Node(n) => match self.s.nodes[n].hold {
                Some(h) => Some(Target::Elem(h.media)),
                None => self.s.nodes[n].parent.map(Target::Node),
            },
            Target::Elem(e) => Some(Target::Node(self.s.elems[e].node)),
        }
    }

    fn until(&self, x: Target) -> i64 {
        match x {
            Target::Node(n) => self.inner[n],
            Target::Elem(_) => self.shown[self.ix(x)].1,
        }
    }

    fn site(&self, x: Target) -> Span {
        match x {
            Target::Node(n) => self.s.nodes[n].head,
            Target::Elem(e) => self.s.elems[e].site,
        }
    }

    fn clock(&self, x: Target) -> Option<(ElemId, Clock)> {
        match x {
            Target::Elem(e) => self.clocks[e].map(|c| (e, c)),
            Target::Node(_) => None,
        }
    }

    fn holds_of(&self, media: ElemId) -> &[(i64, NodeId)] {
        self.holds.get(&media).map_or(&[], Vec::as_slice)
    }

    fn played(&self, v: ElemId, a: f64, b: f64) -> f64 {
        self.paces[v].iter().fold(b - a, |u, &(x, y, r)| {
            let o = (y.min(b) - x.max(a)).max(0.0);
            u - o + o / r
        })
    }

    fn waits_at(&self, v: ElemId, q: f64) -> f64 {
        self.paces[v].iter().find(|p| p.2.is_infinite() && p.0 <= q + EPS && q <= p.1 + EPS).map_or(q, |p| p.1.max(q))
    }

    fn reference(&self, x: Target) -> Option<(&'a str, Target, i64)> {
        let r = self.time(x).at.as_ref()?;
        Some((r.id.as_str(), *self.s.ids.get(&r.id)?, r.pos))
    }

    fn loops(&mut self, g: &Graph, done: &[bool]) {
        let found = g.loops(done);
        for &x in &found {
            self.diags.push(Diag::new("E510", self.site(x), "this never starts: what its `at` waits for comes only after this (they wait for each other)"));
        }
        if found.is_empty() {
            self.diags.push(Diag::new("E510", Span::default(), "the times wait for each other"));
        }
    }

    fn graph(&self) -> Graph {
        let s = self.s;
        let mut g = Graph { base: vec![NONE; 3 * (s.nodes.len() + s.elems.len())], edges: vec![] };
        g.base[self.var(Target::Node(0), V::Start)] = 0;
        for n in &s.nodes {
            let mut before = None;
            for &c in &n.order {
                match before {
                    Some(b) if n.kind.chains() => {
                        g.add(self.var(b, V::Flow), self.var(c, V::Flow), 0, None);
                        if self.timed(b) {
                            g.add(self.var(b, V::End), self.var(c, V::Flow), 0, None);
                        }
                    }
                    _ => g.add(self.var(Target::Node(n.id), V::Start), self.var(c, V::Flow), 0, None),
                }
                before = Some(c);
            }
        }
        for x in targets(s).skip(1) {
            self.start(&mut g, x);
        }
        for x in targets(s) {
            self.end(&mut g, x);
        }
        g
    }

    fn start(&self, g: &mut Graph, x: Target) {
        let s = self.var(x, V::Start);
        g.add(self.var(x, V::Flow), s, self.time(x).delay, None);
        if let Target::Node(n) = x
            && let Some(h) = self.s.nodes[n].hold
        {
            self.arrival(g, Target::Elem(h.media), h.at as f64, s, None, false);
        }
        if let Some((_, y, q)) = self.reference(x) {
            self.arrival(g, y, q as f64, s, Some(x), false);
        }
    }

    fn end(&self, g: &mut Graph, x: Target) {
        let (s, e) = (self.var(x, V::Start), self.var(x, V::End));
        match (self.time(x).dur, x) {
            (Dur::Len(d), _) => g.add(s, e, d, None),
            (Dur::Fill, _) => {}
            (Dur::Own, Target::Node(n)) => {
                g.add(s, e, 0, None);
                for &c in self.s.nodes[n].order.iter().filter(|&&c| self.timed(c)) {
                    g.add(self.var(c, V::End), e, 0, None);
                }
            }
            (Dur::Own, Target::Elem(v)) => match self.clocks[v] {
                Some(c) => self.arrival(g, x, c.to, e, None, true),
                None => g.add(s, e, 0, None),
            },
        }
    }

    fn arrival(&self, g: &mut Graph, y: Target, q: f64, to: usize, cause: Option<Target>, end: bool) {
        let start = self.var(y, V::Start);
        let Some((v, c)) = self.clock(y) else { return g.add(start, to, up(q), cause) };
        g.add(start, to, up(self.played(v, c.from, q)), cause);
        for &(at, h) in self.holds_of(v).iter().filter(|(at, _)| (*at as f64) < q || (end && *at as f64 <= q)) {
            g.add(self.var(Target::Node(h), V::End), to, up(self.played(v, at as f64, q)), cause);
        }
    }

    fn arrival_at(&self, y: Target, q: i64) -> i64 {
        let start = self.val[self.var(y, V::Start)];
        let Some((v, c)) = self.clock(y) else { return start + q };
        let q = q as f64;
        let before = self.holds_of(v).iter().filter(|(at, _)| (*at as f64) < q);
        before.fold(start + up(self.played(v, c.from, q)), |t, &(at, h)| t.max(self.val[self.var(Target::Node(h), V::End)] + up(self.played(v, at as f64, q))))
    }

    fn intervals(&mut self) {
        let total = self.val[self.var(Target::Node(0), V::End)].max(0);
        (self.shown[0], self.dropped[0], self.inner[0]) = ((0, total), false, total);
        self.visit(0);
    }

    fn visit(&mut self, n: NodeId) {
        let s = self.s;
        for &c in &s.nodes[n].order {
            self.clip(c, Target::Node(n));
            match c {
                Target::Node(c) => self.inside(c),
                Target::Elem(e) => {
                    let holds: Vec<NodeId> = self.holds_of(e).iter().map(|h| h.1).collect();
                    for h in holds {
                        self.clip(Target::Node(h), c);
                        self.inside(h);
                    }
                }
            }
        }
    }

    fn inside(&mut self, n: NodeId) {
        let node = &self.s.nodes[n];
        let (start, end) = self.shown[n];
        let longest = node.order.iter().filter(|&&c| self.timed(c)).map(|&c| self.val[self.var(c, V::End)]).max();
        let round = longest.map(|l| l - start).filter(|_| node.kind == NodeKind::Repeat);
        self.round[n] = round;
        self.inner[n] = round.map_or(end, |r| end.min(start + r));
        self.visit(n);
    }

    fn clip(&mut self, x: Target, within: Target) {
        let (s, e, until) = (self.val[self.var(x, V::Start)], self.val[self.var(x, V::End)], self.until(within));
        let i = self.ix(x);
        let late = s > until || (s >= until && self.timed(x) && e > s);
        self.dropped[i] = self.dropped[self.ix(within)] || late;
        self.shown[i] = if self.dropped[i] {
            (s.min(until), s.min(until))
        } else {
            (s, if self.timed(x) { e.min(until).max(s) } else { until })
        };
    }

    fn placed(&self, x: Target) -> bool {
        let Some(p) = self.within(x) else { return true };
        !self.dropped[self.ix(p)] && self.val[self.var(x, V::Flow)] <= self.until(p)
    }

    fn unreached(&mut self) {
        let mut found = vec![];
        for x in targets(self.s).filter(|&x| self.placed(x)) {
            let Some((id, y, q)) = self.reference(x) else { continue };
            let msg = if self.dropped[self.ix(y)] {
                format!("this never starts: `{id}` is never shown")
            } else if let Some((_, c)) = self.clock(y)
                && ((q as f64) < c.from || q as f64 > c.to)
            {
                format!("`{id}` never gets to frame {q}: it plays its source from frame {} to {}", show(c.from), show(c.to))
            } else if self.arrival_at(y, q) > self.shown[self.ix(y)].1 {
                let (start, end) = self.shown[self.ix(y)];
                format!("`{id}` never gets to frame {q}: it is shown for {} frames", end - start)
            } else {
                continue;
            };
            found.push(Diag::new("E504", self.site(x), msg));
        }
        for n in &self.s.nodes {
            if let Some(h) = n.hold
                && let Some(c) = self.clocks[h.media]
                && ((h.at as f64) < c.from || h.at as f64 > c.to)
            {
                found.push(Diag::new("E504", n.head, format!("the media never gets to frame {}: it plays its source from frame {} to {}", h.at, show(c.from), show(c.to))));
            }
        }
        for (e, c) in self.s.elems.iter().zip(&self.clocks) {
            let (Some(m), Some(c)) = (e.kind.media(), c) else { continue };
            for p in &m.speeds {
                let (a, b) = (p.from.map_or(c.from, |a| a as f64), p.to.map_or(c.to, |b| b as f64));
                if b.min(c.to) <= a.max(c.from) {
                    found.push(Diag::new("E504", p.site, format!("the media never plays frames {} to {}: it plays its source from frame {} to {}", show(a), show(b), show(c.from), show(c.to))));
                }
            }
        }
        self.diags.extend(found);
    }

    fn past(&mut self) {
        let late: Vec<Target> = targets(self.s)
            .filter(|&x| self.placed(x))
            .filter(|&x| {
                let ready = self.val[self.var(x, V::Flow)] + self.time(x).delay;
                self.reference(x).is_some_and(|(_, y, q)| !self.dropped[self.ix(y)] && self.arrival_at(y, q) < ready)
            })
            .collect();
        for x in late {
            let at = self.time(x).at.as_ref().expect("a reference");
            self.diags.push(Diag::new("W550", self.site(x), format!("`at=\"{at}\"` is already past when this could start; it starts right away")));
        }
    }

    fn segments(&self, v: ElemId, c: Clock, start: i64, end: i64) -> Vec<SrcSeg> {
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
            runs(&self.paces[v], pos, q).into_iter().fold(t, |t, (a, b, r)| {
                let dt = (b - a) / r;
                add(segs, t, t + dt, a, r);
                t + dt
            })
        };
        let (mut t, mut pos) = (start as f64, c.from);
        for &(at, h) in self.holds_of(v) {
            let q = self.waits_at(v, at as f64).max(pos);
            let arrive = play(&mut segs, t, pos, q);
            let resume = arrive.max(self.val[self.var(Target::Node(h), V::End)] as f64);
            add(&mut segs, arrive, resume, q, 0.0);
            (t, pos) = (resume, q);
        }
        let arrive = play(&mut segs, t, pos, c.to);
        add(&mut segs, arrive, f64::INFINITY, c.to, 0.0);
        segs
    }

    fn finish(mut self) -> Schedule {
        let s = self.s;
        let nodes: Vec<NodeTime> = self.shown[..s.nodes.len()].iter().map(|&(start, end)| NodeTime { start, end }).collect();
        let total = nodes[0].end;
        let mut repeats: Vec<Vec<Repeat>> = vec![vec![]; s.nodes.len()];
        for n in &s.nodes {
            let nt = nodes[n.id];
            let mut chain = n.parent.map_or_else(Vec::new, |p| repeats[p].clone());
            if let Some(period) = self.round[n.id].filter(|&r| r > 0 && nt.end > nt.start + r) {
                chain.push(Repeat { from: nt.start, period, until: nt.end });
            }
            repeats[n.id] = chain;
        }
        let level = |n: &Node| n.parent.map_or(0, |p| repeats[p].len());
        let mut fades: Vec<Option<Fade>> = vec![None; s.nodes.len()];
        for n in &s.nodes {
            let nt = nodes[n.id];
            if n.t.fade_in + n.t.fade_out <= 0 {
                continue;
            }
            let (fade_in, fade_out) = self.fit_fades(n.t.fade_in, n.t.fade_out, nt.end - nt.start, n.head);
            fades[n.id] = Some(Fade { start: nt.start as f64, end: nt.end as f64, fade_in, fade_out, level: level(n) });
        }
        let outer = |mut n: Option<NodeId>| {
            let mut out = vec![];
            while let Some(i) = n {
                out.extend(fades[i]);
                n = s.nodes[i].parent;
            }
            out
        };
        let hidden = self.hidden();
        let hidden_in = |e: &Elem| {
            let mut out = hidden.get(&Target::Elem(e.id)).cloned().unwrap_or_default();
            let mut n = Some(e.node);
            while let Some(i) = n {
                out.extend(hidden.get(&Target::Node(i)).into_iter().flatten());
                n = s.nodes[i].parent;
            }
            merge(out)
        };
        let mut elems = Vec::with_capacity(s.elems.len());
        let mut audio = vec![];
        for (eid, e) in s.elems.iter().enumerate() {
            let i = self.ix(Target::Elem(eid));
            let (start, end) = self.shown[i];
            let parent = nodes[e.node];
            let draws = !matches!(&e.kind, ElemKind::View(v) if v.ops.is_empty());
            if e.kind.is_visual() && draws && end <= start && parent.end > parent.start {
                self.diags.push(Diag::new("W552", e.site, format!("`{}` is never visible (its interval is empty)", e.kind.name())));
            }
            let (fi, fo) = self.fit_fades(e.t.fade_in, e.t.fade_out, end - start, e.site);
            let mut et = ElemTime { start, end, fade_in: fi, fade_out: fo, outer: outer(Some(e.node)), src: None, repeat: repeats[e.node].clone(), hidden: vec![] };
            if e.kind.is_visual() {
                et.hidden = hidden_in(e);
            }
            if let Some(c) = self.clocks[eid].filter(|_| !self.dropped[i]) {
                let segs = self.segments(eid, c, start, end);
                let volume = e.kind.media().map_or(0.0, |m| m.volume);
                let audible = volume > 0.0 && (matches!(e.kind, ElemKind::Audio(_)) || self.info[eid].is_some_and(|i| i.has_audio));
                if audible {
                    let env = et.fades();
                    for g in segs.iter().filter(|g| g.rate > 0.0 && g.t1 - g.t0 > EPS) {
                        for (at, len, shift) in unroll(&et.repeat, g.t0, g.t1) {
                            let env = env.iter().map(|f| f.shifted(shift[f.level])).collect();
                            audio.push(AudioClip { elem: eid, at, len, src: g.s0, rate: g.rate, gain: volume, env });
                        }
                    }
                }
                et.src = Some(SrcMap { segs, from: c.from, end: c.to });
            }
            elems.push(et);
        }
        self.checks(&nodes);
        if total <= 0 {
            self.diags.push(Diag::new("W555", Span::default(), "the video is empty (total length is 0)"));
        }
        Schedule { total, nodes, elems, audio, diags: self.diags }
    }

    fn hidden(&self) -> BTreeMap<Target, Vec<(i64, i64)>> {
        let s = self.s;
        let mut slots: BTreeMap<&str, Vec<(Target, i64, i64, u32)>> = BTreeMap::new();
        for x in targets(s) {
            let (start, end) = self.shown[self.ix(x)];
            let at = match x {
                Target::Node(n) => s.nodes[n].span.lo,
                Target::Elem(e) => s.elems[e].site.lo,
            };
            if let Some(name) = &self.time(x).slot
                && end > start
            {
                slots.entry(name.as_str()).or_default().push((x, start, end, at));
            }
        }
        let mut hidden: BTreeMap<Target, Vec<(i64, i64)>> = BTreeMap::new();
        for holders in slots.values_mut() {
            holders.sort_by_key(|h| (h.1, h.3));
            for (k, a) in holders.iter().enumerate() {
                for b in &holders[k + 1..] {
                    let (lo, hi) = (a.1.max(b.1), a.2.min(b.2));
                    if hi > lo {
                        hidden.entry(a.0).or_default().push((lo, hi));
                    }
                }
            }
        }
        hidden
    }

    fn fit_fades(&mut self, fade_in: i64, fade_out: i64, len: i64, site: Span) -> (f64, f64) {
        let (fades, shortened) = fit_fades(fade_in, fade_out, len);
        if shortened {
            self.diags.push(Diag::new("W553", site, "fades are longer than the element is shown; they were shortened"));
        }
        fades
    }

    fn checks(&mut self, nodes: &[NodeTime]) {
        let s = self.s;
        for (i, node) in s.nodes.iter().enumerate().skip(1) {
            let empty = nodes[i].end <= nodes[i].start;
            let tag = node.tag;
            if node.t.timed() && !self.dropped[i] && empty {
                self.diags.push(Diag::new("W551", node.head, format!("`<{tag}>` has no length (put something with a length in it, or give it one with `<dur len>`)")));
            }
            let shown = self.within(Target::Node(i)).is_some_and(|p| {
                let (start, end) = self.shown[self.ix(p)];
                end > start
            });
            if !node.t.timed() && empty && shown && !node.order.is_empty() {
                self.diags.push(Diag::new("W552", node.head, format!("`<{tag}>` is never shown (its interval is empty)")));
            }
        }
        for x in targets(s).skip(1) {
            let i = self.ix(x);
            let site = self.site(x);
            let p = self.within(x).expect("not the root");
            let reported = self.diags.iter().any(|d| d.is_error() && d.span == site);
            if self.timed(x) && self.dropped[i] && !self.dropped[self.ix(p)] && !reported {
                self.diags.push(Diag::new("W556", site, "this never plays: its container ends before it starts"));
            }
        }
    }
}
