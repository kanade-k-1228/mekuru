use crate::{
    Project,
    lang::diag::Diag,
    prepare::{self, Prepared},
    schedule::Schedule,
};
use std::path::Path;

#[derive(Clone, PartialEq, serde::Serialize)]
pub struct Diagnostic {
    pub code: String,
    pub severity: &'static str,
    pub line: u32,
    pub message: String,
}

pub struct Resolved {
    pub prepared: Prepared,
    pub schedule: Schedule,
}

pub struct Compilation {
    pub project: Project,
    pub resolved: Option<Resolved>,
    pub diagnostics: Vec<Diag>,
}

impl Compilation {
    pub fn inspect(path: &Path, root: Option<&Path>, source: String) -> Self {
        Self::new(Project::from_source_mode(path, root, source, true), prepare::inspect)
    }

    pub fn new(project: Project, prepare: impl FnOnce(&crate::ir::Script) -> Prepared) -> Self {
        let mut diagnostics = project.diags.clone();
        let resolved = (|| {
            if diagnostics.iter().any(Diag::is_error) {
                return None;
            }
            let prepared = prepare(&project.script);
            diagnostics.extend(prepared.diags.iter().cloned());
            if diagnostics.iter().any(Diag::is_error) {
                return None;
            }
            let schedule = project.schedule(&prepared);
            diagnostics.extend(schedule.diags.iter().cloned());
            if diagnostics.iter().any(Diag::is_error) {
                return None;
            }
            Some(Resolved { prepared, schedule })
        })();
        Self {
            project,
            resolved,
            diagnostics,
        }
    }

    pub fn diagnostics(&self) -> Vec<Diagnostic> {
        diagnostics(&self.project, &self.diagnostics)
    }
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
