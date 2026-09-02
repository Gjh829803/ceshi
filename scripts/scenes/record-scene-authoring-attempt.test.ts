import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  parseSceneAuthoringAttemptResultV1,
  parseSceneAuthoringAttemptV1,
  parseSceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  beginHostedCanonicalSceneAuthoringAttemptV1,
  completeHostedCanonicalSceneAuthoringAttemptV1,
  rejectHostedCanonicalSceneAuthoringAttemptV1,
} from "./record-scene-authoring-attempt";
import { writeHostedCanonicalWorldGenerationRouteDecisionV1 } from
  "./world-generation-route.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function fixture(): Promise<{
  directory: string;
  briefPath: string;
  authoringInputPath: string;
  authoredSourcePath: string;
  routeDecisionPath: string;
  attemptPath: string;
  resultPath: string;
}> {
  const directory = await mkdtemp(path.join(tmpdir(), "worldkit-authoring-attempt-"));
  temporaryDirectories.push(directory);
  const briefPath = path.join(directory, "scene-brief.md");
  const authoringInputPath = path.join(directory, "authoring.builder.json");
  const authoredSourcePath = path.join(directory, "authoring.json");
  const routeDecisionPath = path.join(directory, "scene-authoring-route-decision.json");
  const attemptPath = path.join(directory, "scene-authoring-attempt.json");
  const resultPath = path.join(directory, "scene-authoring-attempt-result.json");
  const brief = await readFile(
    path.resolve("artifacts/scenes/cloud-ridge-celestial-gate/scene-brief.md"),
    "utf8",
  );
  const source = JSON.parse(
    await readFile(path.resolve("examples/authoring/basic-world.json"), "utf8"),
  );
  source.id = "hosted-attempt-test";
  source.seed = 17;
  await Promise.all([
    writeFile(briefPath, brief),
    writeFile(authoringInputPath, JSON.stringify(source)),
    writeFile(authoredSourcePath, JSON.stringify(source)),
  ]);
  return {
    directory,
    briefPath,
    authoringInputPath,
    authoredSourcePath,
    routeDecisionPath,
    attemptPath,
    resultPath,
  };
}

async function freezeCanonicalRoute(
  files: Awaited<ReturnType<typeof fixture>>,
  runId: string,
): Promise<void> {
  await writeHostedCanonicalWorldGenerationRouteDecisionV1({
    sceneId: "hosted-attempt-test",
    runId,
    sceneBriefPath: files.briefPath,
    outputPath: files.routeDecisionPath,
  });
}

describe("hosted Canonical Scene Authoring orchestration records", () => {
  it("publishes one closed Route Decision and Attempt before trusted Host finalization", async () => {
    const files = await fixture();
    await freezeCanonicalRoute(files, "run-001");
    const created = await beginHostedCanonicalSceneAuthoringAttemptV1({
      sceneId: "hosted-attempt-test",
      runId: "run-001",
      sceneBriefPath: files.briefPath,
      authoringInputPath: files.authoringInputPath,
      routeDecisionPath: files.routeDecisionPath,
      attemptOutputPath: files.attemptPath,
    });

    const routeDecision = parseSceneAuthoringRouteDecisionV1(
      JSON.parse(await readFile(files.routeDecisionPath, "utf8")),
    );
    const attempt = parseSceneAuthoringAttemptV1(
      JSON.parse(await readFile(files.attemptPath, "utf8")),
    );
    expect(created).toEqual({ routeDecision, attempt });
    expect(routeDecision.decision).toEqual({
      kind: "canonical",
      authoringProfileRef: "worldkit://authoring-profile/canonical-outdoor@1",
      reasonCodes: ["user-selected-canonical"],
    });
    expect(attempt.sceneAuthoringRouteDecisionHash).toBe(
      hashSceneAuthoringRouteDecisionV1(routeDecision),
    );
    expect(attempt.sourceInput).toMatchObject({
      kind: "canonical",
      authoringInputRef:
        "worldkit://authoring-input/hosted-attempt-test/run-001@1",
    });
    expect(attempt.seed).toBe(17);
    expect(attempt.selectedAssetResources).toEqual([]);
  });

  it("publishes a completed Result bound to the final Canonical source and evidence", async () => {
    const files = await fixture();
    await freezeCanonicalRoute(files, "run-002");
    const { attempt } = await beginHostedCanonicalSceneAuthoringAttemptV1({
      sceneId: "hosted-attempt-test",
      runId: "run-002",
      sceneBriefPath: files.briefPath,
      authoringInputPath: files.authoringInputPath,
      routeDecisionPath: files.routeDecisionPath,
      attemptOutputPath: files.attemptPath,
    });
    const result = await completeHostedCanonicalSceneAuthoringAttemptV1({
      sceneId: "hosted-attempt-test",
      runId: "run-002",
      attemptPath: files.attemptPath,
      authoredSourcePath: files.authoredSourcePath,
      evidenceRefs: [
        "worldkit://evidence/runtime-snapshot/hosted-attempt-test/run-002@1",
        "worldkit://evidence/canonical-world-build/hosted-attempt-test/run-002@1",
      ],
      resultOutputPath: files.resultPath,
    });

    expect(parseSceneAuthoringAttemptResultV1(
      JSON.parse(await readFile(files.resultPath, "utf8")),
    )).toEqual(result);
    expect(result).toMatchObject({
      outcome: "completed",
      sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(attempt),
      authoredSourceRef:
        "worldkit://canonical-authoring-source/hosted-attempt-test/run-002@1",
    });
    expect("diagnosticRefs" in result).toBe(false);
  });

  it("publishes a rejected Result without any authored source identity", async () => {
    const files = await fixture();
    await freezeCanonicalRoute(files, "run-003");
    await beginHostedCanonicalSceneAuthoringAttemptV1({
      sceneId: "hosted-attempt-test",
      runId: "run-003",
      sceneBriefPath: files.briefPath,
      authoringInputPath: files.authoringInputPath,
      routeDecisionPath: files.routeDecisionPath,
      attemptOutputPath: files.attemptPath,
    });
    const result = await rejectHostedCanonicalSceneAuthoringAttemptV1({
      sceneId: "hosted-attempt-test",
      runId: "run-003",
      attemptPath: files.attemptPath,
      outcome: "rejected",
      diagnosticRefs: [
        "worldkit://diagnostic/hosted-canonical-authoring-rejected@1",
      ],
      resultOutputPath: files.resultPath,
    });

    expect(result.outcome).toBe("rejected");
    expect("authoredSourceRef" in result).toBe(false);
    expect("authoredSourceHash" in result).toBe(false);
    expect("evidenceRefs" in result).toBe(false);
  });

  it("rejects a mismatched scene rather than publishing an ambiguous Attempt", async () => {
    const files = await fixture();
    await freezeCanonicalRoute(files, "run-004");
    await expect(beginHostedCanonicalSceneAuthoringAttemptV1({
      sceneId: "different-scene",
      runId: "run-004",
      sceneBriefPath: files.briefPath,
      authoringInputPath: files.authoringInputPath,
      routeDecisionPath: files.routeDecisionPath,
      attemptOutputPath: files.attemptPath,
    })).rejects.toThrow("SCENE_AUTHORING_INPUT_SCENE_ID_MISMATCH");
  });
});
