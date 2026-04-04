// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod print;
mod plantuml;

use print::{print_to_pdf, check_print_support};
use plantuml::render_plantuml;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![print_to_pdf, check_print_support, render_plantuml])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}