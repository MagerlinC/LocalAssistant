// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, State};

struct BackendProcess(Mutex<Option<Child>>);

/// Returns the chat files folder path and ensures it exists.
fn chat_files_dir(chat_id: &str) -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory".to_string())?;
    let dir: PathBuf = [&home, "LocalAssistant", "chats", chat_id, "files"]
        .iter()
        .collect();
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create chat folder: {e}"))?;
    Ok(dir)
}

/// Opens the chat files folder in the OS file manager (Finder on macOS).
/// Creates the folder first if it doesn't exist.
#[tauri::command]
fn open_chat_folder(chat_id: String) -> Result<(), String> {
    let dir = chat_files_dir(&chat_id)?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("Failed to open folder: {e}"))?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("Failed to open folder: {e}"))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("Failed to open folder: {e}"))?;

    Ok(())
}

/// Copies a list of host file paths into ~/LocalAssistant/chats/{chat_id}/files/.
/// Running this on the Rust side means it always uses the host filesystem,
/// regardless of whether the Node.js backend is local or inside Docker.
#[tauri::command]
fn copy_files_to_chat(files: Vec<String>, chat_id: String) -> Result<Vec<String>, String> {
    let dest_dir = chat_files_dir(&chat_id)?;

    let mut copied: Vec<String> = Vec::new();
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

fn main() {
    tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![copy_files_to_chat, open_chat_folder])
        .setup(|app| {
            let backend_state: State<BackendProcess> = app.state();

            let backend_path = {
                let resource_dir = app
                    .path_resolver()
                    .resource_dir()
                    .expect("failed to get resource dir");
                resource_dir.join("backend").join("dist").join("index.js")
            };

            let child = if backend_path.exists() {
                Command::new("node")
                    .arg(&backend_path)
                    .env("PORT", "3001")
                    .spawn()
                    .ok()
            } else {
                None
            };

            *backend_state.0.lock().unwrap() = child;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
