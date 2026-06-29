import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const ADK_API_URL = process.env.ADK_API_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // Forward /api/* to the Python ADK FastAPI server. The SSE stream from
      // ADK comes back through here so the React UI doesn't need to know
      // the backend's port.
      "/api": {
        target: ADK_API_URL,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
  ],
});
