// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod print;
mod plantuml;
mod bookmark;
mod pdf_extract;

use print::{print_to_pdf, print_to_pdf_with_bookmarks, check_print_support};
use plantuml::render_plantuml;
use bookmark::inject_bookmarks;
use pdf_extract::extract_pdf_markers;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            print_to_pdf,
            print_to_pdf_with_bookmarks,
            check_print_support,
            render_plantuml,
            inject_bookmarks,
            extract_pdf_markers
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}