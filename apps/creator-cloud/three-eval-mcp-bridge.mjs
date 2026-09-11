#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, lstat, realpath, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import { readRuntimeLock, executionEnvironment, prepareSessionDirectories, valueAfter, THREE_PROFILES } from "./three-eval-runtime.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const policyModule = toolkitRoot => import(pathToFileURL(path.join(toolkitRoot, "packages/creator-host/src/assets/asset-policy.mjs")).href);
async function policyFields(value, toolkitRoot) {
  const {validateAssetPolicySnapshot, assetPolicyHash} = await policyModule(toolkitRoot);
  if (!value?.assetPolicySnapshot || !/^[a-f0-9]{64}$/.test(value.assetPolicySha256 ?? "")) throw new Error("THREE_ASSET_POLICY_PIN_REQUIRED");
  const assetPolicySnapshot = validateAssetPolicySnapshot(value.assetPolicySnapshot);
  if (assetPolicyHash(assetPolicySnapshot) !== value.assetPolicySha256) throw new Error("THREE_ASSET_POLICY_HASH_MISMATCH");
  return {assetPolicySnapshot, assetPolicySha256: value.assetPolicySha256};
}
/** Existing plans retain their exact snapshot (or explicit historical absence). */
export async function freezeRunAssetPolicy({toolkitRoot, previousPlan}) {
  if (previousPlan) {
    if (previousPlan.assetPolicySnapshot === undefined && previousPlan.assetPolicySha256 === undefined) return {};
    // Validation code belongs to this runner checkout, not a possibly unavailable old capsule.
    return policyFields(previousPlan, path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
  }
  const {createAssetPolicySnapshot, assetPolicyHash} = await policyModule(toolkitRoot);
  const policy = JSON.parse(await readFile(path.join(toolkitRoot, "packages/creator-host/config/asset-policy.json"), "utf8"));
  const catalog = JSON.parse(await readFile(path.join(toolkitRoot, "assets/three-creator/asset-catalog.json"), "utf8"));
  const assetPolicySnapshot = createAssetPolicySnapshot(policy, catalog.assets);
  return {assetPolicySnapshot, assetPolicySha256: assetPolicyHash(assetPolicySnapshot)};
}
async function verifyInstalledPolicy(snapshot, toolkitRoot) {
  const {createAssetPolicySnapshot, assetPolicyHash} = await policyModule(toolkitRoot);
  const catalog = JSON.parse(await readFile(path.join(toolkitRoot, "assets/three-creator/asset-catalog.json"), "utf8"));
  if (assetPolicyHash(createAssetPolicySnapshot(snapshot.policy, catalog.assets)) !== assetPolicyHash(snapshot)) throw new Error("THREE_ASSET_POLICY_CATALOG_MISMATCH");
  // The locked capsule already verifies its complete file inventory. Also bind
  // the catalog's resource claims to the actual bytes used by this task.
  for (const asset of catalog.assets) for (const resource of [asset, ...(asset.resources ?? [])]) {
    const file = path.resolve(toolkitRoot, resource.sourcePath);
    if (!file.startsWith(toolkitRoot + path.sep) || await realpath(file) !== file || !(await lstat(file)).isFile()) throw new Error("THREE_ASSET_POLICY_RESOURCE_PATH");
    const bytes = await readFile(file);
    if (bytes.length !== resource.byteLength || digest(bytes) !== resource.sha256) throw new Error("THREE_ASSET_POLICY_RESOURCE_MISMATCH");
  }
}
export async function readPinnedAssetPolicy({assetPolicySnapshotPath, assetPolicySha256, workspace, toolkitRoot}) {
  if (!assetPolicySnapshotPath || !/^[a-f0-9]{64}$/.test(assetPolicySha256 ?? "")) throw new Error("THREE_ASSET_POLICY_PIN_REQUIRED");
  const file = path.resolve(assetPolicySnapshotPath), root = await realpath(workspace);
  if (file === root || file.startsWith(root + path.sep) || await realpath(file) !== file || !(await lstat(file)).isFile()) throw new Error("THREE_ASSET_POLICY_PATH_INVALID");
  const {assetPolicySnapshot} = await policyFields({assetPolicySnapshot: JSON.parse(await readFile(file, "utf8")), assetPolicySha256}, toolkitRoot);
  await verifyInstalledPolicy(assetPolicySnapshot, toolkitRoot);
  return assetPolicySnapshot;
}
/** Called only before the model starts. Never re-read model inputs on restart. */
export async function freezeTaskAssetPolicy({layout, lock}) {
  const root = path.resolve(lock.hostCacheRoot, digest(`${layout.workspace}:${lock.runtimeHash}`), "asset-policy");
  if (root === layout.workspace || root.startsWith(layout.workspace + path.sep)) throw new Error("THREE_ASSET_POLICY_PATH_INVALID");
  await mkdir(root, {recursive: true, mode: 0o700});
  if (await realpath(root) !== root) throw new Error("THREE_ASSET_POLICY_PATH_INVALID");
  const bindingFile = path.join(root, "binding.json");
  let binding;
  try { binding = JSON.parse(await readFile(bindingFile, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!binding) {
    const inputs = path.join(layout.workspace, "inputs"), candidates = [];
    if (await realpath(inputs) !== inputs) throw new Error("THREE_ASSET_POLICY_CASE_INPUT_INVALID");
    async function visit(directory) {
      for (const entry of await readdir(directory, {withFileTypes: true})) {
        const file = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error("THREE_ASSET_POLICY_CASE_INPUT_INVALID");
        if (entry.isDirectory()) await visit(file);
        else if (entry.isFile() && entry.name.endsWith(".json")) {
          let input; try { input = JSON.parse(await readFile(file, "utf8")); } catch { continue; }
          if (input.kind === "three-creator-case-input") candidates.push(input);
        }
      }
    }
    await visit(inputs);
    if (candidates.length !== 1) throw new Error("THREE_ASSET_POLICY_CASE_INPUT_REQUIRED");
    const input = candidates[0];
    if (input.schemaVersion !== 1 || input.taskId !== layout.taskId || input.caseId !== layout.caseId || input.profile !== layout.profile || input.runtimeHash !== lock.runtimeHash) throw new Error("THREE_ASSET_POLICY_CASE_INPUT_IDENTITY");
    const fields = await policyFields(input, lock.toolkitRoot);
    await verifyInstalledPolicy(fields.assetPolicySnapshot, lock.toolkitRoot);
    const assetPolicySnapshotPath = path.join(root, `${fields.assetPolicySha256}.json`);
    try { await writeFile(assetPolicySnapshotPath, JSON.stringify(fields.assetPolicySnapshot), {flag: "wx", mode: 0o400}); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    binding = {taskId: layout.taskId, runtimeHash: lock.runtimeHash, assetPolicySnapshotPath, assetPolicySha256: fields.assetPolicySha256};
    await readPinnedAssetPolicy({...binding, workspace: layout.workspace, toolkitRoot: lock.toolkitRoot});
    try { await writeFile(bindingFile, JSON.stringify(binding), {flag: "wx", mode: 0o400}); }
    catch (error) { if (error.code !== "EEXIST") throw error; binding = JSON.parse(await readFile(bindingFile, "utf8")); }
  }
  if (await realpath(bindingFile) !== bindingFile || !(await lstat(bindingFile)).isFile() || binding.taskId !== layout.taskId || binding.runtimeHash !== lock.runtimeHash || binding.assetPolicySnapshotPath !== path.join(root, `${binding.assetPolicySha256}.json`)) throw new Error("THREE_ASSET_POLICY_BINDING_INVALID");
  await readPinnedAssetPolicy({...binding, workspace: layout.workspace, toolkitRoot: lock.toolkitRoot});
  return {assetPolicySnapshotPath: binding.assetPolicySnapshotPath, assetPolicySha256: binding.assetPolicySha256};
}

async function main() {
  const args = process.argv.slice(2);
  const doctorDraft = args.includes("--doctor-draft-lock");
  const lock = await readRuntimeLock(valueAfter(args, "--runtime-lock"), {requireReady: !doctorDraft});
  const profile = valueAfter(args, "--profile");
  if (!THREE_PROFILES.includes(profile)) throw new Error("THREE_PROFILE_INVALID");
  const workspace = path.resolve(valueAfter(args, "--workspace"));
  const hasPin = args.includes("--asset-policy-snapshot") || args.includes("--asset-policy-sha256");
  const policyArgs = [];
  if (hasPin) {
    const assetPolicySnapshotPath = valueAfter(args, "--asset-policy-snapshot"), assetPolicySha256 = valueAfter(args, "--asset-policy-sha256");
    await readPinnedAssetPolicy({assetPolicySnapshotPath, assetPolicySha256, workspace, toolkitRoot: lock.toolkitRoot});
    policyArgs.push("--asset-policy-snapshot", assetPolicySnapshotPath, "--asset-policy-sha256", assetPolicySha256);
  } else if (!doctorDraft) throw new Error("THREE_ASSET_POLICY_PIN_REQUIRED");
  const env = executionEnvironment(lock, workspace, {profile});
  env.TSX_DISABLE_CACHE = "1";
  env.TSX_TSCONFIG_PATH = path.join(lock.toolkitRoot, "tsconfig.json");
  await prepareSessionDirectories(env, lock);
  // A separate child is essential: Codex's MCP configuration may augment its
  // inherited environment. The actual WorldKit server receives only this map.
  // The tsx CLI cache produced logical pnpm module paths with an FSx TMPDIR.
  // Native --import plus disabled transform caching was verified against the
  // failing case workspace; the explicit workspace remains the tool authority.
  await mkdir(path.join(workspace, "outputs"), {recursive: true});
  const diagnostics = createWriteStream(path.join(workspace, "outputs/creator-mcp-stderr.log"), {flags: "a"});
  const child = spawn(lock.nodeBinary, ["--no-preserve-symlinks", "--no-preserve-symlinks-main", "--import", path.join(lock.toolkitRoot, "node_modules/tsx/dist/loader.mjs"), path.join(lock.toolkitRoot, "packages/creator-host/src/cli/mcp.ts"), "--workspace", workspace, "--profile", profile, ...policyArgs], {cwd: lock.toolkitRoot, env, stdio: ["inherit", "inherit", "pipe"]});
  child.stderr.pipe(diagnostics);
  child.stderr.pipe(process.stderr, {end: false});
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
  child.on("error", error => { diagnostics.end(`CREATOR_MCP_START_FAILED: ${error.message}\n`); process.stderr.write(`CREATOR_MCP_START_FAILED: ${error.message}\n`); process.exitCode = 1; });
  child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 128 : 1); });

}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
