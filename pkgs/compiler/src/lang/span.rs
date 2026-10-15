#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct Span {
    pub lo: u32,
    pub hi: u32,
}

impl Span {
    pub fn new(lo: usize, hi: usize) -> Self {
        Span { lo: lo as u32, hi: hi as u32 }
    }

    pub fn to(self, other: Span) -> Span {
        Span {
            lo: self.lo.min(other.lo),
            hi: self.hi.max(other.hi),
        }
    }
}

#[derive(Clone, Debug)]
pub struct LineIndex {
    starts: Vec<u32>,
    len: u32,
}

impl LineIndex {
    pub fn new(src: &str) -> Self {
        let mut starts = vec![0];
        for (i, b) in src.bytes().enumerate() {
            if b == b'\n' {
                starts.push(i as u32 + 1);
            }
        }
        LineIndex { starts, len: src.len() as u32 }
    }

    pub fn line(&self, off: u32) -> u32 {
        let off = off.min(self.len);
        match self.starts.binary_search(&off) {
            Ok(i) => i as u32 + 1,
            Err(i) => i as u32,
        }
    }

    pub fn line_start(&self, line: u32) -> u32 {
        let i = (line.max(1) - 1) as usize;
        self.starts.get(i).copied().unwrap_or(self.len)
    }

    pub fn line_range(&self, src: &str, line: u32) -> (usize, usize) {
        let lo = self.line_start(line) as usize;
        let hi = src[lo..].find('\n').map_or(src.len(), |i| lo + i);
        (lo, hi)
    }

    pub fn col_chars(&self, src: &str, off: u32) -> u32 {
        let lo = self.line_start(self.line(off)) as usize;
        let off = (off as usize).min(src.len());
        src.get(lo..off).map_or(0, |s| s.chars().count()) as u32 + 1
    }
}
