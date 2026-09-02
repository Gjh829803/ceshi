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
    expect(reconstructionCase.referenceInputs).toHaveLength(1);
    expect(reconstructionCase.requiredEvidenceProfileRefs).toHaveLength(7);
    expect(await readFile(
      path.join(outputCaseRoot, "inputs", "builder-skill", "SKILL.md"),
      "utf8",
    )).toContain("WorldKit Native Block Builder");
  });
});
