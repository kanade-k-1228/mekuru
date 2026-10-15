use anyhow::{Result, bail};
use clap::Parser;
use mekuru_compiler::Project;
use mekuru_compiler::lang::diag::Diag;
use mekuru_compiler::pipeline::{self, RenderCtx, RenderOptions};
use mekuru_compiler::prepare::{Prepared, prepare};
use mekuru_compiler::progress::{Progress, Stage};
use mekuru_compiler::schedule::Schedule;
use std::cell::Cell;
use std::io::{IsTerminal, Write};
use std::path::{Path, PathBuf};

#[derive(Parser)]
#[command(name = "mekuru-compiler", version, about, args_override_self = true)]
struct Cli {
    script: PathBuf,
    #[arg(long)]
    root: Option<PathBuf>,
    #[arg(short, long)]
    output: Option<PathBuf>,
    #[arg(long)]
    scale: Option<f32>,
    #[arg(long)]
    fps: Option<f64>,
    #[arg(long, default_value_t = 0.0)]
    from: f64,
    #[arg(long)]
    to: Option<f64>,
    #[arg(long)]
    preset: Option<String>,
    #[arg(long)]
    crf: Option<u8>,
    #[arg(long)]
    no_audio: bool,
    #[arg(long)]
    preview: bool,
    #[arg(long)]
    emit_preview: bool,
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("warn")).init();
    if let Err(e) = run(Cli::parse()) {
        eprintln!("error: {e:#}");
        std::process::exit(1);
    }
}

fn run(cli: Cli) -> Result<()> {
    let Cli {
        script,
        root,
        output,
        scale,
        fps,
        from,
        to,
        preset,
        crf,
        no_audio,
        preview,
        emit_preview,
    } = cli;
    if emit_preview {
        let source = if script == Path::new("-") {
            std::io::read_to_string(std::io::stdin())?
        } else {
            std::fs::read_to_string(&script)?
        };
        let result = mekuru_compiler::preview::compile(&script, root.as_deref(), source);
        serde_json::to_writer(std::io::stdout().lock(), &result)?;
        return Ok(());
    }
    let p = load(&script, root.as_deref())?;
    let mut opts = if preview { RenderOptions::preview() } else { RenderOptions::default() };
    opts.scale = scale.unwrap_or(opts.scale);
    opts.fps = fps.or(opts.fps);
    opts.from = from;
    opts.to = to;
    opts.preset = preset.or(opts.preset);
    opts.crf = crf.or(opts.crf);
    opts.audio = !no_audio;
    if !(0.05..=4.0).contains(&opts.scale) {
        bail!("--scale must be between 0.05 and 4");
    }
    let out = output.unwrap_or_else(|| p.default_output());
    let (prepared, sched) = prepare_and_schedule(&p)?;
    let ctx = RenderCtx {
        project: &p,
        prepared: &prepared,
        sched: &sched,
    };
    let printer = Printer::new();
    let stats = pipeline::render_video(&ctx, &out, &opts, &|e| printer.emit(e))?;
    printer.done();
    for w in &stats.warnings {
        eprintln!("warning: {w}");
    }
    eprintln!(
        "wrote {} ({}x{}, {} frames, {}) in {:.1}s",
        out.display(),
        stats.width,
        stats.height,
        stats.frames,
        clock(stats.seconds),
        stats.elapsed
    );
    Ok(())
}

fn load(script: &Path, root: Option<&Path>) -> Result<Project> {
    let p = Project::load(script, root)?;
    print_diags(&p, &p.diags);
    if p.has_errors() {
        bail!("the script has errors");
    }
    Ok(p)
}

fn prepare_and_schedule(p: &Project) -> Result<(Prepared, Schedule)> {
    let printer = Printer::new();
    let prepared = prepare(&p.script, &p.cache(), &|e| printer.emit(e));
    printer.done();
    print_diags(p, &prepared.diags);
    if prepared.diags.iter().any(Diag::is_error) {
        bail!("cannot continue because of the errors above");
    }
    let sched = p.schedule(&prepared);
    print_diags(p, &sched.diags);
    if sched.diags.iter().any(Diag::is_error) {
        bail!("cannot continue because of the errors above");
    }
    Ok((prepared, sched))
}

fn print_diags(p: &Project, diags: &[Diag]) {
    let name = p.path.display().to_string();
    let mut sorted: Vec<&Diag> = diags.iter().collect();
    sorted.sort_by_key(|d| (d.span.lo, d.sev));
    for d in sorted {
        eprint!("{}", d.render(&name, &p.source, &p.index));
    }
}

fn clock(t: f64) -> String {
    let s = t.max(0.0).floor() as u64;
    if s >= 3600 {
        format!("{}:{:02}:{:02}", s / 3600, s / 60 % 60, s % 60)
    } else {
        format!("{:02}:{:02}", s / 60, s % 60)
    }
}

struct Printer {
    tty: bool,
    shown: Cell<bool>,
}

impl Printer {
    fn new() -> Printer {
        Printer {
            tty: std::io::stderr().is_terminal(),
            shown: Cell::new(false),
        }
    }

    fn emit(&self, p: Progress) {
        if !self.tty {
            return;
        }
        let s = match p {
            Progress::Stage { stage: Stage::Prepare } => "preparing media…".to_string(),
            Progress::Stage { stage: Stage::Mix } => "mixing audio…".to_string(),
            Progress::Stage { stage: Stage::Render } => "rendering frames…".to_string(),
            Progress::Stage { stage: Stage::Finalize } => "finishing…".to_string(),
            Progress::Frames { done, total, elapsed } => {
                let pct = done as f64 / total.max(1) as f64 * 100.0;
                let fps = done as f64 / elapsed.max(1e-3);
                let eta = (total - done) as f64 / fps.max(1e-3);
                format!("frames {done}/{total} ({pct:.0}%)  {fps:.0} fps  ETA {}", clock(eta))
            }
        };
        let mut err = std::io::stderr();
        let _ = write!(err, "\r\x1b[2K{s}");
        let _ = err.flush();
        self.shown.set(true);
    }

    fn done(&self) {
        if self.shown.replace(false) {
            eprintln!();
        }
    }
}
