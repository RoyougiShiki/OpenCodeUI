use crate::app::pty::{
    PtyCommand, PtyConnectArgs, PtyConnection, PtyConnectionKey, PtyDisconnectArgs, PtyEvent,
    PtySendArgs, PtyState,
};
use futures_util::{SinkExt, StreamExt};
use tauri::{ipc::Channel, State};
use tokio::sync::mpsc;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, Error as WsError, Message},
};

fn send_event(channel: &Channel<PtyEvent>, event: PtyEvent) {
    let _ = channel.send(event);
}

fn format_connect_error(error: WsError) -> String {
    match error {
        WsError::Http(response) => format!("PTY server returned {}", response.status()),
        other => format!("PTY connection failed: {}", other),
    }
}

#[tauri::command]
pub async fn pty_connect(
    window: tauri::Window,
    state: State<'_, PtyState>,
    args: PtyConnectArgs,
    on_event: Channel<PtyEvent>,
) -> Result<(), String> {
    let conn_id = state.id_fetch_add(1) + 1;
    let key = PtyConnectionKey::new(window.label(), args.pty_id());
    let (tx, mut rx) = mpsc::unbounded_channel();

    if let Some(previous) = state.replace(key.clone(), PtyConnection::new(conn_id, tx)) {
        let _ = previous.tx.send(PtyCommand::Close);
    }

    let mut request = args
        .url()
        .into_client_request()
        .map_err(|error| format!("Invalid PTY WebSocket URL: {}", error))?;

    if let Some(auth_header) = args.auth_header() {
        let value = HeaderValue::from_str(auth_header)
            .map_err(|error| format!("Invalid PTY Authorization header: {}", error))?;
        request.headers_mut().insert("Authorization", value);
    }

    let (ws_stream, _) = match connect_async(request).await {
        Ok(result) => result,
        Err(error) => {
            let message = format_connect_error(error);
            send_event(&on_event, PtyEvent::Error {
                message: message.clone(),
            });
            state.remove_if_current(&key, conn_id);
            return Err(message);
        }
    };

    send_event(&on_event, PtyEvent::Connected);

    let (mut write, mut read) = ws_stream.split();

    loop {
        tokio::select! {
            outbound = rx.recv() => match outbound {
                Some(PtyCommand::Send(data)) => {
                    if let Err(error) = write.send(Message::Text(data.into())).await {
                        let message = format!("PTY write failed: {}", error);
                        send_event(&on_event, PtyEvent::Error { message: message.clone() });
                        state.remove_if_current(&key, conn_id);
                        return Err(message);
                    }
                }
                Some(PtyCommand::Close) | None => {
                    let _ = write.close().await;
                    state.remove_if_current(&key, conn_id);
                    send_event(&on_event, PtyEvent::Disconnected {
                        code: Some(1000),
                        reason: "Disconnected by client".to_string(),
                    });
                    return Ok(());
                }
            },
            inbound = read.next() => match inbound {
                Some(Ok(message)) => match message {
                    Message::Text(text) => {
                        send_event(&on_event, PtyEvent::Message { chunk: text.to_string() });
                    }
                    Message::Binary(bytes) => {
                        send_event(&on_event, PtyEvent::Message {
                            chunk: String::from_utf8_lossy(&bytes).into_owned(),
                        });
                    }
                    Message::Ping(payload) => {
                        if let Err(error) = write.send(Message::Pong(payload)).await {
                            let message = format!("PTY pong failed: {}", error);
                            send_event(&on_event, PtyEvent::Error { message: message.clone() });
                            state.remove_if_current(&key, conn_id);
                            return Err(message);
                        }
                    }
                    Message::Pong(_) => {}
                    Message::Close(frame) => {
                        let code = frame.as_ref().map(|item| u16::from(item.code));
                        let reason = frame
                            .map(|item| item.reason.to_string())
                            .unwrap_or_else(|| "Connection closed by server".to_string());
                        state.remove_if_current(&key, conn_id);
                        send_event(&on_event, PtyEvent::Disconnected { code, reason });
                        return Ok(());
                    }
                    _ => {}
                },
                Some(Err(error)) => {
                    let message = format!("PTY stream error: {}", error);
                    send_event(&on_event, PtyEvent::Error { message: message.clone() });
                    state.remove_if_current(&key, conn_id);
                    return Err(message);
                }
                None => {
                    state.remove_if_current(&key, conn_id);
                    send_event(&on_event, PtyEvent::Disconnected {
                        code: None,
                        reason: "Stream ended".to_string(),
                    });
                    return Ok(());
                }
            }
        }
    }
}

#[tauri::command]
pub async fn pty_send(
    window: tauri::Window,
    state: State<'_, PtyState>,
    args: PtySendArgs,
) -> Result<(), String> {
    let key = PtyConnectionKey::new(window.label(), args.pty_id());
    let sender = state
        .sender(&key)
        .ok_or_else(|| format!("PTY connection '{}' is not active", args.pty_id()))?;

    sender
        .send(PtyCommand::Send(args.data().to_string()))
        .map_err(|_| format!("PTY connection '{}' is closed", args.pty_id()))
}

#[tauri::command]
pub async fn pty_disconnect(
    window: tauri::Window,
    state: State<'_, PtyState>,
    args: PtyDisconnectArgs,
) -> Result<(), String> {
    let key = PtyConnectionKey::new(window.label(), args.pty_id());
    state.disconnect(&key);
    Ok(())
}
