import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "tastepin-identity",
      configureServer(server) {
        server.middlewares.use("/tastepin/ping", (_request, response) => {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ root: realpathSync(fileURLToPath(new URL(".", import.meta.url))) }));
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5181,
    strictPort: true,
    proxy: {
      "/taste-api": {
        target: "http://127.0.0.1:4871",
        rewrite: (requestPath) => requestPath.replace(/^\/taste-api/, "/api"),
      },
    },
  },
});
