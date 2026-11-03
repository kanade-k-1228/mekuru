use super::{identity::Identity, *};
use crate::util::{
    hash::sha256_hex,
    lru::{Lru, file_stamp},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::Instant,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub version: u64,
    pub xml: String,
    #[serde(default)]
    pub known_resources: Vec<String>,
}
#[derive(Serialize)]
pub struct Response {
    pub version: u64,
    #[serde(flatten)]
    pub compilation: Compilation,
    pub resources: HashMap<String, Arc<Vec<Op>>>,
    pub stats: Stats,
}
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub draw_hits: usize,
    pub draw_misses: usize,
    pub compile_ms: f64,
}
#[derive(Clone)]
pub(super) struct Drawing {
    pub id: String,
    ops: Arc<Vec<Op>>,
}

pub struct Worker {
    pub(super) identities: Identity,
    drawings: Lru<String, Drawing>,
    used: HashMap<String, Arc<Vec<Op>>>,
    stats: Stats,
}
impl Default for Worker {
    fn default() -> Self {
        Self::new(64 * 1024 * 1024)
    }
}
impl Worker {
    pub fn new(drawing_budget: usize) -> Self {
        Self {
            identities: Identity::default(),
            drawings: Lru::new(drawing_budget),
            used: HashMap::new(),
            stats: Stats::default(),
        }
    }
    pub fn compile(&mut self, path: &Path, root: Option<&Path>, request: Request) -> Response {
        self.stats = Stats::default();
        let started = Instant::now();
        let compilation = compile_internal(path, root, request.xml, Some(self));
        let known: HashSet<_> = request.known_resources.into_iter().collect();
        let resources = std::mem::take(&mut self.used).into_iter().filter(|(k, _)| !known.contains(k)).collect();
        self.stats.compile_ms = started.elapsed().as_secs_f64() * 1000.0;
        Response {
            version: request.version,
            compilation,
            resources,
            stats: std::mem::take(&mut self.stats),
        }
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
                ops: Arc::new(ops),
            };
            self.drawings
                .insert(key.clone(), drawing.clone(), key.len() + bytes.len() + drawing.ops.len() * 128 + 256);
            drawing
        };
        self.used.entry(drawing.id.clone()).or_insert_with(|| drawing.ops.clone());
        drawing
    }
}

pub(super) fn revision(path: &Path) -> String {
    sha256_hex(format!("{:?}", file_stamp(path)).as_bytes())
}
