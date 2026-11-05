import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react({ exclude: /AreaSelect(?:View)?\.tsx$/ })],
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: { ignored: ["**/release/**", "**/dist/**", "**/dist-electron/**"] },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
        spotlight: "spotlight.html",
        area: "area.html",
      },
    },
  },
});
