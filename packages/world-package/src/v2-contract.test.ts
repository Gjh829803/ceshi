import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  assertWorldPackageBuildReceiptV2,
  assertWorldPackageHostCompatibilityV2,
  assertWorldPackageMigrationReportV1,
  canonicalWorldPackageManifestV1,
  canonicalWorldPackageManifestV2,
  canonicalWorldPackageSignatureEnvelopeV1,
  hashWorldPackageManifestV1,
  hashWorldPackageManifestV2,
  hashWorldPackageRootV1,
  hashWorldPackageRootV2,
  migrateWorldPackageBuildReceiptV1ToV2,
  worldPackageSignatureEnvelopeBytesV1,
  type WorldPackageHostPolicyV1,
} from "./index.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const HASH_D = `sha256:${"d".repeat(64)}` as const;
const HASH_E = `sha256:${"e".repeat(64)}` as const;

function asNonPlainArray(rows: readonly unknown[]): unknown[] {
  const array = [...rows];
  Object.setPrototypeOf(array, Object.create(Array.prototype));
  return array;
}

const LOCKED_RESOURCES = [
  {
    resourceRef: "worldkit://gameplay-bootstrap/coastal-world@1",
    resourceKind: "gameplay-bootstrap",
    resolvedVersion: "1",
    contentHash: HASH_D,
  },
] as const;

function validManifestV2(): Record<string, unknown> {
  return {
    kind: "worldkit-world-package-manifest",
    schemaVersion: 2,
    id: "coastal-world.package",
    title: "Coastal World",
    packageFormatVersion: 2,
    sdkVersion: "0.0.0",
    worldId: "coastal-world",
    seed: 1024,
    runtimeTarget: "babylon-web",
    canonicalizationProfile: "canonical-json-jcs@1",
    hashAlgorithm: "sha256",
    authoringSchema: {
      schemaVersion: 4,
      contentHash: HASH_A,
    },
    aiSchemaProjectionProfile: {
      resourceRef: "worldkit://ai-schema-projection-profile/constrained-json@1",
      contentHash: HASH_B,
    },
    normalizedWorldIrSchemaVersion: 4,
    executionPlanSchemaVersion: 5,
    authoringSpecHash: HASH_A,
    normalizedWorldIrHash: HASH_B,
    executionPlanHash: HASH_C,
    registryLockHash: sha256CanonicalJson(LOCKED_RESOURCES),
    layoutSolveReportHash: HASH_E,
    initialControlledEntityId: "player",
    worldBounds: {
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [128, 96],
      heightRangeMeters: [-4, 24],
    },
    resourceBudget: {
      maximumVertices: 100_000,
      maximumTriangles: 50_000,
      maximumColliders: 1_000,
    },
    lockedResources: LOCKED_RESOURCES,
    entryPoint: {
      executionPlanPath: "targets/babylon-web/execution-plan.json",
      gameplayBootstrapPath: "gameplay/bootstrap.json",
    },
    legal: {
      distributionPolicy: "redistributable",
      noticePath: "NOTICE",
      licenseDocuments: [
        {
          id: "project-owned",
          spdxLicenseExpression: "LicenseRef-Project-Owned",
          path: "LICENSES/project-owned.txt",
          mediaType: "text/plain; charset=utf-8",
          sizeBytes: 21,
          contentHash: HASH_C,
        },
      ],
    },
    hostCompatibility: {
      profileRef: "worldkit://host-compatibility/babylon-web@1",
      profileHash: HASH_D,
      runtimeContractVersion: 1,
      requiredFeatureIds: ["runtime.full-reload-v1"],
    },
    resources: [
      {
        resourceRef: "worldkit://gameplay-bootstrap/coastal-world@1",
        packagePath: "gameplay/bootstrap.json",
        mediaType: "application/vnd.worldkit.gameplay-bootstrap+json",
        sizeBytes: 256,
        contentHash: HASH_D,
        licenseDocumentId: "project-owned",
        redistributionPolicy: "allowed",
        author: "Agent Whitebox World SDK",
      },
    ],
  };
}

function validReceiptV2(): Record<string, unknown> {
  const manifest = canonicalWorldPackageManifestV2(validManifestV2());
  const manifestBytes = canonicalJsonBytes(manifest);
  const fileIntegrityEntries = [
    {
      path: "NOTICE",
      mediaType: "text/plain; charset=utf-8",
      sizeBytes: 6,
      sha256: HASH_E,
    },
    {
      path: "manifest.json",
      mediaType: "application/json",
      sizeBytes: manifestBytes.byteLength,
      sha256: sha256Bytes(manifestBytes),
    },
  ];
  return {
    kind: "worldkit-world-package-build-receipt",
    schemaVersion: 2,
    manifest,
    manifestHash: sha256CanonicalJson(manifest),
    fileIntegrityEntries,
    worldPackageRootHash: sha256CanonicalJson({
      packageFormatVersion: 2,
      canonicalizationProfile: "canonical-json-jcs@1",
      hashAlgorithm: "sha256",
      files: fileIntegrityEntries,
    }),
  };
}

function validReceiptV1(): Record<string, unknown> {
  const registryLockHash = sha256CanonicalJson(LOCKED_RESOURCES);
  const manifest = canonicalWorldPackageManifestV1({
    kind: "worldkit-world-package-manifest",
    schemaVersion: 1,
    id: "coastal-world.package",
    packageFormatVersion: 1,
    worldId: "coastal-world",
    seed: 1024,
    runtimeTarget: "babylon-web",
    canonicalizationProfile: "canonical-json-jcs@1",
    hashAlgorithm: "sha256",
    authoringSchemaVersion: 4,
    normalizedWorldIrSchemaVersion: 4,
    executionPlanSchemaVersion: 5,
    authoringSpecHash: HASH_A,
    normalizedWorldIrHash: HASH_B,
    executionPlanHash: HASH_C,
    resourceLockHash: registryLockHash,
    layoutSolveReportHash: HASH_E,
    initialControlledEntityId: "player",
    entryPoint: {
      executionPlanPath: "targets/babylon-web/execution-plan.json",
    },
    resources: [
      {
        resourceRef: "worldkit://gameplay-bootstrap/coastal-world@1",
        packagePath: "gameplay/bootstrap.json",
        mediaType: "application/vnd.worldkit.gameplay-bootstrap+json",
        sizeBytes: 256,
        contentHash: HASH_D,
      },
    ],
  });
  const manifestBytes = canonicalJsonBytes(manifest);
  const fileIntegrityEntries = [
    {
      path: "gameplay/bootstrap.json",
      mediaType: "application/vnd.worldkit.gameplay-bootstrap+json",
      sizeBytes: 256,
      sha256: HASH_D,
    },
    {
      path: "layout-solve-report.json",
      mediaType: "application/json",
      sizeBytes: 10,
      sha256: HASH_E,
    },
    {
      path: "manifest.json",
      mediaType: "application/json",
      sizeBytes: manifestBytes.byteLength,
      sha256: sha256Bytes(manifestBytes),
    },
    {
      path: "registry-lock.json",
      mediaType: "application/json",
      sizeBytes: 10,
      sha256: registryLockHash,
    },
    {
      path: "targets/babylon-web/execution-plan.json",
      mediaType: "application/json",
      sizeBytes: 10,
      sha256: HASH_C,
    },
    {
      path: "world.normalized.json",
      mediaType: "application/json",
      sizeBytes: 10,
      sha256: HASH_B,
    },
  ];
  return {
    kind: "worldkit-world-package-build-receipt",
    schemaVersion: 1,
    manifest,
    manifestHash: hashWorldPackageManifestV1(manifest),
    fileIntegrityEntries,
    worldPackageRootHash: hashWorldPackageRootV1(fileIntegrityEntries),
  };
}

function validMigrationInput(): Record<string, unknown> {
  return {
    sourceReceipt: validReceiptV1(),
    context: {
      title: "Coastal World",
      sdkVersion: "0.0.0",
      canonicalAuthoringSchemaHash: HASH_A,
      aiSchemaProjectionProfile: {
        resourceRef: "worldkit://ai-schema-projection-profile/constrained-json@1",
        contentHash: HASH_B,
      },
      worldBounds: {
        centerMetersXZ: [0, 0],
        sizeMetersXZ: [128, 96],
        heightRangeMeters: [-4, 24],
      },
      resourceBudget: {
        maximumVertices: 100_000,
        maximumTriangles: 50_000,
        maximumColliders: 1_000,
      },
      lockedResources: LOCKED_RESOURCES,
      legal: {
        distributionPolicy: "redistributable",
        noticePath: "NOTICE",
        licenseDocuments: [
          {
            id: "project-owned",
            spdxLicenseExpression: "LicenseRef-Project-Owned",
            path: "LICENSES/project-owned.txt",
            mediaType: "text/plain; charset=utf-8",
            sizeBytes: 21,
            contentHash: HASH_C,
          },
        ],
      },
      hostCompatibility: {
        profileRef: "worldkit://host-compatibility/babylon-web@1",
        profileHash: HASH_D,
        runtimeContractVersion: 1,
        requiredFeatureIds: ["runtime.full-reload-v1"],
      },
      resources: validManifestV2().resources,
      v2OnlyFileIntegrityEntries: [
        {
          path: "LICENSES/project-owned.txt",
          mediaType: "text/plain; charset=utf-8",
          sizeBytes: 21,
          sha256: HASH_C,
        },
        {
          path: "NOTICE",
          mediaType: "text/plain; charset=utf-8",
          sizeBytes: 6,
          sha256: HASH_E,
        },
      ],
    },
  };
}

describe("WorldPackageManifestV2", () => {
  it("admits the closed V2 manifest and hashes the canonical V2 bytes", () => {
    expect(() => canonicalWorldPackageManifestV2(validManifestV2())).not.toThrow();
    expect(hashWorldPackageManifestV2(validManifestV2())).toBe(
      sha256CanonicalJson(validManifestV2()),
    );
  });

  it("rejects missing, unknown, aliased, and wrong-version top-level fields", () => {
    const missingTitle = validManifestV2();
    delete missingTitle.title;
    const wrongSchemaVersion = { ...validManifestV2(), schemaVersion: 1 };
    const wrongFormatVersion = { ...validManifestV2(), packageFormatVersion: 1 };
    const unknown = { ...validManifestV2(), provider: "babylon" };
    const resourceLockAlias = {
      ...validManifestV2(),
      resourceLockHash: validManifestV2().registryLockHash,
    };
    const runtimeBackendAlias = {
      ...validManifestV2(),
      runtimeBackend: "babylon-web",
    };
    const v1Manifest = validReceiptV1().manifest;

    for (const candidate of [
      missingTitle,
      wrongSchemaVersion,
      wrongFormatVersion,
      unknown,
      resourceLockAlias,
      runtimeBackendAlias,
      v1Manifest,
    ]) {
      expect(() => canonicalWorldPackageManifestV2(candidate)).toThrow(
        "WORLD_PACKAGE_MANIFEST_V2_INVALID",
      );
    }
    expect(() => canonicalWorldPackageManifestV1(validManifestV2())).toThrow();
  });

  it("rejects non-canonical nested records, locks, legal bindings, and budgets", () => {
    const aliasedBudget = validManifestV2();
    aliasedBudget.resourceBudget = {
      maxVertices: 100_000,
      maximumTriangles: 50_000,
      maximumColliders: 1_000,
    };

    const unsortedLocks = validManifestV2();
    unsortedLocks.lockedResources = [
      {
        resourceRef: "worldkit://gameplay-bootstrap/z@1",
        resourceKind: "gameplay-bootstrap",
        resolvedVersion: "1",
        contentHash: HASH_D,
      },
      {
        resourceRef: "worldkit://gameplay-bootstrap/a@1",
        resourceKind: "gameplay-bootstrap",
        resolvedVersion: "1",
        contentHash: HASH_C,
      },
    ];
    unsortedLocks.registryLockHash = sha256CanonicalJson(
      unsortedLocks.lockedResources,
    );

    const forgedLockHash = {
      ...validManifestV2(),
      registryLockHash: HASH_A,
    };

    const unsafeLicensePath = validManifestV2();
    unsafeLicensePath.legal = {
      distributionPolicy: "redistributable",
      noticePath: "NOTICE",
      licenseDocuments: [
        {
          id: "project-owned",
          spdxLicenseExpression: "LicenseRef-Project-Owned",
          path: "LICENSES/../secret.txt",
          mediaType: "text/plain; charset=utf-8",
          sizeBytes: 21,
          contentHash: HASH_C,
        },
      ],
    };

    const missingLicenseBinding = validManifestV2();
    missingLicenseBinding.resources = [
      {
        ...(missingLicenseBinding.resources as Record<string, unknown>[])[0],
        licenseDocumentId: "missing-license",
      },
    ];

    const unsortedFeatures = validManifestV2();
    unsortedFeatures.hostCompatibility = {
      profileRef: "worldkit://host-compatibility/babylon-web@1",
      profileHash: HASH_D,
      runtimeContractVersion: 1,
      requiredFeatureIds: ["z", "a"],
    };

    const invalidSourceUri = validManifestV2();
    invalidSourceUri.resources = [
      {
        ...(invalidSourceUri.resources as Record<string, unknown>[])[0],
        sourceUri: "not an absolute URI",
      },
    ];

    const emptyLicenses = validManifestV2();
    emptyLicenses.legal = {
      distributionPolicy: "internal-only",
      noticePath: "NOTICE",
      licenseDocuments: [],
    };
    emptyLicenses.resources = [];

    const emptyLocks = validManifestV2();
    emptyLocks.lockedResources = [];
    emptyLocks.registryLockHash = sha256CanonicalJson([]);

    for (const candidate of [
      aliasedBudget,
      unsortedLocks,
      forgedLockHash,
      unsafeLicensePath,
      missingLicenseBinding,
      unsortedFeatures,
      invalidSourceUri,
      emptyLicenses,
      emptyLocks,
    ]) {
      expect(() => canonicalWorldPackageManifestV2(candidate)).toThrow(
        "WORLD_PACKAGE_MANIFEST_V2_INVALID",
      );
    }
  });

  it("rejects accessors, symbol keys, non-plain arrays, and negative zero without invoking getters", () => {
    let getterInvocations = 0;
    const accessor = validManifestV2();
    Object.defineProperty(accessor, "title", {
      enumerable: true,
      get() {
        getterInvocations += 1;
        return "Coastal World";
      },
    });

    const symbolKeyed = validManifestV2();
    Object.defineProperty(symbolKeyed, Symbol("provider"), {
      enumerable: true,
      value: "babylon",
    });

    const negativeZero = { ...validManifestV2(), seed: -0 };

    const nonPlainFeatureArray = validManifestV2();
    const featureIds = ["runtime.full-reload-v1"];
    Object.setPrototypeOf(featureIds, Object.create(Array.prototype));
    nonPlainFeatureArray.hostCompatibility = {
      profileRef: "worldkit://host-compatibility/babylon-web@1",
      profileHash: HASH_D,
      runtimeContractVersion: 1,
      requiredFeatureIds: featureIds,
    };

    for (const candidate of [
      accessor,
      symbolKeyed,
      negativeZero,
      nonPlainFeatureArray,
    ]) {
      expect(() => canonicalWorldPackageManifestV2(candidate)).toThrow(
        "WORLD_PACKAGE_MANIFEST_V2_INVALID",
      );
    }
    expect(getterInvocations).toBe(0);
  });

  it("rejects non-plain arrays at every manifest collection boundary", () => {
    const locks = validManifestV2();
    locks.lockedResources = asNonPlainArray(
      locks.lockedResources as readonly unknown[],
    );

    const resources = validManifestV2();
    resources.resources = asNonPlainArray(resources.resources as readonly unknown[]);

    const licenses = validManifestV2();
    const legal = licenses.legal as Record<string, unknown>;
    legal.licenseDocuments = asNonPlainArray(
      legal.licenseDocuments as readonly unknown[],
    );

    for (const candidate of [locks, resources, licenses]) {
      expect(() => canonicalWorldPackageManifestV2(candidate)).toThrow(
        "WORLD_PACKAGE_MANIFEST_V2_INVALID",
      );
    }
  });
});

describe("WorldPackageBuildReceiptV2", () => {
  it("binds canonical file integrity rows to the V2 Package Root domain", () => {
    const receipt = validReceiptV2();
    const entries = receipt.fileIntegrityEntries;
    const expectedRoot = receipt.worldPackageRootHash;

    expect(hashWorldPackageRootV2(entries)).toBe(expectedRoot);
    expect(() => assertWorldPackageBuildReceiptV2(receipt)).not.toThrow();
  });

  it("rejects wrong versions, unknown keys, forged hashes, order drift, and wrong manifest size", () => {
    const baseline = validReceiptV2();
    const wrongVersion = { ...baseline, schemaVersion: 1 };
    const unknown = { ...baseline, integrityProfile: "sha256" };
    const forgedManifestHash = { ...baseline, manifestHash: HASH_A };
    const forgedRoot = { ...baseline, worldPackageRootHash: HASH_B };
    const reversedEntries = {
      ...baseline,
      fileIntegrityEntries: [
        ...(baseline.fileIntegrityEntries as unknown[]),
      ].reverse(),
    };
    const wrongManifestSizeEntries = (
      baseline.fileIntegrityEntries as Record<string, unknown>[]
    ).map((entry) =>
      entry.path === "manifest.json"
        ? { ...entry, sizeBytes: Number(entry.sizeBytes) + 1 }
        : entry
    );
    const wrongManifestSize = {
      ...baseline,
      fileIntegrityEntries: wrongManifestSizeEntries,
      worldPackageRootHash: sha256CanonicalJson({
        packageFormatVersion: 2,
        canonicalizationProfile: "canonical-json-jcs@1",
        hashAlgorithm: "sha256",
        files: wrongManifestSizeEntries,
      }),
    };

    for (const candidate of [
      wrongVersion,
      unknown,
      forgedManifestHash,
      forgedRoot,
      reversedEntries,
      wrongManifestSize,
    ]) {
      expect(() => assertWorldPackageBuildReceiptV2(candidate)).toThrow(
        "WORLD_PACKAGE_BUILD_RECEIPT_V2_INVALID",
      );
    }
    expect(() => hashWorldPackageRootV2([])).toThrow(
      "WORLD_PACKAGE_ROOT_V2_INVALID",
    );
  });

  it("rejects non-plain file inventories at both Root and Receipt boundaries", () => {
    const receipt = validReceiptV2();
    const nonPlainEntries = asNonPlainArray(
      receipt.fileIntegrityEntries as readonly unknown[],
    );

    expect(() => hashWorldPackageRootV2(nonPlainEntries)).toThrow(
      "WORLD_PACKAGE_ROOT_V2_INVALID",
    );
    expect(() =>
      assertWorldPackageBuildReceiptV2({
        ...receipt,
        fileIntegrityEntries: nonPlainEntries,
      }),
    ).toThrow("WORLD_PACKAGE_BUILD_RECEIPT_V2_INVALID");
  });
});

describe("WorldPackageSignatureEnvelopeV1", () => {
  function validEnvelope(): Record<string, unknown> {
    return {
      kind: "worldkit-package-signature-envelope",
      schemaVersion: 1,
      packageRootHash: HASH_A,
      packageId: "coastal-world.package",
      packageFormatVersion: 2,
      runtimeTarget: "babylon-web",
      signatureAlgorithm: "ed25519",
      keyId: "publisher-key-2026-01",
      trustDomain: "worldkit.production",
      signedAt: "2026-08-27T00:00:00.000Z",
    };
  }

  it("canonicalizes the exact domain-separated Ed25519 signature input", () => {
    const envelope = validEnvelope();

    expect(() => canonicalWorldPackageSignatureEnvelopeV1(envelope)).not.toThrow();
    expect(worldPackageSignatureEnvelopeBytesV1(envelope)).toEqual(
      canonicalJsonBytes(envelope),
    );
  });

  it("rejects non-domain fields, wrong algorithms or versions, invalid time, and untrusted data graphs", () => {
    const unknown = { ...validEnvelope(), digest: HASH_B };
    const wrongSchemaVersion = { ...validEnvelope(), schemaVersion: 2 };
    const wrongPackageFormat = { ...validEnvelope(), packageFormatVersion: 1 };
    const wrongRuntime = { ...validEnvelope(), runtimeTarget: "three-web" };
    const wrongAlgorithm = { ...validEnvelope(), signatureAlgorithm: "rsa" };
    const zeroRoot = {
      ...validEnvelope(),
      packageRootHash: `sha256:${"0".repeat(64)}`,
    };
    const emptyKeyId = { ...validEnvelope(), keyId: "" };
    const invalidDate = {
      ...validEnvelope(),
      signedAt: "2026-02-30T00:00:00.000Z",
    };
    let getterInvocations = 0;
    const accessor = validEnvelope();
    Object.defineProperty(accessor, "keyId", {
      enumerable: true,
      get() {
        getterInvocations += 1;
        return "publisher-key-2026-01";
      },
    });

    for (const candidate of [
      unknown,
      wrongSchemaVersion,
      wrongPackageFormat,
      wrongRuntime,
      wrongAlgorithm,
      zeroRoot,
      emptyKeyId,
      invalidDate,
      accessor,
    ]) {
      expect(() => canonicalWorldPackageSignatureEnvelopeV1(candidate)).toThrow(
        "WORLD_PACKAGE_SIGNATURE_ENVELOPE_INVALID",
      );
    }
    expect(getterInvocations).toBe(0);
  });
});

describe("WorldPackageHostPolicyV1", () => {
  function validPolicy(): WorldPackageHostPolicyV1 {
    return {
      acceptedRuntimeTargets: ["babylon-web"],
      acceptedPackageFormatVersions: [2],
      acceptedManifestSchemaVersions: [2],
      runtimeContractVersion: 1,
      supportedFeatureIds: ["runtime.full-reload-v1"],
      trustedCompatibilityProfiles: [{
        profileRef: "worldkit://host-compatibility/babylon-web@1",
        profileHash: HASH_D,
      }],
      allowedDistributionPolicies: ["redistributable"],
      signaturePolicy: { mode: "not-required" },
    };
  }

  it("admits the exact Runtime, feature, compatibility profile, and distribution matrix", () => {
    expect(() => assertWorldPackageHostCompatibilityV2(
      validManifestV2(),
      validPolicy(),
    )).not.toThrow();
  });

  it("rejects incompatible versions, features, profiles, contracts, and distribution", () => {
    const wrongRuntime = { ...validManifestV2(), runtimeTarget: "three-web" };
    const wrongPackageVersion = { ...validManifestV2(), packageFormatVersion: 1 };
    const wrongManifestVersion = { ...validManifestV2(), schemaVersion: 1 };
    const wrongContract = validManifestV2();
    wrongContract.hostCompatibility = {
      ...(wrongContract.hostCompatibility as Record<string, unknown>),
      runtimeContractVersion: 2,
    };
    const unknownFeature = validManifestV2();
    unknownFeature.hostCompatibility = {
      ...(unknownFeature.hostCompatibility as Record<string, unknown>),
      requiredFeatureIds: ["runtime.incremental-v1"],
    };
    const wrongProfileRef = validManifestV2();
    wrongProfileRef.hostCompatibility = {
      ...(wrongProfileRef.hostCompatibility as Record<string, unknown>),
      profileRef: "worldkit://host-compatibility/unknown@1",
    };
    const wrongProfileHash = validManifestV2();
    wrongProfileHash.hostCompatibility = {
      ...(wrongProfileHash.hostCompatibility as Record<string, unknown>),
      profileHash: HASH_A,
    };
    const disallowedDistribution = validManifestV2();
    disallowedDistribution.legal = {
      ...(disallowedDistribution.legal as Record<string, unknown>),
      distributionPolicy: "internal-only",
    };

    for (const manifest of [
      wrongRuntime,
      wrongPackageVersion,
      wrongManifestVersion,
      wrongContract,
      unknownFeature,
      wrongProfileRef,
      wrongProfileHash,
      disallowedDistribution,
    ]) {
      expect(() => assertWorldPackageHostCompatibilityV2(
        manifest as never,
        validPolicy(),
      )).toThrow("WORLD_PACKAGE_HOST_INCOMPATIBLE");
    }
  });

  it("rejects malformed, accessor-bearing, and internally ambiguous Host policy", () => {
    let getterInvocations = 0;
    const accessor = validPolicy() as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "runtimeContractVersion", {
      enumerable: true,
      get() {
        getterInvocations += 1;
        return 1;
      },
    });
    const duplicateFeatures = {
      ...validPolicy(),
      supportedFeatureIds: ["runtime.full-reload-v1", "runtime.full-reload-v1"],
    };
    const wrongRequiredSignature = {
      ...validPolicy(),
      signaturePolicy: { mode: "required", trustDomain: "" },
    };
    const broadenedPackageVersions = {
      ...validPolicy(),
      acceptedPackageFormatVersions: [2, 3],
    };
    const broadenedManifestVersions = {
      ...validPolicy(),
      acceptedManifestSchemaVersions: [2, 3],
    };

    for (const policy of [
      accessor,
      duplicateFeatures,
      wrongRequiredSignature,
      broadenedPackageVersions,
      broadenedManifestVersions,
    ]) {
      expect(() => assertWorldPackageHostCompatibilityV2(
        validManifestV2(),
        policy as never,
      )).toThrow("WORLD_PACKAGE_HOST_INCOMPATIBLE");
    }
    expect(getterInvocations).toBe(0);
  });
});

describe("WorldPackage V1 to V2 migration", () => {
  it("requires explicit V2-only facts and emits a hash-bound migration report", () => {
    const result = migrateWorldPackageBuildReceiptV1ToV2(
      validMigrationInput() as never,
    ) as unknown as {
      readonly receipt: Record<string, unknown>;
      readonly report: Record<string, unknown>;
    };

    expect(result.receipt.schemaVersion).toBe(2);
    expect(result.receipt.worldPackageRootHash).not.toBe(
      validReceiptV1().worldPackageRootHash,
    );
    expect(result.report).toMatchObject({
      kind: "worldkit-world-package-migration-report",
      schemaVersion: 1,
      sourceManifestSchemaVersion: 1,
      targetManifestSchemaVersion: 2,
      sourceWorldPackageRootHash: validReceiptV1().worldPackageRootHash,
      targetWorldPackageRootHash: result.receipt.worldPackageRootHash,
    });
  });

  it("rejects non-text NOTICE bytes and migration reports without distinct before/after identities", () => {
    const invalidNotice = structuredClone(validMigrationInput());
    const context = invalidNotice.context as Record<string, unknown>;
    context.v2OnlyFileIntegrityEntries = [
      (context.v2OnlyFileIntegrityEntries as Record<string, unknown>[])[0],
      {
        ...(context.v2OnlyFileIntegrityEntries as Record<string, unknown>[])[1],
        mediaType: "application/json",
      },
    ];

    expect(() => migrateWorldPackageBuildReceiptV1ToV2(invalidNotice as never)).toThrow(
      "WORLD_PACKAGE_MIGRATION_V1_TO_V2_INVALID",
    );

    const result = migrateWorldPackageBuildReceiptV1ToV2(
      validMigrationInput() as never,
    );
    const sameRootReport = {
      ...result.report,
      sourceWorldPackageRootHash: result.report.targetWorldPackageRootHash,
    };
    expect(() => assertWorldPackageMigrationReportV1(sameRootReport)).toThrow(
      "WORLD_PACKAGE_MIGRATION_V1_TO_V2_INVALID",
    );
  });

  it("rejects non-plain migration collection boundaries", () => {
    const locks = validMigrationInput();
    const locksContext = locks.context as Record<string, unknown>;
    locksContext.lockedResources = asNonPlainArray(
      locksContext.lockedResources as readonly unknown[],
    );

    const v2OnlyFiles = validMigrationInput();
    const filesContext = v2OnlyFiles.context as Record<string, unknown>;
    filesContext.v2OnlyFileIntegrityEntries = asNonPlainArray(
      filesContext.v2OnlyFileIntegrityEntries as readonly unknown[],
    );

    for (const candidate of [locks, v2OnlyFiles]) {
      expect(() => migrateWorldPackageBuildReceiptV1ToV2(candidate as never)).toThrow(
        "WORLD_PACKAGE_MIGRATION_V1_TO_V2_INVALID",
      );
    }

    const result = migrateWorldPackageBuildReceiptV1ToV2(
      validMigrationInput() as never,
    );
    expect(() =>
      assertWorldPackageMigrationReportV1({
        ...result.report,
        migratedFieldIds: asNonPlainArray(result.report.migratedFieldIds),
      }),
    ).toThrow("WORLD_PACKAGE_MIGRATION_V1_TO_V2_INVALID");
  });
});
