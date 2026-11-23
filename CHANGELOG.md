# Changelog

## 0.2.0

**A ground-up rebuild of the interface, plus in-app updates.**

### New
- **Brand new interface.** A calmer, faster design with a collapsible sidebar, a Home dashboard, grid and list library views, filters and sorting, and a redesigned game page.
- **Command palette.** Press `Ctrl+K` to jump to any game, page or action. `Ctrl+Enter` launches the selected game.
- **Collections.** Group games however you like and filter your library by collection.
- **In-app updates.** ChiraLauncher checks for new versions, shows the release notes and installs them for you. Manage it in Settings → Updates & about.
- **Now playing panel** in the sidebar with a live timer and a stop button.
- **Download speed limit** now actually limits download speed.
- **Close button behaviour.** Choose whether closing the window hides ChiraLauncher to the tray or quits it.
- Add a game by **Steam App ID** even when auto-detection can't find one.

### Faster
- The launcher starts with about half the JavaScript it used to, and pages load on demand.
- The library is virtualised, so it stays smooth with thousands of games.
- Background work is quieter: no always-on animations, no per-click database reads, and download polling backs off when idle or minimised.
- Folder scans and link resolving now work in parallel.
- Startup achievement scanning no longer competes with the rest of the app, and the database uses safer, faster settings.

### Fixed
- Removing shortcuts from the Edit dialog always failed.
- **Sync from Steam client** always errored.
- The first game you added never got desktop shortcuts.
- Launch splash windows were never closed, leaking one hidden window per shortcut launch.
- Typing a backtick opened the developer console.
- Right-click was blocked inside text fields.
- Steam descriptions are now sanitised before display.
- Removed settings that had no effect (upload limit, sequential download) and the notes field that never saved.

## 0.1.7

See the project README for the 0.1.7 release notes.
