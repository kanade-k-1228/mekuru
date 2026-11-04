import { defineConfig, type ProxyOptions } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const backend: Record<string, ProxyOptions> = {
  "/files": { target: "http://127.0.0.1:3333" },
  "/api": { target: "http://127.0.0.1:3333", ws: true },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: backend },
  build: {
    outDir: "../core/viewer",
    emptyOutDir: true,
  },
});
