#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::backtrace::Backtrace;
use std::fs;
use std::panic;

fn main() {
    // Basic panic hook to write errors to a file since we have no console
    panic::set_hook(Box::new(|info| {
        let backtrace = Backtrace::force_capture();
        let msg = match info.payload().downcast_ref::<&'static str>() {
            Some(s) => *s,
            None => match info.payload().downcast_ref::<String>() {
                Some(s) => &s[..],
                None => "Box<dyn Any>",
            },
        };

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
