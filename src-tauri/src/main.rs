use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Listener, Manager,
};

mod bookmark;
mod commands;
mod stdin_reader;

#[derive(Debug, Clone, PartialEq)]
enum AppMode {
    Overlay, // 默认模式：浮窗动画
    Server,  // 服务模式：设置界面
}

fn parse_mode(args: &[String]) -> AppMode {
    for i in 0..args.len() {
        if args[i] == "--mode" && i + 1 < args.len() {
            match args[i + 1].as_str() {
                "server" => return AppMode::Server,
                "overlay" => return AppMode::Overlay,
                _ => {}
            }
        }
    }
    AppMode::Overlay
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mode = parse_mode(&args);
    let demo_mode = args.contains(&"--demo".to_string());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(move |app| {
            // --- System Tray ---
            let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&settings_item, &quit_item])
                .build()?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("OpenCode Animation")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "settings" => {
                        if let Some(win) = app.get_webview_window("settings") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            match mode {
                AppMode::Server => {
                    if let Some(win) = app.get_webview_window("settings") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
                AppMode::Overlay => {
                    if demo_mode {
                        if let Some(win) = app.get_webview_window("overlay") {
                            let _ = win.set_position(tauri::Position::Physical(
                                tauri::PhysicalPosition::new(100, 100),
                            ));
                            let _ = win.show();
                            let _ = win.set_focus();
                        }

                        let handle = app.handle().clone();
                        app.once("overlay-ready", move |_| {
                            let _ =
                                handle.emit("plugin-message", serde_json::json!({"type": "show"}));

                            let animations = commands::list_animations();
                            let first_animation = animations.first();
                            let animation_name =
                                first_animation.map(|a| a.name.as_str()).unwrap_or("");

                            let _ = handle.emit(
                                "plugin-message",
                                serde_json::json!({"type": "animation", "name": animation_name}),
                            );

                            let _ = handle.emit(
                                "plugin-message",
                                serde_json::json!({
                                    "type": "progress",
                                    "text": "Demo mode - running..."
                                }),
                            );
                        });
                    } else {
                        let handle = app.handle().clone();
                        std::thread::spawn(move || {
                            stdin_reader::listen(handle);
                        });
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Animation commands
            commands::list_animations,
            commands::import_animation,
            commands::delete_animation,
            commands::rename_animation,
            commands::batch_delete_animations,
            commands::read_animation_file,
            commands::read_binary_file,
            commands::read_animation_by_name,
            commands::get_animation_by_name,
            commands::read_video_via_bookmark,
            // Hook configuration commands
            commands::get_available_hooks,
            commands::get_hook_config,
            commands::assign_hook_animation,
            commands::set_hook_custom_text,
            commands::set_hook_movement_direction,
            commands::set_hook_movement_speed,
            commands::unassign_hook,
            commands::reset_hook_config,
            // Legacy phase commands
            commands::assign_phase,
            commands::unassign_phase,
            // Custom path commands
            commands::save_custom_path,
            commands::load_custom_path,
            commands::delete_custom_path,
            commands::is_closed_path,
            // Debug log commands
            commands::append_debug_log,
            commands::clear_debug_log,
            // Settings commands
            commands::set_sort_by,
            commands::set_filter_type,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
