use std::path::{Path, PathBuf};

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
