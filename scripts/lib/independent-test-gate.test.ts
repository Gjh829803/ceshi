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
        node: ["scripts/a.test.mjs", "scripts/b.test.mjs"],
        site: ["sites/site/tests/new.test.mjs"],
      },
      manifest: MANIFEST,
      error: /UNCLASSIFIED: sites\/site\/tests\/new\.test\.mjs/,
    },
    {
      name: "rejects a stale manifest entry",
      discoveredByLane: { node: ["scripts/a.test.mjs"], site: [] },
      manifest: MANIFEST,
      error: /STALE: scripts\/b\.test\.mjs/,
    },
    {
      name: "rejects duplicate manifest entries",
      discoveredByLane: { node: ["scripts/a.test.mjs"], site: [] },
      manifest: [
        { path: "scripts/a.test.mjs", lane: "node" },
        { path: "scripts/a.test.mjs", lane: "node" },
      ],
      error: /DUPLICATE: scripts\/a\.test\.mjs/,
    },
    {
      name: "rejects paths outside the repository",
      discoveredByLane: { node: ["../outside.test.mjs"], site: [] },
      manifest: [{ path: "../outside.test.mjs", lane: "node" }],
      error: /OUTSIDE_ROOT: \.\.\/outside\.test\.mjs/,
    },
    {
      name: "rejects lane drift",
      discoveredByLane: { node: ["scripts/a.test.mjs"], site: [] },
      manifest: [{ path: "scripts/a.test.mjs", lane: "site" }],
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
          site: ["sites/site/tests/rendered.test.mjs"],
        },
        manifest: [
          { path: "scripts/a.test.mjs", lane: "node" },
          { path: "sites/site/tests/rendered.test.mjs", lane: "site" },
        ],
      }),
    ).toEqual({
      nodeTestFiles: ["scripts/a.test.mjs"],
      siteTestFiles: ["sites/site/tests/rendered.test.mjs"],
    });
  });
});

describe("independent test repository census", () => {
  it("discovers every current Node and Site suite in the manifest", async () => {
    const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
    const discoveredByLane = await discoverIndependentTestFilesV1(repositoryRoot);

    expect(
      evaluateIndependentTestGateV1({
        discoveredByLane,
        manifest: INDEPENDENT_TEST_MANIFEST_V1,
      }),
    ).toEqual({
      nodeTestFiles: [
        "scripts/agents/local-codex-task.test.mjs",
        "scripts/agents/lwdp-cloud-execution-client.test.mjs",
        "scripts/agents/lwdp-codex-profile.test.mjs",
        "scripts/agents/lwdp-generation-client.test.mjs",
        "scripts/agents/write-lwdp-t2i-manifest.test.mjs",
        "scripts/cloud/dispatch-worldkit-gpu-capture-batch.test.mjs",
        "scripts/cloud/launch-worldkit-cloud-control-plane.test.mjs",
        "scripts/cloud/launch-worldkit-cloud-episode-worker-job.test.mjs",
        "scripts/cloud/launch-worldkit-cloud-gpu-capture-batch-job.test.mjs",
        "scripts/cloud/launch-worldkit-cloud-worker-job.test.mjs",
        "scripts/cloud/launch-worldkit-gpu-batch-dispatcher-cronjob.test.mjs",
        "scripts/cloud/run-worldkit-cloud-episode-worker.test.mjs",
        "scripts/cloud/run-worldkit-cloud-gpu-capture-batch-worker.test.mjs",
        "scripts/cloud/run-worldkit-cloud-scene-batch.test.mjs",
        "scripts/cloud/run-worldkit-cloud-scene-worker.test.mjs",
        "scripts/cloud/submit-worldkit-cloud-episode.test.mjs",
        "scripts/cloud/submit-worldkit-cloud-scene.test.mjs",
        "scripts/episodes/gemini-visual-event-director.test.mjs",
        "scripts/lib/cloud-global-work-slots.test.mjs",
        "scripts/lib/cloud-production-retry-policy.test.mjs",
        "scripts/lib/cloud-production-run.test.mjs",
        "scripts/lib/cloud-production-throughput.test.mjs",
        "scripts/lib/episode-input-identity.test.mjs",
        "scripts/lib/episode-seedance-prompt.test.mjs",
        "scripts/lib/episode-style-variants.test.mjs",
        "scripts/lib/episode-visual-normalization.test.mjs",
        "scripts/lib/playthrough-capture-health.test.mjs",
        "scripts/lib/playthrough-dataset.test.mjs",
        "scripts/lib/playthrough-plan-structure.test.mjs",
        "scripts/lib/worldkit-cloud-episode-artifacts.test.mjs",
        "scripts/visual/image-delivery.test.mjs",
        "scripts/visual/seedance25-media-conformance.test.mjs",
      ],
      siteTestFiles: [
        "sites/world-sdk-blueprint/tests/rendered-html.test.mjs",
      ],
    });
  });
});

describe("independent test runner contract", () => {
  it("selects current lanes and rejects the removed Python lane", () => {
    expect(parseIndependentTestSelectionV1([])).toBe("all");
    expect(() => parseIndependentTestSelectionV1(["--lane", "python"])).toThrow(
      /INDEPENDENT_TEST_ARGUMENT_INVALID/,
    );
    expect(() => parseIndependentTestSelectionV1(["--lane", "browser"])).toThrow(
      /INDEPENDENT_TEST_ARGUMENT_INVALID/,
    );
  });

  it("runs Node and Site suites once in dependency order", () => {
    expect(
      createIndependentTestCommandsV1(
        {
          nodeTestFiles: ["scripts/a.test.mjs"],
          siteTestFiles: ["sites/world-sdk-blueprint/tests/rendered-html.test.mjs"],
        },
        "all",
      ),
    ).toEqual([
      {
        lane: "node",
        command: process.execPath,
        arguments: ["--test", "scripts/a.test.mjs"],
      },
      {
        lane: "site",
        command: "npm",
        arguments: ["test", "--prefix", "sites/world-sdk-blueprint"],
      },
    ]);
  });

});
