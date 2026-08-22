import {
  BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
} from "@whitebox-world/runtime-babylon";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type { TraversalRuntimeImplementationIdentityV1 } from "@whitebox-world/traversal";
import { describe, expect, it } from "vitest";

import {
  assertAuditedTraversalRuntimeIdentityV1,
  RECAST_GRAPH_PROVIDER_ADAPTER_HASH_V1,
  RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1,
} from "./adapter-identity.js";

describe("Recast Graph Provider Adapter identity", () => {
  it("accepts only the production Runtime tuple", () => {
    expect(() => assertAuditedTraversalRuntimeIdentityV1(
      BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
    )).not.toThrow();

    const unsupportedIdentities: TraversalRuntimeImplementationIdentityV1[] = [
      {
        ...BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
        runtimeBackendHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
      },
      {
        ...BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
        runtimeAdapterRef: "worldkit://runtime-adapter/babylon-world-runtime@1",
      },
      {
        ...BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
        runtimeAdapterHash:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const,
      },
    ];
    for (const unsupported of unsupportedIdentities) {
      expect(() => assertAuditedTraversalRuntimeIdentityV1(unsupported)).toThrow(
        "TRAVERSAL_RECAST_BACKEND_MAPPING_NOT_AUDITED",
      );
    }
  });

  it("hashes package version, tiled mode, mapping formulas, and constants", () => {
    expect(RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1).toMatchObject({
      kind: "traversal-graph-provider-adapter-manifest",
      schemaVersion: 1,
      graphProviderAdapterRef:
        "worldkit://graph-provider-adapter/recast-navigation.tiled@1",
      graphProviderAdapterResolvedVersion: "0.43.1+lifecycle.1+mapping.1",
      providerPackageName: "recast-navigation",
      providerPackageVersion: "0.43.1",
      generatorMode: "tiled",
      meterQuantization: "nearest-integer-micrometer",
      constants: {
        borderSize: 0,
        minRegionArea: 8,
        mergeRegionArea: 20,
        maxVertsPerPoly: 6,
        detailSampleDist: 6,
        detailSampleMaxError: 1,
        buildBvTree: true,
        chunkyTriMeshTrisPerChunk: 128,
      },
    });
    expect(RECAST_GRAPH_PROVIDER_ADAPTER_HASH_V1).toBe(
      sha256CanonicalJson(RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1),
    );
    expect(RECAST_GRAPH_PROVIDER_ADAPTER_HASH_V1).toBe(
      "sha256:6c06d9eb2a90fe58edcc9504d74c9c9bfecaeb67b10bd0b1c99f31d0f40fdf91",
    );
    expect(Object.isFrozen(RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1)).toBe(true);
    expect(Object.isFrozen(RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1.constants))
      .toBe(true);
  });

  it("pins both the declared and installed provider version to the manifest", () => {
    const packageJson = JSON.parse(readFileSync(
      new URL("../package.json", import.meta.url),
      "utf8",
    )) as { dependencies: Record<string, string> };
    const providerEntryPath = createRequire(import.meta.url).resolve(
      "recast-navigation",
    );
    const installedPackageJson = JSON.parse(readFileSync(
      new URL("./package.json", pathToFileURL(providerEntryPath)),
      "utf8",
    )) as { version: string };

    expect(packageJson.dependencies["recast-navigation"]).toBe(
      RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1.providerPackageVersion,
    );
    expect(installedPackageJson.version).toBe(
      RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1.providerPackageVersion,
    );
  });
});
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
