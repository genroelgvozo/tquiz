import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Backend address for the dev proxy; override with TQUIZ_BACKEND=http://localhost:8010 if 8000 is busy.
const backend = process.env.TQUIZ_BACKEND ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      "/api": backend,
      "/media": backend,
      "/ws": { target: backend.replace(/^http/, "ws"), ws: true },
    },
  },
});
