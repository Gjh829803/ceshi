import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalTraversalGraphV2,
  hashTraversalGraphV2,
} from "@whitebox-world/traversal";
import { isEmpty, isEqual, isNil } from "lodash-es";
import { afterEach, describe, expect, it } from "vitest";

import {
  R1B_STATIC_PLATFORM_FIXTURE_ORACLE,
  censusLegacyRouteConsumers,
  type LegacyRouteConsumerCensus,
  type RouteR1bFixtureVerification,
} from "./verify-route-r1b-static-platform.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function joinToken(parts: readonly string[]): string {
  return parts.join("");
}

function expectedCensusPattern(): string {
  const ident = "[A-Za-z0-9_]*";
  const heightfield = joinToken(["Height", "field"]);
  const alternatives = [
    `${ident}${heightfield}${joinToken(["Route", "Build", "Input"])}${ident}V1`,
    `${heightfield}${joinToken(["Route", "Terrain", "Source", "V1"])}`,
    `${heightfield}${joinToken(["Route", "Build", "Budget", "Evidence", "V1"])}`,
    joinToken(["Static", "Blocking", "Collider", "V1"]),
    `${ident}${joinToken(["Required", "Height", "field", "Route"])}${ident}V1`,
    `${ident}${heightfield}${joinToken(["Route", "Connectivity", "Result"])}${ident}V1`,
    `${ident}${heightfield}${joinToken(["Traversal", "Graph"])}${ident}V1`,
    `${ident}${joinToken(["Query", "Required", "Route"])}${ident}V1`,
    `${ident}${joinToken(["Traversal", "Graph", "V1"])}`,
    `${ident}${joinToken(["Route", "Path", "Receipt"])}${ident}V1`,
    `${ident}${joinToken(["Route", "Overlay"])}${ident}V1`,
    `${ident}${joinToken(["Route", "Connectivity"])}(?:${joinToken(["Fail", "ure"])}|${joinToken(["Unavail", "able"])}|${joinToken(["Comple", "te"])})${ident}V1`,
    joinToken(["ROUTE_", "CONNECTIVITY_", "FAILURE_", "CODES_", "V1"]),
    `${ident}${joinToken(["Route", "Runtime", "Probe"])}${ident}V1`,
    joinToken(["ROUTE_", "RUNTIME_", "PROBE_", "ERROR_", "CODES_", "V1"]),
    joinToken([
      "Route",
      "Connectivity",
      "Operation",
      "Aborted",
      "Error",
      "V1",
    ]),
    joinToken(["query", "Required", "Route", "V1"]),
    `${ident}${joinToken(["Route", "Threshold", "Rejection"])}(?:${joinToken(["Pro", "of"])}|${joinToken(["Reas", "on"])})${ident}V1`,
    `${ident}${joinToken(["Route", "Evidence"])}(?:${joinToken(["Publicat", "ion"])}|${joinToken(["Project", "ion"])})${ident}V1`,
    joinToken(["Worldkit", "Browser", "Api", "V4"]),
    joinToken(["blocking", "Collider", "Identities"]),
    joinToken(["heightfield", "-tile-", "estimate"]),
    joinToken(["not-required-", "empty-", "source"]),
  ];
  return String.raw`\b(?:${alternatives.join("|")})\b`;
}

function adversarialInjectedSymbols(): readonly string[] {
  return Object.freeze([
    joinToken(["Route", "Runtime", "Probe", "Failure", "V1"]),
    joinToken(["Route", "Runtime", "Probe", "Metrics", "V1"]),
    joinToken(["Route", "Runtime", "Probe", "Validation", "Profile", "Identity", "V1"]),
    joinToken(["Route", "Runtime", "Probe", "Error", "V1"]),
    joinToken(["ROUTE_", "RUNTIME_", "PROBE_", "ERROR_", "CODES_", "V1"]),
    joinToken(["Route", "Connectivity", "Operation", "Aborted", "Error", "V1"]),
    joinToken(["query", "Required", "Route", "V1"]),
    joinToken(["Height", "field", "Traversal", "Graph", "Projection", "V1"]),
    joinToken(["Query", "Required", "Route", "Input", "V1"]),
    joinToken(["Height", "field", "Route", "Terrain", "Source", "V1"]),
    joinToken(["create", "Height", "field", "Route", "Build", "Input", "V1"]),
    joinToken(["canonical", "Height", "field", "Route", "Connectivity", "Result", "V1"]),
    joinToken(["hash", "Traversal", "Graph", "V1"]),
    joinToken(["assert", "Route", "Path", "Receipt", "For", "Graph", "V1"]),
    joinToken(["Route", "Threshold", "Rejection", "Proof", "V1"]),
    joinToken(["Route", "Threshold", "Rejection", "Reason", "V1"]),
    joinToken(["blocking", "Collider", "Identities"]),
    joinToken(["heightfield", "-tile-", "estimate"]),
    joinToken(["not-required-", "empty-", "source"]),
  ]);
}

describe("verify:route-r1b-static-platform", () => {
  let injectedRelativePath: string | undefined;

  afterEach(async () => {
    if (isNil(injectedRelativePath)) {
      return;
    }
    await rm(path.join(repositoryRoot, injectedRelativePath), { force: true });
    injectedRelativePath = undefined;
  });

  it("publishes Graph vs Runtime oracles for all eleven static-platform fixtures", () => {
    expect(R1B_STATIC_PLATFORM_FIXTURE_ORACLE).toEqual([
      {
        fixtureId: "success-steps-platform-ramp",
        graph: { status: "passed" },
        runtime: { status: "passed" },
      },
      {
        fixtureId: "fail-step-height",
        graph: {
          status: "failed",
          diagnosticCode: "ROUTE_STEP_HEIGHT_EXCEEDED",
        },
        runtime: { status: "incomplete" },
      },
      {
        fixtureId: "fail-surface-gap",
        graph: {
          status: "failed",
          diagnosticCode: "ROUTE_SURFACE_GAP_EXCEEDED",
        },
        runtime: { status: "incomplete" },
      },
      {
        fixtureId: "fail-narrow-tread",
        graph: {
          status: "failed",
          diagnosticCode: "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT",
        },
        runtime: { status: "incomplete" },
      },
      {
        fixtureId: "fail-low-overhead",
        graph: {
          status: "failed",
          diagnosticCode: "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT",
        },
        runtime: { status: "incomplete" },
      },
      {
        fixtureId: "fail-missing-surface-profile",
        graph: {
          status: "failed",
          diagnosticCode: "ROUTE_SURFACE_PROFILE_MISSING",
        },
        runtime: { status: "incomplete" },
      },
      {
        fixtureId: "fail-wrong-collider-binding",
        graph: {
          status: "failed",
          diagnosticCode: "ROUTE_SURFACE_CORRELATION_MISSING",
        },
        runtime: { status: "incomplete" },
      },
      {
        fixtureId: "fail-wrong-runtime-surface",
        graph: { status: "passed" },
        runtime: {
          status: "failed",
          diagnosticCode: "ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH",
        },
      },
      {
        fixtureId: "fail-platform-edge-fall",
        graph: { status: "passed" },
        runtime: {
          status: "failed",
          diagnosticCode: "ROUTE_RUNTIME_SUPPORT_LOST",
        },
      },
      {
        fixtureId: "fail-overlapping-surfaces",
        graph: {
          status: "failed",
          diagnosticCode: "ROUTE_SURFACE_CORRELATION_AMBIGUOUS",
        },
        runtime: { status: "incomplete" },
      },
      {
        fixtureId: "fail-runtime-overlapping-surfaces",
        graph: { status: "passed" },
        runtime: {
          status: "failed",
          diagnosticCode: "ROUTE_SURFACE_CORRELATION_AMBIGUOUS",
        },
      },
    ]);
  });

  it("keeps all eleven fixture summaries on the canonical Validation Report hash shape", () => {
    const reportHash = `sha256:${"1".repeat(64)}` as const;
    const fixtures: readonly RouteR1bFixtureVerification[] =
      R1B_STATIC_PLATFORM_FIXTURE_ORACLE.map((oracle) => Object.freeze({
        ...oracle,
        validationReportHash: reportHash,
      }));

    expect(fixtures).toHaveLength(11);
    expect(fixtures.map(({ fixtureId }) => fixtureId)).toEqual(
      R1B_STATIC_PLATFORM_FIXTURE_ORACLE.map(({ fixtureId }) => fixtureId),
    );
    for (const fixture of fixtures) {
      expect(fixture.validationReportHash).toBe(reportHash);
      expect(Object.keys(fixture).sort()).toEqual([
        "fixtureId",
        "graph",
        "runtime",
        "validationReportHash",
      ]);
    }
  });

  it("legacy consumer census reports fixed roots, family pattern, deleted fields, and matches", () => {
    const census: LegacyRouteConsumerCensus = censusLegacyRouteConsumers({
      repositoryRoot,
    });
    expect(census.roots).toEqual([
      "packages",
      "apps",
      "scripts",
      "examples",
      "README.md",
      "docs/17-canonical-json-quickstart.md",
    ]);
    expect(census.symbolFamilyPattern).toBe(expectedCensusPattern());
    expect(census.deletedFields).toEqual([
      joinToken(["blocking", "Collider", "Identities"]),
      joinToken(["heightfield", "-tile-", "estimate"]),
      joinToken(["not-required-", "empty-", "source"]),
    ]);
    expect(census.historicalExclusions).toEqual([
      "docs/reviews",
      "docs/superpowers",
    ]);
    expect(census.matchCount).toBe(0);
    expect(census.matchedPaths).toEqual([]);
    expect(isEmpty(census.matchedPaths)).toBe(true);
  });

  it("legacy consumer census discovers an unlisted adversarial file with exactly 19 injected symbols", async () => {
    const symbols = adversarialInjectedSymbols();
    expect(symbols).toHaveLength(19);
    expect(new Set(symbols).size).toBe(19);

    injectedRelativePath = path.join(
      "scripts",
      "r1b-legacy-census-adversary.tmp.ts",
    );
    await writeFile(
      path.join(repositoryRoot, injectedRelativePath),
      `${symbols.join("\n")}\n`,
      "utf8",
    );

    const census = censusLegacyRouteConsumers({ repositoryRoot });
    expect(census.matchCount).toBe(19);
    expect(census.matchedPaths).toEqual([injectedRelativePath]);
    expect(isEqual(census.matchedPaths, [injectedRelativePath])).toBe(true);
  });

  it("parses route R0 contract Graph evidence as V2 with valid child and root hashes", async () => {
    const contractPath = path.join(
      repositoryRoot,
      "examples",
      "traversal",
      "route-r0-contract.json",
    );
    const contract = JSON.parse(await readFile(contractPath, "utf8")) as {
      readonly graph: unknown;
      readonly traversalGraphHash: unknown;
    };
    expect(isNil(contract.graph)).toBe(false);
    const canonical = canonicalTraversalGraphV2(contract.graph);
    expect(canonical.schemaVersion).toBe(2);
    const rootHash = hashTraversalGraphV2(contract.graph);
    expect(contract.traversalGraphHash).toBe(rootHash);
    const childHashFields = [
      "authoringSpecHash",
      "layoutSolveReportHash",
      "resourceLockHash",
      "terrainArtifactHash",
      "colliderArtifactHash",
      "surfaceArtifactHash",
      "geometryArtifactHash",
      "routeBuildInputHash",
      "resolvedTraversalLockHash",
      "graphBuilderProfileHash",
    ] as const;
    for (const field of childHashFields) {
      expect(canonical[field]).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });
});
