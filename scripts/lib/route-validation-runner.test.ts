import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { sha256Bytes } from "@whitebox-world/protocol";
import type { ResolvedWorldPackageResourceArtifactV1 } from "@whitebox-world/world-package";

import { createValidAuthoringSpec } from "../../packages/authoring/src/test-fixture";

import {
  createWorldPackageSubjectAssetResolverV1,
  runTrustedRouteValidationV1,
} from "./route-validation-runner";

const ASSET_BYTES = new Uint8Array([1, 2, 3, 4]);
const ASSET_HASH = sha256Bytes(ASSET_BYTES);
const ARTIFACTS: readonly ResolvedWorldPackageResourceArtifactV1[] = [
  {
    resourceRef: "worldkit://subject-asset/test.actor@1",
    packagePath: "resources/subject-assets/test.actor.glb",
    mediaType: "model/gltf-binary",
    bytes: ASSET_BYTES,
  },
];

describe("Route validation trusted runner", () => {
  it("rejects Authoring V3 before creating Runtime infrastructure", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "worldkit-route-runner-v3-"),
    );
    try {
      const inputPath = path.join(temporaryDirectory, "world.json");
      await writeFile(
        inputPath,
        JSON.stringify(createValidAuthoringSpec()),
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
  }, 60_000);

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
});
