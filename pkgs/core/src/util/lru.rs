//! Small, byte-budgeted caches. Values in use may outlive eviction through Arc.
use std::{
    collections::HashMap,
    hash::Hash,
    path::{Path, PathBuf},
    time::SystemTime,
};

pub struct Lru<K, V> {
    entries: HashMap<K, (V, usize, u64)>,
    budget: usize,
    bytes: usize,
    clock: u64,
}
impl<K: Eq + Hash + Clone, V> Lru<K, V> {
    pub fn new(budget: usize) -> Self {
        Self {
            entries: HashMap::new(),
            budget,
            bytes: 0,
            clock: 0,
        }
    }
    pub fn get(&mut self, key: &K) -> Option<&V> {
        self.clock += 1;
        let entry = self.entries.get_mut(key)?;
        entry.2 = self.clock;
        Some(&entry.0)
    }
    pub fn insert(&mut self, key: K, value: V, bytes: usize) {
        if let Some((_, size, _)) = self.entries.remove(&key) {
            self.bytes -= size;
        }
        if bytes > self.budget {
            return;
        }
        while self.bytes + bytes > self.budget {
            let oldest = self.entries.iter().min_by_key(|(_, v)| v.2).map(|(k, _)| k.clone());
            if let Some(k) = oldest {
                self.bytes -= self.entries.remove(&k).unwrap().1;
            } else {
                break;
            }
        }
        self.clock += 1;
        self.bytes += bytes;
        self.entries.insert(key, (value, bytes, self.clock));
    }
}

pub type FileStamp = (PathBuf, Option<(u64, Option<SystemTime>)>);
pub fn file_stamp(path: &Path) -> FileStamp {
    (path.to_path_buf(), std::fs::metadata(path).ok().map(|m| (m.len(), m.modified().ok())))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn eviction_respects_access_and_budget() {
        let mut c = Lru::new(4);
        c.insert(1, "one", 2);
        c.insert(2, "two", 2);
        assert_eq!(c.get(&1), Some(&"one"));
        c.insert(3, "three", 2);
        assert!(c.get(&2).is_none());
        c.insert(4, "oversized", 5);
        assert!(c.get(&4).is_none());
        assert_eq!(c.get(&1), Some(&"one"));
    }
}
