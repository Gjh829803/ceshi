import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { sha256Bytes } from "@whitebox-world/protocol";
import { decideSceneAuthoringRouteV1, type SceneAuthoringRouteDecisionV1 } from "@whitebox-world/scene-authoring-contracts";

import { prepareNativeBlockGenerationTaskV1 } from "./generation-request.js";

const hash = (character: string) => `sha256:${character.repeat(64)}` as `sha256:${string}`;

async function fixture(): Promise<Readonly<{ root: string; inputDirectory: string; routeDecision: SceneAuthoringRouteDecisionV1 }>> {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-generation-request-"));
  const inputDirectory = path.join(root, "inputs");
  await mkdir(inputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(inputDirectory, "scene-brief.md"), "# Cloud Temple\n"),
    writeFile(path.join(inputDirectory, "reference-0.png"), "reference"),
    writeFile(path.join(inputDirectory, "native-scene.bootstrap.json"), "{\"seed\":17}\n"),
    writeFile(path.join(inputDirectory, "native-scene-api.json"), "{\"api\":1}\n"),
    writeFile(path.join(inputDirectory, "native-scene-profile.json"), "{\"profile\":1}\n"),
    writeFile(path.join(inputDirectory, "block-profile.json"), "{\"blocks\":1}\n"),
    writeFile(path.join(inputDirectory, "instruction.md"), "Build exactly the declared files.\n"),
    writeFile(path.join(inputDirectory, "builder-skill.md"), "# Builder\n"),
  ]);
  const sceneBriefHash = sha256Bytes(new TextEncoder().encode("# Cloud Temple\n")) as `sha256:${string}`;
  const routeDecision = decideSceneAuthoringRouteV1({
    id: "cloud-temple-route",
    sceneBriefRef: "inputs/scene-brief.md",
    sceneBriefHash,
    trustProfileRef: "worldkit://trust-profile/trusted-local@1",
    trustProfileHash: hash("b"),
    requiredCapabilityRefs: [],
    requestedSourceKind: "babylon-native",
    nativeTrustAdmitted: true,
    referenceDrivenDistinctiveSilhouette: true,
  });
  return { root, inputDirectory, routeDecision };
}

function input(fixtureValue: Awaited<ReturnType<typeof fixture>>) {
  return {
    case: {
      id: "cloud-temple-t-gate-native-block",
      sceneBriefRef: "scene-brief.md",
      sceneBriefHash: fixtureValue.routeDecision.sceneBriefHash,
      referenceInputs: [{ inputRef: "reference-0.png", contentHash: sha256Bytes(new TextEncoder().encode("reference")) as `sha256:${string}`, mediaType: "image/png" as const }],
      evaluationProfileRef: "evaluation-profile.json",
      evaluationProfileHash: hash("d"),
      acceptanceTargetRefs: ["worldkit://acceptance-target/gate@1"],
      requiredEvidenceProfileRefs: ["worldkit://evidence-profile/native-block@1"],
    },
    profile: { id: "cloud-temple-profile", maximumRepairAttemptCount: 1 as const, builderSelfRepairAttemptCount: 0 as const },
    routeDecision: fixtureValue.routeDecision,
    attemptIndex: 0,
    backend: "cloud" as const,
    runDirectoryPath: path.join(fixtureValue.root, "runs", "initial"),
    inputDirectoryPath: fixtureValue.inputDirectory,
    taskInstructionPath: path.join(fixtureValue.inputDirectory, "instruction.md"),
    builderSkillPath: path.join(fixtureValue.inputDirectory, "builder-skill.md"),
    nativeSceneApiPath: path.join(fixtureValue.inputDirectory, "native-scene-api.json"),
    nativeSceneProfilePath: path.join(fixtureValue.inputDirectory, "native-scene-profile.json"),
    blockProfilePath: path.join(fixtureValue.inputDirectory, "block-profile.json"),
    bootstrapInputPath: path.join(fixtureValue.inputDirectory, "native-scene.bootstrap.json"),
    seed: 17,
    budgets: {
      maximumBlockCount: 2000,
      maximumStaticColliderCount: 500,
      maximumStaticColliderVertexCount: 200000,
      maximumStaticColliderTriangleCount: 100000,
      maximumOutputBytes: 4000000,
      timeoutSeconds: 900,
    },
  };
}

describe("prepareNativeBlockGenerationTaskV1", () => {
  it("freezes one canonical native request with three declared router outputs", async () => {
    const value = await fixture();
    try {
      const prepared = await prepareNativeBlockGenerationTaskV1(input(value));
      expect(prepared.routerArguments.filter((argument) => argument === "--output")).toHaveLength(3);
      expect(prepared.routerArguments).toEqual(expect.arrayContaining([
        "--execution-profile", "formal", "--submit-attempts", "1",
      ]));
      expect(prepared.generationRequest.declaredOutputPaths).toEqual([
        "scene.ts", "native-block-authoring.json", "native-resources.json",
      ]);
      expect(prepared.routerRequestId).toMatch(/^native-block-generation-/);
      expect(prepared.routerArguments).not.toContain(value.root);
      expect(prepared.attempt.sourceInput.kind).toBe("babylon-native");
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["canonical route", async (value: Awaited<ReturnType<typeof fixture>>) => ({ ...input(value), routeDecision: decideSceneAuthoringRouteV1({ id: "canonical", sceneBriefRef: "scene-brief.md", sceneBriefHash: hash("a"), trustProfileRef: "worldkit://trust-profile/trusted-local@1", trustProfileHash: hash("b"), requiredCapabilityRefs: [], requestedSourceKind: "canonical", nativeTrustAdmitted: true, referenceDrivenDistinctiveSilhouette: false }) })],
    ["second repair index", async (value: Awaited<ReturnType<typeof fixture>>) => ({ ...input(value), attemptIndex: 2 })],
    ["run directory escape", async (value: Awaited<ReturnType<typeof fixture>>) => ({ ...input(value), runDirectoryPath: path.join(value.root, "..", "escape") })],
  ])("rejects %s before process preparation", async (_label, mutate) => {
    const value = await fixture();
    try {
      await expect(prepareNativeBlockGenerationTaskV1(await mutate(value))).rejects.toThrow();
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects symbolic-link inputs and changed bytes after the Case hash was frozen", async () => {
    const value = await fixture();
    try {
      await rm(path.join(value.inputDirectory, "reference-0.png"));
      await symlink(path.join(value.inputDirectory, "scene-brief.md"), path.join(value.inputDirectory, "reference-0.png"));
      await expect(prepareNativeBlockGenerationTaskV1(input(value))).rejects.toThrow(/symbolic link/i);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });
});
