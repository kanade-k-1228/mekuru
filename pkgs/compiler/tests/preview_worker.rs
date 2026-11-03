use mekuru_compiler::preview::{Request, Worker};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

fn wire(value: impl serde::Serialize) -> serde_json::Result<Value> {
    serde_json::from_slice(&serde_json::to_vec(&value)?)
}

struct Session {
    worker: Worker,
    resources: HashMap<String, Value>,
    version: u64,
}
impl Session {
    fn new() -> Self {
        Self {
            worker: Worker::default(),
            resources: HashMap::new(),
            version: 0,
        }
    }
    fn compile(&mut self, root: &Path, xml: &str) -> Value {
        self.version += 1;
        let result = wire(self.worker.compile(
            Path::new("-"),
            Some(root),
            Request {
                version: self.version,
                xml: xml.into(),
                known_resources: self.resources.keys().cloned().collect(),
            },
        ))
        .unwrap();
        for (key, ops) in result["resources"].as_object().unwrap() {
            self.resources.insert(key.clone(), ops.clone());
        }
        let mut expanded = result["preview"].clone();
        if !expanded.is_null() {
            for entries in [&expanded["elements"], &expanded["timeline"]["nodes"], &expanded["timeline"]["clips"]] {
                let entries = entries.as_array().unwrap();
                let keys: std::collections::HashSet<_> = entries.iter().map(|e| e["key"].as_str().unwrap()).collect();
                assert_eq!(keys.len(), entries.len(), "duplicate preview keys");
            }
            let mut used = std::collections::HashSet::new();
            for element in expanded["elements"].as_array_mut().unwrap() {
                let drawings = element.as_object_mut().unwrap().remove("drawings").unwrap();
                let mut ops = vec![];
                for key in drawings.as_array().unwrap() {
                    let key = key.as_str().unwrap();
                    used.insert(key.to_string());
                    ops.extend(self.resources[key].as_array().unwrap().iter().cloned().map(|mut op| {
                        op.as_object_mut().unwrap().remove("revision");
                        op
                    }));
                }
                element["ops"] = json!(ops);
                element.as_object_mut().unwrap().remove("key");
                if let Some(media) = element["media"].as_object_mut() {
                    media.remove("revision");
                }
            }
            self.resources.retain(|k, _| used.contains(k));
            for name in ["nodes", "clips"] {
                for entry in expanded["timeline"][name].as_array_mut().unwrap() {
                    entry.as_object_mut().unwrap().remove("key");
                }
            }
        }
        // A fresh process keeps the uncached reference independent of resident caches.
        let mut proc = Command::new(env!("CARGO_BIN_EXE_mekuru-compiler"))
            .args(["-", "--emit-preview", "--root"])
            .arg(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        proc.stdin.take().unwrap().write_all(xml.as_bytes()).unwrap();
        let output = proc.wait_with_output().unwrap();
        assert!(output.status.success());
        let reference: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(expanded, reference["preview"], "{xml}");
        assert_eq!(result["diagnostics"], reference["diagnostics"], "{xml}");
        result
    }
}

fn document(body: &str) -> String {
    format!(r#"<mekuru size="640x360" fps="30"><seq>{body}</seq></mekuru>"#)
}
fn assert_success(r: &Value) {
    assert!(!r["preview"].is_null(), "{}", r["diagnostics"]);
}

#[test]
fn edits_match_single_shot_and_only_changed_viewops_are_sent() {
    let mut session = Session::new();
    let root = Path::new(".");
    let base = document(r#"<dur len="30"><stack><text x="10" y="10">Alpha</text><text x="10" y="80">Bravo</text></stack></dur>"#);
    let a = session.compile(root, &base);
    assert_success(&a);
    assert_eq!(a["stats"]["drawMisses"], 2);
    let b = session.compile(root, &base.replace("Alpha", "Alpine"));
    assert_eq!(b["stats"]["drawHits"], 1);
    assert_eq!(b["stats"]["drawMisses"], 1);
    assert_eq!(b["resources"].as_object().unwrap().len(), 1);
    assert_eq!(a["preview"]["elements"][0]["key"], b["preview"]["elements"][0]["key"]);
    let c = session.compile(root, &base.replace("Alpha", "Alpine").replace("len=\"30\"", "len=\"60\""));
    assert_eq!(c["stats"]["drawHits"], 2);
    assert_eq!(c["resources"], json!({}));
    let bad = session.compile(root, "<mekuru>");
    assert!(bad["preview"].is_null());
    let d = session.compile(root, &base.replace("Alpha", "Alpine"));
    assert_eq!(d["resources"], json!({}));
    assert_eq!(c["preview"]["elements"][0]["key"], d["preview"]["elements"][0]["key"]);

    for xml in [
        base.replace("<stack>", "<column w=\"120\"> ").replace("</stack>", "</column>"),
        base.replace("<stack>", "<column w=\"260\" rotate=\"20\"> ").replace("</stack>", "</column>"),
        base.replace("fps=\"30\"", "fps=\"30\" font=\"DejaVu Serif\""),
        base.replace("<text x=", "<text size=\"28\" weight=\"bold\" align=\"center\" stroke=\"#000\" x="),
    ] {
        assert_success(&session.compile(root, &xml));
    }
}

#[test]
fn insertion_deletion_reordering_duplicate_elements_repeats_references_and_draft_speech() {
    let mut session = Session::new();
    let root = Path::new(".");
    let a = r#"<dur len="30"><rect w="20" h="20"/></dur>"#;
    let b = r#"<dur len="60"><circle w="30" h="30"/></dur>"#;
    for body in [format!("{a}{b}"), format!("{b}{a}{b}"), format!("{a}{b}{b}"), b.into(), format!("{a}{b}")] {
        assert_success(&session.compile(root, &document(&body)));
    }
    let repeated = document(
        r#"<dur len="120"><stack><repeat><seq><dur id="a" len="30"><text>A</text></dur><dur len="20" at="a:10"><text>B</text></dur></seq></repeat><seq><dur len="60"><audio draft="true" label="Speech"/><text>Caption</text></dur></seq></stack></dur>"#,
    );
    assert_success(&session.compile(root, &repeated));
    let edited = session.compile(root, &repeated.replace("len=\"60\"", "len=\"90\""));
    assert_success(&edited);
    assert_eq!(edited["resources"], json!({}));
}

#[test]
fn discarded_responses_and_evicted_cache_entries_never_lose_resources() {
    let mut worker = Worker::new(1); // Every drawing exceeds this cache budget.
    let xml = document(r#"<dur len="30"><text>Cache</text></dur>"#);
    let run = |w: &mut Worker, known| {
        wire(w.compile(
            Path::new("-"),
            None,
            Request {
                version: 1,
                xml: xml.clone(),
                known_resources: known,
            },
        ))
        .unwrap()
    };
    let a = run(&mut worker, vec![]);
    let b = run(&mut worker, vec![]); // CLI discarded a, so advertises no resources.
    assert_eq!(a["resources"], b["resources"]);
    let known = a["resources"].as_object().unwrap().keys().cloned().collect();
    let c = run(&mut worker, known);
    assert_eq!(c["resources"], json!({}));
    assert_eq!(c["stats"]["drawMisses"], 1);
}

struct Temp(PathBuf);
impl Temp {
    fn new(name: &str) -> Self {
        let path = std::env::temp_dir().join(format!("mekuru-preview-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn file_metadata_invalidates_image_and_font_caches() {
    let dir = Temp::new("assets");
    let mut session = Session::new();
    let image = dir.0.join("a.png");
    image::RgbaImage::from_pixel(20, 10, image::Rgba([255, 0, 0, 255])).save(&image).unwrap();
    let xml = document(r#"<dur len="30"><image src="a.png"/></dur>"#);
    let a = session.compile(&dir.0, &xml);
    assert_success(&a);
    image::RgbaImage::from_pixel(30, 20, image::Rgba([0, 255, 0, 255])).save(&image).unwrap();
    let b = session.compile(&dir.0, &xml);
    assert_ne!(a["preview"]["elements"][0]["drawings"], b["preview"]["elements"][0]["drawings"]);
    assert_eq!(b["stats"]["drawMisses"], 1);
    // Discover fonts portably from the same database used by the compiler.
    let mut db = cosmic_text::fontdb::Database::new();
    db.load_system_fonts();
    let files: Vec<_> = db
        .faces()
        .filter_map(|face| match &face.source {
            cosmic_text::fontdb::Source::File(path) | cosmic_text::fontdb::Source::SharedFile(path, _) => Some(path.clone()),
            _ => None,
        })
        .collect();
    if files.len() < 2 {
        return;
    }
    let font = dir.0.join("custom.ttf");
    std::fs::copy(&files[0], &font).unwrap();
    let xml = document(r#"<dur len="30"><text font="custom.ttf">Font test</text></dur>"#);
    assert_success(&session.compile(&dir.0, &xml));
    std::fs::copy(&files[1], &font).unwrap();
    let changed = session.compile(&dir.0, &xml);
    assert_success(&changed);
    assert_eq!(changed["stats"]["drawMisses"], 1);
}

#[test]
fn media_probe_changes_and_hold_edits_match_single_shot() {
    let dir = Temp::new("media");
    let output = Command::new("ffmpeg")
        .args(["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=30:d=2", "-c:v", "mpeg4"])
        .arg(dir.0.join("a.mp4"))
        .status();
    if !output.is_ok_and(|s| s.success()) {
        eprintln!("ffmpeg unavailable; skipping media fixture");
        return;
    }
    let mut session = Session::new();
    let xml = document(
        r#"<stack><video id="v" src="a.mp4"><hold at="10"><dur len="20"><text>Wait</text></dur></hold></video><dur len="10" at="v:20"><text>After</text></dur></stack>"#,
    );
    let a = session.compile(&dir.0, &xml);
    assert_success(&a);
    let b = session.compile(&dir.0, &xml.replace("len=\"20\"", "len=\"40\""));
    assert_success(&b);
    assert_eq!(b["resources"], json!({}));
    assert!(
        Command::new("ffmpeg")
            .args(["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x32:r=30:d=3", "-c:v", "mpeg4"])
            .arg(dir.0.join("a.mp4"))
            .status()
            .unwrap()
            .success()
    );
    let c = session.compile(&dir.0, &xml);
    assert_success(&c);
    assert_ne!(a["preview"]["duration"], c["preview"]["duration"]);
}

#[test]
fn cached_drawing_warnings_use_current_source_lines() {
    let mut session = Session::new();
    let xml = document(r#"<dur len="30"><text size="0">Invisible</text></dur>"#);
    let first = session.compile(Path::new("."), &xml);
    let next = session.compile(Path::new("."), &xml.replace("<dur", "<!-- new source line --><dur"));
    assert_success(&first);
    assert_success(&next);
    assert_eq!(next["stats"]["drawHits"], 1);
    assert_eq!(next["resources"], json!({}));
    assert_eq!(first["diagnostics"][0]["code"], "W560");
    assert_ne!(first["diagnostics"][0]["line"], next["diagnostics"][0]["line"]);
}
