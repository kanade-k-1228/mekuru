use super::{
    delta::{Published, Versioned},
    identity::Identity,
    *,
};
use crate::util::{file_stamp, lru::Lru, sha256_hex};
use std::{collections::HashMap, sync::Arc};

/// How the last compile used the drawing cache.
#[derive(Default)]
pub struct Stats {
    pub draw_hits: usize,
    pub draw_misses: usize,
}
#[derive(Clone)]
pub(super) struct Drawing {
    pub id: String,
    ops: Arc<Vec<Op>>,
}

/// Compiles successive versions of one document, reusing fonts, drawings and element keys.
pub struct Session {
    pub(super) identities: Identity,
    drawings: Lru<String, Drawing>,
    used: HashMap<String, Drawing>,
    pub stats: Stats,
}
impl Default for Session {
    fn default() -> Self {
        Self::new(64 * 1024 * 1024)
    }
}
impl Session {
    pub fn new(drawing_budget: usize) -> Self {
        Self {
            identities: Identity::default(),
            drawings: Lru::new(drawing_budget),
            used: HashMap::new(),
            stats: Stats::default(),
        }
    }
    /// The diagnostics and, when `xml` has no errors, its scene as `version`.
    pub fn compile(&mut self, path: &Path, root: Option<&Path>, xml: String, version: u64) -> (Vec<Diagnostic>, Option<Published>) {
        self.stats = Stats::default();
        let compilation = crate::analysis::Compilation::inspect(path, root, xml);
        let scene = (compilation.resolved.as_ref()).map(|r| scene(&compilation.project, &r.prepared, &r.schedule, self));
        let used = std::mem::take(&mut self.used);
        let published = scene.map(|scene| Published {
            preview: Versioned { version, scene },
            resources: used.into_iter().map(|(k, d)| (k, d.ops)).collect(),
        });
        (compilation.diagnostics(), published)
    }

    pub(super) fn draw(&mut self, op: &ViewOp, fonts: &FontBook, root: &Path) -> Drawing {
        fn dependency(op: &ViewOp, fonts: &FontBook) -> String {
            match op {
                ViewOp::Transformed(_, op) => dependency(op, fonts),
                ViewOp::Text(_) => fonts.generation.to_string(),
                ViewOp::Image(img) => format!("{:?}", file_stamp(&img.path)),
                _ => String::new(),
            }
        }
        // Debug encodes every field of the IR (including text/style, width,
        // placement and nested transforms). No source spans enter this cache.
        let key = format!("{root:?}|{}|{op:?}", dependency(op, fonts));
        let drawing = if let Some(drawing) = self.drawings.get(&key) {
            self.stats.draw_hits += 1;
            drawing.clone()
        } else {
            self.stats.draw_misses += 1;
            let mut ops = vec![];
            draw_op(op, Transform::identity(), fonts, root, &mut ops);
            let bytes = serde_json::to_vec(&ops).expect("drawing JSON");
            let drawing = Drawing {
                id: sha256_hex(&bytes),
                ops: Arc::new(ops),
            };
            self.drawings
                .insert(key.clone(), drawing.clone(), key.len() + bytes.len() + drawing.ops.len() * 128 + 256);
            drawing
        };
        self.used.entry(drawing.id.clone()).or_insert_with(|| drawing.clone());
        drawing
    }
}

pub(super) fn revision(path: &Path) -> String {
    sha256_hex(format!("{:?}", file_stamp(path)).as_bytes())
}
