use super::{
    delta::{Published, SharedPreview, Update},
    identity::Identity,
    *,
};
use crate::util::{
    hash::sha256_hex,
    lru::{Lru, file_stamp},
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc, time::Instant};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub version: u64,
    pub xml: String,
    #[serde(default)]
    pub base_version: Option<u64>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    pub version: u64,
    pub preview_version: Option<u64>,
    pub diagnostics: Vec<Diagnostic>,
    pub update: Option<Update>,
    pub stats: Stats,
}
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub draw_hits: usize,
    pub draw_misses: usize,
    pub compile_ms: f64,
    pub diff_ms: f64,
}
#[derive(Clone)]
pub(super) struct Drawing {
    pub id: String,
    ops: Arc<Vec<Op>>,
    bytes: usize,
}

pub struct Session {
    pub(super) identities: Identity,
    drawings: Lru<String, Drawing>,
    used: HashMap<String, Drawing>,
    published: Option<Published>,
    candidate: Option<Published>,
    stats: Stats,
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
            published: None,
            candidate: None,
            stats: Stats::default(),
        }
    }
    pub fn compile(&mut self, path: &Path, root: Option<&Path>, request: Request) -> Response {
        // A request acknowledges only the scene actually accepted by the CLI.
        // Discarded intermediate results must never become the next patch base.
        if self.candidate.as_ref().is_some_and(|p| Some(p.preview.version) == request.base_version) {
            self.published = self.candidate.take();
        }
        self.candidate = None;
        if self.published.as_ref().is_some_and(|p| Some(p.preview.version) != request.base_version) {
            self.published = None;
        }
        self.stats = Stats::default();
        let started = Instant::now();
        let compilation = compile_internal(path, root, request.xml, self);
        self.stats.compile_ms = started.elapsed().as_secs_f64() * 1000.0;
        let diff_started = Instant::now();
        let used = std::mem::take(&mut self.used);
        let mut update = None;
        let preview_version = compilation.preview.map(|scene| {
            if let Some(base) = &self.published
                && *base.preview.scene == scene
            {
                return base.preview.version;
            }
            // Each hash is 64 ASCII characters: quotes + colon add three bytes.
            let resource_bytes = 2 + used.len().saturating_sub(1) + used.values().map(|d| 67 + d.bytes).sum::<usize>();
            let next = Published {
                preview: SharedPreview {
                    version: request.version,
                    scene: Arc::new(scene),
                },
                resources: Arc::new(used.into_iter().map(|(k, d)| (k, d.ops)).collect()),
                resource_bytes,
            };
            update = Some(next.update(self.published.as_ref()));
            self.candidate = Some(next);
            request.version
        });
        self.stats.diff_ms = diff_started.elapsed().as_secs_f64() * 1000.0;
        Response {
            version: request.version,
            preview_version,
            diagnostics: compilation.diagnostics,
            update,
            stats: std::mem::take(&mut self.stats),
        }
    }

    pub(crate) fn scene(&self) -> Option<Published> {
        self.candidate.as_ref().or(self.published.as_ref()).cloned()
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
            for op in &mut ops {
                if let Op::Image { src, revision: stamp, .. } = op {
                    *stamp = Some(revision(&root.join(src)));
                }
            }
            let bytes = serde_json::to_vec(&ops).expect("drawing JSON");
            let drawing = Drawing {
                id: sha256_hex(&bytes),
                bytes: bytes.len(),
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
