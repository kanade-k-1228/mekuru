use mekuru_compiler::{
    Project,
    prepare::Prepared,
    preview::{Session, delta::Published},
    render::{FrameRenderer, RenderCtx, RenderTarget},
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Command,
};

fn wire(value: impl serde::Serialize) -> Value {
    serde_json::to_value(value).unwrap()
}

/// One compile in a fresh session.
fn single(path: &Path, root: Option<&Path>, xml: &str) -> Value {
    let (diagnostics, scene) = Session::default().compile(path, root, xml.into(), 1);
    json!({
        "diagnostics": diagnostics,
        "preview": scene.as_ref().map(|s| &s.preview),
        "resources": scene.as_ref().map(|s| &s.resources),
    })
}

fn apply_collection(before: &Value, delta: &Value) -> Value {
    let mut entries: HashMap<_, _> = before
        .as_array()
        .unwrap()
        .iter()
        .map(|e| (e["key"].as_str().unwrap().to_owned(), e.clone()))
        .collect();
    for key in delta["remove"].as_array().unwrap() {
        entries.remove(key.as_str().unwrap());
    }
    for entry in delta["upsert"].as_array().unwrap() {
        entries.insert(entry["key"].as_str().unwrap().to_owned(), entry.clone());
    }
    let order: Vec<String> = delta["order"]
        .as_array()
        .map(|order| order.iter().map(|k| k.as_str().unwrap().to_owned()).collect())
        .unwrap_or_else(|| {
            before
                .as_array()
                .unwrap()
                .iter()
                .map(|e| e["key"].as_str().unwrap().to_owned())
                .filter(|k| entries.contains_key(k))
                .collect()
        });
    assert_eq!(order.len(), entries.len());
    json!(order.into_iter().map(|k| entries.remove(&k).unwrap()).collect::<Vec<_>>())
}

/// A viewer of one session: it gets what the server sends and checks the result against a fresh session.
struct Viewer {
    session: Session,
    shown: Option<Published>,
    version: u64,
    scene: Value,
    resources: HashMap<String, Value>,
}
impl Viewer {
    fn new() -> Self {
        Self {
            session: Session::default(),
            shown: None,
            version: 0,
            scene: Value::Null,
            resources: HashMap::new(),
        }
    }
    fn compile(&mut self, root: &Path, xml: &str) -> Value {
        self.version += 1;
        let (diagnostics, next) = self.session.compile(Path::new("-"), Some(root), xml.into(), self.version);
        let failed = next.is_none();
        // Like the server: nothing when the scene is unchanged, else a snapshot or a patch on the shown scene.
        let mut update = Value::Null;
        if let Some(next) = next.filter(|next| self.shown.as_ref().is_none_or(|shown| shown.preview.scene != next.preview.scene)) {
            if let Some(before) = &self.shown {
                update = wire(next.patch(before));
                update["type"] = json!("patch");
                assert_eq!(self.scene["version"], update["baseVersion"]);
                for (key, value) in update["scene"].as_object().unwrap() {
                    self.scene[key] = value.clone();
                }
                self.scene["version"] = update["version"].clone();
                self.scene["elements"] = apply_collection(&self.scene["elements"], &update["elements"]);
                for name in ["nodes", "clips"] {
                    self.scene["timeline"][name] = apply_collection(&self.scene["timeline"][name], &update[name]);
                }
                for (key, ops) in update["resources"].as_object().unwrap() {
                    self.resources.insert(key.clone(), ops.clone());
                }
            } else {
                update = json!({ "type": "snapshot", "resources": next.resources });
                self.scene = wire(&next.preview);
                self.resources = serde_json::from_value(update["resources"].clone()).unwrap();
            }
            self.shown = Some(next);
        }
        let preview = if failed {
            Value::Null
        } else {
            let mut scene = self.scene.clone();
            scene.as_object_mut().unwrap().remove("version");
            scene
        };
        let expanded = expand(preview.clone(), &mut self.resources);
        let reference = single(Path::new("-"), Some(root), xml);
        let mut reference_scene = reference["preview"].clone();
        if let Some(scene) = reference_scene.as_object_mut() {
            scene.remove("version");
        }
        let mut resources = serde_json::from_value(reference["resources"].clone()).unwrap_or_default();
        assert_eq!(expanded, expand(reference_scene, &mut resources), "{xml}");
        let diagnostics = wire(&diagnostics);
        assert_eq!(diagnostics, reference["diagnostics"], "{xml}");
        let stats = &self.session.stats;
        json!({
            "preview": preview,
            "update": update,
            "resources": update["resources"].as_object().map_or(json!({}), |r| json!(r)),
            "diagnostics": diagnostics,
            "stats": { "drawHits": stats.draw_hits, "drawMisses": stats.draw_misses },
        })
    }
}

fn expand(scene: Value, resources: &mut HashMap<String, Value>) -> Value {
    let mut expanded = scene;
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
                ops.extend(resources[key].as_array().unwrap().iter().cloned().map(|mut op| {
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
        resources.retain(|k, _| used.contains(k));
        for name in ["nodes", "clips"] {
            for entry in expanded["timeline"][name].as_array_mut().unwrap() {
                entry.as_object_mut().unwrap().remove("key");
            }
        }
    }

    expanded
}

fn document(body: &str) -> String {
    format!(r#"<mekuru size="640x360" fps="30"><seq>{body}</seq></mekuru>"#)
}
fn assert_success(r: &Value) {
    assert!(!r["preview"].is_null(), "{}", r["diagnostics"]);
}

#[test]
fn edits_match_a_fresh_session_and_only_changed_viewops_are_sent() {
    let mut session = Viewer::new();
    let root = Path::new(".");
    let base = document(r#"<dur len="30"><stack><text x="10" y="10" text="Alpha"/><text x="10" y="80" text="Bravo"/></stack></dur>"#);
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
        base.replace("fps=\"30\"", "fps=\"30\" lang=\"zh-TW\""),
        base.replace("<text x=", "<text size=\"28\" weight=\"bold\" align=\"center\" stroke=\"#000\" x="),
    ] {
        assert_success(&session.compile(root, &xml));
    }
}

#[test]
fn insertion_deletion_reordering_duplicate_elements_repeats_references_and_draft_speech() {
    let mut session = Viewer::new();
    let root = Path::new(".");
    let a = r#"<dur len="30"><rect w="20" h="20"/></dur>"#;
    let b = r#"<dur len="60"><circle w="30" h="30"/></dur>"#;
    for body in [format!("{a}{b}"), format!("{b}{a}{b}"), format!("{a}{b}{b}"), b.into(), format!("{a}{b}")] {
        assert_success(&session.compile(root, &document(&body)));
    }
    let repeated = document(
        r#"<dur len="120"><stack><repeat><seq><dur id="a" len="30"><text text="A"/></dur><dur len="20" at="a:10"><text text="B"/></dur></seq></repeat><seq><dur len="60"><audio draft="true" label="Speech"/><text text="Caption"/></dur></seq></stack></dur>"#,
    );
    assert_success(&session.compile(root, &repeated));
    let edited = session.compile(root, &repeated.replace("len=\"60\"", "len=\"90\""));
    assert_success(&edited);
    assert_eq!(edited["resources"], json!({}));
}

#[test]
fn evicted_cache_entries_never_lose_resources() {
    let mut session = Session::new(1); // Every drawing exceeds this cache budget.
    let xml = document(r#"<dur len="30"><text text="Cache"/></dur>"#);
    let (_, a) = session.compile(Path::new("-"), None, xml.clone(), 1);
    let (_, b) = session.compile(Path::new("-"), None, xml, 2);
    assert_eq!(session.stats.draw_misses, 1);
    assert_eq!(wire(a.unwrap().resources), wire(b.unwrap().resources));
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
    let mut session = Viewer::new();
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
    let mut files: Vec<_> = db
        .faces()
        .filter_map(|face| match &face.source {
            cosmic_text::fontdb::Source::File(path) | cosmic_text::fontdb::Source::SharedFile(path, _) => Some(path.clone()),
            _ => None,
        })
        .collect();
    files.sort();
    files.dedup();
    if files.len() < 2 {
        return;
    }
    let font = dir.0.join("custom.ttf");
    for xml in [
        document(r#"<dur len="30"><text font="custom.ttf" text="Font test"/></dur>"#),
        document(r#"<dur len="30"><text text="Font test"/></dur>"#).replace("fps=\"30\"", "fps=\"30\" font=\"custom.ttf\""),
    ] {
        std::fs::copy(&files[0], &font).unwrap();
        let first = session.compile(&dir.0, &xml);
        assert_success(&first);
        let ops = first["resources"].as_object().unwrap().values().next().unwrap();
        assert_eq!(ops[0]["kind"], "text");
        assert_eq!(ops[0]["fontSrc"], "custom.ttf");
        assert!(!ops[0]["font"].as_str().unwrap().contains("custom.ttf"));
        let revision = ops[0]["fontRevision"].clone();
        assert!(revision.is_string());
        std::fs::copy(&files[1], &font).unwrap();
        let changed = session.compile(&dir.0, &xml);
        assert_success(&changed);
        assert_eq!(changed["stats"]["drawMisses"], 1);
        let ops = changed["resources"].as_object().unwrap().values().next().unwrap();
        assert_ne!(ops[0]["fontRevision"], revision);
        assert_ne!(first["preview"]["elements"][0]["drawings"], changed["preview"]["elements"][0]["drawings"]);
    }
    // An external font may inform layout but is not published through /files/.
    let xml = document(&format!(r#"<dur len="30"><text font="{}" text="External"/></dur>"#, files[0].to_string_lossy()));
    let external = session.compile(&dir.0, &xml);
    assert_success(&external);
    let ops = external["resources"].as_object().unwrap().values().next().unwrap();
    assert!(ops[0]["fontSrc"].is_null());
    assert!(ops[0]["fontRevision"].is_null());
}

#[test]
fn media_probe_changes_and_hold_edits_match_a_fresh_session() {
    let dir = Temp::new("media");
    let output = Command::new("ffmpeg")
        .args(["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=30:d=2", "-c:v", "mpeg4"])
        .arg(dir.0.join("a.mp4"))
        .status();
    if !output.is_ok_and(|s| s.success()) {
        eprintln!("ffmpeg unavailable; skipping media fixture");
        return;
    }
    let mut session = Viewer::new();
    let xml = document(
        r#"<stack><video id="v" src="a.mp4"><hold at="10"><dur len="20"><text text="Wait"/></dur></hold></video><dur len="10" at="v:20"><text text="After"/></dur></stack>"#,
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
fn cached_drawings_keep_analysis_warnings_on_current_source_lines() {
    let mut session = Viewer::new();
    let xml = document(r#"<dur len="30"><text anchor="c" text="Warning"/></dur>"#);
    let first = session.compile(Path::new("."), &xml);
    let next = session.compile(Path::new("."), &xml.replace("<dur", "<!-- new source line -->\n<dur"));
    assert_success(&first);
    assert_success(&next);
    assert_eq!(next["stats"]["drawHits"], 1);
    assert_eq!(next["resources"], json!({}));
    assert_eq!(first["diagnostics"][0]["code"], "W357");
    assert_ne!(first["diagnostics"][0]["line"], next["diagnostics"][0]["line"]);
}

#[test]
fn patches_carry_only_what_changed_since_the_shown_scene() {
    let mut viewer = Viewer::new();
    let root = Path::new(".");
    let xml = document(
        &(0..100)
            .map(|i| format!(r#"<dur len="30"><text text="Caption {i}"/></dur>"#))
            .collect::<String>(),
    );
    assert_eq!(viewer.compile(root, &xml)["update"]["type"], "snapshot");
    let edited = xml.replace("Caption 50\"", "Edited\"");
    let patch = viewer.compile(root, &edited)["update"].clone();
    assert_eq!(patch["type"], "patch");
    assert_eq!(patch["baseVersion"], 1);
    assert_eq!(patch["version"], 2);
    assert_eq!(patch["resources"].as_object().unwrap().len(), 1);
    assert_eq!(patch["elements"]["upsert"].as_array().unwrap().len(), 1);
    assert!(patch["elements"]["order"].is_null());
    // Unchanged, failed and recovered compiles send only the status.
    assert!(viewer.compile(root, &edited)["update"].is_null());
    assert!(viewer.compile(root, "<mekuru>")["update"].is_null());
    assert!(viewer.compile(root, &edited)["update"].is_null());
    // A new session (after a panic) keys every element anew; the patch still applies to the shown scene.
    viewer.session = Session::default();
    let restarted = viewer.compile(root, &edited)["update"].clone();
    assert_eq!(restarted["baseVersion"], 2);
    assert_eq!(restarted["elements"]["remove"].as_array().unwrap().len(), 100);
    assert_eq!(restarted["resources"], json!({}));
    let replaced = viewer.compile(root, &document(r#"<dur len="30"><text text="Only one"/></dur>"#))["update"].clone();
    assert_eq!(replaced["type"], "patch");
}

const STATIC: &str = r##"<mekuru size="16x16" fps="30"><dur len="30"><rect w="16" h="16" fill="#ff0000"/></dur></mekuru>"##;

#[test]
fn preview_and_renderer_agree_on_a_static_scene() {
    let path = Path::new("fixture.xml");
    let project = Project::from_source(path, None, STATIC.into(), false);
    assert!(!project.has_errors(), "{:?}", project.diags);
    let prepared = Prepared::default();
    let schedule = project.schedule(&prepared);
    let ctx = RenderCtx {
        project: &project,
        prepared: &prepared,
        sched: &schedule,
    };
    let mut renderer = FrameRenderer::new(ctx, RenderTarget::new(&project.script.settings, 1.0, None)).unwrap();
    assert!(renderer.render(0.0).unwrap());
    assert!(renderer.canvas().data().as_chunks::<4>().0.iter().all(|pixel| *pixel == [255, 0, 0, 255]));
    assert!(!renderer.render(1.0).unwrap());
    let result = single(path, None, STATIC);
    assert_eq!(result["diagnostics"], json!([]));
    let preview = &result["preview"];
    assert_eq!(preview["width"], 16);
    assert_eq!(preview["height"], 16);
    assert_eq!(preview["fps"], 30.0);
    assert_eq!(preview["duration"], 1.0);
    assert!(!preview["elements"].as_array().unwrap().is_empty());
    assert!(preview["timeline"]["nodes"].is_array());
    assert!(preview["timeline"]["clips"].is_array());
}

#[test]
fn preview_emits_text_styles_and_transform_without_glyph_paths() {
    let xml = r##"<mekuru lang="ja"><dur len="30"><text x="20" y="30" w="200" size="32" color="#123456" stroke="#ffffff" stroke-width="3" weight="bold" align="right" line-height="1.5" rotate="15" text="日本語&lt;b&gt;&#10;次の行"/></dur></mekuru>"##;
    let result = single(Path::new("fixture.xml"), None, xml);
    assert_eq!(result["diagnostics"], json!([]));
    let ops: Vec<_> = result["preview"]["elements"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|e| e["drawings"].as_array().unwrap())
        .flat_map(|id| result["resources"][id.as_str().unwrap()].as_array().unwrap())
        .collect();
    assert_eq!(ops.len(), 1);
    let text = ops[0];
    assert_eq!(text["kind"], "text");
    assert_eq!(text["text"], "日本語<b>\n次の行");
    assert_eq!(text["x"], 20.0);
    assert_eq!(text["y"], 30.0);
    assert_eq!(text["width"], 200.5);
    assert_eq!(text["size"], 32.0);
    assert_eq!(text["color"], "#123456ff");
    assert_eq!(text["stroke"], "#ffffffff");
    assert_eq!(text["strokeWidth"], 3.0);
    assert_eq!(text["bold"], true);
    assert_eq!(text["align"], "right");
    assert_eq!(text["lineHeight"], 1.5);
    assert_eq!(text["transform"].as_array().unwrap().len(), 6);
    assert!(text["d"].is_null());
    assert!(!text["font"].as_str().unwrap().is_empty());
    assert_eq!(text["lang"], "ja");

    // Without `lang`, the OS locale is used; the preview always gets a tag.
    let result = single(Path::new("fixture.xml"), None, &xml.replace(r#" lang="ja""#, ""));
    let id = result["preview"]["elements"][0]["drawings"][0].as_str().unwrap();
    assert!(!result["resources"][id][0]["lang"].as_str().unwrap().is_empty());
}
