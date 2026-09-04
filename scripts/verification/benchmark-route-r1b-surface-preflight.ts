import os from "node:os";
import process from "node:process";
import { performance } from "node:perf_hooks";

import {
  preflightCanonicalTraversalSurfaceOverlapsV1,
  type CanonicalTraversalSurfaceTriangleSourceV1,
} from "@whitebox-world/terrain-surface";

type FixtureName = "representative" | "near-budget" | "disjoint-heavy";

interface BenchmarkFixture {
  readonly name: FixtureName;
  readonly sources: readonly CanonicalTraversalSurfaceTriangleSourceV1[];
  readonly expectedBroadphaseCandidateCount: number;
  readonly maximumTraversalSurfaceTrianglePairTestCount: number;
}

function horizontalTriangleSource(
  traversalSurfaceId: string,
  heightsMeters: readonly number[],
  originMetersXZ: readonly [number, number] = [0, 0],
): CanonicalTraversalSurfaceTriangleSourceV1 {
  const worldPositionsMetersXYZ: number[] = [];
  const triangleIndices: number[] = [];
  for (const heightMeters of heightsMeters) {
    const firstVertexIndex = worldPositionsMetersXYZ.length / 3;
    worldPositionsMetersXYZ.push(
      originMetersXZ[0],
      heightMeters,
      originMetersXZ[1],
      originMetersXZ[0],
      heightMeters,
      originMetersXZ[1] + 1,
      originMetersXZ[0] + 1,
      heightMeters,
      originMetersXZ[1],
    );
    triangleIndices.push(
      firstVertexIndex,
      firstVertexIndex + 1,
      firstVertexIndex + 2,
    );
  }
  return { traversalSurfaceId, worldPositionsMetersXYZ, triangleIndices };
}

function representativeFixture(): BenchmarkFixture {
  return {
    name: "representative",
    sources: [
      horizontalTriangleSource("terrain-main", [0, 0.1]),
      horizontalTriangleSource("platform-deck", [2, 2.1]),
      horizontalTriangleSource("distant-platform", [1, 1.1], [100, 100]),
    ],
    expectedBroadphaseCandidateCount: 4,
    maximumTraversalSurfaceTrianglePairTestCount: 4_000_000,
  };
}

function nearBudgetFixture(): BenchmarkFixture {
  const firstTriangleCount = 2_000;
  const secondTriangleCount = 2_001;
  return {
    name: "near-budget",
    sources: [
      horizontalTriangleSource(
        "layer-a",
        Array.from({ length: firstTriangleCount }, (_, index) => index),
      ),
      horizontalTriangleSource(
        "layer-b",
        Array.from(
          { length: secondTriangleCount },
          (_, index) => 10_000 + index,
        ),
      ),
    ],
    expectedBroadphaseCandidateCount: firstTriangleCount * secondTriangleCount,
    maximumTraversalSurfaceTrianglePairTestCount: 4_000_000,
  };
}

function disjointHeavyFixture(): BenchmarkFixture {
  const triangleCount = 20_000;
  return {
    name: "disjoint-heavy",
    sources: [
      horizontalTriangleSource(
        "near-field",
        Array.from({ length: triangleCount }, (_, index) => index),
      ),
      horizontalTriangleSource(
        "far-field",
        Array.from({ length: triangleCount }, (_, index) => index),
        [100, 100],
      ),
    ],
    expectedBroadphaseCandidateCount: 0,
    maximumTraversalSurfaceTrianglePairTestCount: 4_000_000,
  };
}

function selectedFixtures(): readonly BenchmarkFixture[] {
  const selector = process.argv[2] ?? "all";
  if (selector === "representative") return [representativeFixture()];
  if (selector === "near-budget") return [nearBudgetFixture()];
  if (selector === "disjoint-heavy") return [disjointHeavyFixture()];
  if (selector === "all") {
    return [
      representativeFixture(),
      nearBudgetFixture(),
      disjointHeavyFixture(),
    ];
  }
  throw new Error(
    "ROUTE_R1B_BENCHMARK_ARGUMENT_INVALID: expected representative, near-budget, disjoint-heavy, or all.",
  );
}

const environment = {
  platform: process.platform,
  operatingSystemRelease: os.release(),
  architecture: process.arch,
  cpuModel: os.cpus()[0]?.model ?? "unknown",
  logicalCpuCount: os.cpus().length,
  nodeVersion: process.version,
};

for (const fixture of selectedFixtures()) {
  const startedAtMilliseconds = performance.now();
  const result = preflightCanonicalTraversalSurfaceOverlapsV1({
    sources: fixture.sources,
    minimumUpwardNormalYRatio: 0.1,
    maximumSameBandHeightDifferenceMeters: 0.2,
    maximumEquivalentPlaneHeightDifferenceMeters: 0.2,
    minimumEquivalentPlaneNormalDotRatio: 0.99999,
    maximumTraversalSurfaceTrianglePairTestCount:
      fixture.maximumTraversalSurfaceTrianglePairTestCount,
  });
  const elapsedMilliseconds = performance.now() - startedAtMilliseconds;
  const triangleCountsByTraversalSurfaceId = Object.fromEntries(
    fixture.sources.map((source) => [
      source.traversalSurfaceId,
      source.triangleIndices.length / 3,
    ]),
  );
  process.stdout.write(
    `${JSON.stringify({
      fixture: fixture.name,
      environment,
      sourceCount: fixture.sources.length,
      triangleCountsByTraversalSurfaceId,
      expectedBroadphaseCandidateCount:
        fixture.expectedBroadphaseCandidateCount,
      maximumTraversalSurfaceTrianglePairTestCount:
        fixture.maximumTraversalSurfaceTrianglePairTestCount,
      elapsedMilliseconds,
      maximumResidentSetSizeKiB: process.resourceUsage().maxRSS,
      result,
    })}\n`,
  );
}
