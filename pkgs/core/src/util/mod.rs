pub(crate) mod lru;
pub mod proc;

use anyhow::Result;
use lru::Lru;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex, PoisonError};
use std::time::SystemTime;

/// A path with its size and modification time, which change when the file does (`None` when it is missing).
pub type FileStamp = (PathBuf, Option<(u64, Option<SystemTime>)>);

pub fn file_stamp(path: &Path) -> FileStamp {
    (path.to_path_buf(), std::fs::metadata(path).ok().map(|m| (m.len(), m.modified().ok())))
}

/// What was read from each file, kept while the file's stamp stays the same.
pub(crate) struct FileMemo<T>(LazyLock<Mutex<Lru<FileStamp, T>>>);

impl<T: Copy> FileMemo<T> {
    pub const fn new() -> Self {
        FileMemo(LazyLock::new(|| Mutex::new(Lru::new(1024 * 1024))))
    }

    pub fn get(&self, path: &Path, read: impl FnOnce() -> Result<T>) -> Result<T> {
        let key = file_stamp(path);
        let memo = || self.0.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(v) = memo().get(&key) {
            return Ok(*v);
        }
        let v = read()?;
        memo().insert(key, v, path.as_os_str().len() + 128);
        Ok(v)
    }
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let d = Sha256::digest(bytes);
    d.iter().map(|b| format!("{b:02x}")).collect()
}

pub struct TempFile(pub PathBuf);

impl AsRef<Path> for TempFile {
    fn as_ref(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
