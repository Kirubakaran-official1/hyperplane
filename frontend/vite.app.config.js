import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Customer edition (/app): a separate bundle that never imports the dashboard code.
// `npx vite -c vite.app.config.js` proxies /app/api to the customer service on port 8100.
export default defineConfig({
  root: "app",
  base: "/app/",
  plugins: [react()],
  server: { port: 5174, proxy: { "/app/api": "http://localhost:8100" } },
  build: { outDir: "../dist/app", emptyOutDir: true },
});
