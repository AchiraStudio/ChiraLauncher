// Tauri v2 injects __TAURI_INTERNALS__ into the webview window.
// This does NOT exist in a plain browser, which is why we guard against it.
// Referencing it without this declaration causes a TypeScript compile error.
interface Window {
    __TAURI_INTERNALS__?: unknown;
}
