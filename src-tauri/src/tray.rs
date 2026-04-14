use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition};

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let _tray = TrayIconBuilder::with_id("chira-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .on_tray_icon_event(|tray, event| {
            let app = tray.app_handle();
            match event {
                TrayIconEvent::Click {
                    button,
                    button_state,
                    rect,
                    ..
                } => {
                    if button_state == MouseButtonState::Up {
                        if button == MouseButton::Left {
                            // Left click: Show main launcher
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        } else if button == MouseButton::Right {
                            // Right click: Summon the Fake Menu window
                            if let Some(window) = app.get_webview_window("tray") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    // Properly extract X and Y from the Tauri Position Enum
                                    let (x, y) = match rect.position {
                                        tauri::Position::Physical(p) => (p.x, p.y),
                                        tauri::Position::Logical(p) => (p.x as i32, p.y as i32),
                                    };

                                    // Teleport window exactly above the Windows taskbar
                                    let _ = window.set_position(tauri::Position::Physical(
                                        PhysicalPosition {
                                            x: x - 120, // Shift left slightly to center over cursor
                                            y: y - 480, // Shift up by the height of our custom menu
                                        },
                                    ));
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

#[tauri::command]
pub async fn update_tray() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub async fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}
