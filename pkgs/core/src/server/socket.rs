use super::{App, files};
use crate::preview::dto::Command;
use axum::{
    extract::{
        State, WebSocketUpgrade,
        ws::{CloseFrame, Message, Utf8Bytes, WebSocket},
    },
    http::{HeaderMap, StatusCode, Uri},
    response::Response,
};
use std::time::Duration;
use tokio::sync::broadcast;

pub(super) struct Subscription {
    app: App,
    receiver: broadcast::Receiver<Utf8Bytes>,
}
impl Subscription {
    pub(super) fn new(app: App) -> Self {
        Self {
            receiver: app.events.subscribe(),
            app,
        }
    }
    pub(super) fn snapshot(&mut self) -> Utf8Bytes {
        // The publication lock makes the snapshot and all subsequent updates contiguous.
        let live = self.app.live.lock().unwrap();
        self.receiver = self.app.events.subscribe();
        live.snapshot().into()
    }
    pub(super) async fn next(&mut self) -> Option<Utf8Bytes> {
        match self.receiver.recv().await {
            Ok(json) => Some(json),
            Err(broadcast::error::RecvError::Lagged(_)) => Some(self.snapshot()),
            Err(broadcast::error::RecvError::Closed) => None,
        }
    }
}

fn allowed_origin(headers: &HeaderMap) -> bool {
    // Native clients need not supply Origin; browsers must come from this server (or its dev proxy).
    let Some(origin) = headers.get("origin") else {
        return true;
    };
    let Some(origin) = origin.to_str().ok().and_then(|s| s.parse::<Uri>().ok()) else {
        return false;
    };
    matches!(origin.scheme_str(), Some("http" | "https"))
        && origin
            .authority()
            .is_some_and(|a| Some(a.as_str()) == headers.get("host").and_then(|h| h.to_str().ok()))
}

pub(super) async fn upgrade(State(app): State<App>, headers: HeaderMap, ws: WebSocketUpgrade) -> Response {
    if !allowed_origin(&headers) {
        return files::empty(StatusCode::FORBIDDEN);
    }
    let connection = app.connections.token();
    ws.max_message_size(16 * 1024).max_frame_size(16 * 1024).on_upgrade(move |socket| async move {
        let _connection = connection;
        connected(app, socket).await;
    })
}

async fn send(app: &App, socket: &mut WebSocket, message: Message) -> bool {
    tokio::select! {
        biased;
        _ = app.cancel.cancelled() => false,
        result = tokio::time::timeout(Duration::from_secs(10), socket.send(message)) => matches!(result, Ok(Ok(()))),
    }
}

async fn connected(app: App, mut socket: WebSocket) {
    let mut subscription = Subscription::new(app.clone());
    if !send(&app, &mut socket, Message::Text(subscription.snapshot())).await {
        return;
    }
    let mut heartbeat = tokio::time::interval_at(tokio::time::Instant::now() + Duration::from_secs(15), Duration::from_secs(15));
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut awaiting_pong = false;
    loop {
        let message = tokio::select! {
            _ = app.cancel.cancelled() => break,
            json = subscription.next() => match json {
                Some(json) => Message::Text(json),
                None => break,
            },
            received = socket.recv() => match received {
                Some(Ok(Message::Text(text))) => match serde_json::from_str::<Command>(&text) {
                    Ok(Command::Resync) => Message::Text(subscription.snapshot()),
                    Err(_) => Message::Close(Some(CloseFrame { code: 1008, reason: "unknown preview command".into() })),
                },
                Some(Ok(Message::Ping(bytes))) => Message::Pong(bytes),
                Some(Ok(Message::Pong(_))) => { awaiting_pong = false; continue; }
                Some(Ok(Message::Binary(_))) => Message::Close(Some(CloseFrame { code: 1003, reason: "expected a JSON text message".into() })),
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
            },
            _ = heartbeat.tick() => {
                if awaiting_pong { break; }
                awaiting_pong = true;
                Message::Ping(Vec::new().into())
            },
        };
        let closing = matches!(message, Message::Close(_));
        if !send(&app, &mut socket, message).await {
            break;
        }
        if closing {
            return;
        }
    }
    let _ = tokio::time::timeout(Duration::from_millis(200), socket.send(Message::Close(None))).await;
}
