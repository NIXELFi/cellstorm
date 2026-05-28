import { defineConfig } from "vite";

// Harness Vite config. In dev, /api is proxied to the bridge server (default port 5174) so the
// browser and the SQLite store live on the same origin. The production build emits to dist/, which
// the bridge server serves directly.
const BRIDGE_PORT = Number(process.env.PORT ?? 5174);

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${BRIDGE_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
