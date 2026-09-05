import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const routerPath = path.join(repositoryRoot, "scripts", "agents", "run-codex-task.mjs");
const localRunnerPath = path.join(repositoryRoot, "scripts", "agents", "run-local-codex-task.mjs");

function baseArguments(root, outputPath) {
  return [
    "--repo-root", root,
    "--task-id", "local-codex-test",
    "--stage", "planner",
    "--instruction-file", path.join(root, "instruction.txt"),
    "--context", "context",
    "--asset", `reference::${path.join(root, "reference.png")}::image::image/png`,
    "--output", `artifacts/result.txt::${outputPath}::text/plain`,
    "--execution-profile", "formal",
  ];
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "worldkit-local-codex-"));
  await mkdir(path.join(root, "context"), { recursive: true });
  await writeFile(path.join(root, "context", "guide.txt"), "selected context\n");
  await writeFile(path.join(root, "instruction.txt"), "write the declared result\n");
  await writeFile(path.join(root, "reference.png"), Buffer.from("fake-image"));
  return root;
}

test("routes an explicitly selected local backend without touching LWDP", async () => {
  const root = await createFixture();
  const outputPath = path.join(root, "delivered", "result.txt");
  const result = spawnSync(process.execPath, [routerPath, "--backend", "local", ...baseArguments(root, outputPath)], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, WORLDKIT_LOCAL_CODEX_SMOKE: "1" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^WORLDKIT_CODEX_BACKEND local/m);
  assert.match(
    result.stdout,
    /WORLDKIT_LOCAL_CODEX_SMOKE local-codex-test profile=formal model=gpt-5\.6-sol reasoning=xhigh contexts=1 assets=1 outputs=1/,
  );
  const taskRoots = await readdir(path.join(root, ".codex-tmp", "local-codex")).catch(() => []);
  assert.deepEqual(taskRoots, []);
});

test("runs local Codex in an isolated workspace and atomically promotes declared outputs", async () => {
  const root = await createFixture();
  const outputPath = path.join(root, "delivered", "result.txt");
  const fakeCodexPath = path.join(root, "fake-codex.mjs");
  await writeFile(fakeCodexPath, `#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
if (args.includes("--version")) { console.log("fake-codex 1"); process.exit(0); }
const valueAfter = (flag) => args[args.indexOf(flag) + 1];
const cwd = valueAfter("--cd");
const prompt = readFileSync(0, "utf8");
const imagePath = valueAfter("--image");
if (!existsSync(path.join(cwd, "context", "guide.txt"))) process.exit(11);
if (!imagePath || !existsSync(imagePath)) process.exit(12);
if (process.env.LWDP_GENERATION_API_TOKEN || process.env.GOOGLE_APPLICATION_CREDENTIALS) process.exit(13);
if (!prompt.includes("write the declared result") || !prompt.includes("artifacts/result.txt")) process.exit(14);
mkdirSync(path.join(cwd, "artifacts"), { recursive: true });
writeFileSync(path.join(cwd, "artifacts", "result.txt"), JSON.stringify({
  model: valueAfter("--model"),
  sandbox: valueAfter("--sandbox"),
  ephemeral: args.includes("--ephemeral"),
  ignoredUserConfig: args.includes("--ignore-user-config"),
  reasoning: args.find((value) => value.startsWith("model_reasoning_effort=")),
}) + "\\n");
writeFileSync(valueAfter("--output-last-message"), "done\\n");
console.log("fake local codex completed");
`);
  await chmod(fakeCodexPath, 0o755);

  const result = spawnSync(process.execPath, [localRunnerPath, ...baseArguments(root, outputPath),
    "--failure-evidence-root", path.join(root, "failure-evidence")], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      WORLDKIT_LOCAL_CODEX_BIN: fakeCodexPath,
      LWDP_GENERATION_API_TOKEN: "must-not-reach-local-codex",
      GOOGLE_APPLICATION_CREDENTIALS: "/must/not/reach/local-codex.json",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /WORLDKIT_LOCAL_CODEX_JOB planner local-codex-test pid=[0-9]+ profile=formal model=gpt-5\.6-sol reasoning=xhigh/,
  );
  assert.match(result.stdout, /WORLDKIT_LOCAL_CODEX_TASK_READY local-codex-test/);
  await assert.rejects(readFile(path.join(root, "failure-evidence/report.json")), /ENOENT/);
  const delivered = JSON.parse(await readFile(outputPath, "utf8"));
  assert.deepEqual(delivered, {
    model: "gpt-5.6-sol",
    sandbox: "workspace-write",
    ephemeral: true,
    ignoredUserConfig: true,
    reasoning: "model_reasoning_effort=\"xhigh\"",
  });
  const taskRoots = await readdir(path.join(root, ".codex-tmp", "local-codex")).catch(() => []);
  assert.deepEqual(taskRoots, []);
});

test("mounts a task workspace context root at the isolated workspace root", async () => {
  const root = await createFixture();
  const taskWorkspace = path.join(root, "attempts", "2", ".task");
  await mkdir(path.join(taskWorkspace, "context"), { recursive: true });
  await mkdir(path.join(taskWorkspace, "inputs"), { recursive: true });
  await writeFile(path.join(taskWorkspace, "context", "case.json"), "{}\n");
  await writeFile(path.join(taskWorkspace, "inputs", "profile.json"), "{}\n");
  const outputPath = path.join(root, "delivered", "result.txt");
  const fakeCodexPath = path.join(root, "fake-context-root-codex.mjs");
  await writeFile(fakeCodexPath, `#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
if (args.includes("--version")) process.exit(0);
const cwd = args[args.indexOf("--cd") + 1];
process.stdin.resume();
process.stdin.on("end", () => {
  if (!existsSync(path.join(cwd, "context", "case.json"))) process.exit(21);
  if (!existsSync(path.join(cwd, "inputs", "profile.json"))) process.exit(22);
  writeFileSync(path.join(cwd, "result.txt"), "mounted\\n");
  writeFileSync(args[args.indexOf("--output-last-message") + 1], "done\\n");
});
`);
  await chmod(fakeCodexPath, 0o755);
  const args = baseArguments(root, outputPath);
  const contextIndex = args.indexOf("--context");
  args.splice(
    contextIndex,
    2,
    "--workspace-context-root",
    path.relative(root, taskWorkspace),
  );
  const outputIndex = args.indexOf("--output") + 1;
  args[outputIndex] = `result.txt::${outputPath}::text/plain`;
  const result = spawnSync(process.execPath, [localRunnerPath, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, WORLDKIT_LOCAL_CODEX_BIN: fakeCodexPath },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(outputPath, "utf8"), "mounted\n");
});

test("validates every declared output before promoting any local result", async () => {
  const root = await createFixture();
  const firstDestination = path.join(root, "delivered", "first.txt");
  const secondDestination = path.join(root, "delivered", "second.txt");
  await mkdir(path.dirname(firstDestination), { recursive: true });
  await writeFile(firstDestination, "previous-result\n");
  const fakeCodexPath = path.join(root, "fake-partial-codex.mjs");
  await writeFile(fakeCodexPath, `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
if (args.includes("--version")) process.exit(0);
const cwd = args[args.indexOf("--cd") + 1];
process.stdin.resume();
process.stdin.on("end", () => {
  mkdirSync(path.join(cwd, "artifacts"), { recursive: true });
  writeFileSync(path.join(cwd, "artifacts", "first.txt"), "new-result\\n");
  writeFileSync(args[args.indexOf("--output-last-message") + 1], "done\\n");
});
`);
  await chmod(fakeCodexPath, 0o755);
  const args = baseArguments(root, firstDestination);
  const firstOutputIndex = args.indexOf("--output") + 1;
  args[firstOutputIndex] = `artifacts/first.txt::${firstDestination}::text/plain`;
  args.push("--output", `artifacts/second.txt::${secondDestination}::text/plain`);
  const evidenceRoot = path.join(root, "failure-evidence");
  args.push("--failure-evidence-root", evidenceRoot);
  const result = spawnSync(process.execPath, [localRunnerPath, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, WORLDKIT_LOCAL_CODEX_BIN: fakeCodexPath },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /omitted a non-empty declared output: artifacts\/second\.txt/);
  assert.equal(await readFile(firstDestination, "utf8"), "previous-result\n");
  await assert.rejects(readFile(secondDestination, "utf8"), /ENOENT/);
  const evidence = JSON.parse(await readFile(path.join(evidenceRoot, "report.json"), "utf8"));
  assert.equal(evidence.requestId, "local-codex-test");
  assert.equal(evidence.outcome, "task-rejected");
  assert.deepEqual(evidence.outputs.map(({ path, status }) => ({ path, status })), [
    { path: "artifacts/first.txt", status: "present" },
    { path: "artifacts/second.txt", status: "missing" },
  ]);
  assert.equal(await readFile(path.join(evidenceRoot, "outputs/artifacts/first.txt"), "utf8"), "new-result\n");
  assert.equal(evidence.finalMessage, "done\n");
  assert.deepEqual(await readdir(path.join(root, ".codex-tmp/local-codex")), []);
});

test("emits one request-bound machine-readable timeout outcome from the real local adapter", async () => {
  const root = await createFixture();
  const outputPath = path.join(root, "delivered", "result.txt");
  const fakeCodexPath = path.join(root, "fake-hanging-codex.mjs");
  await writeFile(fakeCodexPath, `#!/usr/bin/env node
if (process.argv.includes("--version")) process.exit(0);
process.stdin.resume();
setInterval(() => undefined, 1000);
`);
  await chmod(fakeCodexPath, 0o755);
  const result = spawnSync(process.execPath, [
    localRunnerPath,
    ...baseArguments(root, outputPath),
    "--request-id", "local-codex-timeout-request",
    "--timeout-seconds", "1",
    "--failure-evidence-root", path.join(root, "failure-evidence"),
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 5_000,
    env: { ...process.env, WORLDKIT_LOCAL_CODEX_BIN: fakeCodexPath },
  });
  assert.notEqual(result.status, 0);
  const prefix = "WORLDKIT_CODEX_TASK_OUTCOME ";
  const rows = result.stdout.split(/\r?\n/).filter((line) => line.startsWith(prefix));
  assert.equal(rows.length, 1);
  assert.deepEqual(JSON.parse(rows[0].slice(prefix.length)), {
    kind: "worldkit-codex-task-outcome",
    schemaVersion: 1,
    requestId: "local-codex-timeout-request",
    outcome: "task-timeout",
  });
  const evidence = JSON.parse(await readFile(path.join(root, "failure-evidence/report.json"), "utf8"));
  assert.equal(evidence.outcome, "task-timeout");
  assert.equal(evidence.requestId, "local-codex-timeout-request");
  assert.equal(evidence.outputs[0].status, "missing");
});

test("retains failed-task feedback without promoting output or changing the rejected outcome", async () => {
  const root = await createFixture();
  const outputPath = path.join(root, "delivered/result.txt");
  const fake = path.join(root, "fake-rejected.mjs");
  await writeFile(fake, `#!/usr/bin/env node
import {mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
if (args.includes("--version")) process.exit(0);
const root = args[args.indexOf("--cd") + 1];
process.stdin.resume();
process.stdin.on("end", () => {
  mkdirSync(path.join(root, "artifacts"), { recursive: true });
  writeFileSync(path.join(root, "artifacts/result.txt"), "unadmitted");
  writeFileSync(args[args.indexOf("--output-last-message") + 1], "TS18048 x is possibly undefined");
  console.error('apiKey="private-value"');
  process.exit(7);
});
`);
  await chmod(fake, 0o755);
  const result = spawnSync(process.execPath, [localRunnerPath, ...baseArguments(root, outputPath),
    "--failure-evidence-root", path.join(root, "failure-evidence")], {
    cwd: repositoryRoot, encoding: "utf8", env: { ...process.env, WORLDKIT_LOCAL_CODEX_BIN: fake },
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /WORLDKIT_LOCAL_CODEX_TASK_READY/);
  const bytes = await readFile(path.join(root, "failure-evidence/report.json"), "utf8");
  const report = JSON.parse(bytes);
  assert.equal(report.childExitCode, 7);
  assert.equal(report.outcome, "task-rejected");
  assert.match(report.finalMessage, /TS18048/);
  assert.doesNotMatch(bytes, /private-value/);
  await assert.rejects(readFile(outputPath), /ENOENT/);
  assert.deepEqual(await readdir(path.join(root, ".codex-tmp/local-codex")), []);
});
