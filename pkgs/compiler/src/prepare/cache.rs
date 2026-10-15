use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Cache {
    pub root: PathBuf,
}

impl Cache {
    fn sharded(&self, kind: &str, key: &str, ext: &str) -> PathBuf {
        self.root.join("cache").join(kind).join(&key[..2.min(key.len())]).join(format!("{key}.{ext}"))
    }

    pub fn pcm(&self, key: &str) -> PathBuf {
        self.sharded("pcm", key, "s16")
    }

    pub fn tmp(&self) -> PathBuf {
        self.root.join("tmp")
    }
}
