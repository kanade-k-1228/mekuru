//! A compiled scene and the patch from the previous one.
pub use super::dto::{CollectionPatch, Dimensions, Patch, Resources, Versioned};
use std::collections::{HashMap, HashSet};

/// A scene and the drawings it uses.
pub struct Published {
    pub preview: Versioned,
    pub resources: Resources,
}

/// What viewers of the scene shown before need for the next one.
pub enum Update {
    /// The scene is the same.
    Unchanged,
    /// There was no scene: viewers need all of it.
    Snapshot,
    Patch(Box<Patch>),
}

/// Makes `next` the scene in `shown`, unless they are the same, and says what to send.
pub fn publish(shown: &mut Option<Published>, next: Published) -> Update {
    let update = match shown {
        Some(before) if before.preview.scene == next.preview.scene => return Update::Unchanged,
        Some(before) => Update::Patch(Box::new(next.patch(before))),
        None => Update::Snapshot,
    };
    *shown = Some(next);
    update
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
    /// The patch that turns `before`, the scene the viewer has, into this one.
    fn patch(&self, before: &Self) -> Patch {
        let a = &before.preview.scene;
        let b = &self.preview.scene;
        Patch {
            base_version: before.preview.version,
            version: self.preview.version,
            scene: b.dimensions,
            elements: collection(&a.elements, &b.elements, |e| &e.key),
            nodes: collection(&a.nodes, &b.nodes, |e| &e.key),
            clips: collection(&a.clips, &b.clips, |e| &e.key),
            resources: self
                .resources
                .iter()
                .filter(|(k, _)| !before.resources.contains_key(*k))
                .map(|(k, ops)| (k.clone(), ops.clone()))
                .collect(),
        }
    }
}
