#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stage {
    Prepare,
    Mix,
    Render,
    Finalize,
}

#[derive(Clone, Debug)]
pub enum Progress {
    Stage { stage: Stage },
    Frames { done: u64, total: u64, elapsed: f64 },
}
