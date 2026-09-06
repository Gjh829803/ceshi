#!/usr/bin/env node

import { build } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptRoot, "../../../..");
const outputDirectoryArgumentIndex = process.argv.indexOf("--out-dir");
const outputDirectoryPath = outputDirectoryArgumentIndex < 0
  ? scriptRoot
  : path.resolve(process.argv[outputDirectoryArgumentIndex + 1] ?? "");
if (
  outputDirectoryArgumentIndex >= 0 &&
  (process.argv[outputDirectoryArgumentIndex + 1] === undefined ||
    process.argv[outputDirectoryArgumentIndex + 1].startsWith("--"))
) {
  throw new TypeError("--out-dir requires one path");
}

await build({
  configFile: false,
  root: repositoryRoot,
  logLevel: "warn",
  ssr: { noExternal: true },
  build: {
    emptyOutDir: outputDirectoryPath !== scriptRoot,
    minify: "esbuild",
    sourcemap: false,
    ssr: path.join(scriptRoot, "render-visual-review.source.ts"),
    outDir: outputDirectoryPath,
    rollupOptions: {
      treeshake: {
        // These barrels only re-export; retain the used parser/compiler owners
        // without loading unrelated Native scene/engine initialization.
        moduleSideEffects: (id) => ![
          "packages/authoring/src/index.ts",
          "packages/native-babylon-block-profile/src/index.ts",
          "packages/compiler/src/index.ts",
          "packages/gameplay/src/index.ts",
          "packages/subject-registry/src/index.ts",
        ].some((relativePath) => id === path.join(repositoryRoot, relativePath)),
      },
      output: {
        entryFileNames: "render-visual-review.mjs",
        inlineDynamicImports: true,
        banner: [
          'import { fileURLToPath as __worldkitFileURLToPath } from "node:url";',
          'import { dirname as __worldkitDirname } from "node:path";',
          "const __filename = __worldkitFileURLToPath(import.meta.url);",
          "const __dirname = __worldkitDirname(__filename);",
        ].join(" "),
      },
    },
  },
});
