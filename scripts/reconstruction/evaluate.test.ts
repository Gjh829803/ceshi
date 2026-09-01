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

async function publishAttempt(
  evidenceInput = createEvidenceSetFixtureInputV1(),
) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "nbr50b-evaluate-")));
  temporaryDirectories.push(root);
  return evaluateNativeBlockAttemptV1({
    evidenceInput,
    attemptDirectoryPath: root,
  });
}

function dimension(
  evaluation: Awaited<ReturnType<typeof evaluateNativeBlockAttemptV1>>["evaluation"],
  dimensionId: string,
) {
  const row = evaluation.dimensions.find((entry) => entry.dimensionId === dimensionId);
  if (row === undefined) throw new Error(`${dimensionId} dimension`);
  return row;
}

describe("evaluateNativeBlockAttemptV1", () => {
  it("publishes canonical evidence and explanatory evaluation atomically and idempotently", async () => {
    const evidenceInput = createEvidenceSetFixtureInputV1();
    const first = await publishAttempt(evidenceInput);
    const firstEvidenceBytes = await readFile(first.evidenceSetPath);
    const firstEvaluationBytes = await readFile(first.evaluationPath);
    const second = await evaluateNativeBlockAttemptV1({
      evidenceInput: createEvidenceSetFixtureInputV1(),
      attemptDirectoryPath: path.dirname(first.evidenceSetPath),
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
    expect(first.evaluation.outcome).toBe("incomplete");
    expect(first.evaluation.dimensions.map(({ dimensionId, status }) => [
      dimensionId,
      status,
    ])).toEqual([
      ["collider", "passed"],
      ["critical-traversal", "passed"],
      ["deterministic-build", "incomplete"],
      ["opening-composition", "failed"],
      ["semantic-silhouette", "passed"],
      ["spawn-support", "passed"],
      ["topology", "passed"],
    ]);
    expect(first.evaluation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
        dimensionId: "deterministic-build",
        evidenceRefs: expect.arrayContaining([
          `world-package://${evidenceInput.verifiedWorldPackage.manifest.sceneSource.nativeSceneCheckResultPath}`,
        ]),
        message: "Required evidence is missing for deterministic-build.",
        repairAction: { kind: "revise-native-source" },
      }),
    ]));
    expect(first.evaluation.diagnostics.every((diagnostic) =>
      diagnostic.evidenceRefs.length > 0 && diagnostic.message.length > 0
    )).toBe(true);
    expect(dimension(first.evaluation, "deterministic-build").diagnosticIds.length)
      .toBeGreaterThan(0);
  });

  it("publishes blocked traversal when measured checkpoints disagree with a passed check-level outcome", async () => {
    const published = await publishAttempt(createEvidenceSetFixtureInputV1({
      traversalCheckpoints: [
        { checkpointId: "ground", outcome: "blocked", observedAtTick: 1 },
      ],
    }));

    expect(published.evaluation.outcome).toBe("incomplete");
    expect(dimension(published.evaluation, "critical-traversal")).toMatchObject({
      status: "failed",
    });
    expect(published.evaluation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
        dimensionId: "critical-traversal",
        message: "Required traversal reach-ground was blocked.",
        repairAction: { kind: "revise-native-source" },
      }),
      expect.objectContaining({
        code: "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
        dimensionId: "deterministic-build",
      }),
    ]));
    expect(published.evidenceSet.observedDimensions.find((row) =>
      row.dimensionId === "critical-traversal"
    )?.observed).toEqual({
      kind: "critical-traversal-observed",
      checks: [{ id: "reach-ground", outcome: "blocked", checkpointIds: ["ground"] }],
    });
  });

  it("publishes incomplete traversal when required checkpoint measurements are missing", async () => {
    const published = await publishAttempt(createEvidenceSetFixtureInputV1({
      traversalCheckpoints: [
        { checkpointId: "unmeasured-ledge", outcome: "reached", observedAtTick: 1 },
      ],
    }));

    expect(published.evaluation.outcome).toBe("incomplete");
    expect(dimension(published.evaluation, "critical-traversal")).toMatchObject({
      status: "incomplete",
    });
    expect(published.evaluation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
        dimensionId: "critical-traversal",
        message: "Required traversal evidence is missing for reach-ground.",
      }),
    ]));
  });

  it("publishes collider roles from traversalBinding when paletteRole and shape disagree", async () => {
    const published = await publishAttempt(createEvidenceSetFixtureInputV1({
      includePaletteTraversalDisagreement: true,
    }));

    expect(published.evidenceSet.observedDimensions.find((row) =>
      row.dimensionId === "collider"
    )?.observed).toEqual({
      kind: "collider-observed",
      contributions: [
        { contributionId: "ground", colliderId: "ground", role: "ground", hasOverlay: true },
        { contributionId: "palette-ground-blocker", colliderId: "palette-ground-blocker", role: "blocker", hasOverlay: false },
        { contributionId: "structure-painted-ground", colliderId: "structure-painted-ground", role: "ground", hasOverlay: false },
      ],
    });
    expect(dimension(published.evaluation, "collider").status).toBe("passed");
    expect(dimension(published.evaluation, "deterministic-build").status)
      .toBe("incomplete");
    expect(published.evaluation.outcome).toBe("incomplete");
  });
});
