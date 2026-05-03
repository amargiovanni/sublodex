mod pty;

use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Container per il PID del bun child, per killarlo a chiusura finestra
/// e per gestire l'auto-restart in caso di crash.
struct ServerProc {
    child: Mutex<Option<CommandChild>>,
    /// True quando l'app sta chiudendo: blocca il restart automatico nel
    /// listener degli eventi del sidecar.
    shutting_down: AtomicBool,
    /// Tentativi di restart consecutivi falliti. Reset a 0 quando il bun
    /// resta vivo abbastanza (heartbeat periodico via wait_for_server).
    restart_attempts: AtomicU32,
}

/// Parametri immutabili necessari per (ri)spawnare il sidecar bun.
/// Cloniamo questo struct nei task async per non litigare col borrow checker.
#[derive(Clone)]
struct SidecarConfig {
    server_path: PathBuf,
    dist_dir: PathBuf,
    data_dir: PathBuf,
    claude_bin: Option<PathBuf>,
    auth_token: String,
}

const MAX_RESTART_ATTEMPTS: u32 = 5;

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

/// Spawna il bun sidecar usando la config data, salva il `CommandChild` nello
/// stato condiviso, e installa un task async che inoltra stdout/stderr e — al
/// termine del processo — decide se restartare. Idempotente: se già in
/// shutting_down non fa nulla.
fn spawn_sidecar(app: &AppHandle, cfg: SidecarConfig) -> Result<(), String> {
    let state: tauri::State<'_, ServerProc> = app.state();
    if state.shutting_down.load(Ordering::Relaxed) {
        return Ok(());
    }
    let sidecar = app
        .shell()
        .sidecar("bun")
        .map_err(|e| format!("bun sidecar not found: {e}"))?;

    let mut sidecar = sidecar
        .args(["run", cfg.server_path.to_str().unwrap_or("")])
        .env("SUBLODEX_DATA_DIR", cfg.data_dir.to_string_lossy().to_string())
        .env("SUBLODEX_DIST_DIR", cfg.dist_dir.to_string_lossy().to_string())
        .env("SUBLODEX_AUTH_TOKEN", &cfg.auth_token);
    if let Some(cb) = &cfg.claude_bin {
        sidecar = sidecar.env("SUBLODEX_CLAUDE_BIN", cb.to_string_lossy().to_string());
    }
    let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("failed to spawn bun sidecar: {e}"))?;

    *state.child.lock().unwrap() = Some(child);

    let app_for_task = app.clone();
    let cfg_for_task = cfg.clone();
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
                    let state: tauri::State<'_, ServerProc> = app_for_task.state();
                    // Pulisci il child handle: ora non c'è più processo vivo.
                    *state.child.lock().unwrap() = None;
                    if state.shutting_down.load(Ordering::Relaxed) {
                        eprintln!("[bun] terminated during shutdown — no restart");
                        break;
                    }
                    let attempts = state.restart_attempts.fetch_add(1, Ordering::Relaxed) + 1;
                    if attempts > MAX_RESTART_ATTEMPTS {
                        eprintln!(
                            "[bun] max restart attempts ({MAX_RESTART_ATTEMPTS}) reached — \
                             giving up. Frontend should show error banner."
                        );
                        let _ = app_for_task.emit("sidecar:dead", ());
                        break;
                    }
                    // Backoff esponenziale: 1s, 2s, 4s, 8s, 16s.
                    let delay_secs = 1u64 << (attempts - 1).min(4);
                    eprintln!(
                        "[bun] restart attempt {attempts}/{MAX_RESTART_ATTEMPTS} in {delay_secs}s"
                    );
                    let _ = app_for_task.emit("sidecar:restarting", attempts);
                    tokio::time::sleep(Duration::from_secs(delay_secs)).await;
                    if let Err(e) = spawn_sidecar(&app_for_task, cfg_for_task.clone()) {
                        eprintln!("[bun] respawn failed: {e}");
                        let _ = app_for_task.emit("sidecar:dead", ());
                        break;
                    }
                    // Spawn ricorsivo crea il proprio task: il presente loop
                    // muore perché `rx` del processo morto è esaurito.
                    break;
                }
                _ => {}
            }
        }
    });
    Ok(())
}

/// Reset asincrono del contatore di restart: chiamato dopo che il sidecar è
/// stato vivo per ALIVE_RESET_SECS senza problemi. Evita che restart sparsi
/// nel tempo esauriscano il budget.
const ALIVE_RESET_SECS: u64 = 30;
fn schedule_alive_reset(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(ALIVE_RESET_SECS)).await;
        let state: tauri::State<'_, ServerProc> = app.state();
        if state.child.lock().unwrap().is_some() && !state.shutting_down.load(Ordering::Relaxed) {
            state.restart_attempts.store(0, Ordering::Relaxed);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerProc {
            child: Mutex::new(None),
            shutting_down: AtomicBool::new(false),
            restart_attempts: AtomicU32::new(0),
        })
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

            // Token random per autenticare le chiamate API/WS verso il bun
            // sidecar. Generato qui, vive solo per la durata del processo
            // host. Il bun lo riceve via env e lo inietta nell'HTML servito
            // come `window.__SUBLODEX_TOKEN__`.
            //
            // Uniamo difesa di confine (localhost-only) e auth: senza il
            // token, processi locali ostili non possono parlare al server.
            let auth_token = uuid::Uuid::new_v4().to_string();

            let cfg = SidecarConfig {
                server_path,
                dist_dir,
                data_dir,
                claude_bin,
                auth_token,
            };

            spawn_sidecar(&app.handle(), cfg)?;

            if !wait_for_server() {
                eprintln!(
                    "[sublodex] bun server didn't come up on :3001 within 15s — \
                     UI will likely show a blank page"
                );
            } else {
                // Sidecar in salute → programma il reset del budget restart.
                schedule_alive_reset(app.handle().clone());
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<ServerProc>();
                // Segnala "shutdown in corso" PRIMA di killare: così il
                // listener del sidecar non rifa lo spawn al Terminated.
                state.shutting_down.store(true, Ordering::Relaxed);
                let mut guard = state.child.lock().unwrap();
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
                // Killa anche le sessioni PTY rimaste aperte: i client
                // SSH non sempre escono al SIGHUP del proprio PTY master.
                let pty_state = window.state::<pty::PtyManager>();
                pty_state.kill_all();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Cleanup di emergenza all'exit dell'event loop.
            if let RunEvent::ExitRequested { .. } = event {
                let state = app.state::<ServerProc>();
                state.shutting_down.store(true, Ordering::Relaxed);
                let mut guard = state.child.lock().unwrap();
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
                let pty_state = app.state::<pty::PtyManager>();
                pty_state.kill_all();
            }
        });
}
