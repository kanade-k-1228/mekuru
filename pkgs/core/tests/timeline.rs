use mekuru_compiler::{Project, ir::Target, prepare::Prepared, timeline};
use std::path::Path;
#[test]
fn timeline_is_the_schedule_with_source_identity() {
    let xml = r#"<mekuru fps="29.97"><seq id="chapter"><dur len="3" id="wait"/><dur len="10"><stack id="scene"><text id="caption">Hello</text></stack></dur></seq></mekuru>"#;
    let p = Project::from_source(Path::new("test.xml"), None, xml.into());
    let s = p.schedule(&Prepared::default());
    let t = timeline::resolved(&p, &s);
    assert_eq!((t.fps.num, t.fps.den, t.frames), (30000, 1001, 13));
    assert_eq!(t.entries.len(), p.script.nodes.len() + p.script.elems.len());
    for (name, target) in &p.script.ids {
        let entry = t.entries.iter().find(|e| e.source_id.as_ref() == Some(name)).unwrap();
        let (start, end) = match target {
            Target::Node(n) => (s.nodes[*n].start, s.nodes[*n].end),
            Target::Elem(e) => (s.elems[*e].start, s.elems[*e].end),
        };
        assert_eq!((entry.start_frame, entry.end_frame), (start, end));
    }
    let compact = timeline::compile(Path::new("test.xml"), None, xml.into());
    let formatted = timeline::compile(Path::new("test.xml"), None, xml.replace("><", ">\n<"));
    assert_eq!(
        serde_json::to_value(compact.timeline).unwrap(),
        serde_json::to_value(formatted.timeline).unwrap()
    );
}
#[test]
fn repeat_ids_are_local_and_intervals_remain_compact() {
    let xml = r#"<mekuru><dur len="11"><repeat id="outer"><dur len="4"><repeat><dur id="cue" len="2"/></repeat></dur></repeat><repeat><dur id="cue" len="3"/></repeat></dur></mekuru>"#;
    let result = timeline::compile(Path::new("test.xml"), None, xml.into());
    let t = result.timeline.expect("valid repeat timeline");
    let cues: Vec<_> = t.entries.iter().filter(|e| e.source_id.as_deref() == Some("cue")).collect();
    assert_eq!(cues.len(), 2);
    assert_eq!(cues[0].repeat.len(), 2);
    assert_eq!(cues[1].repeat.len(), 1);
    assert!(t.entries.iter().all(|e| e.parent.as_ref().is_none_or(|p| t.entries.iter().any(|e| &e.id == p))));
}
#[test]
fn draft_and_errors_are_explicit() {
    let result = timeline::compile(
        Path::new("test.xml"),
        None,
        r#"<mekuru><dur len="30"><audio draft="true"/></dur></mekuru>"#.into(),
    );
    assert!(result.timeline.unwrap().estimated);
    let result = timeline::compile(Path::new("test.xml"), None, "<wrong/>".into());
    assert!(result.timeline.is_none());
    assert!(!result.diagnostics.is_empty());
}

#[test]
fn cli_supports_stdin_and_rejects_render_options() {
    use std::{
        io::Write,
        process::{Command, Stdio},
    };
    let mut child = Command::new(env!("CARGO_BIN_EXE_mekuru-compiler"))
        .args(["-", "--emit-timeline"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(br#"<mekuru><dur id="cue" len="30"/></mekuru>"#).unwrap();
    let out = child.wait_with_output().unwrap();
    assert!(out.status.success());
    let result: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(result["timeline"]["frames"], 30);
    assert_eq!(result["diagnostics"], serde_json::json!([]));
    for args in [vec!["--from", "0"], vec!["--fps", "60"], vec!["--emit-preview"], vec!["--preview-worker"]] {
        let out = Command::new(env!("CARGO_BIN_EXE_mekuru-compiler"))
            .args(["-", "--emit-timeline"])
            .args(args)
            .output()
            .unwrap();
        assert!(!out.status.success());
    }
}
