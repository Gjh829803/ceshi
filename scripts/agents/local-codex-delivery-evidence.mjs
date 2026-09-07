import { createHash } from "node:crypto";
import { mkdir, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectLocalOutput } from "./local-codex-failure-evidence.mjs";

const SNAPSHOT_BYTE_LIMIT = 128 * 1024 * 1024;
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

// Hash the actual local adapter arguments; backend selection belongs to the router.
export function hashLocalTaskArguments(args) {
  return hash(JSON.stringify(args));
}

export async function retainLocalTaskDelivery(input) {
  if (input.childExitCode !== 0) throw new Error("Local delivery requires a successful child exit.");
  const root = await realpath(input.stagingRoot);
  if (await realpath(path.dirname(input.evidenceRoot)) !== path.dirname(input.evidenceRoot) ||
      input.evidenceRoot === root || input.evidenceRoot.startsWith(`${root}${path.sep}`)) {
    throw new Error("Unsafe local delivery evidence destination.");
  }
  // Never replace earlier evidence. report.json is the final commit marker;
  // interrupted/partial snapshots are not a completed delivery.
  await mkdir(input.evidenceRoot, { mode: 0o700 });
  const outputs = [];
  let remainingBytes = SNAPSHOT_BYTE_LIMIT;
  for (const output of input.outputs) {
    const inspected = await inspectLocalOutput(root, output.remotePath, remainingBytes);
    if (!inspected.bytes) throw new Error("Local delivery snapshot is incomplete.");
    const snapshotPath = `outputs/${output.remotePath}`;
    const destination = path.join(input.evidenceRoot, snapshotPath);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, inspected.bytes, { flag: "wx", mode: 0o600 });
    outputs.push({ path: output.remotePath, snapshotPath, contentHash: hash(inspected.bytes), sizeBytes: inspected.bytes.length });
    remainingBytes -= inspected.bytes.length;
  }
  const report = { kind: "worldkit-local-task-delivery-evidence", schemaVersion: 1,
    requestId: input.requestId, taskId: input.taskId, argumentsHash: input.argumentsHash,
    childExitCode: 0, outputs };
  const pending = path.join(input.evidenceRoot, "report.pending");
  await writeFile(pending, `${JSON.stringify(report)}\n`, { flag: "wx", mode: 0o600 });
  await rename(pending, path.join(input.evidenceRoot, "report.json"));
}

export async function readLocalTaskDelivery(input) {
  const inspected = await inspectLocalOutput(input.evidenceRoot, "report.json", 1024 * 1024);
  if (inspected.status === "missing") return null;
  if (!inspected.bytes) throw new Error("Invalid local delivery evidence.");
  const report = JSON.parse(inspected.bytes.toString("utf8"));
  if (report?.kind !== "worldkit-local-task-delivery-evidence" || report.schemaVersion !== 1 ||
      report.childExitCode !== 0 || report.requestId !== input.requestId || report.taskId !== input.taskId ||
      report.argumentsHash !== input.argumentsHash || !Array.isArray(report.outputs) ||
      report.outputs.length !== input.outputPaths.length || report.outputs.some((row, index) =>
        row?.path !== input.outputPaths[index] || row.snapshotPath !== `outputs/${row.path}`)) {
    throw new Error("Local delivery identity mismatch.");
  }
  const outputs = [];
  let remainingBytes = SNAPSHOT_BYTE_LIMIT;
  for (const row of report.outputs) {
    const output = await inspectLocalOutput(input.evidenceRoot, row.snapshotPath, remainingBytes);
    if (!output.bytes || output.sizeBytes !== row.sizeBytes || hash(output.bytes) !== row.contentHash) {
      throw new Error("Local delivered output changed or missing.");
    }
    outputs.push({ path: row.path, bytes: output.bytes });
    remainingBytes -= output.bytes.length;
  }
  return outputs;
}
