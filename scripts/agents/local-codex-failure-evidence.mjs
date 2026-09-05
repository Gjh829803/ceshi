import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const SNAPSHOT_BYTE_LIMIT = 32 * 1024 * 1024;
const TEXT_BYTE_LIMIT = 64 * 1024;

// Diagnostic text is untrusted model/tool feedback, never a success authority.
export function redactLocalTaskFeedback(value) {
  return String(value)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/(?:https?:\/\/|file:\/\/)[^\s'"<>]+/g, "[redacted-uri]")
    .replace(/(?:[A-Za-z]:[\\/]|\/)[^\s'"<>]+/g, "[redacted-path]")
    .replace(/(?:Bearer\s+\S+|(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]+)/gi, "[redacted-secret]")
    .replace(/(["']?\b[\w-]*(?:token|password|secret|api[_-]?key)[\w-]*["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi, "$1[redacted]")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .slice(0, 8000);
}

export async function inspectLocalOutput(root, relativePath, byteLimit = 0) {
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return { status: "unsafe" };
  let handle;
  try {
    // Reject symlinks at every parent as well as the final file, including ones
    // pointing back inside the task. Never snapshot a different workspace.
    if (await realpath(path.dirname(absolute)) !== path.dirname(absolute)) return { status: "unsafe" };
    const metadata = await lstat(absolute);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) return { status: "unsafe" };
    handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.ino !== metadata.ino || before.dev !== metadata.dev) return { status: "unsafe" };
    if (before.size === 0) return { status: "empty", sizeBytes: 0 };
    if (before.size > byteLimit) return { status: "present", sizeBytes: before.size };
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (read.bytesRead === 0) return { status: "unsafe" };
      offset += read.bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) return { status: "unsafe" };
    return { status: "present", sizeBytes: bytes.length, bytes };
  } catch (error) {
    return { status: error.code === "ENOENT" ? "missing" : "unsafe" };
  } finally {
    await handle?.close();
  }
}

export async function retainLocalTaskFailure(input) {
  const root = await realpath(input.stagingRoot);
  const parent = await realpath(path.dirname(input.evidenceRoot));
  if (parent !== path.dirname(input.evidenceRoot) ||
      input.evidenceRoot === root || input.evidenceRoot.startsWith(`${root}${path.sep}`)) {
    throw new Error("Unsafe local failure evidence destination");
  }
  // Exclusive creation: a repeated logical request cannot replace prior evidence.
  await mkdir(input.evidenceRoot, { mode: 0o700 });
  const outputs = [];
  let remainingBytes = SNAPSHOT_BYTE_LIMIT;
  for (const output of input.outputs) {
    const inspected = await inspectLocalOutput(root, output.remotePath, remainingBytes);
    const row = { path: output.remotePath, status: inspected.status,
      ...(inspected.sizeBytes === undefined ? {} : { sizeBytes: inspected.sizeBytes }) };
    if (inspected.bytes) {
      const snapshotPath = `outputs/${output.remotePath}`;
      const destination = path.join(input.evidenceRoot, snapshotPath);
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, inspected.bytes, { flag: "wx", mode: 0o600 });
      row.snapshotPath = snapshotPath;
      row.contentHash = `sha256:${createHash("sha256").update(inspected.bytes).digest("hex")}`;
      remainingBytes -= inspected.bytes.length;
    } else if (inspected.status === "present") {
      row.snapshotOmitted = "byte-limit";
    }
    outputs.push(row);
  }
  const message = await inspectLocalOutput(root, ".codex-last-message.txt", TEXT_BYTE_LIMIT);
  const report = {
    kind: "worldkit-local-task-failure-evidence", schemaVersion: 1,
    requestId: input.requestId, taskId: input.taskId, outcome: input.outcome,
    childExitCode: input.childExitCode, outputs,
    feedbackAuthority: "untrusted-task-feedback",
    finalMessage: redactLocalTaskFeedback(message.bytes?.toString("utf8") ?? ""),
    finalMessageStatus: message.bytes ? "retained" : message.status === "present" ? "byte-limit" : message.status,
    diagnosticTail: redactLocalTaskFeedback(input.stderrTail),
  };
  await writeFile(path.join(input.evidenceRoot, "report.json"), `${JSON.stringify(report)}\n`, { flag: "wx", mode: 0o600 });
}
