import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, realpath, rename, writeFile, readdir, readlink, symlink } from "node:fs/promises";
import path from "node:path";

export const CODEX_BINARY_SHA256 = "f9d4eab23d0e0726340e084ed22d668885c1dcabeb29ec508b8962e5e29b8dc6";
export const THREE_PROFILES = ["three-raw", "three-sdk"];
export const THREE_ENGINE = "three@0.185.1";
export const THREE_TOOL_VERSION = "0.2.0-experimental";
export const THREE_TOOLS = ["creator_describe_environment", "creator_get_authoring_schema", "creator_get_examples", "creator_materialize_runtime", "assets_search", "assets_describe", "world_validate", "world_preview", "world_inspect", "world_execute_command", "world_get_operation", "world_playtest", "world_capture_triviews", "world_submit", "operations_get", "operations_cancel"];
export const RUNTIME_LOCK_KEYS = new Set(["kind", "schemaVersion", "status", "engine", "profiles", "sourceCommit", "createdAt", "launcherPath", "launcherFilesSha256", "toolkitRoot", "nodeBinary", "toolkitContentSha256", "toolkitArchiveSha256", "toolkitSourceHash", "browserRoot", "browserContentSha256", "browserArchiveSha256", "browserRevision", "codexBinary", "codexBinarySha256", "maximumTaskSeconds", "browserEnvironment", "prebuiltRuntimes", "hostCacheRoot", "note", "changeReason", "previousRuntimeLockHash", "reasoningEffort"]);
export const BROWSER_ENV_KEYS = new Set(["PLAYWRIGHT_BROWSERS_PATH", "WORLDKIT_CHROMIUM_EXECUTABLE", "LD_LIBRARY_PATH", "FONTCONFIG_PATH", "FONTCONFIG_FILE", "LANG"]);
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export async function fileSha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export async function writeJson(file, value) {
  await mkdir(path.dirname(file), {recursive: true});
  const temporary = `${file}.${process.pid}.part`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n");
  await rename(temporary, file);
}
export async function verifyInstalledClosure(root, entries, manifestName) {
  if (await realpath(root) !== root || !Array.isArray(entries) || entries.length < 1 || entries.length > 30000) throw new Error("THREE_INSTALLED_CLOSURE_INVALID");
  const expected = new Set([manifestName]);
  for (const entry of entries) {
    if (typeof entry.path !== "string" || path.isAbsolute(entry.path) || entry.path.includes("\\") || entry.path.split("/").some(part => ["", ".", ".."].includes(part)) || expected.has(entry.path)) throw new Error("THREE_INSTALLED_ENTRY_INVALID");
    expected.add(entry.path);
  }
  let index = 0;
  await Promise.all(Array.from({length: Math.min(8, entries.length)}, async () => {
    while (index < entries.length) {
      const entry = entries[index++], file = path.join(root, entry.path), info = await lstat(file);
      if (!(await realpath(file)).startsWith(`${root}/`)) throw new Error(`THREE_INSTALLED_PATH_ESCAPE: ${entry.path}`);
      if (entry.kind === "symlink") {
        if (!info.isSymbolicLink() || path.isAbsolute(entry.target) || await readlink(file) !== entry.target) throw new Error(`THREE_INSTALLED_SYMLINK_CHANGED: ${entry.path}`);
      } else {
        const digest = (entry.sha256 ?? entry.contentSha256 ?? "").replace(/^sha256:/, ""), bytes = entry.bytes ?? entry.sizeBytes;
        if (!/^[a-f0-9]{64}$/.test(digest) || !info.isFile() || info.isSymbolicLink() || info.size !== bytes || await fileSha256(file) !== digest || (entry.mode !== undefined && (info.mode & 0o777) !== entry.mode)) throw new Error(`THREE_INSTALLED_FILE_CHANGED: ${entry.path}`);
      }
    }
  }));
  async function walk(directory) {
    for (const entry of await readdir(directory, {withFileTypes:true})) {
      const file = path.join(directory,entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (!expected.has(path.relative(root,file).split(path.sep).join('/'))) throw new Error(`THREE_INSTALLED_EXTRA_FILE: ${path.relative(root,file)}`);
    }
  }
  await walk(root);
}
export async function readRuntimeLock(file, {requireReady = true, checkInstalled = false} = {}) {
  const bytes = await readFile(file);
  const lock = JSON.parse(bytes);
  for (const key of Object.keys(lock)) if (!RUNTIME_LOCK_KEYS.has(key)) throw new Error(`THREE_RUNTIME_UNKNOWN_FIELD: ${key}`);
  const reasoningEffort = lock.reasoningEffort ?? "xhigh";
  if (!["xhigh", "ultra"].includes(reasoningEffort)) throw new Error("THREE_RUNTIME_REASONING_EFFORT_INVALID");
  if (lock.kind !== "three-creator-runtime-lock" || lock.engine !== THREE_ENGINE || JSON.stringify(lock.profiles) !== JSON.stringify(THREE_PROFILES) || lock.schemaVersion !== 1 || (requireReady && lock.status !== "ready")) throw new Error("CREATOR_RUNTIME_LOCK_NOT_READY");
  for (const key of ["toolkitRoot", "browserRoot", "codexBinary"]) {
    if (typeof lock[key] !== "string" || !path.isAbsolute(lock[key]) || lock[key].includes("\0")) throw new Error(`CREATOR_RUNTIME_LOCK_PATH_INVALID: ${key}`);
  }
  if (lock.hostCacheRoot !== path.join(path.dirname(path.dirname(lock.toolkitRoot)), "host-cache")) throw new Error("THREE_HOST_CACHE_ROOT_INVALID");
  if (lock.codexBinarySha256 !== CODEX_BINARY_SHA256) throw new Error("CREATOR_RUNTIME_CODEX_HASH_NOT_APPROVED");
  if (lock.nodeBinary !== undefined && (!path.isAbsolute(lock.nodeBinary) || lock.nodeBinary.includes("\0"))) throw new Error("CREATOR_NODE_BINARY_INVALID");
  for (const [key, value] of Object.entries(lock.browserEnvironment ?? {})) {
    if (!BROWSER_ENV_KEYS.has(key) || typeof value !== "string" || value.includes("\0")) throw new Error(`CREATOR_BROWSER_ENV_NOT_ADMITTED: ${key}`);
  }
  const maximumTaskSeconds = lock.maximumTaskSeconds ?? 2700;
  if (!Number.isSafeInteger(maximumTaskSeconds) || maximumTaskSeconds < 300 || maximumTaskSeconds > 7200) throw new Error("CREATOR_TASK_DEADLINE_INVALID");
  for (const key of ["toolkitArchiveSha256", "toolkitSourceHash", "toolkitContentSha256", "browserArchiveSha256", "browserContentSha256"]) if (!/^[a-f0-9]{64}$/.test(lock[key] ?? "")) throw new Error(`THREE_RUNTIME_HASH_INVALID: ${key}`);
  if (!/^\/fsx\/pipeline\/worldkit-three-creator-experiments\/.+\/three-eval-launcher\.mjs$/.test(lock.launcherPath ?? "")) throw new Error("THREE_RUNTIME_LAUNCHER_PATH_INVALID");
  const expectedLauncherFiles = ["three-eval-launcher.mjs", "three-eval-runtime.mjs", "three-eval-mcp-bridge.mjs", "three-eval-statistics.mjs"];
  if (Object.keys(lock.launcherFilesSha256 ?? {}).sort().join() !== [...expectedLauncherFiles].sort().join() || expectedLauncherFiles.some(name => !/^[a-f0-9]{64}$/.test(lock.launcherFilesSha256[name]))) throw new Error("THREE_LAUNCHER_CLOSURE_INVALID");
  if (Object.keys(lock.prebuiltRuntimes ?? {}).sort().join() !== [...THREE_PROFILES].sort().join()) throw new Error("THREE_PREBUILT_PROFILES_INVALID");
  for (const profile of THREE_PROFILES) {
    const prebuilt = lock.prebuiltRuntimes[profile];
    if (typeof prebuilt.root !== "string" || !path.isAbsolute(prebuilt.root) || !prebuilt.root.startsWith(`${path.dirname(lock.toolkitRoot)}/prebuilt/`) ||
      !/^[a-f0-9]{64}$/.test(prebuilt.manifestSha256 ?? "") || !/^[a-f0-9]{64}$/.test(prebuilt.runtimeHash ?? "")) throw new Error(`THREE_PREBUILT_LOCK_INVALID: ${profile}`);
  }
  if (lock.status === "ready" && [lock.toolkitArchiveSha256,lock.toolkitSourceHash,lock.toolkitContentSha256,lock.browserArchiveSha256,lock.browserContentSha256,...THREE_PROFILES.flatMap(profile=>[lock.prebuiltRuntimes[profile].manifestSha256,lock.prebuiltRuntimes[profile].runtimeHash])].some(value=>value === "0".repeat(64))) throw new Error("THREE_READY_RUNTIME_HAS_UNBUILT_PLACEHOLDERS");
  if (checkInstalled) {
    for (const name of expectedLauncherFiles) if (await fileSha256(path.join(path.dirname(file), name)) !== lock.launcherFilesSha256[name]) throw new Error(`THREE_LAUNCHER_HASH_MISMATCH: ${name}`);
    if (await fileSha256(lock.codexBinary) !== CODEX_BINARY_SHA256) throw new Error("CREATOR_CODEX_BINARY_HASH_MISMATCH");
    for (const relative of ["node_modules/tsx/dist/loader.mjs", "scripts/three-creator/mcp.ts"]) {
      if (!(await lstat(path.join(lock.toolkitRoot, relative))).isFile()) throw new Error(`CREATOR_TOOLKIT_FILE_MISSING: ${relative}`);
    }
    if (!(await lstat(lock.browserRoot)).isDirectory()) throw new Error("CREATOR_BROWSER_ROOT_MISSING");
    const toolkitCapsuleRoot = path.dirname(lock.toolkitRoot), toolkitManifestPath = path.join(toolkitCapsuleRoot, "content-manifest.json");
    if (await fileSha256(toolkitManifestPath) !== lock.toolkitContentSha256) throw new Error("THREE_TOOLKIT_MANIFEST_CHANGED");
    const toolkitManifest = JSON.parse(await readFile(toolkitManifestPath, "utf8"));
    if (toolkitManifest.kind !== "worldkit-three-creator-capsule" || toolkitManifest.sourceHash !== `sha256:${lock.toolkitSourceHash}` ||
      path.join(toolkitCapsuleRoot, toolkitManifest.toolkitRoot) !== lock.toolkitRoot || path.join(toolkitCapsuleRoot, toolkitManifest.nodeBinary) !== lock.nodeBinary) throw new Error("THREE_TOOLKIT_IDENTITY_MISMATCH");
    const browserManifestPath = path.join(lock.browserRoot, "manifest.json");
    if (await fileSha256(browserManifestPath) !== lock.browserContentSha256) throw new Error("THREE_BROWSER_MANIFEST_CHANGED");
    const browserManifest = JSON.parse(await readFile(browserManifestPath, "utf8"));
    if (browserManifest.kind !== "worldkit-creator-browser-capsule" || String(browserManifest.browserRevision) !== "1234") throw new Error("THREE_BROWSER_IDENTITY_MISMATCH");
    await verifyInstalledClosure(toolkitCapsuleRoot, toolkitManifest.entries, "content-manifest.json");
    await verifyInstalledClosure(lock.browserRoot, browserManifest.files, "manifest.json");
    for (const profile of THREE_PROFILES) if (await fileSha256(path.join(lock.prebuiltRuntimes[profile].root, "runtime-manifest.json")) !== lock.prebuiltRuntimes[profile].manifestSha256) throw new Error(`THREE_PREBUILT_MANIFEST_HASH_MISMATCH: ${profile}`);
  }
  return {...lock, reasoningEffort, nodeBinary: lock.nodeBinary ?? "/codex-tools/bin/node", maximumTaskSeconds, runtimeHash: sha256(bytes), runtimeLockPath: path.resolve(file)};
}
export function valueAfter(argv, flag) {
  const indexes = argv.flatMap((value, index) => value === flag ? [index] : []);
  if (indexes.length !== 1 || !argv[indexes[0] + 1]) throw new Error(`CREATOR_LAUNCH_ARGUMENT_INVALID: ${flag}`);
  return argv[indexes[0] + 1];
}
export async function parseCloudLayout(argv) {
  if (argv[0] !== "exec" || typeof argv.at(-1) !== "string" || argv.at(-1).startsWith("--")) throw new Error("CREATOR_EXPECTED_CODEX_EXEC");
  const switches = new Set(["--skip-git-repo-check", "--ephemeral"]);
  const valued = new Set(["-C", "--output-last-message", "--add-dir", "--model", "--sandbox", "-c", "--image"]);
  for (let index = 1; index < argv.length - 1; index++) {
    const token = argv[index];
    if (switches.has(token)) { if (argv.indexOf(token) !== index) throw new Error("THREE_DUPLICATE_SWITCH"); continue; }
    if (!valued.has(token) || ++index >= argv.length - 1 || typeof argv[index] !== "string") throw new Error(`THREE_UNEXPECTED_PROVIDER_ARGUMENT: ${token}`);
  }
  const workspace = await realpath(valueAfter(argv, "-C"));
  const lastMessage = path.resolve(valueAfter(argv, "--output-last-message"));
  const outputs = await realpath(path.dirname(lastMessage));
  if (outputs !== path.join(workspace, "outputs")) throw new Error("CREATOR_OUTPUT_ROOT_NOT_TASK_OUTPUTS");
  const addDirs = argv.flatMap((value, index) => value === "--add-dir" ? [argv[index + 1]] : []);
  const resolvedAddDirs = await Promise.all(addDirs.map(directory => realpath(directory)));
  if (!resolvedAddDirs.includes(outputs)) throw new Error("CREATOR_OUTPUT_ROOT_NOT_DECLARED");
  if (new Set(resolvedAddDirs).size !== resolvedAddDirs.length || resolvedAddDirs.some(dir => dir !== outputs && dir !== path.join(workspace, "inputs"))) throw new Error("THREE_ADD_DIR_OUTSIDE_TASK");
  for (const imagePath of argv.flatMap((value,index) => value === "--image" ? [argv[index + 1]] : [])) {
    const image = await realpath(imagePath);
    if (!image.startsWith(`${path.join(workspace, "inputs")}/`) || !(await lstat(image)).isFile()) throw new Error("THREE_IMAGE_OUTSIDE_INPUTS");
  }
  if (valueAfter(argv, "--model") !== "gpt-6-astra" || valueAfter(argv, "--sandbox") !== "workspace-write") throw new Error("CREATOR_MODEL_OR_SANDBOX_MISMATCH");
  const configurations = argv.flatMap((value, index) => ["-c", "--config"].includes(value) ? [argv[index + 1]] : []);
  const admittedEfforts = new Map([['model_reasoning_effort="xhigh"', 'xhigh'], ['model_reasoning_effort="ultra"', 'ultra']]);
  const selectedEfforts = configurations.filter(value => admittedEfforts.has(value));
  if (selectedEfforts.length !== 1 || configurations.some(value => !admittedEfforts.has(value) && value !== "notify=[]")) throw new Error("CREATOR_REQUIRES_EXACT_REASONING_CONFIGURATION");
  const reasoningEffort = admittedEfforts.get(selectedEfforts[0]);
  if (argv.some(value => ["--cd", "-m", "-s", "--config-profile", "--profile", "--dangerously-bypass-approvals-and-sandbox"].includes(value))) throw new Error("CREATOR_CONFLICTING_LAUNCH_OVERRIDE");
  const taskId = path.basename(workspace);
  const profile = THREE_PROFILES.find(value => taskId.endsWith(`--${value}`));
  if (!profile) throw new Error("THREE_TASK_PROFILE_MISSING");
  const caseId = taskId.slice(0, -(profile.length + 2));
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(caseId)) throw new Error("THREE_TASK_CASE_INVALID");
  return {workspace, outputs, lastMessage, caseId, taskId, profile, reasoningEffort};
}
export function executionEnvironment(lock, workspace, {includeAuthentication = false, inherited = process.env, profile} = {}) {
  if (!THREE_PROFILES.includes(profile)) throw new Error("THREE_EXECUTION_PROFILE_REQUIRED");
  const session = path.join(workspace, ".creator-session");
  const env = {
    PATH: [path.dirname(lock.nodeBinary), path.dirname(lock.codexBinary), path.join(path.dirname(path.dirname(lock.codexBinary)), "codex-path"), "/usr/bin", "/bin"].join(":"),
    HOME: path.join(session, "home"), TMPDIR: path.join(session, "tmp"),
    LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TERM: "dumb", NO_COLOR: "1", WORLDKIT_CREATOR_RUNTIME_HASH: lock.runtimeHash,
    WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT: lock.prebuiltRuntimes[profile].root,
    WORLDKIT_THREE_PREBUILT_RUNTIME_MANIFEST_SHA256: lock.prebuiltRuntimes[profile].manifestSha256,
    ...lock.browserEnvironment,
    // Playwright writes validation markers to its registry. Keep those outside
    // both immutable capsule files and the model-writable author workspace.
    PLAYWRIGHT_BROWSERS_PATH: path.join(lock.hostCacheRoot, sha256(workspace), "browser-registry"),
  };
  if (includeAuthentication) {
    if (!inherited.CODEX_HOME) throw new Error("CREATOR_PLATFORM_AUTH_HOME_MISSING");
    env.CODEX_HOME = inherited.CODEX_HOME;
  }
  return env;
}
export async function prepareBrowserRegistry(browserRoot, registryRoot) {
  await mkdir(registryRoot, {recursive:true,mode:0o700});
  if (await realpath(registryRoot) !== registryRoot) throw new Error("THREE_BROWSER_REGISTRY_REDIRECTED");
  const products = (await readdir(path.join(browserRoot, "browsers"), {withFileTypes:true})).filter(entry => entry.isDirectory() && /^(chromium|chromium_headless_shell)-1234$/.test(entry.name));
  if (!products.length) throw new Error("THREE_BROWSER_REGISTRY_EMPTY");
  for (const product of products) {
    const source = path.join(browserRoot, "browsers", product.name), target = path.join(registryRoot, product.name);
    await mkdir(target,{recursive:true,mode:0o700});
    if (await realpath(target) !== target) throw new Error("THREE_BROWSER_REGISTRY_REDIRECTED");
    for (const entry of await readdir(source,{withFileTypes:true})) {
      if (entry.name === "DEPENDENCIES_VALIDATED") continue;
      const from = path.join(source,entry.name), to = path.join(target,entry.name);
      try { await symlink(from,to,entry.isDirectory()?"dir":"file"); }
      catch(error) { if(error.code!=="EEXIST")throw error; }
      if (!(await lstat(to)).isSymbolicLink() || await readlink(to)!==from || await realpath(to)!==await realpath(from)) throw new Error("THREE_BROWSER_REGISTRY_ENTRY_CHANGED");
    }
  }
}
export async function prepareSessionDirectories(env, lock) {
  await mkdir(env.HOME, {recursive: true}); await mkdir(env.TMPDIR, {recursive: true});
  await prepareBrowserRegistry(lock.browserRoot, env.PLAYWRIGHT_BROWSERS_PATH);
}

export async function resolveCreatorSubmission({existingJobId, hasDurableIntent, mode, findExisting, createIntentAndSubmit, replayIntentAndSubmit, wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))}) {
  if (!["run", "resume"].includes(mode)) throw new Error("CREATOR_SUBMISSION_MODE_INVALID");
  if (existingJobId) return existingJobId;
  if (!hasDurableIntent && mode === "resume") return null;
  let jobId;
  if (!hasDurableIntent) jobId=await createIntentAndSubmit();
  else {
    for(let attempt=0;attempt<3;attempt++) {
      try {jobId=await findExisting();break;}
      catch(error) {
        // Only repeated explicit absence can replay the identical persisted
        // idempotency key/payload. Transport uncertainty never creates a job.
        if(error.status!==404||!replayIntentAndSubmit)throw error;
        if(attempt===2)jobId=await replayIntentAndSubmit();
        else await wait(1000*(attempt+1));
      }
    }
  }
  if (typeof jobId !== "string" || !/^gen_[a-f0-9]+$/.test(jobId)) throw new Error("CREATOR_JOB_ID_UNRESOLVED");
  return jobId;
}
