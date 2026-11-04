pub mod hash;
pub(crate) mod lru;
pub mod proc;
pub mod temp;

use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// A path with its size and modification time, which change when the file does (`None` when it is missing).
pub type FileStamp = (PathBuf, Option<(u64, Option<SystemTime>)>);

pub fn file_stamp(path: &Path) -> FileStamp {
    (path.to_path_buf(), std::fs::metadata(path).ok().map(|m| (m.len(), m.modified().ok())))
}
