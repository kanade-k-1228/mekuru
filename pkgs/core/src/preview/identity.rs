//! Preview identity is independent of sequential IR IDs and drawing hashes.
use crate::util::sha256_hex;
use std::collections::{HashMap, HashSet};

#[derive(Clone)]
struct Node {
    key: String,
    tag: String,
    id: Option<String>,
    fingerprint: String,
    offset: usize,
    children: Vec<Node>,
}
impl Node {
    fn parse(n: &crate::lang::ast::Tag) -> Self {
        let children: Vec<_> = n.children.iter().map(Self::parse).collect();
        let mut attrs: Vec<_> = n.attrs.iter().map(|a| (&a.key, &a.value)).collect();
        attrs.sort();
        let fingerprint = sha256_hex(
            format!(
                "{:?}|{attrs:?}|{:?}|{:?}",
                n.name.as_str(),
                n.text,
                children.iter().map(|c| &c.fingerprint).collect::<Vec<_>>()
            )
            .as_bytes(),
        );
        Self {
            key: String::new(),
            tag: n.name.as_str().into(),
            id: n.attribute("id").map(str::to_owned),
            fingerprint,
            offset: n.head.lo as usize,
            children,
        }
    }
}

pub(super) struct Identity {
    namespace: String,
    previous: Option<Node>,
    next: u64,
}
impl Default for Identity {
    fn default() -> Self {
        static SESSION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let session = SESSION.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        Self {
            namespace: format!("{}-{session}", std::process::id()),
            previous: None,
            next: 0,
        }
    }
}
impl Identity {
    pub fn update(&mut self, syntax: &crate::lang::ast::Tag) -> HashMap<usize, String> {
        let mut root = Node::parse(syntax);
        let mut named = HashMap::new();
        if let Some(old) = &self.previous {
            collect_named(old, "root", &mut named);
        }
        assign(&mut root, self.previous.as_ref(), "root", &named, &mut self.next);
        let mut offsets = HashMap::new();
        fn collect(n: &Node, out: &mut HashMap<usize, String>) {
            out.insert(n.offset, n.key.clone());
            for c in &n.children {
                collect(c, out);
            }
        }
        collect(&root, &mut offsets);
        // A restarted process must never reuse keys for unrelated old elements.
        for key in offsets.values_mut() {
            *key = format!("{}:{key}", self.namespace);
        }
        self.previous = Some(root);
        offsets
    }
}

fn collect_named<'a>(n: &'a Node, scope: &str, out: &mut HashMap<(String, String), &'a Node>) {
    if let Some(id) = &n.id {
        out.insert((scope.into(), id.clone()), n);
    }
    let scope = if n.tag == "repeat" { &n.key } else { scope };
    for c in &n.children {
        collect_named(c, scope, out);
    }
}

fn assign(n: &mut Node, old: Option<&Node>, scope: &str, named: &HashMap<(String, String), &Node>, next: &mut u64) {
    let old = if let Some(id) = &n.id {
        named.get(&(scope.into(), id.clone())).copied()
    } else {
        old
    };
    let old = old.filter(|o| o.tag == n.tag);
    n.key = old.map(|o| o.key.clone()).unwrap_or_else(|| {
        *next += 1;
        format!("p{next}")
    });
    let scope = if n.tag == "repeat" { &n.key } else { scope };
    let empty = vec![];
    let before = old.map_or(&empty, |o| &o.children);
    let mut pairs = vec![None; n.children.len()];
    let mut used = HashSet::new();
    // Exact subtrees, including reordered subtrees, take precedence. Duplicate
    // groups only match when their multiplicities agree; otherwise they are ambiguous.
    let mut fingerprints: HashMap<&str, Vec<usize>> = HashMap::new();
    for (i, c) in before.iter().enumerate() {
        fingerprints.entry(&c.fingerprint).or_default().push(i);
    }
    let mut after: HashMap<&str, Vec<usize>> = HashMap::new();
    for (i, c) in n.children.iter().enumerate() {
        after.entry(&c.fingerprint).or_default().push(i);
    }
    for (fp, indices) in &after {
        if let Some(old_indices) = fingerprints.get(fp).filter(|v| v.len() == indices.len()) {
            for (&i, &j) in indices.iter().zip(old_indices) {
                pairs[i] = Some(j);
                used.insert(j);
            }
        }
    }
    // Pair edited anonymous nodes only in unambiguous, equally sized gaps.
    // Crossing anchors (reorders) deliberately do not infer edited identities.
    let anchors: Vec<_> = pairs.iter().enumerate().filter_map(|(i, j)| j.map(|j| (i, j))).collect();
    let mut left = (0, 0);
    for (i, j) in anchors.into_iter().chain([(n.children.len(), before.len())]) {
        if i >= left.0 && j >= left.1 && i - left.0 == j - left.1 {
            let a = &n.children[left.0..i];
            let b = &before[left.1..j];
            if a.iter().zip(b).all(|(a, b)| a.id.is_none() && b.id.is_none() && a.tag == b.tag) && (left.1..j).all(|j| !used.contains(&j)) {
                for (i, j) in (left.0..i).zip(left.1..j) {
                    pairs[i] = Some(j);
                }
            }
        }
        left = (i + 1, j + 1);
    }
    for (i, c) in n.children.iter_mut().enumerate() {
        assign(c, pairs[i].map(|j| &before[j]), scope, named, next);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn keys(i: &mut Identity, xml: &str) -> Vec<String> {
        let (document, _) = crate::lang::xml::parse(&format!("<mekuru>{xml}</mekuru>"));
        let map = i.update(&document.root);
        document
            .root
            .descendants()
            .into_iter()
            .filter(|n| n.name == "text")
            .map(|n| map[&(n.head.lo as usize)].clone())
            .collect()
    }
    #[test]
    fn edit_insert_reorder_and_ambiguous_duplicates() {
        let mut i = Identity::default();
        let a = keys(&mut i, "<seq><text>A</text><text>B</text></seq>");
        let b = keys(&mut i, "<seq><text>A</text><text>C</text></seq>");
        assert_eq!(a, b);
        let c = keys(&mut i, "<seq><text>X</text><text>A</text><text>C</text></seq>");
        assert_eq!(b, c[1..]);
        let d = keys(&mut i, "<seq><text>C</text><text>A</text><text>X</text></seq>");
        assert_eq!(d, c.into_iter().rev().collect::<Vec<_>>());
        let mut i = Identity::default();
        let a = keys(&mut i, "<seq><text>A</text><text>A</text></seq>");
        let b = keys(&mut i, "<seq><text>A</text></seq>");
        assert!(!a.contains(&b[0]));
    }
    #[test]
    fn named_elements_use_repeat_clock_scope() {
        let mut i = Identity::default();
        let a = keys(&mut i, "<seq><repeat id='r'><text id='x'>A</text></repeat><text id='x'>B</text></seq>");
        let b = keys(&mut i, "<seq><text id='x'>C</text><repeat id='r'><text id='x'>D</text></repeat></seq>");
        assert_eq!(a[0], b[1]);
        assert_eq!(a[1], b[0]);
    }
}
