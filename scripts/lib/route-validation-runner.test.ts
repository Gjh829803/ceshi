import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { sha256Bytes } from "@whitebox-world/protocol";
import {
  canonicalRouteRuntimeProbeReceiptV2,
  type TraversalRuntimePortV1,
} from "@whitebox-world/traversal";
import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1,
} from "@whitebox-world/validation";
import type { ResolvedCanonicalWorldPackageResourceArtifactV1 } from "@whitebox-world/world-package";
import { isNil } from "lodash-es";

import {
  canonicalFixtureFaultInjectionV1,
  createWorldPackageSubjectAssetResolverV1,
  runTrustedRouteValidationV1,
  selectUniqueFixtureSupportAggregateV1,
  wrapRuntimePortWithSupportWithdrawalV1,
} from "./route-validation-runner";

const ASSET_BYTES = new Uint8Array([1, 2, 3, 4]);
const ASSET_HASH = sha256Bytes(ASSET_BYTES);
const ARTIFACTS: readonly ResolvedCanonicalWorldPackageResourceArtifactV1[] = [
  {
    resourceRef: "worldkit://subject-asset/test.actor@1",
    packagePath: "resources/subject-assets/test.actor.glb",
    mediaType: "model/gltf-binary",
    bytes: ASSET_BYTES,
    subjectAssetManifestHash: `sha256:${"a".repeat(64)}`,
    licenseDocumentId: "project-owned",
    licenseSpdxExpression: "LicenseRef-Project-Owned",
    redistributionPolicy: "allowed",
  },
];

function fixtureRuntimePort(
  resetToStartAnchor: TraversalRuntimePortV1["resetToStartAnchor"],
): TraversalRuntimePortV1 {
  return {
    kind: "traversal-runtime-port",
    schemaVersion: 1,
    traversingEntityId: "player",
    authoringSpecHash: `sha256:${"a".repeat(64)}`,
    layoutSolveReportHash: `sha256:${"b".repeat(64)}`,
    resourceLockHash: `sha256:${"c".repeat(64)}`,
    executionPlanHash: `sha256:${"d".repeat(64)}`,
    resolvedTraversalLockHash: `sha256:${"e".repeat(64)}`,
    runtimeImplementationIdentity: {
      runtimeBackendRef: "worldkit://runtime-backend/test@1",
      runtimeBackendResolvedVersion: "1",
      runtimeBackendHash: `sha256:${"1".repeat(64)}`,
      runtimeAdapterRef: "worldkit://runtime-adapter/test@1",
      runtimeAdapterResolvedVersion: "1",
      runtimeAdapterHash: `sha256:${"2".repeat(64)}`,
    },
    readLatestTickEvidence: () => ({}) as never,
    resetToStartAnchor,
    runFixedTick: async () => ({}) as never,
  };
}

describe("Route validation trusted runner", () => {
  it("accepts only the exact verifier fault-injection closed union", () => {
    expect(canonicalFixtureFaultInjectionV1({
      kind: "inject-surface-correlation-miss",
    })).toEqual({ kind: "inject-surface-correlation-miss" });
    expect(canonicalFixtureFaultInjectionV1({
      kind: "withdraw-static-support-after-reset",
      supportEntityId: "terrain-main",
    })).toEqual({
      kind: "withdraw-static-support-after-reset",
      supportEntityId: "terrain-main",
    });

    for (const invalid of [
      "inject-surface-correlation-miss",
      { kind: "unknown" },
      { kind: "inject-surface-correlation-miss", supportEntityId: "terrain-main" },
      { kind: "withdraw-static-support-after-reset" },
      { kind: "withdraw-static-support-after-reset", supportEntityId: "" },
      {
        kind: "withdraw-static-support-after-reset",
        supportEntityId: "terrain-main",
        extra: true,
      },
    ]) {
      expect(() => canonicalFixtureFaultInjectionV1(invalid)).toThrow(
        "WORLDKIT_ROUTE_FIXTURE_FAULT_INVALID",
      );
    }
  });

  it("injects a canonical surface-correlation miss without creating Runtime evidence", async () => {
    const fixturePath = new URL(
      "../../examples/traversal/r1b-static-platform/fail-wrong-collider-binding.world.json",
      import.meta.url,
    );

    const result = await runTrustedRouteValidationV1(fileURLToPath(fixturePath), {
      fixtureFaultInjection: {
        kind: "inject-surface-correlation-miss",
      },
    });

    expect(result.report.gateResultsById["route-connectivity"]?.status).toBe(
      "incomplete",
    );
    expect(
      result.report.gateResultsById["route-runtime-conformance"]?.status,
    ).toBe("incomplete");
    expect(result.report.diagnostics.map(({ code }) => code)).toContain(
      "ROUTE_SURFACE_CORRELATION_MISSING",
    );
    expect(result.evidenceFiles.map(({ kind }) => kind)).not.toContain(
      "route-runtime-probe-receipt",
    );
    expect(JSON.stringify(result)).not.toContain(
      "inject-surface-correlation-miss",
    );
    expect(JSON.stringify(result)).not.toContain("fixtureFaultInjection");
    expect(result.worldPackageBuildReceipt.manifest.resources).not.toContainEqual(
      expect.objectContaining({ packagePath: "gameplay/bootstrap.json" }),
    );
    expect(result.worldPackageBuildReceipt.manifest.lockedResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceKind: "gameplay-bootstrap" }),
        expect.objectContaining({ resourceKind: "world-runtime-bootstrap" }),
      ]),
    );
  }, 30_000);

  it("withdraws support once after the first successful reset", () => {
    const events: string[] = [];
    const evidence = {} as never;
    const wrapped = wrapRuntimePortWithSupportWithdrawalV1(
      fixtureRuntimePort(() => {
        events.push("reset");
        return evidence;
      }),
      () => events.push("withdraw"),
    );

    expect(wrapped.resetToStartAnchor({ startAnchorEntityId: "spawn-main" }))
      .toBe(evidence);
    expect(wrapped.resetToStartAnchor({ startAnchorEntityId: "spawn-main" }))
      .toBe(evidence);
    expect(events).toEqual(["reset", "withdraw", "reset"]);
  });

  it("does not retry an uncertain support disposal after withdrawal throws", () => {
    let resetCount = 0;
    let withdrawalCount = 0;
    const wrapped = wrapRuntimePortWithSupportWithdrawalV1(
      fixtureRuntimePort(() => {
        resetCount += 1;
        return {} as never;
      }),
      () => {
        withdrawalCount += 1;
        throw new Error("withdrawal failed after an unknown disposal state");
      },
    );

    let firstError: unknown;
    let secondError: unknown;
    try {
      wrapped.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
    } catch (error) {
      firstError = error;
    }
    try {
      wrapped.resetToStartAnchor({ startAnchorEntityId: "spawn-main" });
    } catch (error) {
      secondError = error;
    }
    expect(firstError).toBeInstanceOf(Error);
    expect((firstError as Error).message).toBe(
      "withdrawal failed after an unknown disposal state",
    );
    expect(secondError).toBe(firstError);
    expect(resetCount).toBe(1);
    expect(withdrawalCount).toBe(1);
  });

  it("does not withdraw support when the underlying reset fails", () => {
    let withdrawalCount = 0;
    const wrapped = wrapRuntimePortWithSupportWithdrawalV1(
      fixtureRuntimePort(() => {
        throw new Error("reset failed");
      }),
      () => {
        withdrawalCount += 1;
      },
    );

    expect(() => wrapped.resetToStartAnchor({ startAnchorEntityId: "spawn-main" }))
      .toThrow("reset failed");
    expect(withdrawalCount).toBe(0);
  });

  it("fails closed unless exactly one live aggregate owns the support entity", () => {
    const aggregate = (entityId: string, isDisposed = false) => ({
      transformNode: { metadata: { worldkitEntityId: entityId } },
      body: { isDisposed },
      dispose() {},
    });

    expect(() => selectUniqueFixtureSupportAggregateV1(
      [aggregate("other")],
      "terrain-main",
    )).toThrow("WORLDKIT_ROUTE_FIXTURE_SUPPORT_ENTITY_INVALID");
    expect(() => selectUniqueFixtureSupportAggregateV1(
      [aggregate("terrain-main"), aggregate("terrain-main")],
      "terrain-main",
    )).toThrow("WORLDKIT_ROUTE_FIXTURE_SUPPORT_ENTITY_INVALID");
    expect(() => selectUniqueFixtureSupportAggregateV1(
      [aggregate("terrain-main", true)],
      "terrain-main",
    )).toThrow("WORLDKIT_ROUTE_FIXTURE_SUPPORT_ENTITY_INVALID");
    expect(selectUniqueFixtureSupportAggregateV1(
      [aggregate("other"), aggregate("terrain-main")],
      "terrain-main",
    ).transformNode.metadata?.worldkitEntityId).toBe("terrain-main");
  });

  it("rejects non-canonical current Authoring input before creating Runtime infrastructure", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "worldkit-route-runner-invalid-"),
    );
    try {
      const fixture = JSON.parse(await readFile(
        new URL("../../examples/traversal/route-r0-contract.json", import.meta.url),
        "utf8",
      )) as { authoringSpec: object };
      const inputPath = path.join(temporaryDirectory, "world.json");
      await writeFile(
        inputPath,
        JSON.stringify({
          ...fixture.authoringSpec,
          unexpectedAlias: { controlledEntityId: "player" },
        }),
        "utf8",
      );

      await expect(runTrustedRouteValidationV1(inputPath)).rejects.toMatchObject({
        code: "WORLDKIT_ROUTE_VALIDATION_INFRASTRUCTURE_ERROR",
        reason: "WORLDKIT_ROUTE_VALIDATION_INPUT_INVALID",
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("resolves only the exact locked Subject Asset identity and returns detached bytes", async () => {
    const resolver = createWorldPackageSubjectAssetResolverV1(ARTIFACTS);
    const request = {
      subjectAssetRef: ARTIFACTS[0]!.resourceRef,
      artifactContentHash: ASSET_HASH,
      byteLength: ASSET_BYTES.byteLength,
      mediaType: "model/gltf-binary" as const,
    };

    const first = await resolver.resolveSubjectAsset(request);
    const second = await resolver.resolveSubjectAsset(request);

    expect(first).toEqual({
      bytes: ASSET_BYTES,
      sourceLabel: "world-package:resources/subject-assets/test.actor.glb",
    });
    expect(first.bytes).not.toBe(ASSET_BYTES);
    expect(second.bytes).not.toBe(first.bytes);
    first.bytes[0] = 99;
    expect(second.bytes).toEqual(ASSET_BYTES);
  });

  it("rejects unknown, mismatched, duplicated, and mutated artifacts", async () => {
    const resolver = createWorldPackageSubjectAssetResolverV1(ARTIFACTS);
    await expect(resolver.resolveSubjectAsset({
      subjectAssetRef: "worldkit://subject-asset/unknown@1",
      artifactContentHash: ASSET_HASH,
      byteLength: ASSET_BYTES.byteLength,
      mediaType: "model/gltf-binary",
    })).rejects.toThrow("WORLDKIT_ROUTE_VALIDATION_ASSET_UNAVAILABLE");
    await expect(resolver.resolveSubjectAsset({
      subjectAssetRef: ARTIFACTS[0]!.resourceRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
      byteLength: ASSET_BYTES.byteLength,
      mediaType: "model/gltf-binary",
    })).rejects.toThrow("WORLDKIT_ROUTE_VALIDATION_ASSET_IDENTITY_MISMATCH");

    expect(() => createWorldPackageSubjectAssetResolverV1([
      ...ARTIFACTS,
      { ...ARTIFACTS[0]!, bytes: new Uint8Array(ASSET_BYTES) },
    ])).toThrow("WORLDKIT_ROUTE_VALIDATION_ASSET_DUPLICATE");

    const mutableBytes = new Uint8Array(ASSET_BYTES);
    const mutationSafeResolver = createWorldPackageSubjectAssetResolverV1([
      { ...ARTIFACTS[0]!, bytes: mutableBytes },
    ]);
    mutableBytes[0] = 88;
    expect((await mutationSafeResolver.resolveSubjectAsset({
      subjectAssetRef: ARTIFACTS[0]!.resourceRef,
      artifactContentHash: ASSET_HASH,
      byteLength: ASSET_BYTES.byteLength,
      mediaType: "model/gltf-binary",
    })).bytes).toEqual(ASSET_BYTES);
  });

  it("runs the frozen V4/V5 fixture through Recast and real Babylon/Havok", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "worldkit-route-runner-"),
    );
    try {
      const fixture = JSON.parse(await readFile(
        new URL("../../examples/traversal/route-r0-contract.json", import.meta.url),
        "utf8",
      )) as { authoringSpec: unknown };
      const authoringSpec = structuredClone(fixture.authoringSpec) as {
        nodes: Array<{
          kind: string;
          components?: { terrain?: { source: unknown } };
        }>;
      };
      authoringSpec.nodes = authoringSpec.nodes.filter(
        ({ kind }) => kind !== "water",
      );
      const terrain = authoringSpec.nodes.find(({ kind }) => kind === "terrain");
      if (terrain?.components?.terrain === undefined) {
        throw new Error("Route runner fixture terrain is missing.");
      }
      terrain.components.terrain.source = {
        kind: "procedural",
        relief: "flat",
      };
      const inputPath = path.join(temporaryDirectory, "world.json");
      await writeFile(inputPath, JSON.stringify(authoringSpec), "utf8");

      const result = await runTrustedRouteValidationV1(inputPath);

      expect(
        result.report.status,
        JSON.stringify(result.report.diagnostics),
      ).toBe("passed");
      expect(result.report.subject).toEqual(result.subject);
      expect(result.routeEvidencePublication).toMatchObject({
        worldPackageRootHash:
          result.worldPackageBuildReceipt.worldPackageRootHash,
        validationReportHash: result.validationReportHash,
        routes: [
          {
            summary: {
              connectivityStatus: "complete",
              routePathStatus: "complete",
              routeRuntimeProbeStatus: "complete",
              routeOverlayStatus: "available",
            },
          },
        ],
      });
      expect(result.evidenceFiles.map(({ relativePath }) => relativePath))
        .toEqual([...result.evidenceFiles.map(({ relativePath }) => relativePath)].sort());
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 180_000);

  it("returns the canonical failed Report for a V4 world with zero required Routes", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "worldkit-route-runner-zero-"),
    );
    try {
      const fixture = JSON.parse(await readFile(
        new URL("../../examples/traversal/route-r0-contract.json", import.meta.url),
        "utf8",
      )) as {
        authoringSpec: {
          constraints: { placements: readonly unknown[]; connectivity?: readonly unknown[] };
        };
      };
      const authoringSpec = structuredClone(fixture.authoringSpec);
      authoringSpec.constraints.connectivity = [];
      const inputPath = path.join(temporaryDirectory, "world.json");
      await writeFile(inputPath, JSON.stringify(authoringSpec), "utf8");

      const result = await runTrustedRouteValidationV1(inputPath);

      expect(result.report.status).toBe("failed");
      expect(result.report.routeValidationSetReceipt.rows).toEqual([]);
      expect(result.evidenceFiles).toHaveLength(1);
      expect(result.routeEvidencePublication.routes).toEqual([]);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 15_000);

  it("withdraws fixture-owned support only after reset for the R1b support-loss gate", async () => {
    const fixturePath = new URL(
      "../../examples/traversal/r1b-static-platform/fail-platform-edge-fall.world.json",
      import.meta.url,
    );

    const result = await runTrustedRouteValidationV1(fileURLToPath(fixturePath), {
      fixtureFaultInjection: {
        kind: "withdraw-static-support-after-reset",
        supportEntityId: "terrain-main",
      },
    });

    expect(result.report.gateResultsById["route-connectivity"]?.status).toBe(
      "passed",
    );
    expect(
      result.report.gateResultsById["route-runtime-conformance"]?.status,
    ).toBe("failed");
    expect(result.report.diagnostics.map(({ code }) => code)).toContain(
      "ROUTE_RUNTIME_SUPPORT_LOST",
    );

    const probeEvidenceFiles = result.evidenceFiles.filter(
      ({ kind }) => kind === "route-runtime-probe-receipt",
    );
    expect(probeEvidenceFiles).toHaveLength(1);
    const probeEvidenceFile = probeEvidenceFiles[0];
    if (isNil(probeEvidenceFile)) {
      throw new Error("Runtime Probe evidence was not emitted.");
    }
    const receipt = canonicalRouteRuntimeProbeReceiptV2(
      JSON.parse(new TextDecoder().decode(probeEvidenceFile.bytes)),
    );
    expect(receipt.status).toBe("failed");
    if (receipt.status !== "failed") {
      throw new Error("Support-loss fixture unexpectedly completed.");
    }

    const initialSupport = receipt.initialRuntimeEvidence.characterSupport;
    expect(initialSupport.supportState).not.toBe("unsupported");
    expect(initialSupport.surfaceResolution).toMatchObject({
      mode: "resolved",
      surfaceEntityId: "terrain-main",
    });
    expect(receipt.failure.kind).toBe("runtime-support-lost");
    if (receipt.failure.kind !== "runtime-support-lost") {
      throw new Error("Support-loss fixture emitted the wrong failure kind.");
    }

    const failureTickCount =
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1
        .routeRuntimeGateThresholds.maximumConsecutiveUnsupportedTicks + 1;
    expect(failureTickCount).toBe(7);
    expect(receipt.ticks[0]?.runtimeEvidence.characterSupport.supportState)
      .toBe("unsupported");
    expect(receipt.ticks[0]?.consecutiveUnexpectedUnsupportedTicks).toBe(1);
    expect(receipt.failure.failureProbeTick).toBe(failureTickCount);
    expect(receipt.failure.consecutiveUnexpectedUnsupportedTicks).toBe(
      failureTickCount,
    );
    expect(
      receipt.metrics.maximumConsecutiveUnexpectedUnsupportedTicks,
    ).toBe(failureTickCount);
    expect(receipt.metrics.unexpectedSupportLossCount).toBe(1);
    expect(receipt.metrics.wrongSupportSurfaceCount).toBe(0);

    expect(JSON.stringify(result)).not.toContain(
      "withdraw-static-support-after-reset",
    );
    expect(JSON.stringify(result)).not.toContain("fixtureFaultInjection");
  }, 120_000);

});
