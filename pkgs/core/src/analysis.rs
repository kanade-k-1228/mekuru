use crate::{
    Project,
    ir::Script,
    lang::diag::Diag,
    prepare::{self, Prepared},
    schedule::{self, Schedule},
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

/// A project with every stage's diagnostics in `project.diags`.
pub struct Compilation {
    pub project: Project,
    pub resolved: Option<Resolved>,
}

impl Compilation {
    pub fn inspect(path: &Path, root: Option<&Path>, source: String) -> Self {
        Self::new(Project::from_source(path, root, source, true), prepare::inspect)
    }

    pub fn new(mut project: Project, prepare: impl FnOnce(&Script, &mut Vec<Diag>) -> Prepared) -> Self {
        let resolved = (|| {
            if project.has_errors() {
                return None;
            }
            let prepared = prepare(&project.script, &mut project.diags);
            if project.has_errors() {
                return None;
            }
            let schedule = schedule::schedule(&project.script, &prepared, &mut project.diags);
            (!project.has_errors()).then_some(Resolved { prepared, schedule })
        })();
        Self { project, resolved }
    }

    pub fn diagnostics(&self) -> Vec<Diagnostic> {
        self.project
            .diags
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
