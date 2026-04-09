"""
Game Crack Detector & Achievement Finder
Supports: CODEX, Goldberg, Anadius emulators

Called from Rust: python scanner.py <game_folder_path>
Outputs a single JSON object to stdout.
All diagnostics go to stderr.
"""

import os
import sys
import json
import glob
import configparser
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional, Any, Dict, List
import typing


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

def expand(path: str) -> Path:
    return Path(os.path.expandvars(os.path.expanduser(path)))


def find_file_recursive(root: Path, filename: str) -> Optional[Path]:
    """Case-insensitive recursive file search."""
    for p in root.rglob("*"):
        if p.name.lower() == filename.lower():
            return p
    return None


def find_by_extension(root: Path, ext: str) -> list:
    """Find all files with a given extension recursively."""
    return list(root.rglob(f"*{ext}"))


# ─────────────────────────────────────────────
# SCANNER
# ─────────────────────────────────────────────

SKIP_KEYWORDS: typing.Set[str] = {"setup", "unins", "uninstall", "redist", "vcredist",
                 "directx", "dxsetup", "_commonredist"}

PRIORITY_KEYWORDS: typing.Set[str] = {"64", "dx12", "shipping"}


def score_exe(path: Path) -> int:
    name = path.stem.lower()
    if any(k in name for k in SKIP_KEYWORDS):
        return -1
    points: List[int] = [0]
    for kw in PRIORITY_KEYWORDS:
        if kw in name:
            points.append(10)
    # Prefer exes shallower in the tree
    points.append(max(0, 5 - len(path.parts)))
    return sum(points)


def find_best_exe(game_root: Path) -> Optional[Path]:
    candidates = []
    for exe in game_root.rglob("*.exe"):
        s = score_exe(exe)
        if s >= 0:
            candidates.append((s, exe))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]


# ─────────────────────────────────────────────
# CRACK DETECTION
# ─────────────────────────────────────────────

def detect_emulator(game_root: Path) -> str:
    """Return 'codex', 'anadius', 'goldberg', or 'unknown'."""
    # Anadius
    if (game_root / "anadius.cfg").exists():
        return "anadius"

    # CODEX — steam_emu.ini or any .cdx file
    if (game_root / "steam_emu.ini").exists():
        return "codex"
    if find_by_extension(game_root, ".cdx"):
        return "codex"

    # Goldberg — steam_settings folder is the canonical marker
    if (game_root / "steam_settings").is_dir():
        return "goldberg"
    if find_file_recursive(game_root, "steam_api64.dll") or \
       find_file_recursive(game_root, "steam_api.dll"):
        # Could be goldberg or codex without ini; mark as goldberg fallback
        return "goldberg"

    return "unknown"


# ─────────────────────────────────────────────
# PARSERS
# ─────────────────────────────────────────────

def parse_codex_ini(ini_path: Path) -> Dict[str, Any]:
    """
    Parse steam_emu.ini manually (skip comment lines starting with ###).
    """
    config = configparser.RawConfigParser(strict=False)
    typing.cast(Any, config).optionxform = str

    clean_lines = []
    try:
        with open(ini_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                stripped = line.lstrip()
                if stripped.startswith("###"):
                    continue
                clean_lines.append(line)
    except Exception as e:
        eprint(f"  [!] Failed to read {ini_path}: {e}")
        return {}

    config.read_string("".join(clean_lines))

    result: Dict[str, Any] = {}
    if config.has_section("Settings"):
        for key, val in config.items("Settings"):
            result[key] = val

    # DLC
    dlc = {}
    if config.has_section("DLC"):
        for key, val in config.items("DLC"):
            if key.isdigit():
                dlc[key] = val
    result["dlc"] = dlc

    return result


def parse_anadius_cfg(cfg_path: Path) -> Dict[str, Any]:
    """Parse anadius.cfg (VDF-like format)."""
    result: Dict[str, Any] = {}
    try:
        text = cfg_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        eprint(f"  [!] Failed to read anadius.cfg: {e}")
        return result

    def extract_value(key: str) -> Optional[str]:
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith(f'"{key}"'):
                parts = stripped.split('"')
                if len(parts) >= 4:
                    return parts[3]
        return None

    result["ContentId"] = extract_value("ContentId")
    result["GameName"]  = extract_value("Name")
    result["Version"]   = extract_value("Version")
    result["Username"]  = extract_value("Username")
    result["PersonaId"] = extract_value("PersonaId")
    result["Language"]  = extract_value("Language")
    return result


def parse_goldberg_settings(game_root: Path) -> Dict[str, Any]:
    """Read steam_settings/achievements.json and steam_appid.txt."""
    result: Dict[str, Any] = {}
    appid_file = game_root / "steam_appid.txt"
    if appid_file.exists():
        try:
            result["AppId"] = appid_file.read_text().strip()
        except Exception: pass

    settings_dir = game_root / "steam_settings"
    if settings_dir.is_dir():
        # Some goldberg builds store appid in settings
        for candidate in ("steam_appid.txt", "game_id.txt"):
            p = settings_dir / candidate
            if p.exists():
                try:
                    result.setdefault("AppId", p.read_text().strip())
                except Exception: pass
    return result


# ─────────────────────────────────────────────
# SAVE-FOLDER & ACHIEVEMENT LOCATORS
# ─────────────────────────────────────────────

# All known group-folder names used by public cracks under Steam/
PUBLIC_EMU_DIRS: List[str] = [
    "CODEX", "RLD!", "Skidrow", "PLAZA", "CPY", "FLT", "DARKSiDERS",
]

GOLDBERG_APPDATA_DIRS: List[str] = [
    "Goldberg SteamEmu Saves", "GSE Saves", "steam_settings", "Goldberg SteamEmu",
]

STEAM_PUBLIC_BASE = expand(r"%SYSTEMDRIVE%\Users\Public\Documents\Steam")
ANADIUS_SAVE_BASE = expand(r"%LOCALAPPDATA%\anadius\LSX emu")


def _ach_files(directory: Path) -> Dict[str, Optional[str]]:
    """Return the first achievements.ini/.json found in a directory."""
    result: Dict[str, Optional[str]] = {"achievements_ini": None, "achievements_json": None}
    ini = directory / "achievements.ini"
    ini2 = directory / "achievement.ini"
    jsn = directory / "achievements.json"
    if ini.is_file():
        result["achievements_ini"] = str(ini)
    elif ini2.is_file():
        result["achievements_ini"] = str(ini2)
    if jsn.is_file():
        result["achievements_json"] = str(jsn)
    return result


def find_codex_achievements(app_id: str) -> Dict[str, Any]:
    """
    Search every known CODEX / public-crack save path for achievement files.
    Mirrors the Rust find_save_path logic exactly.
    """
    result: Dict[str, Any] = {"save_folder": None, "achievements_ini": None, "achievements_json": None}

    # 1. All group subfolders under Steam/Public
    candidates: List[Path] = []
    for sub in PUBLIC_EMU_DIRS:
        candidates.append(STEAM_PUBLIC_BASE / sub / app_id)
        candidates.append(STEAM_PUBLIC_BASE / sub / app_id / "steam_settings")
    # 2. Direct Steam/{id} path (no group prefix)
    candidates.append(STEAM_PUBLIC_BASE / app_id)
    candidates.append(STEAM_PUBLIC_BASE / app_id / "steam_settings")

    for d in candidates:
        if d.is_dir():
            files = _ach_files(d)
            if files["achievements_ini"] or files["achievements_json"]:
                result["save_folder"] = str(d)
                result.update(files)
                return result
            elif result["save_folder"] is None:
                result["save_folder"] = str(d)  # record dir even if files missing

    return result


def find_goldberg_achievements(app_id: str) -> Dict[str, Optional[str]]:
    """
    Search every known Goldberg / ALI213 save path for achievement files.
    Checks both APPDATA and LOCALAPPDATA, matching Rust find_save_path.
    """
    result: Dict[str, Optional[str]] = {"save_folder": None, "achievements_json": None, "achievements_ini": None}

    appdata_dirs = [
        expand(f"%APPDATA%\\{sub}") for sub in GOLDBERG_APPDATA_DIRS
    ] + [
        expand(f"%LOCALAPPDATA%\\{sub}") for sub in GOLDBERG_APPDATA_DIRS
    ] + [
        expand(r"%APPDATA%\ALI213"),
        expand(r"%LOCALAPPDATA%\ALI213"),
    ]

    for base in appdata_dirs:
        d = base / app_id
        if d.is_dir():
            files = _ach_files(d)
            if files["achievements_json"] or files["achievements_ini"]:
                result["save_folder"] = str(d)
                result["achievements_json"] = files.get("achievements_json")
                result["achievements_ini"] = files.get("achievements_ini")
                return result
            elif result["save_folder"] is None:
                result["save_folder"] = str(d)

    return result


def find_anadius_achievements(content_id: str) -> Dict[str, Any]:
    r"""
    XML file pattern: achievement-*_{content_id}_*.xml
    JSON folder: %LOCALAPPDATA%\anadius\LSX emu\{content_id}\achievements.json
    """
    result: Dict[str, Any] = {"save_folder": None, "achievements_xml": None, "achievements_json": None}
    base = ANADIUS_SAVE_BASE
    if not base.is_dir():
        return result

    # Find XML (search base dir and content_id subdir)
    for search_dir in [base, base / content_id]:
        if not search_dir.is_dir():
            continue
        for p in search_dir.glob("*.xml"):
            if content_id in p.name and p.name.lower().startswith("achievement"):
                result["achievements_xml"] = str(p)
                result["save_folder"] = str(search_dir)
                break

    # JSON folder
    json_dir = base / content_id
    if json_dir.is_dir():
        result["save_folder"] = str(json_dir)
        jsn = json_dir / "achievements.json"
        result["achievements_json"] = str(jsn) if jsn.is_file() else None

    return result



# ─────────────────────────────────────────────
# ACHIEVEMENT JSON GENERATOR (fetch from Steam)
# ─────────────────────────────────────────────

def fetch_achievements_json(app_id: str, dest_folder: Path) -> Optional[Path]:
    import urllib.request
    url = (
        f"https://api.steampowered.com/ISteamUserStats/"
        f"GetSchemaForGame/v2/?appid={app_id}"
    )
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())

        stats = (data.get("game", {})
                     .get("availableGameStats", {})
                     .get("achievements", []))
        if not stats:
            eprint(f"  [!] Steam returned no achievements for app {app_id}")
            return None

        # Normalise to our expected format
        normalised: List[Dict[str, Any]] = []
        for a in stats:
            normalised.append({
                "name":        a.get("name", ""),
                "displayName": a.get("displayName", a.get("name", "")),
                "description": a.get("description", ""),
                "hidden":      a.get("hidden", 0),
                "icon":        a.get("icon", ""),
                "icongray":    a.get("icongray", ""),
            })

        out = dest_folder / "achievements.json"
        out.write_text(json.dumps(normalised, indent=2, ensure_ascii=False), encoding="utf-8")
        return out

    except Exception as e:
        eprint(f"  [!] Could not fetch from Steam: {e}")
        return None


# ─────────────────────────────────────────────
# MAIN SCAN ROUTINE
# ─────────────────────────────────────────────

def scan_game(game_path_str: str) -> dict:
    game_root = Path(game_path_str).resolve()
    if not game_root.is_dir():
        return {"error": f"Path does not exist: {game_root}"}

    result: Dict[str, Any] = {
        "game_path":         str(game_root),
        "best_exe":          None,
        "emulator":          "unknown",
        "app_id":            None,
        "save_folder":       None,
        "achievements_ini":  None,
        "achievements_json": None,
        "achievements_xml":  None,
        "debug_log":         [],
    }

    def log(msg: str):
        result["debug_log"].append(msg)

    log(f"Starting analysis of {game_root}")

    # Best executable
    best_exe = find_best_exe(game_root)
    result["best_exe"] = str(best_exe) if best_exe else None
    if best_exe:
        log(f"Detected best EXE: {best_exe.name}")
    else:
        log("No suitable EXE found")

    # Emulator type
    emu = detect_emulator(game_root)
    result["emulator"] = emu
    log(f"Emulator detected: {emu.upper()}")

    # ── CODEX ──
    if emu == "codex":
        ini_path = game_root / "steam_emu.ini"
        if ini_path.exists():
            cfg = parse_codex_ini(ini_path)
            app_id = cfg.get("AppId") or cfg.get("appid")
            log(f"Parsed steam_emu.ini → AppId={app_id}")
        else:
            appid_txt = game_root / "steam_appid.txt"
            app_id = appid_txt.read_text().strip() if appid_txt.exists() else None
            log(f"Checking steam_appid.txt → {app_id}")

        result["app_id"] = app_id
        if app_id:
            ach = find_codex_achievements(app_id)
            save_folder = ach["save_folder"]
            ach_ini = ach["achievements_ini"]
            ach_jsn = ach["achievements_json"]

            if save_folder:
                log(f"CODEX save folder found: {save_folder}")
            else:
                log(f"CODEX save folder NOT found for ID {app_id}")

            # Fallback: Search game root for achievements.ini/json
            if not ach_ini:
                log("Searching game root for fallback achievements.ini...")
                found = find_file_recursive(game_root, "achievements.ini")
                if found:
                    ach_ini = str(found)
                    log(f"Found fallback INI: {found}")
                else:
                    log("Fallback achievements.ini not found in game root.")

            if not ach_jsn:
                log("Searching game root for fallback achievements.json...")
                found = find_file_recursive(game_root, "achievements.json")
                if found:
                    ach_jsn = str(found)
                    log(f"Found fallback JSON: {found}")
                else:
                    log("Fallback achievements.json not found in game root.")

            result.update({
                "save_folder":       save_folder,
                "achievements_ini":  ach_ini,
                "achievements_json": ach_jsn,
            })
            if save_folder and not result["achievements_json"]:
                log(f"JSON missing in save folder, attempting Steam fetch for {app_id}...")
                generated = fetch_achievements_json(app_id, Path(typing.cast(str, save_folder)))
                if generated:
                    result["achievements_json"] = str(generated)
                    log("Steam fetch SUCCESSful")
                else:
                    log("Steam fetch FAILED (no stats found for this AppID or network error)")

    # ── ANADIUS ──
    elif emu == "anadius":
        cfg = parse_anadius_cfg(game_root / "anadius.cfg")
        id = cfg.get("ContentId")
        result["app_id"] = id
        log(f"Anadius ContentId: {id}")
        if id:
            ach = find_anadius_achievements(id)
            save_folder = ach["save_folder"]
            ach_jsn = ach["achievements_json"]

            if save_folder:
                log(f"Anadius save folder found: {save_folder}")
            else:
                log(f"Anadius save folder NOT found for ID {id}")

            if ach_jsn:
                log(f"Anadius JSON found: {ach_jsn}")
            else:
                log("Searching game root for fallback achievements.json...")
                found_jsn = find_file_recursive(game_root, "achievements.json")
                if found_jsn:
                    ach_jsn = str(found_jsn)
                    log(f"Found fallback JSON: {ach_jsn}")
                else:
                    log("Fallback achievements.json not found in game root.")

            result.update({
                "save_folder":       save_folder,
                "achievements_xml":  ach["achievements_xml"],
                "achievements_json": str(ach_jsn) if ach_jsn else None,
            })
            if save_folder and not result["achievements_json"]:
                log(f"JSON missing in save folder, attempting Steam fetch for {id}...")
                generated = fetch_achievements_json(id, Path(typing.cast(str, save_folder)))
                if generated:
                    result["achievements_json"] = str(generated)
                    log("Steam fetch SUCCESSful")
                else:
                    log("Steam fetch FAILED (no stats found for this ContentId or network error)")

    # ── GOLDBERG ──
    elif emu == "goldberg":
        cfg = parse_goldberg_settings(game_root)
        app_id = cfg.get("AppId")
        result["app_id"] = app_id
        log(f"Goldberg AppId: {app_id}")
        if app_id:
            ach = find_goldberg_achievements(app_id)
            save_folder = ach["save_folder"]
            ach_jsn = ach["achievements_json"]

            if save_folder:
                log(f"Goldberg save folder found: {save_folder}")
            else:
                log(f"Goldberg save folder NOT found for ID {app_id} (checked APPDATA/Goldberg SteamEmu Saves and GSE Saves)")

            # Fallback for goldberg: steam_settings or game root
            if not ach_jsn:
                log("Checking steam_settings/achievements.json fallback...")
                settings_json = game_root / "steam_settings" / "achievements.json"
                if settings_json.is_file():
                    ach_jsn = str(settings_json)
                    log(f"Found JSON in steam_settings: {ach_jsn}")
                else:
                    log("steam_settings/achievements.json not found.")
                    log("Searching game root recursively for achievements.json fallback...")
                    found = find_file_recursive(game_root, "achievements.json")
                    if found:
                        ach_jsn = str(found)
                        log(f"Found fallback JSON in game root: {found}")

            result.update({
                "save_folder":       save_folder,
                "achievements_json": ach_jsn,
            })
            if save_folder and not result["achievements_json"]:
                log("Attempting Steam fetch...")
                generated = fetch_achievements_json(app_id, Path(typing.cast(str, save_folder)))
                if generated:
                    result["achievements_json"] = str(generated)
                    log("Steam fetch SUCCESSful")
                else:
                    log("Steam fetch FAILED")

    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No path"}))
        sys.exit(1)

    result = scan_game(sys.argv[1])
    print(json.dumps(result, default=str))
