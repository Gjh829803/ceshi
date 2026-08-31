import { readFileSync } from "node:fs";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  parseWorkspaceBoundaryEvidenceV1,
  workspaceBoundaryDebtFingerprintV1,
} from "./workspace-boundary-contract";

const COMMIT_SHA = "a".repeat(40);

const VALID_EVIDENCE = {
  kind: "workspace-boundary-evidence",
  schemaVersion: 1,
  graph: {
    kind: "workspace-dependency-graph",
    schemaVersion: 1,
    commitSha: COMMIT_SHA,
    packages: [
      {
        id: "@whitebox-world/root",
        rootPath: ".",
        manifestPath: "package.json",
        exportedSubpaths: [],
        productionDependencyIds: [],
        developmentDependencyIds: [],
      },
      {
        id: "@whitebox-world/example",
        rootPath: "packages/example",
        manifestPath: "packages/example/package.json",
        exportedSubpaths: [{ subpath: ".", targetPath: "packages/example/src/index.ts" }],
        productionDependencyIds: [],
        developmentDependencyIds: [],
      },
    ],
    edges: [
      {
        importerPath: "scripts/example.ts",
        importerPackageId: "@whitebox-world/root",
        specifier: "@whitebox-world/example",
        targetPackageId: "@whitebox-world/example",
        usage: "production",
      },
    ],
  },
  violations: [
    {
      code: "WORKSPACE_DIRECT_DEPENDENCY_MISSING",
      importer: "scripts/example.ts",
      specifier: "@whitebox-world/example",
      owner: "@whitebox-world/example",
      message: "The root package must declare the direct dependency.",
      removalGate: "Declare the direct dependency.",
    },
  ],
  reconciledDebtFingerprints: [`sha256:${"b".repeat(64)}`],
} as const;

describe("workspace boundary evidence contract", () => {
  it("accepts one closed repo-relative dependency graph", () => {
    expect(parseWorkspaceBoundaryEvidenceV1(VALID_EVIDENCE)).toEqual(VALID_EVIDENCE);
  });

  it.each([
    "/Users/example/repository/packages/example",
    "C:\\repository\\packages\\example",
    "packages//example",
    "packages/./example",
    "packages/../example",
  ])("rejects non-canonical repository path %s", (rootPath) => {
    const invalid = structuredClone(VALID_EVIDENCE) as unknown as {
      graph: { packages: Array<{ rootPath: string; manifestPath: string }> };
    };
    invalid.graph.packages[1]!.rootPath = rootPath;
    expect(() => parseWorkspaceBoundaryEvidenceV1(invalid)).toThrow(/repository-relative POSIX path/i);
  });

  it("allows dot only for the root package rootPath", () => {
    const invalid = structuredClone(VALID_EVIDENCE) as unknown as {
      graph: { packages: Array<{ rootPath: string; manifestPath: string }> };
    };
    invalid.graph.packages[0]!.manifestPath = ".";
    expect(() => parseWorkspaceBoundaryEvidenceV1(invalid)).toThrow(/repository-relative POSIX path/i);
  });

  it("rejects unknown graph fields", () => {
    const invalid = structuredClone(VALID_EVIDENCE) as Record<string, unknown>;
    invalid.compatibilityGraph = {};
    expect(() => parseWorkspaceBoundaryEvidenceV1(invalid)).toThrow(/closed WorkspaceBoundaryEvidenceV1/i);
  });

  it("rejects machine-local paths from stable violation text", () => {
    const invalid = structuredClone(VALID_EVIDENCE) as unknown as {
      violations: Array<{ message: string }>;
    };
    invalid.violations[0]!.message = "See /Users/example/private.log for details.";
    expect(() => parseWorkspaceBoundaryEvidenceV1(invalid)).toThrow(/stable workspace text/i);
  });

  it.each([
    ["owner", "/Users/example/repository/packages/example"],
    ["owner", "file:///tmp/package.json"],
    ["specifier", "/Users/example/repository/packages/example"],
    ["specifier", "C:\\repository\\packages\\example"],
  ])("rejects machine-local %s identity %s", (field, value) => {
    const invalid = structuredClone(VALID_EVIDENCE) as unknown as {
      violations: Array<{ owner: string; specifier: string }>;
    };
    invalid.violations[0]![field as "owner" | "specifier"] = value;
    expect(() => parseWorkspaceBoundaryEvidenceV1(invalid)).toThrow(/closed WorkspaceBoundaryEvidenceV1/i);
  });

  it("canonicalizes semantic graph and evidence collections", () => {
    const reverse = structuredClone(VALID_EVIDENCE) as unknown as {
      graph: {
        packages: unknown[];
        edges: unknown[];
      };
      violations: unknown[];
      reconciledDebtFingerprints: string[];
    };
    reverse.graph.packages.reverse();
    reverse.graph.edges.reverse();
    reverse.violations.reverse();
    reverse.reconciledDebtFingerprints.reverse();

    expect(parseWorkspaceBoundaryEvidenceV1(reverse)).toEqual(
      parseWorkspaceBoundaryEvidenceV1(VALID_EVIDENCE),
    );
  });

  it("preserves all current workspace debt identities without explanatory fields", () => {
    const ledger = JSON.parse(readFileSync(
      new URL("../../config/workspace-boundary-debt.json", import.meta.url),
      "utf8",
    )) as {
      readonly entries: readonly {
        readonly importer: string;
        readonly specifier: string;
        readonly owner: string;
        readonly reason: string;
        readonly removalGate: string;
      }[];
    };

    expect(ledger.entries).toHaveLength(49);
    for (const entry of ledger.entries) {
      const expected = sha256CanonicalJson({
        importer: entry.importer,
        specifier: entry.specifier,
        owner: entry.owner,
      });
      expect(workspaceBoundaryDebtFingerprintV1(entry)).toBe(expected);
      expect(workspaceBoundaryDebtFingerprintV1({
        ...entry,
        reason: `${entry.reason} changed`,
        removalGate: `${entry.removalGate} changed`,
      })).toBe(expected);
    }
  });
});
