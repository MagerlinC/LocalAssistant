// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, State};

struct BackendProcess(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            let backend_state: State<BackendProcess> = app.state();

            // Start the Node.js backend
            let backend_path = {
                let resource_dir = app.path_resolver().resource_dir()
                    .expect("failed to get resource dir");
                resource_dir.join("backend").join("dist").join("index.js")
            };

            let child = if backend_path.exists() {
                // Production: use bundled backend
                Command::new("node")
                    .arg(&backend_path)
                    .env("PORT", "3001")
                    .spawn()
                    .ok()
            } else {
                // Development: backend is started separately via pnpm dev
                None
            };

            *backend_state.0.lock().unwrap() = child;
            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                // Backend will be cleaned up via process group
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
