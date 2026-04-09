use sysinfo::Pid;

pub fn is_process_alive(
    pid: u32,
    exe_path: &str, // stored localized string
    start_time: u64,
    sys: &sysinfo::System,
) -> bool {
    let pid = Pid::from_u32(pid);

    if let Some(process) = sys.process(pid) {
        let mut path_matches = false;

        if let Some(p) = process.exe() {
            let path_str = p.to_string_lossy().to_lowercase();
            if !path_str.is_empty() && path_str == exe_path {
                path_matches = true;
            }
        }

        // Elevation fallback: check if filename matches process name
        if !path_matches {
            let exe_file_name = std::path::Path::new(exe_path)
                .file_name()
                .map(|n| n.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            let proc_name = process.name().to_string_lossy().to_lowercase();
            if proc_name == exe_file_name {
                path_matches = true;
            } else if proc_name == format!("{}.exe", exe_file_name) {
                path_matches = true;
            }
        }

        path_matches && process.start_time() == start_time
    } else {
        false
    }
}

pub fn get_process_start_time(pid: u32, sys: &sysinfo::System) -> Option<u64> {
    sys.process(Pid::from_u32(pid))
        .map(|process| process.start_time())
}
