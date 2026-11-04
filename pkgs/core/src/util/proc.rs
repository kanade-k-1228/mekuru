use anyhow::{Context, Result, bail};
use std::process::{Child, Command, Output, Stdio};

pub fn run_checked(mut cmd: Command) -> Result<Output> {
    let out = cmd
        .stdin(Stdio::null())
        .output()
        .with_context(|| format!("failed to start `{}` (is it installed and on PATH?)", cmd.get_program().display()))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        bail!("{cmd:?} failed ({}):\n{}", out.status, tail(&err, 20));
    }
    Ok(out)
}

pub fn tail(s: &str, lines: usize) -> String {
    let v: Vec<&str> = s.lines().collect();
    v[v.len().saturating_sub(lines)..].join("\n")
}

pub struct ChildGuard(pub Option<Child>);

impl ChildGuard {
    pub fn child(&mut self) -> &mut Child {
        self.0.as_mut().expect("child taken")
    }
}

impl Drop for ChildGuard {
    fn drop(&mut self) {
        if let Some(mut c) = self.0.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}
