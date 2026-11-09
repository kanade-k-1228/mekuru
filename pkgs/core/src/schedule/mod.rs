mod model;
pub use model::*;
mod graph;
use crate::ir::*;
use crate::lang::ast::Flow;
use crate::lang::diag::Diag;
use crate::lang::span::Span;
use crate::prepare::Prepared;
use graph::Graph;
use std::collections::BTreeMap;
mod assemble;
mod media;
use media::{Clock, MediaTiming};

pub const EPS: f64 = 1e-6;
const NONE: i64 = i64::MIN / 4;

fn up(frames: f64) -> i64 {
    (frames - EPS).ceil() as i64
}

fn show(frames: f64) -> String {
    if frames.fract() == 0.0 { format!("{frames}") } else { format!("{frames:.2}") }
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

pub fn schedule(s: &Script, prepared: &Prepared) -> Schedule {
    let fps = s.settings.rate();
    let media = s
        .elems
        .iter()
        .map(|element| {
            let probe = prepared.media.get(&element.id).map(|m| m.probe);
            MediaTiming::new(element, probe, fps)
        })
        .collect();
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
        media,
        holds,
        diags: vec![],
        val: vec![],
        targets: vec![TargetState::default(); all],
        nodes: vec![NodeState::default(); s.nodes.len()],
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

#[derive(Clone, Default)]
struct TargetState {
    interval: (i64, i64),
    dropped: bool,
}

#[derive(Clone, Default)]
struct NodeState {
    inner_end: i64,
    period: Option<i64>,
}

struct Solver<'a> {
    s: &'a Script,
    media: Vec<MediaTiming>,
    holds: BTreeMap<ElemId, Vec<(i64, NodeId)>>,
    diags: Vec<Diag>,
    val: Vec<i64>,
    targets: Vec<TargetState>,
    nodes: Vec<NodeState>,
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
            Target::Node(n) => self.nodes[n].inner_end,
            Target::Elem(_) => self.targets[self.ix(x)].interval.1,
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
            Target::Elem(e) => self.media[e].clock.map(|c| (e, c)),
            Target::Node(_) => None,
        }
    }

    fn holds_of(&self, media: ElemId) -> &[(i64, NodeId)] {
        self.holds.get(&media).map_or(&[], Vec::as_slice)
    }

    fn reference(&self, x: Target) -> Option<(&'a str, Target, i64)> {
        let r = self.time(x).at.as_ref()?;
        Some((r.id.as_str(), r.target?, r.pos))
    }

    fn loops(&mut self, g: &Graph, done: &[bool]) {
        let found = g.loops(done);
        for &x in &found {
            self.diags.push(Diag::new(
                "E510",
                self.site(x),
                "this never starts: what its `at` waits for comes only after this (they wait for each other)",
            ));
        }
        if found.is_empty() {
            self.diags.push(Diag::new("E510", Span::default(), "the times wait for each other"));
        }
    }

    fn graph(&self) -> Graph {
        let s = self.s;
        let mut g = Graph {
            base: vec![NONE; 3 * (s.nodes.len() + s.elems.len())],
            edges: vec![],
        };
        g.base[self.var(Target::Node(0), V::Start)] = 0;
        for n in &s.nodes {
            let mut before = None;
            for &c in &n.order {
                match before {
                    Some(b) if n.flow == Flow::Seq => {
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
            (Dur::Own, Target::Elem(v)) => match self.media[v].clock {
                Some(c) => self.arrival(g, x, c.to, e, None, true),
                None => g.add(s, e, 0, None),
            },
        }
    }

    /// Arrival is the latest of these variable + offset terms. Only a media end waits for holds at `q` itself.
    fn arrival_terms(&self, y: Target, q: f64, end: bool) -> impl Iterator<Item = (usize, i64)> + '_ {
        let clock = self.clock(y);
        let elapsed = clock.map_or(q, |(v, c)| self.media[v].played(c.from, q));
        std::iter::once((self.var(y, V::Start), up(elapsed))).chain(clock.into_iter().flat_map(move |(v, _)| {
            self.holds_of(v)
                .iter()
                .filter(move |(at, _)| (*at as f64) < q || (end && *at as f64 <= q))
                .map(move |&(at, h)| (self.var(Target::Node(h), V::End), up(self.media[v].played(at as f64, q))))
        }))
    }

    fn arrival(&self, g: &mut Graph, y: Target, q: f64, to: usize, cause: Option<Target>, end: bool) {
        for (from, offset) in self.arrival_terms(y, q, end) {
            g.add(from, to, offset, cause);
        }
    }

    fn arrival_at(&self, y: Target, q: i64) -> i64 {
        self.arrival_terms(y, q as f64, false)
            .map(|(from, offset)| self.val[from] + offset)
            .max()
            .expect("arrival includes the target's start")
    }

    fn intervals(&mut self) {
        let total = self.val[self.var(Target::Node(0), V::End)].max(0);
        (self.targets[0].interval, self.targets[0].dropped, self.nodes[0].inner_end) = ((0, total), false, total);
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
        let (start, end) = self.targets[n].interval;
        let longest = node.order.iter().filter(|&&c| self.timed(c)).map(|&c| self.val[self.var(c, V::End)]).max();
        let round = longest.map(|l| l - start).filter(|_| node.flow == Flow::Repeat);
        self.nodes[n].period = round;
        self.nodes[n].inner_end = round.map_or(end, |r| end.min(start + r));
        self.visit(n);
    }

    fn clip(&mut self, x: Target, within: Target) {
        let (s, e, until) = (self.val[self.var(x, V::Start)], self.val[self.var(x, V::End)], self.until(within));
        let i = self.ix(x);
        let late = s > until || (s >= until && self.timed(x) && e > s);
        self.targets[i].dropped = self.targets[self.ix(within)].dropped || late;
        self.targets[i].interval = if self.targets[i].dropped {
            (s.min(until), s.min(until))
        } else {
            (s, if self.timed(x) { e.min(until).max(s) } else { until })
        };
    }

    fn placed(&self, x: Target) -> bool {
        let Some(p) = self.within(x) else { return true };
        !self.targets[self.ix(p)].dropped && self.val[self.var(x, V::Flow)] <= self.until(p)
    }

    fn unreached(&mut self) {
        let mut found = vec![];
        for x in targets(self.s).filter(|&x| self.placed(x)) {
            let Some((id, y, q)) = self.reference(x) else { continue };
            let msg = if self.targets[self.ix(y)].dropped {
                format!("this never starts: `{id}` is never shown")
            } else if let Some((_, c)) = self.clock(y)
                && ((q as f64) < c.from || q as f64 > c.to)
            {
                format!(
                    "`{id}` never gets to frame {q}: it plays its source from frame {} to {}",
                    show(c.from),
                    show(c.to)
                )
            } else if self.arrival_at(y, q) > self.targets[self.ix(y)].interval.1 {
                let (start, end) = self.targets[self.ix(y)].interval;
                format!("`{id}` never gets to frame {q}: it is shown for {} frames", end - start)
            } else {
                continue;
            };
            found.push(Diag::new("E504", self.site(x), msg));
        }
        for n in &self.s.nodes {
            if let Some(h) = n.hold
                && let Some(c) = self.media[h.media].clock
                && ((h.at as f64) < c.from || h.at as f64 > c.to)
            {
                found.push(Diag::new(
                    "E504",
                    n.head,
                    format!(
                        "the media never gets to frame {}: it plays its source from frame {} to {}",
                        h.at,
                        show(c.from),
                        show(c.to)
                    ),
                ));
            }
        }
        for (e, c) in self.s.elems.iter().zip(self.media.iter().map(|media| media.clock)) {
            let (Some(m), Some(c)) = (e.kind.media(), c) else { continue };
            for p in &m.speeds {
                let (a, b) = (p.from.map_or(c.from, |a| a as f64), p.to.map_or(c.to, |b| b as f64));
                if b.min(c.to) <= a.max(c.from) {
                    found.push(Diag::new(
                        "E504",
                        p.site,
                        format!(
                            "the media never plays frames {} to {}: it plays its source from frame {} to {}",
                            show(a),
                            show(b),
                            show(c.from),
                            show(c.to)
                        ),
                    ));
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
                self.reference(x)
                    .is_some_and(|(_, y, q)| !self.targets[self.ix(y)].dropped && self.arrival_at(y, q) < ready)
            })
            .collect();
        for x in late {
            let at = self.time(x).at.as_ref().expect("a reference");
            self.diags.push(Diag::new(
                "W550",
                self.site(x),
                format!("`at=\"{at}\"` is already past when this could start; it starts right away"),
            ));
        }
    }

    fn finish(mut self) -> Schedule {
        let intervals: Vec<_> = self.targets.iter().map(|state| state.interval).collect();
        let periods: Vec<_> = self.nodes.iter().map(|state| state.period).collect();
        let media = self
            .s
            .elems
            .iter()
            .map(|e| {
                let timing = &self.media[e.id];
                let (start, end) = self.targets[self.ix(Target::Elem(e.id))].interval;
                let source = timing.clock.filter(|_| !self.targets[self.ix(Target::Elem(e.id))].dropped).map(|clock| {
                    let holds = self.holds_of(e.id).iter().map(|&(at, h)| (at, self.val[self.var(Target::Node(h), V::End)]));
                    SrcMap {
                        segs: timing.segments(clock, start, end, holds),
                        from: clock.from,
                        end: clock.to,
                    }
                });
                let audible =
                    e.kind.media().is_some_and(|m| m.volume > 0.0) && (matches!(e.kind, ElemKind::Audio(_)) || timing.probe.is_some_and(|p| p.has_audio));
                (source, audible)
            })
            .collect();
        let mut schedule = assemble::finish(self.s, &intervals, &periods, media, &mut self.diags);
        self.checks(&schedule.nodes);
        if schedule.total <= 0 {
            self.diags.push(Diag::new("W555", Span::default(), "the video is empty (total length is 0)"));
        }
        schedule.diags = self.diags;
        schedule
    }

    fn checks(&mut self, nodes: &[NodeTime]) {
        let s = self.s;
        for (i, node) in s.nodes.iter().enumerate().skip(1) {
            let empty = nodes[i].end <= nodes[i].start;
            let tag = node.flow.name();
            if node.t.timed() && !self.targets[i].dropped && empty {
                self.diags.push(Diag::new(
                    "W551",
                    node.head,
                    format!("`<{tag}>` has no length (put something with a length in it, or give it one with `<dur len>`)"),
                ));
            }
            let shown = self.within(Target::Node(i)).is_some_and(|p| {
                let (start, end) = self.targets[self.ix(p)].interval;
                end > start
            });
            if !node.t.timed() && empty && shown && !node.order.is_empty() {
                self.diags
                    .push(Diag::new("W552", node.head, format!("`<{tag}>` is never shown (its interval is empty)")));
            }
        }
        for x in targets(s).skip(1) {
            let i = self.ix(x);
            let site = self.site(x);
            let p = self.within(x).expect("not the root");
            let reported = self.diags.iter().any(|d| d.is_error() && d.span == site);
            if self.timed(x) && self.targets[i].dropped && !self.targets[self.ix(p)].dropped && !reported {
                self.diags
                    .push(Diag::new("W556", site, "this never plays: its container ends before it starts"));
            }
        }
    }
}
