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
    sourcemap: false,
    chunkSizeWarningLimit: 1000, 
    rollupOptions: {
      input: {
        main: "index.html",
        overlay: "overlay.html",
      },
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-framer': ['framer-motion'],
          'vendor-ui': ['lucide-react', 'sonner']
        }
      },
      onwarn(warning: any, warn: any) {
        if (warning.code === "CIRCULAR_DEPENDENCY") {
          console.error("⚠️ CIRCULAR_DEPENDENCY:", warning.message);
        }
        warn(warning);
      }
    },
  },
}));