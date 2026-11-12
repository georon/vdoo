import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { csp } from "./electron/csp.cjs";

// Build only: the dev server needs its HMR websocket and inline preamble, which a CSP would block.
const cspMeta: Plugin = {
  name: "vdoo-csp-meta",
  apply: "build",
  transformIndexHtml: (html) => html.replace("<title>", `<meta http-equiv="Content-Security-Policy" content="${csp()}" />\n    <title>`),
};

export default defineConfig({
  base: "./",
  plugins: [react(), cspMeta],
  build: { target: "es2022", chunkSizeWarningLimit: 3000 },
  test: { environment: "node" },
});
