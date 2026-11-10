use super::EPS;
use super::{model::*, targets, up};
use crate::{ir::*, lang::diag::Diag};
use std::collections::{BTreeMap, BTreeSet, BinaryHeap};

pub(super) fn finish(s: &Script, intervals: &[(i64, i64)], periods: &[Option<i64>], media: Vec<(Option<SrcMap>, bool)>, diags: &mut Vec<Diag>) -> Schedule {
    let nodes: Vec<NodeTime> = intervals[..s.nodes.len()].iter().map(|&(start, end)| NodeTime { start, end }).collect();
    let total = nodes[0].end;
    let mut repeats: Vec<Vec<Repeat>> = vec![vec![]; s.nodes.len()];
    for n in &s.nodes {
        let nt = nodes[n.id];
        let mut chain = n.parent.map_or_else(Vec::new, |p| repeats[p].clone());
        if let Some(period) = periods[n.id].filter(|&r| r > 0 && nt.end > nt.start + r) {
            chain.push(Repeat {
                from: nt.start,
                period,
                until: nt.end,
            });
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
        let (fade_in, fade_out) = fit_fades(n.t.fade_in, n.t.fade_out, nt.end - nt.start, n.head, diags);
        fades[n.id] = Some(Fade {
            start: nt.start as f64,
            end: nt.end as f64,
            fade_in,
            fade_out,
            level: level(n),
        });
    }
    let hidden = hidden(s, intervals, &repeats);
    let hidden_in = |e: &Elem| {
        let mut out = hidden.get(&Target::Elem(e.id)).cloned().unwrap_or_default();
        out.extend(ancestors(&s.nodes, Some(e.node)).filter_map(|i| hidden.get(&Target::Node(i))).flatten());
        merge(out)
    };
    let mut elems = Vec::with_capacity(s.elems.len());
    let mut audio = vec![];
    for (eid, (e, (source, audible))) in s.elems.iter().zip(media).enumerate() {
        let (start, end) = intervals[s.nodes.len() + eid];
        let parent = nodes[e.node];
        let draws = !matches!(&e.kind, ElemKind::View(v) if v.ops.is_empty());
        if e.kind.is_visual() && draws && end <= start && parent.end > parent.start {
            diags.push(Diag::new(
                "W552",
                e.site,
                format!("`{}` is never visible (its interval is empty)", e.kind.name()),
            ));
        }
        let (fi, fo) = fit_fades(e.t.fade_in, e.t.fade_out, end - start, e.site, diags);
        let mut et = ElemTime {
            start,
            end,
            fade_in: fi,
            fade_out: fo,
            outer: ancestors(&s.nodes, Some(e.node)).filter_map(|i| fades[i]).collect(),
            src: None,
            repeat: repeats[e.node].clone(),
            hidden: vec![],
        };
        if e.kind.is_visual() {
            et.hidden = hidden_in(e);
        }
        if let Some(source) = source {
            let volume = e.kind.media().map_or(0.0, |m| m.volume);
            if audible {
                let env = et.fades();
                for g in source.segs.iter().filter(|g| g.rate > 0.0 && g.t1 - g.t0 > EPS) {
                    for (at, len, shift) in unroll(&et.repeat, g.t0, g.t1) {
                        let env = env.iter().map(|f| f.shifted(shift[f.level])).collect();
                        audio.push(AudioClip {
                            elem: eid,
                            at,
                            len,
                            src: g.s0,
                            rate: g.rate,
                            gain: volume,
                            env,
                        });
                    }
                }
            }
            et.src = Some(source);
        }
        elems.push(et);
    }
    Schedule { total, nodes, elems, audio }
}

fn hidden(s: &Script, intervals: &[(i64, i64)], repeats: &[Vec<Repeat>]) -> BTreeMap<Target, Vec<(i64, i64)>> {
    let mut slots: BTreeMap<&str, Vec<(Target, i64, i64, u32)>> = BTreeMap::new();
    for x in targets(s) {
        let (start, end) = intervals[match x {
            Target::Node(n) => n,
            Target::Elem(e) => s.nodes.len() + e,
        }];
        let (order, chain): (u32, &[Repeat]) = match x {
            Target::Node(n) => (s.nodes[n].head.lo, s.nodes[n].parent.map_or(&[], |p| repeats[p].as_slice())),
            Target::Elem(e) => (s.elems[e].site.lo, &repeats[s.elems[e].node]),
        };
        if let Some(name) = &match x {
            Target::Node(n) => &s.nodes[n].t,
            Target::Elem(e) => &s.elems[e].t,
        }
        .slot
            && end > start
        {
            for (at, len, _) in unroll(chain, start as f64, end as f64) {
                slots.entry(name.as_str()).or_default().push((x, up(at), up(at + len), order));
            }
        }
    }
    let total = intervals[0].1;
    let mut hidden = BTreeMap::new();
    for holders in slots.values_mut() {
        holders.sort_by_key(|h| (h.1, h.3));
        let marks: Vec<_> = holders.iter().flat_map(|h| [h.1, h.2]).collect::<BTreeSet<_>>().into_iter().collect();
        let mut visible: BTreeMap<Target, Vec<(i64, i64)>> = holders.iter().map(|h| (h.0, vec![])).collect();
        let mut active = BinaryHeap::new();
        let mut next = 0;
        for w in marks.windows(2) {
            let (a, b) = (w[0], w[1]);
            while next < holders.len() && holders[next].1 <= a {
                let h = holders[next];
                active.push((h.1, h.3, next));
                next += 1;
            }
            while active.peek().is_some_and(|&(_, _, i)| holders[i].2 <= a) {
                active.pop();
            }
            if let Some(&(_, _, i)) = active.peek() {
                visible.get_mut(&holders[i].0).expect("slot holder").push((a, b));
            }
        }
        // Visibility is in global time; the same target can win again in another round.
        for (target, spans) in visible {
            let mut gaps = vec![];
            let mut at = 0;
            for (a, b) in merge(spans) {
                if a > at {
                    gaps.push((at, a));
                }
                at = b;
            }
            if at < total {
                gaps.push((at, total));
            }
            hidden.insert(target, gaps);
        }
    }
    hidden
}
