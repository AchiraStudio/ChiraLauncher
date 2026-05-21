use sysinfo::Pid;
use std::path::Path;

pub fn is_process_alive(
    pid: u32,
    exe_path: &str,
    _install_dir: &str, // Deliberately ignored to prevent frozen launchers from tricking the monitor
    sys: &sysinfo::System,
) -> bool {
    // 1. Check if the exact original process is alive
    let target_pid = Pid::from_u32(pid);
    if sys.process(target_pid).is_some() {
        return true;
    }

    // 2. Fallback: check by exact executable name match 
    // (useful for elevated processes or bootstrap handoffs)
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

            // Double check exact path match if the OS exposes it
            if let Some(p_exe) = proc.exe() {
                if p_exe.to_string_lossy().to_lowercase() == exe_path.to_lowercase() {
                    return true;
                }
            }
        }
    }

    false
}

pub fn get_process_start_time(pid: u32, sys: &sysinfo::System) -> Option<u64> {
    sys.process(Pid::from_u32(pid))
        .map(|process| process.start_time())
}