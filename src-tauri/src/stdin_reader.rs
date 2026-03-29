use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use tauri::{Emitter, Manager};

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "type")]
pub enum PluginMessage {
    #[serde(rename = "show")]
    Show,
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
            eprintln!("[stdin_reader] failed to parse: {msg}");
            continue;
        };

        // 转发到 overlay 窗口
        if let Some(win) = handle.get_webview_window("overlay") {
            let _ = win.emit("plugin-message", &parsed);
        }
    }

    // stdin 关闭 = opencode 退出 → 关闭整个 overlay 进程
    handle.exit(0);
}
