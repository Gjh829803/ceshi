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

  const result = spawnSync(process.execPath, [localRunnerPath, ...baseArguments(root, outputPath)], {
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
  const result = spawnSync(process.execPath, [localRunnerPath, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, WORLDKIT_LOCAL_CODEX_BIN: fakeCodexPath },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /omitted a non-empty declared output: artifacts\/second\.txt/);
  assert.equal(await readFile(firstDestination, "utf8"), "previous-result\n");
  await assert.rejects(readFile(secondDestination, "utf8"), /ENOENT/);
});
