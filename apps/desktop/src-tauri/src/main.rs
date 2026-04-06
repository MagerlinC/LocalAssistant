// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use std::collections::HashMap;
use tauri::api::process::{Command, CommandChild, CommandEvent};
use tauri::{Manager, State};

// ── Managed state ─────────────────────────────────────────────────────────────

struct ProcessManager {
    backend:        Mutex<Option<CommandChild>>,
    ollama:         Mutex<Option<CommandChild>>,
    startup_errors: Mutex<Vec<String>>,
}

impl ProcessManager {
    fn new() -> Self {
        Self {
            backend:        Mutex::new(None),
            ollama:         Mutex::new(None),
            startup_errors: Mutex::new(Vec::new()),
        }
    }

    fn push_error(&self, msg: impl Into<String>) {
        if let Ok(mut v) = self.startup_errors.lock() {
            v.push(msg.into());
        }
    }

    fn kill_all(&self) {
        if let Ok(mut g) = self.backend.lock() {
            if let Some(c) = g.take() { let _ = c.kill(); }
        }
        if let Ok(mut g) = self.ollama.lock() {
            if let Some(c) = g.take() { let _ = c.kill(); }
        }
    }
}

// ── Port helpers ──────────────────────────────────────────────────────────────

fn port_open(port: u16) -> bool {
    TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok()
}

fn wait_for_port(port: u16, timeout_ms: u64) -> bool {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    while Instant::now() < deadline {
        if port_open(port) { return true; }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

// ── Data directory ────────────────────────────────────────────────────────────

fn resolve_data_dir(app: &tauri::App) -> PathBuf {
    // Tauri resolves to:
    //   macOS  → ~/Library/Application Support/<identifier>
    //   Windows → %APPDATA%\<identifier>
    if let Some(dir) = app.path_resolver().app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        return dir;
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    let dir = PathBuf::from(home).join("LocalAssistant");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

// ── Chat file helpers (used by Tauri commands) ────────────────────────────────

fn chat_files_dir(app_handle: &tauri::AppHandle, chat_id: &str) -> Result<PathBuf, String> {
    // In dev the backend runs in Docker with ~/LocalAssistant mounted as its
    // data dir. In release the backend sidecar receives DATA_DIR = app_data_dir.
    #[cfg(debug_assertions)]
    let base = {
        let _ = app_handle; // suppress unused warning
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "Could not determine home directory".to_string())?;
        PathBuf::from(home).join("LocalAssistant")
    };

    #[cfg(not(debug_assertions))]
    let base = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or_else(|| "Could not determine app data dir".to_string())?;

    let dir = base.join("chats").join(chat_id).join("files");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create chat folder: {e}"))?;
    Ok(dir)
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn get_data_dir(app_handle: tauri::AppHandle) -> String {
    app_handle
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| {
            let home = std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .unwrap_or_else(|_| ".".into());
            PathBuf::from(home).join("LocalAssistant")
        })
        .to_string_lossy()
        .into_owned()
}

#[tauri::command]
fn open_chat_folder(chat_id: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let dir = chat_files_dir(&app_handle, &chat_id)?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&dir).spawn()
        .map_err(|e| format!("Failed to open folder: {e}"))?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(&dir).spawn()
        .map_err(|e| format!("Failed to open folder: {e}"))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&dir).spawn()
        .map_err(|e| format!("Failed to open folder: {e}"))?;

    Ok(())
}

#[tauri::command]
fn copy_files_to_chat(
    files: Vec<String>,
    chat_id: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let dest_dir = chat_files_dir(&app_handle, &chat_id)?;
    let mut copied = Vec::new();

    for file_path in &files {
        let src = PathBuf::from(file_path);
        let filename = src
            .file_name()
            .ok_or_else(|| format!("Invalid file path: {file_path}"))?;
        let dest = dest_dir.join(filename);
        std::fs::copy(&src, &dest)
            .map_err(|e| format!("Failed to copy {}: {e}", src.display()))?;
        copied.push(dest.to_string_lossy().into_owned());
    }

    Ok(copied)
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn get_startup_errors(state: State<ProcessManager>) -> Vec<String> {
    state.startup_errors.lock()
        .map(|v| v.clone())
        .unwrap_or_default()
}

// ── main ──────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .manage(ProcessManager::new())
        .invoke_handler(tauri::generate_handler![
            copy_files_to_chat,
            open_chat_folder,
            get_data_dir,
            get_startup_errors,
        ])
        .setup(|_app| {
            // In debug builds (tauri dev) the Docker/npm backend is already
            // running — skip sidecar launch entirely.
            #[cfg(not(debug_assertions))]
            {
                let data_dir = resolve_data_dir(_app);
                let data_dir_str = data_dir.to_string_lossy().into_owned();
                let pm: State<ProcessManager> = _app.state();

                // ── 1. Ollama (fire-and-forget — does NOT block backend startup) ──
                // Ollama and the backend are independent: the backend only needs
                // Ollama when serving model requests, not at startup. Starting them
                // in parallel cuts total startup time from ~20 s to ~1 s.
                if !port_open(11434) {
                    match Command::new_sidecar("ollama") {
                        Err(e) => {
                            eprintln!("[LocalAssistant] ollama sidecar not found: {e}");
                            pm.push_error(format!("Ollama sidecar missing ({e}). AI features will not work."));
                        }
                        Ok(cmd) => match cmd.args(["serve"]).spawn() {
                            Err(e) => {
                                eprintln!("[LocalAssistant] Failed to start ollama: {e}");
                                pm.push_error(format!("Ollama failed to start: {e}. AI features will not work."));
                            }
                            Ok((rx, child)) => {
                                *pm.ollama.lock().unwrap() = Some(child);
                                // Drain output in the background; Ollama readiness is
                                // checked on-demand by the backend/frontend.
                                std::thread::spawn(move || {
                                    let mut rx = rx;
                                    while let Some(event) = rx.blocking_recv() {
                                        match event {
                                            CommandEvent::Stderr(line) => eprintln!("[ollama] {line}"),
                                            CommandEvent::Error(e) => eprintln!("[ollama error] {e}"),
                                            CommandEvent::Terminated(p) => eprintln!("[ollama] exited: code={:?}", p.code),
                                            _ => {}
                                        }
                                    }
                                });
                            }
                        },
                    }
                }

                // ── 2. Backend ───────────────────────────────────────────
                let backend_env: HashMap<String, String> = [
                    ("PORT".into(), "3001".into()),
                    ("DATA_DIR".into(), data_dir_str.clone()),
                    ("OLLAMA_URL".into(), "http://localhost:11434".into()),
                ].into_iter().collect();
                match Command::new_sidecar("backend") {
                    Err(e) => {
                        eprintln!("[LocalAssistant] backend sidecar not found: {e}");
                        pm.push_error(format!("Backend could not start: sidecar binary missing ({e})."));
                    }
                    Ok(cmd) => match cmd.envs(backend_env).args(["--data-dir", &data_dir_str]).spawn() {
                        Err(e) => {
                            eprintln!("[LocalAssistant] Failed to start backend: {e}");
                            pm.push_error(format!("Backend could not start: {e}."));
                        }
                        Ok((rx, child)) => {
                            *pm.backend.lock().unwrap() = Some(child);
                            std::thread::spawn(move || {
                                let mut rx = rx;
                                while let Some(event) = rx.blocking_recv() {
                                    match event {
                                        CommandEvent::Stdout(line) => eprintln!("[backend] {line}"),
                                        CommandEvent::Stderr(line) => eprintln!("[backend] {line}"),
                                        CommandEvent::Error(e) => eprintln!("[backend error] {e}"),
                                        CommandEvent::Terminated(p) => eprintln!("[backend] exited: code={:?}", p.code),
                                        _ => {}
                                    }
                                }
                            });
                        }
                    },
                }

                // ── 3. Wait for backend only ─────────────────────────────
                // Ollama may still be starting in the background; that is fine.
                // The window opens as soon as the backend is ready.
                if !wait_for_port(3001, 30_000) {
                    eprintln!("[LocalAssistant] Backend did not become ready in 30 s");
                    pm.push_error("Backend did not start in time. Please quit and restart the app.");
                }
            }

            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::Destroyed = event.event() {
                let app_handle = event.window().app_handle();
                let pm: State<ProcessManager> = app_handle.state();
                pm.kill_all();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
