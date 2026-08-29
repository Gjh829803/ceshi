import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type { TraversalRuntimeImplementationIdentityV1 } from "@whitebox-world/traversal";

export const BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1 = Object.freeze({
  kind: "traversal-runtime-backend-manifest",
  schemaVersion: 1,
  resourceRef: "worldkit://runtime-backend/babylon-havok@1",
  resolvedVersion: "9.23.0+1.3.14",
  babylonCoreVersion: "9.23.0",
  havokPluginVersion: "1.3.14",
} as const);

export const BABYLON_TRAVERSAL_RUNTIME_ADAPTER_MANIFEST_V1 = Object.freeze({
  kind: "traversal-runtime-adapter-manifest",
  schemaVersion: 1,
  resourceRef: "worldkit://runtime-adapter/babylon.character-controller@1",
  resolvedVersion: "1",
  runtimeBackendRef: BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1.resourceRef,
  runtimeBackendResolvedVersion:
    BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1.resolvedVersion,
  adapterContractVersion: "character-controller-ground-support.v1",
} as const);

export const BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1 =
  Object.freeze({
    runtimeBackendRef: BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1.resourceRef,
    runtimeBackendResolvedVersion:
      BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1.resolvedVersion,
    runtimeBackendHash: sha256CanonicalJson(
      BABYLON_TRAVERSAL_RUNTIME_BACKEND_MANIFEST_V1,
    ) as `sha256:${string}`,
    runtimeAdapterRef: BABYLON_TRAVERSAL_RUNTIME_ADAPTER_MANIFEST_V1.resourceRef,
    runtimeAdapterResolvedVersion:
      BABYLON_TRAVERSAL_RUNTIME_ADAPTER_MANIFEST_V1.resolvedVersion,
    runtimeAdapterHash: sha256CanonicalJson(
      BABYLON_TRAVERSAL_RUNTIME_ADAPTER_MANIFEST_V1,
    ) as `sha256:${string}`,
  } satisfies TraversalRuntimeImplementationIdentityV1);
