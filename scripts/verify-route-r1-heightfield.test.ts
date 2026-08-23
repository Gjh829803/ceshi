import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  runExactAdversarialVitestCheckV1,
  runRouteR1HeightfieldVerification,
} from "./verify-route-r1-heightfield.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

describe("verify:route-r1-heightfield", () => {
  it("fails closed when an exact adversarial test name matches no executed test", async () => {
    await expect(runExactAdversarialVitestCheckV1({
      repositoryRoot,
      checkId: "deliberate-no-match",
      testFile: "packages/traversal-recast/src/recast-config.test.ts",
      expectedTestFullNames: [
        "Recast tiled config mapping this exact test does not exist",
      ],
    })).rejects.toThrow("ADVERSARIAL_CHECK_TEST_NOT_EXECUTED");
  }, 30_000);

  it("runs every directly expressible Authoring V4 fixture through the trusted Route pipeline", async () => {
    const result = await runRouteR1HeightfieldVerification({ repositoryRoot });

    expect(result.ok).toBe(true);
    expect(result.fixtures.map((fixture) => [
      fixture.fixtureId,
      fixture.status,
      fixture.primaryDiagnosticCode,
    ])).toEqual([
      ["success", "passed", undefined],
      ["fail-wall", "failed", "ROUTE_REQUIRED_PATH_UNREACHABLE"],
      ["fail-slope", "failed", "ROUTE_SLOPE_EXCEEDED"],
      ["fail-width", "failed", "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT"],
      ["fail-overhead", "failed", "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT"],
      ["fail-water", "failed", "ROUTE_REQUIRED_PATH_UNREACHABLE"],
      ["fail-gap", "failed", "ROUTE_SURFACE_GAP_EXCEEDED"],
      ["fail-budget", "incomplete", "ROUTE_GRAPH_BUDGET_EXCEEDED"],
      ["fail-start-support", "failed", "ROUTE_START_SUPPORT_INVALID"],
      ["fail-start-surface", "failed", "ROUTE_START_SURFACE_NOT_FOUND"],
      ["fail-outside-detour", "failed", "ROUTE_REQUIRED_PATH_UNREACHABLE"],
    ]);
    expect(result.repeatSuccessReportHash).toBe(result.successReportHash);
    expect(result.concurrentSuccessReportHashes).toEqual([
      result.successReportHash,
      result.successReportHash,
    ]);
    expect(result.successRouteGateStatuses).toEqual({
      graph: "passed",
      runtime: "passed",
    });
    expect(result.plannerOnlyFieldsInCanonicalRoute).toEqual([]);
    expect(result.providerIdentityLeaks).toEqual([]);
    expect(result.scannedEvidenceKinds).toContain("route-overlay");
    expect(result.adversarialCheckIds).toEqual([
      "locked-capability-envelope-boundaries",
      "lock-mismatch",
      "graph-pass-runtime-stall",
      "support-loss",
      "route-deviation",
      "missing-probe-evidence",
      "render-cadence-30-60-120",
    ]);
    expect(result.adversarialCheckResults.map((check) => [
      check.checkId,
      check.executedTestFullNames.length,
    ])).toEqual([
      ["locked-capability-envelope-boundaries", 2],
      ["lock-mismatch", 1],
      ["graph-pass-runtime-stall", 1],
      ["support-loss", 1],
      ["route-deviation", 1],
      ["missing-probe-evidence", 1],
      ["render-cadence-30-60-120", 1],
    ]);
    expect(result.successRenderCadenceResults.map((result) =>
      result.renderCadence
    )).toEqual(["30-like", "60-like", "120-like"]);
    expect(new Set(result.successRenderCadenceResults.map((result) =>
      result.validationReportHash
    )).size).toBe(1);
    expect(new Set(result.successRenderCadenceResults.map((result) =>
      result.runtimeProbeReceiptHash
    )).size).toBe(1);
    expect(new Set(result.successRenderCadenceResults.map((result) =>
      result.finalRuntimeEvidenceHash
    )).size).toBe(1);
    expect(new Set(result.successRenderCadenceResults.map((result) =>
      result.processedTickCount
    )).size).toBe(1);
  }, 600_000);

});
