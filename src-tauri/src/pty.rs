//! PTY nativo via `portable-pty`. Sostituisce il vecchio
//! `pty-helper.mjs` (Node + node-pty) e il bug Bun-SIGHUP che ci aveva
//! costretto al subprocess Node.
//!
//! Una sessione PTY = una shell child (locale) o un client `ssh` (remoto)
//! attaccato a un PTY master. Il frontend la apre via `invoke('pty_open')`,
//! scrive con `pty_write`, ridimensiona con `pty_resize`, chiude con
//! `pty_close`. I bytes letti dal master vengono propagati al webview come
//! eventi Tauri `pty:data:<session_id>` (payload: base64).
//!
//! ## SSH e ControlMaster
//!
//! Le opzioni `-o ControlMaster=auto -o ControlPath=/tmp/sub-cm-<uid>/%C
//! -o ControlPersist=10m` sono le stesse del bun server, quindi una nuova
//! sessione SSH riusa la TCP già aperta da `sshExec` (file ops). Tempo di
//! apertura del secondo terminale: ~10ms invece di ~300ms.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::State;

/// Whitelist delle shell remote accettabili. Serde rifiuta valori fuori
/// enum con errore di deserializzazione → arriva al frontend come
/// `Err(String)` da `pty_open`. Niente input arbitrario che finisce in
/// `format!("exec {} -l", ...)`. Mantenere allineato con
/// `RemoteConfig.shellType` lato TS (`src/lib/types.ts`).
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ShellType {
    Auto,
    Bash,
    Zsh,
    Sh,
    Fish,
}

impl ShellType {
    /// Stringa che finisce dentro `cd <path> && exec <shell> -l` sulla
    /// shell remota. `Auto` → `$SHELL` (la shell di default dell'utente
    /// remoto, espanso da sh).
    fn as_remote_token(&self) -> &'static str {
        match self {
            ShellType::Auto => "$SHELL",
            ShellType::Bash => "bash",
            ShellType::Zsh => "zsh",
            ShellType::Sh => "sh",
            ShellType::Fish => "fish",
        }
    }
}

/// Config SSH passata dal frontend, mirror lato Rust di
/// `RemoteConfig` lato TS (`src/lib/types.ts`).
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    pub host: String,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub user: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub identity_file: Option<String>,
    #[serde(default)]
    pub agent_forwarding: Option<bool>,
    #[serde(default)]
    pub remote_path: Option<String>,
    /// Whitelist enum: "auto" | "bash" | "zsh" | "sh" | "fish".
    /// Valori fuori whitelist → errore in deserialize.
    #[serde(default)]
    pub shell_type: Option<ShellType>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOpenOpts {
    pub cols: u16,
    pub rows: u16,
    /// "local" oppure "ssh"
    pub kind: String,
    /// cwd locale per shell locale; ignorato per ssh (la shell remota fa cd)
    #[serde(default)]
    pub cwd: Option<String>,
    /// override del PATH_SHELL — se None usiamo $SHELL della macchina
    #[serde(default)]
    pub shell: Option<String>,
    /// presente solo se `kind == "ssh"`
    #[serde(default)]
    pub ssh: Option<SshConfig>,
}

/// Handle che teniamo in HashMap per ogni sessione viva.
struct Session {
    /// Lo stream di scrittura verso il PTY master. `Send` perché lo passiamo
    /// fra command async.
    writer: Box<dyn Write + Send>,
    /// Master conserved per fare resize.
    master: Box<dyn MasterPty + Send>,
    /// Child handle: serve per kill esplicito su `pty_close`.
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

/// Mappa sessioni con lock granulare:
/// - Mutex esterno breve: solo `get` / `insert` / `remove` sull'HashMap.
/// - Mutex per-sessione: tenuto durante write / resize / kill.
///
/// Prima del refactor il Mutex era unico e globale: `pty_write` su una
/// sessione bloccava tutte le altre. Con N terminali aperti questo si
/// vede come "lag" su tutti quando uno solo riceve molto input.
#[derive(Default)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, Arc<Mutex<Session>>>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Killa esplicitamente tutte le sessioni viventi. Da chiamare su
    /// `WindowEvent::CloseRequested` / `RunEvent::ExitRequested` come
    /// cintura: il `Drop` di `Session` chiuderebbe il master comunque,
    /// ma su alcune piattaforme (specie macOS con SSH) il client SSH
    /// resta in giro fino al timeout SIGHUP. Il kill esplicito è
    /// più affidabile.
    pub fn kill_all(&self) {
        let sessions: Vec<Arc<Mutex<Session>>> =
            self.sessions.lock().drain().map(|(_, v)| v).collect();
        for arc in sessions {
            let mut s = arc.lock();
            let _ = s.child.kill();
        }
    }
}

/// Payload streamato via Tauri Channel: `kind` discrimina "data" (con bytes
/// base64) da "exit" (null). Lato TS lo riceviamo come `{kind, data?}`.
#[derive(Serialize, Clone)]
pub struct PtyDataEvent {
    pub kind: String,
    pub data: Option<String>,
}

/// Path standard del ControlMaster usato anche dal bun server. Devono
/// coincidere così la TCP viene riusata fra terminale e file ops.
fn ssh_cm_dir() -> Option<String> {
    if cfg!(windows) {
        return None;
    }
    // `getuid()` non è in std; ce la caviamo con id della home come hash
    // semplice via env USER + un componente fisso.
    // In realtà l'unico requisito è "stessa formula del bun server".
    // bun usa: /tmp/sub-cm-<uid>. Replico chiamando libc::getuid().
    #[cfg(unix)]
    unsafe {
        let uid = libc::getuid();
        let path = format!("/tmp/sub-cm-{uid}");
        let _ = std::fs::create_dir_all(&path);
        Some(path)
    }
    #[cfg(not(unix))]
    None
}

/// Quoting POSIX-safe per stringhe da inserire dentro `sh -c`.
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Espande `~` iniziale a `$HOME`. Path SSH come `~/.ssh/id_rsa` arrivano
/// dal frontend in forma "tilde": ssh in argv NON le espande (lo fa la shell),
/// quindi le risolviamo qui.
fn expand_tilde(p: &str) -> String {
    if let Some(rest) = p.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return std::path::Path::new(&home).join(rest).to_string_lossy().into_owned();
        }
    } else if p == "~" {
        if let Some(home) = std::env::var_os("HOME") {
            return home.to_string_lossy().into_owned();
        }
    }
    p.to_string()
}

/// Valida un path di identity file: deve esistere ed essere un regular file.
/// Threat: una WebView XSS-ata potrebbe passare path arbitrari per probare il
/// filesystem (oracle "esiste/non esiste") o causare comportamenti strani in
/// `ssh -i`. Restituiamo Err sul path non valido invece di lasciare proseguire
/// con un argv malformato.
fn validate_identity_file(p: &str) -> Result<String, String> {
    let expanded = expand_tilde(p);
    let path = std::path::Path::new(&expanded);
    let meta = std::fs::metadata(path)
        .map_err(|e| format!("identity file not accessible: {e}"))?;
    if !meta.is_file() {
        return Err(format!("identity file is not a regular file: {expanded}"));
    }
    Ok(expanded)
}

/// Valida un cwd locale: deve esistere ed essere una directory.
fn validate_cwd(p: &str) -> Result<String, String> {
    let expanded = expand_tilde(p);
    let path = std::path::Path::new(&expanded);
    let meta = std::fs::metadata(path)
        .map_err(|e| format!("cwd not accessible: {e}"))?;
    if !meta.is_dir() {
        return Err(format!("cwd is not a directory: {expanded}"));
    }
    Ok(expanded)
}

/// Costruisce il `CommandBuilder` per lanciare la shell o `ssh`.
fn build_command(opts: &PtyOpenOpts) -> Result<CommandBuilder, String> {
    match opts.kind.as_str() {
        "local" => build_local(opts),
        "ssh" => build_ssh(opts),
        other => Err(format!("unknown pty kind: {other}")),
    }
}

fn build_local(opts: &PtyOpenOpts) -> Result<CommandBuilder, String> {
    // Default shell platform-specific:
    //   - Unix: $SHELL (zsh/bash/fish/sh) altrimenti /bin/bash
    //   - Windows: pwsh.exe se installato, altrimenti powershell.exe, altrimenti cmd.exe
    let shell = opts
        .shell
        .clone()
        .or_else(|| std::env::var("SHELL").ok())
        .unwrap_or_else(default_shell);

    let mut cmd = CommandBuilder::new(&shell);
    // login flag solo per shell *nix che lo supportano
    if !cfg!(windows) && (shell.contains("zsh") || shell.contains("bash")) {
        cmd.arg("-l");
    }
    if let Some(cwd) = &opts.cwd {
        let validated = validate_cwd(cwd)?;
        cmd.cwd(validated);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    Ok(cmd)
}

fn default_shell() -> String {
    if cfg!(windows) {
        // Preferiamo PowerShell 7 (`pwsh`) se installato, altrimenti il
        // built-in Windows PowerShell, altrimenti cmd. Tutti hanno binary
        // disponibili in PATH di default.
        for candidate in ["pwsh.exe", "powershell.exe", "cmd.exe"] {
            if which_exec(candidate).is_some() {
                return candidate.to_string();
            }
        }
        "cmd.exe".to_string()
    } else {
        "/bin/bash".to_string()
    }
}

#[cfg(windows)]
fn which_exec(name: &str) -> Option<std::path::PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let p = dir.join(name);
        if p.exists() { return Some(p); }
    }
    None
}

#[cfg(not(windows))]
fn which_exec(_name: &str) -> Option<std::path::PathBuf> { None }

/// Trova `sshpass` con path assoluto. In `.app` su macOS lanciata via
/// Finder/Dock il PATH è solo `/usr/bin:/bin:/usr/sbin:/sbin`, quindi
/// `sshpass` da Homebrew (`/opt/homebrew/bin` su Apple Silicon,
/// `/usr/local/bin` su Intel) non è raggiungibile come bare name.
/// Stessa lista di `whichBin('sshpass', …)` in `server.ts`.
fn resolve_sshpass() -> Option<String> {
    // 1. PATH dell'utente (raro che funzioni in GUI app, ma costa nulla).
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let p = dir.join("sshpass");
            if p.exists() {
                return Some(p.to_string_lossy().into_owned());
            }
        }
    }
    // 2. Install dir comuni di Homebrew + system.
    for p in &[
        "/opt/homebrew/bin/sshpass",
        "/usr/local/bin/sshpass",
        "/usr/bin/sshpass",
    ] {
        if std::path::Path::new(p).exists() {
            return Some((*p).to_string());
        }
    }
    None
}

fn build_ssh(opts: &PtyOpenOpts) -> Result<CommandBuilder, String> {
    let ssh = opts
        .ssh
        .as_ref()
        .ok_or_else(|| "ssh kind requires `ssh` config".to_string())?;

    let mut args: Vec<String> = Vec::new();
    args.push("-tt".to_string());
    if let Some(p) = ssh.port {
        if p != 22 {
            args.push("-p".to_string());
            args.push(p.to_string());
        }
    }
    if let Some(key) = &ssh.identity_file {
        let validated = validate_identity_file(key)?;
        args.push("-i".to_string());
        args.push(validated);
    }
    if ssh.agent_forwarding.unwrap_or(false) {
        args.push("-A".to_string());
    }
    if ssh.password.is_none() {
        args.push("-o".to_string());
        args.push("BatchMode=yes".to_string());
    }
    args.push("-o".to_string());
    args.push("StrictHostKeyChecking=accept-new".to_string());
    // Niente warning informativi a video (es. "ControlSocket already exists,
    // disabling multiplexing" quando il master di bun è morto). Errori veri
    // (auth fail, host unreachable) restano visibili.
    args.push("-o".to_string());
    args.push("LogLevel=ERROR".to_string());

    if let Some(cm) = ssh_cm_dir() {
        args.push("-o".to_string());
        args.push("ControlMaster=auto".to_string());
        args.push("-o".to_string());
        args.push(format!("ControlPath={cm}/%C"));
        args.push("-o".to_string());
        args.push("ControlPersist=10m".to_string());
    }

    let target = match &ssh.user {
        Some(u) => format!("{}@{}", u, ssh.host),
        None => ssh.host.clone(),
    };
    args.push(target);

    if let Some(remote_path) = &ssh.remote_path {
        // Token già in whitelist (enum `ShellType`): non c'è bisogno di
        // quoting shell perché sono identificatori innocui o `$SHELL`,
        // che vogliamo *sia* espanso dalla sh remota.
        let shell_token = ssh
            .shell_type
            .as_ref()
            .map(|s| s.as_remote_token())
            .unwrap_or("$SHELL");
        // `ssh host -- sh -c '...'` — un singolo arg post-host non viene rotto.
        args.push("--".to_string());
        args.push("sh".to_string());
        args.push("-c".to_string());
        args.push(format!(
            "cd {} && exec {} -l",
            shell_quote(remote_path),
            shell_token
        ));
    }

    // Sicurezza: se c'è una password, usiamo `sshpass -e` (legge $SSHPASS
    // dall'env), MAI `-p <pwd>` (visibile in `ps aux`).
    //
    // Path: in un'app Tauri lanciata via Finder/Dock il PATH è minimale
    // (`/usr/bin:/bin:/usr/sbin:/sbin`), quindi `sshpass` da Homebrew non
    // si trova. Risolviamo a path assoluto cercando nelle install dir
    // comuni — stessa logica di `whichBin` in `server.ts`.
    let (program, prepend, sshpass_env) = if let Some(pwd) = &ssh.password {
        let bin = resolve_sshpass()
            .ok_or_else(|| "sshpass not found. Install with: brew install hudochenkov/sshpass/sshpass".to_string())?;
        (
            bin,
            vec!["-e".to_string(), "ssh".to_string()],
            Some(pwd.clone()),
        )
    } else {
        ("ssh".to_string(), vec![], None)
    };

    let mut cmd = CommandBuilder::new(&program);
    for a in prepend.into_iter().chain(args.into_iter()) {
        cmd.arg(a);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    if let Some(pwd) = sshpass_env {
        cmd.env("SSHPASS", pwd);
    }
    Ok(cmd)
}

#[tauri::command]
pub async fn pty_open(
    state: State<'_, PtyManager>,
    opts: PtyOpenOpts,
    on_event: Channel<PtyDataEvent>,
) -> Result<String, String> {
    eprintln!(
        "[pty] pty_open kind={} cols={} rows={} cwd={:?} ssh_host={:?}",
        opts.kind, opts.cols, opts.rows, opts.cwd,
        opts.ssh.as_ref().map(|s| &s.host)
    );
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: opts.rows,
            cols: opts.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty failed: {e}"))?;

    let cmd = build_command(&opts)?;
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn_command failed: {e}"))?;
    drop(pair.slave); // chiudi la slave-side del pty: il master è quello che ci interessa

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take_writer failed: {e}"))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("try_clone_reader failed: {e}"))?;

    let session_id = uuid::Uuid::new_v4().to_string();

    // Inserisci la sessione PRIMA di lanciare la lettura, così pty_write
    // chiamato subito dopo trova qualcosa.
    // Lock granulare: il Mutex per-sessione è dentro l'Arc, l'HashMap fuori.
    {
        let mut map = state.sessions.lock();
        map.insert(
            session_id.clone(),
            Arc::new(Mutex::new(Session {
                writer,
                master: pair.master,
                child,
            })),
        );
    }

    // Read loop su thread sync (portable-pty Reader è std::io::Read, non async).
    // Stream via Channel: il webview riceve via `on_event.onmessage` callback.
    // Channel è progettato esattamente per questo (vs eventi che richiedono
    // listener registrato lato JS prima del primo emit).
    let id_for_thread = session_id.clone();
    let sessions_for_thread = state.sessions.clone();
    let channel = on_event;
    std::thread::spawn(move || {
        eprintln!("[pty] read loop started for {id_for_thread}");
        let mut buf = [0u8; 4096];
        let mut total = 0usize;
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    eprintln!("[pty] EOF on {id_for_thread} after {total} bytes");
                    break;
                }
                Ok(n) => {
                    total += n;
                    eprintln!("[pty] read {n} bytes from {id_for_thread} (total={total})");
                    let payload = PtyDataEvent {
                        kind: "data".to_string(),
                        data: Some(B64.encode(&buf[..n])),
                    };
                    if let Err(e) = channel.send(payload) {
                        eprintln!("[pty] channel.send error: {e}");
                        break;
                    }
                }
                Err(e) => {
                    eprintln!("[pty] read error on {id_for_thread}: {e}");
                    break;
                }
            }
        }
        eprintln!("[pty] read loop ended for {id_for_thread}");
        sessions_for_thread.lock().remove(&id_for_thread);
        let _ = channel.send(PtyDataEvent {
            kind: "exit".to_string(),
            data: None,
        });
    });

    Ok(session_id)
}

/// Estrae l'Arc<Mutex<Session>> dalla mappa, tenendo il lock esterno solo per
/// il tempo del get + clone Arc. Restituisce None se la sessione non esiste.
fn get_session(state: &PtyManager, session_id: &str) -> Option<Arc<Mutex<Session>>> {
    state.sessions.lock().get(session_id).cloned()
}

#[tauri::command]
pub async fn pty_write(
    state: State<'_, PtyManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    // input arriva come base64 dal frontend (xterm dà UTF-8, ma alcuni input
    // possono essere bytes raw es. paste binario; per sicurezza decodifichiamo).
    let bytes = B64
        .decode(data.as_bytes())
        .map_err(|e| format!("invalid base64 input: {e}"))?;
    let session_arc = get_session(&state, &session_id)
        .ok_or_else(|| format!("unknown session: {session_id}"))?;
    // Lock solo della sessione target — le altre sessioni restano libere.
    let mut session = session_arc.lock();
    session
        .writer
        .write_all(&bytes)
        .map_err(|e| format!("write failed: {e}"))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("flush failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn pty_resize(
    state: State<'_, PtyManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session_arc = get_session(&state, &session_id)
        .ok_or_else(|| format!("unknown session: {session_id}"))?;
    let session = session_arc.lock();
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn pty_close(
    state: State<'_, PtyManager>,
    session_id: String,
) -> Result<(), String> {
    // Rimuovi dalla mappa, poi killa: il read loop chiuderà naturalmente
    // su EOF e tenterà un secondo remove (no-op).
    let removed = state.sessions.lock().remove(&session_id);
    if let Some(arc) = removed {
        let mut session = arc.lock();
        let _ = session.child.kill();
    }
    Ok(())
}

