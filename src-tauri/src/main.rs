#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::backtrace::Backtrace;
use std::fs;
use std::panic;

fn main() {
    // Basic panic hook to write errors to a file since we have no console
    panic::set_hook(Box::new(|info| {
        let msg = match info.payload().downcast_ref::<&'static str>() {
            Some(s) => *s,
            None => match info.payload().downcast_ref::<String>() {
                Some(s) => s.as_str(),
                None => "Box<dyn Any>",
            },
        };

        // This is a known, benign internal tao/winit bug that fires during Windows
        // window destruction on shutdown. It is harmless — the app exits cleanly
        // regardless. Suppress it so we don't alarm users with a crash file.
        if msg.contains("cannot move state from Destroyed") {
            return;
        }

        // Also skip if the panic originates from inside tao's event loop runner
        if let Some(location) = info.location() {
            if location.file().contains("tao") && location.file().contains("runner") {
                return;
            }
        }

        let backtrace = Backtrace::force_capture();
        let location = info
            .location()
            .unwrap_or_else(|| std::panic::Location::caller());
        let crash_report = format!(
            "Panic occurred in file '{}' at line {}\n\nMessage: {}\n\nBacktrace:\n{:#?}",
            location.file(),
            location.line(),
            msg,
            backtrace
        );

        // Attempt to write to desktop or fallback to current dir
        if let Some(mut path) = dirs::desktop_dir() {
            path.push("chiralauncher_crash.txt");
            let _ = fs::write(path, &crash_report);
        } else {
            let _ = fs::write("chiralauncher_crash.txt", &crash_report);
        }
    }));

    chiralauncher_lib::run()
}
