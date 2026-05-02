mod pty;

use std::net::TcpStream;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{path::BaseDirectory, Manager, RunEvent, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Container per il PID del bun child, per killarlo a chiusura finestra.
struct ServerProc(Mutex<Option<CommandChild>>);

/// Aspetta che la porta 3001 sia in ascolto (max ~15s).
fn wait_for_server() -> bool {
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(
            &"127.0.0.1:3001".parse().unwrap(),
            Duration::from_millis(500),
        )
        .is_ok()
        {
            return true;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerProc(Mutex::new(None)))
        .manage(pty::PtyManager::new())
        .invoke_handler(tauri::generate_handler![
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // In dev (`tauri dev`) il bun server è già stato lanciato da
            // `beforeDevCommand` via concurrently, quindi non spawniamo niente.
            // In release lo facciamo partire dalla sidecar bundlata.
            let is_dev = cfg!(debug_assertions);
            if is_dev {
                return Ok(());
            }

            // Path delle risorse bundlate. In macOS finisce in
            // `Contents/Resources/_up_/resources/...` (Tauri preserva il
            // path relativo). Su altre piattaforme cambia ma `resolve()`
            // ce la trova lo stesso.
            let server_path = app
                .path()
                .resolve("resources/server.bundled.mjs", BaseDirectory::Resource)
                .map_err(|e| format!("missing server bundle: {e}"))?;
            let dist_dir = app
                .path()
                .resolve("resources/dist", BaseDirectory::Resource)
                .map_err(|e| format!("missing dist dir: {e}"))?;
            // Native binary del SDK Claude. Su Win è `.exe`. Risolvo entrambi
            // e prendo il primo che esiste.
            let claude_bin = ["claude", "claude.exe"]
                .iter()
                .filter_map(|name| {
                    app.path()
                        .resolve(format!("resources/claude-bin/{name}"), BaseDirectory::Resource)
                        .ok()
                        .filter(|p| p.exists())
                })
                .next();

            // App data dir: ~/Library/Application Support/SubLodeX/ (macOS),
            // %APPDATA%/SubLodeX/ (win), ~/.local/share/SubLodeX/ (linux).
            // `app_data_dir` crea la dir se non esiste.
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("cannot resolve app_data_dir: {e}"))?;
            std::fs::create_dir_all(&data_dir).ok();

            // Sidecar `bun` — Tauri sceglie automaticamente il binary giusto
            // per la triple Rust corrente (bundled in Contents/MacOS/bun su Mac).
            let sidecar = app
                .shell()
                .sidecar("bun")
                .map_err(|e| format!("bun sidecar not found: {e}"))?;

            let mut sidecar = sidecar
                .args(["run", server_path.to_str().unwrap_or("")])
                .env("SUBLODEX_DATA_DIR", data_dir.to_string_lossy().to_string())
                .env("SUBLODEX_DIST_DIR", dist_dir.to_string_lossy().to_string());
            if let Some(cb) = &claude_bin {
                sidecar = sidecar.env("SUBLODEX_CLAUDE_BIN", cb.to_string_lossy().to_string());
            }
            let (mut rx, child) = sidecar.spawn()
                .map_err(|e| format!("failed to spawn bun sidecar: {e}"))?;

            // Salva il child handle per killarlo a chiusura.
            {
                let state: tauri::State<'_, ServerProc> = app.state();
                *state.0.lock().unwrap() = Some(child);
            }

            // Inoltra stdout/stderr del server al log macOS / console.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            eprintln!("[bun] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[bun] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Error(err) => eprintln!("[bun] error: {err}"),
                        CommandEvent::Terminated(code) => {
                            eprintln!("[bun] terminated: {code:?}");
                        }
                        _ => {}
                    }
                }
            });

            if !wait_for_server() {
                eprintln!(
                    "[sublodex] bun server didn't come up on :3001 within 15s — \
                     UI will likely show a blank page"
                );
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<ServerProc>();
                let mut guard = state.0.lock().unwrap();
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Cleanup di emergenza all'exit dell'event loop.
            if let RunEvent::ExitRequested { .. } = event {
                let state = app.state::<ServerProc>();
                let mut guard = state.0.lock().unwrap();
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
            }
        });
}
