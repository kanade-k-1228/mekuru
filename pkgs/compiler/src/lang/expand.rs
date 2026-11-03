use super::ast::*;
use super::diag::{Diag, did_you_mean};
use super::span::Span;
use crate::ir::*;
use crate::layout;
use crate::typography::font_book;
use std::collections::BTreeMap;
use std::path::Path;

pub(crate) fn lower(doc: &Document, base_dir: &Path, diags: &mut Vec<Diag>, preview: bool) -> Script {
    fn text_fonts(tag: &Tag, out: &mut Vec<String>) {
        if tag.name == "text" {
            out.extend(tag.attrs.iter().filter(|a| a.key == "font").map(|a| a.value.clone()));
        }
        for child in &tag.children {
            if let Child::Tag(tag) = child {
                text_fonts(tag, out);
            }
        }
    }
    let mut requested = vec![];
    text_fonts(&doc.root, &mut requested);
    requested.sort();
    requested.dedup();
    let fonts = font_book(&doc.settings, base_dir, &requested);
    let ctx = layout::Ctx {
        settings: &doc.settings,
        base_dir,
        fonts: &fonts,
        preview,
    };
    let layout::Lowered { mut nodes, mut elems, names } = layout::lower(&doc.root, &ctx, diags);

    // Each repeat body has its own clock. The repeat itself belongs to its parent's clock.
    let scope = |mut parent: Option<NodeId>| {
        while let Some(n) = parent {
            if nodes[n].kind == NodeKind::Repeat {
                return Some(n);
            }
            parent = nodes[n].parent;
        }
        None
    };
    let node_scopes: Vec<_> = nodes.iter().map(|n| scope(n.parent)).collect();
    let elem_scopes: Vec<_> = elems.iter().map(|e| scope(Some(e.node))).collect();
    let mut scopes: BTreeMap<Option<NodeId>, BTreeMap<String, Target>> = BTreeMap::new();
    for (name, target, span) in names {
        let scope = match target {
            Target::Node(n) => node_scopes[n],
            Target::Elem(e) => elem_scopes[e],
        };
        if !name.starts_with(|c: char| c.is_alphabetic() || c == '_') {
            diags.push(Diag::new("E319", span, format!("invalid id `{name}`: an id starts with a letter")));
        } else if scopes.entry(scope).or_default().insert(name.clone(), target).is_some() {
            diags.push(Diag::new("E319", span, format!("the id `{name}` is used twice in the same clock")));
        }
    }
    let mut check = |t: &mut Time, span: Span, scope: Option<NodeId>| {
        if let Some(r) = &mut t.at {
            let ids = scopes.entry(scope).or_default();
            if let Some(target) = ids.get(&r.id) {
                r.target = Some(*target);
            } else {
                let hint = did_you_mean(&r.id, ids.keys().map(String::as_str));
                diags.push(Diag::new(
                    "E318",
                    span,
                    format!("unknown id `{}` in this clock{hint}; references cannot cross a repeat body", r.id),
                ));
                t.at = None;
            }
        }
    };
    for n in &mut nodes {
        check(&mut n.t, n.head, node_scopes[n.id]);
    }
    for e in &mut elems {
        check(&mut e.t, e.site, elem_scopes[e.id]);
    }
    let ids = scopes.remove(&None).unwrap_or_default();
    let mut idx: Vec<usize> = (0..elems.len()).collect();
    idx.sort_by_key(|&i| elems[i].site.lo);
    for (rank, i) in idx.into_iter().enumerate() {
        elems[i].order = rank as u32;
    }
    Script {
        settings: doc.settings.clone(),
        fonts: requested,
        nodes,
        elems,
        ids,
        base_dir: base_dir.to_path_buf(),
    }
}
