use mekuru_compiler::{
    Project,
    ir::{Elem, ElemKind, RectSpec, ViewOp},
    lang::diag::Diag,
    media::probe::MediaProbe,
    prepare::{MediaAsset, Prepared},
    schedule::{ElemTime, Schedule, SrcMap, schedule},
};
use std::path::Path;

/// Every media file lasts ten seconds and has sound.
fn media(p: &Project) -> Prepared {
    let probe = MediaProbe {
        duration: 10.0,
        video: None,
        has_audio: true,
    };
    let media = p.script.elems.iter().filter(|e| e.kind.media().is_some());
    Prepared {
        media: media.map(|e| (e.id, MediaAsset { probe, pcm: None })).collect(),
    }
}

fn project(body: &str) -> Project {
    Project::from_source(Path::new("test.xml"), None, format!(r#"<mekuru fps="1"><seq>{body}</seq></mekuru>"#), false)
}

/// A project without errors, its schedule and what scheduling reported.
struct Compiled {
    p: Project,
    s: Schedule,
    diags: Vec<Diag>,
}

fn compile(body: &str) -> Compiled {
    let p = project(body);
    assert!(!p.has_errors(), "{:?}", p.diags);
    let mut diags = vec![];
    let s = schedule(&p.script, &media(&p), &mut diags);
    Compiled { p, s, diags }
}

/// `compile`, with nothing reported.
fn clean(body: &str) -> Compiled {
    let c = compile(body);
    assert!(c.diags.is_empty(), "{:?}", c.diags);
    c
}

impl Compiled {
    fn elem(&self, id: &str) -> &ElemTime {
        &self.s.elems[named(&self.p, id).id]
    }
    fn marked(&self, marker: &str) -> &ElemTime {
        &self.s.elems[marked_elem(&self.p, marker).id]
    }
    fn span(&self, id: &str) -> (i64, i64) {
        let t = self.elem(id);
        (t.start, t.end)
    }
    fn src(&self, id: &str) -> &SrcMap {
        self.elem(id).src.as_ref().expect(id)
    }
    fn freezes(&self, id: &str) -> Vec<(f64, f64)> {
        self.src(id).freezes().collect()
    }
    /// Where each audio clip plays, how long, and from where in its source.
    fn clips(&self) -> Vec<(f64, f64, f64)> {
        self.s.audio.iter().map(|a| (a.at, a.len, a.src)).collect()
    }
    fn has(&self, code: &str) -> bool {
        self.diags.iter().any(|d| d.code == code)
    }
}

/// Each body is an error with its code.
fn rejects(cases: &[(&str, &str)]) {
    for (body, code) in cases {
        let p = project(body);
        assert!(p.diags.iter().any(|d| d.code == *code), "{body}: {:?}", p.diags);
    }
}

/// The innermost element whose source contains `marker`.
fn marked_elem<'a>(p: &'a Project, marker: &str) -> &'a Elem {
    let has = |e: &&Elem| p.source[e.site.lo as usize..e.site.hi as usize].contains(marker);
    p.script.elems.iter().filter(has).min_by_key(|e| e.site.hi - e.site.lo).expect(marker)
}

/// The element written with `id`.
fn named<'a>(p: &'a Project, id: &str) -> &'a Elem {
    marked_elem(p, &format!(r#"id="{id}""#))
}

#[test]
fn sequence_waits_for_what_has_a_length_and_not_for_what_has_none() {
    let c = clean(
        r#"
        <rect id="background" w="100" h="100"/>
        <dur len="3"><stack><rect id="first" w="10" h="10"/></stack></dur>
        <stack><rect id="caption" w="10" h="10"/></stack>
        <seq delay="1">
            <dur len="2"><rect id="second" w="10" h="10"/></dur>
            <dur len="1"><rect id="third" w="10" h="10"/></dur>
        </seq>
    "#,
    );
    assert_eq!(c.s.total, 7);
    for (id, start, end) in [("background", 0, 7), ("first", 0, 3), ("caption", 3, 7), ("second", 4, 6), ("third", 6, 7)] {
        let t = c.elem(id);
        assert_eq!((t.start, t.end), (start, end), "{id}");
    }
}

#[test]
fn a_group_lasts_until_the_last_thing_in_it_ends() {
    let c = clean(
        r#"
        <stack id="scene">
            <rect id="note" w="10" h="10"/>
            <dur len="2"><audio id="a" src="a.wav"/></dur>
            <dur len="3" delay="1"><audio id="b" src="b.wav"/></dur>
        </stack>
        <stack id="empty"/>
        <dur len="1"><rect id="next" w="10" h="10"/></dur>
    "#,
    );
    assert_eq!(c.span("note"), (0, 4));
    assert_eq!(c.elem("next").start, 4);
    assert_eq!(c.s.total, 5);
}

#[test]
fn hold_keeps_media_waiting_at_a_source_position() {
    let c = clean(
        r#"
        <stack>
            <video id="movie" src="movie.mp4"><hold at="2"><dur len="3"/></hold></video>
            <dur len="1" at="movie:2"><rect id="freeze" w="10" h="10"/></dur>
            <dur len="1" at="movie:4"><rect id="cue" w="10" h="10"/></dur>
        </stack>
    "#,
    );
    assert_eq!(c.s.total, 13);
    let map = c.src("movie");
    assert_eq!(map.freezes().collect::<Vec<_>>(), vec![(2.0, 5.0)]);
    assert_eq!(map.at(4.0), 2.0);
    assert_eq!(map.at(6.0), 3.0);
    assert_eq!(c.elem("freeze").start, 2);
    assert_eq!(c.elem("cue").start, 7);
    assert_eq!(c.clips(), vec![(0.0, 2.0, 0.0), (5.0, 8.0, 2.0)]);
}

#[test]
fn holds_at_one_position_wait_for_the_longest_and_holds_at_others_add_up() {
    let c = clean(
        r#"
        <stack>
            <video id="movie" src="movie.mp4">
                <hold at="2"><dur len="1"/></hold>
                <hold at="2"><dur len="3"/></hold>
                <hold at="6"><dur len="2"/></hold>
                <hold at="10"><dur len="1"/></hold>
            </video>
        </stack>
    "#,
    );
    assert_eq!(c.s.total, 16);
    let map = c.src("movie");
    assert_eq!(map.freezes().collect::<Vec<_>>(), vec![(2.0, 5.0), (9.0, 11.0), (15.0, 16.0)]);
    assert_eq!(c.elem("movie").end, 16);
}

#[test]
fn a_reference_to_the_source_end_precedes_its_hold_but_media_completion_waits() {
    let c = clean(
        r#"
        <stack>
            <video id="movie" src="movie.mp4">
                <speed rate="2"/>
                <hold at="4"><dur len="2"/></hold>
                <hold at="10"><dur len="3"/></hold>
            </video>
            <dur at="movie:10" len="1"><rect id="cue" w="10" h="10"/></dur>
        </stack>
        <dur len="1"><rect id="after" w="10" h="10"/></dur>
        "#,
    );
    assert_eq!(c.elem("cue").start, 7);
    assert_eq!(c.elem("movie").end, 10);
    assert_eq!(c.elem("after").start, 10);
    assert_eq!(c.s.total, 11);
}

#[test]
fn hold_lasts_as_long_as_what_is_in_it() {
    let c = clean(
        r#"
        <stack>
            <video id="life" src="life.mp4">
                <hold at="4">
                    <rect id="label" w="10" h="10"/>
                    <seq>
                        <dur len="3"><audio id="talk" src="talk.wav"/></dur>
                        <dur len="1"><audio id="more" src="more.wav"/></dur>
                    </seq>
                </hold>
            </video>
            <dur len="1" at="life:5"><audio id="after" src="after.wav"/></dur>
        </stack>
    "#,
    );
    assert_eq!((c.span("talk"), c.span("more"), c.span("label")), ((4, 7), (7, 8), (4, 8)));
    assert_eq!(c.freezes("life"), vec![(4.0, 8.0)]);
    assert_eq!(c.elem("after").start, 9);
    assert_eq!(c.s.total, 14);
}

#[test]
fn hold_is_cut_by_its_own_dur_and_with_its_media() {
    let c = clean(
        r#"
        <stack>
            <video id="v" src="v.mp4"><hold at="2"><dur len="3"><dur len="5"><rect id="note" w="10" h="10"/></dur></dur></hold></video>
        </stack>
    "#,
    );
    assert_eq!(c.span("note"), (2, 5));
    assert_eq!(c.freezes("v"), vec![(2.0, 5.0)]);
    assert_eq!(c.s.total, 13);
    let c = compile(
        r#"
        <dur len="3"><stack>
            <video id="v" src="v.mp4"><hold at="2"><dur len="5"><rect id="note" w="10" h="10"/></dur></hold></video>
        </stack></dur>
    "#,
    );
    assert_eq!(c.span("note"), (2, 3));
    assert_eq!(c.elem("v").end, 3);
    assert_eq!(c.s.total, 3);
    let c = compile(
        r#"
        <dur len="1"><stack>
            <video id="v" src="v.mp4"><hold at="2"><dur len="5"><rect id="note" w="10" h="10"/></dur></hold></video>
        </stack></dur>
    "#,
    );
    let note = c.elem("note");
    assert_eq!(note.start, note.end);
    assert!(c.diags.iter().all(|d| !d.is_error()), "{:?}", c.diags);
}

#[test]
fn hold_goes_in_media_and_has_a_length() {
    rejects(&[
        (r#"<stack><hold at="1"><dur len="1"/></hold></stack>"#, "E107"),
        (r#"<stack><video src="v.mp4"><dur len="1"><rect w="1" h="1"/></dur></video></stack>"#, "E107"),
        (r#"<stack><video src="v.mp4"><hold at="1"/></video></stack>"#, "E320"),
        (r#"<stack><video src="v.mp4"><hold at="1"><rect w="1" h="1"/></hold></video></stack>"#, "E320"),
        (r#"<stack><video src="v.mp4"><hold at="1"><dur len="fill"/></hold></video></stack>"#, "E303"),
        (r#"<stack><video src="v.mp4"><hold><dur len="1"/></hold></video></stack>"#, "E302"),
    ]);
    let c = compile(r#"<stack><video src="v.mp4"><hold at="12"><dur len="1"/></hold></video></stack>"#);
    assert!(c.has("E504"), "{:?}", c.diags);
}

#[test]
fn hold_in_a_repeat_comes_round_with_its_media() {
    let c = clean(
        r#"
        <dur len="27"><stack>
            <repeat>
                <seq>
                    <video src="v.mp4"><hold at="5"><dur len="2"><rect w="11" h="10"/></dur></hold></video>
                    <dur len="1"><stack/></dur>
                </seq>
            </repeat>
        </stack></dur>
    "#,
    );
    let note = c.marked(r#"w="11""#);
    for (t, shown) in [(4.0, false), (6.0, true), (11.0, false), (19.0, true), (25.0, false)] {
        assert_eq!(note.active(t), shown, "{t}");
    }
}

#[test]
fn media_in_a_repeat_keeps_its_holds_speeds_and_cuts_every_round() {
    let c = clean(
        r#"
        <dur len="20"><stack>
            <repeat>
                <video src="v.mp4"><cut from="0" to="4"/><hold at="5"><dur len="2"><rect w="11" h="10"/></dur></hold></video>
            </repeat>
        </stack></dur>
    "#,
    );
    let note = c.marked(r#"w="11""#);
    for (t, shown) in [(2.0, true), (4.0, false), (10.0, true), (12.0, false), (18.0, true)] {
        assert_eq!(note.active(t), shown, "{t}");
    }
    let mut clips = c.clips();
    clips.sort_by(|a, b| a.0.total_cmp(&b.0));
    assert_eq!(
        clips,
        vec![
            (0.0, 1.0, 4.0),
            (3.0, 5.0, 5.0),
            (8.0, 1.0, 4.0),
            (11.0, 5.0, 5.0),
            (16.0, 1.0, 4.0),
            (19.0, 1.0, 5.0)
        ]
    );
}

#[test]
fn cut_skips_a_part_of_the_source() {
    let c = clean(
        r#"
        <stack>
            <video id="v" src="v.mp4"><cut from="2" to="5"/></video>
            <dur len="1" at="v:6"><rect id="after" w="10" h="10"/></dur>
            <dur len="1" at="v:3"><rect id="inside" w="10" h="10"/></dur>
        </stack>
    "#,
    );
    assert_eq!(c.s.total, 7);
    let map = c.src("v");
    assert_eq!((map.at(1.0), map.at(3.0)), (1.0, 6.0));
    assert_eq!((c.elem("after").start, c.elem("inside").start), (3, 2));
    assert_eq!(
        c.s.audio.iter().map(|a| (a.at, a.len, a.src, a.rate)).collect::<Vec<_>>(),
        vec![(0.0, 2.0, 0.0, 1.0), (2.0, 5.0, 5.0, 1.0)]
    );
}

#[test]
fn speed_plays_a_part_faster_or_slower() {
    let c = clean(
        r#"
        <stack>
            <video id="v" src="v.mp4"><speed from="2" to="6" rate="2"/><speed from="8" rate="0.5"/></video>
            <dur len="1" at="v:5"><rect id="r" w="10" h="10"/></dur>
        </stack>
    "#,
    );
    assert_eq!(c.s.total, 10);
    let map = c.src("v");
    assert_eq!((map.at(3.0), map.at(5.0), map.at(8.0)), (4.0, 7.0, 9.0));
    assert_eq!(c.elem("r").start, 4);
    let clips = c.s.audio.iter().map(|a| (a.at, a.len, a.src, a.rate)).collect::<Vec<_>>();
    assert_eq!(
        clips,
        vec![(0.0, 2.0, 0.0, 1.0), (2.0, 2.0, 2.0, 2.0), (4.0, 2.0, 6.0, 1.0), (6.0, 4.0, 8.0, 0.5)]
    );
    let c = compile(r#"<stack><video id="v" src="v.mp4"><speed rate="2"/></video></stack>"#);
    assert_eq!(c.elem("v").end, 5);
    let c = compile(
        r#"
        <stack>
            <video id="v" src="v.mp4"><speed from="2" to="6" rate="2"/><speed from="4" to="8" rate="2"/><cut from="7" to="9"/></video>
        </stack>
    "#,
    );
    assert_eq!(c.elem("v").end, 5);
}

#[test]
fn media_gets_to_a_position_on_the_first_frame_after_it_plays_there() {
    let c = clean(
        r#"
        <stack>
            <video id="v" src="v.mp4"><speed rate="3"/><hold at="5"><dur len="2"><rect id="note" w="10" h="10"/></dur></hold></video>
            <dur len="1" at="v:7"><rect id="cue" w="10" h="10"/></dur>
        </stack>
    "#,
    );
    assert_eq!((c.span("note"), c.elem("cue").start, c.elem("v").end, c.s.total), ((2, 4), 5, 6, 6));
    let map = c.src("v");
    assert_eq!(map.freezes().map(|(a, b)| ((a * 3.0).round(), b)).collect::<Vec<_>>(), vec![(5.0, 4.0)]);
    let clips: Vec<_> = c.s.audio.iter().map(|a| (a.at, (a.len * 3.0).round(), a.src)).collect();
    assert_eq!(clips, vec![(0.0, 5.0, 0.0), (4.0, 5.0, 5.0)]);
}

#[test]
fn hold_waits_at_its_position_through_speeds_and_cuts() {
    let c = clean(
        r#"
        <stack>
            <video id="v" src="v.mp4">
                <hold at="1"><dur len="2"/></hold>
                <cut from="2" to="5"/>
                <hold at="3"><dur len="1"/></hold>
                <speed from="6" to="8" rate="2"/>
            </video>
        </stack>
    "#,
    );
    assert_eq!(c.s.total, 9);
    let map = c.src("v");
    assert_eq!(map.freezes().collect::<Vec<_>>(), vec![(1.0, 3.0), (4.0, 5.0)]);
    assert_eq!((map.at(4.5), map.at(6.5)), (5.0, 7.0));
}

#[test]
fn speed_and_cut_go_in_media_and_say_a_part() {
    rejects(&[
        (r#"<stack><cut from="1" to="2"/></stack>"#, "E107"),
        (r#"<stack><speed rate="2"/></stack>"#, "E107"),
        (r#"<stack><video src="v.mp4"><cut from="3" to="2"/></video></stack>"#, "E314"),
        (r#"<stack><video src="v.mp4"><speed from="1" to="2"/></video></stack>"#, "E302"),
        (r#"<stack><video src="v.mp4"><speed rate="0"/></video></stack>"#, "E303"),
        (r#"<stack><video src="v.mp4"><speed rate="50%"/></video></stack>"#, "E303"),
        (r#"<stack><video src="v.mp4"><cut from="1" to="2" rate="2"/></video></stack>"#, "E301"),
    ]);
    let c = compile(r#"<stack><video src="v.mp4" from="1"><cut from="0" to="1"/></video></stack>"#);
    assert!(c.has("E504"), "{:?}", c.diags);
}

#[test]
fn parent_duration_cuts_media_and_a_reference_past_it_is_an_error() {
    let c = compile(
        r#"
        <dur len="3"><stack>
            <video id="movie" src="movie.mp4"/>
            <dur len="1" at="movie:5"><rect id="later" w="10" h="10"/></dur>
        </stack></dur>
    "#,
    );
    assert_eq!(c.s.total, 3);
    assert_eq!(c.elem("movie").end, 3);
    let later = c.elem("later");
    assert_eq!(later.start, later.end);
    assert!(c.has("E504"));
    assert!(c.diags.iter().all(|d| d.code != "W556"), "{:?}", c.diags);
    assert_eq!(c.s.audio[0].len, 3.0);
}

#[test]
fn a_reference_out_of_the_source_is_an_error() {
    for at in ["movie:0", "movie:11"] {
        let c = compile(&format!(
            r#"<stack><video id="movie" src="movie.mp4" from="1"/><dur len="1" at="{at}"><rect w="1" h="1"/></dur></stack>"#
        ));
        assert!(c.has("E504"), "{at}: {:?}", c.diags);
    }
    let c = clean(
        r#"<dur len="30"><stack><repeat id="bgm"><audio src="bgm.mp3"/></repeat><dur len="1" at="bgm:25"><rect id="r" w="1" h="1"/></dur></stack></dur>"#,
    );
    assert_eq!(c.elem("r").start, 25);
}

#[test]
fn visual_repeat_reuses_first_round_until_parent_ends() {
    let c = clean(
        r#"
        <dur len="5"><stack>
            <repeat>
                <seq>
                    <dur len="1"><rect w="11" h="10"/></dur>
                    <dur len="1"><rect w="12" h="10"/></dur>
                </seq>
            </repeat>
        </stack></dur>
    "#,
    );
    assert_eq!(c.s.total, 5);
    let a = c.marked(r#"w="11""#);
    let b = c.marked(r#"w="12""#);
    for t in [0.5, 2.5, 4.5] {
        assert!(a.active(t));
        assert!(!b.active(t));
    }
    for t in [1.5, 3.5] {
        assert!(!a.active(t));
        assert!(b.active(t));
    }
    assert!(!a.active(5.0));
    assert!(!b.active(5.0));
}

#[test]
fn repeat_puts_its_children_on_top_of_each_other_and_a_round_lasts_until_the_last_ends() {
    let c = clean(
        r#"
        <dur len="7"><stack>
            <repeat>
                <dur len="1"><rect w="11" h="10"/></dur>
                <dur len="3"><rect w="12" h="10"/></dur>
                <rect w="13" h="10"/>
            </repeat>
        </stack></dur>
    "#,
    );
    let (a, b, c) = (c.marked(r#"w="11""#), c.marked(r#"w="12""#), c.marked(r#"w="13""#));
    for (t, shown) in [
        (0.5, [true, true]),
        (1.5, [false, true]),
        (3.5, [true, true]),
        (4.5, [false, true]),
        (6.5, [true, true]),
    ] {
        assert_eq!([a.active(t), b.active(t)], shown, "{t}");
        assert!(c.active(t), "{t}");
    }
    let c = clean(
        r#"
        <dur len="5"><repeat><dur len="2"><rect w="11" h="10"/></dur></repeat></dur>
        <dur len="1"><rect id="next" w="10" h="10"/></dur>
    "#,
    );
    assert_eq!(c.elem("next").start, 5);
    assert!(c.marked(r#"w="11""#).active(4.0));
}

#[test]
fn slot_override_hides_visuals_only_and_restores_previous_holder() {
    let c = clean(
        r#"
        <dur len="6"><stack>
            <stack slot="portrait"><rect id="base" w="10" h="10"/></stack>
            <dur len="2" delay="2"><stack slot="portrait">
                <rect id="override" w="10" h="10"/>
                <dur len="2"><audio id="voice" src="voice.wav"/></dur>
            </stack></dur>
            <dur len="1" delay="3"><stack slot="portrait"><rect w="10" h="10"/></stack></dur>
        </stack></dur>
    "#,
    );
    let base = c.elem("base");
    assert_eq!(base.hidden, vec![(2, 4)]);
    assert!(base.active(1.0));
    assert!(!base.active(3.0));
    assert!(base.active(4.0));
    assert!(!c.elem("override").active(3.5));
    assert!(c.elem("voice").active(3.5));
}

#[test]
fn nested_layout_fades_multiply() {
    let c = clean(
        r#"
        <dur len="8"><column fadein="2" fadeout="2">
            <dur len="8"><rect id="child" w="10" h="10" fadein="2" fadeout="2"/></dur>
        </column></dur>
    "#,
    );
    let child = c.elem("child");
    assert_eq!(child.envelope(1.0), 0.25);
    assert_eq!(child.envelope(4.0), 1.0);
    assert_eq!(child.envelope(7.0), 0.25);
}

#[test]
fn loops_of_at_are_errors() {
    let cycle = compile(
        r#"
        <stack>
            <dur len="1" at="b:0"><rect id="a" w="10" h="10"/></dur>
            <dur len="1" at="a:0"><rect id="b" w="10" h="10"/></dur>
        </stack>
    "#,
    );
    assert_eq!(cycle.diags.iter().filter(|d| d.code == "E510").count(), 2, "{:?}", cycle.diags);
    let hold = compile(r#"<stack><video id="movie" src="movie.mp4"><hold at="2"><dur len="1" at="movie:3"><rect w="1" h="1"/></dur></hold></video></stack>"#);
    assert!(hold.has("E510"), "{:?}", hold.diags);
    assert_eq!(hold.s.total, 0);
}

#[test]
fn start_waits_for_the_flow_with_delay_and_for_the_reference() {
    let body = |x: i64, delay: i64| {
        format!(
            r#"
        <stack>
            <dur len="1" delay="{x}"><rect id="x" w="10" h="10"/></dur>
            <seq>
                <dur len="2"><rect id="a" w="10" h="10"/></dur>
                <dur len="1" at="x:0" delay="{delay}"><rect id="b" w="10" h="10"/></dur>
            </seq>
        </stack>
    "#
        )
    };
    let c = clean(&body(5, 0));
    assert_eq!(c.elem("b").start, 5);
    let c = compile(&body(5, 4));
    assert_eq!(c.elem("b").start, 6);
    assert!(c.diags.iter().all(|d| d.code == "W550"), "{:?}", c.diags);
    let c = compile(&body(1, 0));
    assert_eq!(c.elem("b").start, 2);
    assert!(c.diags.iter().all(|d| d.code == "W550"), "{:?}", c.diags);
}

#[test]
fn group_fades_reach_everything_inside_with_audio() {
    let c = clean(
        r#"
        <dur len="4"><stack id="scene" fadeout="2" opacity="0.5">
            <rect id="r" w="10" h="10"/>
            <dur len="4"><audio id="voice" src="voice.wav"/></dur>
        </stack></dur>
    "#,
    );
    assert_eq!(c.elem("r").envelope(3.0), 0.5);
    assert_eq!(named(&c.p, "r").opacity, 0.5);
    let clip = &c.s.audio[0];
    let gain: f64 = clip.env.iter().map(|f| f.at(3.0)).product();
    assert_eq!(gain, 0.5);
}

#[test]
fn repeat_plays_its_audio_in_every_round() {
    let c = clean(
        r#"
        <dur len="10"><stack>
            <repeat>
                <seq>
                    <dur len="2"><audio src="tick.wav" fadein="1"/></dur>
                    <dur len="2"><stack/></dur>
                </seq>
            </repeat>
        </stack></dur>
    "#,
    );
    assert_eq!(
        c.s.audio.iter().map(|a| (a.at, a.len)).collect::<Vec<_>>(),
        vec![(0.0, 2.0), (4.0, 2.0), (8.0, 2.0)]
    );
    for a in &c.s.audio {
        let gain: f64 = a.env.iter().map(|f| f.at(a.at + 0.5)).product();
        assert_eq!(gain, 0.5);
    }
}

#[test]
fn repeated_music_plays_round_after_round_and_the_fades_of_the_repeat_reach_the_whole() {
    let c = clean(
        r#"
        <dur len="25"><stack>
            <repeat fadein="1" fadeout="2"><audio src="bgm.mp3"/></repeat>
        </stack></dur>
    "#,
    );
    assert_eq!(c.clips(), vec![(0.0, 10.0, 0.0), (10.0, 10.0, 0.0), (20.0, 5.0, 0.0)]);
    let gain = |k: usize, t: f64| c.s.audio[k].env.iter().map(|f| f.at(t)).product::<f64>();
    assert_eq!((gain(0, 0.5), gain(1, 10.5), gain(2, 24.0)), (0.5, 1.0, 0.5));
}

#[test]
fn nested_repeats_map_time_round_by_round() {
    let c = clean(
        r#"
        <dur len="12"><stack>
            <repeat>
                <seq>
                    <dur len="2"><rect w="11" h="10"/></dur>
                    <dur len="4"><repeat>
                        <seq>
                            <dur len="1"><rect w="12" h="10"/></dur>
                            <dur len="1"><rect w="13" h="10"/></dur>
                        </seq>
                    </repeat></dur>
                </seq>
            </repeat>
        </stack></dur>
    "#,
    );
    let (first, a, b) = (c.marked(r#"w="11""#), c.marked(r#"w="12""#), c.marked(r#"w="13""#));
    for (t, shown) in [(1.0, 0), (2.4, 1), (3.4, 2), (4.4, 1), (5.2, 2), (7.0, 0), (8.4, 1), (9.2, 2), (11.4, 2)] {
        let active = [first.active(t), a.active(t), b.active(t)];
        assert_eq!(active.iter().filter(|&&x| x).count(), 1, "{t}");
        assert!(active[shown], "{t}: {active:?}");
    }
}

#[test]
fn repeat_needs_something_with_a_length() {
    rejects(&[
        (r#"<dur len="1"><stack><repeat><rect w="1" h="1"/></repeat></stack></dur>"#, "E321"),
        (
            r#"<dur len="1"><stack><dur len="1"><repeat><rect w="1" h="1"/></repeat></dur></stack></dur>"#,
            "E321",
        ),
    ]);
}

#[test]
fn repeat_references_stay_in_their_clock_and_names_can_be_reused() {
    let c = clean(
        r#"
        <dur len="13"><stack>
          <repeat id="loop"><stack>
            <dur id="cue" len="4"/>
            <dur at="cue:1" len="2"><rect w="17" h="1"/></dur>
          </stack></repeat>
          <repeat><stack>
            <dur id="cue" len="3"/>
            <dur at="cue:2" len="1"><rect w="19" h="1"/></dur>
          </stack></repeat>
          <rect id="outside" at="loop:6" w="23" h="1"/>
        </stack></dur>
    "#,
    );
    for t in 0..13 {
        assert_eq!(c.marked("w=\"17\"").active(t as f64), matches!(t % 4, 1 | 2));
        assert_eq!(c.marked("w=\"19\"").active(t as f64), t % 3 == 2);
        assert_eq!(c.elem("outside").active(t as f64), t >= 6);
    }
    rejects(&[
        (r#"<dur id="outside" len="10"><repeat><dur len="2" at="outside:0"/></repeat></dur>"#, "E318"),
        (
            r#"<dur len="10"><stack><repeat><dur id="inside" len="2"/></repeat><rect at="inside:0"/></stack></dur>"#,
            "E318",
        ),
        (
            r#"<dur len="10"><repeat><stack><dur id="outer" len="4"/><repeat><dur at="outer:0" len="2"/></repeat></stack></repeat></dur>"#,
            "E318",
        ),
        (
            r#"<dur len="10"><repeat><stack><dur id="a" len="1"/><dur id="a" len="2"/></stack></repeat></dur>"#,
            "E319",
        ),
    ]);
    let cycle = compile(r#"<dur len="10"><repeat><stack><dur id="a" at="b:0" len="1"/><dur id="b" at="a:0" len="1"/></stack></repeat></dur>"#);
    assert!(cycle.has("E510"));
}

#[test]
fn repeated_slots_match_explicit_rounds_and_do_not_hide_audio() {
    let round = r#"<stack slot="actor"><rect w="17" h="1"/><audio src="voice.wav"/></stack>"#;
    let repeat = format!(r#"<repeat><seq><dur len="2">{round}</dur><dur len="2"/></seq></repeat>"#);
    let expanded: String = (0..4).map(|k| format!(r#"<dur delay="{}" len="2">{round}</dur>"#, k * 4)).collect();
    let scene = |body: &str| {
        format!(
            r#"<dur len="14"><stack>
        <rect slot="actor" w="13" h="1"/>{body}
        <dur delay="7" len="4"><rect slot="actor" w="19" h="1"/></dur>
        </stack></dur>"#
        )
    };
    let c = clean(&scene(&repeat));
    let d = clean(&scene(&expanded));
    let visible = |p: &Project, s: &Schedule, at: f64| {
        p.script
            .elems
            .iter()
            .filter(|e| e.kind.is_visual() && s.elems[e.id].active(at))
            .filter_map(|e| match &e.kind {
                ElemKind::View(v) => v.ops.iter().find_map(|op| match op {
                    ViewOp::Rect(r) => Some(r.w as i64),
                    _ => None,
                }),
                _ => None,
            })
            .collect::<Vec<_>>()
    };
    for frame in 0..28 {
        let at = frame as f64 / 2.0;
        assert_eq!(visible(&c.p, &c.s, at), visible(&d.p, &d.s, at), "at {at}");
        assert_eq!(visible(&c.p, &c.s, at).len(), 1, "one actor at {at}");
    }
    assert_eq!(visible(&c.p, &c.s, 8.0), vec![17]); // a new round replaces the interruption
    assert_eq!(visible(&c.p, &c.s, 10.0), vec![19]); // then restores it
    assert_eq!(visible(&c.p, &c.s, 11.0), vec![13]); // then the idle portrait
    let audio = |s: &Schedule| s.audio.iter().map(|a| (a.at, a.len, a.src, a.rate, a.gain)).collect::<Vec<_>>();
    assert_eq!(audio(&c.s), audio(&d.s));
    assert_eq!(c.s.audio.len(), 4);
}

#[test]
fn nested_repeats_restart_slots_but_a_slot_on_repeat_covers_the_whole_run() {
    let c = clean(
        r#"<dur len="13"><stack>
        <rect id="idle" slot="actor" w="1" h="1"/>
        <repeat><seq>
          <dur len="5"><repeat><seq>
            <dur len="1"><rect slot="actor" w="17" h="1"/></dur><dur len="1"/>
          </seq></repeat></dur>
          <dur len="2"/>
        </seq></repeat>
    </stack></dur>"#,
    );
    let talk = c.marked("w=\"17\"");
    for t in 0..13 {
        let speaking = t % 7 < 5 && t % 7 % 2 == 0;
        assert_eq!(talk.active(t as f64), speaking, "{t}");
        assert_eq!(c.elem("idle").active(t as f64), !speaking, "{t}");
    }
    let c = clean(
        r#"<dur len="10"><stack>
        <repeat slot="actor"><dur len="2"><rect w="17" h="1"/></dur></repeat>
        <dur delay="3" len="7"><rect id="override" slot="actor" w="19" h="1"/></dur>
    </stack></dur>"#,
    );
    for t in 3..10 {
        assert!(!c.marked("w=\"17\"").active(t as f64));
        assert!(c.elem("override").active(t as f64));
    }
}

#[test]
fn dur_gives_a_length_to_what_has_none_and_cuts_or_stretches_what_has_one() {
    let c = clean(
        r#"
        <dur len="2"><rect id="a" w="10" h="10"/></dur>
        <dur len="3"><video id="v" src="v.mp4"/></dur>
        <dur len="12"><video id="w" src="w.mp4"/></dur>
        <dur len="1"/>
    "#,
    );
    assert_eq!((c.span("a"), c.span("v"), c.span("w")), ((0, 2), (2, 5), (5, 17)));
    // past its end, the source stays on its last frame
    assert_eq!(c.src("w").at(16.0), 10.0);
    assert_eq!(c.s.total, 18);
    // each thing in it gets the length, and a media keeps its holds
    for body in [
        r#"<dur len="6"><video id="m" src="m.mp4"><hold at="1"><dur len="2"/></hold></video></dur>"#,
        r#"<dur len="6"><video id="m" src="m.mp4"><hold at="1"><dur len="2"/></hold></video><rect id="r" w="1" h="1"/></dur>"#,
    ] {
        let c = clean(body);
        let m = c.elem("m");
        assert_eq!((m.start, m.end, c.s.total), (0, 6, 6), "{body}");
        assert_eq!(m.src.as_ref().unwrap().freezes().collect::<Vec<_>>(), vec![(1.0, 3.0)], "{body}");
        if body.contains("id=\"r\"") {
            assert_eq!(c.span("r"), (0, 6));
        }
    }
}

fn rect_in(p: &Project, e: usize) -> RectSpec {
    let ElemKind::View(v) = &p.script.elems[e].kind else { panic!() };
    let ViewOp::Rect(r) = &v.ops[0] else { panic!() };
    r.clone()
}

fn rect_of(p: &Project, id: &str) -> RectSpec {
    rect_in(p, named(p, id).id)
}

fn marked_rect(p: &Project, marker: &str) -> RectSpec {
    rect_in(p, marked_elem(p, marker).id)
}

#[test]
fn dur_and_repeat_are_in_time_only_and_take_no_space() {
    let c = clean(
        r##"
        <row w="100" h="10" gap="10">
            <rect w="10" h="10" fill="#f00"/>
            <dur len="1"><rect id="b" w="20" h="10" grow="1" fill="#f00"/></dur>
            <repeat><dur len="1"><rect w="11" h="10" fill="#f00"/></dur></repeat>
        </row>
    "##,
    );
    let (b, c) = (rect_of(&c.p, "b"), marked_rect(&c.p, r#"w="11""#));
    assert_eq!((b.x, b.w, c.x), (20.0, 59.0, 89.0));
    let c = clean(
        r##"
        <stack w="100" h="100" align="center">
            <dur len="1"><repeat><dur len="1"><rect w="50%" h="50%" fill="#f00"/></dur></repeat></dur>
        </stack>
    "##,
    );
    let d = marked_rect(&c.p, r#"w="50%""#);
    assert_eq!((d.x, d.y, d.w, d.h), (25.0, 25.0, 50.0, 50.0));
}

#[test]
fn slot_works_on_an_element() {
    let c = clean(
        r#"
        <dur len="4"><stack>
            <rect id="a" slot="face" w="10" h="10"/>
            <dur len="2" delay="1"><rect id="b" slot="face" w="10" h="10"/></dur>
        </stack></dur>
    "#,
    );
    assert_eq!(c.elem("a").hidden, vec![(1, 3)]);
}

#[test]
fn a_seq_in_a_row_takes_the_space_of_its_widest_child() {
    let c = clean(
        r##"
        <row gap="10">
            <rect w="10" h="10" fill="#f00"/>
            <seq>
                <dur len="1"><rect id="s1" w="30" h="10" fill="#f00"/></dur>
                <dur len="1"><rect id="s2" w="20" h="10" fill="#f00"/></dur>
            </seq>
            <rect id="after" w="10" h="10" fill="#f00"/>
        </row>
    "##,
    );
    assert_eq!(c.span("s2"), (1, 2));
    assert_eq!(rect_of(&c.p, "after").x, 60.0);
}

#[test]
fn hold_is_drawn_over_the_parent_of_its_media() {
    let c = clean(
        r##"
        <row padding="10" w="300" h="100">
            <rect w="50" h="50" fill="#f00"/>
            <video src="v.mp4" w="100" h="50"><hold at="1"><dur len="1"><rect id="note" x="50%" y="0" w="10" h="10" fill="#f00"/></dur></hold></video>
        </row>
    "##,
    );
    let r = rect_of(&c.p, "note");
    assert_eq!((r.x, r.y), (150.0, 10.0));
}

#[test]
fn xml_is_strict() {
    let wrong = [
        r#"<dur len="1.5"><rect w="1" h="1"/></dur>"#,
        r#"<dur len="1s"><rect w="1" h="1"/></dur>"#,
        r#"<dur len="-1"><rect w="1" h="1"/></dur>"#,
        r#"<dur sec="1"><rect w="1" h="1"/></dur>"#,
        r#"<dur len="1" fadein="0.5"><rect w="1" h="1"/></dur>"#,
        r#"<dur len="fill"><rect w="1" h="1"/></dur>"#,
        r#"<rect w="1" h="1" dur="1"/>"#,
        r#"<dur><rect w="1" h="1"/></dur>"#,
        r#"<dur len="1" x="0"><rect w="1" h="1"/></dur>"#,
        r#"<repeat w="10"><dur len="1"><rect w="1" h="1"/></dur></repeat><dur len="1"/>"#,
        r#"<dur len="1"><rect w="1" h="1" fill="red"/></dur>"#,
        r#"<dur len="1"><rect w="1" h="1" x="0" anchor="center"/></dur>"#,
        r#"<dur len="1"><rect w="1" h="1" stroke_width="2"/></dur>"#,
        r#"<dur len="1" delay="00:01"><rect w="1" h="1"/></dur>"#,
        r#"<dur len="1"><rect w="1px" h="1"/></dur>"#,
        r#"<dur len="1"><stack align="left"/></dur>"#,
        r#"<seq repeat="true"><dur len="1"><rect w="1" h="1"/></dur></seq>"#,
        r#"<dur len="1"><rect id="a" w="1" h="1"/></dur><dur len="1" at="2"><rect w="1" h="1"/></dur>"#,
        r#"<dur len="1"><rect id="a" w="1" h="1"/></dur><dur len="1" at="a"><rect w="1" h="1"/></dur>"#,
        r#"<dur len="1"><audio draft="true" label="x"/></dur>"#,
    ];
    for body in wrong {
        let p = project(body);
        assert!(p.has_errors(), "{body}: {:?}", p.diags);
    }
    for doc in [
        r#"<mekuru><seq/><seq/></mekuru>"#,
        r#"<mekuru><rect w="1" h="1"/></mekuru>"#,
        r#"<mekuru><seq/></mekuru>"#,
        r#"<mekuru><seq><rect w="1" h="1"/></seq></mekuru>"#,
        r#"<mekuru><seq><repeat><dur len="1"><rect w="1" h="1"/></dur></repeat></seq></mekuru>"#,
        r#"<mekuru fps="30fps"><seq/></mekuru>"#,
        r#"<mekuru version="2"><seq/></mekuru>"#,
    ] {
        let p = Project::from_source(Path::new("test.xml"), None, doc.into(), false);
        assert!(p.has_errors(), "{doc}: {:?}", p.diags);
    }
}

/// `body` in a one-frame `<stack>`.
fn stacked(body: &str) -> Project {
    project(&format!(r#"<dur len="1"><stack>{body}</stack></dur>"#))
}

fn ops(p: &Project) -> Vec<&ViewOp> {
    p.script
        .elems
        .iter()
        .filter_map(|e| if let ElemKind::View(v) = &e.kind { Some(v) } else { None })
        .flat_map(|v| &v.ops)
        .collect()
}

#[test]
fn rotate_turns_the_element_and_its_children_about_the_center() {
    let p = stacked(r##"<column x="10" y="20" w="40" h="20" fill="#f00" rotate="90"><rect w="10" h="10" fill="#00f"/></column>"##);
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
    let p = stacked(r##"<rect w="10" h="10" fill="#f00" rotate="0"/><rect w="10" h="10" fill="#f00" rotate="360"/>"##);
    assert!(!p.has_errors(), "{:?}", p.diags);
    assert!(ops(&p).iter().all(|op| matches!(op, ViewOp::Rect(_))));
}

#[test]
fn rotate_cannot_turn_a_video() {
    rejects(&[(
        r#"<dur len="1"><stack><column rotate="5"><video src="movie.mp4" w="10"/></column></stack></dur>"#,
        "E322",
    )]);
}

#[test]
fn text_is_written_in_its_text_attribute() {
    assert!(!project(r#"<dur len="1"><text text="a&#10;b"/></dur>"#).has_errors());
    rejects(&[
        (r#"<dur len="1"><text/></dur>"#, "E302"),
        (r#"<dur len="1"><text text="a">b</text></dur>"#, "E107"),
        (r#"<dur len="1"><text text="a"><rect w="1" h="1"/></text></dur>"#, "E107"),
        (r#"<dur len="1">a</dur>"#, "E107"),
        (r#"<dur len="1"><text text="a" pre="true"/></dur>"#, "E301"),
        (r#"<dur len="1"><text text="a"/><br/></dur>"#, "E300"),
    ]);
}
