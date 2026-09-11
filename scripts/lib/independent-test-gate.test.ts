import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  INDEPENDENT_TEST_MANIFEST_V1,
  createIndependentTestCommandsV1,
  discoverIndependentTestFilesV1,
  evaluateIndependentTestGateV1,
  parseIndependentTestSelectionV1,
  type IndependentTestManifestEntryV1,
} from "./independent-test-gate";

const MANIFEST: readonly IndependentTestManifestEntryV1[] = [
  { path: "scripts/a.test.mjs", lane: "node" },
  { path: "scripts/b.test.mjs", lane: "node" },
];

describe("evaluateIndependentTestGateV1", () => {
  it.each([
    {
      name: "rejects an unclassified discovered test",
      discoveredByLane: {
        node: ["scripts/a.test.mjs", "scripts/b.test.mjs", "scripts/new.test.mjs"],
      },
      manifest: MANIFEST,
      error: /UNCLASSIFIED: scripts\/new\.test\.mjs/,
    },
    {
      name: "rejects a stale manifest entry",
      discoveredByLane: { node: ["scripts/a.test.mjs"] },
      manifest: MANIFEST,
      error: /STALE: scripts\/b\.test\.mjs/,
    },
    {
      name: "rejects duplicate manifest entries",
      discoveredByLane: { node: ["scripts/a.test.mjs"] },
      manifest: [
        { path: "scripts/a.test.mjs", lane: "node" },
        { path: "scripts/a.test.mjs", lane: "node" },
      ],
      error: /DUPLICATE: scripts\/a\.test\.mjs/,
    },
    {
      name: "rejects paths outside the repository",
      discoveredByLane: { node: ["../outside.test.mjs"] },
      manifest: [{ path: "../outside.test.mjs", lane: "node" }],
      error: /OUTSIDE_ROOT: \.\.\/outside\.test\.mjs/,
    },
    {
      name: "rejects lane drift",
      discoveredByLane: { node: ["scripts/a.test.mjs"] },
      manifest: [{ path: "scripts/a.test.mjs", lane: "invalid" }] as unknown as readonly IndependentTestManifestEntryV1[],
      error: /LANE_DRIFT: scripts\/a\.test\.mjs/,
    },
  ] as const)("$name", ({ discoveredByLane, manifest, error }) => {
    expect(() =>
      evaluateIndependentTestGateV1({ discoveredByLane, manifest }),
    ).toThrow(error);
  });

  it("returns every discovered test exactly once in its declared lane", () => {
    expect(
      evaluateIndependentTestGateV1({
        discoveredByLane: {
          node: ["scripts/a.test.mjs"],
        },
        manifest: [
          { path: "scripts/a.test.mjs", lane: "node" },
        ],
      }),
    ).toEqual({
      nodeTestFiles: ["scripts/a.test.mjs"],
    });
  });
});

describe("independent test repository census", () => {
  it("discovers deployment tests and rejects a newly added unclassified suite", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "independent-test-discovery-"));
    try {
      for (const directory of ["deploy/creator-evaluation/nested", "scripts"]) {
        await mkdir(path.join(repositoryRoot, directory), { recursive: true });
      }
      for (const filename of [
        "deploy/creator-evaluation/gateway.test.mjs",
        "deploy/creator-evaluation/nested/new.test.mjs",
        "deploy/creator-evaluation/gateway.mjs",
        "scripts/a.test.mjs",
      ]) {
        await writeFile(path.join(repositoryRoot, filename), "");
      }
      const discoveredByLane = await discoverIndependentTestFilesV1(repositoryRoot);
      expect(discoveredByLane).toEqual({
        node: [
          "deploy/creator-evaluation/gateway.test.mjs",
          "deploy/creator-evaluation/nested/new.test.mjs",
          "scripts/a.test.mjs",
        ],
      });
      expect(() => evaluateIndependentTestGateV1({
        discoveredByLane,
        manifest: [
          { path: "deploy/creator-evaluation/gateway.test.mjs", lane: "node" },
          { path: "scripts/a.test.mjs", lane: "node" },
        ],
      })).toThrow(/UNCLASSIFIED: deploy\/creator-evaluation\/nested\/new\.test\.mjs/);
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("discovers every current Node suite in the manifest", async () => {
    const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
    const discoveredByLane = await discoverIndependentTestFilesV1(repositoryRoot);

    expect(
      evaluateIndependentTestGateV1({
        discoveredByLane,
        manifest: INDEPENDENT_TEST_MANIFEST_V1,
      }),
    ).toEqual({
      nodeTestFiles: [
        "apps/creator-cloud/creator-eval-diagnostics.test.mjs",
        "apps/creator-cloud/prepare-three-evaluation-site.test.mjs",
        "apps/creator-cloud/three-eval-asset-policy.test.mjs",
        "apps/creator-cloud/three-eval-effort.test.mjs",
        "apps/creator-cloud/three-eval-progress.test.mjs",
        "apps/creator-cloud/three-eval.test.mjs",
        "apps/creator-cloud/three-host-reliability.test.mjs",
        "apps/creator-cloud/three-ray-cleanup.test.mjs",
        "deploy/creator-evaluation/gateway.test.mjs",
        "deploy/three-creator-runtime/capsule.test.mjs",
        "packages/cloud-generation-client/lwdp-generation-client.test.mjs",
        "packages/episode-pipeline/tests/batch/batch-resources.test.mjs",
        "packages/episode-pipeline/tests/batch/cloud-production-run.test.mjs",
        "packages/episode-pipeline/tests/batch/gpu-capture-batch.test.mjs",
        "packages/episode-pipeline/tests/batch/outbox.test.mjs",
        "packages/episode-pipeline/tests/cloud/cloud-scheduling.test.mjs",
        "packages/episode-pipeline/tests/cloud/cloud.test.mjs",
        "packages/episode-pipeline/tests/cloud/cpu-routing.test.mjs",
        "packages/episode-pipeline/tests/cloud/frozen-entrypoints.test.mjs",
        "packages/episode-pipeline/tests/cloud/streaming-overlay.test.mjs",
        "packages/episode-pipeline/tests/integration/batch-integration.test.mjs",
        "packages/episode-pipeline/tests/integration/batch.test.mjs",
        "packages/episode-pipeline/tests/review/human-review-store.test.mjs",
        "packages/episode-pipeline/tests/seedance/seedance-admission-service.test.mjs",
        "packages/episode-pipeline/tests/seedance/seedance-preflight.test.mjs",
        "packages/episode-pipeline/tests/seedance/seedance-production-budget.test.mjs",
        "packages/episode-pipeline/tests/seedance/seedance-python.test.mjs",
        "packages/episode-pipeline/tests/seedance/seedance-slot.test.mjs",
        "packages/episode-pipeline/tests/serialization/canonical-json.test.mjs",
        "packages/episode-pipeline/tests/visuals/episode-style-variants.test.mjs",
        "packages/episode-pipeline/tests/visuals/vertex-event-director.test.mjs",
        "packages/episode-pipeline/tests/visuals/visuals.test.mjs",
      ],
    });
  });
});

describe("independent test runner contract", () => {
  it("selects Node and rejects retired or unknown lanes", () => {
    expect(parseIndependentTestSelectionV1([])).toBe("all");
    expect(parseIndependentTestSelectionV1(["--lane", "node"])).toBe("node");
    expect(() => parseIndependentTestSelectionV1(["--lane", "site"])).toThrow(/INDEPENDENT_TEST_ARGUMENT_INVALID/);
    expect(() => parseIndependentTestSelectionV1(["--lane", "python"])).toThrow(
      /INDEPENDENT_TEST_ARGUMENT_INVALID/,
    );
    expect(() => parseIndependentTestSelectionV1(["--lane", "browser"])).toThrow(
      /INDEPENDENT_TEST_ARGUMENT_INVALID/,
    );
  });

  it("runs every Node suite exactly once", () => {
    expect(
      createIndependentTestCommandsV1(
        {
          nodeTestFiles: ["scripts/a.test.mjs"],
        },
        "all",
      ),
    ).toEqual([
      {
        lane: "node",
        command: process.execPath,
        arguments: ["--test", "scripts/a.test.mjs"],
      },
    ]);
  });

});
