use mekuru_compiler::{Project, ir::{Elem, ElemKind, Target, ViewOp}, schedule::{ElemTime, MediaDb, MediaInfo, Schedule}};
use std::path::Path;

struct Media;

impl MediaDb for Media {
    fn info(&self, e: &Elem) -> Option<MediaInfo> {
        e.kind.media().map(|_| MediaInfo { len: 10.0, has_audio: true })
    }
}

fn project(body: &str) -> Project {
    Project::from_source(Path::new("test.xml"), None, format!(r#"<mekuru fps="1"><seq>{body}</seq></mekuru>"#))
}

fn compile(body: &str) -> (Project, Schedule) {
    let p = project(body);
    assert!(!p.has_errors(), "{:?}", p.diags);
    let sched = p.schedule(&Media);
    (p, sched)
}

fn codes(p: &Project) -> Vec<&str> {
    p.diags.iter().map(|d| d.code).collect()
}

fn elem<'a>(p: &Project, s: &'a Schedule, id: &str) -> &'a ElemTime {
    let Target::Elem(e) = p.script.ids[id] else { panic!("expected element {id}") };
    &s.elems[e]
}

fn marked<'a>(p: &Project, s: &'a Schedule, marker: &str) -> &'a ElemTime {
    let has = |e: &&Elem| p.source[e.site.lo as usize..e.site.hi as usize].contains(marker);
    let e = p.script.elems.iter().filter(has).min_by_key(|e| e.site.hi - e.site.lo).expect(marker);
    &s.elems[e.id]
}

fn clean(s: &Schedule) {
    assert!(s.diags.is_empty(), "{:?}", s.diags);
}

#[test]
fn sequence_waits_for_what_has_a_length_and_not_for_what_has_none() {
    let (p, s) = compile(r#"
        <rect id="background" w="100" h="100"/>
        <dur len="3"><stack><rect id="first" w="10" h="10"/></stack></dur>
        <stack><rect id="caption" w="10" h="10"/></stack>
        <seq delay="1">
            <dur len="2"><rect id="second" w="10" h="10"/></dur>
            <dur len="1"><rect id="third" w="10" h="10"/></dur>
        </seq>
    "#);
    clean(&s);
    assert_eq!(s.total, 7);
    for (id, start, end) in [("background", 0, 7), ("first", 0, 3), ("caption", 3, 7), ("second", 4, 6), ("third", 6, 7)] {
        let t = elem(&p, &s, id);
        assert_eq!((t.start, t.end), (start, end), "{id}");
    }
}

#[test]
fn a_group_lasts_until_the_last_thing_in_it_ends() {
    let (p, s) = compile(r#"
        <stack id="scene">
            <rect id="note" w="10" h="10"/>
            <dur len="2"><audio id="a" src="a.wav"/></dur>
            <dur len="3" delay="1"><audio id="b" src="b.wav"/></dur>
        </stack>
        <stack id="empty"/>
        <dur len="1"><rect id="next" w="10" h="10"/></dur>
    "#);
    clean(&s);
    assert_eq!((elem(&p, &s, "note").start, elem(&p, &s, "note").end), (0, 4));
    assert_eq!(elem(&p, &s, "next").start, 4);
    assert_eq!(s.total, 5);
}

#[test]
fn hold_keeps_media_waiting_at_a_source_position() {
    let (p, s) = compile(r#"
        <stack>
            <video id="movie" src="movie.mp4"><hold at="2"><dur len="3"/></hold></video>
            <dur len="1" at="movie:2"><rect id="freeze" w="10" h="10"/></dur>
            <dur len="1" at="movie:4"><rect id="cue" w="10" h="10"/></dur>
        </stack>
    "#);
    clean(&s);
    assert_eq!(s.total, 13);
    let map = elem(&p, &s, "movie").src.as_ref().unwrap();
    assert_eq!(map.freezes().collect::<Vec<_>>(), vec![(2.0, 5.0)]);
    assert_eq!(map.at(4.0), 2.0);
    assert_eq!(map.at(6.0), 3.0);
    assert_eq!(elem(&p, &s, "freeze").start, 2);
    assert_eq!(elem(&p, &s, "cue").start, 7);
    assert_eq!(s.audio.iter().map(|a| (a.at, a.len, a.src)).collect::<Vec<_>>(), vec![(0.0, 2.0, 0.0), (5.0, 8.0, 2.0)]);
}

#[test]
fn holds_at_one_position_wait_for_the_longest_and_holds_at_others_add_up() {
    let (p, s) = compile(r#"
        <stack>
            <video id="movie" src="movie.mp4">
                <hold at="2"><dur len="1"/></hold>
                <hold at="2"><dur len="3"/></hold>
                <hold at="6"><dur len="2"/></hold>
                <hold at="10"><dur len="1"/></hold>
            </video>
        </stack>
    "#);
    clean(&s);
    assert_eq!(s.total, 16);
    let map = elem(&p, &s, "movie").src.as_ref().unwrap();
    assert_eq!(map.freezes().collect::<Vec<_>>(), vec![(2.0, 5.0), (9.0, 11.0), (15.0, 16.0)]);
    assert_eq!(elem(&p, &s, "movie").end, 16);
}

#[test]
fn hold_lasts_as_long_as_what_is_in_it() {
    let (p, s) = compile(r#"
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
    "#);
    clean(&s);
    let t = |id| (elem(&p, &s, id).start, elem(&p, &s, id).end);
    assert_eq!((t("talk"), t("more"), t("label")), ((4, 7), (7, 8), (4, 8)));
    assert_eq!(elem(&p, &s, "life").src.as_ref().unwrap().freezes().collect::<Vec<_>>(), vec![(4.0, 8.0)]);
    assert_eq!(elem(&p, &s, "after").start, 9);
    assert_eq!(s.total, 14);
}

#[test]
fn hold_is_cut_by_its_own_dur_and_with_its_media() {
    let (p, s) = compile(r#"
        <stack>
            <video id="v" src="v.mp4"><hold at="2"><dur len="3"><dur len="5"><rect id="note" w="10" h="10"/></dur></dur></hold></video>
        </stack>
    "#);
    clean(&s);
    assert_eq!((elem(&p, &s, "note").start, elem(&p, &s, "note").end), (2, 5));
    assert_eq!(elem(&p, &s, "v").src.as_ref().unwrap().freezes().collect::<Vec<_>>(), vec![(2.0, 5.0)]);
    assert_eq!(s.total, 13);
    let (p, s) = compile(r#"
        <dur len="3"><stack>
            <video id="v" src="v.mp4"><hold at="2"><dur len="5"><rect id="note" w="10" h="10"/></dur></hold></video>
        </stack></dur>
    "#);
    assert_eq!((elem(&p, &s, "note").start, elem(&p, &s, "note").end), (2, 3));
    assert_eq!(elem(&p, &s, "v").end, 3);
    assert_eq!(s.total, 3);
    let (p, s) = compile(r#"
        <dur len="1"><stack>
            <video id="v" src="v.mp4"><hold at="2"><dur len="5"><rect id="note" w="10" h="10"/></dur></hold></video>
        </stack></dur>
    "#);
    let note = elem(&p, &s, "note");
    assert_eq!(note.start, note.end);
    assert!(s.diags.iter().all(|d| !d.is_error()), "{:?}", s.diags);
}

#[test]
fn hold_goes_in_media_and_has_a_length() {
    for (body, code) in [
        (r#"<stack><hold at="1"><dur len="1"/></hold></stack>"#, "E107"),
        (r#"<stack><video src="v.mp4"><dur len="1"><rect w="1" h="1"/></dur></video></stack>"#, "E107"),
        (r#"<stack><video src="v.mp4"><hold at="1"/></video></stack>"#, "E320"),
        (r#"<stack><video src="v.mp4"><hold at="1"><rect w="1" h="1"/></hold></video></stack>"#, "E320"),
        (r#"<stack><video src="v.mp4"><hold at="1"><dur len="fill"/></hold></video></stack>"#, "E303"),
        (r#"<stack><video src="v.mp4"><hold><dur len="1"/></hold></video></stack>"#, "E302"),
    ] {
        let p = project(body);
        assert!(codes(&p).contains(&code), "{body}: {:?}", p.diags);
    }
    let (_, s) = compile(r#"<stack><video src="v.mp4"><hold at="12"><dur len="1"/></hold></video></stack>"#);
    assert!(s.diags.iter().any(|d| d.code == "E504"), "{:?}", s.diags);
}

#[test]
fn hold_in_a_repeat_comes_round_with_its_media() {
    let (p, s) = compile(r#"
        <dur len="27"><stack>
            <repeat>
                <seq>
                    <video src="v.mp4"><hold at="5"><dur len="2"><rect w="11" h="10"/></dur></hold></video>
                    <dur len="1"><stack/></dur>
                </seq>
            </repeat>
        </stack></dur>
    "#);
    clean(&s);
    let note = marked(&p, &s, r#"w="11""#);
    for (t, shown) in [(4.0, false), (6.0, true), (11.0, false), (19.0, true), (25.0, false)] {
        assert_eq!(note.active(t), shown, "{t}");
    }
}

#[test]
fn media_in_a_repeat_keeps_its_holds_speeds_and_cuts_every_round() {
    let (p, s) = compile(r#"
        <dur len="20"><stack>
            <repeat>
                <video src="v.mp4"><cut from="0" to="4"/><hold at="5"><dur len="2"><rect w="11" h="10"/></dur></hold></video>
            </repeat>
        </stack></dur>
    "#);
    clean(&s);
    let note = marked(&p, &s, r#"w="11""#);
    for (t, shown) in [(2.0, true), (4.0, false), (10.0, true), (12.0, false), (18.0, true)] {
        assert_eq!(note.active(t), shown, "{t}");
    }
    let mut clips = s.audio.iter().map(|a| (a.at, a.len, a.src)).collect::<Vec<_>>();
    clips.sort_by(|a, b| a.0.total_cmp(&b.0));
    assert_eq!(clips, vec![(0.0, 1.0, 4.0), (3.0, 5.0, 5.0), (8.0, 1.0, 4.0), (11.0, 5.0, 5.0), (16.0, 1.0, 4.0), (19.0, 1.0, 5.0)]);
}

#[test]
fn cut_skips_a_part_of_the_source() {
    let (p, s) = compile(r#"
        <stack>
            <video id="v" src="v.mp4"><cut from="2" to="5"/></video>
            <dur len="1" at="v:6"><rect id="after" w="10" h="10"/></dur>
            <dur len="1" at="v:3"><rect id="inside" w="10" h="10"/></dur>
        </stack>
    "#);
    clean(&s);
    assert_eq!(s.total, 7);
    let map = elem(&p, &s, "v").src.as_ref().unwrap();
    assert_eq!((map.at(1.0), map.at(3.0)), (1.0, 6.0));
    assert_eq!((elem(&p, &s, "after").start, elem(&p, &s, "inside").start), (3, 2));
    assert_eq!(s.audio.iter().map(|a| (a.at, a.len, a.src, a.rate)).collect::<Vec<_>>(), vec![(0.0, 2.0, 0.0, 1.0), (2.0, 5.0, 5.0, 1.0)]);
}

#[test]
fn speed_plays_a_part_faster_or_slower() {
    let (p, s) = compile(r#"
        <stack>
            <video id="v" src="v.mp4"><speed from="2" to="6" rate="2"/><speed from="8" rate="0.5"/></video>
            <dur len="1" at="v:5"><rect id="r" w="10" h="10"/></dur>
        </stack>
    "#);
    clean(&s);
    assert_eq!(s.total, 10);
    let map = elem(&p, &s, "v").src.as_ref().unwrap();
    assert_eq!((map.at(3.0), map.at(5.0), map.at(8.0)), (4.0, 7.0, 9.0));
    assert_eq!(elem(&p, &s, "r").start, 4);
    let clips = s.audio.iter().map(|a| (a.at, a.len, a.src, a.rate)).collect::<Vec<_>>();
    assert_eq!(clips, vec![(0.0, 2.0, 0.0, 1.0), (2.0, 2.0, 2.0, 2.0), (4.0, 2.0, 6.0, 1.0), (6.0, 4.0, 8.0, 0.5)]);
    let (p, s) = compile(r#"<stack><video id="v" src="v.mp4"><speed rate="2"/></video></stack>"#);
    assert_eq!(elem(&p, &s, "v").end, 5);
    let (p, s) = compile(r#"
        <stack>
            <video id="v" src="v.mp4"><speed from="2" to="6" rate="2"/><speed from="4" to="8" rate="2"/><cut from="7" to="9"/></video>
        </stack>
    "#);
    assert_eq!(elem(&p, &s, "v").end, 5);
}

#[test]
fn media_gets_to_a_position_on_the_first_frame_after_it_plays_there() {
    let (p, s) = compile(r#"
        <stack>
            <video id="v" src="v.mp4"><speed rate="3"/><hold at="5"><dur len="2"><rect id="note" w="10" h="10"/></dur></hold></video>
            <dur len="1" at="v:7"><rect id="cue" w="10" h="10"/></dur>
        </stack>
    "#);
    clean(&s);
    let t = |id| (elem(&p, &s, id).start, elem(&p, &s, id).end);
    assert_eq!((t("note"), elem(&p, &s, "cue").start, elem(&p, &s, "v").end, s.total), ((2, 4), 5, 6, 6));
    let map = elem(&p, &s, "v").src.as_ref().unwrap();
    assert_eq!(map.freezes().map(|(a, b)| ((a * 3.0).round(), b)).collect::<Vec<_>>(), vec![(5.0, 4.0)]);
    let clips: Vec<_> = s.audio.iter().map(|a| (a.at, (a.len * 3.0).round(), a.src)).collect();
    assert_eq!(clips, vec![(0.0, 5.0, 0.0), (4.0, 5.0, 5.0)]);
}

#[test]
fn hold_waits_at_its_position_through_speeds_and_cuts() {
    let (p, s) = compile(r#"
        <stack>
            <video id="v" src="v.mp4">
                <hold at="1"><dur len="2"/></hold>
                <cut from="2" to="5"/>
                <hold at="3"><dur len="1"/></hold>
                <speed from="6" to="8" rate="2"/>
            </video>
        </stack>
    "#);
    clean(&s);
    assert_eq!(s.total, 9);
    let map = elem(&p, &s, "v").src.as_ref().unwrap();
    assert_eq!(map.freezes().collect::<Vec<_>>(), vec![(1.0, 3.0), (4.0, 5.0)]);
    assert_eq!((map.at(4.5), map.at(6.5)), (5.0, 7.0));
}

#[test]
fn speed_and_cut_go_in_media_and_say_a_part() {
    for (body, code) in [
        (r#"<stack><cut from="1" to="2"/></stack>"#, "E107"),
        (r#"<stack><speed rate="2"/></stack>"#, "E107"),
        (r#"<stack><video src="v.mp4"><cut from="3" to="2"/></video></stack>"#, "E314"),
        (r#"<stack><video src="v.mp4"><speed from="1" to="2"/></video></stack>"#, "E302"),
        (r#"<stack><video src="v.mp4"><speed rate="0"/></video></stack>"#, "E303"),
        (r#"<stack><video src="v.mp4"><speed rate="50%"/></video></stack>"#, "E303"),
        (r#"<stack><video src="v.mp4"><cut from="1" to="2" rate="2"/></video></stack>"#, "E301"),
    ] {
        let p = project(body);
        assert!(codes(&p).contains(&code), "{body}: {:?}", p.diags);
    }
    let (_, s) = compile(r#"<stack><video src="v.mp4" from="1"><cut from="0" to="1"/></video></stack>"#);
    assert!(s.diags.iter().any(|d| d.code == "E504"), "{:?}", s.diags);
}

#[test]
fn parent_duration_cuts_media_and_a_reference_past_it_is_an_error() {
    let (p, s) = compile(r#"
        <dur len="3"><stack>
            <video id="movie" src="movie.mp4"/>
            <dur len="1" at="movie:5"><rect id="later" w="10" h="10"/></dur>
        </stack></dur>
    "#);
    assert_eq!(s.total, 3);
    assert_eq!(elem(&p, &s, "movie").end, 3);
    let later = elem(&p, &s, "later");
    assert_eq!(later.start, later.end);
    assert!(s.diags.iter().any(|d| d.code == "E504"));
    assert!(s.diags.iter().all(|d| d.code != "W556"), "{:?}", s.diags);
    assert_eq!(s.audio[0].len, 3.0);
}

#[test]
fn a_reference_out_of_the_source_is_an_error() {
    for at in ["movie:0", "movie:11"] {
        let (_, s) = compile(&format!(r#"<stack><video id="movie" src="movie.mp4" from="1"/><dur len="1" at="{at}"><rect w="1" h="1"/></dur></stack>"#));
        assert!(s.diags.iter().any(|d| d.code == "E504"), "{at}: {:?}", s.diags);
    }
    let (p, s) = compile(r#"<dur len="30"><stack><repeat id="bgm"><audio src="bgm.mp3"/></repeat><dur len="1" at="bgm:25"><rect id="r" w="1" h="1"/></dur></stack></dur>"#);
    clean(&s);
    assert_eq!(elem(&p, &s, "r").start, 25);
}

#[test]
fn visual_repeat_reuses_first_round_until_parent_ends() {
    let (p, s) = compile(r#"
        <dur len="5"><stack>
            <repeat>
                <seq>
                    <dur len="1"><rect w="11" h="10"/></dur>
                    <dur len="1"><rect w="12" h="10"/></dur>
                </seq>
            </repeat>
        </stack></dur>
    "#);
    clean(&s);
    assert_eq!(s.total, 5);
    let a = marked(&p, &s, r#"w="11""#);
    let b = marked(&p, &s, r#"w="12""#);
    for t in [0.5, 2.5, 4.5] { assert!(a.active(t)); assert!(!b.active(t)); }
    for t in [1.5, 3.5] { assert!(!a.active(t)); assert!(b.active(t)); }
    assert!(!a.active(5.0));
    assert!(!b.active(5.0));
}

#[test]
fn repeat_puts_its_children_on_top_of_each_other_and_a_round_lasts_until_the_last_ends() {
    let (p, s) = compile(r#"
        <dur len="7"><stack>
            <repeat>
                <dur len="1"><rect w="11" h="10"/></dur>
                <dur len="3"><rect w="12" h="10"/></dur>
                <rect w="13" h="10"/>
            </repeat>
        </stack></dur>
    "#);
    clean(&s);
    let (a, b, c) = (marked(&p, &s, r#"w="11""#), marked(&p, &s, r#"w="12""#), marked(&p, &s, r#"w="13""#));
    for (t, shown) in [(0.5, [true, true]), (1.5, [false, true]), (3.5, [true, true]), (4.5, [false, true]), (6.5, [true, true])] {
        assert_eq!([a.active(t), b.active(t)], shown, "{t}");
        assert!(c.active(t), "{t}");
    }
    let (p, s) = compile(r#"
        <dur len="5"><repeat><dur len="2"><rect w="11" h="10"/></dur></repeat></dur>
        <dur len="1"><rect id="next" w="10" h="10"/></dur>
    "#);
    clean(&s);
    assert_eq!(elem(&p, &s, "next").start, 5);
    assert!(marked(&p, &s, r#"w="11""#).active(4.0));
}

#[test]
fn slot_override_hides_visuals_only_and_restores_previous_holder() {
    let (p, s) = compile(r#"
        <dur len="6"><stack>
            <stack slot="portrait"><rect id="base" w="10" h="10"/></stack>
            <dur len="2" delay="2"><stack slot="portrait">
                <rect id="override" w="10" h="10"/>
                <dur len="2"><audio id="voice" src="voice.wav"/></dur>
            </stack></dur>
            <dur len="1" delay="3"><stack slot="portrait"><rect w="10" h="10"/></stack></dur>
        </stack></dur>
    "#);
    clean(&s);
    let base = elem(&p, &s, "base");
    assert_eq!(base.hidden, vec![(2, 4)]);
    assert!(base.active(1.0));
    assert!(!base.active(3.0));
    assert!(base.active(4.0));
    assert!(!elem(&p, &s, "override").active(3.5));
    assert!(elem(&p, &s, "voice").active(3.5));
}

#[test]
fn nested_layout_fades_multiply() {
    let (p, s) = compile(r#"
        <dur len="8"><column fadein="2" fadeout="2">
            <dur len="8"><rect id="child" w="10" h="10" fadein="2" fadeout="2"/></dur>
        </column></dur>
    "#);
    clean(&s);
    let child = elem(&p, &s, "child");
    assert_eq!(child.envelope(1.0), 0.25);
    assert_eq!(child.envelope(4.0), 1.0);
    assert_eq!(child.envelope(7.0), 0.25);
}

#[test]
fn loops_of_at_are_errors() {
    let (_, cycle) = compile(r#"
        <stack>
            <dur len="1" at="b:0"><rect id="a" w="10" h="10"/></dur>
            <dur len="1" at="a:0"><rect id="b" w="10" h="10"/></dur>
        </stack>
    "#);
    assert_eq!(cycle.diags.iter().filter(|d| d.code == "E510").count(), 2, "{:?}", cycle.diags);
    let (_, hold) = compile(r#"<stack><video id="movie" src="movie.mp4"><hold at="2"><dur len="1" at="movie:3"><rect w="1" h="1"/></dur></hold></video></stack>"#);
    assert!(hold.diags.iter().any(|d| d.code == "E510"), "{:?}", hold.diags);
    assert_eq!(hold.total, 0);
}

#[test]
fn start_waits_for_the_flow_with_delay_and_for_the_reference() {
    let body = |x: i64, delay: i64| format!(r#"
        <stack>
            <dur len="1" delay="{x}"><rect id="x" w="10" h="10"/></dur>
            <seq>
                <dur len="2"><rect id="a" w="10" h="10"/></dur>
                <dur len="1" at="x:0" delay="{delay}"><rect id="b" w="10" h="10"/></dur>
            </seq>
        </stack>
    "#);
    let (p, s) = compile(&body(5, 0));
    clean(&s);
    assert_eq!(elem(&p, &s, "b").start, 5);
    let (p, s) = compile(&body(5, 4));
    assert_eq!(elem(&p, &s, "b").start, 6);
    assert!(s.diags.iter().all(|d| d.code == "W550"), "{:?}", s.diags);
    let (p, s) = compile(&body(1, 0));
    assert_eq!(elem(&p, &s, "b").start, 2);
    assert!(s.diags.iter().all(|d| d.code == "W550"), "{:?}", s.diags);
}

#[test]
fn group_fades_reach_everything_inside_with_audio() {
    let (p, s) = compile(r#"
        <dur len="4"><stack id="scene" fadeout="2" opacity="0.5">
            <rect id="r" w="10" h="10"/>
            <dur len="4"><audio id="voice" src="voice.wav"/></dur>
        </stack></dur>
    "#);
    clean(&s);
    assert_eq!(elem(&p, &s, "r").envelope(3.0), 0.5);
    let Target::Elem(r) = p.script.ids["r"] else { panic!() };
    assert_eq!(p.script.elems[r].opacity, 0.5);
    let clip = &s.audio[0];
    let gain: f64 = clip.env.iter().map(|f| f.at(3.0)).product();
    assert_eq!(gain, 0.5);
}

#[test]
fn repeat_plays_its_audio_in_every_round() {
    let (_, s) = compile(r#"
        <dur len="10"><stack>
            <repeat>
                <seq>
                    <dur len="2"><audio src="tick.wav" fadein="1"/></dur>
                    <dur len="2"><stack/></dur>
                </seq>
            </repeat>
        </stack></dur>
    "#);
    clean(&s);
    assert_eq!(s.audio.iter().map(|a| (a.at, a.len)).collect::<Vec<_>>(), vec![(0.0, 2.0), (4.0, 2.0), (8.0, 2.0)]);
    for a in &s.audio {
        let gain: f64 = a.env.iter().map(|f| f.at(a.at + 0.5)).product();
        assert_eq!(gain, 0.5);
    }
}

#[test]
fn repeated_music_plays_round_after_round_and_the_fades_of_the_repeat_reach_the_whole() {
    let (_, s) = compile(r#"
        <dur len="25"><stack>
            <repeat fadein="1" fadeout="2"><audio src="bgm.mp3"/></repeat>
        </stack></dur>
    "#);
    clean(&s);
    assert_eq!(s.audio.iter().map(|a| (a.at, a.len, a.src)).collect::<Vec<_>>(), vec![(0.0, 10.0, 0.0), (10.0, 10.0, 0.0), (20.0, 5.0, 0.0)]);
    let gain = |k: usize, t: f64| s.audio[k].env.iter().map(|f| f.at(t)).product::<f64>();
    assert_eq!((gain(0, 0.5), gain(1, 10.5), gain(2, 24.0)), (0.5, 1.0, 0.5));
}

#[test]
fn nested_repeats_map_time_round_by_round() {
    let (p, s) = compile(r#"
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
    "#);
    clean(&s);
    let (first, a, b) = (marked(&p, &s, r#"w="11""#), marked(&p, &s, r#"w="12""#), marked(&p, &s, r#"w="13""#));
    for (t, shown) in [(1.0, 0), (2.4, 1), (3.4, 2), (4.4, 1), (5.2, 2), (7.0, 0), (8.4, 1), (9.2, 2), (11.4, 2)] {
        let active = [first.active(t), a.active(t), b.active(t)];
        assert_eq!(active.iter().filter(|&&x| x).count(), 1, "{t}");
        assert!(active[shown], "{t}: {active:?}");
    }
}

#[test]
fn repeat_needs_something_with_a_length_and_nothing_named_inside() {
    for body in [
        r#"<dur len="1"><stack><repeat><dur len="1"><rect id="a" w="1" h="1"/></dur></repeat></stack></dur>"#,
        r#"<dur len="1"><stack><repeat><dur len="1"><rect w="1" h="1" slot="s"/></dur></repeat></stack></dur>"#,
        r#"<dur len="1"><stack><repeat><rect w="1" h="1"/></repeat></stack></dur>"#,
        r#"<dur len="1"><stack><dur len="1"><repeat><rect w="1" h="1"/></repeat></dur></stack></dur>"#,
    ] {
        let p = project(body);
        assert!(codes(&p).contains(&"E321"), "{body}: {:?}", p.diags);
    }
}

#[test]
fn dur_gives_a_length_to_what_has_none_and_cuts_or_stretches_what_has_one() {
    let (p, s) = compile(r#"
        <dur len="2"><rect id="a" w="10" h="10"/></dur>
        <dur len="3"><video id="v" src="v.mp4"/></dur>
        <dur len="12"><video id="w" src="w.mp4"/></dur>
        <dur len="1"/>
    "#);
    clean(&s);
    let t = |id| (elem(&p, &s, id).start, elem(&p, &s, id).end);
    assert_eq!((t("a"), t("v"), t("w")), ((0, 2), (2, 5), (5, 17)));
    // past its end, the source stays on its last frame
    assert_eq!(elem(&p, &s, "w").src.as_ref().unwrap().at(16.0), 10.0);
    assert_eq!(s.total, 18);
    // each thing in it gets the length, and a media keeps its holds
    for body in [
        r#"<dur len="6"><video id="m" src="m.mp4"><hold at="1"><dur len="2"/></hold></video></dur>"#,
        r#"<dur len="6"><video id="m" src="m.mp4"><hold at="1"><dur len="2"/></hold></video><rect id="r" w="1" h="1"/></dur>"#,
    ] {
        let (p, s) = compile(body);
        clean(&s);
        let m = elem(&p, &s, "m");
        assert_eq!((m.start, m.end, s.total), (0, 6, 6), "{body}");
        assert_eq!(m.src.as_ref().unwrap().freezes().collect::<Vec<_>>(), vec![(1.0, 3.0)], "{body}");
        if let Some(Target::Elem(r)) = p.script.ids.get("r") {
            assert_eq!((s.elems[*r].start, s.elems[*r].end), (0, 6));
        }
    }
}

fn rect_in(p: &Project, e: usize) -> mekuru_compiler::ir::RectSpec {
    let ElemKind::View(v) = &p.script.elems[e].kind else { panic!() };
    let ViewOp::Rect(r) = &v.ops[0] else { panic!() };
    r.clone()
}

fn rect_of(p: &Project, id: &str) -> mekuru_compiler::ir::RectSpec {
    let Target::Elem(e) = p.script.ids[id] else { panic!("expected element {id}") };
    rect_in(p, e)
}

fn marked_rect(p: &Project, marker: &str) -> mekuru_compiler::ir::RectSpec {
    let has = |e: &&Elem| p.source[e.site.lo as usize..e.site.hi as usize].contains(marker);
    rect_in(p, p.script.elems.iter().filter(has).min_by_key(|e| e.site.hi - e.site.lo).expect(marker).id)
}

#[test]
fn dur_and_repeat_are_in_time_only_and_take_no_space() {
    let (p, s) = compile(r##"
        <row w="100" h="10" gap="10">
            <rect w="10" h="10" fill="#f00"/>
            <dur len="1"><rect id="b" w="20" h="10" grow="1" fill="#f00"/></dur>
            <repeat><dur len="1"><rect w="11" h="10" fill="#f00"/></dur></repeat>
        </row>
    "##);
    clean(&s);
    let (b, c) = (rect_of(&p, "b"), marked_rect(&p, r#"w="11""#));
    assert_eq!((b.x, b.w, c.x), (20.0, 59.0, 89.0));
    let (p, s) = compile(r##"
        <stack w="100" h="100" align="center">
            <dur len="1"><repeat><dur len="1"><rect w="50%" h="50%" fill="#f00"/></dur></repeat></dur>
        </stack>
    "##);
    clean(&s);
    let d = marked_rect(&p, r#"w="50%""#);
    assert_eq!((d.x, d.y, d.w, d.h), (25.0, 25.0, 50.0, 50.0));
}

#[test]
fn slot_works_on_an_element() {
    let (p, s) = compile(r#"
        <dur len="4"><stack>
            <rect id="a" slot="face" w="10" h="10"/>
            <dur len="2" delay="1"><rect id="b" slot="face" w="10" h="10"/></dur>
        </stack></dur>
    "#);
    clean(&s);
    assert_eq!(elem(&p, &s, "a").hidden, vec![(1, 3)]);
}

#[test]
fn a_seq_in_a_row_takes_the_space_of_its_widest_child() {
    let (p, s) = compile(r##"
        <row gap="10">
            <rect w="10" h="10" fill="#f00"/>
            <seq>
                <dur len="1"><rect id="s1" w="30" h="10" fill="#f00"/></dur>
                <dur len="1"><rect id="s2" w="20" h="10" fill="#f00"/></dur>
            </seq>
            <rect id="after" w="10" h="10" fill="#f00"/>
        </row>
    "##);
    clean(&s);
    assert_eq!((elem(&p, &s, "s2").start, elem(&p, &s, "s2").end), (1, 2));
    let Target::Elem(after) = p.script.ids["after"] else { panic!() };
    let ElemKind::View(v) = &p.script.elems[after].kind else { panic!() };
    let ViewOp::Rect(r) = &v.ops[0] else { panic!() };
    assert_eq!(r.x, 60.0);
}

#[test]
fn hold_is_drawn_over_the_parent_of_its_media() {
    let (p, s) = compile(r##"
        <row padding="10" w="300" h="100">
            <rect w="50" h="50" fill="#f00"/>
            <video src="v.mp4" w="100" h="50"><hold at="1"><dur len="1"><rect id="note" x="50%" y="0" w="10" h="10" fill="#f00"/></dur></hold></video>
        </row>
    "##);
    clean(&s);
    let Target::Elem(note) = p.script.ids["note"] else { panic!() };
    let ElemKind::View(v) = &p.script.elems[note].kind else { panic!() };
    let ViewOp::Rect(r) = &v.ops[0] else { panic!() };
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
        let p = Project::from_source(Path::new("test.xml"), None, doc.into());
        assert!(p.has_errors(), "{doc}: {:?}", p.diags);
    }
}

