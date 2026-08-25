import { describe, expect, it } from "vitest";

import {
  evaluateTestGateCensusV1,
  type TestGateManifestEntryV1,
} from "./test-gate-census";

const MANIFEST: readonly TestGateManifestEntryV1[] = [
  { path: "packages/a.test.ts", lane: "contract" },
  { path: "scripts/heavy.test.ts", lane: "resource-heavy", reasonCodes: ["measured-duration"] },
];

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
