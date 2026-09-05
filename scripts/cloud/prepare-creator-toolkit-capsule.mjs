#!/usr/bin/env node
/** Build a credential-free, relocatable Linux x64 Creator SDK capsule. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync,
  readdirSync, readlinkSync, realpathSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  assert(argv[index + 1] && !argv[index + 1].startsWith("--"), `Missing ${name} value`);
  return argv[index + 1];
};
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const writeJson = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const run = (command, arguments_, options = {}) => {
  const result = spawnSync(command, arguments_, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed with status ${result.status}`);
};
const walk = (directory) => readdirSync(directory, { withFileTypes: true })
  .sort((a, b) => a.name.localeCompare(b.name))
  .flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });

function finalizeInsideContainer(capsuleRoot, sourceImage, skipCompileDoctor) {
  assert.equal(process.platform, "linux");
  assert.equal(process.arch, "x64");
  assert.equal(process.version, "v20.20.2");
  const sdkRoot = path.join(capsuleRoot, "sdk");
  const originalPrefix = "/opt/worldkit-toolkit/sdk";
  let relocatedShimCount = 0;
  for (const file of walk(sdkRoot)) {
    if (!file.includes("/node_modules/.bin/") || lstatSync(file).isSymbolicLink()) continue;
    const original = readFileSync(file, "utf8");
    if (!original.startsWith("#!/bin/sh") || !original.includes(originalPrefix)) continue;
    const relativeRoot = path.posix.relative(path.posix.dirname(file), sdkRoot);
    writeFileSync(file, original.replaceAll(originalPrefix, `\${basedir}/${relativeRoot}`));
    chmodSync(file, 0o755);
    relocatedShimCount += 1;
  }

  const smokeSceneSource = `import {defineBabylonNativeScene} from '@whitebox-world/native-babylon';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder.js';
import {registerEntity} from '@worldkit/creator';
export default defineBabylonNativeScene({kind:'babylon-native-scene-module',id:'capsule-smoke',build(context){
const floor=MeshBuilder.CreateBox('floor',{width:80,height:1,depth:80},context.scene);
floor.position.y=-0.5;
registerEntity(context,floor,{id:'floor',physics:'solid',traversable:true});
}});`;
  const doctorSource = `
    import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
    import { parseCreatorSceneConfig } from './scripts/creator/config.ts';
    import { CreatorTools } from './scripts/creator/tools.ts';
    import { transformWithEsbuild } from 'vite';
    import { defineBabylonNativeScene } from '@whitebox-world/native-babylon';
    const config={schemaVersion:1,id:'capsule-smoke',subject:{kind:'pack',subjectPackId:'humanoid.g-bot'},spawn:{positionMetersXYZ:[0,0.1,0],facingRadians:0},camera:{pitchRadians:0.2,distanceMeters:8,fovDegrees:55,targetHeightMeters:1},worldBounds:{centerMetersXZ:[0,0],sizeMetersXZ:[80,80],heightRangeMeters:[-10,40]}};
    parseCreatorSceneConfig(config);
    const environment=await new CreatorTools('/tmp/creator-toolkit-doctor').environment();
    const transformed=await transformWithEsbuild('const x: number = 1','smoke.ts');
    if(!transformed.code.includes('1')||typeof defineBabylonNativeScene!=='function')throw new Error('SDK_IMPORT_SMOKE_FAILED');
    const catalog=JSON.parse(await readFile('.codex/skills/worldkit-block-builder/references/agent-authoring-catalog.json','utf8'));
    const actions=catalog.subjectPacks.find(row=>row.id==='humanoid.g-bot').presentation.actions;
    if(actions.length!==25)throw new Error('EXPECTED_25_GBOT_ACTIONS');
    if(!${JSON.stringify(skipCompileDoctor)}) {
      const workspace=await mkdtemp('/tmp/creator-toolkit-smoke-');
      const service=new CreatorTools(workspace);
      try {
        await writeFile(workspace+'/scene.json',JSON.stringify(config));
        await writeFile(workspace+'/scene.ts',${JSON.stringify(smokeSceneSource)});
        const candidate=await service.prepare();
        const html=await readFile(candidate.publicRoot+'/index.html','utf8');
        if(!html.includes('<canvas'))throw new Error('CREATOR_PLAYABLE_BUNDLE_MISSING');
      } finally {await service.close();await rm(workspace,{recursive:true,force:true});}
    }
    console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,gbotCatalogActionCount:actions.length,subjectPackCount:environment.subjectPackCount,esbuild:'passed',nativeSdk:'import-passed',creatorConfig:'schema-passed',bootstrapResolution:${JSON.stringify(skipCompileDoctor ? "deferred-to-cloud" : "passed")},externalWorkspacePrepare:${JSON.stringify(skipCompileDoctor ? "deferred-to-cloud" : "passed")},browser:'not-in-this-capsule'}));
  `;
  const doctor = JSON.parse(execFileSync(process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", doctorSource], {
      cwd: sdkRoot,
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp", PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1", NODE_OPTIONS: "--max-old-space-size=3072" },
      encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    }).trim());
  writeJson(path.join(capsuleRoot, "doctor.json"), doctor);
  writeFileSync(path.join(capsuleRoot, "activate.sh"), `# Set WORLDKIT_TOOLKIT_CAPSULE_ROOT before sourcing this file.\n: "\${WORLDKIT_TOOLKIT_CAPSULE_ROOT:?Set capsule root}"\nexport WORLDKIT_TOOLKIT_ROOT="$WORLDKIT_TOOLKIT_CAPSULE_ROOT/sdk"\nexport PATH="$WORLDKIT_TOOLKIT_CAPSULE_ROOT/runtime/bin:$WORLDKIT_TOOLKIT_ROOT/node_modules/.bin:$PATH"\n`);

  const entries = [];
  let elfCount = 0;
  let maximumRequiredGlibcMinor = 0;
  for (const file of walk(capsuleRoot)) {
    const relative = path.relative(capsuleRoot, file).split(path.sep).join("/");
    const info = lstatSync(file);
    if (info.isSymbolicLink()) {
      const target = readlinkSync(file);
      assert(!path.isAbsolute(target), `Absolute capsule symlink: ${relative}`);
      const resolved = realpathSync(file);
      assert(resolved.startsWith(`${capsuleRoot}/`), `Escaping capsule symlink: ${relative}`);
      entries.push({ path: relative, kind: "symlink", target });
      continue;
    }
    assert(info.isFile(), `Unsupported capsule entry: ${relative}`);
    const bytes = readFileSync(file);
    if (bytes.length > 20 && bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
      assert.equal(bytes.readUInt16LE(18), 62, `Non-x64 ELF in capsule: ${relative}`);
      for (const match of bytes.toString("latin1").matchAll(/GLIBC_(\d+)\.(\d+)/g)) {
        const major = Number(match[1]);
        const minor = Number(match[2]);
        assert(major === 2 && minor <= 35, `ELF needs newer than Jammy glibc 2.35: ${relative}: ${match[0]}`);
        maximumRequiredGlibcMinor = Math.max(maximumRequiredGlibcMinor, minor);
      }
      elfCount += 1;
    }
    entries.push({ path: relative, kind: "file", bytes: bytes.length, sha256: hash(bytes), mode: info.mode & 0o777 });
  }
  writeJson(path.join(capsuleRoot, "content-manifest.json"), {
    kind: "worldkit-creator-toolkit-capsule", schemaVersion: 1,
    runtime: { nodeVersion: process.version, platform: process.platform, architecture: process.arch, sourceImage },
    sourceManifestSha256: hash(readFileSync(path.join(sdkRoot, "source-manifest.json"))),
    nodeBinary: "runtime/bin/node", toolkitRoot: "sdk", browserIncluded: false,
    relocatedShimCount, elfCount, maximumRequiredGlibc: `2.${maximumRequiredGlibcMinor}`, entries,
    note: "Manifest excludes itself; all dependency/workspace symlinks are relative and contained in this capsule.",
  });
  console.log(JSON.stringify({ status: "capsule-validated", fileCount: entries.length, elfCount, relocatedShimCount, doctor }));
}

function stageContext(repositoryRoot, outputRoot) {
  const contextRoot = path.join(outputRoot, "context");
  // This is this script's generated context only; no workspace source is removed.
  rmSync(contextRoot, { recursive: true, force: true });
  mkdirSync(contextRoot, { recursive: true });
  const sourceRoot = path.join(contextRoot, "sources");
  const manifestRoot = path.join(contextRoot, "manifests");
  const files = new Map();
  const deniedNames = new Set(["node_modules", ".git", ".codex-tmp", ".env", "auth.json", "credentials", ".aws", ".npmrc", ".pnpmfile.cjs", "config.toml"]);
  const sourceExtensions = new Set([".ts", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json", ".wasm", ".md", ".html", ".css", ".glb", ".gltf", ".png", ".jpg", ".jpeg", ".svg", ".txt", ".patch"]);
  function addFile(relative, installationManifest = false) {
    assert(!path.isAbsolute(relative) && !relative.split(path.sep).includes(".."));
    assert(!relative.split(path.sep).some((part) => deniedNames.has(part)), `Forbidden staged path: ${relative}`);
    const from = path.join(repositoryRoot, relative);
    const info = lstatSync(from);
    assert(info.isFile() && !info.isSymbolicLink(), `Not a plain source file: ${relative}`);
    const bytes = readFileSync(from);
    const destinations = [sourceRoot, ...(installationManifest ? [manifestRoot] : [])];
    for (const destination of destinations) {
      const to = path.join(destination, relative);
      mkdirSync(path.dirname(to), { recursive: true });
      writeFileSync(to, bytes, { mode: info.mode & 0o111 ? 0o755 : 0o644 });
    }
    files.set(relative, { path: relative, bytes: bytes.length, sha256: hash(bytes) });
  }
  function addTree(relative) {
    const directory = path.join(repositoryRoot, relative);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || deniedNames.has(entry.name) || ["dist", "coverage", "test-results"].includes(entry.name)) continue;
      const child = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Source symlink cannot enter build context: ${child}`);
      if (entry.isDirectory()) addTree(child);
      else if (entry.isFile() && (sourceExtensions.has(path.extname(entry.name)) || /^LICENSE(?:\.|$)/i.test(entry.name))) {
        if (entry.name.endsWith(".test.ts")) continue;
        addFile(child);
      }
    }
  }
  for (const relative of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json"]) addFile(relative, true);
  for (const folder of ["packages", "apps"]) {
    for (const entry of readdirSync(path.join(repositoryRoot, folder), { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(path.join(repositoryRoot, folder, entry.name, "package.json"))) {
        addFile(path.join(folder, entry.name, "package.json"), true);
      }
    }
  }
  for (const file of readdirSync(path.join(repositoryRoot, "patches"))) {
    if (file.endsWith(".patch")) addFile(path.join("patches", file), true);
  }
  for (const relative of ["packages", "scripts/creator", "apps/creator-playground", "apps/playground/public/subject-assets", "assets/registry"]) addTree(relative);
  for (const relative of [
    "scripts/lib/agent-authoring-catalog.ts",
    "scripts/lib/world-package-resource-resolver.ts",
    "apps/playground/src/worldkit-asset-resolver.ts",
    ".codex/skills/worldkit-block-builder/references/agent-authoring-catalog.json",
    "assets/subjects/source-fbx/vehicles/catalog.json",
    "assets/subjects/source-fbx/contributors/xier120/catalog.json",
  ]) addFile(relative);
  const entries = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  const sourceManifest = {
    kind: "worldkit-creator-toolkit-source", schemaVersion: 1,
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
    sourceHash: hash(JSON.stringify(entries)), files: entries,
    policy: "Explicit source/asset allowlist; no personal config, auth, environment files, host node_modules, whole worktree, browser or cloud credentials.",
  };
  writeJson(path.join(sourceRoot, "source-manifest.json"), sourceManifest);
  copyFileSync(path.join(repositoryRoot, "deploy/creator-runtime/Dockerfile.toolkit"), path.join(contextRoot, "Dockerfile"));
  copyFileSync(fileURLToPath(import.meta.url), path.join(contextRoot, "prepare-creator-toolkit-capsule.mjs"));
  writeFileSync(path.join(contextRoot, ".dockerignore"), "**/.DS_Store\n**/.env*\n**/auth.json\n**/config.toml\n**/.npmrc\n");
  const stageReport = { status: "staged", contextRoot, sourceHash: sourceManifest.sourceHash, fileCount: entries.length, sourceBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
  writeJson(path.join(outputRoot, "stage-report.json"), stageReport);
  console.log(JSON.stringify(stageReport));
  return contextRoot;
}

function refreshToolHelp(contextRoot, exportRoot) {
  const capsuleRoot = path.join(exportRoot, "toolkit");
  const sdkRoot = path.join(capsuleRoot, "sdk");
  const previous = JSON.parse(readFileSync(path.join(sdkRoot, "source-manifest.json"), "utf8"));
  const next = JSON.parse(readFileSync(path.join(contextRoot, "sources/source-manifest.json"), "utf8"));
  const previousByPath = new Map(previous.files.map((entry) => [entry.path, entry]));
  assert.deepEqual(next.files.map((entry) => entry.path), previous.files.map((entry) => entry.path), "Refresh cannot change the staged file set");
  const changedPaths = next.files.filter((entry) => previousByPath.get(entry.path)?.sha256 !== entry.sha256).map((entry) => entry.path);
  const allowed = new Set(["scripts/creator/tools.ts", "scripts/creator/mcp.ts"]);
  assert(changedPaths.every((file) => allowed.has(file)), "Tool-help refresh only admits the two explicitly selected files; rebuild for any other change");
  for (const relative of changedPaths) copyFileSync(path.join(contextRoot, "sources", relative), path.join(sdkRoot, relative));
  copyFileSync(path.join(contextRoot, "sources/source-manifest.json"), path.join(sdkRoot, "source-manifest.json"));
  const manifestFile = path.join(capsuleRoot, "content-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const changedEntries = new Set([...changedPaths.map((file) => `sdk/${file}`), "sdk/source-manifest.json"]);
  manifest.entries = manifest.entries.map((entry) => {
    if (!changedEntries.has(entry.path)) return entry;
    const bytes = readFileSync(path.join(capsuleRoot, entry.path));
    return { ...entry, bytes: bytes.length, sha256: hash(bytes) };
  });
  manifest.sourceManifestSha256 = hash(readFileSync(path.join(sdkRoot, "source-manifest.json")));
  manifest.sourceRefresh = {
    previousSourceHash: previous.sourceHash,
    sourceHash: next.sourceHash,
    changedPaths,
    validation: "Source-only help refresh; runtime checks were not repeated. Actual cloud compile/browser smoke remains required.",
  };
  writeJson(manifestFile, manifest);
  const archivePath = path.join(exportRoot, "creator-toolkit.tar.gz");
  run("tar", ["-czf", `${archivePath}.part`, "-C", exportRoot, "toolkit"], {
    env: { PATH: process.env.PATH, COPYFILE_DISABLE: "1" },
  });
  renameSync(`${archivePath}.part`, archivePath);
  console.log(JSON.stringify({ status: "tool-help-refreshed", changedPaths, sourceHash: next.sourceHash }));
}

if (argv.includes("--inside-container")) {
  finalizeInsideContainer(path.resolve(option("--capsule-root", "/opt/worldkit-toolkit")), option("--source-image", "unknown"), argv.includes("--skip-compile-doctor"));
} else {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const outputRoot = path.resolve(option("--output-root", path.join(repositoryRoot, ".codex-tmp/gpt6-toolkit-capsule")));
  const allowedOutputRoot = path.join(repositoryRoot, ".codex-tmp/gpt6-toolkit-capsule");
  assert(outputRoot === allowedOutputRoot || outputRoot.startsWith(`${allowedOutputRoot}${path.sep}`), "Output must stay in the dedicated generated capsule directory");
  const contextRoot = stageContext(repositoryRoot, outputRoot);
  if (!argv.includes("--stage-only")) {
    const sourceImage = option("--source-image", "node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0");
    const exportRoot = path.join(outputRoot, "export");
    if (argv.includes("--refresh-tool-help")) refreshToolHelp(contextRoot, exportRoot);
    else run("docker", ["buildx", "build", "--platform", "linux/amd64", "--progress", "plain",
        "--build-arg", `NODE_SOURCE_IMAGE=${sourceImage}`,
        "--build-arg", `SKIP_COMPILE_DOCTOR=${argv.includes("--skip-compile-doctor") ? "1" : "0"}`,
        "--output", `type=local,dest=${exportRoot}`, contextRoot]);
    const archivePath = path.join(exportRoot, "creator-toolkit.tar.gz");
    const manifestPath = path.join(exportRoot, "toolkit/content-manifest.json");
    const archiveBytes = readFileSync(archivePath);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const report = {
      kind: "worldkit-creator-toolkit-capsule-build", schemaVersion: 1, status: "built",
      archivePath, archiveBytes: archiveBytes.length, archiveSha256: hash(archiveBytes),
      manifestPath, manifestSha256: hash(readFileSync(manifestPath)),
      nodeBinary: path.join(exportRoot, "toolkit/runtime/bin/node"),
      toolkitRoot: path.join(exportRoot, "toolkit/sdk"),
      sourceHash: JSON.parse(readFileSync(path.join(exportRoot, "toolkit/sdk/source-manifest.json"), "utf8")).sourceHash,
      runtime: manifest.runtime,
      doctor: JSON.parse(readFileSync(path.join(exportRoot, "toolkit/doctor.json"), "utf8")),
    };
    writeJson(path.join(outputRoot, "build-report.json"), report);
    console.log(JSON.stringify(report));
  }
}
