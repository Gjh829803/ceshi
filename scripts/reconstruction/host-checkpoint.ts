import { constants } from "node:fs";
import { lstat, link, mkdir, open, readdir, realpath, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { isEqual } from "lodash-es";
import { sha256Bytes, sha256CanonicalJson, stringifyCanonicalJson } from "@whitebox-world/protocol";

export type HostCheckpointStageV1 = "generate" | "package" | "capture" | "evaluate";
const STAGES = ["generate", "package", "capture", "evaluate"] as const;
interface FileIdentity { readonly path: string; readonly contentHash: string }
interface Checkpoint {
  readonly kind: "world-reconstruction-host-checkpoint";
  readonly schemaVersion: 1;
  readonly stage: HostCheckpointStageV1;
  readonly inputHash: string;
  readonly result: unknown;
  readonly roots: readonly string[];
  readonly files: readonly FileIdentity[];
}

function invalid(): never { throw new Error("WORLD_RECONSTRUCTION_HOST_CHECKPOINT_INVALID"); }
function inside(root: string, relative: string): string {
  if (!relative || relative.includes("\\") || path.isAbsolute(relative) ||
    relative.split("/").some((part) => !part || part === "." || part === "..")) invalid();
  return path.join(root, relative);
}
async function regularBytes(file: string): Promise<Buffer> {
  if (await realpath(file) !== file) invalid();
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile()) invalid();
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const current = await lstat(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs ||
      current.isSymbolicLink() || current.dev !== after.dev || current.ino !== after.ino ||
      await realpath(file) !== file) invalid();
    return bytes;
  } finally { await handle.close(); }
}
async function inventory(root: string, roots: readonly string[]): Promise<readonly FileIdentity[]> {
  const files: FileIdentity[] = [];
  async function visit(relative: string): Promise<void> {
    const file = inside(root, relative);
    const stat = await lstat(file);
    if (stat.isSymbolicLink() || await realpath(file) !== file) invalid();
    if (stat.isDirectory()) {
      for (const name of (await readdir(file)).sort()) await visit(`${relative}/${name}`);
    } else if (stat.isFile()) {
      files.push({ path: relative, contentHash: sha256Bytes(await regularBytes(file)) });
    } else invalid();
  }
  for (const relative of [...roots].sort()) await visit(relative);
  if (!files.length || new Set(files.map((file) => file.path)).size !== files.length) invalid();
  return files;
}

/** Passed outputs only. The checkpoint commits after the owner's artifacts, never before. */
export async function writeHostCheckpointV1(input: Readonly<{
  attemptRoot: string; stage: HostCheckpointStageV1; inputIdentity: unknown;
  result: unknown; artifactRoots: readonly string[];
}>): Promise<void> {
  const directory = path.join(input.attemptRoot, "host-checkpoints");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (await realpath(directory) !== directory) invalid();
  const checkpoint: Checkpoint = {
    kind: "world-reconstruction-host-checkpoint", schemaVersion: 1,
    stage: input.stage, inputHash: sha256CanonicalJson(input.inputIdentity), result: input.result,
    roots: input.artifactRoots, files: await inventory(input.attemptRoot, input.artifactRoots),
  };
  const bytes = stringifyCanonicalJson({ checkpoint, contentHash: sha256CanonicalJson(checkpoint) });
  const file = path.join(directory, `${input.stage}.json`);
  // The stage is committed once. A duplicate cannot replace its artifact identity.
  const staging = path.join(directory, `.${input.stage}.${randomUUID()}.tmp`);
  const handle = await open(staging, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await link(staging, file);
  } finally { await unlink(staging); }
  const dir = await open(directory, constants.O_RDONLY);
  try { await dir.sync(); } finally { await dir.close(); }
}

export async function readHostCheckpointV1(input: Readonly<{
  attemptRoot: string; stage: HostCheckpointStageV1; inputIdentity: unknown;
}>): Promise<unknown | undefined> {
  let bytes: Buffer;
  try { bytes = await regularBytes(path.join(input.attemptRoot, "host-checkpoints", `${input.stage}.json`)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  const value = JSON.parse(bytes.toString("utf8"));
  const checkpoint: Checkpoint = value?.checkpoint;
  if (!checkpoint || Object.keys(value).sort().join() !== "checkpoint,contentHash" ||
    Object.keys(checkpoint).sort().join() !== "files,inputHash,kind,result,roots,schemaVersion,stage" ||
    checkpoint.kind !== "world-reconstruction-host-checkpoint" || checkpoint.schemaVersion !== 1 ||
    !STAGES.includes(checkpoint.stage) || checkpoint.stage !== input.stage ||
    checkpoint.inputHash !== sha256CanonicalJson(input.inputIdentity) ||
    !Array.isArray(checkpoint.roots) || checkpoint.roots.some((root) => typeof root !== "string") ||
    value.contentHash !== sha256CanonicalJson(checkpoint) ||
    !isEqual(checkpoint.files, await inventory(input.attemptRoot, checkpoint.roots))) invalid();
  return checkpoint.result;
}

/** Resolve only a named Host output in this exact Run/Attempt; never an arbitrary artifact URI. */
export function resolveHostAttemptArtifactV1(input: Readonly<{
  runRoot: string; caseRef: string; attemptIndex: number; artifactRef: string; fileName: string;
}>): string {
  const prefix = `${input.caseRef.slice(0, -"/case.json".length)}/runs/${path.basename(input.runRoot)}/attempts/${input.attemptIndex}/`;
  if (!input.artifactRef.startsWith(prefix)) invalid();
  const relative = input.artifactRef.slice(prefix.length);
  const escaped = input.fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`^(?:host-recoveries/[1-9][0-9]*/)?${escaped}$`).test(relative)) invalid();
  return inside(path.join(input.runRoot, "attempts", String(input.attemptIndex)), relative);
}
