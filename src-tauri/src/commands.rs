use crate::bookmark;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

// ---- Types ----

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AnimationEntry {
    pub name: String,
    pub path: String,
    pub anim_type: String,
    pub file_size: u64,
    pub assigned_hooks: Vec<String>,
    pub bookmark: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HookInfo {
    pub id: String,
    pub label: String,
    pub description: String,
    pub category: String,
    pub default_text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct HookAssignment {
    #[serde(default)]
    pub animation: Option<String>,
    #[serde(default)]
    pub custom_text: Option<String>,
    #[serde(default)]
    pub movement_direction: Option<String>,
    #[serde(default)]
    pub movement_speed: Option<u32>,
    #[serde(default)]
    pub custom_path_file: Option<String>,
}

/// Per-client config (opencode or cc)
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ClientConfig {
    #[serde(default)]
    pub hook_assignments: HashMap<String, HookAssignment>,
    /// Legacy: phase → animation_name (backward compatibility)
    #[serde(default)]
    pub assignments: HashMap<String, String>,
}

/// Top-level config.json structure
/// {
///   "opencode": { "hook_assignments": { ... }, "assignments": { ... } },
///   "cc":       { "hook_assignments": { ... }, "assignments": { ... } },
///   "sort_by": "name",
///   "filter_type": "all"
/// }
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Config {
    #[serde(default)]
    pub opencode: ClientConfig,
    #[serde(default)]
    pub cc: ClientConfig,
    #[serde(default)]
    pub sort_by: String,
    #[serde(default)]
    pub filter_type: String,
}

// ---- Paths ----

fn config_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Home directory not found");
    let dir = home.join(".config").join("meme-overlay");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn animations_dir() -> PathBuf {
    let dir = config_dir().join("animations");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn paths_dir() -> PathBuf {
    let dir = config_dir().join("paths");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn logs_dir() -> PathBuf {
    let dir = config_dir().join("logs");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn debug_log_path() -> PathBuf {
    logs_dir().join("overlay-debug.log")
}

fn log_timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{}", now.as_secs(), format!("{:03}", now.subsec_millis()))
}

pub fn append_debug_log_line(source: &str, message: &str) -> Result<(), String> {
    let path = debug_log_path();
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Open log failed: {e}"))?;
    writeln!(file, "[{}] [{}] {}", log_timestamp(), source, message)
        .map_err(|e| format!("Write log failed: {e}"))
}

#[tauri::command]
pub fn append_debug_log(source: String, message: String) -> Result<String, String> {
    append_debug_log_line(&source, &message)?;
    Ok(debug_log_path().to_string_lossy().to_string())
}

#[tauri::command]
pub fn clear_debug_log() -> Result<String, String> {
    let path = debug_log_path();
    fs::write(&path, "").map_err(|e| format!("Clear log failed: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

// ---- Config IO ----

fn load_config() -> Config {
    let path = config_path();
    let Ok(s) = fs::read_to_string(&path) else {
        return Config::default();
    };

    // Try new format first
    if let Ok(config) = serde_json::from_str::<Config>(&s) {
        return config;
    }

    // Migrate from old flat format (top-level hook_assignments / assignments)
    if let Ok(old) = serde_json::from_str::<serde_json::Value>(&s) {
        let mut config = Config::default();
        if let Some(ha) = old.get("hook_assignments") {
            if let Ok(m) = serde_json::from_value::<HashMap<String, HookAssignment>>(ha.clone()) {
                config.opencode.hook_assignments = m;
            }
        }
        if let Some(a) = old.get("assignments") {
            if let Ok(m) = serde_json::from_value::<HashMap<String, String>>(a.clone()) {
                config.opencode.assignments = m;
            }
        }
        save_config(&config);
        return config;
    }

    Config::default()
}

fn save_config(config: &Config) {
    if let Ok(json) = serde_json::to_string_pretty(config) {
        let _ = fs::write(config_path(), json);
    }
}

// ---- Client helpers ----

fn get_client<'a>(config: &'a Config, client: &str) -> Result<&'a ClientConfig, String> {
    match client {
        "opencode" => Ok(&config.opencode),
        "cc" => Ok(&config.cc),
        _ => Err(format!(
            "Invalid client '{client}'. Must be 'opencode' or 'cc'"
        )),
    }
}

fn get_client_mut<'a>(
    config: &'a mut Config,
    client: &str,
) -> Result<&'a mut ClientConfig, String> {
    match client {
        "opencode" => Ok(&mut config.opencode),
        "cc" => Ok(&mut config.cc),
        _ => Err(format!(
            "Invalid client '{client}'. Must be 'opencode' or 'cc'"
        )),
    }
}

// ---- File helpers ----

fn get_file_size(path: &PathBuf) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn find_animation_by_name(name: &str) -> Option<PathBuf> {
    let dir = animations_dir();
    if let Ok(read_dir) = fs::read_dir(&dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            if stem == name {
                return Some(path);
            }
        }
    }
    None
}

fn get_anim_type(ext: &str) -> &'static str {
    match ext {
        "json" => "lottie",
        "gif" => "gif",
        "mp4" | "webm" | "mov" => "video",
        "png" | "jpg" | "jpeg" | "webp" | "svg" => "image",
        _ => "",
    }
}

// ---- Path helpers ----

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::io::Read;

const PATH_MAGIC: u32 = 0x48544150; // "HTAP" in little-endian (what we see in hexdump)
const PATH_VERSION: u8 = 0x01;

fn generate_path_hash(points: &[[f32; 2]]) -> String {
    let mut hasher = DefaultHasher::new();
    for point in points {
        point[0].to_bits().hash(&mut hasher);
        point[1].to_bits().hash(&mut hasher);
    }
    format!("{:016x}.bin", hasher.finish())
}

fn detect_closed_path(points: &[[f32; 2]]) -> bool {
    if points.len() < 4 {
        return false;
    }

    let first = points[0];
    let last = points[points.len() - 1];
    let dx = first[0] - last[0];
    let dy = first[1] - last[1];
    let gap = (dx * dx + dy * dy).sqrt();

    // Compute total arc length so the threshold scales with path size.
    // Mirrors the TS detectClosedPath: max(CLOSED_ABSOLUTE, length × CLOSED_RELATIVE)
    let total_length: f32 = points
        .windows(2)
        .map(|w| {
            let dx = w[1][0] - w[0][0];
            let dy = w[1][1] - w[0][1];
            (dx * dx + dy * dy).sqrt()
        })
        .sum();

    let threshold = (total_length * 0.05_f32).max(0.04_f32);
    gap < threshold
}

fn write_path_binary(path: &PathBuf, points: &[[f32; 2]], is_closed: bool) -> Result<(), String> {
    let mut file = fs::File::create(path).map_err(|e| format!("Create failed: {e}"))?;

    file.write_all(&PATH_MAGIC.to_le_bytes())
        .map_err(|e| format!("Write failed: {e}"))?;
    file.write_all(&[PATH_VERSION])
        .map_err(|e| format!("Write failed: {e}"))?;

    let flags: u8 = if is_closed { 0x01 } else { 0x00 };
    file.write_all(&[flags])
        .map_err(|e| format!("Write failed: {e}"))?;

    let count = points.len() as u16;
    file.write_all(&count.to_le_bytes())
        .map_err(|e| format!("Write failed: {e}"))?;

    for point in points {
        file.write_all(&point[0].to_le_bytes())
            .map_err(|e| format!("Write failed: {e}"))?;
        file.write_all(&point[1].to_le_bytes())
            .map_err(|e| format!("Write failed: {e}"))?;
    }

    Ok(())
}

fn read_path_binary(path: &PathBuf) -> Result<(Vec<[f32; 2]>, bool), String> {
    let mut file = fs::File::open(path).map_err(|e| format!("Open failed: {e}"))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .map_err(|e| format!("Read failed: {e}"))?;

    if buf.len() < 8 {
        return Err("Invalid path file: too small".into());
    }

    let magic = u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]);
    if magic != PATH_MAGIC {
        return Err("Invalid path file: bad magic".into());
    }

    let flags = buf[5];
    let is_closed = (flags & 0x01) != 0;

    let count = u16::from_le_bytes([buf[6], buf[7]]) as usize;
    let expected_size = 8 + count * 8;
    if buf.len() < expected_size {
        return Err("Invalid path file: truncated".into());
    }

    let mut points = Vec::with_capacity(count);
    for i in 0..count {
        let offset = 8 + i * 8;
        let x = f32::from_le_bytes([
            buf[offset],
            buf[offset + 1],
            buf[offset + 2],
            buf[offset + 3],
        ]);
        let y = f32::from_le_bytes([
            buf[offset + 4],
            buf[offset + 5],
            buf[offset + 6],
            buf[offset + 7],
        ]);
        points.push([x, y]);
    }

    Ok((points, is_closed))
}

// ---- Hook definitions ----

fn get_opencode_hook_definitions() -> Vec<HookInfo> {
    vec![
        HookInfo {
            id: "session.created".into(),
            label: "Session Start".into(),
            description: "When a new OpenCode session is created".into(),
            category: "session".into(),
            default_text: "Starting...".into(),
        },
        HookInfo {
            id: "session.idle".into(),
            label: "Session Complete".into(),
            description: "When the session finishes all tasks".into(),
            category: "session".into(),
            default_text: "Done".into(),
        },
        HookInfo {
            id: "session.error".into(),
            label: "Session Error".into(),
            description: "When an error occurs in the session".into(),
            category: "session".into(),
            default_text: "Error".into(),
        },
        HookInfo {
            id: "message.part.updated".into(),
            label: "Message Update".into(),
            description: "When a message part is updated".into(),
            category: "message".into(),
            default_text: "Processing...".into(),
        },
        HookInfo {
            id: "tool.execute.before".into(),
            label: "Tool Execute Start".into(),
            description: "Before a tool is executed".into(),
            category: "tool".into(),
            default_text: "Executing...".into(),
        },
        HookInfo {
            id: "tool.execute.after".into(),
            label: "Tool Execute Complete".into(),
            description: "After a tool finishes executing".into(),
            category: "tool".into(),
            default_text: "Done".into(),
        },
    ]
}

fn get_cc_hook_definitions() -> Vec<HookInfo> {
    vec![
        HookInfo {
            id: "cc.session.start".into(),
            label: "Session Start".into(),
            description: "When Claude Code starts or resumes a session".into(),
            category: "session".into(),
            default_text: "Starting...".into(),
        },
        HookInfo {
            id: "cc.user.prompt".into(),
            label: "User Prompt".into(),
            description: "When the user submits a prompt".into(),
            category: "session".into(),
            default_text: "Processing...".into(),
        },
        HookInfo {
            id: "cc.stop".into(),
            label: "Response Complete".into(),
            description: "When Claude finishes responding".into(),
            category: "session".into(),
            default_text: "Done".into(),
        },
        HookInfo {
            id: "cc.stop.failure".into(),
            label: "API Error".into(),
            description: "When the turn ends due to an API error".into(),
            category: "session".into(),
            default_text: "Error".into(),
        },
        HookInfo {
            id: "cc.notification".into(),
            label: "Notification".into(),
            description: "When Claude Code sends a notification (idle / permission prompt)".into(),
            category: "session".into(),
            default_text: "Notification".into(),
        },
        HookInfo {
            id: "cc.tool.before".into(),
            label: "Tool Use Start".into(),
            description: "Before a tool executes (PreToolUse)".into(),
            category: "tool".into(),
            default_text: "Executing...".into(),
        },
        HookInfo {
            id: "cc.tool.after".into(),
            label: "Tool Use Complete".into(),
            description: "After a tool succeeds (PostToolUse)".into(),
            category: "tool".into(),
            default_text: "Done".into(),
        },
        HookInfo {
            id: "cc.tool.failure".into(),
            label: "Tool Use Failed".into(),
            description: "After a tool fails (PostToolUseFailure)".into(),
            category: "tool".into(),
            default_text: "Error".into(),
        },
    ]
}

// ---- Commands: Animation Library ----

#[tauri::command]
pub fn list_animations() -> Vec<AnimationEntry> {
    let dir = animations_dir();
    let config = load_config();

    let mut entries = Vec::new();
    if let Ok(read_dir) = fs::read_dir(&dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            let anim_type = get_anim_type(ext);
            if anim_type.is_empty() {
                continue;
            }

            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string();

            // Collect assigned hooks from BOTH clients
            let mut assigned_hooks: Vec<String> = Vec::new();
            for (hook_id, assignment) in &config.opencode.hook_assignments {
                if assignment.animation.as_deref() == Some(&name) {
                    assigned_hooks.push(hook_id.clone());
                }
            }
            for (hook_id, assignment) in &config.cc.hook_assignments {
                if assignment.animation.as_deref() == Some(&name) {
                    assigned_hooks.push(hook_id.clone());
                }
            }

            let bookmark = get_bookmark_for_animation(&name);
            entries.push(AnimationEntry {
                name,
                path: path.to_string_lossy().to_string(),
                anim_type: anim_type.to_string(),
                file_size: get_file_size(&path),
                assigned_hooks,
                bookmark,
            });
        }
    }

    let sort_by = config.sort_by.as_str();
    match sort_by {
        "type" => entries.sort_by(|a, b| a.anim_type.cmp(&b.anim_type)),
        "size" => entries.sort_by(|a, b| a.file_size.cmp(&b.file_size)),
        _ => entries.sort_by(|a, b| a.name.cmp(&b.name)),
    }

    entries
}

#[tauri::command]
pub fn import_animation(source_path: String) -> Result<AnimationEntry, String> {
    let src = PathBuf::from(&source_path);

    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("");
    let anim_type = get_anim_type(ext);
    if anim_type.is_empty() {
        return Err("Unsupported format. Use .json, .gif, .mp4, .webm, .mov, .png, .jpg".into());
    }

    if !src.exists() {
        return Err(format!("Source file not found: {}", src.display()));
    }

    if ext == "json" {
        let content = fs::read_to_string(&src).map_err(|e| format!("Cannot read file: {e}"))?;
        let _: serde_json::Value =
            serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;
    }

    let name = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unnamed")
        .to_string();

    let bookmark = match bookmark::create_bookmark(&src) {
        Ok(bm) => {
            let _ = save_bookmark_for_animation(&name, &bm);
            Some(bm)
        }
        Err(e) => {
            None
        }
    };

    let dest = animations_dir().join(format!("{name}.{ext}"));
    fs::create_dir_all(animations_dir()).map_err(|e| format!("Cannot create dir: {e}"))?;
    fs::copy(&src, &dest).map_err(|e| format!("Copy failed: {e}"))?;

    let config = load_config();
    let mut assigned_hooks = Vec::new();
    for (hook_id, a) in &config.opencode.hook_assignments {
        if a.animation.as_deref() == Some(&name) {
            assigned_hooks.push(hook_id.clone());
        }
    }
    for (hook_id, a) in &config.cc.hook_assignments {
        if a.animation.as_deref() == Some(&name) {
            assigned_hooks.push(hook_id.clone());
        }
    }

    Ok(AnimationEntry {
        name,
        path: dest.to_string_lossy().to_string(),
        anim_type: anim_type.to_string(),
        file_size: get_file_size(&dest),
        assigned_hooks,
        bookmark,
    })
}

#[tauri::command]
pub fn delete_animation(name: String) -> Result<(), String> {
    let path =
        find_animation_by_name(&name).ok_or_else(|| format!("Animation '{name}' not found"))?;
    fs::remove_file(&path).map_err(|e| format!("Delete failed: {e}"))?;

    let mut config = load_config();
    config
        .opencode
        .hook_assignments
        .retain(|_, v| v.animation.as_deref() != Some(&name));
    config.opencode.assignments.retain(|_, v| *v != name);
    config
        .cc
        .hook_assignments
        .retain(|_, v| v.animation.as_deref() != Some(&name));
    config.cc.assignments.retain(|_, v| *v != name);
    save_config(&config);

    Ok(())
}

#[tauri::command]
pub fn rename_animation(old_name: String, new_name: String) -> Result<(), String> {
    if new_name.is_empty() {
        return Err("New name cannot be empty".into());
    }
    let old_path = find_animation_by_name(&old_name)
        .ok_or_else(|| format!("Animation '{old_name}' not found"))?;
    if find_animation_by_name(&new_name).is_some() {
        return Err(format!("Animation '{new_name}' already exists"));
    }

    let ext = old_path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let new_path = animations_dir().join(format!("{new_name}.{ext}"));
    fs::rename(&old_path, &new_path).map_err(|e| format!("Rename failed: {e}"))?;

    let mut config = load_config();
    for (_, a) in config.opencode.hook_assignments.iter_mut() {
        if a.animation.as_deref() == Some(&old_name) {
            a.animation = Some(new_name.clone());
        }
    }
    for v in config.opencode.assignments.values_mut() {
        if *v == old_name {
            *v = new_name.clone();
        }
    }
    for (_, a) in config.cc.hook_assignments.iter_mut() {
        if a.animation.as_deref() == Some(&old_name) {
            a.animation = Some(new_name.clone());
        }
    }
    for v in config.cc.assignments.values_mut() {
        if *v == old_name {
            *v = new_name.clone();
        }
    }
    save_config(&config);

    Ok(())
}

#[tauri::command]
pub fn batch_delete_animations(names: Vec<String>) -> Result<Vec<String>, String> {
    let mut deleted = Vec::new();
    let mut config = load_config();

    for name in &names {
        if let Some(path) = find_animation_by_name(name) {
            if fs::remove_file(&path).is_ok() {
                deleted.push(name.clone());
                config
                    .opencode
                    .hook_assignments
                    .retain(|_, v| v.animation.as_deref() != Some(name));
                config.opencode.assignments.retain(|_, v| v != name);
                config
                    .cc
                    .hook_assignments
                    .retain(|_, v| v.animation.as_deref() != Some(name));
                config.cc.assignments.retain(|_, v| v != name);
            }
        }
    }

    save_config(&config);
    Ok(deleted)
}

// ---- Commands: Hook configuration ----

#[tauri::command]
pub fn get_available_hooks(client: String) -> Result<Vec<HookInfo>, String> {
    match client.as_str() {
        "opencode" => Ok(get_opencode_hook_definitions()),
        "cc" => Ok(get_cc_hook_definitions()),
        _ => Err(format!("Invalid client '{client}'")),
    }
}

#[tauri::command]
pub fn get_hook_config(client: String) -> Result<HashMap<String, HookAssignment>, String> {
    let config = load_config();
    let client_cfg = get_client(&config, &client)?;
    Ok(client_cfg.hook_assignments.clone())
}

#[tauri::command]
pub fn assign_hook_animation(
    client: String,
    hook_id: String,
    animation_name: Option<String>,
) -> Result<(), String> {
    if let Some(ref name) = animation_name {
        if find_animation_by_name(name).is_none() {
            return Err(format!("Animation '{name}' not found"));
        }
    }
    let mut config = load_config();
    let client_cfg = get_client_mut(&mut config, &client)?;
    let assignment = client_cfg.hook_assignments.entry(hook_id).or_default();
    assignment.animation = animation_name;
    save_config(&config);
    Ok(())
}

#[tauri::command]
pub fn set_hook_custom_text(
    client: String,
    hook_id: String,
    text: Option<String>,
) -> Result<(), String> {
    let mut config = load_config();
    let client_cfg = get_client_mut(&mut config, &client)?;
    let assignment = client_cfg.hook_assignments.entry(hook_id).or_default();
    assignment.custom_text = text;
    save_config(&config);
    Ok(())
}

#[tauri::command]
pub fn unassign_hook(client: String, hook_id: String) -> Result<(), String> {
    let mut config = load_config();
    let client_cfg = get_client_mut(&mut config, &client)?;
    client_cfg.hook_assignments.remove(&hook_id);
    save_config(&config);
    Ok(())
}

#[tauri::command]
pub fn reset_hook_config(client: String) -> Result<(), String> {
    let mut config = load_config();
    let client_cfg = get_client_mut(&mut config, &client)?;
    client_cfg.hook_assignments.clear();
    save_config(&config);
    Ok(())
}

// ---- Commands: Misc ----

#[tauri::command]
pub fn set_sort_by(sort_by: String) -> Result<(), String> {
    let valid = ["name", "type", "size"];
    if !valid.contains(&sort_by.as_str()) {
        return Err(format!("Invalid sort. Must be one of: {valid:?}"));
    }
    let mut config = load_config();
    config.sort_by = sort_by;
    save_config(&config);
    Ok(())
}

#[tauri::command]
pub fn set_filter_type(filter_type: String) -> Result<(), String> {
    let valid = ["all", "lottie", "gif", "video", "image"];
    if !valid.contains(&filter_type.as_str()) {
        return Err(format!("Invalid filter. Must be one of: {valid:?}"));
    }
    let mut config = load_config();
    config.filter_type = filter_type;
    save_config(&config);
    Ok(())
}

#[tauri::command]
pub fn set_hook_movement_direction(
    client: String,
    hook_id: String,
    direction: Option<String>,
) -> Result<(), String> {
    if let Some(ref dir) = direction {
        let valid = ["horizontal", "vertical", "none"];
        if !valid.contains(&dir.as_str()) {
            return Err(format!("Invalid direction. Must be one of: {valid:?}"));
        }
    }
    let mut config = load_config();
    let client_cfg = get_client_mut(&mut config, &client)?;
    let assignment = client_cfg.hook_assignments.entry(hook_id).or_default();
    assignment.movement_direction = direction;
    save_config(&config);
    Ok(())
}

#[tauri::command]
pub fn set_hook_movement_speed(
    client: String,
    hook_id: String,
    speed: Option<u32>,
) -> Result<(), String> {
    if let Some(s) = speed {
        if s < 1 || s > 8 {
            return Err("Invalid speed. Must be between 1 and 8".into());
        }
    }
    let mut config = load_config();
    let client_cfg = get_client_mut(&mut config, &client)?;
    let assignment = client_cfg.hook_assignments.entry(hook_id).or_default();
    assignment.movement_speed = speed;
    save_config(&config);
    Ok(())
}

#[tauri::command]
pub fn read_animation_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Read failed: {e}"))
}

#[tauri::command]
pub fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("Read failed: {e}"))
}

#[tauri::command]
pub fn read_animation_by_name(name: String) -> Result<String, String> {
    let path = animations_dir().join(format!("{name}.json"));
    fs::read_to_string(&path).map_err(|e| format!("Read failed for '{name}': {e}"))
}

#[tauri::command]
pub fn get_animation_by_name(name: String) -> Result<AnimationEntry, String> {
    let path =
        find_animation_by_name(&name).ok_or_else(|| format!("Animation '{name}' not found"))?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let anim_type = get_anim_type(ext);

    let config = load_config();
    let mut assigned_hooks = Vec::new();
    for (hook_id, a) in &config.opencode.hook_assignments {
        if a.animation.as_deref() == Some(&name) {
            assigned_hooks.push(hook_id.clone());
        }
    }
    for (hook_id, a) in &config.cc.hook_assignments {
        if a.animation.as_deref() == Some(&name) {
            assigned_hooks.push(hook_id.clone());
        }
    }

    Ok(AnimationEntry {
        name: name.clone(),
        path: path.to_string_lossy().to_string(),
        anim_type: anim_type.to_string(),
        file_size: get_file_size(&path),
        assigned_hooks,
        bookmark: get_bookmark_for_animation(&name),
    })
}

#[tauri::command]
pub fn read_video_via_bookmark(bookmark: String) -> Result<Vec<u8>, String> {
    bookmark::read_via_bookmark(&bookmark)
}

// ---- Bookmark helpers ----

fn get_bookmark_for_animation(name: &str) -> Option<String> {
    let path = config_dir().join("bookmarks.json");
    let content = fs::read_to_string(&path).ok()?;
    let map: HashMap<String, String> = serde_json::from_str(&content).ok()?;
    map.get(name).cloned()
}

fn save_bookmark_for_animation(name: &str, bookmark: &str) -> Result<(), String> {
    let path = config_dir().join("bookmarks.json");
    let mut map: HashMap<String, String> = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    map.insert(name.to_string(), bookmark.to_string());
    let json = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

// ---- Legacy phase commands ----

#[tauri::command]
pub fn assign_phase(animation_name: String, phase: String) -> Result<(), String> {
    let valid = ["coding", "thinking", "success"];
    if !valid.contains(&phase.as_str()) {
        return Err(format!(
            "Invalid phase '{phase}'. Must be one of: {valid:?}"
        ));
    }
    if find_animation_by_name(&animation_name).is_none() {
        return Err(format!("Animation '{animation_name}' not found"));
    }
    let mut config = load_config();
    config.opencode.assignments.retain(|k, _| k != &phase);
    config
        .opencode
        .assignments
        .retain(|_, v| *v != animation_name);
    config.opencode.assignments.insert(phase, animation_name);
    save_config(&config);
    Ok(())
}

#[tauri::command]
pub fn unassign_phase(phase: String) -> Result<(), String> {
    let mut config = load_config();
    config.opencode.assignments.remove(&phase);
    save_config(&config);
    Ok(())
}

// ---- Custom path commands ----

#[tauri::command]
pub fn save_custom_path(
    client: String,
    hook_id: String,
    path: Vec<[f32; 2]>,
) -> Result<String, String> {
    for point in &path {
        if point[0] < 0.0 || point[0] > 1.0 || point[1] < 0.0 || point[1] > 1.0 {
            return Err("Path points must be in range 0~1".into());
        }
    }

    let is_closed = detect_closed_path(&path);
    let file_name = generate_path_hash(&path);

    let paths_directory = paths_dir();
    let file_path = paths_directory.join(&file_name);
    write_path_binary(&file_path, &path, is_closed)?;

    let mut config = load_config();
    let client_cfg = get_client_mut(&mut config, &client)?;
    let assignment = client_cfg.hook_assignments.entry(hook_id).or_default();
    assignment.custom_path_file = Some(file_name.clone());
    assignment.movement_direction = Some("custom".to_string());
    save_config(&config);

    Ok(file_name)
}

#[tauri::command]
pub fn load_custom_path(file_name: String) -> Result<Vec<[f32; 2]>, String> {
    let paths_directory = paths_dir();
    let file_path = paths_directory.join(&file_name);
    let (path, is_closed) = read_path_binary(&file_path)?;
    let _ = is_closed;
    Ok(path)
}

#[tauri::command]
pub fn delete_custom_path(file_name: String) -> Result<(), String> {
    let paths_directory = paths_dir();
    let file_path = paths_directory.join(&file_name);
    if file_path.exists() {
        let _ = fs::remove_file(file_path);
    }
    Ok(())
}

#[tauri::command]
pub fn is_closed_path(file_name: String) -> Result<bool, String> {
    let paths_directory = paths_dir();
    let file_path = paths_directory.join(&file_name);
    let (_path, is_closed) = read_path_binary(&file_path)?;
    Ok(is_closed)
}
