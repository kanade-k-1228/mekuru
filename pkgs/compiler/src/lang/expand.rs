use super::ast::*;
use super::diag::{Diag, did_you_mean};
use super::span::Span;
use crate::ir::*;
use crate::layout;
use crate::render::text::font::FontBook;
use crate::settings::{Settings, resolve_font};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::sync::Arc;

pub(crate) fn lower(doc: &Document, base_dir: &Path, diags: &mut Vec<Diag>, preview: bool) -> Script {
    let fonts = font_book(&doc.settings, base_dir);
    let ctx = layout::Ctx {
        settings: &doc.settings,
        base_dir,
        fonts: &fonts,
        preview,
    };
    let layout::Lowered { mut nodes, mut elems, names } = layout::lower(&doc.root, &ctx, diags);

    let mut ids = BTreeMap::new();
    for (name, target, span) in names {
        if !name.starts_with(|c: char| c.is_alphabetic() || c == '_') {
            diags.push(Diag::new("E319", span, format!("invalid id `{name}`: an id starts with a letter")));
        } else if ids.insert(name.clone(), target).is_some() {
            diags.push(Diag::new("E319", span, format!("the id `{name}` is used twice")));
        }
    }
    let named: BTreeSet<Target> = ids.values().copied().collect();
    check_repeats(&nodes, &elems, &named, diags);
    let mut idx: Vec<usize> = (0..elems.len()).collect();
    idx.sort_by_key(|&i| elems[i].site.lo);
    for (rank, i) in idx.into_iter().enumerate() {
        elems[i].order = rank as u32;
    }
    check_refs(&mut nodes, &mut elems, &ids, diags);
    Script {
        settings: doc.settings.clone(),
        nodes,
        elems,
        ids,
        base_dir: base_dir.to_path_buf(),
    }
}

fn check_repeats(nodes: &[Node], elems: &[Elem], named: &BTreeSet<Target>, diags: &mut Vec<Diag>) {
    let in_repeat = |mut n: Option<NodeId>| {
        while let Some(i) = n {
            if nodes[i].kind == NodeKind::Repeat {
                return true;
            }
            n = nodes[i].parent;
        }
        false
    };
    let refers = |t: &Time| t.slot.is_some() || t.at.is_some();
    let msg = "inside a `<repeat>`, nothing can have a name or refer to one (`id`, `slot`, `at`)";
    for n in nodes {
        if in_repeat(n.parent) && (named.contains(&Target::Node(n.id)) || refers(&n.t)) {
            diags.push(Diag::new("E321", n.head, msg));
        }
    }
    for e in elems {
        if in_repeat(Some(e.node)) && (named.contains(&Target::Elem(e.id)) || refers(&e.t)) {
            diags.push(Diag::new("E321", e.site, msg));
        }
    }
}

fn check_refs(nodes: &mut [Node], elems: &mut [Elem], ids: &BTreeMap<String, Target>, diags: &mut Vec<Diag>) {
    let mut check = |t: &mut Time, span: Span| {
        if let Some(r) = &t.at
            && !ids.contains_key(&r.id)
        {
            let hint = did_you_mean(&r.id, ids.keys().map(String::as_str));
            diags.push(Diag::new("E318", span, format!("unknown id `{}`{hint}", r.id)));
            t.at = None;
        }
    };
    for n in nodes.iter_mut() {
        check(&mut n.t, n.head);
    }
    for e in elems.iter_mut() {
        check(&mut e.t, e.site);
    }
}

pub(crate) fn font_book(st: &Settings, base: &Path) -> Arc<FontBook> {
    let fonts: Vec<String> = st.fonts.iter().map(|f| resolve_font(f, base)).collect();
    let extra: Vec<std::path::PathBuf> = fonts.iter().map(std::path::PathBuf::from).filter(|p| p.is_file()).collect();
    FontBook::shared(&fonts, &extra)
}
