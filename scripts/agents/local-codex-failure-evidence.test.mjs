import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, open, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectLocalOutput, redactLocalTaskFeedback, retainLocalTaskFailure } from "./local-codex-failure-evidence.mjs";

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "worldkit-local-failure-")));
  const stagingRoot = path.join(root, "workspace");
  await mkdir(stagingRoot);
  return { root, stagingRoot, evidenceRoot: path.join(root, "evidence"),
    requestId: "native-failure-request", taskId: "native-failure-task", outcome: "task-rejected",
    childExitCode: 0, stderrTail: "", outputs: [] };
}

test("quarantines partial Native source when advisory PNGs are missing without granting admission", async () => {
  const input = await fixture();
  input.outputs = ["scene.ts", "native-block-authoring.json", "native-resources.json",
    "attempts/advisory/builder-top-down-comparison.png", "attempts/advisory/builder-entry-comparison.png"]
    .map(remotePath => ({ remotePath }));
  for (const { remotePath } of input.outputs.slice(0, 3)) await writeFile(path.join(input.stagingRoot, remotePath), remotePath);
  await writeFile(path.join(input.stagingRoot, ".codex-last-message.txt"), "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP: block a overlaps b at cell 1,2,3");
  await retainLocalTaskFailure(input);
  const report = JSON.parse(await readFile(path.join(input.evidenceRoot, "report.json"), "utf8"));
  assert.deepEqual(report.outputs.map(row => row.status), ["present", "present", "present", "missing", "missing"]);
  assert.match(report.finalMessage, /block a overlaps b at cell 1,2,3/);
  assert.equal(report.feedbackAuthority, "untrusted-task-feedback");
  assert.equal(report.outcome, "task-rejected");
  assert.match(report.outputs[0].contentHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal((await lstat(path.join(input.evidenceRoot, "report.json"))).mode & 0o777, 0o600);
  assert.equal(await readFile(path.join(input.evidenceRoot, "outputs/scene.ts"), "utf8"), "scene.ts");
  await assert.rejects(lstat(path.join(input.root, "source")), /ENOENT/);
});

test("does not follow leaf or parent symlinks or retain input directories", async () => {
  const input = await fixture();
  await writeFile(path.join(input.root, "private.txt"), "must-not-copy");
  await symlink(path.join(input.root, "private.txt"), path.join(input.stagingRoot, "leaf.txt"));
  await symlink(input.root, path.join(input.stagingRoot, "linked-parent"));
  await mkdir(path.join(input.stagingRoot, "inputs"));
  await writeFile(path.join(input.stagingRoot, "empty.txt"), "");
  input.outputs = ["leaf.txt", "linked-parent/private.txt", "inputs", "empty.txt"].map(remotePath => ({ remotePath }));
  await retainLocalTaskFailure(input);
  const report = JSON.parse(await readFile(path.join(input.evidenceRoot, "report.json"), "utf8"));
  assert.deepEqual(report.outputs.map(row => row.status), ["unsafe", "unsafe", "unsafe", "empty"]);
  assert.ok(report.outputs.every(row => !row.snapshotPath));
  assert.equal((await inspectLocalOutput(input.stagingRoot, "../private.txt", 100)).status, "unsafe");
});

test("retains bounded redacted feedback and refuses to replace existing evidence", async () => {
  const input = await fixture();
  const text = 'TS18048 x is undefined; token="private-token"; {"apiKey":"private-key"} Authorization: Bearer private-bearer /private/checkout/scene.ts https://example.test/private sk-privateValue';
  await writeFile(path.join(input.stagingRoot, ".codex-last-message.txt"), text);
  input.stderrTail = text;
  await retainLocalTaskFailure(input);
  const before = await readFile(path.join(input.evidenceRoot, "report.json"));
  const report = JSON.parse(before);
  assert.match(report.finalMessage, /TS18048 x is undefined/);
  assert.doesNotMatch(before.toString(), /private-token|private-key|private-bearer|privateValue|example\.test|checkout/);
  assert.ok(redactLocalTaskFeedback("x".repeat(100_000)).length <= 8000);
  await assert.rejects(retainLocalTaskFailure(input), /EEXIST/);
  assert.deepEqual(await readFile(path.join(input.evidenceRoot, "report.json")), before);
});

test("reports oversized snapshots instead of reading unbounded files", async () => {
  const input = await fixture();
  const large = await open(path.join(input.stagingRoot, "large.bin"), "w");
  await large.truncate(33 * 1024 * 1024);
  await large.close();
  input.outputs = [{ remotePath: "large.bin" }];
  await retainLocalTaskFailure(input);
  const report = JSON.parse(await readFile(path.join(input.evidenceRoot, "report.json"), "utf8"));
  assert.equal(report.outputs[0].status, "present");
  assert.equal(report.outputs[0].snapshotOmitted, "byte-limit");
  assert.equal(report.outputs[0].sizeBytes, 33 * 1024 * 1024);
  await assert.rejects(lstat(path.join(input.evidenceRoot, "outputs")), /ENOENT/);
});
