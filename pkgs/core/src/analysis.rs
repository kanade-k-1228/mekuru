use crate::{
    Project,
    lang::diag::Diag,
    prepare::{self, Prepared},
    preview::Diagnostic,
    schedule::Schedule,
};
use std::path::Path;

pub fn analyze(path: &Path, root: Option<&Path>, source: String) -> (Project, Option<(Prepared, Schedule)>, Vec<Diag>) {
    let p = Project::from_source_mode(path, root, source, true);
    let mut diags = p.diags.clone();
    let result = if p.has_errors() {
        None
    } else {
        let prepared = prepare::inspect(&p.script);
        diags.extend(prepared.diags.iter().cloned());
        if diags.iter().any(Diag::is_error) {
            None
        } else {
            let sched = p.schedule(&prepared);
            diags.extend(sched.diags.iter().cloned());
            if diags.iter().any(Diag::is_error) { None } else { Some((prepared, sched)) }
        }
    };
    (p, result, diags)
}

pub fn diagnostics(p: &Project, diags: &[Diag]) -> Vec<Diagnostic> {
    diags
        .iter()
        .map(|d| Diagnostic {
            code: d.code.into(),
            severity: if d.is_error() { "error" } else { "warning" },
            line: p.index.line(d.span.lo),
            message: d.msg.clone(),
        })
        .collect()
}
