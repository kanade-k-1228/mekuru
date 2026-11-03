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
