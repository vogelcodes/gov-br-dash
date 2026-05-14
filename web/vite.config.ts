import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");

  return {
    root: __dirname,
    plugins: [
      TanStackRouterVite({
        routesDirectory: path.resolve(__dirname, "src/routes"),
        generatedRouteTree: path.resolve(__dirname, "src/routeTree.gen.ts"),
      }),
      react(),
    ],
    build: {
      outDir: path.resolve(__dirname, "../public"),
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      port: 5173,
      proxy: {
        "/api": "http://localhost:3000",
        "/health": "http://localhost:3000",
        "/version": "http://localhost:3000",
        "/ingest/static": {
          target: "https://us-assets.i.posthog.com",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/ingest/, ""),
        },
        "/ingest/array": {
          target: "https://us-assets.i.posthog.com",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/ingest/, ""),
        },
        "/ingest": {
          target: env.VITE_PUBLIC_POSTHOG_HOST,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/ingest/, ""),
        },
      },
    },
  };
});
