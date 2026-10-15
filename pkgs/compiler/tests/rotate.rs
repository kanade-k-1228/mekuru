use mekuru_compiler::{Project, ir::{ElemKind, ViewOp}};
use std::path::Path;

fn project(body: &str) -> Project {
    Project::from_source(Path::new("test.xml"), None, format!(r#"<mekuru size="100x100"><dur len="1"><stack>{body}</stack></dur></mekuru>"#))
}

fn ops(p: &Project) -> Vec<&ViewOp> {
    p.script.elems.iter().filter_map(|e| if let ElemKind::View(v) = &e.kind { Some(v) } else { None }).flat_map(|v| &v.ops).collect()
}

#[test]
fn rotate_turns_the_element_and_its_children_about_the_center() {
    let p = project(r##"<column x="10" y="20" w="40" h="20" fill="#f00" rotate="90"><rect w="10" h="10" fill="#00f"/></column>"##);
    assert!(!p.has_errors(), "{:?}", p.diags);
    let ops = ops(&p);
    assert_eq!(ops.len(), 2);
    for op in ops {
        let ViewOp::Transformed(t, _) = op else { panic!("not rotated: {op:?}") };
        let map = |x: f32, y: f32| (t.sx * x + t.kx * y + t.tx, t.ky * x + t.sy * y + t.ty);
        for ((x, y), (ex, ey)) in [((30.0, 30.0), (30.0, 30.0)), ((10.0, 20.0), (40.0, 10.0))] {
            let (mx, my) = map(x, y);
            assert!((mx - ex).abs() < 1e-3 && (my - ey).abs() < 1e-3, "({x}, {y}) -> ({mx}, {my})");
        }
    }
}

#[test]
fn rotate_zero_and_full_turns_draw_as_is() {
    let p = project(r##"<rect w="10" h="10" fill="#f00" rotate="0"/><rect w="10" h="10" fill="#f00" rotate="360"/>"##);
    assert!(!p.has_errors(), "{:?}", p.diags);
    assert!(ops(&p).iter().all(|op| matches!(op, ViewOp::Rect(_))));
}

#[test]
fn rotate_cannot_turn_a_video() {
    let p = project(r#"<column rotate="5"><video src="movie.mp4" w="10"/></column>"#);
    assert!(p.diags.iter().any(|d| d.code == "E322"), "{:?}", p.diags);
}
