import { defineConfig } from "vite";

// The Creator Host supplies the two immutable virtual input modules.
export default defineConfig({
  publicDir: false,
  server: { host: "127.0.0.1" },
  build: { target: "es2022" },
});
