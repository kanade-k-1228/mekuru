use crate::{
    Project, analysis,
    ir::{ElemKind, NodeKind},
    preview::Diagnostic,
    schedule::{Repeat, Schedule},
};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct Compilation {
    pub timeline: Option<Timeline>,
    pub diagnostics: Vec<Diagnostic>,
}
#[derive(Serialize)]
pub struct FrameRate {
    pub num: u32,
    pub den: u32,
}
#[derive(Serialize)]
pub struct Timeline {
    pub fps: FrameRate,
    pub frames: i64,
    pub estimated: bool,
    pub entries: Vec<Entry>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub parent: Option<String>,
    pub source_id: Option<String>,
    pub kind: &'static str,
    pub start_frame: i64,
    pub end_frame: i64,
    pub repeat: Vec<Repetition>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repetition {
    pub from_frame: i64,
    pub period_frames: i64,
    pub until_frame: i64,
}
fn repetitions(rs: &[Repeat]) -> Vec<Repetition> {
    rs.iter()
        .map(|r| Repetition {
            from_frame: r.from,
            period_frames: r.period,
            until_frame: r.until,
        })
        .collect()
}
pub fn resolved(p: &Project, s: &Schedule) -> Timeline {
    let mut entries = vec![];
    for n in &p.script.nodes {
        let t = s.nodes[n.id];
        entries.push(Entry {
            id: format!("n:{}", n.id),
            parent: n.parent.map(|p| format!("n:{p}")),
            source_id: n.source_id.clone(),
            kind: match n.kind {
                NodeKind::Seq => "seq",
                NodeKind::Par => "par",
                NodeKind::Repeat => "repeat",
            },
            start_frame: t.start,
            end_frame: t.end,
            repeat: repetitions(n.parent.map_or(&[], |p| s.repeats[p].as_slice())),
        });
    }
    for e in &p.script.elems {
        let t = &s.elems[e.id];
        entries.push(Entry {
            id: format!("e:{}", e.id),
            parent: Some(format!("n:{}", e.node)),
            source_id: e.source_id.clone(),
            kind: e.kind.name(),
            start_frame: t.start,
            end_frame: t.end,
            repeat: repetitions(&t.repeat),
        });
    }
    let fps = p.script.settings.rate();
    Timeline {
        fps: FrameRate { num: fps.num, den: fps.den },
        frames: s.total,
        estimated: p.script.elems.iter().any(|e| matches!(e.kind, ElemKind::DraftAudio)),
        entries,
    }
}
pub fn compile(path: &Path, root: Option<&Path>, source: String) -> Compilation {
    let (p, result, diags) = analysis::analyze(path, root, source);
    Compilation {
        timeline: result.map(|(_, s)| resolved(&p, &s)),
        diagnostics: analysis::diagnostics(&p, &diags),
    }
}
