#!/usr/bin/env node
import { build } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arguments_ = process.argv.slice(2);
let outputDirectory;
if (arguments_.length === 0) {
  outputDirectory = path.join(
    projectRoot,
    ".codex",
    "skills",
    "worldkit-canonical-builder",
    "scripts",
  );
} else if (
  arguments_.length === 2 &&
  arguments_[0] === "--out-dir" &&
  arguments_[1] !== ""
) {
  outputDirectory = path.resolve(projectRoot, arguments_[1]);
} else {
  throw new Error("Usage: build-agent-self-check.mjs [--out-dir <directory>]");
}

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
    outDir: outputDirectory,
    rollupOptions: {
      output: {
        entryFileNames: "self-check.mjs",
        inlineDynamicImports: true,
      },
    },
  },
});
