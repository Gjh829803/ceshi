import { cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build as viteBuild } from "vite";

const RUNTIME_EXTERNAL_PACKAGE_NAMES = Object.freeze([
  "@babylonjs/core",
  "@babylonjs/havok",
  "@babylonjs/loaders",
  "babylonjs-gltf2interface",
  "earcut",
]);
const NATIVE_BABYLON_PACKAGE_NAME = "@whitebox-world/native-babylon";
const RUNNER_EXTERNAL_PACKAGE_NAMES = Object.freeze([
  "@babylonjs/core",
  "@babylonjs/havok",
  "@babylonjs/loaders",
  NATIVE_BABYLON_PACKAGE_NAME,
  "earcut",
]);
const BUILTIN_PREFIX = "node:";
const RUNNER_FILE_NAME = "runner.mjs";

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}

function isRuntimeExternal(specifier) {
  return RUNTIME_EXTERNAL_PACKAGE_NAMES.includes(
    packageNameFromSpecifier(specifier),
  );
}

function isNativeBabylonExternal(specifier) {
  return packageNameFromSpecifier(specifier) === NATIVE_BABYLON_PACKAGE_NAME;
}

function rollupOutput(result) {
  if (Array.isArray(result)) {
    if (result.length !== 1) {
      throw new Error("WORLDKIT_HOSTED_RUNNER_BUILD_OUTPUT_INVALID");
    }
    return result[0];
  }
  return result;
}

async function bundleEntry({
  entryPath,
  outputRoot,
  fileName,
  external,
}) {
  const result = rollupOutput(await viteBuild({
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    build: {
      target: "node24",
      outDir: outputRoot,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      lib: {
        entry: entryPath,
        formats: ["es"],
        fileName: () => fileName,
      },
      rollupOptions: {
        external: (specifier) =>
          specifier.startsWith(BUILTIN_PREFIX) || external(specifier),
        output: {
          inlineDynamicImports: true,
          entryFileNames: fileName,
        },
      },
    },
  }));
  const chunks = result.output.filter((output) => output.type === "chunk");
  if (chunks.length !== 1 || chunks[0].fileName !== fileName) {
    throw new Error("WORLDKIT_HOSTED_RUNNER_BUILD_OUTPUT_INVALID");
  }
  const externalImportSpecifiersExact = Object.freeze(
    [...new Set(chunks.flatMap((chunk) => chunk.imports)
      .filter((specifier) => !specifier.startsWith(BUILTIN_PREFIX)))]
      .sort((left, right) => left.localeCompare(right, "en-US")),
  );
  return Object.freeze({
    sourceModulePaths: Object.freeze(
      Object.keys(chunks[0].modules).sort((left, right) =>
        left.localeCompare(right, "en-US")
      ),
    ),
    externalImportSpecifiersExact,
    externalImportSpecifiers: Object.freeze(
      [...new Set(externalImportSpecifiersExact.map(packageNameFromSpecifier))]
        .sort((left, right) => left.localeCompare(right, "en-US")),
    ),
  });
}

async function copyRuntimePackage(outputRoot, packageName, sourcePath) {
  const destination = path.join(
    outputRoot,
    "node_modules",
    ...packageName.split("/"),
  );
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(await realpath(sourcePath), destination, {
    recursive: true,
    force: false,
  });
}

async function writeGuestPackage(
  outputRoot,
  packageName,
  packageVersion,
  packageExports,
) {
  const packageRoot = path.join(
    outputRoot,
    "node_modules",
    ...packageName.split("/"),
  );
  await mkdir(packageRoot, { recursive: true });
  await writeFile(path.join(packageRoot, "package.json"), `${JSON.stringify({
    name: packageName,
    version: packageVersion,
    private: true,
    type: "module",
    exports: packageExports,
  })}\n`, "utf8");
  return packageRoot;
}

function assertRunnerSourceClosure(sourceModulePaths) {
  const forbiddenSegments = [
    "/packages/authoring/",
    "/packages/compiler/",
    "/packages/world-package/src/package-directory.ts",
    "/packages/native-babylon/",
    "/node_modules/tsx/",
  ];
  if (sourceModulePaths.some((sourcePath) =>
    forbiddenSegments.some((segment) =>
      sourcePath.split(path.sep).join("/").includes(segment)
    )
  )) {
    throw new Error("WORLDKIT_HOSTED_RUNNER_IMPORT_GRAPH_INVALID");
  }
}

export async function buildHostedNativeRunnerDistributionV1(input) {
  const repositoryRoot = await realpath(path.resolve(input.repositoryRoot));
  const outputRoot = path.resolve(input.outputRoot);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const runnerBuild = await bundleEntry({
    entryPath: path.join(
      repositoryRoot,
      "scripts/native-scene/hosted/runner-entry.ts",
    ),
    outputRoot,
    fileName: RUNNER_FILE_NAME,
    external: (specifier) =>
      isRuntimeExternal(specifier) || isNativeBabylonExternal(specifier),
  });
  assertRunnerSourceClosure(runnerBuild.sourceModulePaths);
  if (
    runnerBuild.externalImportSpecifiers.length !==
      RUNNER_EXTERNAL_PACKAGE_NAMES.length ||
    runnerBuild.externalImportSpecifiers.some((specifier, index) =>
      specifier !== RUNNER_EXTERNAL_PACKAGE_NAMES[index]
    )
  ) {
    throw new Error("WORLDKIT_HOSTED_RUNNER_EXTERNAL_CLOSURE_INVALID");
  }

  const nativeBabylonManifest = JSON.parse(await readFile(path.join(
    repositoryRoot,
    "packages/native-babylon/package.json",
  ), "utf8"));
  const nativeBabylonRoot = await writeGuestPackage(
    outputRoot,
    NATIVE_BABYLON_PACKAGE_NAME,
    nativeBabylonManifest.version,
    Object.freeze({
      ".": "./index.mjs",
      "./host": "./host.mjs",
    }),
  );
  const nativeRootBuild = await bundleEntry({
    entryPath: path.join(repositoryRoot, "packages/native-babylon/src/index.ts"),
    outputRoot: nativeBabylonRoot,
    fileName: "index.mjs",
    external: isRuntimeExternal,
  });
  const nativeHostBuild = await bundleEntry({
    entryPath: path.join(repositoryRoot, "packages/native-babylon/src/host.ts"),
    outputRoot: nativeBabylonRoot,
    fileName: "host.mjs",
    external: isRuntimeExternal,
  });

  const blockProfileManifest = JSON.parse(await readFile(path.join(
    repositoryRoot,
    "packages/native-babylon-block-profile/package.json",
  ), "utf8"));
  const blockProfileRoot = await writeGuestPackage(
    outputRoot,
    "@whitebox-world/native-babylon-block-profile",
    blockProfileManifest.version,
    "./index.mjs",
  );
  const blockProfileBuild = await bundleEntry({
    entryPath: path.join(
      repositoryRoot,
      "packages/native-babylon-block-profile/src/index.ts",
    ),
    outputRoot: blockProfileRoot,
    fileName: "index.mjs",
    external: (specifier) =>
      isRuntimeExternal(specifier) ||
      isNativeBabylonExternal(specifier),
  });
  if (blockProfileBuild.sourceModulePaths.some((sourcePath) =>
    sourcePath.split(path.sep).join("/").includes("/packages/native-babylon/")
  )) {
    throw new Error("WORLDKIT_HOSTED_BLOCK_PROFILE_IMPORT_GRAPH_INVALID");
  }

  const packageSources = Object.freeze({
    "@babylonjs/core": path.join(repositoryRoot, "node_modules/@babylonjs/core"),
    "@babylonjs/havok": path.join(repositoryRoot, "node_modules/@babylonjs/havok"),
    "@babylonjs/loaders": path.join(
      repositoryRoot,
      "packages/runtime-babylon/node_modules/@babylonjs/loaders",
    ),
    "babylonjs-gltf2interface": path.join(
      repositoryRoot,
      "packages/runtime-babylon/node_modules/babylonjs-gltf2interface",
    ),
    earcut: path.join(
      repositoryRoot,
      "packages/runtime-babylon/node_modules/earcut",
    ),
  });
  for (const packageName of RUNTIME_EXTERNAL_PACKAGE_NAMES) {
    await copyRuntimePackage(
      outputRoot,
      packageName,
      packageSources[packageName],
    );
  }
  const assetRoot = path.join(outputRoot, "assets");
  await mkdir(assetRoot, { recursive: true });
  await cp(path.join(
    repositoryRoot,
    "apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
  ), path.join(assetRoot, "g-bot.glb"), { force: false });
  await cp(path.join(
    repositoryRoot,
    "scripts/native-scene/hosted/hostile-fixtures",
  ), path.join(outputRoot, "hostile-fixtures"), {
    recursive: true,
    force: false,
  });

  return Object.freeze({
    runnerSourceModulePaths: runnerBuild.sourceModulePaths,
    runnerExternalImportSpecifiers: runnerBuild.externalImportSpecifiers,
    runnerExternalImportSpecifiersExact:
      runnerBuild.externalImportSpecifiersExact,
    nativeRootSourceModulePaths: nativeRootBuild.sourceModulePaths,
    nativeHostSourceModulePaths: nativeHostBuild.sourceModulePaths,
    blockProfileSourceModulePaths: blockProfileBuild.sourceModulePaths,
  });
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf("--output");
  const outputRoot = process.argv[outputIndex + 1];
  if (outputIndex < 0 || outputRoot === undefined) {
    throw new Error("WORLDKIT_HOSTED_RUNNER_BUILD_ARGUMENT_INVALID");
  }
  await buildHostedNativeRunnerDistributionV1({
    repositoryRoot: path.resolve(import.meta.dirname, "../../../.."),
    outputRoot,
  });
}
