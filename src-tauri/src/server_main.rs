// Hide the console window when double-clicked on Windows.
// Has no effect on other platforms.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    // Locate the real binary next to this launcher, rather than relying on PATH.
    let exe_dir = std::env::current_exe()
        .expect("failed to resolve current exe path")
        .parent()
        .expect("exe has no parent directory")
        .to_path_buf();

    // The binary name differs by platform (has .exe on Windows).
    #[cfg(target_os = "windows")]
    let main_exe = exe_dir.join("meme-overlay.exe");
    #[cfg(not(target_os = "windows"))]
    let main_exe = exe_dir.join("meme-overlay");

    // Spawn the real binary with --mode server and forward any extra args.
    // spawn() returns immediately so this launcher process exits right away,
    // leaving only the Tauri app running in the background.
    std::process::Command::new(&main_exe)
        .arg("--mode")
        .arg("server")
        .args(std::env::args().skip(1))
        .spawn()
        .unwrap_or_else(|e| panic!("failed to launch {}: {}", main_exe.display(), e));
}
