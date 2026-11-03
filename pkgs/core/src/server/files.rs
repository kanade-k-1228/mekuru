use axum::{
    body::Body,
    http::{Method, StatusCode, request::Parts},
    response::Response,
};
use std::path::{Component, Path};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

include!(concat!(env!("OUT_DIR"), "/viewer.rs"));

pub(super) fn empty(status: StatusCode) -> Response {
    Response::builder().status(status).body(Body::empty()).unwrap()
}

fn relative(path: &str) -> Option<String> {
    // Decode exactly once. Reject Windows separators on every platform as well.
    let decoded = percent_encoding::percent_decode_str(path).decode_utf8().ok()?.into_owned();
    if decoded.contains(['\\', '\0']) || decoded.split('/').any(|part| part.contains(':')) {
        return None;
    }
    if Path::new(&decoded).components().any(|c| !matches!(c, Component::Normal(_) | Component::CurDir)) {
        return None;
    }
    Some(decoded)
}

pub(super) async fn serve(root: &Path, rel: &str, request: &Parts) -> Response {
    let Some(rel) = relative(rel) else {
        return empty(StatusCode::NOT_FOUND);
    };
    let Ok(path) = tokio::fs::canonicalize(root.join(rel)).await else {
        return empty(StatusCode::NOT_FOUND);
    };
    if !path.starts_with(root) {
        return empty(StatusCode::NOT_FOUND);
    }
    let Ok(mut file) = tokio::fs::File::open(&path).await else {
        return empty(StatusCode::NOT_FOUND);
    };
    let Ok(meta) = file.metadata().await else {
        return empty(StatusCode::NOT_FOUND);
    };
    if !meta.is_file() {
        return empty(StatusCode::NOT_FOUND);
    }
    let size = meta.len();
    let mut response = Response::builder()
        .header("content-type", mime_guess::from_path(&path).first_or_octet_stream().as_ref())
        .header("accept-ranges", "bytes")
        .header("cache-control", "no-cache");
    let range = request.headers.get("range").and_then(|h| h.to_str().ok());
    let (start, length) = match byte_range(range, size) {
        Ok(Some((start, end))) => {
            response = response
                .status(StatusCode::PARTIAL_CONTENT)
                .header("content-range", format!("bytes {start}-{end}/{size}"));
            (start, end - start + 1)
        }
        Ok(None) => (0, size),
        Err(()) => {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header("content-range", format!("bytes */{size}"))
                .body(Body::empty())
                .unwrap();
        }
    };
    if start > 0 && file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
        return empty(StatusCode::INTERNAL_SERVER_ERROR);
    }
    response
        .header("content-length", length)
        .body(if request.method == Method::HEAD {
            Body::empty()
        } else {
            Body::from_stream(ReaderStream::new(file.take(length)))
        })
        .unwrap()
}

fn byte_range(header: Option<&str>, size: u64) -> Result<Option<(u64, u64)>, ()> {
    let Some(value) = header.and_then(|h| h.strip_prefix("bytes=")) else {
        return Ok(None);
    };
    // Unsupported multipart ranges fall back to a full response.
    if value.contains(',') {
        return Ok(None);
    }
    let (a, b) = value.split_once('-').ok_or(())?;
    if size == 0 {
        return Err(());
    }
    let (start, end) = if a.is_empty() {
        let length: u64 = b.parse().map_err(|_| ())?;
        if length == 0 {
            return Err(());
        }
        (size.saturating_sub(length), size - 1)
    } else {
        (
            a.parse::<u64>().map_err(|_| ())?,
            if b.is_empty() {
                size - 1
            } else {
                b.parse::<u64>().map_err(|_| ())?.min(size - 1)
            },
        )
    };
    if start >= size || start > end {
        return Err(());
    }
    Ok(Some((start, end)))
}

pub(super) fn viewer(request: &Parts) -> Response {
    let Some(path) = relative(request.uri.path().trim_start_matches('/')) else {
        return empty(StatusCode::NOT_FOUND);
    };
    const NOT_BUILT: &[u8] =
        b"<!doctype html><meta charset=utf-8><title>Mekuru Movie Maker</title><h1>The viewer is not built</h1><pre>bun install\nbun run build</pre>";
    let (name, bytes) = ASSETS
        .iter()
        .find(|(name, _)| *name == path)
        .or_else(|| ASSETS.iter().find(|(name, _)| *name == "index.html"))
        .copied()
        .unwrap_or(("index.html", NOT_BUILT));
    Response::builder()
        .header("content-type", mime_guess::from_path(name).first_or_octet_stream().as_ref())
        .header("cache-control", "no-cache")
        .header("content-length", bytes.len())
        .body(if request.method == Method::HEAD { Body::empty() } else { Body::from(bytes) })
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ranges_and_paths() {
        assert_eq!(byte_range(Some("bytes=2-4"), 10), Ok(Some((2, 4))));
        assert_eq!(byte_range(Some("bytes=7-"), 10), Ok(Some((7, 9))));
        assert_eq!(byte_range(Some("bytes=-2"), 10), Ok(Some((8, 9))));
        assert_eq!(byte_range(Some("bytes=-20"), 10), Ok(Some((0, 9))));
        assert_eq!(byte_range(Some("bytes=0-99"), 10), Ok(Some((0, 9))));
        for value in ["bytes=-0", "bytes=20-", "bytes=9-2", "bytes=999999999999999999999999-"] {
            assert!(byte_range(Some(value), 10).is_err());
        }
        assert!(byte_range(Some("bytes=0-"), 0).is_err());
        for path in ["../a", "%2e%2e%2fa", "%FF", "a%00", "C:/x", "a%5c..%5cx", "/etc/passwd"] {
            assert!(relative(path).is_none(), "{path}");
        }
        assert_eq!(relative("font%20日本語.ttf").as_deref(), Some("font 日本語.ttf"));
    }
}
