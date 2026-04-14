use sysinfo::Pid;
use std::path::Path;

pub fn is_process_alive(
    pid: u32,
    exe_path: &str,
    install_dir: &str,
    sys: &sysinfo::System,
) -> bool {
    // 1. Check if the exact original process is alive
    let target_pid = Pid::from_u32(pid);
    if sys.process(target_pid).is_some() {
        return true;
    }

    // 2. If the main PID died (e.g. it was a launcher stub), 
    // check if ANY process is running from inside the game's install directory!
    let target_dir = Path::new(install_dir);
    if !target_dir.as_os_str().is_empty() {
        for proc in sys.processes().values() {
            if let Some(exe) = proc.exe() {
                if exe.starts_with(target_dir) {
                    return true;
                }
            }
        }
    }

    // 3. Fallback: check by exact executable name match (useful for elevated processes where path is hidden)
    let exe_file_name = Path::new(exe_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    if !exe_file_name.is_empty() {
        for proc in sys.processes().values() {
            let proc_name = proc.name().to_string_lossy().to_lowercase();
            if proc_name == exe_file_name || proc_name == format!("{}.exe", exe_file_name) {
                return true;
            }
        }
    }

    false
}

pub fn get_process_start_time(pid: u32, sys: &sysinfo::System) -> Option<u64> {
    sys.process(Pid::from_u32(pid))
        .map(|process| process.start_time())
}