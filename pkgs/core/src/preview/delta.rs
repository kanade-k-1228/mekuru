//! Diff typed scenes before crossing the Rust/CLI boundary.
use super::dto::*;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

pub type Resources = HashMap<String, Arc<Vec<Op>>>;

#[derive(Clone, PartialEq, Serialize)]
pub struct SharedPreview {
    pub version: u64,
    #[serde(flatten)]
    pub scene: Arc<Preview>,
}
#[derive(Clone)]
pub(crate) struct Published {
    pub preview: SharedPreview,
    pub resources: Arc<Resources>,
}
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Update {
    Snapshot { preview: SharedPreview, resources: Arc<Resources> },
    Patch(Box<Patch>),
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Patch {
    base_version: u64,
    version: u64,
    scene: Dimensions,
    elements: CollectionPatch<Element>,
    nodes: CollectionPatch<TimelineNode>,
    clips: CollectionPatch<Clip>,
    resources: Resources,
}

#[derive(Serialize)]
pub struct Dimensions {
    width: u32,
    height: u32,
    fps: f64,
    duration: f64,
}
#[derive(Serialize)]
pub struct CollectionPatch<T> {
    upsert: Vec<T>,
    remove: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    order: Option<Vec<String>>,
}
fn collection<T: Clone + PartialEq>(before: &[T], after: &[T], key: impl Fn(&T) -> &str) -> CollectionPatch<T> {
    let old: HashMap<_, _> = before.iter().map(|e| (key(e), e)).collect();
    let keys: Vec<_> = after.iter().map(&key).collect();
    let next: HashSet<_> = keys.iter().copied().collect();
    CollectionPatch {
        upsert: after.iter().filter(|e| old.get(key(e)).copied() != Some(e)).cloned().collect(),
        remove: before.iter().filter(|e| !next.contains(key(e))).map(|e| key(e).to_owned()).collect(),
        order: (!before.iter().map(&key).eq(keys.iter().copied())).then(|| keys.into_iter().map(str::to_owned).collect()),
    }
}
impl Published {
    pub fn snapshot(&self) -> Update {
        Update::Snapshot {
            preview: self.preview.clone(),
            resources: self.resources.clone(),
        }
    }
    /// A patch on `before`, the scene the client has acknowledged, or else a snapshot.
    pub fn update(&self, before: Option<&Self>) -> Update {
        let Some(before) = before else { return self.snapshot() };
        let a = &before.preview.scene;
        let b = &self.preview.scene;
        Update::Patch(Box::new(Patch {
            base_version: before.preview.version,
            version: self.preview.version,
            scene: Dimensions {
                width: b.width,
                height: b.height,
                fps: b.fps,
                duration: b.duration,
            },
            elements: collection(&a.elements, &b.elements, |e| &e.key),
            nodes: collection(&a.timeline.nodes, &b.timeline.nodes, |e| &e.key),
            clips: collection(&a.timeline.clips, &b.timeline.clips, |e| &e.key),
            resources: self
                .resources
                .iter()
                .filter(|(k, _)| !before.resources.contains_key(*k))
                .map(|(k, ops)| (k.clone(), ops.clone()))
                .collect(),
        }))
    }
}
