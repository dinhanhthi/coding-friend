// Prevents an extra console window on Windows in release. The app ships for macOS only.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    coding_friend_lib::run();
}
