import { describe, expect, it } from "vitest";

import {
  parseWorldReconstructionCaseArtifactRefV1,
} from "./world-reconstruction-case-artifact-ref.js";

describe("World Reconstruction Case Artifact Ref", () => {
  it("accepts only the single canonical Case artifact namespace", () => {
    expect(parseWorldReconstructionCaseArtifactRefV1(
      "artifact://world-reconstruction-case/cloud-temple.case/case.json",
    )).toBe(
      "artifact://world-reconstruction-case/cloud-temple.case/case.json",
    );

    for (const value of [
      "worldkit://world-reconstruction-case/cloud-temple.case",
      "artifact://case/cloud-temple.case/case.json",
      "artifact://other-family/cloud-temple.case/case.json",
      "artifact://user@world-reconstruction-case/cloud-temple.case/case.json",
      "artifact://world-reconstruction-case:443/cloud-temple.case/case.json",
      "artifact://world-reconstruction-case/cloud-temple.case/case.json?attempt=0",
      "artifact://world-reconstruction-case/cloud-temple.case/case.json#case",
      "artifact://world-reconstruction-case/../cloud-temple.case/case.json",
      "artifact://world-reconstruction-case/%63loud-temple.case/case.json",
      "artifact://WORLD-RECONSTRUCTION-CASE/cloud-temple.case/case.json",
      "artifact://world-reconstruction-case/cafe\u0301/case.json",
      1,
      null,
    ]) {
      expect(() => parseWorldReconstructionCaseArtifactRefV1(value)).toThrowError(
        "WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID",
      );
    }
  });
});
