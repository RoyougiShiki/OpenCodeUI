use crate::app::dir_state::OpenDirectoryState;
use std::sync::Arc;
use tauri::State;

/// 获取启动时传入的目录路径（一次性读取后清空）
#[tauri::command]
pub fn get_cli_directory(
    window: tauri::Window,
    state: State<'_, OpenDirectoryState>,
) -> Option<Arc<str>> {
    state.pending().pin().remove(window.label()).cloned()
}

/// 新建桌面窗口
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn open_new_window(app: tauri::AppHandle, directory: Option<String>) {
    crate::app::create_new_window(&app, directory);
}
