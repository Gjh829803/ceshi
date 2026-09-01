import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import {
  formalWorldCaptureRequestCanonicalBytesV1,
  hashBabylonNativeSceneContributionV1,
  hashFormalWorldCaptureRequestV1,
  parseFormalWorldCaptureRequestV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashSceneAuthoringAttemptV1,
  parseSceneAuthoringAttemptV1,
} from "@whitebox-world/scene-authoring-contracts";
import {
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import {
  createBabylonNativeWorldPackageV1,
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import {
  createBabylonNativeBlockWorldPackageTestInputV1,
  createBabylonNativeWorldPackageTestInputV1,
} from "@whitebox-world/world-package/testing";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { writeWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import {
  assertFormalCaptureRequestMatchesVerifiedPackageV1,
} from "./formal-capture.js";
import {
  FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
  materializeFormalWorldCaptureRequestV1,
  type MaterializeFormalWorldCaptureRequestInputV1,
} from "./formal-capture-request.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

const OPENING_TARGET = "worldkit://acceptance-target/package-fixture-opening@1";
const SECONDARY_TARGET =
  "worldkit://acceptance-target/package-fixture-secondary@1";
const OPENING_COMPOSITION =
  "worldkit://composition-target/package-fixture-opening@1";
const SECONDARY_COMPOSITION =
  "worldkit://composition-target/package-fixture-secondary@1";

function profileValue() {
  const dimensionIds = [
    "collider",
    "critical-traversal",
    "deterministic-build",
    "opening-composition",
    "semantic-silhouette",
    "spawn-support",
    "topology",
  ] as const;
  return parseWorldReconstructionEvaluationProfileV1({
    kind: "world-reconstruction-evaluation-profile",
    schemaVersion: 1,
    id: "package-fixture-profile",
    dimensionIds,
    maximumRepairAttemptCount: 1,
    builderSelfRepairAttemptCount: 0,
    thresholds: {
      semanticSilhouetteTargets: [{
        acceptanceTargetRef: OPENING_TARGET,
        maximumBoundsDriftBasisPoints: 100,
        maximumCenterDriftBasisPoints: 100,
        maximumCoverageDriftBasisPoints: 100,
      }, {
        acceptanceTargetRef: SECONDARY_TARGET,
        maximumBoundsDriftBasisPoints: 100,
        maximumCenterDriftBasisPoints: 100,
        maximumCoverageDriftBasisPoints: 100,
      }],
      openingComposition: {
        regions: [{
          targetRef: OPENING_COMPOSITION,
          maximumDriftBasisPoints: 100,
        }, {
          targetRef: SECONDARY_COMPOSITION,
          maximumDriftBasisPoints: 100,
        }],
        anchors: [{
          targetRef: OPENING_COMPOSITION,
          maximumDriftBasisPoints: 100,
        }, {
          targetRef: SECONDARY_COMPOSITION,
          maximumDriftBasisPoints: 100,
        }],
        maximumOrderDistanceBasisPoints: 100,
      },
      spawnSupport: {
        maximumPositionDriftMillimeters: 100,
        maximumSupportGapMillimeters: 10,
      },
    },
    requiredEvidenceByDimension: dimensionIds.map((dimensionId) => ({
      dimensionId,
      evidenceProfileRefs: [`worldkit://evidence-profile/${dimensionId}@1`],
    })),
  });
}

async function fixture(): Promise<Readonly<{
  caseRoot: string;
  input: MaterializeFormalWorldCaptureRequestInputV1;
  verifiedPackage: Extract<
    ReturnType<typeof verifyWorldPackageDirectoryV1>,
    { kind: "babylon-native-scene" }
  >;
}>> {
  const caseRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), "formal-capture-request-")),
  );
  temporaryRoots.push(caseRoot);
  const attemptDirectoryPath = path.join(caseRoot, "attempts", "0");
  const packageDirectoryPath = path.join(attemptDirectoryPath, "world-package");
  const outputPath = path.join(
    attemptDirectoryPath,
    FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
  );
  const profile = profileValue();
  const requiredEvidenceProfileRefs = profile.requiredEvidenceByDimension
    .flatMap((entry) => entry.evidenceProfileRefs)
    .slice()
    .sort();
  const baseInput = createBabylonNativeBlockWorldPackageTestInputV1();
  const baseMetadata = baseInput.nativeBlockMaterializerMetadata!;
  const nativeSceneContribution = {
    ...baseInput.nativeSceneContribution,
    profileSettlement: {
      ...baseInput.nativeSceneContribution.profileSettlement,
      targetCount: 2,
    },
  } as typeof baseInput.nativeSceneContribution;
  const reconstructionCase = parseWorldReconstructionCaseV1({
    kind: "world-reconstruction-case",
    schemaVersion: 1,
    id: "package-fixture.case",
    sceneBriefRef: baseInput.sceneAuthoringAttempt.sceneBriefRef,
    sceneBriefHash: baseInput.sceneAuthoringAttempt.sceneBriefHash,
    referenceInputs: [{
      inputRef: "artifact://case/package-fixture/reference.png",
      contentHash: `sha256:${"e".repeat(64)}`,
      mediaType: "image/png",
    }],
    evaluationProfileRef: "evaluation-profile.json",
    evaluationProfileHash: hashWorldReconstructionEvaluationProfileV1(profile),
    acceptanceTargetRefs: [OPENING_TARGET, SECONDARY_TARGET],
    requiredEvidenceProfileRefs,
    expected: {
      topology: {
        acceptanceTargetRef: OPENING_TARGET,
        nodeIds: ["package-fixture-opening", "package-fixture-secondary"],
        relations: [{
          fromNodeId: "package-fixture-opening",
          relation: "connects-to",
          toNodeId: "package-fixture-secondary",
        }],
        layerIds: ["ground", "upper"],
      },
      semanticSilhouetteTargets: [{
        acceptanceTargetRef: OPENING_TARGET,
        visualGroupId: "ground-group",
        normalizedBounds: {
          minXBasisPoints: 100,
          minYBasisPoints: 200,
          maxXBasisPoints: 900,
          maxYBasisPoints: 800,
        },
        normalizedCenter: { xBasisPoints: 500, yBasisPoints: 500 },
        coverageBasisPoints: 4_800,
      }, {
        acceptanceTargetRef: SECONDARY_TARGET,
        visualGroupId: "ridge-group",
        normalizedBounds: {
          minXBasisPoints: 400,
          minYBasisPoints: 100,
          maxXBasisPoints: 600,
          maxYBasisPoints: 300,
        },
        normalizedCenter: { xBasisPoints: 500, yBasisPoints: 200 },
        coverageBasisPoints: 400,
      }],
      openingComposition: {
        acceptanceTargetRef: OPENING_TARGET,
        targetRefs: [OPENING_COMPOSITION, SECONDARY_COMPOSITION],
        regions: [{
          targetRef: OPENING_COMPOSITION,
          normalizedBounds: {
            minXBasisPoints: 100,
            minYBasisPoints: 200,
            maxXBasisPoints: 900,
            maxYBasisPoints: 800,
          },
        }, {
          targetRef: SECONDARY_COMPOSITION,
          normalizedBounds: {
            minXBasisPoints: 400,
            minYBasisPoints: 100,
            maxXBasisPoints: 600,
            maxYBasisPoints: 300,
          },
        }],
        anchors: [{
          targetRef: OPENING_COMPOSITION,
          normalizedCenter: { xBasisPoints: 500, yBasisPoints: 500 },
        }, {
          targetRef: SECONDARY_COMPOSITION,
          normalizedCenter: { xBasisPoints: 500, yBasisPoints: 200 },
        }],
        orderedTargetRefs: [OPENING_COMPOSITION, SECONDARY_COMPOSITION],
      },
      spawnSupport: {
        acceptanceTargetRef: OPENING_TARGET,
        spawnMarkerId: "player-spawn",
        supportColliderId: "ground",
        expectedMedium: "ground",
        expectedPositionXYZMeters: { xMeters: 0, yMeters: 0, zMeters: 0 },
      },
      colliders: [{
        acceptanceTargetRef: OPENING_TARGET,
        contributionId: "ground",
        colliderId: "ground",
        role: "ground",
        requiresOverlay: true,
      }],
      criticalTraversalChecks: [{
        acceptanceTargetRef: OPENING_TARGET,
        id: "ground-check",
        evidenceKind: "scripted-fixed-input",
        expectation: "pass",
        checkpointIds: ["ground-checkpoint"],
        fixedInputSequence: [{ actions: ["move-forward"], ticks: 1 }],
      }],
      deterministicBuild: {
        acceptanceTargetRef: OPENING_TARGET,
        requiresCandidateReplay: true,
        requiresWorldPackageIdentityAgreement: true,
        requiresBuildIdentityAgreement: true,
        requiresCaptureIdentityAgreement: true,
      },
    },
  });
  const caseHash = hashWorldReconstructionCaseV1(reconstructionCase);
  const sceneAuthoringAttempt = parseSceneAuthoringAttemptV1({
    ...baseInput.sceneAuthoringAttempt,
    acceptanceTargetRefs: reconstructionCase.acceptanceTargetRefs,
    requiredEvidenceProfileRefs: reconstructionCase.requiredEvidenceProfileRefs,
  });
  const sceneAuthoringAttemptResult = {
    ...baseInput.sceneAuthoringAttemptResult,
    sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(sceneAuthoringAttempt),
  };
  const nativeBlockMaterializerMetadata = {
    ...baseMetadata,
    caseHash,
    contributionHash: hashBabylonNativeSceneContributionV1(nativeSceneContribution),
    blocks: [...baseMetadata.blocks, {
      blockId: "ridge-block",
      runtimeEntityId: "native-block:ridge-block",
      semanticCaptureClassId: "worldkit.native-block.group.ridge-group",
      shape: "full" as const,
      paletteRole: "structure" as const,
      visualGroupId: "ridge-group",
      centerMetersXYZ: [0, 1, 4] as const,
      rotationQuarterTurnsY: 0 as const,
      sizeMetersXYZ: [2, 2, 2] as const,
    }],
    visualGroups: [...baseMetadata.visualGroups, {
      visualGroupId: "ridge-group",
      acceptanceTargetRef: SECONDARY_TARGET,
      semanticClassId: "structure.fixture",
      identityColorHex: "#AA0002" as const,
      blockIds: ["ridge-block"],
      paletteRoles: ["structure" as const],
      minimumMetersXYZ: [-1, 0, 3] as const,
      maximumMetersXYZ: [1, 2, 5] as const,
    }],
  };
  const directory = createBabylonNativeWorldPackageV1({
    ...baseInput,
    sceneAuthoringAttempt,
    sceneAuthoringAttemptResult,
    nativeSceneContribution,
    nativeBlockMaterializerMetadata,
  });
  const verifiedPackage = verifyWorldPackageDirectoryV1(directory);
  if (verifiedPackage.kind !== "babylon-native-scene") {
    throw new Error("expected Native Package fixture");
  }
  const metadata = verifiedPackage.nativeBlockMaterializerMetadata!;
  const openingGroup = metadata.visualGroups.find(
    (group) => group.visualGroupId === "ground-group",
  )!;
  await mkdir(attemptDirectoryPath, { recursive: true, mode: 0o700 });
  await writeWorldPackageDirectoryV1({
    outputDirectoryPath: packageDirectoryPath,
    directory: verifiedPackage.directory,
  });
  await writeFile(
    path.join(caseRoot, "case.json"),
    stringifyCanonicalJson(reconstructionCase),
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    path.join(caseRoot, "evaluation-profile.json"),
    stringifyCanonicalJson(profile),
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    path.join(attemptDirectoryPath, "attempt.json"),
    stringifyCanonicalJson(verifiedPackage.sceneAuthoringAttempt),
    { flag: "wx", mode: 0o600 },
  );
  return Object.freeze({
    caseRoot,
    verifiedPackage,
    input: Object.freeze({
      casePath: path.join(caseRoot, "case.json"),
      evaluationProfilePath: path.join(caseRoot, "evaluation-profile.json"),
      sceneAuthoringAttemptPath: path.join(attemptDirectoryPath, "attempt.json"),
      packageDirectoryPath,
      outputPath,
      captureProfile: Object.freeze({
        widthPixels: 320,
        heightPixels: 180,
        devicePixelRatio: 1,
      }),
      semanticCaptureTargetBindings: Object.freeze([{
        acceptanceTargetRef: OPENING_TARGET,
        compositionTargetRef: OPENING_COMPOSITION,
        topologyNodeId: "package-fixture-opening",
        semanticLayerId: "ground",
        blockVisualGroupId: "ground-group",
      }, {
        acceptanceTargetRef: SECONDARY_TARGET,
        compositionTargetRef: SECONDARY_COMPOSITION,
        topologyNodeId: "package-fixture-secondary",
        semanticLayerId: "upper",
        blockVisualGroupId: "ridge-group",
      }]),
      topologyRelations: Object.freeze([{
        fromNodeId: "package-fixture-opening",
        relation: "connects-to" as const,
        toNodeId: "package-fixture-secondary",
        measurementSource: "package-bounds" as const,
        fromVisualGroupId: "ground-group",
        toVisualGroupId: "ridge-group",
      }]),
      checkpointSpatialCriteria: Object.freeze([{
        kind: "reach-bounds" as const,
        checkpointId: "ground-checkpoint",
        expectation: "reach" as const,
        sourceVisualGroupId: "ground-group",
        sourceBoundsMeters: {
          minimumMetersXYZ: openingGroup.minimumMetersXYZ,
          maximumMetersXYZ: openingGroup.maximumMetersXYZ,
        },
        capsuleRadiusMeters: 0.35,
        toleranceMeters: 0.05,
      }]),
    }),
  });
}

describe("materializeFormalWorldCaptureRequestV1", () => {
  it("writes one canonical request from frozen Case/Attempt/Package/Profile identities", async () => {
    const { input, verifiedPackage } = await fixture();
    const materialized = await materializeFormalWorldCaptureRequestV1(input);
    const bytes = new Uint8Array(await readFile(input.outputPath));
    const parsed = parseFormalWorldCaptureRequestV1(JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ));

    expect(bytes).toEqual(formalWorldCaptureRequestCanonicalBytesV1(parsed));
    expect(parsed).toEqual(materialized.request);
    expect(materialized.formalRequestHash).toBe(
      hashFormalWorldCaptureRequestV1(parsed),
    );
    expect(parsed.caseHash).toBe(hashWorldReconstructionCaseV1(
      parseWorldReconstructionCaseV1(JSON.parse(
        await readFile(input.casePath, "utf8"),
      )),
    ));
    expect(parsed.evaluationProfileHash).toBe(
      hashWorldReconstructionEvaluationProfileV1(
        parseWorldReconstructionEvaluationProfileV1(JSON.parse(
          await readFile(input.evaluationProfilePath, "utf8"),
        )),
      ),
    );
    expect(parsed.sceneAuthoringAttemptHash).toBe(
      hashSceneAuthoringAttemptV1(verifiedPackage.sceneAuthoringAttempt),
    );
    expect(parsed.worldPackageRootHash).toBe(
      verifiedPackage.receipt.worldPackageRootHash,
    );
    expect(assertFormalCaptureRequestMatchesVerifiedPackageV1({
      verifiedPackage,
      request: parsed,
    })).toEqual({
      verifiedPackage,
      request: parsed,
      formalRequestHash: materialized.formalRequestHash,
    });
    expect((await readdir(path.dirname(input.outputPath)))
      .filter((name) => name.includes("formal-world-capture-request")))
      .toEqual([FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1]);
  });

  it("rejects caller-provided hashes and does not import Hosted/Runtime owners", async () => {
    const source = await readFile(
      new URL("./formal-capture-request.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("parseFormalWorldCaptureRequestV1");
    expect(source).toContain("hashFormalWorldCaptureRequestV1");
    expect(source).not.toContain("hosted-session-capture");
    expect(source).not.toContain("runtime-babylon");
    expect(source).not.toContain("worldkit-server");
    expect(source).not.toContain("./formal-capture.js");

    const { input } = await fixture();
    await expect(materializeFormalWorldCaptureRequestV1({
      ...input,
      caseHash: `sha256:${"0".repeat(64)}`,
    } as MaterializeFormalWorldCaptureRequestInputV1)).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID",
    );
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a missing Attempt before Browser or output publication", async () => {
    const { input } = await fixture();
    await rm(input.sceneAuthoringAttemptPath);
    await expect(materializeFormalWorldCaptureRequestV1(input)).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID",
    );
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects stale Case identity", async () => {
    const { input } = await fixture();
    const reconstructionCase = parseWorldReconstructionCaseV1(JSON.parse(
      await readFile(input.casePath, "utf8"),
    ));
    await writeFile(
      input.casePath,
      stringifyCanonicalJson({
        ...reconstructionCase,
        id: "package-fixture.stale-case",
      }),
    );
    await expect(materializeFormalWorldCaptureRequestV1(input)).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_IDENTITY_MISMATCH: caseHash",
    );
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects stale Evaluation Profile identity", async () => {
    const { input } = await fixture();
    const profile = parseWorldReconstructionEvaluationProfileV1(JSON.parse(
      await readFile(input.evaluationProfilePath, "utf8"),
    ));
    await writeFile(
      input.evaluationProfilePath,
      stringifyCanonicalJson({
        ...profile,
        id: "package-fixture-stale-profile",
      }),
    );
    await expect(materializeFormalWorldCaptureRequestV1(input)).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_IDENTITY_MISMATCH: evaluationProfileHash",
    );
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects stale SceneAuthoringAttempt identity", async () => {
    const { input } = await fixture();
    const attempt = parseSceneAuthoringAttemptV1(JSON.parse(
      await readFile(input.sceneAuthoringAttemptPath, "utf8"),
    ));
    await writeFile(
      input.sceneAuthoringAttemptPath,
      stringifyCanonicalJson({
        ...attempt,
        id: "package-fixture-stale-attempt",
      }),
    );
    await expect(materializeFormalWorldCaptureRequestV1(input)).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_IDENTITY_MISMATCH: sceneAuthoringAttemptHash",
    );
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects stale or foreign WorldPackage identity", async () => {
    const { input, caseRoot } = await fixture();
    const stalePackageDirectoryPath = path.join(
      caseRoot,
      "attempts",
      "0",
      "stale-world-package",
    );
    const staleDirectory = createBabylonNativeWorldPackageV1(
      createBabylonNativeBlockWorldPackageTestInputV1(),
    );
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath: stalePackageDirectoryPath,
      directory: staleDirectory,
    });
    await expect(materializeFormalWorldCaptureRequestV1({
      ...input,
      packageDirectoryPath: stalePackageDirectoryPath,
      outputPath: path.join(
        path.dirname(stalePackageDirectoryPath),
        FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
      ),
    })).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_IDENTITY_MISMATCH",
    );

    const foreignPackageDirectoryPath = path.join(
      caseRoot,
      "attempts",
      "0",
      "foreign-world-package",
    );
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath: foreignPackageDirectoryPath,
      directory: createBabylonNativeWorldPackageV1(
        createBabylonNativeWorldPackageTestInputV1(),
      ),
    });
    await expect(materializeFormalWorldCaptureRequestV1({
      ...input,
      packageDirectoryPath: foreignPackageDirectoryPath,
      outputPath: path.join(
        path.dirname(foreignPackageDirectoryPath),
        FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
      ),
    })).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_IDENTITY_MISMATCH: worldPackage",
    );
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a symlinked Case input", async () => {
    const { input, caseRoot } = await fixture();
    const linkedCasePath = path.join(caseRoot, "linked-case.json");
    await symlink(input.casePath, linkedCasePath);
    await expect(materializeFormalWorldCaptureRequestV1({
      ...input,
      casePath: linkedCasePath,
    })).rejects.toThrow("FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID");
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects an output path that escapes the Case root", async () => {
    const { input, caseRoot } = await fixture();
    await expect(materializeFormalWorldCaptureRequestV1({
      ...input,
      outputPath: path.resolve(
        caseRoot,
        "..",
        FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
      ),
    })).rejects.toThrow("FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID");
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a duplicate output", async () => {
    const { input } = await fixture();
    await materializeFormalWorldCaptureRequestV1(input);
    await expect(materializeFormalWorldCaptureRequestV1(input)).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID: outputPath duplicate",
    );
    expect(await readdir(path.dirname(input.outputPath))).toEqual(
      expect.arrayContaining([FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1]),
    );
    expect((await readdir(path.dirname(input.outputPath)))
      .filter((name) => name.startsWith("."))).toEqual([]);
  });

  it("cleans partial staging after a failed publication", async () => {
    const { input } = await fixture();
    await expect(materializeFormalWorldCaptureRequestV1(input, {
      hooks: {
        beforeRename: async () => {
          throw new Error("staging publication failed");
        },
      },
    })).rejects.toThrow("staging publication failed");
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await readdir(path.dirname(input.outputPath)))
      .filter((name) => name.includes("formal-world-capture-request")))
      .toEqual([]);
  });
});
