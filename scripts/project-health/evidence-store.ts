import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { sha256CanonicalJson, stringifyCanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil } from "lodash-es";

const EVIDENCE_REF = /^sha256:[a-f0-9]{64}$/;

type CanonicalDirectoryIdentityV1 = Readonly<{
  absolutePath: string;
  device: number;
  inode: number;
}>;

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

async function canonicalDirectoryIdentity(directoryPath: string): Promise<CanonicalDirectoryIdentityV1> {
  const requestedPath = path.resolve(directoryPath);
  const requestedStat = await lstat(requestedPath);
  if (!requestedStat.isDirectory() || requestedStat.isSymbolicLink()) {
    throw new Error(`Path is not a canonical directory: ${requestedPath}`);
  }
  const absolutePath = await realpath(requestedPath);
  const canonicalStat = await lstat(absolutePath);
  if (!canonicalStat.isDirectory() || canonicalStat.isSymbolicLink()) {
    throw new Error(`Path is not a canonical directory: ${absolutePath}`);
  }
  return {
    absolutePath,
    device: canonicalStat.dev,
    inode: canonicalStat.ino,
  };
}

async function assertDirectoryIdentity(identity: CanonicalDirectoryIdentityV1): Promise<void> {
  const current = await lstat(identity.absolutePath);
  if (
    !current.isDirectory()
    || current.isSymbolicLink()
    || current.dev !== identity.device
    || current.ino !== identity.inode
    || await realpath(identity.absolutePath) !== identity.absolutePath
  ) {
    throw new Error(`Canonical directory identity changed: ${identity.absolutePath}`);
  }
}

async function ensureCanonicalChildDirectory(
  parent: CanonicalDirectoryIdentityV1,
  name: string,
): Promise<CanonicalDirectoryIdentityV1> {
  if (path.basename(name) !== name || isEmpty(name)) {
    throw new Error("Canonical child directory requires one path segment.");
  }
  await assertDirectoryIdentity(parent);
  const requestedPath = path.join(parent.absolutePath, name);
  try {
    await mkdir(requestedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await assertDirectoryIdentity(parent);
  const child = await canonicalDirectoryIdentity(requestedPath);
  if (path.dirname(child.absolutePath) !== parent.absolutePath) {
    throw new Error(`Canonical child directory escaped its parent: ${requestedPath}`);
  }
  return child;
}

async function canonicalRepositoryRoot(repositoryRoot: string): Promise<CanonicalDirectoryIdentityV1> {
  try {
    return await canonicalDirectoryIdentity(repositoryRoot);
  } catch (error) {
    throw new Error("Repository root must be an existing canonical directory.", { cause: error });
  }
}

async function evidenceDirectory(repositoryRoot: string): Promise<CanonicalDirectoryIdentityV1> {
  const repository = await canonicalRepositoryRoot(repositoryRoot);
  const projectHealth = await ensureCanonicalChildDirectory(repository, ".project-health");
  const evidence = await ensureCanonicalChildDirectory(projectHealth, "evidence");
  return ensureCanonicalChildDirectory(evidence, "sha256");
}

async function readStableFile(
  parent: CanonicalDirectoryIdentityV1,
  filePath: string,
): Promise<string> {
  await assertDirectoryIdentity(parent);
  const before = await lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(`Evidence object is not a canonical regular file: ${filePath}`);
  }
  const contents = await readFile(filePath, "utf8");
  const after = await lstat(filePath);
  if (!after.isFile() || after.isSymbolicLink() || after.dev !== before.dev || after.ino !== before.ino) {
    throw new Error(`Evidence object identity changed while reading: ${filePath}`);
  }
  await assertDirectoryIdentity(parent);
  return contents;
}

async function publishContentAddressed(
  parent: CanonicalDirectoryIdentityV1,
  fileName: string,
  serialized: string,
): Promise<string> {
  const outputPath = path.join(parent.absolutePath, fileName);
  try {
    const existing = await readStableFile(parent, outputPath);
    if (existing !== serialized) throw new Error("Evidence hash collision or non-canonical bytes detected.");
    return outputPath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const temporaryPath = path.join(parent.absolutePath, `.${fileName}.${randomUUID()}.tmp`);
  try {
    await assertDirectoryIdentity(parent);
    await writeFile(temporaryPath, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await assertDirectoryIdentity(parent);
    try {
      await link(temporaryPath, outputPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    await assertDirectoryIdentity(parent);
    const published = await readStableFile(parent, outputPath);
    if (published !== serialized) throw new Error("Evidence hash collision or non-canonical bytes detected.");
    return outputPath;
  } finally {
    await assertDirectoryIdentity(parent);
    await rm(temporaryPath, { force: true });
    await assertDirectoryIdentity(parent);
  }
}

async function putEvidence(input: Readonly<{
  repositoryRoot: string;
  evidenceRef: string;
  serialized: string;
}>): Promise<Readonly<{ evidenceRef: string; outputPath: string }>> {
  const directory = await evidenceDirectory(input.repositoryRoot);
  const outputPath = await publishContentAddressed(
    directory,
    input.evidenceRef.slice("sha256:".length),
    input.serialized,
  );
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
  const serialized = stringifyCanonicalJson(value);
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
  const directory = await evidenceDirectory(input.repositoryRoot);
  const evidencePath = path.join(directory.absolutePath, input.evidenceRef.slice("sha256:".length));
  const contents = await readStableFile(directory, evidencePath);
  const actualRef = `sha256:${createHash("sha256").update(contents).digest("hex")}`;
  if (actualRef !== input.evidenceRef) {
    throw new Error("Evidence object bytes do not match their content address.");
  }
  return contents;
}

async function canonicalOutputParent(input: Readonly<{
  outputPath: string;
  repositoryRoot: string;
}>): Promise<Readonly<{
  outputPath: string;
  parent: CanonicalDirectoryIdentityV1;
}>> {
  const requestedRepositoryRoot = path.resolve(input.repositoryRoot);
  const requestedOutputPath = path.resolve(input.outputPath);
  const relativeOutputPath = path.relative(requestedRepositoryRoot, requestedOutputPath);
  if (
    isEmpty(relativeOutputPath)
    || relativeOutputPath === ".."
    || relativeOutputPath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeOutputPath)
  ) {
    throw new Error("Output path must remain inside the repository.");
  }

  const repository = await canonicalRepositoryRoot(input.repositoryRoot);
  let parent = repository;
  for (const segment of path.dirname(relativeOutputPath).split(path.sep)) {
    if (segment === "." || isEmpty(segment)) continue;
    parent = await ensureCanonicalChildDirectory(parent, segment);
  }
  const outputPath = path.join(parent.absolutePath, path.basename(relativeOutputPath));
  return { outputPath, parent };
}

export async function assertProjectHealthOutputPathV1(input: Readonly<{
  outputPath: string;
  repositoryRoot: string;
}>): Promise<string> {
  const requestedRoot = path.resolve(input.repositoryRoot);
  const requestedOutput = path.resolve(input.outputPath);
  const relativeOutput = path.relative(requestedRoot, requestedOutput);
  if (relativeOutput === ".project-health" || !relativeOutput.startsWith(`.project-health${path.sep}`)) {
    throw new TypeError("Project Health output must stay under .project-health/.");
  }
  return (await canonicalOutputParent(input)).outputPath;
}

async function writeMutableAtomic(
  parent: CanonicalDirectoryIdentityV1,
  outputPath: string,
  text: string,
): Promise<void> {
  try {
    const existing = await lstat(outputPath);
    if (!existing.isFile() || existing.isSymbolicLink()) {
      throw new Error(`Mutable output is not a canonical regular file: ${outputPath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const temporaryPath = path.join(parent.absolutePath, `.${path.basename(outputPath)}.${randomUUID()}.tmp`);
  try {
    await assertDirectoryIdentity(parent);
    await writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await assertDirectoryIdentity(parent);
    await rename(temporaryPath, outputPath);
    await assertDirectoryIdentity(parent);
  } finally {
    await assertDirectoryIdentity(parent);
    await rm(temporaryPath, { force: true });
    await assertDirectoryIdentity(parent);
  }
}

export async function writeProjectHealthJsonAtomicV1(input: Readonly<{
  outputPath: string;
  value: unknown;
  repositoryRoot?: string;
}>): Promise<void> {
  const text = `${JSON.stringify(input.value, null, 2)}\n`;
  const repositoryRoot = input.repositoryRoot;
  if (isNil(repositoryRoot)) {
    const outputPath = path.resolve(input.outputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    const parent = await canonicalDirectoryIdentity(path.dirname(outputPath));
    await writeMutableAtomic(parent, outputPath, text);
    return;
  }
  const { outputPath, parent } = await canonicalOutputParent({
    outputPath: input.outputPath,
    repositoryRoot,
  });
  await writeMutableAtomic(parent, outputPath, text);
}
