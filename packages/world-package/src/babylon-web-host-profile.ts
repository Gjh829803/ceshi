import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { sha256CanonicalJson } from "@whitebox-world/protocol";

import type {
  WorldPackageHostCompatibilityV2,
  WorldPackageHostPolicyV1,
} from "./v2-types.js";

export const BABYLON_WEB_HOST_COMPATIBILITY_PROFILE_REF_V1 =
  "worldkit://host-compatibility/babylon-web@1" as const;

export const BABYLON_WEB_HOST_COMPATIBILITY_PROFILE_V1 = Object.freeze({
  kind: "worldkit-host-compatibility-profile",
  schemaVersion: 1,
  profileRef: BABYLON_WEB_HOST_COMPATIBILITY_PROFILE_REF_V1,
  runtimeTarget: "babylon-web",
  runtimeContractVersion: 1,
  supportedFeatureIds: Object.freeze(["runtime.full-reload-v1"]),
});

export const BABYLON_WEB_HOST_COMPATIBILITY_PROFILE_HASH_V1 =
  sha256CanonicalJson(
    BABYLON_WEB_HOST_COMPATIBILITY_PROFILE_V1,
  ) as Sha256HashV1;

export const BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V2 = Object.freeze({
  profileRef: BABYLON_WEB_HOST_COMPATIBILITY_PROFILE_REF_V1,
  profileHash: BABYLON_WEB_HOST_COMPATIBILITY_PROFILE_HASH_V1,
  runtimeContractVersion: 1,
  requiredFeatureIds: Object.freeze(["runtime.full-reload-v1"]),
}) satisfies WorldPackageHostCompatibilityV2;

export const BABYLON_WEB_WORLD_PACKAGE_HOST_POLICY_V1 = Object.freeze({
  acceptedRuntimeTargets: Object.freeze(["babylon-web"] as const),
  acceptedPackageFormatVersions: Object.freeze([2] as const),
  acceptedManifestSchemaVersions: Object.freeze([2] as const),
  runtimeContractVersion: 1,
  supportedFeatureIds: Object.freeze(["runtime.full-reload-v1"]),
  trustedCompatibilityProfiles: Object.freeze([Object.freeze({
    profileRef: BABYLON_WEB_HOST_COMPATIBILITY_PROFILE_REF_V1,
    profileHash: BABYLON_WEB_HOST_COMPATIBILITY_PROFILE_HASH_V1,
  })]),
  allowedDistributionPolicies: Object.freeze([
    "internal-only",
    "redistributable",
  ] as const),
  signaturePolicy: Object.freeze({ mode: "not-required" as const }),
}) satisfies WorldPackageHostPolicyV1;
