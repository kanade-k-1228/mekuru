use super::{BTreeSet, Target};
pub(super) struct Edge {
    from: usize,
    to: usize,
    w: i64,
    cause: Option<Target>,
}

pub(super) struct Graph {
    pub(super) base: Vec<i64>,
    pub(super) edges: Vec<Edge>,
}

impl Graph {
    pub(super) fn add(&mut self, from: usize, to: usize, w: i64, cause: Option<Target>) {
        self.edges.push(Edge { from, to, w, cause });
    }

    pub(super) fn solve(&self) -> (Vec<i64>, Vec<bool>) {
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

    pub(super) fn loops(&self, done: &[bool]) -> BTreeSet<Target> {
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
