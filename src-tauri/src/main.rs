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
                    // Server 模式：显示设置界面
                    eprintln!("[server] Starting in server mode");
                    if let Some(win) = app.get_webview_window("settings") {
                        let _ = win.show();
                        let _ = win.set_focus();
                        eprintln!("[server] Settings window shown");
                    } else {
                        eprintln!("[server] Cannot find settings window");
                    }
                }
                AppMode::Overlay => {
                    // Overlay 模式：显示浮窗动画
                    if demo_mode {
                        // Show the native window immediately
                        if let Some(win) = app.get_webview_window("overlay") {
                            let _ = win.set_position(tauri::Position::Physical(
                                tauri::PhysicalPosition::new(100, 100),
                            ));
                            let _ = win.show();
                            let _ = win.set_focus();
                            eprintln!("[demo] Overlay window shown");
                        } else {
                            eprintln!("[demo] Cannot find overlay window");
                        }

                        // Wait for the frontend to signal it is ready before sending demo events.
                        let handle = app.handle().clone();
                        app.once("overlay-ready", move |_| {
                            eprintln!("[demo] Frontend ready, sending demo events");

                            let _ =
                                handle.emit("plugin-message", serde_json::json!({"type": "show"}));
                            eprintln!("[demo] Show event sent");

                            // 获取导入的第一个动画名称
                            let animations = commands::list_animations();
                            let first_animation = animations.first();
                            let animation_name =
                                first_animation.map(|a| a.name.as_str()).unwrap_or("");

                            let _ = handle.emit(
                                "plugin-message",
                                serde_json::json!({"type": "animation", "name": animation_name}),
                            );
                            eprintln!("[demo] Animation event sent: {}", animation_name);

                            let _ = handle.emit(
                                "plugin-message",
                                serde_json::json!({
                                    "type": "progress",
                                    "text": "Demo mode - running..."
                                }),
                            );
                            eprintln!("[demo] Progress event sent");
                        });
                    } else {
                        // 正常模式：从 stdin 读取
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
            commands::unassign_hook,
            commands::reset_hook_config,
            // Legacy phase commands
            commands::assign_phase,
            commands::unassign_phase,
            // Settings commands
            commands::set_sort_by,
            commands::set_filter_type,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
