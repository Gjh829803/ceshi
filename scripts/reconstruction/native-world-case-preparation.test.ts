import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

import {
  hashWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import { afterEach, describe, expect, it } from "vitest";

import {
  deriveNativeWorldBaselineProposalV1,
  prepareNativeWorldCaseV1,
} from "./native-world-case-preparation.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("trusted Native world Case preparation", () => {
  it("derives a closed report-only baseline Case without a Mapper model task", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-baseline-"));
    temporaryRoots.push(root);
    const palettePath = path.join(root, "visual-identity-palette.json");
    const entryPath = path.join(root, "entry-whitebox-target.png");
    await Promise.all([
      writeFile(palettePath, JSON.stringify({
        kind: "worldkit-visual-identity-palette",
        schemaVersion: 1,
        sceneId: "baseline-native-world",
        sceneBriefHash: `sha256:${"a".repeat(64)}`,
        movementMode: "ground-walk",
        movementModeLabel: "陆地步行",
        targets: [{
          id: "visual-target-1",
          visualTargetId: "visual-target-1",
          targetKind: "subject",
          name: "Explorer",
          description: "controlled Subject",
          role: "primary-subject",
          semanticClassId: "visual.subject",
          identityColor: "#E85D5D",
        }, {
          id: "visual-target-2",
          visualTargetId: "visual-target-2",
          targetKind: "landmark",
          name: "Volcano",
          description: "remote landmark",
          role: "primary-landmark",
          semanticClassId: "visual.landmark",
          identityColor: "#F28E2B",
        }],
      })),
      sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 220, g: 220, b: 220, alpha: 1 },
        },
      }).composite([{
        input: {
          create: {
            width: 20,
            height: 20,
            channels: 4,
            background: { r: 242, g: 142, b: 43, alpha: 1 },
          },
        },
        left: 40,
        top: 40,
      }]).png().toFile(entryPath),
    ]);

    const proposal = await deriveNativeWorldBaselineProposalV1({
      sceneId: "baseline-native-world",
      visualIdentityPalettePath: palettePath,
      entryWhiteboxTargetPath: entryPath,
    }) as {
      expected: {
        topology: {
          layerIds: readonly string[];
        };
        colliders: readonly {
          acceptanceTargetRef: string;
          contributionId: string;
          colliderId: string;
          role: "ground" | "blocker" | "step";
          requiresOverlay: boolean;
        }[];
        semanticSilhouetteTargets: readonly {
          acceptanceTargetRef: string;
          visualGroupId: string;
          normalizedBounds: unknown;
        }[];
        criticalTraversalChecks: readonly { id: string }[];
      };
      formalCaptureIntent: {
        semanticCaptureTargetBindings: readonly {
          acceptanceTargetRef: string;
          semanticLayerId: string;
        }[];
      };
      worldBounds: unknown;
    };
    expect(proposal.expected.semanticSilhouetteTargets.map(
      ({ acceptanceTargetRef }) => acceptanceTargetRef,
    )).toEqual([
      "worldkit://acceptance-target/entry-ground@1",
      "worldkit://acceptance-target/remote-ground@1",
      "worldkit://acceptance-target/visual-target-2@1",
    ]);
    expect(proposal.expected.semanticSilhouetteTargets.find(
      ({ visualGroupId }) => visualGroupId === "visual-target-2-group",
    )?.normalizedBounds).toEqual({
      minXBasisPoints: 4000,
      minYBasisPoints: 4000,
      maxXBasisPoints: 6000,
      maxYBasisPoints: 6000,
    });
    expect(proposal.expected.criticalTraversalChecks).toEqual([
      expect.objectContaining({ id: "entry-to-remote-ground-pass" }),
    ]);
    expect(proposal.expected.colliders).toEqual([
      expect.objectContaining({
        acceptanceTargetRef:
          "worldkit://acceptance-target/entry-ground@1",
        contributionId: "collider-entry-ground",
        colliderId: "collider-entry-ground",
        role: "ground",
      }),
      expect.objectContaining({
        acceptanceTargetRef:
          "worldkit://acceptance-target/remote-ground@1",
        contributionId: "collider-remote-ground",
        colliderId: "collider-remote-ground",
        role: "ground",
      }),
      {
        acceptanceTargetRef:
          "worldkit://acceptance-target/visual-target-2@1",
        contributionId: "collider-visual-target-2-solid",
        colliderId: "collider-visual-target-2-solid",
        role: "blocker",
        requiresOverlay: true,
      },
    ]);
    expect(proposal.formalCaptureIntent.semanticCaptureTargetBindings)
      .toHaveLength(3);
    expect(proposal.expected.topology.layerIds).toEqual([
      "foreground",
      "middle",
    ]);
    expect(proposal.expected.topology.layerIds).toEqual(
      [...new Set(proposal.formalCaptureIntent.semanticCaptureTargetBindings
        .map(({ semanticLayerId }) => semanticLayerId))].sort(),
    );
    expect(proposal.worldBounds).toEqual({
      centerMetersXZ: [0, -32],
      sizeMetersXZ: [128, 128],
      heightRangeMeters: [-16, 64],
    });

    const proposalPath = path.join(root, "host-derived-baseline-case.json");
    const briefPath = path.join(root, "scene-brief.md");
    const outputCaseRoot = path.join(root, "prepared-case");
    await Promise.all([
      writeFile(proposalPath, JSON.stringify(proposal)),
      writeFile(briefPath, "# Native World\n\nA complete playable block world.\n"),
    ]);
    const prepared = await prepareNativeWorldCaseV1({
      repositoryRoot: process.cwd(),
      sceneId: "baseline-native-world",
      proposalPath,
      sceneBriefPath: briefPath,
      referenceImagePaths: [entryPath],
      planningImagePaths: {
        worldPlanPath: entryPath,
        entryWhiteboxTargetPath: entryPath,
      },
      outputCaseRoot,
    });
    const reconstructionCase = parseWorldReconstructionCaseV1(JSON.parse(
      await readFile(prepared.casePath, "utf8"),
    ));
    const evaluationProfile = parseWorldReconstructionEvaluationProfileV1(
      JSON.parse(await readFile(prepared.evaluationProfilePath, "utf8")),
    );
    expect(reconstructionCase.expected.criticalTraversalChecks[0]?.id)
      .toBe("entry-to-remote-ground-pass");
    expect(reconstructionCase.expected.groundConnectivity
      .requiredTraversalBands[0]?.centerlineStandPositionsXYZMeters.at(-1))
      .toEqual({ xMeters: 0, yMeters: 0, zMeters: -12 });
    expect(evaluationProfile.thresholds.semanticSilhouetteTargets).toEqual([
      {
        acceptanceTargetRef:
          "worldkit://acceptance-target/entry-ground@1",
        maximumBoundsDriftBasisPoints: 10_000,
        maximumCenterDriftBasisPoints: 10_000,
        maximumCoverageDriftBasisPoints: 10_000,
      },
      {
        acceptanceTargetRef:
          "worldkit://acceptance-target/remote-ground@1",
        maximumBoundsDriftBasisPoints: 10_000,
        maximumCenterDriftBasisPoints: 10_000,
        maximumCoverageDriftBasisPoints: 10_000,
      },
      {
        acceptanceTargetRef:
          "worldkit://acceptance-target/visual-target-2@1",
        maximumBoundsDriftBasisPoints: 1600,
        maximumCenterDriftBasisPoints: 1000,
        maximumCoverageDriftBasisPoints: 1800,
      },
    ]);
    expect(evaluationProfile.thresholds.openingComposition.regions).toEqual([
      {
        targetRef: "worldkit://composition-target/entry-ground@1",
        maximumDriftBasisPoints: 10_000,
      },
      {
        targetRef: "worldkit://composition-target/remote-ground@1",
        maximumDriftBasisPoints: 10_000,
      },
      {
        targetRef: "worldkit://composition-target/visual-target-2@1",
        maximumDriftBasisPoints: 1600,
      },
    ]);
    expect(evaluationProfile.thresholds.openingComposition.anchors).toEqual([
      {
        targetRef: "worldkit://composition-target/entry-ground@1",
        maximumDriftBasisPoints: 10_000,
      },
      {
        targetRef: "worldkit://composition-target/remote-ground@1",
        maximumDriftBasisPoints: 10_000,
      },
      {
        targetRef: "worldkit://composition-target/visual-target-2@1",
        maximumDriftBasisPoints: 1000,
      },
    ]);
  });

  it("rejects a pass check whose acceptance target is only a blocker", async () => {
    const root = await mkdtemp(path.join(
      os.tmpdir(),
      "native-world-case-pass-target-",
    ));
    temporaryRoots.push(root);
    const proposalPath = path.join(root, "proposal.json");
    const briefPath = path.join(root, "scene-brief.md");
    const referencePath = path.join(root, "reference.png");
    const outputCaseRoot = path.join(root, "prepared-case");
    const [fixtureCase, formalCaptureIntent, worldBounds] = await Promise.all([
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/case.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/world-bounds.json", "utf8").then(JSON.parse),
    ]);
    fixtureCase.expected.criticalTraversalChecks[0].acceptanceTargetRef =
      "worldkit://acceptance-target/mountain-cliff-layers@1";
    await Promise.all([
      writeFile(briefPath, "# Native World\n"),
      writeFile(referencePath, "reference-bytes"),
      writeFile(proposalPath, JSON.stringify({
        kind: "native-world-case-proposal",
        schemaVersion: 1,
        sceneId: "invalid-native-pass-target",
        expected: fixtureCase.expected,
        formalCaptureIntent: {
          ...formalCaptureIntent,
          id: "invalid-native-pass-target.formal-world-capture-intent",
        },
        worldBounds,
      })),
    ]);

    await expect(prepareNativeWorldCaseV1({
      repositoryRoot: process.cwd(),
      sceneId: "invalid-native-pass-target",
      proposalPath,
      sceneBriefPath: briefPath,
      referenceImagePaths: [referencePath],
      planningImagePaths: {
        worldPlanPath: referencePath,
        entryWhiteboxTargetPath: referencePath,
      },
      outputCaseRoot,
    })).rejects.toThrow("WORLD_RECONSTRUCTION_CASE_INVALID");
  });

  it("rejects ground bands that evade Spawn origin or bind non-pass targets", async () => {
    const root = await mkdtemp(path.join(
      os.tmpdir(),
      "native-world-case-ground-connectivity-",
    ));
    temporaryRoots.push(root);
    const proposalPath = path.join(root, "proposal.json");
    const briefPath = path.join(root, "scene-brief.md");
    const referencePath = path.join(root, "reference.png");
    const outputCaseRoot = path.join(root, "prepared-case");
    const [fixtureCase, formalCaptureIntent, worldBounds] = await Promise.all([
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/case.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/world-bounds.json", "utf8").then(JSON.parse),
    ]);
    fixtureCase.expected.groundConnectivity.requiredTraversalBands[0]
      .centerlineStandPositionsXYZMeters[0].zMeters = 17;
    fixtureCase.expected.groundConnectivity.requiredTraversalBands.push({
      ...structuredClone(
        fixtureCase.expected.groundConnectivity.requiredTraversalBands[0],
      ),
      acceptanceTargetRef:
        "worldkit://acceptance-target/mountain-cliff-layers@1",
      id: "cliff-evasion-band",
    });
    await Promise.all([
      writeFile(briefPath, "# Native World\n"),
      writeFile(referencePath, "reference-bytes"),
      writeFile(proposalPath, JSON.stringify({
        kind: "native-world-case-proposal",
        schemaVersion: 1,
        sceneId: "invalid-native-ground-connectivity",
        expected: fixtureCase.expected,
        formalCaptureIntent: {
          ...formalCaptureIntent,
          id: "invalid-native-ground-connectivity.formal-world-capture-intent",
        },
        worldBounds,
      })),
    ]);

    await expect(prepareNativeWorldCaseV1({
      repositoryRoot: process.cwd(),
      sceneId: "invalid-native-ground-connectivity",
      proposalPath,
      sceneBriefPath: briefPath,
      referenceImagePaths: [referencePath],
      planningImagePaths: {
        worldPlanPath: referencePath,
        entryWhiteboxTargetPath: referencePath,
      },
      outputCaseRoot,
    })).rejects.toThrow("WORLD_RECONSTRUCTION_CASE_INVALID");
  });

  it("reports the exact Package bounds shape when Mapper copies Formal Capture AABB fields", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-case-bounds-"));
    temporaryRoots.push(root);
    const proposalPath = path.join(root, "proposal.json");
    const briefPath = path.join(root, "scene-brief.md");
    const referencePath = path.join(root, "reference.png");
    const outputCaseRoot = path.join(root, "prepared-case");
    const [fixtureCase, formalCaptureIntent] = await Promise.all([
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/case.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json", "utf8").then(JSON.parse),
    ]);
    await Promise.all([
      writeFile(briefPath, "# Native World\n"),
      writeFile(referencePath, "reference-bytes"),
      writeFile(proposalPath, JSON.stringify({
        kind: "native-world-case-proposal",
        schemaVersion: 1,
        sceneId: "invalid-native-world-bounds",
        expected: fixtureCase.expected,
        formalCaptureIntent: {
          ...formalCaptureIntent,
          id: "invalid-native-world-bounds.formal-world-capture-intent",
        },
        worldBounds: {
          minimumMetersXYZ: [-20, -2, -30],
          maximumMetersXYZ: [20, 24, 30],
        },
      })),
    ]);

    await expect(prepareNativeWorldCaseV1({
      repositoryRoot: process.cwd(),
      sceneId: "invalid-native-world-bounds",
      proposalPath,
      sceneBriefPath: briefPath,
      referenceImagePaths: [referencePath],
      planningImagePaths: {
        worldPlanPath: referencePath,
        entryWhiteboxTargetPath: referencePath,
      },
      outputCaseRoot,
    })).rejects.toThrow(
      "NATIVE_WORLD_CASE_WORLD_BOUNDS_INVALID: expected exactly centerMetersXZ, sizeMetersXZ, heightRangeMeters; received maximumMetersXYZ, minimumMetersXYZ; Formal Capture AABB fields are not Package worldBounds",
    );
  });

  it("rejects a parallel Native Collider contribution identity", async () => {
    const root = await mkdtemp(path.join(
      os.tmpdir(),
      "native-world-case-collider-identity-",
    ));
    temporaryRoots.push(root);
    const proposalPath = path.join(root, "proposal.json");
    const briefPath = path.join(root, "scene-brief.md");
    const referencePath = path.join(root, "reference.png");
    const outputCaseRoot = path.join(root, "prepared-case");
    const [fixtureCase, formalCaptureIntent, worldBounds] = await Promise.all([
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/case.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/world-bounds.json", "utf8").then(JSON.parse),
    ]);
    fixtureCase.expected.colliders[0].contributionId =
      "collider-central-steps-parallel";
    await Promise.all([
      writeFile(briefPath, "# Native World\n"),
      writeFile(referencePath, "reference-bytes"),
      writeFile(proposalPath, JSON.stringify({
        kind: "native-world-case-proposal",
        schemaVersion: 1,
        sceneId: "invalid-native-collider-identity",
        expected: fixtureCase.expected,
        formalCaptureIntent: {
          ...formalCaptureIntent,
          id: "invalid-native-collider-identity.formal-world-capture-intent",
        },
        worldBounds,
      })),
    ]);

    await expect(prepareNativeWorldCaseV1({
      repositoryRoot: process.cwd(),
      sceneId: "invalid-native-collider-identity",
      proposalPath,
      sceneBriefPath: briefPath,
      referenceImagePaths: [referencePath],
      planningImagePaths: {
        worldPlanPath: referencePath,
        entryWhiteboxTargetPath: referencePath,
      },
      outputCaseRoot,
    })).rejects.toThrow(
      "NATIVE_WORLD_CASE_COLLIDER_IDENTITY_INVALID: Babylon Native static " +
        "Collider contributionId must equal colliderId",
    );
  });

  it("binds an untrusted semantic proposal to Host profiles and immutable inputs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-case-"));
    temporaryRoots.push(root);
    const proposalPath = path.join(root, "proposal.json");
    const briefPath = path.join(root, "scene-brief.md");
    const referencePath = path.join(root, "reference.png");
    const outputCaseRoot = path.join(root, "prepared-case");
    const [fixtureCase, formalCaptureIntent, worldBounds] = await Promise.all([
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/case.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/world-bounds.json", "utf8").then(JSON.parse),
    ]);
    await Promise.all([
      writeFile(briefPath, "# Native World\n\nA complete playable block world.\n"),
      writeFile(referencePath, "reference-bytes"),
      writeFile(proposalPath, JSON.stringify({
        kind: "native-world-case-proposal",
        schemaVersion: 1,
        sceneId: "prepared-native-world",
        expected: fixtureCase.expected,
        formalCaptureIntent: {
          ...formalCaptureIntent,
          id: "prepared-native-world.formal-world-capture-intent",
        },
        worldBounds,
      })),
    ]);

    const prepared = await prepareNativeWorldCaseV1({
      repositoryRoot: process.cwd(),
      sceneId: "prepared-native-world",
      proposalPath,
      sceneBriefPath: briefPath,
      referenceImagePaths: [referencePath],
      planningImagePaths: {
        worldPlanPath: referencePath,
        entryWhiteboxTargetPath: referencePath,
      },
      outputCaseRoot,
    });

    const reconstructionCase = parseWorldReconstructionCaseV1(JSON.parse(
      await readFile(prepared.casePath, "utf8"),
    ));
    const profile = parseWorldReconstructionEvaluationProfileV1(JSON.parse(
      await readFile(path.join(outputCaseRoot, "evaluation-profile.json"), "utf8"),
    ));
    expect(reconstructionCase.id).toBe("prepared-native-world");
    expect(reconstructionCase.evaluationProfileHash).toBe(
      hashWorldReconstructionEvaluationProfileV1(profile),
    );
    expect(reconstructionCase.referenceInputs.map(({ inputRef }) => inputRef))
      .toEqual([
        "entry-whitebox-target.png",
        "reference-0.png",
        "world-plan.png",
      ]);
    expect(profile.qualityGateMode).toBe("report-only");
    await expect(readFile(
      path.join(outputCaseRoot, "inputs", "world-plan.png"),
      "utf8",
    )).resolves.toBe("reference-bytes");
    await expect(readFile(
      path.join(outputCaseRoot, "inputs", "entry-whitebox-target.png"),
      "utf8",
    )).resolves.toBe("reference-bytes");
    expect(reconstructionCase.requiredEvidenceProfileRefs).toHaveLength(7);
    expect(await readFile(
      path.join(outputCaseRoot, "inputs", "builder-skill", "SKILL.md"),
      "utf8",
    )).toContain("WorldKit Native Block Builder");
  });
});
