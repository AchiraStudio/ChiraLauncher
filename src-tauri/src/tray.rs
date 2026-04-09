use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "show", "Show Launcher", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

    let _tray = TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } => {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

#[tauri::command]
pub fn update_tray(app: AppHandle, titles: Vec<String>) -> Result<(), String> {
    use tauri::menu::PredefinedMenuItem;

    let show_i = MenuItem::with_id(&app, "show", "Show Launcher", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit_i =
        MenuItem::with_id(&app, "quit", "Quit", true, None::<&str>).map_err(|e| e.to_string())?;
    let sep = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;

    let mut menu_items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        vec![&show_i, &quit_i, &sep];
    let mut dynamic_items = Vec::new();

    if titles.is_empty() {
        let none_i = MenuItem::with_id(&app, "none", "No games running", false, None::<&str>)
            .map_err(|e| e.to_string())?;
        dynamic_items.push(none_i);
    } else {
        let header_i = MenuItem::with_id(&app, "header", "Running Games:", false, None::<&str>)
            .map_err(|e| e.to_string())?;
        dynamic_items.push(header_i);

        for (i, title) in titles.into_iter().enumerate() {
            let item_i = MenuItem::with_id(
                &app,
                format!("game_{}", i),
                format!("🎮 {}", title),
                false,
                None::<&str>,
            )
            .map_err(|e| e.to_string())?;
            dynamic_items.push(item_i);
        }
    }

    for item in &dynamic_items {
        menu_items.push(item);
    }

    let menu = Menu::with_items(&app, &menu_items).map_err(|e| e.to_string())?;

    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }

    Ok(())
}
