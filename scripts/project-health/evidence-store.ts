import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil } from "lodash-es";

const EVIDENCE_REF = /^sha256:[a-f0-9]{64}$/;

function redactStableEvidenceText(input: string): string {
  return input
    .replace(/(?:api[_-]?key|token|secret|password)\s*[=:]\s*\S+/gi, "[REDACTED_CREDENTIAL]")
    .replace(/\b(?:crsr|sk)_[A-Za-z0-9]*/gi, "[REDACTED_CREDENTIAL]")
    .replace(/file:\/\/[^\s"']+/gi, "[REDACTED_PATH]")
    .replace(/[A-Za-z]:\\[^\s"']+/g, "[REDACTED_PATH]")
    .replace(/\/(?:[^\s/"']+\/)+[^\s"']+/g, "[REDACTED_PATH]");
}

function redactJsonValue(input: unknown): unknown {
  if (typeof input === "string") return redactStableEvidenceText(input);
  if (Array.isArray(input)) return input.map(redactJsonValue);
  if (typeof input === "object" && !isNil(input)) {
    return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, redactJsonValue(value)]));
  }
  return input;
}

async function canonicalRepositoryRoot(repositoryRoot: string): Promise<string> {
  try {
    const resolved = path.resolve(repositoryRoot);
    const stat = await lstat(resolved);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("Repository root is not a canonical directory.");
    }
    return await realpath(resolved);
  } catch (error) {
    throw new Error("Repository root must be an existing canonical directory.", { cause: error });
  }
}

function assertRepositoryChild(repositoryRoot: string, candidatePath: string): string {
  const absolutePath = path.resolve(candidatePath);
  if (absolutePath !== repositoryRoot && !absolutePath.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error("Output path must remain inside the repository.");
  }
  return absolutePath;
}

async function writeTextAtomic(outputPath: string, text: string): Promise<void> {
  const parent = path.dirname(outputPath);
  await mkdir(parent, { recursive: true });
  const temporaryPath = path.join(parent, `.${path.basename(outputPath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function putEvidence(input: Readonly<{
  repositoryRoot: string;
  evidenceRef: string;
  serialized: string;
}>): Promise<Readonly<{ evidenceRef: string; outputPath: string }>> {
  const repositoryRoot = await canonicalRepositoryRoot(input.repositoryRoot);
  const outputPath = assertRepositoryChild(
    repositoryRoot,
    path.join(repositoryRoot, ".project-health", "evidence", "sha256", input.evidenceRef.slice("sha256:".length)),
  );
  try {
    const existing = await readFile(outputPath, "utf8");
    if (existing !== input.serialized) throw new Error("Evidence hash collision detected.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeTextAtomic(outputPath, input.serialized);
  }
  return { evidenceRef: input.evidenceRef, outputPath };
}

export async function putProjectHealthEvidenceTextV1(input: Readonly<{
  repositoryRoot: string;
  text: string;
}>): Promise<Readonly<{ evidenceRef: string; outputPath: string }>> {
  const serialized = redactStableEvidenceText(input.text);
  const evidenceRef = `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
  return putEvidence({ ...input, evidenceRef, serialized });
}

export async function putProjectHealthEvidenceJsonV1(input: Readonly<{
  repositoryRoot: string;
  value: unknown;
}>): Promise<Readonly<{ evidenceRef: string; outputPath: string }>> {
  const value = redactJsonValue(input.value);
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const evidenceRef = sha256CanonicalJson(value);
  return putEvidence({ ...input, evidenceRef, serialized });
}

export async function getProjectHealthEvidenceV1(input: Readonly<{
  repositoryRoot: string;
  evidenceRef: string;
}>): Promise<string> {
  if (!EVIDENCE_REF.test(input.evidenceRef) || isEmpty(input.evidenceRef)) {
    throw new TypeError("Evidence reference must be a canonical sha256 reference.");
  }
  const repositoryRoot = await canonicalRepositoryRoot(input.repositoryRoot);
  const evidencePath = assertRepositoryChild(
    repositoryRoot,
    path.join(repositoryRoot, ".project-health", "evidence", "sha256", input.evidenceRef.slice("sha256:".length)),
  );
  return readFile(evidencePath, "utf8");
}

export async function writeProjectHealthJsonAtomicV1(input: Readonly<{
  outputPath: string;
  value: unknown;
  repositoryRoot?: string;
}>): Promise<void> {
  let outputPath = path.resolve(input.outputPath);
  if (!isNil(input.repositoryRoot)) {
    const requestedRepositoryRoot = path.resolve(input.repositoryRoot);
    const repositoryRoot = await canonicalRepositoryRoot(input.repositoryRoot);
    const repositoryRelativeOutputPath = path.relative(requestedRepositoryRoot, outputPath);
    outputPath = assertRepositoryChild(repositoryRoot, path.join(repositoryRoot, repositoryRelativeOutputPath));
  }
  await writeTextAtomic(outputPath, `${JSON.stringify(input.value, null, 2)}\n`);
}
