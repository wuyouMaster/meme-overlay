use crate::commands::append_debug_log_line;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use tauri::{Emitter, Manager};

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "type")]
pub enum PluginMessage {
    #[serde(rename = "show")]
    Show {
        hook_id: Option<String>,
        stop_movement: Option<bool>,
    },
    #[serde(rename = "hide")]
    Hide,
    #[serde(rename = "animation")]
    Animation { name: String },
    #[serde(rename = "progress")]
    Progress { text: String },
}

pub fn listen(handle: tauri::AppHandle) {
    let stdin = std::io::stdin();
    let reader = BufReader::new(stdin);

    for line in reader.lines() {
        let Ok(msg) = line else { continue };
        let msg = msg.trim();
        if msg.is_empty() {
            continue;
        }

        let Ok(parsed) = serde_json::from_str::<PluginMessage>(msg) else {
            let _ = append_debug_log_line("stdin_reader", &format!("Failed to parse: {msg}"));
            continue;
        };

        let _ = append_debug_log_line("stdin_reader", &format!("Received: {:?}", parsed));

        if let Some(win) = handle.get_webview_window("overlay") {
            let _ = append_debug_log_line("stdin_reader", "Emitting plugin-message to overlay window");
            let _ = win.emit("plugin-message", &parsed);
        } else {
            let _ = append_debug_log_line("stdin_reader", "Overlay window not found");
        }
    }

    handle.exit(0);
}
