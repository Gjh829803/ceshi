import { worldPackageRefFromRootHashV1, worldPackageRootHashFromRefV1 } from "@whitebox-world/world-identity";

import {
  normalizeAuthoringSpecV4,
  validateAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { compileWorldV5 } from "@whitebox-world/compiler";
import {
  createGameplayBootstrapResourceLockEntryV1,
  createGameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import { canonicalJsonBytes } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import basicWorldDocument from "../../../examples/authoring/basic-world.json";
import {
  assembleWorldPackageDirectoryV2,
  createWorldPackageV2,
  type WorldPackageDirectoryV2,
} from "./index.js";
import {
  createInMemoryWorldPackageStoreV1,
  createWorldPackageFixtureContextV2,
} from "./testing.js";

function authoringFixture(): AuthoringSpecV4 {
  const validated = validateAuthoringSpecV4(basicWorldDocument);
  if (!validated.ok || isNil(validated.value)) {
    throw new Error("fixture AuthoringSpecV4 is invalid");
  }
  return validated.value;
}

function packageFixture(): WorldPackageDirectoryV2 {
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
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrapResourceLock:
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
  });
  if (!compiled.ok || isNil(compiled.executionPlan)) {
    throw new Error("fixture compilation failed");
  }
  return createWorldPackageV2({
    ...createWorldPackageFixtureContextV2({
      packageId: `${authoringSpec.id}.package`,
      title: "Stored Basic World",
    }),
    authoringSpec,
    normalizedWorldIr: normalized.value,
    layoutSolveResult: {
      status: normalized.layoutSolveReport.status,
      report: normalized.layoutSolveReport,
      layoutSolveReportHash: normalized.layoutSolveReportHash,
    },
    executionPlan: compiled.executionPlan,
    gameplayBootstrap,
    resourceArtifacts: [],
  });
}

function withSignature(
  directory: WorldPackageDirectoryV2,
  signatureBase64: string,
): WorldPackageDirectoryV2 {
  return assembleWorldPackageDirectoryV2({
    receipt: directory.receipt,
    files: directory.files.filter((file) =>
      file.path !== "integrity.json" &&
      file.path !== "world-package-build-receipt.json"
    ),
    signatureFiles: [{
      path: "signatures/test-key.json",
      mediaType: "application/json",
      bytes: canonicalJsonBytes({
        kind: "worldkit-package-signature",
        schemaVersion: 1,
        envelope: {
          kind: "worldkit-package-signature-envelope",
          schemaVersion: 1,
          packageRootHash: directory.receipt.worldPackageRootHash,
          packageId: directory.receipt.manifest.id,
          packageFormatVersion: 2,
          runtimeTarget: "babylon-web",
          signatureAlgorithm: "ed25519",
          keyId: "test-key",
          trustDomain: "worldkit.test",
          signedAt: "2026-08-27T00:00:00.000Z",
        },
        signatureBase64,
      }),
    }],
  });
}

describe("WorldPackageStoreV1", () => {
  it("derives the exact content-addressed Ref and idempotently returns only Ref/Receipt", async () => {
    const directory = packageFixture();
    const store = createInMemoryWorldPackageStoreV1();
    const first = await store.put(directory);
    const repeated = await store.put(directory);
    const expectedRef = worldPackageRefFromRootHashV1(
      directory.receipt.worldPackageRootHash,
    );

    expect(first).toEqual(repeated);
    expect(first.worldPackageRef).toBe(expectedRef);
    expect(Object.keys(first).sort()).toEqual(["receipt", "worldPackageRef"]);
    expect(worldPackageRootHashFromRefV1(first.worldPackageRef)).toBe(
      directory.receipt.worldPackageRootHash,
    );
    const loaded = await store.get(first.worldPackageRef);
    expect(loaded?.receipt.worldPackageRootHash).toBe(
      directory.receipt.worldPackageRootHash,
    );
    expect(loaded?.executionPlan.id).toBe(directory.receipt.manifest.worldId);
    expect(JSON.stringify(first)).not.toContain("/tmp/");
  });

  it("returns undefined for an absent valid Ref and rejects malformed Refs", async () => {
    const store = createInMemoryWorldPackageStoreV1();
    const absentRef = worldPackageRefFromRootHashV1(
      `sha256:${"a".repeat(64)}`,
    );
    await expect(store.get(absentRef)).resolves.toBeUndefined();
    await expect(store.get("worldkit://world-package/not-content-addressed" as never))
      .rejects.toThrow("WORLD_PACKAGE_REF_INVALID");
  });

  it("serializes concurrent same-byte puts and returns defensive verified reads", async () => {
    const directory = packageFixture();
    const store = createInMemoryWorldPackageStoreV1();
    const results = await Promise.all([
      store.put(directory),
      store.put(directory),
      store.put(directory),
    ]);
    expect(new Set(results.map((result) => result.worldPackageRef)).size).toBe(1);

    directory.files[0]!.bytes[0] = directory.files[0]!.bytes[0]! ^ 0xff;
    await expect(store.get(results[0]!.worldPackageRef)).resolves.toMatchObject({
      receipt: results[0]!.receipt,
    });
  });

  it("rejects different directory bytes under the same Package Root", async () => {
    const directory = packageFixture();
    const store = createInMemoryWorldPackageStoreV1();
    const first = withSignature(directory, Buffer.alloc(64, 1).toString("base64"));
    const conflicting = withSignature(
      directory,
      Buffer.alloc(64, 2).toString("base64"),
    );
    expect(first.receipt.worldPackageRootHash).toBe(
      conflicting.receipt.worldPackageRootHash,
    );
    await store.put(first);
    await expect(store.put(conflicting)).rejects.toThrow(
      "WORLD_PACKAGE_STORE_CONFLICT",
    );
  });
});
