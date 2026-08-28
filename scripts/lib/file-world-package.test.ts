import { worldPackageRefFromRootHashV1 } from "@whitebox-world/world-identity";

import {
  normalizeAuthoringSpecV4,
  validateAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { compileCanonicalWorldV1 } from "@whitebox-world/compiler";
import {
  createGameplayBootstrapResourceLockEntryV1,
  createGameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import {
  createWorldPackageV1,
  type WorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { generateKeyPairSync } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isNil } from "lodash-es";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import basicWorldDocument from "../../examples/authoring/basic-world.json";
import {
  createFileWorldPackageTestAdapterV1,
  createFileWorldPackageStoreV1,
  readWorldPackageDirectoryV1,
  writeWorldPackageDirectoryV1,
} from "./file-world-package.js";
import { signWorldPackageDirectoryV1 } from "./world-package-signing.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const READ_LIMITS = {
  maximumTotalBytes: 16 * 1024 * 1024,
  maximumFileCount: 256,
} as const;

let fixture: WorldPackageDirectoryV1;
let testRoot: string;

function authoringFixture(): AuthoringSpecV4 {
  const validated = validateAuthoringSpecV4(basicWorldDocument);
  if (!validated.ok || isNil(validated.value)) {
    throw new Error("fixture AuthoringSpecV4 is invalid");
  }
  return validated.value;
}

function createDirectoryFixture(): WorldPackageDirectoryV1 {
  const authoringSpec = authoringFixture();
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
  const gameplayBootstrap = createGameplayBootstrapV1({
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
  const compiled = compileCanonicalWorldV1({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrap,
    worldRuntimeBootstrapRef:
      `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
  });
  if (!compiled.ok || isNil(compiled.canonicalSceneExecutionPlan)) {
    throw new Error("fixture compilation failed");
  }
  return createWorldPackageV1({
    packageId: `${authoringSpec.id}.package`,
    title: "File World Package",
    sdkVersion: "0.0.0",
    distributionPolicy: "redistributable",
    canonicalAuthoringSchemaHash: HASH_A,
    aiSchemaProjectionProfile: {
      resourceRef: "worldkit://ai-schema-projection-profile/constrained-json@1",
      contentHash: HASH_B,
    },
    hostCompatibility: {
      profileRef: "worldkit://host-compatibility/babylon-web@1",
      profileHash: HASH_B,
      runtimeContractVersion: 1,
      requiredFeatureIds: ["runtime.full-reload-v1"],
    },
    authoringSpec,
    normalizedWorldIr: normalized.value,
    layoutSolveResult: {
      status: normalized.layoutSolveReport.status,
      report: normalized.layoutSolveReport,
      layoutSolveReportHash: normalized.layoutSolveReportHash,
    },
    executionPlan: compiled.canonicalSceneExecutionPlan,
    gameplayBootstrap,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
    resourceArtifacts: [],
    generatedResourceProvenance: {
      licenseDocumentId: "project-owned",
      licenseSpdxExpression: "LicenseRef-Project-Owned",
      redistributionPolicy: "allowed",
      author: "Agent Whitebox World SDK",
    },
    licenseDocuments: [{
      id: "project-owned",
      spdxLicenseExpression: "LicenseRef-Project-Owned",
      path: "LICENSES/project-owned.txt",
      text: "Project-owned fixture license. Redistribution allowed.\n",
    }],
    noticeText: "File World Package\nSee LICENSES/project-owned.txt.\n",
    includeAuthoringSpec: true,
  });
}

async function assertNoPublicationDebris(): Promise<void> {
  const rows = await readdir(testRoot);
  expect(rows.some((row) => row.includes(".tmp-") || row.endsWith(".publish.lock")))
    .toBe(false);
}

beforeAll(() => {
  const { privateKey } = generateKeyPairSync("ed25519");
  fixture = signWorldPackageDirectoryV1({
    directory: createDirectoryFixture(),
    keyId: "file-adapter-test",
    trustDomain: "worldkit.test",
    signedAt: "2026-08-27T00:00:00.000Z",
    privateKey,
  });
});

beforeEach(async () => {
  testRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), "world-package-file-")),
  );
  await chmod(testRoot, 0o700);
});

afterEach(async () => {
  await chmod(testRoot, 0o700).catch(() => undefined);
  await rm(testRoot, { recursive: true, force: true });
});

describe("file WorldPackage adapter", () => {
  it("publishes once with owner-only modes and reads the exact verified directory", async () => {
    const outputDirectoryPath = path.join(testRoot, "package");
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath,
      directory: {
        ...fixture,
        files: [...fixture.files].reverse(),
        signatureFiles: [...fixture.signatureFiles].reverse(),
      },
    });
    const read = await readWorldPackageDirectoryV1({
      packageDirectoryPath: outputDirectoryPath,
      ...READ_LIMITS,
    });

    expect(read.receipt.worldPackageRootHash).toBe(
      fixture.receipt.worldPackageRootHash,
    );
    expect(read.files).toEqual(fixture.files);
    expect(read.signatureFiles).toEqual(fixture.signatureFiles);
    expect((await lstat(outputDirectoryPath)).mode & 0o777).toBe(0o700);
    expect((await lstat(path.join(outputDirectoryPath, "manifest.json"))).mode & 0o777)
      .toBe(0o600);
    await assertNoPublicationDebris();
  });

  it("rejects relative outputs, existing destinations, and symlinked parents", async () => {
    await expect(writeWorldPackageDirectoryV1({
      outputDirectoryPath: "relative-package",
      directory: fixture,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");

    const existing = path.join(testRoot, "existing");
    await mkdir(existing, { mode: 0o700 });
    await expect(writeWorldPackageDirectoryV1({
      outputDirectoryPath: existing,
      directory: fixture,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");

    const realParent = path.join(testRoot, "real-parent");
    const linkedParent = path.join(testRoot, "linked-parent");
    await mkdir(realParent, { mode: 0o700 });
    await symlink(realParent, linkedParent);
    await expect(writeWorldPackageDirectoryV1({
      outputDirectoryPath: path.join(linkedParent, "package"),
      directory: fixture,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");
  });

  it("rejects package symlinks, non-owner permissions, and invalid limits", async () => {
    const outputDirectoryPath = path.join(testRoot, "package");
    await writeWorldPackageDirectoryV1({ outputDirectoryPath, directory: fixture });
    const manifestPath = path.join(outputDirectoryPath, "manifest.json");
    const externalPath = path.join(testRoot, "external.json");
    await writeFile(externalPath, await readFile(manifestPath), { mode: 0o600 });
    await unlink(manifestPath);
    await symlink(externalPath, manifestPath);
    await expect(readWorldPackageDirectoryV1({
      packageDirectoryPath: outputDirectoryPath,
      ...READ_LIMITS,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");

    await unlink(manifestPath);
    await writeFile(manifestPath, await readFile(externalPath), { mode: 0o644 });
    await expect(readWorldPackageDirectoryV1({
      packageDirectoryPath: outputDirectoryPath,
      ...READ_LIMITS,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");

    await chmod(manifestPath, 0o600);
    for (const limits of [
      { maximumTotalBytes: 1, maximumFileCount: 256 },
      { maximumTotalBytes: 16 * 1024 * 1024, maximumFileCount: 1 },
      { maximumTotalBytes: 0, maximumFileCount: 256 },
    ]) {
      await expect(readWorldPackageDirectoryV1({
        packageDirectoryPath: outputDirectoryPath,
        ...limits,
      })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");
    }
  });

  it("detects a nested directory changed into a symlink during traversal", async () => {
    const outputDirectoryPath = path.join(testRoot, "package");
    await writeWorldPackageDirectoryV1({ outputDirectoryPath, directory: fixture });
    let swapped = false;
    const adapter = createFileWorldPackageTestAdapterV1({
      async beforeReadDirectory(_absolutePath, relativePath) {
        if (relativePath !== "targets" || swapped) return;
        swapped = true;
        const original = path.join(outputDirectoryPath, "targets");
        const moved = path.join(outputDirectoryPath, "targets-original");
        await rename(original, moved);
        await symlink(moved, original);
      },
    });

    await expect(adapter.readWorldPackageDirectoryV1({
      packageDirectoryPath: outputDirectoryPath,
      ...READ_LIMITS,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");
    expect(swapped).toBe(true);
  });

  it("detects regular-file replacement after its no-follow descriptor is open", async () => {
    const outputDirectoryPath = path.join(testRoot, "package");
    await writeWorldPackageDirectoryV1({ outputDirectoryPath, directory: fixture });
    let replaced = false;
    const adapter = createFileWorldPackageTestAdapterV1({
      async afterReadFileOpen(absolutePath, relativePath) {
        if (relativePath !== "manifest.json" || replaced) return;
        replaced = true;
        const bytes = await readFile(absolutePath);
        await rename(absolutePath, `${absolutePath}.old`);
        await writeFile(absolutePath, bytes, { mode: 0o600 });
      },
    });

    await expect(adapter.readWorldPackageDirectoryV1({
      packageDirectoryPath: outputDirectoryPath,
      ...READ_LIMITS,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");
    expect(replaced).toBe(true);
  });

  it("removes only owned staging state after partial write and rename failures", async () => {
    let writes = 0;
    const partialWriteAdapter = createFileWorldPackageTestAdapterV1({
      async beforeWriteFile() {
        writes += 1;
        if (writes === 2) throw new Error("injected partial write failure");
      },
    });
    const partialOutput = path.join(testRoot, "partial-package");
    await expect(partialWriteAdapter.writeWorldPackageDirectoryV1({
      outputDirectoryPath: partialOutput,
      directory: fixture,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");
    await expect(lstat(partialOutput)).rejects.toMatchObject({ code: "ENOENT" });
    await assertNoPublicationDebris();

    const renameAdapter = createFileWorldPackageTestAdapterV1({
      async beforeRename() {
        throw new Error("injected rename failure");
      },
    });
    const renameOutput = path.join(testRoot, "rename-package");
    await expect(renameAdapter.writeWorldPackageDirectoryV1({
      outputDirectoryPath: renameOutput,
      directory: fixture,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");
    await expect(lstat(renameOutput)).rejects.toMatchObject({ code: "ENOENT" });
    await assertNoPublicationDebris();
  });

  it("fails closed before rename when a staging-directory fsync fails", async () => {
    let failed = false;
    const adapter = createFileWorldPackageTestAdapterV1({
      async beforeSyncDirectory(_absolutePath, phase) {
        if (phase !== "staging" || failed) return;
        failed = true;
        throw new Error("injected directory fsync failure");
      },
    });
    const outputDirectoryPath = path.join(testRoot, "package");
    await expect(adapter.writeWorldPackageDirectoryV1({
      outputDirectoryPath,
      directory: fixture,
    })).rejects.toThrow("WORLD_PACKAGE_FILE_IO_V2_INVALID");
    await expect(lstat(outputDirectoryPath)).rejects.toMatchObject({ code: "ENOENT" });
    await assertNoPublicationDebris();
  });

  it("allows exactly one of two concurrent writers to publish the destination", async () => {
    const outputDirectoryPath = path.join(testRoot, "package");
    const results = await Promise.allSettled([
      writeWorldPackageDirectoryV1({ outputDirectoryPath, directory: fixture }),
      writeWorldPackageDirectoryV1({ outputDirectoryPath, directory: fixture }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(readWorldPackageDirectoryV1({
      packageDirectoryPath: outputDirectoryPath,
      ...READ_LIMITS,
    })).resolves.toMatchObject({
      receipt: { worldPackageRootHash: fixture.receipt.worldPackageRootHash },
    });
    await assertNoPublicationDebris();
  });
});

describe("file WorldPackageStoreV1", () => {
  it("replays an idempotently stored package through a fresh adapter", async () => {
    const storeRootPath = path.join(testRoot, "store");
    await mkdir(storeRootPath, { mode: 0o700 });
    const store = createFileWorldPackageStoreV1({
      storeRootPath,
      ...READ_LIMITS,
    });
    const concurrentStore = createFileWorldPackageStoreV1({
      storeRootPath,
      ...READ_LIMITS,
    });
    const [first, concurrent] = await Promise.all([
      store.put(fixture),
      concurrentStore.put(fixture),
    ]);
    expect(first).toEqual(concurrent);
    expect(Object.keys(first).sort()).toEqual(["receipt", "worldPackageRef"]);
    expect(JSON.stringify(first)).not.toContain(storeRootPath);

    const freshStore = createFileWorldPackageStoreV1({
      storeRootPath,
      ...READ_LIMITS,
    });
    await expect(freshStore.get(first.worldPackageRef)).resolves.toMatchObject({
      receipt: { worldPackageRootHash: fixture.receipt.worldPackageRootHash },
      executionPlan: { id: fixture.receipt.manifest.worldId },
    });
    await expect(freshStore.get(worldPackageRefFromRootHashV1(
      `sha256:${"a".repeat(64)}`,
    ))).resolves.toBeUndefined();
  });

  it("rejects same-Root directory conflicts", async () => {
    const storeRootPath = path.join(testRoot, "store");
    await mkdir(storeRootPath, { mode: 0o700 });
    const store = createFileWorldPackageStoreV1({
      storeRootPath,
      ...READ_LIMITS,
    });
    await store.put(fixture);
    const { privateKey } = generateKeyPairSync("ed25519");
    const conflicting = signWorldPackageDirectoryV1({
      directory: fixture,
      keyId: "conflicting-signature",
      trustDomain: "worldkit.test",
      signedAt: "2026-08-27T00:00:01.000Z",
      privateKey,
    });
    expect(conflicting.receipt.worldPackageRootHash).toBe(
      fixture.receipt.worldPackageRootHash,
    );
    await expect(store.put(conflicting)).rejects.toThrow(
      "WORLD_PACKAGE_STORE_CONFLICT",
    );
  });

  it("rejects a stored directory whose path Ref and verified Root disagree", async () => {
    const storeRootPath = path.join(testRoot, "store");
    await mkdir(storeRootPath, { mode: 0o700 });
    const store = createFileWorldPackageStoreV1({
      storeRootPath,
      ...READ_LIMITS,
    });
    const stored = await store.put(fixture);
    const wrongRef = worldPackageRefFromRootHashV1(
      `sha256:${"c".repeat(64)}`,
    );
    const correctHex = stored.worldPackageRef.split("/").at(-1)!;
    const wrongHex = wrongRef.split("/").at(-1)!;
    await rename(
      path.join(storeRootPath, "sha256", correctHex),
      path.join(storeRootPath, "sha256", wrongHex),
    );

    const freshStore = createFileWorldPackageStoreV1({
      storeRootPath,
      ...READ_LIMITS,
    });
    await expect(freshStore.get(wrongRef)).rejects.toThrow(
      "WORLD_PACKAGE_STORE_REF_MISMATCH",
    );
  });

  it("rejects corrupted bytes instead of trusting the content-addressed directory name", async () => {
    const storeRootPath = path.join(testRoot, "store");
    await mkdir(storeRootPath, { mode: 0o700 });
    const store = createFileWorldPackageStoreV1({
      storeRootPath,
      ...READ_LIMITS,
    });
    const stored = await store.put(fixture);
    const rootHex = stored.worldPackageRef.split("/").at(-1)!;
    const manifestPath = path.join(
      storeRootPath,
      "sha256",
      rootHex,
      "manifest.json",
    );
    const bytes = await readFile(manifestPath);
    bytes[0] = bytes[0]! ^ 0xff;
    await writeFile(manifestPath, bytes, { mode: 0o600 });

    const freshStore = createFileWorldPackageStoreV1({
      storeRootPath,
      ...READ_LIMITS,
    });
    await expect(freshStore.get(stored.worldPackageRef)).rejects.toThrow(
      "WORLD_PACKAGE_STORE_CORRUPT",
    );
  });
});
