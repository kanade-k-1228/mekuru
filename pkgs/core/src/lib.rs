pub mod analysis;
pub mod audio;
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
pub mod server;
pub mod settings;
pub mod typography;
pub mod util;

use anyhow::{Context, Result};
use lang::diag::{Diag, has_errors};
use lang::span::LineIndex;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use typography::font::FontBook;

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

/// The absolute folder that `src` paths start from: `root`, else the XML's folder (the project above it for `.mekuru/`).
pub fn project_root(xml: &Path, root: Option<&Path>) -> PathBuf {
    let parent = |p: &Path| p.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new(".")).to_path_buf();
    let dir = parent(xml);
    let dir = if dir.file_name().is_some_and(|n| n == ".mekuru") { parent(&dir) } else { dir };
    let root = root.map_or(dir, Path::to_path_buf);
    std::path::absolute(&root).map_or(root, |r| normalize(&r))
}

pub struct Project {
    pub path: PathBuf,
    pub source: String,
    pub index: LineIndex,
    pub script: ir::Script,
    pub fonts: Arc<FontBook>,
    pub syntax: lang::ast::Tag,
    pub diags: Vec<Diag>,
}

impl Project {
    pub fn load(path: &Path, root: Option<&Path>) -> Result<Project> {
        let source = std::fs::read_to_string(path).with_context(|| format!("cannot read {}", path.display()))?;
        Ok(Project::from_source(path, root, source, false))
    }

    /// The project in `source`; `preview` allows speech that is not made yet.
    pub fn from_source(path: &Path, root: Option<&Path>, source: String, preview: bool) -> Project {
        let (doc, mut diags) = lang::xml::parse(&source);
        let base = project_root(path, root);
        let fonts = typography::font_book(&doc.settings, &base, &doc.root);
        let script = layout::lower(&doc, &base, &fonts, &mut diags, preview);
        let index = LineIndex::new(&source);
        Project {
            path: path.to_path_buf(),
            source,
            index,
            script,
            fonts,
            syntax: doc.root,
            diags,
        }
    }

    pub fn has_errors(&self) -> bool {
        has_errors(&self.diags)
    }

    pub fn schedule(&self, prepared: &prepare::Prepared) -> schedule::Schedule {
        schedule::schedule(&self.script, prepared)
    }

    pub fn default_output(&self) -> PathBuf {
        let name = self.path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "out".into());
        let stem = name.trim_end_matches(".xml").trim_end_matches(".mekuru");
        self.script.base_dir.join(format!("{stem}.mp4"))
    }

    /// The folder for files made from the project: decoded audio and temporary files.
    pub fn cache(&self) -> PathBuf {
        self.script.base_dir.join(".mekuru")
    }
}
