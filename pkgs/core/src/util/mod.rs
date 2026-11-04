pub(crate) mod lru;
pub mod proc;

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// A path with its size and modification time, which change when the file does (`None` when it is missing).
pub type FileStamp = (PathBuf, Option<(u64, Option<SystemTime>)>);

pub fn file_stamp(path: &Path) -> FileStamp {
    (path.to_path_buf(), std::fs::metadata(path).ok().map(|m| (m.len(), m.modified().ok())))
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
