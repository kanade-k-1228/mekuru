use crate::{
    Project,
    lang::diag::{Diag, has_errors},
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

impl std::fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "L{} {}: {}", self.line, self.code, self.message)
    }
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
        Self::new(Project::from_source(path, root, source, true), prepare::inspect)
    }

    pub fn new(project: Project, prepare: impl FnOnce(&crate::ir::Script) -> Prepared) -> Self {
        let mut diagnostics = project.diags.clone();
        let resolved = (|| {
            if has_errors(&diagnostics) {
                return None;
            }
            let prepared = prepare(&project.script);
            diagnostics.extend(prepared.diags.iter().cloned());
            if has_errors(&diagnostics) {
                return None;
            }
            let schedule = project.schedule(&prepared);
            diagnostics.extend(schedule.diags.iter().cloned());
            if has_errors(&diagnostics) {
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
        self.diagnostics
            .iter()
            .map(|d| Diagnostic {
                code: d.code.into(),
                severity: d.severity(),
                line: self.project.index.line(d.span.lo),
                message: d.msg.clone(),
            })
            .collect()
    }
}
