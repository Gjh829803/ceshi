import { randomUUID } from "node:crypto";
import {
  lstat,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import {
  evaluateWorldReconstructionV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionEvidenceSetV1,
  worldReconstructionEvaluationResultCanonicalBytesV1,
  worldReconstructionEvidenceSetCanonicalBytesV1,
  type WorldReconstructionEvaluationResultV1,
  type WorldReconstructionEvidenceSetV1,
} from "@whitebox-world/validation";

import {
  buildWorldReconstructionEvidenceSetV1,
  type BuildWorldReconstructionEvidenceSetInputV1,
} from "./evaluate-evidence-set.js";

const EVIDENCE_SET_FILE_NAME = "evidence-set.json";
const EVALUATION_FILE_NAME = "evaluation.json";

export interface EvaluateNativeBlockAttemptInputV1 {
  readonly evidenceInput: BuildWorldReconstructionEvidenceSetInputV1;
  readonly attemptDirectoryPath: string;
}

export interface NativeBlockAttemptEvaluationPublicationV1 {
  readonly evidenceSetPath: string;
  readonly evaluationPath: string;
  readonly evidenceSet: WorldReconstructionEvidenceSetV1;
  readonly evaluation: WorldReconstructionEvaluationResultV1;
}

function invalid(detail: string): never {
  throw new Error(`WORLD_RECONSTRUCTION_EVALUATION_PUBLICATION_INVALID: ${detail}`);
}

async function requireAttemptDirectory(value: string): Promise<string> {
  if (
    !path.isAbsolute(value) ||
    path.resolve(value) !== value ||
    path.parse(value).root === value
  ) {
    invalid("Attempt directory must be a normalized absolute non-root path");
  }
  const snapshot = await lstat(value);
  if (!snapshot.isDirectory() || snapshot.isSymbolicLink()) {
    invalid("Attempt directory must be a real directory");
  }
  if (await realpath(value) !== value) {
    invalid("Attempt directory must not resolve through a symbolic link");
  }
  return value;
}

async function readExistingRegularFile(
  outputPath: string,
): Promise<Uint8Array | undefined> {
  try {
    const snapshot = await lstat(outputPath);
    if (!snapshot.isFile() || snapshot.isSymbolicLink()) {
      invalid(`${path.basename(outputPath)} must be a regular file`);
    }
    return new Uint8Array(await readFile(outputPath));
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index]);
}

async function publishCanonicalFile(
  attemptDirectoryPath: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<string> {
  const outputPath = path.join(attemptDirectoryPath, fileName);
  const existing = await readExistingRegularFile(outputPath);
  if (existing !== undefined) {
    if (!equalBytes(existing, bytes)) {
      invalid(`${fileName} conflicts with immutable Attempt evidence`);
    }
    return outputPath;
  }
  const temporaryPath = path.join(
    attemptDirectoryPath,
    `.${fileName}.${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return outputPath;
}

export async function evaluateNativeBlockAttemptV1(
  input: EvaluateNativeBlockAttemptInputV1,
): Promise<NativeBlockAttemptEvaluationPublicationV1> {
  const attemptDirectoryPath = await requireAttemptDirectory(
    input.attemptDirectoryPath,
  );
  const evidenceSet = buildWorldReconstructionEvidenceSetV1(input.evidenceInput);
  const evaluation = evaluateWorldReconstructionV1({
    case: input.evidenceInput.reconstructionCase,
    profile: input.evidenceInput.evaluationProfile,
    evidence: evidenceSet,
  });
  const evidenceSetPath = await publishCanonicalFile(
    attemptDirectoryPath,
    EVIDENCE_SET_FILE_NAME,
    worldReconstructionEvidenceSetCanonicalBytesV1(evidenceSet),
  );
  const evaluationPath = await publishCanonicalFile(
    attemptDirectoryPath,
    EVALUATION_FILE_NAME,
    worldReconstructionEvaluationResultCanonicalBytesV1(evaluation),
  );
  const rereadEvidenceSet = parseWorldReconstructionEvidenceSetV1(
    JSON.parse((await readFile(evidenceSetPath)).toString("utf8")),
  );
  const rereadEvaluation = parseWorldReconstructionEvaluationResultV1(
    JSON.parse((await readFile(evaluationPath)).toString("utf8")),
  );
  return Object.freeze({
    evidenceSetPath,
    evaluationPath,
    evidenceSet: rereadEvidenceSet,
    evaluation: rereadEvaluation,
  });
}
