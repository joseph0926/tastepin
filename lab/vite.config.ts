import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.TASTEPIN_API_PORT || 4871);
const root = realpathSync(fileURLToPath(new URL(".", import.meta.url)));
const ledger = process.env.TASTEPIN_LEDGER_ID || createHash("sha256")
  .update(realpathSync(process.env.TASTEPIN_DATA || resolve(root, "..")))
  .digest("hex");

export default defineConfig({
  define: {
    __TASTE_OPEN_COMMAND__: JSON.stringify(process.env.TASTEPIN_OPEN_COMMAND || "python3 -B taste.py open --no-browser"),
  },
  plugins: [
    react(),
    {
      name: "tastepin-identity",
      configureServer(server) {
        server.middlewares.use("/tastepin/ping", (_request, response) => {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ root, apiPort, ledger }));
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
        target: `http://127.0.0.1:${apiPort}`,
        headers: { "X-Tastepin-Ledger": ledger },
        rewrite: (requestPath) => requestPath.replace(/^\/taste-api/, "/api"),
      },
    },
  },
});
