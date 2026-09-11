import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, realpath, rm, writeFile, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { closedDiagnosticReader } from "./creator-eval-diagnostics.mjs";

const exec = promisify(execFile);
const name = "creator-events.jsonl";
async function fixture(work) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "creator-diagnostic-test-")));
  try { await work(root); } finally { await rm(root, {recursive: true, force: true}); }
}
const read = (root, limit = 1024) => exec("python3", ["-c", closedDiagnosticReader, root, name, String(limit)]);

test("closed diagnostic reader transports exact regular-file bytes and hash", async () => fixture(async root => {
  const bytes = "{\"type\":\"turn.started\"}\n";
  await writeFile(path.join(root, name), bytes);
  const result = await read(root);
  const receipt = JSON.parse(result.stderr);
  assert.equal(result.stdout, bytes);
  assert.equal(receipt.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(receipt.nlink, 1);
  assert.equal(receipt.pathResolution, "directory-fd-no-follow");
}));

test("closed diagnostic reader rejects symlinked source directories and files", async () => fixture(async root => {
  await writeFile(path.join(root, "outside"), "must not be transported");
  await symlink(path.join(root, "outside"), path.join(root, name));
  await assert.rejects(read(root), error => error.stdout === "");
  await rm(path.join(root, name));
  await writeFile(path.join(root, name), "regular");
  await symlink(root, path.join(root, "alias"));
  await assert.rejects(read(path.join(root, "alias")), error => error.stdout === "");
}));

test("closed diagnostic reader rejects hardlinks and oversized files before output", async () => fixture(async root => {
  await writeFile(path.join(root, "outside"), "must not be transported");
  await link(path.join(root, "outside"), path.join(root, name));
  await assert.rejects(read(root), error => error.stdout === "");
  await rm(path.join(root, name));
  await writeFile(path.join(root, name), "too large");
  await assert.rejects(read(root, 4), error => error.stdout === "");
}));
