import { defineConfig, type ProxyOptions } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const backend: Record<string, ProxyOptions> = {
  "/files": { target: "http://127.0.0.1:3333" },
  "/api": {
    target: "http://127.0.0.1:3333",
    changeOrigin: false,
    configure(proxy) {
      proxy.on("proxyRes", (proxyRes, _req, res) => {
        proxyRes.on("close", () => {
          if (!res.writableEnded) res.destroy();
        });
      });
    },
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: backend },
  build: {
    outDir: "../cli/viewer",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
