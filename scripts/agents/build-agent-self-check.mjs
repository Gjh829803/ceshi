#!/usr/bin/env node
import { build } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNativeTypecheckContext } from "./build-native-typecheck-context.mjs";

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
    sourceFileName: "agent-native-block-builder-self-check.mjs",
    skillName: "worldkit-native-block-builder",
    outputFileName: "self-check.mjs",
  },
  {
    sourceFileName: "agent-planner-self-check.ts",
    skillName: "worldkit-spatial-planner",
    outputFileName: "self-check.mjs",
  },
  {
    sourceFileName: "agent-planner-palette-authoring.ts",
    skillName: "worldkit-spatial-planner",
    outputFileName: "author-palette.mjs",
  },
  {
    sourceFileName: "agent-builder-self-check.ts",
    skillName: "worldkit-canonical-builder",
    outputFileName: "self-check.mjs",
  },
];

for (const target of targets) {
  const isNative = target.sourceFileName === "agent-native-block-builder-self-check.mjs";
  const frozenTypecheckContext = isNative ? buildNativeTypecheckContext(projectRoot) : undefined;
  await build({
    plugins: isNative ? [{
      name: "frozen-native-typecheck-context",
      resolveId(id) { if (id === "virtual:native-typecheck-context") return `\0${id}`; },
      load(id) { if (id === "\0virtual:native-typecheck-context") return `export default ${JSON.stringify(frozenTypecheckContext)};`; },
    }] : [],
    configFile: false,
    root: projectRoot,
    logLevel: "warn",
    ssr: { noExternal: true },
    build: {
      emptyOutDir: false,
      minify: target.skillName === "worldkit-native-block-builder" ? "esbuild" : false,
      sourcemap: false,
      ssr: path.join(projectRoot, "scripts", "agents", target.sourceFileName),
      outDir: path.join(outputRoot, target.skillName, "scripts"),
      rollupOptions: {
        // Portable tools consume pure parsers/Subject compilation through these
        // export-only barrels. Skip unrelated re-export initialization, never
        // the used validators or the Registry constructor's resource checks.
        // Keep existing Planner/Canonical bundle inputs unchanged.
        ...(target.sourceFileName === "agent-native-block-builder-self-check.mjs" ||
          target.sourceFileName === "agent-planner-palette-authoring.ts" ? {
            treeshake: {
              moduleSideEffects: (id) => ![
                "packages/authoring/src/index.ts",
                ...(isNative ? ["packages/native-babylon-block-profile/src/index.ts",
                  "packages/compiler/src/index.ts", "packages/gameplay/src/index.ts",
                  "packages/subject-registry/src/index.ts"] : []),
              ].some((relativePath) => id === path.join(projectRoot, relativePath)),
            },
          } : {}),
        output: {
          entryFileNames: target.outputFileName,
          inlineDynamicImports: true,
          ...(isNative ? { banner: [
            'import { fileURLToPath as __worldkitFileURLToPath } from "node:url";',
            'import { dirname as __worldkitDirname } from "node:path";',
            'const __filename = __worldkitFileURLToPath(import.meta.url);',
            'const __dirname = __worldkitDirname(__filename);',
          ].join(" ") } : {}),
        },
      },
    },
  });
}
