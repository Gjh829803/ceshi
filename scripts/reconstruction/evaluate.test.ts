import { readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import {
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionEvidenceSetV1,
} from "@whitebox-world/validation";
import { afterEach, describe, expect, it } from "vitest";

import { evaluateNativeBlockAttemptV1 } from "./evaluate.js";
import { createEvidenceSetFixtureInputV1 } from "./evaluate-fixture.test-support.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directoryPath) =>
    rm(directoryPath, { recursive: true, force: true })));
});

describe("evaluateNativeBlockAttemptV1", () => {
  it("publishes canonical evidence and explanatory evaluation atomically and idempotently", async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "nbr50b-evaluate-")));
    temporaryDirectories.push(root);
    const first = await evaluateNativeBlockAttemptV1({
      evidenceInput: createEvidenceSetFixtureInputV1(),
      attemptDirectoryPath: root,
    });
    const firstEvidenceBytes = await readFile(first.evidenceSetPath);
    const firstEvaluationBytes = await readFile(first.evaluationPath);
    const second = await evaluateNativeBlockAttemptV1({
      evidenceInput: createEvidenceSetFixtureInputV1(),
      attemptDirectoryPath: root,
    });

    expect(parseWorldReconstructionEvidenceSetV1(
      JSON.parse(firstEvidenceBytes.toString("utf8")),
    )).toEqual(first.evidenceSet);
    expect(parseWorldReconstructionEvaluationResultV1(
      JSON.parse(firstEvaluationBytes.toString("utf8")),
    )).toEqual(first.evaluation);
    expect(second).toEqual(first);
    expect(await readFile(second.evidenceSetPath)).toEqual(firstEvidenceBytes);
    expect(await readFile(second.evaluationPath)).toEqual(firstEvaluationBytes);
    expect(first.evaluation.dimensions.map(({ dimensionId }) => dimensionId)).toEqual([
      "collider",
      "critical-traversal",
      "deterministic-build",
      "opening-composition",
      "semantic-silhouette",
      "spawn-support",
      "topology",
    ]);
    expect(first.evaluation.diagnostics.every((diagnostic) =>
      diagnostic.evidenceRefs.length > 0 && diagnostic.message.length > 0
    )).toBe(true);
  });
});
