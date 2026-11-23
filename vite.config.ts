import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // Tauri's webviews are modern (WebView2/Chromium on Windows), so ship modern JS: smaller and faster.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: "index.html",
        overlay: "overlay.html",
      },
      output: {
        // Function form so every transitive dependency lands in the right vendor chunk
        // (the object form left react-dom inside an arbitrary app chunk).
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|@remix-run)[\\/]/.test(id)) return "vendor-react";
          if (/[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return "vendor-framer";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("@tauri-apps")) return "vendor-tauri";
          return undefined;
        },
      },
      onwarn(warning: { code?: string; message: string }, warn: (w: never) => void) {
        if (warning.code === "CIRCULAR_DEPENDENCY") {
          console.error("CIRCULAR_DEPENDENCY:", warning.message);
        }
        warn(warning as never);
      },
    },
  },
}));