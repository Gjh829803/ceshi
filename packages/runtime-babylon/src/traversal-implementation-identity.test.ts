import { readFileSync } from "node:fs";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  BABYLON_TRAVERSAL_RUNTIME_ADAPTER_MANIFEST_V1,
  BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1,
  BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
} from "./traversal-implementation-identity.js";

describe("Babylon traversal implementation identity", () => {
  it("derives the one production tuple from closed canonical manifests", () => {
    expect(BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1).toEqual({
      kind: "traversal-runtime-backend-manifest",
      schemaVersion: 1,
      resourceRef: "worldkit://runtime-backend/babylon-havok@1",
      resolvedVersion: "9.21.2+1.3.14",
      babylonCoreVersion: "9.21.2",
      havokPluginVersion: "1.3.14",
    });
    expect(BABYLON_TRAVERSAL_RUNTIME_ADAPTER_MANIFEST_V1).toEqual({
      kind: "traversal-runtime-adapter-manifest",
      schemaVersion: 1,
      resourceRef: "worldkit://runtime-adapter/babylon.character-controller@1",
      resolvedVersion: "1",
      runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
      runtimeBackendResolvedVersion: "9.21.2+1.3.14",
      adapterContractVersion: "character-controller-ground-support.v1",
    });
    expect(BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1).toEqual({
      runtimeBackendRef: BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1.resourceRef,
      runtimeBackendResolvedVersion:
        BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1.resolvedVersion,
      runtimeBackendHash: sha256CanonicalJson(
        BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1,
      ),
      runtimeAdapterRef: BABYLON_TRAVERSAL_RUNTIME_ADAPTER_MANIFEST_V1.resourceRef,
      runtimeAdapterResolvedVersion:
        BABYLON_TRAVERSAL_RUNTIME_ADAPTER_MANIFEST_V1.resolvedVersion,
      runtimeAdapterHash: sha256CanonicalJson(
        BABYLON_TRAVERSAL_RUNTIME_ADAPTER_MANIFEST_V1,
      ),
    });
    expect(Object.isFrozen(BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1)).toBe(true);
    expect(Object.isFrozen(BABYLON_TRAVERSAL_RUNTIME_ADAPTER_MANIFEST_V1)).toBe(true);
    expect(Object.isFrozen(BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1))
      .toBe(true);
  });

  it("pins direct package versions to the manifest identity", () => {
    const packageJson = JSON.parse(readFileSync(
      new URL("../package.json", import.meta.url),
      "utf8",
    )) as { dependencies: Record<string, string> };

    expect(packageJson.dependencies["@babylonjs/core"]).toBe(
      BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1.babylonCoreVersion,
    );
    expect(packageJson.dependencies["@babylonjs/loaders"]).toBe(
      BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1.babylonCoreVersion,
    );
    expect(packageJson.dependencies["@babylonjs/havok"]).toBe(
      BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1.havokPluginVersion,
    );
    expect(packageJson.dependencies["@whitebox-world/traversal"]).toBe("workspace:*");
  });
});
