// Hide the console window when double-clicked on Windows.
// Has no effect on other platforms.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    let exe_dir = std::env::current_exe()
        .expect("failed to resolve current exe path")
        .parent()
        .expect("exe has no parent directory")
        .to_path_buf();

    #[cfg(target_os = "windows")]
    let client_name = "meme-overlay.exe";
    #[cfg(not(target_os = "windows"))]
    let client_name = "meme-overlay";

    // 1. Prefer the client binary sitting next to this launcher (MSI / manual install).
    let beside = exe_dir.join(client_name);

    // 2. Fall back to the path that `npm install` (postinstall.cjs) puts the binary.
    // postinstall.cjs uses `path.join(os.homedir(), ".config", "meme-overlay", "bin")`,
    // which on Windows resolves to C:\Users\<user>\.config\meme-overlay\bin —
    // NOT %APPDATA% (AppData\Roaming). Must use home_dir() here to match.
    let npm_install_path = dirs::home_dir()
        .map(|d| d.join(".config").join("meme-overlay").join("bin").join(client_name));

    let main_exe = if beside.exists() {
        beside
    } else if let Some(p) = npm_install_path.filter(|p| p.exists()) {
        p
    } else {
        // Neither location has the binary — tell the user clearly instead of silently doing nothing.
        let msg = format!(
            "{client_name} was not found.\n\n\
            This launcher needs the main application binary to work. \
            Please place {client_name} in the same folder as this launcher:\n\
            {exe_dir}\n\n\
            You can download it from:\n\
            https://github.com/wuyouMaster/meme-overlay/releases",
            exe_dir = exe_dir.display(),
        );

        #[cfg(target_os = "windows")]
        show_message_box("meme-overlay-server — missing binary", &msg);

        #[cfg(not(target_os = "windows"))]
        eprintln!("error: {msg}");

        std::process::exit(1);
    };

    // Spawn the real binary with --mode server and forward any extra args.
    // spawn() returns immediately so this launcher process exits right away,
    // leaving only the Tauri app running in the background.
    std::process::Command::new(&main_exe)
        .arg("--mode")
        .arg("server")
        .args(std::env::args().skip(1))
        .spawn()
        .unwrap_or_else(|e| {
            let msg = format!("Failed to launch {}:\n\n{e}", main_exe.display());

            #[cfg(target_os = "windows")]
            show_message_box("meme-overlay-server — launch error", &msg);

            #[cfg(not(target_os = "windows"))]
            eprintln!("error: {msg}");

            std::process::exit(1);
        });
}

/// Show a modal error dialog on Windows.
/// Because this binary has `windows_subsystem = "windows"` there is no console
/// to print to, so a MessageBox is the only way to surface errors to the user.
#[cfg(target_os = "windows")]
fn show_message_box(title: &str, message: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    let title_w: Vec<u16> = OsStr::new(title)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let msg_w: Vec<u16> = OsStr::new(message)
        .encode_wide()
        .chain(Some(0))
        .collect();

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut std::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            utype: u32,
        ) -> i32;
    }

    // MB_OK | MB_ICONERROR = 0x10
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            msg_w.as_ptr(),
            title_w.as_ptr(),
            0x10,
        );
    }
}
