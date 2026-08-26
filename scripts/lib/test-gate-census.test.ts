import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import packageJson from "../../package.json";
import resourceHeavyVitestConfig from "../../vitest.resource-heavy.config";

import { TEST_GATE_MANIFEST_V1 } from "./test-gate-manifest";

const discoveryStubs = vi.hoisted(() => ({ createVitest: vi.fn() }));

vi.mock("vitest/node", () => ({ createVitest: discoveryStubs.createVitest }));

import {
  discoverVitestTestFilesV1,
  evaluateTestGateCensusV1,
  type TestGateManifestEntryV1,
} from "./test-gate-census";

const MANIFEST: readonly TestGateManifestEntryV1[] = [
  { path: "packages/a.test.ts", lane: "contract" },
  { path: "scripts/heavy.test.ts", lane: "resource-heavy", reasonCodes: ["measured-duration"] },
];

afterEach(() => {
  discoveryStubs.createVitest.mockReset();
});

describe("discoverVitestTestFilesV1", () => {
  it("canonicalizes discovered module ids and closes Vitest after success", async () => {
    const globTestSpecifications = vi.fn().mockResolvedValue([
      { moduleId: "/repo/scripts/z.test.ts" },
      { moduleId: "/repo/packages/a.test.ts" },
    ]);
    const close = vi.fn().mockResolvedValue(undefined);
    discoveryStubs.createVitest.mockResolvedValue({ globTestSpecifications, close });

    await expect(discoverVitestTestFilesV1({
      repositoryRoot: "/repo",
      configPath: "vitest.config.ts",
    })).resolves.toEqual(["packages/a.test.ts", "scripts/z.test.ts"]);
    expect(discoveryStubs.createVitest).toHaveBeenCalledWith("test", {
      root: "/repo",
      config: "vitest.config.ts",
      run: true,
      watch: false,
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes Vitest when test specification discovery rejects", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    discoveryStubs.createVitest.mockResolvedValue({
      globTestSpecifications: vi.fn().mockRejectedValue(new Error("glob fault")),
      close,
    });

    await expect(discoverVitestTestFilesV1({
      repositoryRoot: "/repo",
      configPath: "vitest.config.ts",
    })).rejects.toThrow("glob fault");
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("evaluateTestGateCensusV1", () => {
  it.each([
    {
      name: "rejects a root test absent from the manifest",
      input: {
        rootTestFiles: ["packages/a.test.ts", "scripts/new.test.ts"],
        contractConfigTestFiles: ["packages/a.test.ts"],
        resourceHeavyConfigTestFiles: [],
        manifest: [{ path: "packages/a.test.ts", lane: "contract" }],
      },
      error: /UNCLASSIFIED: scripts\/new\.test\.ts/,
    },
    {
      name: "rejects duplicate manifest paths",
      input: {
        rootTestFiles: ["packages/a.test.ts"],
        contractConfigTestFiles: ["packages/a.test.ts"],
        resourceHeavyConfigTestFiles: [],
        manifest: [
          { path: "packages/a.test.ts", lane: "contract" },
          { path: "packages/a.test.ts", lane: "contract" },
        ],
      },
      error: /DUPLICATE: packages\/a\.test\.ts/,
    },
    {
      name: "rejects a path present in both lane configurations",
      input: {
        rootTestFiles: ["packages/a.test.ts"],
        contractConfigTestFiles: ["packages/a.test.ts"],
        resourceHeavyConfigTestFiles: ["packages/a.test.ts"],
        manifest: [{ path: "packages/a.test.ts", lane: "contract" }],
      },
      error: /CONFIG_DRIFT: packages\/a\.test\.ts/,
    },
    {
      name: "rejects a stale manifest path",
      input: {
        rootTestFiles: ["packages/a.test.ts"],
        contractConfigTestFiles: ["packages/a.test.ts"],
        resourceHeavyConfigTestFiles: [],
        manifest: MANIFEST,
      },
      error: /STALE: scripts\/heavy\.test\.ts/,
    },
    {
      name: "rejects paths outside the repository root",
      input: {
        rootTestFiles: ["../outside.test.ts"],
        contractConfigTestFiles: ["../outside.test.ts"],
        resourceHeavyConfigTestFiles: [],
        manifest: [{ path: "../outside.test.ts", lane: "contract" }],
      },
      error: /OUTSIDE_ROOT: \.\.\/outside\.test\.ts/,
    },
    {
      name: "rejects an unsorted manifest",
      input: {
        rootTestFiles: ["packages/a.test.ts", "scripts/heavy.test.ts"],
        contractConfigTestFiles: ["packages/a.test.ts"],
        resourceHeavyConfigTestFiles: ["scripts/heavy.test.ts"],
        manifest: [...MANIFEST].reverse(),
      },
      error: /CONFIG_DRIFT: manifest is not sorted/,
    },
    {
      name: "rejects a resource-heavy row without a reason code",
      input: {
        rootTestFiles: ["scripts/heavy.test.ts"],
        contractConfigTestFiles: [],
        resourceHeavyConfigTestFiles: ["scripts/heavy.test.ts"],
        manifest: [{ path: "scripts/heavy.test.ts", lane: "resource-heavy" }],
      },
      error: /HEAVY_REASON_MISSING: scripts\/heavy\.test\.ts/,
    },
  ] as const)("$name", ({ input, error }) => {
    expect(() => evaluateTestGateCensusV1(input)).toThrow(error);
  });

  it("returns every sorted root test exactly once in its declared lane", () => {
    const report = evaluateTestGateCensusV1({
      rootTestFiles: ["packages/a.test.ts", "scripts/heavy.test.ts", "scripts/z.test.ts"],
      contractConfigTestFiles: ["packages/a.test.ts", "scripts/z.test.ts"],
      resourceHeavyConfigTestFiles: ["scripts/heavy.test.ts"],
      manifest: [
        { path: "packages/a.test.ts", lane: "contract" },
        { path: "scripts/heavy.test.ts", lane: "resource-heavy", reasonCodes: ["measured-duration"] },
        { path: "scripts/z.test.ts", lane: "contract" },
      ],
    });

    expect(report).toEqual({
      rootTestFiles: ["packages/a.test.ts", "scripts/heavy.test.ts", "scripts/z.test.ts"],
      contractTestFiles: ["packages/a.test.ts", "scripts/z.test.ts"],
      resourceHeavyTestFiles: ["scripts/heavy.test.ts"],
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.rootTestFiles)).toBe(true);
  });
});

describe("test gate configuration", () => {
  it("keeps the source-backed wrapper and discovered lanes exactly aligned with the manifest", async () => {
    expect(packageJson.scripts.test).toBe(
      "pnpm verify:workspace-boundaries && pnpm test:census && pnpm test:contract && pnpm test:resource-heavy",
    );
    expect(resourceHeavyVitestConfig.test?.pool).toBe("threads");

    vi.doUnmock("vitest/node");
    vi.resetModules();
    const { discoverVitestTestFilesV1: discoverRealVitestTestFilesV1, evaluateTestGateCensusV1: evaluateRealTestGateCensusV1 } =
      await import("./test-gate-census");
    const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
    const [rootTestFiles, contractConfigTestFiles, resourceHeavyConfigTestFiles] = await Promise.all([
      discoverRealVitestTestFilesV1({ repositoryRoot, configPath: "vitest.config.ts" }),
      discoverRealVitestTestFilesV1({ repositoryRoot, configPath: "vitest.contract.config.ts" }),
      discoverRealVitestTestFilesV1({ repositoryRoot, configPath: "vitest.resource-heavy.config.ts" }),
    ]);

    expect(evaluateRealTestGateCensusV1({
      rootTestFiles,
      contractConfigTestFiles,
      resourceHeavyConfigTestFiles,
      manifest: TEST_GATE_MANIFEST_V1,
    })).toEqual({
      rootTestFiles,
      contractTestFiles: TEST_GATE_MANIFEST_V1
        .filter((entry) => entry.lane === "contract")
        .map((entry) => entry.path),
      resourceHeavyTestFiles: TEST_GATE_MANIFEST_V1
        .filter((entry) => entry.lane === "resource-heavy")
        .map((entry) => entry.path),
    });
  });
});
