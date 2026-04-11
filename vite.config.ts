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
    sourcemap: true,
    // Bump chunk size limit to 1000kB since desktop apps don't care about mobile network download speeds
    chunkSizeWarningLimit: 1000, 
    rollupOptions: {
      input: {
        main: "index.html",
        overlay: "overlay.html",
      },
      output: {
        // FIXED: Object-based manualChunks prevents circular dependency cycles
        // Rollup will naturally resolve the dependency graph from these entry points
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-framer': ['framer-motion'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui': ['lucide-react', 'sonner']
        }
      },
      onwarn(warning: any, warn: any) {
        // Mute ONLY the Supabase internal circular dependency (it is harmless)
        if (warning.code === "CIRCULAR_DEPENDENCY" && warning.message.includes("@supabase/auth-js")) {
          return;
        }

        // Surface ALL OTHER circular dependency warnings verbosely to track down TDZ crashes in your own code
        if (warning.code === "CIRCULAR_DEPENDENCY") {
          console.error("⚠️ CIRCULAR_DEPENDENCY:", warning.message);
        }
        warn(warning);
      }
    },
  },
}));