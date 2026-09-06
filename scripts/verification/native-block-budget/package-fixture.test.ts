import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1 } from
  "@whitebox-world/native-babylon-block-profile/host";
import { prepareBudgetRuntimeFixture } from "./package-fixture.test-support.js";

afterEach(() => vi.unstubAllGlobals());

describe("CF-20 budget measurement Package", () => {
  it("compares every chunk candidate on the admitted epoch without claiming alternative Runtime measurements", async () => {
    const fixtureFiles = new Map([
      ["/budget-gameplay-bootstrap.json", "apps/playground/public/world-packages/cloud-ridge/gameplay/bootstrap.json"],
      ["/budget-runtime-bootstrap.json", "apps/playground/public/world-packages/cloud-ridge/runtime/world-runtime-bootstrap.json"],
    ]);
    vi.stubGlobal("fetch", async (url: string) => {
      const file = fixtureFiles.get(url);
      if (!file) throw new Error(`Unexpected fixture fetch: ${url}`);
      return new Response(await readFile(file, "utf8"), { headers: { "Content-Type": "application/json" } });
    });
    const fixture = await prepareBudgetRuntimeFixture(2_000);
    expect(fixture.verified.kind).toBe("babylon-native-scene");
    expect(fixture.measurement.blockCount).toBe(2_000);
    expect(fixture.measurement.runtimeChunkPolicy).toEqual({
      id: "chunk-xz-4m", hash: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1,
    });
    const comparison = fixture.measurement.chunkCandidateComparison;
    expect(comparison.measurementKind).toBe("deterministic-resource-counts");
    expect(comparison.measuredCaseIds).toEqual(["synthetic-budget-2000"]);
    expect(comparison.policyRows.map(({ chunkEdgeMetersXZ }) => chunkEdgeMetersXZ[0]).sort((a, b) => a - b))
      .toEqual([2, 4, 8, 16, 32]);
    for (const row of comparison.policyRows) {
      expect(row.caseMeasurements).toHaveLength(1);
      expect(row.caseMeasurements[0]!.profileInventoryHash).toBe(fixture.measurement.profileInventoryHash);
      expect(row.totals.baselineVisualDrawUnitCount).toBe(2_000);
      expect(row.totals.colliderProxyCount).toBe(fixture.measurement.colliderCount);
      expect(row.totals.colliderTriangleCount).toBe(fixture.measurement.colliderTriangleCount);
    }
    // A synthetic workload cannot satisfy the pending real reconstruction Cases.
    expect(comparison.selection.isRealCaseEvidenceComplete).toBe(false);
    expect(comparison.selection.pendingRealCaseIds.length).toBeGreaterThan(0);
  }, 60_000);
});
