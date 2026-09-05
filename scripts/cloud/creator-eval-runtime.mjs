import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const CODEX_BINARY_SHA256 = "f9d4eab23d0e0726340e084ed22d668885c1dcabeb29ec508b8962e5e29b8dc6";
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
export async function readRuntimeLock(file, {requireReady = true, checkInstalled = false} = {}) {
  const bytes = await readFile(file);
  const lock = JSON.parse(bytes);
  if (lock.schemaVersion !== 1 || (requireReady && lock.status !== "ready")) throw new Error("CREATOR_RUNTIME_LOCK_NOT_READY");
  for (const key of ["toolkitRoot", "browserRoot", "codexBinary"]) {
    if (typeof lock[key] !== "string" || !path.isAbsolute(lock[key]) || lock[key].includes("\0")) throw new Error(`CREATOR_RUNTIME_LOCK_PATH_INVALID: ${key}`);
  }
  if (lock.codexBinarySha256 !== CODEX_BINARY_SHA256) throw new Error("CREATOR_RUNTIME_CODEX_HASH_NOT_APPROVED");
  if (lock.nodeBinary !== undefined && (!path.isAbsolute(lock.nodeBinary) || lock.nodeBinary.includes("\0"))) throw new Error("CREATOR_NODE_BINARY_INVALID");
  for (const [key, value] of Object.entries(lock.browserEnvironment ?? {})) {
    if (!BROWSER_ENV_KEYS.has(key) || typeof value !== "string" || value.includes("\0")) throw new Error(`CREATOR_BROWSER_ENV_NOT_ADMITTED: ${key}`);
  }
  const maximumTaskSeconds = lock.maximumTaskSeconds ?? 2700;
  if (!Number.isSafeInteger(maximumTaskSeconds) || maximumTaskSeconds < 300 || maximumTaskSeconds > 7200) throw new Error("CREATOR_TASK_DEADLINE_INVALID");
  if (checkInstalled) {
    if (await fileSha256(lock.codexBinary) !== CODEX_BINARY_SHA256) throw new Error("CREATOR_CODEX_BINARY_HASH_MISMATCH");
    for (const relative of ["node_modules/tsx/dist/cli.mjs", "scripts/creator/mcp.ts"]) {
      if (!(await lstat(path.join(lock.toolkitRoot, relative))).isFile()) throw new Error(`CREATOR_TOOLKIT_FILE_MISSING: ${relative}`);
    }
    if (!(await lstat(lock.browserRoot)).isDirectory()) throw new Error("CREATOR_BROWSER_ROOT_MISSING");
  }
  return {...lock, nodeBinary: lock.nodeBinary ?? "/codex-tools/bin/node", maximumTaskSeconds, runtimeHash: `sha256:${sha256(bytes)}`, runtimeLockPath: path.resolve(file)};
}
export function valueAfter(argv, flag) {
  const indexes = argv.flatMap((value, index) => value === flag ? [index] : []);
  if (indexes.length !== 1 || !argv[indexes[0] + 1]) throw new Error(`CREATOR_LAUNCH_ARGUMENT_INVALID: ${flag}`);
  return argv[indexes[0] + 1];
}
export async function parseCloudLayout(argv) {
  if (argv[0] !== "exec" || typeof argv.at(-1) !== "string" || argv.at(-1).startsWith("--")) throw new Error("CREATOR_EXPECTED_CODEX_EXEC");
  const workspace = await realpath(valueAfter(argv, "-C"));
  const lastMessage = path.resolve(valueAfter(argv, "--output-last-message"));
  const outputs = await realpath(path.dirname(lastMessage));
  if (outputs !== path.join(workspace, "outputs")) throw new Error("CREATOR_OUTPUT_ROOT_NOT_TASK_OUTPUTS");
  const addDirs = argv.flatMap((value, index) => value === "--add-dir" ? [argv[index + 1]] : []);
  const resolvedAddDirs = await Promise.all(addDirs.map(directory => realpath(directory)));
  if (!resolvedAddDirs.includes(outputs)) throw new Error("CREATOR_OUTPUT_ROOT_NOT_DECLARED");
  if (valueAfter(argv, "--model") !== "gpt-6-astra" || valueAfter(argv, "--sandbox") !== "workspace-write") throw new Error("CREATOR_MODEL_OR_SANDBOX_MISMATCH");
  const configurations = argv.flatMap((value, index) => ["-c", "--config"].includes(value) ? [argv[index + 1]] : []);
  if (configurations.filter(value => value === 'model_reasoning_effort="xhigh"').length !== 1 || configurations.some(value => value !== 'model_reasoning_effort="xhigh"' && value !== "notify=[]")) throw new Error("CREATOR_REQUIRES_EXACT_XHIGH_CONFIGURATION");
  if (argv.some(value => ["--cd", "-m", "-s", "--config-profile", "--profile", "--dangerously-bypass-approvals-and-sandbox"].includes(value))) throw new Error("CREATOR_CONFLICTING_LAUNCH_OVERRIDE");
  return {workspace, outputs, lastMessage, caseId: path.basename(workspace)};
}
export function executionEnvironment(lock, workspace, {includeAuthentication = false, inherited = process.env} = {}) {
  const session = path.join(workspace, ".creator-session");
  const env = {
    PATH: [path.dirname(lock.nodeBinary), path.dirname(lock.codexBinary), path.join(path.dirname(path.dirname(lock.codexBinary)), "codex-path"), "/usr/bin", "/bin"].join(":"),
    HOME: path.join(session, "home"), TMPDIR: path.join(session, "tmp"),
    LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TERM: "dumb", NO_COLOR: "1", WORLDKIT_CREATOR_RUNTIME_HASH: lock.runtimeHash,
    ...lock.browserEnvironment,
  };
  if (includeAuthentication) {
    if (!inherited.CODEX_HOME) throw new Error("CREATOR_PLATFORM_AUTH_HOME_MISSING");
    env.CODEX_HOME = inherited.CODEX_HOME;
  }
  return env;
}
export async function prepareSessionDirectories(env) {
  await mkdir(env.HOME, {recursive: true}); await mkdir(env.TMPDIR, {recursive: true});
}

export async function resolveCreatorSubmission({existingJobId, hasDurableIntent, mode, findExisting, createIntentAndSubmit}) {
  if (!["run", "resume"].includes(mode)) throw new Error("CREATOR_SUBMISSION_MODE_INVALID");
  if (existingJobId) return existingJobId;
  if (!hasDurableIntent && mode === "resume") return null;
  const jobId = hasDurableIntent ? await findExisting() : await createIntentAndSubmit();
  if (typeof jobId !== "string" || !/^gen_[a-f0-9]+$/.test(jobId)) throw new Error("CREATOR_JOB_ID_UNRESOLVED");
  return jobId;
}
