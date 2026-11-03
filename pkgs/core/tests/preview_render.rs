use mekuru_compiler::{
    Project,
    prepare::Prepared,
    preview,
    render::{FrameRenderer, RenderInput, RenderTarget},
};
use std::path::Path;

const XML: &str = r##"<mekuru size="16x16" fps="30"><dur len="30"><rect w="16" h="16" fill="#ff0000"/></dur></mekuru>"##;

#[test]
fn preview_and_renderer_agree_on_a_static_scene() {
    let path = Path::new("fixture.xml");
    let project = Project::from_source(path, None, XML.into());
    assert!(!project.has_errors(), "{:?}", project.diags);
    let prepared = Prepared::default();
    let schedule = project.schedule(&prepared);
    let input = RenderInput {
        script: &project.script,
        prepared: &prepared,
        sched: &schedule,
    };
    let mut renderer = FrameRenderer::new(&input, RenderTarget::new(&project.script.settings, 1.0, None)).unwrap();
    assert!(renderer.render(0.0).unwrap());
    assert!(renderer.canvas().data().as_chunks::<4>().0.iter().all(|pixel| *pixel == [255, 0, 0, 255]));
    assert!(!renderer.render(1.0).unwrap());
    let result = serde_json::to_value(preview::compile(path, None, XML.into())).unwrap();
    assert_eq!(result["diagnostics"], serde_json::json!([]));
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
    let xml = r##"<mekuru><dur len="30"><text x="20" y="30" w="200" size="32" color="#123456" stroke="#ffffff" stroke-width="3" weight="bold" align="right" line-height="1.5" rotate="15">日本語&lt;b&gt;<br/>次の行</text></dur></mekuru>"##;
    let result = serde_json::to_value(preview::compile(Path::new("fixture.xml"), None, xml.into())).unwrap();
    assert_eq!(result["diagnostics"], serde_json::json!([]));
    let ops: Vec<_> = result["preview"]["elements"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|e| e["ops"].as_array().unwrap())
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
}
