// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::api::process::{Command, CommandChild};
use tauri::{Manager, State};

// ── Managed state ─────────────────────────────────────────────────────────────

struct ProcessManager {
    backend: Mutex<Option<CommandChild>>,
    ollama:  Mutex<Option<CommandChild>>,
}

impl ProcessManager {
    fn new() -> Self {
        Self {
            backend: Mutex::new(None),
            ollama:  Mutex::new(None),
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

// ── main ──────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .manage(ProcessManager::new())
        .invoke_handler(tauri::generate_handler![
            copy_files_to_chat,
            open_chat_folder,
            get_data_dir,
        ])
        .setup(|app| {
            // In debug builds (tauri dev) the Docker/npm backend is already
            // running — skip sidecar launch entirely.
            #[cfg(not(debug_assertions))]
            {
                let data_dir = resolve_data_dir(app);
                let data_dir_str = data_dir.to_string_lossy().into_owned();
                let pm: State<ProcessManager> = app.state();

                // ── 1. Ollama ────────────────────────────────────────────
                if !port_open(11434) {
                    match Command::new_sidecar("ollama") {
                        Err(e) => eprintln!("[LocalAssistant] ollama sidecar not found: {e}"),
                        Ok(cmd) => match cmd.args(["serve"]).spawn() {
                            Err(e) => eprintln!("[LocalAssistant] Failed to start ollama: {e}"),
                            Ok((_rx, child)) => {
                                *pm.ollama.lock().unwrap() = Some(child);
                                if !wait_for_port(11434, 15_000) {
                                    eprintln!("[LocalAssistant] Ollama did not become ready in 15 s");
                                }
                            }
                        },
                    }
                }

                // ── 2. Backend ───────────────────────────────────────────
                match Command::new_sidecar("backend") {
                    Err(e) => eprintln!("[LocalAssistant] backend sidecar not found: {e}"),
                    Ok(cmd) => match cmd
                        .env("PORT", "3001")
                        .env("DATA_DIR", &data_dir_str)
                        .env("OLLAMA_URL", "http://localhost:11434")
                        .spawn()
                    {
                        Err(e) => eprintln!("[LocalAssistant] Failed to start backend: {e}"),
                        Ok((_rx, child)) => {
                            *pm.backend.lock().unwrap() = Some(child);
                        }
                    },
                }

                // ── 3. Wait for backend ──────────────────────────────────
                if !wait_for_port(3001, 20_000) {
                    eprintln!("[LocalAssistant] Backend did not become ready in 20 s");
                }
            }

            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::Destroyed = event.event() {
                let pm: State<ProcessManager> = event.window().app_handle().state();
                pm.kill_all();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
