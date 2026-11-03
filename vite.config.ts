import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json";

// Relative base: the built app works from any folder or sub-path (GitHub Pages, Netlify, a USB stick served locally).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // One copy of React, pre-bundled together up front. Without this the dev server can discover a
  // dependency mid-session (jszip via @5h13/core), re-bundle, and serve React and React DOM from two
  // different bundles: "Invalid hook call" and a blank page.
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "jszip"] },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 1500 },
});
