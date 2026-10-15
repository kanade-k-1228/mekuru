pub mod audio;
pub mod encode;
pub mod ir;
pub mod lang;
pub mod layout;
pub mod media;
pub mod pipeline;
pub mod prepare;
pub mod preview;
pub mod progress;
pub mod render;
pub mod schedule;
pub mod settings;
pub mod util;

use anyhow::{Context, Result};
use lang::diag::{Diag, has_errors};
use lang::span::LineIndex;
use std::path::{Path, PathBuf};

fn normalize(p: &Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() {
                    out.push(c);
                }
            }
            c => out.push(c),
        }
    }
    out
}

pub struct Project {
    pub path: PathBuf,
    pub source: String,
    pub index: LineIndex,
    pub script: ir::Script,
    pub diags: Vec<Diag>,
}

impl Project {
    pub fn load(path: &Path, root: Option<&Path>) -> Result<Project> {
        let source = std::fs::read_to_string(path).with_context(|| format!("cannot read {}", path.display()))?;
        Ok(Project::from_source(path, root, source))
    }

    pub fn from_source(path: &Path, root: Option<&Path>, source: String) -> Project {
        Self::from_source_mode(path, root, source, false)
    }

    pub(crate) fn from_source_mode(path: &Path, root: Option<&Path>, source: String, preview: bool) -> Project {
        let (doc, mut diags) = lang::xml::parse(&source);
        let dir = path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
        let dir = if dir.file_name().is_some_and(|n| n == ".mekuru") {
            dir.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."))
        } else {
            dir
        };
        let base = root.unwrap_or(dir).to_path_buf();
        let base = std::path::absolute(&base).map(|b| normalize(&b)).unwrap_or(base);
        let script = lang::expand::lower(&doc, &base, &mut diags, preview);
        let index = LineIndex::new(&source);
        Project {
            path: path.to_path_buf(),
            source,
            index,
            script,
            diags,
        }
    }

    pub fn has_errors(&self) -> bool {
        has_errors(&self.diags)
    }

    pub fn schedule(&self, media: &dyn schedule::MediaDb) -> schedule::Schedule {
        schedule::schedule(&self.script, media)
    }

    pub fn fonts(&self) -> std::sync::Arc<render::text::font::FontBook> {
        lang::expand::font_book(&self.script.settings, &self.script.base_dir)
    }

    pub fn default_output(&self) -> PathBuf {
        let name = self.path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "out".into());
        let stem = name.trim_end_matches(".xml").trim_end_matches(".mekuru");
        self.script.base_dir.join(format!("{stem}.mp4"))
    }

    pub fn cache(&self) -> prepare::cache::Cache {
        prepare::cache::Cache {
            root: self.script.base_dir.join(".mekuru"),
        }
    }
}
