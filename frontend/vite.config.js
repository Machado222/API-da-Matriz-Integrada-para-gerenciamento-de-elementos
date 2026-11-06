import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");

export default defineConfig(({ mode }) => {
  const backendEnv = loadEnv(mode, projectRoot, "");
  const apiKey = backendEnv.API_ACCESS_KEY;

  return {
    plugins: [react()],

    server: {
      host: "localhost",
      port: 5173,

      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,

          configure(proxy) {
            proxy.on("proxyReq", (proxyReq) => {
              if (apiKey) {
                proxyReq.setHeader("x-api-key", apiKey);
              }
            });
          }
        }
      }
    }
  };
});