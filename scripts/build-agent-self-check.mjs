#!/usr/bin/env node
import { build } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await build({
  configFile: false,
  root: projectRoot,
  logLevel: "warn",
  ssr: { noExternal: true },
  build: {
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    ssr: path.join(projectRoot, "scripts", "agent-builder-self-check.ts"),
    outDir: path.join(
      projectRoot,
      ".codex",
      "skills",
      "worldkit-canonical-builder",
      "scripts",
    ),
    rollupOptions: {
      output: {
        entryFileNames: "self-check.mjs",
        inlineDynamicImports: true,
      },
    },
  },
});
