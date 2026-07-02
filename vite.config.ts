import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    // Dev local não tem backend (api/ roda no Express/Vercel) — proxy pra prod
    // por default. Para rotas ainda não deployadas (ex.: /api/agent do chat V2),
    // rode o Express local (`$env:PORT='8091'; npm start`) e aponte:
    // VITE_API_PROXY_TARGET=http://localhost:8091
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "https://onboarding.pipeelo.com",
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
