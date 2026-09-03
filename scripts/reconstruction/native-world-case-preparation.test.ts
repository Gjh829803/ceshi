import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  hashWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import { afterEach, describe, expect, it } from "vitest";

import { prepareNativeWorldCaseV1 } from "./native-world-case-preparation.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("trusted Native world Case preparation", () => {
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
