import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  hashFormalWorldCaptureReceiptV1,
  parseFormalWorldCaptureReceiptV1,
} from "@whitebox-world/runtime-contracts";
import {
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  evaluateWorldReconstructionV1,
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  hashWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionRunReceiptV1,
} from "@whitebox-world/validation";
import {
  hashSceneAuthoringAttemptResultV1,
  hashSceneAuthoringAttemptV1,
} from "@whitebox-world/scene-authoring-contracts";
import { writeWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import { describe, expect, it } from "vitest";

import { buildWorldReconstructionEvidenceSetV1 } from
  "./evaluate-evidence-set.js";
import { createEvidenceSetFixtureInputV1 } from
  "./evaluate-fixture.test-support.js";
import {
  createNativeBlockFinalArtifactPublisherTestAdapterV1,
  publishNativeBlockReconstructionFinalV1,
} from "./final-artifact-publisher.js";

const PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));
const H = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256HashV1;

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${stringifyCanonicalJson(value)}\n`);
}

async function missing(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

async function createRunFixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "nbr-final-")));
  const caseDirectoryPath = path.join(root, "artifacts/scenes/package-fixture");
  const runDirectoryPath = path.join(caseDirectoryPath, "runs/formal");
  const attemptRoot = path.join(runDirectoryPath, "attempts/0");
  const captureRoot = path.join(attemptRoot, "capture");
  await mkdir(captureRoot, { recursive: true });
  const fixture = createEvidenceSetFixtureInputV1();
  const verified = fixture.verifiedWorldPackage;
  await writeJson(path.join(caseDirectoryPath, "case.json"), fixture.reconstructionCase);
  await writeWorldPackageDirectoryV1({
    outputDirectoryPath: path.join(attemptRoot, "world-package"),
    directory: verified.directory,
  });
  const pngHash = sha256Bytes(PNG) as Sha256HashV1;
  const captureReceipt = parseFormalWorldCaptureReceiptV1({
    ...fixture.captureReceipt,
    views: fixture.captureReceipt.views.map((view) => ({
      ...view,
      pngContentHash: pngHash,
    })),
    colliderOverlayPngContentHash: pngHash,
  });
  for (const name of [
    "opening",
    "world-top-down",
    "world-side",
    "collider-overlay",
  ] as const) {
    await writeFile(path.join(captureRoot, `${name}.png`), PNG);
  }
  await writeJson(path.join(captureRoot, "opening-observation.json"),
    fixture.openingObservation);
  await writeJson(path.join(captureRoot, "spawn-support-observation.json"),
    fixture.spawnSupportObservation);
  await writeJson(path.join(captureRoot, "collider-overlay-observation.json"),
    fixture.colliderOverlayObservation);
  await writeJson(path.join(captureRoot, "scripted-traversal.json"),
    fixture.scriptedTraversalObservation);
  await writeJson(path.join(captureRoot, "formal-world-capture-receipt.json"),
    captureReceipt);
  const evidence = buildWorldReconstructionEvidenceSetV1({
    ...fixture,
    captureReceipt,
  });
  const evaluated = evaluateWorldReconstructionV1({
    case: fixture.reconstructionCase,
    profile: fixture.evaluationProfile,
    evidence,
  });
  const evaluation = parseWorldReconstructionEvaluationResultV1({
    ...evaluated,
    outcome: "passed",
    diagnostics: [],
    dimensions: evaluated.dimensions.map((dimension) => ({
      ...dimension,
      status: "passed",
      diagnosticIds: [],
      metrics: [
        ...dimension.metrics.map((metric) =>
          metric.kind === "boolean-presence"
            ? { ...metric, isPresent: true }
            : metric.kind === "identity-match"
              ? { ...metric, isMatch: true }
              : metric.kind === "receipt-outcome"
                ? { ...metric, outcome: "completed" }
                : metric),
        { kind: "identity-match", isMatch: true },
      ],
    })),
  });
  await writeJson(path.join(attemptRoot, "evaluation.json"), evaluation);
  const captureReceiptHash = hashFormalWorldCaptureReceiptV1(captureReceipt);
  const evaluationHash = hashWorldReconstructionEvaluationResultV1(evaluation);
  const runReceipt = parseWorldReconstructionRunReceiptV1({
    kind: "world-reconstruction-run-receipt",
    schemaVersion: 1,
    id: "package-fixture.run",
    caseRef: fixture.caseRef,
    caseHash: hashWorldReconstructionCaseV1(fixture.reconstructionCase),
    evaluationProfileRef: fixture.evaluationProfileRef,
    evaluationProfileHash:
      hashWorldReconstructionEvaluationProfileV1(fixture.evaluationProfile),
    outcome: "passed",
    attempts: [{
      attemptIndex: 0,
      generationRequestRef: "artifact://case/package-fixture/attempts/0/generation-request.json",
      generationRequestHash: H("1"),
      generationReceiptRef: "artifact://case/package-fixture/attempts/0/generation-receipt.json",
      generationReceiptHash: H("2"),
      sceneAuthoringAttemptRef: captureReceipt.sceneAuthoringAttemptRef,
      sceneAuthoringAttemptHash:
        hashSceneAuthoringAttemptV1(verified.sceneAuthoringAttempt),
      sceneAuthoringAttemptResultRef:
        captureReceipt.sceneAuthoringAttemptResultRef,
      sceneAuthoringAttemptResultHash:
        hashSceneAuthoringAttemptResultV1(verified.sceneAuthoringAttemptResult),
      worldPackageRef: verified.receipt.worldPackageRef,
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      worldPackageBuildReceiptRef: captureReceipt.worldPackageBuildReceiptRef,
      worldPackageBuildReceiptHash: sha256CanonicalJson(verified.receipt),
      worldBuildIdentityRef: captureReceipt.worldBuildIdentityRef,
      worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
      captureReceiptRef: fixture.captureReceiptRef,
      captureReceiptHash,
      evaluationResultRef:
        "artifact://case/package-fixture/attempts/0/evaluation.json",
      evaluationResultHash: evaluationHash,
      outcome: "passed",
    }],
    finalAttemptIndex: 0,
    finalEvaluationResultRef:
      "artifact://case/package-fixture/attempts/0/evaluation.json",
    finalEvaluationResultHash: evaluationHash,
    cleanupOutcome: "completed",
  });
  await writeJson(path.join(runDirectoryPath, "run-receipt.json"), runReceipt);
  const launch = {
    kind: "native-block-reconstruction-launch" as const,
    schemaVersion: 1 as const,
    caseId: fixture.reconstructionCase.id,
    runReceiptRef:
      "artifact://case/package-fixture/runs/formal/run-receipt.json",
    runReceiptHash: sha256CanonicalJson(runReceipt) as Sha256HashV1,
    worldPackageRelativePath: "final/world-package" as const,
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    captureReceiptRelativePath:
      "final/capture/formal-world-capture-receipt.json" as const,
    captureReceiptHash,
    evaluationRelativePath: "final/evaluation.json" as const,
    evaluationHash,
    launchCommand:
      "pnpm worldkit native run final/world-package --port 5174 --json" as const,
  };
  return {
    root,
    caseDirectoryPath,
    runDirectoryPath,
    attemptRoot,
    launch,
  };
}

describe("Native reconstruction final artifact publisher", () => {
  it("publishes the terminal Attempt through fsynced staging and atomic rename", async () => {
    const fixture = await createRunFixture();
    const events: string[] = [];
    const publish = createNativeBlockFinalArtifactPublisherTestAdapterV1({
      beforeSync(absolutePath, phase) {
        events.push(`sync:${phase}:${path.basename(absolutePath)}`);
      },
      beforeRename(from, to) {
        events.push(`rename:${path.basename(from)}:${path.basename(to)}`);
      },
    });
    const runReceiptBefore = sha256Bytes(await readFile(
      path.join(fixture.runDirectoryPath, "run-receipt.json"),
    ));
    try {
      await expect(publish({
        caseDirectoryPath: fixture.caseDirectoryPath,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: fixture.launch,
        verifyStagedFinalArtifacts(stagingDirectoryPath) {
          events.push(`verify:${path.basename(stagingDirectoryPath)}`);
        },
      })).resolves.toMatchObject({
        outcome: "published",
        finalDirectoryPath: path.join(fixture.caseDirectoryPath, "final"),
      });
      expect(await missing(path.join(fixture.caseDirectoryPath, ".final-staging")))
        .toBe(true);
      expect(await missing(path.join(fixture.caseDirectoryPath, "final"))).toBe(false);
      expect(sha256Bytes(await readFile(
        path.join(fixture.runDirectoryPath, "run-receipt.json"),
      ))).toBe(runReceiptBefore);
      const renameIndex = events.findIndex((event) => event.startsWith("rename:"));
      const verifyIndex = events.findIndex((event) => event.startsWith("verify:"));
      expect(verifyIndex).toBeGreaterThan(-1);
      expect(verifyIndex).toBeLessThan(renameIndex);
      expect(events.slice(0, renameIndex).some((event) =>
        event.startsWith("sync:staging:"))).toBe(true);
      expect(events.slice(renameIndex + 1).some((event) =>
        event === `sync:publication:${path.basename(fixture.caseDirectoryPath)}`))
        .toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects stale launch identity and partial Capture before staging", async () => {
    for (const mutation of ["stale", "partial"] as const) {
      const fixture = await createRunFixture();
      if (mutation === "partial") {
        await unlink(path.join(fixture.attemptRoot, "capture/opening.png"));
      }
      try {
        await expect(publishNativeBlockReconstructionFinalV1({
          caseDirectoryPath: fixture.caseDirectoryPath,
          runDirectoryPath: fixture.runDirectoryPath,
          launch: mutation === "stale"
            ? { ...fixture.launch, captureReceiptHash: H("f") }
            : fixture.launch,
          verifyStagedFinalArtifacts() {},
        })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
        expect(await missing(path.join(fixture.caseDirectoryPath, ".final-staging")))
          .toBe(true);
        expect(await missing(path.join(fixture.caseDirectoryPath, "final"))).toBe(true);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    }
  });

  it("rejects symlinks, run-local final aliases, and an existing final", async () => {
    for (const mutation of ["symlink", "run-final", "existing"] as const) {
      const fixture = await createRunFixture();
      let runDirectoryPath = fixture.runDirectoryPath;
      if (mutation === "symlink") {
        const opening = path.join(fixture.attemptRoot, "capture/opening.png");
        await unlink(opening);
        await symlink(path.join(fixture.attemptRoot, "capture/world-side.png"), opening);
      } else if (mutation === "run-final") {
        runDirectoryPath = path.join(fixture.runDirectoryPath, "final");
        await mkdir(runDirectoryPath);
      } else {
        await mkdir(path.join(fixture.caseDirectoryPath, "final"));
      }
      try {
        await expect(publishNativeBlockReconstructionFinalV1({
          caseDirectoryPath: fixture.caseDirectoryPath,
          runDirectoryPath,
          launch: fixture.launch,
          verifyStagedFinalArtifacts() {},
        })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    }
  });

  it("cleans owned staging after a pre-rename failure without mutating the Run", async () => {
    const fixture = await createRunFixture();
    const runReceiptBefore = await readFile(
      path.join(fixture.runDirectoryPath, "run-receipt.json"),
    );
    const publish = createNativeBlockFinalArtifactPublisherTestAdapterV1({
      beforeRename() {
        throw new Error("injected publication failure");
      },
    });
    try {
      await expect(publish({
        caseDirectoryPath: fixture.caseDirectoryPath,
        runDirectoryPath: fixture.runDirectoryPath,
        launch: fixture.launch,
        verifyStagedFinalArtifacts() {},
      })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
      expect(await missing(path.join(fixture.caseDirectoryPath, ".final-staging")))
        .toBe(true);
      expect(await missing(path.join(fixture.caseDirectoryPath, "final"))).toBe(true);
      expect(await readFile(path.join(fixture.runDirectoryPath, "run-receipt.json")))
        .toEqual(runReceiptBefore);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects a staging verifier failure and verifier-side byte mutation", async () => {
    for (const mutation of ["reject", "mutate"] as const) {
      const fixture = await createRunFixture();
      const runReceiptBefore = await readFile(
        path.join(fixture.runDirectoryPath, "run-receipt.json"),
      );
      try {
        await expect(publishNativeBlockReconstructionFinalV1({
          caseDirectoryPath: fixture.caseDirectoryPath,
          runDirectoryPath: fixture.runDirectoryPath,
          launch: fixture.launch,
          async verifyStagedFinalArtifacts(stagingDirectoryPath) {
            if (mutation === "reject") throw new Error("Final verification failed");
            await writeFile(
              path.join(stagingDirectoryPath, "launch.json"),
              "{}\n",
            );
          },
        })).rejects.toThrow("NBR_FINAL_ARTIFACT_PUBLICATION_INVALID");
        expect(await missing(path.join(fixture.caseDirectoryPath, ".final-staging")))
          .toBe(true);
        expect(await missing(path.join(fixture.caseDirectoryPath, "final"))).toBe(true);
        expect(await readFile(path.join(fixture.runDirectoryPath, "run-receipt.json")))
          .toEqual(runReceiptBefore);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    }
  });
});
