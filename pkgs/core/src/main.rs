use anyhow::{Result, bail};
use clap::Parser;
use mekuru_compiler::Project;
use mekuru_compiler::lang::diag::Diag;
use mekuru_compiler::pipeline::{self, RenderOptions};
use mekuru_compiler::prepare::prepare;
use mekuru_compiler::progress::Progress;
use mekuru_compiler::render::RenderCtx;
use std::cell::Cell;
use std::io::{IsTerminal, Write};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "mekuru-compiler", version, about, args_override_self = true)]
struct Cli {
    script: PathBuf,
    /// Watch XML and serve the embedded browser viewer from this process.
    #[arg(long, conflicts_with_all = ["output", "scale", "fps", "from", "to", "preset", "crf", "no_audio", "preview"])]
    serve: bool,
    /// Run a script command in the project folder while serving.
    #[arg(long, requires = "serve")]
    run: Option<String>,
    #[arg(short = 'p', long, default_value_t = 3333, requires = "serve")]
    port: u16,
    /// Do not open a browser (also when MEKURU_OPEN=0).
    #[arg(long, requires = "serve")]
    no_open: bool,
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
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("warn")).init();
    if let Err(e) = run(Cli::parse()) {
        eprintln!("error: {e:#}");
        std::process::exit(1);
    }
}

fn run(cli: Cli) -> Result<()> {
    if cli.serve {
        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build()?;
        let result = runtime.block_on(mekuru_compiler::server::run(mekuru_compiler::server::Options {
            xml: cli.script,
            root: cli.root,
            run: cli.run,
            port: cli.port,
            open: !cli.no_open && std::env::var_os("MEKURU_OPEN").is_none_or(|v| v != "0"),
        }));
        runtime.shutdown_timeout(std::time::Duration::from_secs(2));
        return result;
    }
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
        ..
    } = cli;
    let project = Project::load(&script, root.as_deref())?;
    let cache = project.cache();
    let printer = Printer::new();
    let compilation = mekuru_compiler::analysis::Compilation::new(project, |script, diags| {
        printer.emit(Progress::Prepare);
        prepare(script, &cache, diags)
    });
    printer.done();
    let p = &compilation.project;
    print_diags(p, &p.diags);
    let Some(resolved) = &compilation.resolved else {
        bail!("cannot continue because of the errors above");
    };
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
    let ctx = RenderCtx {
        project: p,
        prepared: &resolved.prepared,
        sched: &resolved.schedule,
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

fn print_diags(p: &Project, diags: &[Diag]) {
    let name = p.path.display().to_string();
    let mut sorted: Vec<&Diag> = diags.iter().collect();
    sorted.sort_by_key(|d| (d.span.lo, !d.is_error()));
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
            Progress::Prepare => "preparing media…".to_string(),
            Progress::Mix => "mixing audio…".to_string(),
            Progress::Render => "rendering frames…".to_string(),
            Progress::Finalize => "finishing…".to_string(),
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
