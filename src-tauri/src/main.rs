// 桌面端入口：窗口与 UI 由 src/lib.rs 组装。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    caseboard_lib::run();
}
