use anyhow::{Context, Result};
use image::imageops::FilterType;
use std::path::Path;
use tiny_skia::Pixmap;

pub fn dims(path: &Path) -> Result<(u32, u32)> {
    image::image_dimensions(path).with_context(|| format!("cannot read image {}", path.display()))
}

pub fn load(path: &Path, w: u32, h: u32) -> Result<Pixmap> {
    let img = image::open(path).with_context(|| format!("cannot decode image {}", path.display()))?;
    let mut rgba = img.to_rgba8();
    let (w, h) = (w.max(1), h.max(1));
    premultiply(&mut rgba);
    if (rgba.width(), rgba.height()) != (w, h) {
        rgba = image::imageops::resize(&rgba, w, h, FilterType::CatmullRom);
        for p in rgba.pixels_mut() {
            let a = p[3];
            for v in p.0.iter_mut().take(3) {
                *v = (*v).min(a);
            }
        }
    }
    let size = tiny_skia::IntSize::from_wh(w, h).context("empty image")?;
    Pixmap::from_vec(rgba.into_raw(), size).context("invalid image buffer")
}

fn premultiply(img: &mut image::RgbaImage) {
    for p in img.pixels_mut() {
        let a = p[3] as u32;
        if a < 255 {
            for v in p.0.iter_mut().take(3) {
                *v = ((*v as u32 * a + 127) / 255) as u8;
            }
        }
    }
}
