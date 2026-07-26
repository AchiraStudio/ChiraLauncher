use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition};

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let icon = app.default_window_icon().cloned().unwrap_or_else(|| {
        tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png")).unwrap()
    });

    let tray = TrayIconBuilder::with_id("chira-tray")
        .icon(icon)
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
                                    // Extract click coordinates
                                    let (click_x, click_y) = match rect.position {
                                        tauri::Position::Physical(p) => (p.x, p.y),
                                        tauri::Position::Logical(p) => (p.x as i32, p.y as i32),
                                    };

                                    // Determine monitor & scale factor
                                    let monitor = window.current_monitor().ok().flatten().or_else(|| app.primary_monitor().ok().flatten());
                                    
                                    if let Some(m) = monitor {
                                        let scale = m.scale_factor();
                                        let mon_pos = m.position();
                                        let mon_size = m.size();

                                        let outer_size = window.outer_size().unwrap_or(tauri::PhysicalSize::new((320.0 * scale) as u32, (460.0 * scale) as u32));
                                        let win_w = outer_size.width as i32;
                                        let win_h = outer_size.height as i32;

                                        let mon_left = mon_pos.x;
                                        let mon_top = mon_pos.y;
                                        let mon_right = mon_left + mon_size.width as i32;
                                        let mon_bottom = mon_top + mon_size.height as i32;

                                        let padding = (12.0 * scale) as i32;

                                        // Center X over tray icon, but clamp inside monitor bounds so it never clips!
                                        let mut target_x = click_x - (win_w / 2);
                                        if target_x + win_w > mon_right - padding {
                                            target_x = mon_right - win_w - padding;
                                        }
                                        if target_x < mon_left + padding {
                                            target_x = mon_left + padding;
                                        }

                                        // Position Y: place above taskbar if click is in lower half of screen, else below
                                        let is_lower_half = click_y > mon_top + (mon_size.height as i32 / 2);
                                        let mut target_y = if is_lower_half {
                                            click_y - win_h - padding
                                        } else {
                                            let icon_h = match rect.size {
                                                tauri::Size::Physical(s) => s.height as i32,
                                                tauri::Size::Logical(s) => (s.height * scale) as i32,
                                            };
                                            click_y + icon_h + padding
                                        };

                                        if target_y + win_h > mon_bottom - padding {
                                            target_y = mon_bottom - win_h - padding;
                                        }
                                        if target_y < mon_top + padding {
                                            target_y = mon_top + padding;
                                        }

                                        let _ = window.set_position(tauri::Position::Physical(PhysicalPosition::new(target_x, target_y)));
                                    } else {
                                        // Fallback offset
                                        let _ = window.set_position(tauri::Position::Physical(PhysicalPosition::new(click_x - 300, click_y - 480)));
                                    }

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

    app.manage(tray);

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
    crate::APP_EXITING.store(true, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
    Ok(())
}
