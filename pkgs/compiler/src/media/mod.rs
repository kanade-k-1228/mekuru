pub mod args;
pub mod image;
pub mod pcm;
pub mod probe;
pub mod video;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fps {
    pub num: u32,
    pub den: u32,
}

impl Fps {
    pub fn from_f64(f: f64) -> Fps {
        for (n, d) in [(24000, 1001), (30000, 1001), (60000, 1001)] {
            if (f - n as f64 / d as f64).abs() < 0.005 {
                return Fps { num: n, den: d };
            }
        }
        if (f - f.round()).abs() < 1e-6 {
            Fps { num: f.round() as u32, den: 1 }
        } else {
            Fps { num: (f * 1000.0).round() as u32, den: 1000 }
        }
    }

    pub fn as_f64(&self) -> f64 {
        self.num as f64 / self.den as f64
    }

    pub fn time(&self, k: u64) -> f64 {
        self.secs(k as f64)
    }

    pub fn secs(&self, frames: f64) -> f64 {
        frames * self.den as f64 / self.num as f64
    }

    pub fn of(&self, secs: f64) -> f64 {
        secs * self.num as f64 / self.den as f64
    }

    pub fn frames(&self, secs: f64) -> u64 {
        (secs * self.as_f64() - 1e-6).ceil().max(0.0) as u64
    }
}
