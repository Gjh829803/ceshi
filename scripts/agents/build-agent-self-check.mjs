#!/usr/bin/env node
import { build } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arguments_ = process.argv.slice(2);
let outputRoot;
if (arguments_.length === 0) {
  outputRoot = path.join(projectRoot, ".codex", "skills");
} else if (
  arguments_.length === 2 &&
  arguments_[0] === "--out-root" &&
  arguments_[1] !== ""
) {
  outputRoot = path.resolve(projectRoot, arguments_[1]);
} else {
  throw new Error("Usage: build-agent-self-check.mjs [--out-root <directory>]");
}

const targets = [
  {
    sourceFileName: "agent-subject-setup.ts",
    skillName: "worldkit-block-builder",
    outputFileName: "subject-setup.mjs",
  },
  {
    sourceFileName: "agent-planner-self-check.ts",
    skillName: "worldkit-spatial-planner",
    outputFileName: "self-check.mjs",
  },
  {
    sourceFileName: "agent-block-builder-self-check-entry.ts",
    skillName: "worldkit-block-builder",
    outputFileName: "self-check.mjs",
  },
  {
    sourceFileName: "agent-block-builder-visual-review.ts",
    skillName: "worldkit-block-builder",
    outputFileName: "render-visual-review.mjs",
  },
];

for (const target of targets) {
  await build({
    configFile: false,
    root: projectRoot,
    logLevel: "warn",
    ssr: { noExternal: true },
    build: {
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      ssr: path.join(projectRoot, "scripts", "agents", target.sourceFileName),
      outDir: path.join(outputRoot, target.skillName, "scripts"),
      rollupOptions: {
        output: {
          entryFileNames: target.outputFileName,
          inlineDynamicImports: true,
        },
      },
    },
  });
}
