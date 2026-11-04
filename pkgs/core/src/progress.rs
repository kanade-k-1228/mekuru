#[derive(Clone, Copy, Debug)]
pub enum Progress {
    Prepare,
    Mix,
    Render,
    Finalize,
    Frames { done: u64, total: u64, elapsed: f64 },
}
