import {
  normalizeAuthoringSpecV4,
  validateAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { compileWorldV5 } from "@whitebox-world/compiler";
import {
  createGameplayBootstrapResourceLockEntryV1,
  createGameplayBootstrapV1,
  gameplayBootstrapCanonicalBytesV1,
} from "@whitebox-world/gameplay-contracts";
import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import { readFile } from "node:fs/promises";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import {
  assembleWorldPackageDirectoryV2,
  hashWorldPackageManifestV2,
  hashWorldPackageRootV2,
  createWorldPackageBuildReceiptV1,
  migrateWorldPackageBuildReceiptV1ToV2,
  verifyWorldPackageDirectoryV2,
  type CreateWorldPackageBuildReceiptInputV1,
  type WorldPackageBuildReceiptV2,
  type WorldPackageDirectoryFileV2,
  type WorldPackageDirectoryV2,
} from "./index.js";
import basicWorldDocument from "../../../examples/authoring/basic-world.json";
import riggedWorldDocument from "../../../examples/authoring/rigged-subject-world.json";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const NOTICE_BYTES = new TextEncoder().encode(
  "Agent Whitebox World SDK\nSee LICENSES/project-owned.txt.\n",
);
const LICENSE_BYTES = new TextEncoder().encode(
  "Project-owned test fixture. Redistribution allowed.\n",
);

function hashBytes(bytes: Uint8Array): `sha256:${string}` {
  return sha256Bytes(bytes) as `sha256:${string}`;
}

function v4Fixture(): AuthoringSpecV4 {
  return authoringFixture(basicWorldDocument);
}

function authoringFixture(value: unknown): AuthoringSpecV4 {
  const validated = validateAuthoringSpecV4(value);
  if (!validated.ok || isNil(validated.value)) {
    throw new Error("fixture AuthoringSpecV4 is invalid");
  }
  return validated.value;
}

function trustedBuildInput(
  authoringSpec: AuthoringSpecV4 = v4Fixture(),
  resourceArtifacts: CreateWorldPackageBuildReceiptInputV1["resourceArtifacts"] = [],
): CreateWorldPackageBuildReceiptInputV1 {
  const normalized = normalizeAuthoringSpecV4(authoringSpec);
  if (
    !normalized.ok ||
    isNil(normalized.value) ||
    isNil(normalized.normalizedWorldIrHash) ||
    isNil(normalized.layoutSolveReport) ||
    isNil(normalized.layoutSolveReportHash)
  ) {
    throw new Error("fixture normalization failed");
  }
  const bootstrap = createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: `${authoringSpec.id}.gameplay`,
    version: 1,
    resourceRef: `worldkit://gameplay-bootstrap/${authoringSpec.id}@1`,
    entityDescriptors: normalized.value.nodes
      .filter((node) => node.kind === "subject")
      .map((node) => {
        const definition = normalized.value!.resources.subjectDefinitions.find(
          (candidate) =>
            candidate.subjectDefinitionRef === node.subjectDefinitionRef,
        );
        if (isNil(definition)) throw new Error("fixture Subject Definition missing");
        return {
          id: node.id,
          entityDefinitionRef: node.subjectDefinitionRef,
          capabilityRefs: definition.capabilityRefs,
        };
      }),
    featureResourceLocks: [],
    semanticActionDefinitions: [],
    availableCapabilityRefs: [],
    initialRelationshipStates: [],
  });
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrapResourceLock:
      createGameplayBootstrapResourceLockEntryV1(bootstrap),
  });
  if (!compiled.ok || isNil(compiled.executionPlan)) {
    throw new Error("fixture compilation failed");
  }
  return {
    packageId: `${authoringSpec.id}.package`,
    authoringSpec,
    normalizedWorldIr: normalized.value,
    layoutSolveResult: {
      status: normalized.layoutSolveReport.status,
      report: normalized.layoutSolveReport,
      layoutSolveReportHash: normalized.layoutSolveReportHash,
    },
    executionPlan: compiled.executionPlan,
    gameplayBootstrap: bootstrap,
    resourceArtifacts,
  };
}

function rootFile(
  path: string,
  mediaType: string,
  bytes: Uint8Array,
): WorldPackageDirectoryFileV2 {
  return { path, mediaType, bytes };
}

function canonicalFile(
  path: string,
  value: unknown,
  mediaType = "application/json",
): WorldPackageDirectoryFileV2 {
  return rootFile(path, mediaType, canonicalJsonBytes(value));
}

function directoryFixture(includeAuthoringSpec = true): WorldPackageDirectoryV2 {
  return directoryFromBuild(trustedBuildInput(), includeAuthoringSpec);
}

function directoryFromBuild(
  build: CreateWorldPackageBuildReceiptInputV1,
  includeAuthoringSpec = true,
): WorldPackageDirectoryV2 {
  const sourceReceipt = createWorldPackageBuildReceiptV1({
    ...build,
    includeAuthoringSpec,
  });
  const resources = sourceReceipt.manifest.resources.map((resource) => ({
    ...resource,
    licenseDocumentId: "project-owned",
    redistributionPolicy: "allowed" as const,
    sourceUri: `worldkit-source://fixture/${encodeURIComponent(resource.resourceRef)}`,
    author: "Agent Whitebox World SDK",
  }));
  const migrated = migrateWorldPackageBuildReceiptV1ToV2({
    sourceReceipt,
    context: {
      title: "Basic World",
      sdkVersion: "0.0.0",
      canonicalAuthoringSchemaHash: HASH_A,
      aiSchemaProjectionProfile: {
        resourceRef: "worldkit://ai-schema-projection-profile/constrained-json@1",
        contentHash: HASH_B,
      },
      worldBounds: build.authoringSpec.world.bounds,
      resourceBudget: {
        maximumVertices: build.authoringSpec.world.resourceBudget.maxVertices,
        maximumTriangles: build.authoringSpec.world.resourceBudget.maxTriangles,
        maximumColliders: build.authoringSpec.world.resourceBudget.maxColliders,
      },
      lockedResources: build.executionPlan.resourceLockEntries,
      legal: {
        distributionPolicy: "redistributable",
        noticePath: "NOTICE",
        licenseDocuments: [{
          id: "project-owned",
          spdxLicenseExpression: "LicenseRef-Project-Owned",
          path: "LICENSES/project-owned.txt",
          mediaType: "text/plain; charset=utf-8",
          sizeBytes: LICENSE_BYTES.byteLength,
          contentHash: hashBytes(LICENSE_BYTES),
        }],
      },
      hostCompatibility: {
        profileRef: "worldkit://host-compatibility/babylon-web@1",
        profileHash: HASH_B,
        runtimeContractVersion: 1,
        requiredFeatureIds: ["runtime.full-reload-v1"],
      },
      resources,
      v2OnlyFileIntegrityEntries: [
        {
          path: "LICENSES/project-owned.txt",
          mediaType: "text/plain; charset=utf-8",
          sizeBytes: LICENSE_BYTES.byteLength,
          sha256: hashBytes(LICENSE_BYTES),
        },
        {
          path: "NOTICE",
          mediaType: "text/plain; charset=utf-8",
          sizeBytes: NOTICE_BYTES.byteLength,
          sha256: hashBytes(NOTICE_BYTES),
        },
      ],
    },
  });
  return assembleWorldPackageDirectoryV2({
    receipt: migrated.receipt,
    files: [
      canonicalFile("manifest.json", migrated.receipt.manifest),
      ...(includeAuthoringSpec
        ? [canonicalFile("authoring-spec.json", build.authoringSpec)]
        : []),
      canonicalFile("world.normalized.json", build.normalizedWorldIr),
      canonicalFile("registry-lock.json", build.executionPlan.resourceLockEntries),
      canonicalFile("layout-solve-report.json", build.layoutSolveResult.report),
      canonicalFile(
        "targets/babylon-web/execution-plan.json",
        build.executionPlan,
      ),
      rootFile(
        "gameplay/bootstrap.json",
        "application/vnd.worldkit.gameplay-bootstrap+json",
        gameplayBootstrapCanonicalBytesV1(build.gameplayBootstrap),
      ),
      rootFile("NOTICE", "text/plain; charset=utf-8", NOTICE_BYTES),
      rootFile(
        "LICENSES/project-owned.txt",
        "text/plain; charset=utf-8",
        LICENSE_BYTES,
      ),
      ...build.resourceArtifacts.map((resource) =>
        rootFile(resource.packagePath, resource.mediaType, resource.bytes)
      ),
    ].reverse(),
  });
}

function replaceFile(
  directory: WorldPackageDirectoryV2,
  path: string,
  replacement: WorldPackageDirectoryFileV2,
): WorldPackageDirectoryV2 {
  return {
    ...directory,
    files: directory.files.map((file) => file.path === path ? replacement : file),
  };
}

describe("WorldPackageDirectoryV2", () => {
  it("assembles transport metadata outside Root and verifies the real runtime closure", () => {
    const directory = directoryFixture();
    const verified = verifyWorldPackageDirectoryV2(directory);

    expect(directory.files.map((file) => file.path)).toEqual([
      "LICENSES/project-owned.txt",
      "NOTICE",
      "authoring-spec.json",
      "gameplay/bootstrap.json",
      "integrity.json",
      "layout-solve-report.json",
      "manifest.json",
      "registry-lock.json",
      "targets/babylon-web/execution-plan.json",
      "world-package-build-receipt.json",
      "world.normalized.json",
    ]);
    expect(directory.receipt.fileIntegrityEntries.some(
      (entry) => entry.path === "integrity.json" || entry.path.startsWith("signatures/"),
    )).toBe(false);
    expect(verified.executionPlan).toEqual(
      JSON.parse(new TextDecoder().decode(
        directory.files.find((file) =>
          file.path === "targets/babylon-web/execution-plan.json"
        )!.bytes,
      )),
    );
    expect(verified.resourceBytesByRef.get(
      "worldkit://gameplay-bootstrap/basic-world@1",
    )).toEqual(gameplayBootstrapCanonicalBytesV1(verified.gameplayBootstrap));
    const firstRead = verified.resourceBytesByRef.get(
      "worldkit://gameplay-bootstrap/basic-world@1",
    )!;
    firstRead[0] = firstRead[0]! ^ 1;
    expect(verified.resourceBytesByRef.get(
      "worldkit://gameplay-bootstrap/basic-world@1",
    )).toEqual(gameplayBootstrapCanonicalBytesV1(verified.gameplayBootstrap));
    expect("set" in verified.resourceBytesByRef).toBe(false);
  });

  it("verifies a loadable package when the optional AuthoringSpec audit file is absent", () => {
    const verified = verifyWorldPackageDirectoryV2(directoryFixture(false));

    expect(verified.authoringSpec).toBeUndefined();
    expect(verified.executionPlan.id).toBe(verified.normalizedWorldIr.id);
  });

  it("returns byte-exact defensive copies for a real locked binary Subject Asset", async () => {
    const bytes = new Uint8Array(await readFile(new URL(
      "../../../apps/playground/public/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
      import.meta.url,
    )));
    const build = trustedBuildInput(
      authoringFixture(riggedWorldDocument),
      [{
        resourceRef: "worldkit://subject-asset/humanoid.golden@2",
        packagePath: "resources/subject-assets/humanoid.golden.glb",
        mediaType: "model/gltf-binary",
        bytes,
      }],
    );
    const verified = verifyWorldPackageDirectoryV2(directoryFromBuild(build));
    const admitted = verified.resourceBytesByRef.get(
      "worldkit://subject-asset/humanoid.golden@2",
    )!;

    expect(admitted).toEqual(bytes);
    admitted[0] = admitted[0]! ^ 1;
    expect(verified.resourceBytesByRef.get(
      "worldkit://subject-asset/humanoid.golden@2",
    )).toEqual(bytes);
  });

  it("rejects duplicate, missing, extra, unsafe, symlink-like, and Root-excluded paths", () => {
    const directory = directoryFixture();
    const manifestFile = directory.files.find((file) => file.path === "manifest.json")!;
    const withoutNotice = {
      ...directory,
      files: directory.files.filter((file) => file.path !== "NOTICE"),
    };
    const duplicate = { ...directory, files: [...directory.files, manifestFile] };
    const extra = {
      ...directory,
      files: [...directory.files, rootFile("extra.bin", "application/octet-stream", new Uint8Array([1]))],
    };
    const unsafe = {
      ...directory,
      files: directory.files.map((file, index) =>
        index === 0 ? { ...file, path: "../escape" } : file
      ),
    };
    const symlinkLike = {
      ...directory,
      files: directory.files.map((file, index) =>
        index === 0 ? { ...file, kind: "symlink", target: "/tmp/secret" } : file
      ),
    };
    const integritySelfEntry = forgeReceiptInventory(directory.receipt, {
      path: "integrity.json",
      mediaType: "application/json",
      sizeBytes: 2,
      sha256: hashBytes(new TextEncoder().encode("[]")),
    });
    const signatureRootEntry = forgeReceiptInventory(directory.receipt, {
      path: "signatures/key.json",
      mediaType: "application/json",
      sizeBytes: 2,
      sha256: hashBytes(new TextEncoder().encode("{}")),
    });

    for (const candidate of [
      withoutNotice,
      duplicate,
      extra,
      unsafe,
      symlinkLike,
      { ...directory, receipt: integritySelfEntry },
      { ...directory, receipt: signatureRootEntry },
    ]) {
      expect(() => verifyWorldPackageDirectoryV2(candidate)).toThrow(
        "WORLD_PACKAGE_DIRECTORY_V2_INVALID",
      );
    }
  });

  it("rejects media, byte, size, metadata, and Package Root forgery", () => {
    const directory = directoryFixture();
    const notice = directory.files.find((file) => file.path === "NOTICE")!;
    const wrongMedia = replaceFile(directory, "NOTICE", {
      ...notice,
      mediaType: "application/octet-stream",
    });
    const changedBytes = replaceFile(directory, "NOTICE", {
      ...notice,
      bytes: new Uint8Array(notice.bytes.map((byte, index) =>
        index === 0 ? byte ^ 1 : byte
      )),
    });
    const changedSize = replaceFile(directory, "NOTICE", {
      ...notice,
      bytes: notice.bytes.slice(1),
    });
    const forgedRoot = {
      ...directory,
      receipt: { ...directory.receipt, worldPackageRootHash: HASH_A },
    };
    const integrity = directory.files.find((file) => file.path === "integrity.json")!;
    const wrongIntegrity = replaceFile(directory, "integrity.json", {
      ...integrity,
      bytes: canonicalJsonBytes([]),
    });

    for (const candidate of [
      wrongMedia,
      changedBytes,
      changedSize,
      forgedRoot,
      wrongIntegrity,
    ]) {
      expect(() => verifyWorldPackageDirectoryV2(candidate)).toThrow(
        "WORLD_PACKAGE_DIRECTORY_V2_INVALID",
      );
    }
  });

  it("rejects non-canonical, duplicate-key, BOM, invalid UTF-8, and invalid legal text", () => {
    const directory = directoryFixture();
    const normalized = directory.files.find((file) =>
      file.path === "world.normalized.json"
    )!;
    const notice = directory.files.find((file) => file.path === "NOTICE")!;
    const normalizedValue = JSON.parse(new TextDecoder().decode(normalized.bytes));
    const nonCanonical = repackRootFile(directory, {
      ...normalized,
      bytes: new TextEncoder().encode(
        JSON.stringify(normalizedValue, undefined, 2),
      ),
    });
    const duplicateKey = repackRootFile(directory, {
      ...normalized,
      bytes: new TextEncoder().encode(
        '{"kind":"worldkit-normalized-world","kind":"worldkit-normalized-world","schemaVersion":4}',
      ),
    });
    const comment = repackRootFile(directory, {
      ...normalized,
      bytes: new TextEncoder().encode('{/* forbidden */"kind":"worldkit-normalized-world"}'),
    });
    const trailingComma = repackRootFile(directory, {
      ...normalized,
      bytes: new TextEncoder().encode('{"kind":"worldkit-normalized-world",}'),
    });
    const bom = repackRootFile(directory, {
      ...normalized,
      bytes: new Uint8Array([0xef, 0xbb, 0xbf, ...normalized.bytes]),
    });
    const invalidUtf8 = repackRootFile(directory, {
      ...normalized,
      bytes: new Uint8Array([0xc3, 0x28]),
    });
    const invalidLegalText = repackRootFile(directory, {
      ...notice,
      bytes: new Uint8Array([0xc3, 0x28]),
    });

    for (const candidate of [
      nonCanonical,
      duplicateKey,
      comment,
      trailingComma,
      bom,
      invalidUtf8,
      invalidLegalText,
    ]) {
      expect(() => verifyWorldPackageDirectoryV2(candidate)).toThrow(
        "WORLD_PACKAGE_DIRECTORY_V2_INVALID",
      );
    }
  });

  it("rejects cross-file Registry, Plan, world bounds, budget, and initial-control drift", () => {
    const directory = directoryFixture();
    const manifest = structuredClone(directory.receipt.manifest);
    const driftedLocks = [{
      ...manifest.lockedResources[0]!,
      resolvedVersion: "2",
      contentHash: HASH_A,
    }];
    const driftedManifests: WorldPackageBuildReceiptV2["manifest"][] = [
      {
        ...manifest,
        lockedResources: driftedLocks,
        registryLockHash: sha256CanonicalJson(driftedLocks) as `sha256:${string}`,
      },
      { ...manifest, executionPlanHash: HASH_A },
      { ...manifest, worldBounds: { ...manifest.worldBounds, sizeMetersXZ: [1, 1] } },
      { ...manifest, resourceBudget: { ...manifest.resourceBudget, maximumVertices: 1 } },
      { ...manifest, initialControlledEntityId: "wrong-player" },
      {
        ...manifest,
        legal: {
          ...manifest.legal,
          licenseDocuments: manifest.legal.licenseDocuments.map((license) => ({
            ...license,
            sizeBytes: license.sizeBytes + 1,
            contentHash: HASH_A,
          })),
        },
      },
      {
        ...manifest,
        resources: manifest.resources.map((resource) => ({
          ...resource,
          sizeBytes: resource.sizeBytes + 1,
          contentHash: HASH_A,
        })),
      },
    ];

    for (const driftedManifest of driftedManifests) {
      const candidate = forgeManifest(directory, driftedManifest);
      expect(() => verifyWorldPackageDirectoryV2(candidate)).toThrow(
        "WORLD_PACKAGE_DIRECTORY_V2_INVALID",
      );
    }
  });

  it("normalizes failures from owner validators to the directory error domain", () => {
    const directory = directoryFixture(false);
    const layoutFile = directory.files.find((file) =>
      file.path === "layout-solve-report.json"
    )!;
    const layout = JSON.parse(new TextDecoder().decode(layoutFile.bytes));
    const selfHashedLayout = repackRootFile(directory, {
      ...layoutFile,
      bytes: canonicalJsonBytes({ ...layout, layoutSolveReportHash: HASH_A }),
    });

    expect(() => verifyWorldPackageDirectoryV2(selfHashedLayout)).toThrow(
      "WORLD_PACKAGE_DIRECTORY_V2_INVALID",
    );
  });
});

function forgeReceiptInventory(
  receipt: WorldPackageBuildReceiptV2,
  extraEntry: WorldPackageBuildReceiptV2["fileIntegrityEntries"][number],
): WorldPackageBuildReceiptV2 {
  return {
    ...receipt,
    fileIntegrityEntries: [...receipt.fileIntegrityEntries, extraEntry]
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
    worldPackageRootHash: HASH_A,
  };
}

function forgeManifest(
  directory: WorldPackageDirectoryV2,
  manifest: WorldPackageBuildReceiptV2["manifest"],
): WorldPackageDirectoryV2 {
  const manifestBytes = canonicalJsonBytes(manifest);
  const manifestHash = hashWorldPackageManifestV2(manifest);
  const entries = directory.receipt.fileIntegrityEntries.map((entry) =>
    entry.path === "manifest.json"
      ? {
          ...entry,
          sizeBytes: manifestBytes.byteLength,
          sha256: manifestHash,
        }
      : entry
  );
  const receipt: WorldPackageBuildReceiptV2 = {
    ...directory.receipt,
    manifest,
    manifestHash,
    fileIntegrityEntries: entries,
    worldPackageRootHash: hashWorldPackageRootV2(entries),
  };
  return replaceReceiptMetadata(
    replaceFile(directory, "manifest.json", {
      path: "manifest.json",
      mediaType: "application/json",
      bytes: manifestBytes,
    }),
    receipt,
  );
}

function repackRootFile(
  directory: WorldPackageDirectoryV2,
  replacement: WorldPackageDirectoryFileV2,
): WorldPackageDirectoryV2 {
  const entries = directory.receipt.fileIntegrityEntries.map((entry) =>
    entry.path === replacement.path
      ? {
          ...entry,
          mediaType: replacement.mediaType,
          sizeBytes: replacement.bytes.byteLength,
          sha256: hashBytes(replacement.bytes),
        }
      : entry
  );
  const receipt: WorldPackageBuildReceiptV2 = {
    ...directory.receipt,
    fileIntegrityEntries: entries,
    worldPackageRootHash: hashWorldPackageRootV2(entries),
  };
  return replaceReceiptMetadata(
    replaceFile(directory, replacement.path, replacement),
    receipt,
  );
}

function replaceReceiptMetadata(
  directory: WorldPackageDirectoryV2,
  receipt: WorldPackageBuildReceiptV2,
): WorldPackageDirectoryV2 {
  return {
    ...directory,
    receipt,
    files: directory.files.map((file) => {
      if (file.path === "integrity.json") {
        return { ...file, bytes: canonicalJsonBytes(receipt.fileIntegrityEntries) };
      }
      if (file.path === "world-package-build-receipt.json") {
        return { ...file, bytes: canonicalJsonBytes(receipt) };
      }
      return file;
    }),
  };
}
