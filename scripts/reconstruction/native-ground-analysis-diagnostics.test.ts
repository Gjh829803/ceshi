import type {
  BabylonNativeBlockGroundAnalysisReportV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import { describe, expect, it } from "vitest";

import {
  createNativeGroundAnalysisRepairDiagnosticsV1,
} from "./native-ground-analysis-diagnostics.js";

describe("Native Block ground-analysis diagnostic Host adapter", () => {
  it("maps Profile facts into the sole actionable reconstruction DTO", () => {
    const report = {
      failureFacts: [{
        id: "ground-analysis:ground-clearance-millimeters:spawn-check",
        acceptanceTargetRef: "worldkit://acceptance-target/spawn@1",
        targetId: "spawn-check",
        metricId: "ground-clearance-millimeters",
        details: {
          kind: "millimeters-threshold",
          expectedMillimeters: 1_000,
          actualMillimeters: 750,
          maximumAllowedDriftMillimeters: 0,
          exceededByMillimeters: 250,
          correctionDirection: "increase",
        },
        evidenceRef:
          "artifact://case/ground-case/evidence/logical-ground-model.json",
        affectedSourceBlockIds: ["overhead-block"],
        message: "Spawn has only 750mm vertical clearance.",
        repairInstruction:
          "Raise or remove the explicit Blocks above spawn-check.",
      }],
    } as unknown as BabylonNativeBlockGroundAnalysisReportV1;

    const diagnostics = createNativeGroundAnalysisRepairDiagnosticsV1(report);

    expect(diagnostics).toEqual([{
      kind: "world-reconstruction-diagnostic",
      schemaVersion: 1,
      id: "ground-analysis:ground-clearance-millimeters:spawn-check",
      code: "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
      dimensionId: "critical-traversal",
      acceptanceTargetRef: "worldkit://acceptance-target/spawn@1",
      targetRef: "worldkit://acceptance-target/spawn@1",
      targetId: "spawn-check",
      metricId: "ground-clearance-millimeters",
      details: {
        kind: "millimeters-threshold",
        expectedMillimeters: 1_000,
        actualMillimeters: 750,
        maximumAllowedDriftMillimeters: 0,
        exceededByMillimeters: 250,
        correctionDirection: "increase",
      },
      evidenceRefs: [
        "artifact://case/ground-case/evidence/logical-ground-model.json",
      ],
      message: "Spawn has only 750mm vertical clearance. Affected source Blocks: overhead-block.",
      repairAction: {
        kind: "revise-native-source",
        targetKind: "traversal-check",
        targetId: "spawn-check",
        operation: "adjust-traversal",
        instruction: "Raise or remove the explicit Blocks above spawn-check. Affected source Blocks: overhead-block.",
      },
    }]);
    expect(Object.isFrozen(diagnostics)).toBe(true);
  });

  it("fails closed when a Profile fact no longer matches Validation", () => {
    const malformed = {
      failureFacts: [{
        id: "ground-analysis:ground-clearance-millimeters:spawn-check",
        acceptanceTargetRef: "worldkit://acceptance-target/spawn@1",
        targetId: "spawn-check",
        metricId: "ground-clearance-millimeters",
        details: {
          kind: "state-mismatch",
          expectedValue: "clear",
          actualValue: "blocked",
          correctionDirection: "replace",
        },
        evidenceRef: "artifact://case/ground-case/evidence/model.json",
        affectedSourceBlockIds: [],
        message: "Malformed metric/detail pairing.",
        repairInstruction: "Repair explicit Blocks.",
      }],
    } as unknown as BabylonNativeBlockGroundAnalysisReportV1;

    expect(() => createNativeGroundAnalysisRepairDiagnosticsV1(malformed))
      .toThrow("does not match metric ground-clearance-millimeters");
  });
});
