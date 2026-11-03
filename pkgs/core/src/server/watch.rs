use super::App;
use anyhow::Result;
use notify::{RecursiveMode, Watcher};
use std::{path::PathBuf, time::Duration};
use tokio::{sync::watch, task::JoinHandle};

pub(super) fn start(path: PathBuf, app: App) -> Result<JoinHandle<()>> {
    // Filesystem events resolve directory aliases such as macOS's /var -> /private/var.
    // Resolve only the parent: --run may create the XML after the watcher starts.
    let path = path.parent().unwrap().canonicalize()?.join(path.file_name().unwrap());
    let (changed, mut changes) = watch::channel(0u64);
    let target = path.clone();
    let handler = move |result: notify::Result<notify::Event>| match result {
        Ok(event) if !matches!(event.kind, notify::EventKind::Access(_)) && event.paths.iter().any(|p| p == &target) => {
            changed.send_modify(|n| *n = n.wrapping_add(1));
        }
        Err(error) => eprintln!("XML watcher: {error}"),
        _ => {}
    };
    // A parent-directory watch survives atomic saves; mounted Windows folders need polling.
    let mut watcher: Box<dyn Watcher + Send> = if path.starts_with("/mnt/") {
        Box::new(notify::PollWatcher::new(
            handler,
            notify::Config::default()
                .with_poll_interval(Duration::from_millis(500))
                .with_compare_contents(true),
        )?)
    } else {
        Box::new(notify::recommended_watcher(handler)?)
    };
    watcher.watch(path.parent().unwrap(), RecursiveMode::NonRecursive)?;
    Ok(tokio::spawn(async move {
        let _watcher = watcher;
        // Read once after the watch is installed, closing the startup read/watch race.
        let mut sample = true;
        // The text and modification time last handled. Events that change neither are not saves:
        // macOS reports writes made just before the watch started, and mode changes give events too.
        let mut seen = None;
        loop {
            if !sample {
                tokio::select! { _ = app.cancel.cancelled() => break, result = changes.changed() => { if result.is_err() { break; } } }
            }
            sample = false;
            let mut previous = None;
            let mut failures = 0;
            loop {
                let generation = *changes.borrow_and_update();
                tokio::select! {
                    _ = app.cancel.cancelled() => return,
                    result = changes.changed() => { if result.is_err() { return; } previous = None; failures = 0; continue; }
                    _ = tokio::time::sleep(Duration::from_millis(10)) => {}
                }
                let text = tokio::fs::read_to_string(&path).await;
                if app.cancel.is_cancelled() {
                    return;
                }
                if *changes.borrow() != generation {
                    previous = None;
                    failures = 0;
                    continue;
                }
                match text {
                    Ok(text) => {
                        failures = 0;
                        if previous.as_ref() == Some(&text) {
                            let modified = tokio::fs::metadata(&path).await.and_then(|m| m.modified()).ok();
                            let current = (text, modified);
                            if seen.as_ref() != Some(&current) {
                                if generation != 0 || app.live.lock().unwrap().xml != current.0 {
                                    app.changed(current.0.clone());
                                }
                                seen = Some(current);
                            }
                            break;
                        }
                        previous = Some(text);
                    }
                    Err(_) => {
                        failures += 1;
                        if failures >= 3 {
                            break;
                        }
                    }
                }
            }
        }
    }))
}
