import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { describe, expect, it, vi } from "vitest";

import {
  hashWorldBuildIdentityV1,
  parseWorldBuildIdentityV1,
  worldBuildIdentityCanonicalBytesV1,
  worldPackageRefFromRootHashV1,
  worldPackageRootHashFromRefV1,
  type WorldBuildIdentityV1,
} from "./world-build-identity.js";

const HASH_A = `sha256:${"1".repeat(64)}` as Sha256HashV1;
const HASH_B = `sha256:${"2".repeat(64)}` as Sha256HashV1;
const HASH_C = `sha256:${"3".repeat(64)}` as Sha256HashV1;
const HASH_D = `sha256:${"4".repeat(64)}` as Sha256HashV1;
const HASH_E = `sha256:${"5".repeat(64)}` as Sha256HashV1;
const HASH_F = `sha256:${"6".repeat(64)}` as Sha256HashV1;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;

function canonicalIdentity(
  sceneSourceIdentity: WorldBuildIdentityV1["sceneSourceIdentity"] = {
    kind: "canonical-execution-plan",
    executionPlanHash: HASH_D,
  },
): WorldBuildIdentityV1 {
  return {
    kind: "world-build-identity",
    schemaVersion: 1,
    id: "cloud-ridge-world-build",
    worldPackageRef: worldPackageRefFromRootHashV1(HASH_A),
    worldPackageRootHash: HASH_A,
    gameplayBootstrapHash: HASH_B,
    worldRuntimeBootstrapHash: HASH_C,
    sceneSourceIdentity,
  };
}

function nativeIdentity(): WorldBuildIdentityV1 {
  return canonicalIdentity({
    kind: "babylon-native-scene",
    nativeSceneBootstrapHash: HASH_D,
    sceneModuleBundleHash: HASH_E,
    nativeSceneContributionHash: HASH_F,
  });
}

describe("WorldBuildIdentityV1", () => {
  it("parses, detaches, deeply freezes, canonicalizes, and hashes Canonical identity", () => {
    const mutable = structuredClone(canonicalIdentity());
    const parsed = parseWorldBuildIdentityV1(mutable);

    expect(parsed).toEqual(mutable);
    expect(parsed).not.toBe(mutable);
    expect(parsed.sceneSourceIdentity).not.toBe(mutable.sceneSourceIdentity);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.sceneSourceIdentity)).toBe(true);
    expect(worldBuildIdentityCanonicalBytesV1(mutable)).toEqual(
      canonicalJsonBytes(parsed),
    );
    expect(hashWorldBuildIdentityV1(mutable)).toBe(
      sha256CanonicalJson(parsed),
    );

    (mutable as { id: string }).id = "mutated-after-parse";
    expect(parsed.id).toBe("cloud-ridge-world-build");
  });

  it("parses and freezes the closed Babylon Native identity member", () => {
    const parsed = parseWorldBuildIdentityV1(nativeIdentity());

    expect(parsed.sceneSourceIdentity).toEqual({
      kind: "babylon-native-scene",
      nativeSceneBootstrapHash: HASH_D,
      sceneModuleBundleHash: HASH_E,
      nativeSceneContributionHash: HASH_F,
    });
    expect(Object.isFrozen(parsed.sceneSourceIdentity)).toBe(true);
  });

  it("binds Package Ref and Package Root as one non-zero lowercase hash", () => {
    const worldPackageRef = worldPackageRefFromRootHashV1(HASH_A);
    expect(worldPackageRef).toBe(
      `package://world-package/sha256/${"1".repeat(64)}`,
    );
    expect(worldPackageRootHashFromRefV1(worldPackageRef)).toBe(HASH_A);

    for (const hash of [
      ZERO_HASH,
      `sha256:${"A".repeat(64)}`,
      "sha256:1234",
      "sha512:" + "1".repeat(64),
    ]) {
      expect(() => worldPackageRefFromRootHashV1(hash as Sha256HashV1))
        .toThrow(/WORLD_PACKAGE_REF_INVALID/);
    }
    for (const ref of [
      `package://world-package/sha256/${"0".repeat(64)}`,
      `package://world-package/sha256/${"A".repeat(64)}`,
      "package://world-package/sha256/1234",
      `package://other/sha256/${"1".repeat(64)}`,
      1,
    ]) {
      expect(() => worldPackageRootHashFromRefV1(ref))
        .toThrow(/WORLD_PACKAGE_REF_INVALID/);
    }

    expect(() => parseWorldBuildIdentityV1({
      ...canonicalIdentity(),
      worldPackageRef: worldPackageRefFromRootHashV1(HASH_B),
    })).toThrow(/WORLD_BUILD_IDENTITY_INVALID/);
  });

  it("rejects missing, unknown, cross-source, and wrong discriminator fields", () => {
    const missing = { ...canonicalIdentity() } as Record<string, unknown>;
    delete missing.gameplayBootstrapHash;

    for (const value of [
      missing,
      { ...canonicalIdentity(), unknown: true },
      { ...canonicalIdentity(), kind: "world-identity" },
      { ...canonicalIdentity(), schemaVersion: 2 },
      {
        ...canonicalIdentity(),
        sceneSourceIdentity: {
          kind: "canonical-execution-plan",
          executionPlanHash: HASH_D,
          nativeSceneContributionHash: HASH_F,
        },
      },
      {
        ...nativeIdentity(),
        sceneSourceIdentity: {
          ...nativeIdentity().sceneSourceIdentity,
          executionPlanHash: HASH_D,
        },
      },
      {
        ...canonicalIdentity(),
        sceneSourceIdentity: {
          kind: "unknown-source",
          executionPlanHash: HASH_D,
        },
      },
    ]) {
      expect(() => parseWorldBuildIdentityV1(value))
        .toThrow(/WORLD_BUILD_IDENTITY_INVALID/);
    }
  });

  it("rejects accessors, symbols, non-ordinary prototypes, and malformed hashes without side effects", () => {
    const getter = vi.fn(() => HASH_B);
    const accessor = { ...canonicalIdentity() };
    Object.defineProperty(accessor, "gameplayBootstrapHash", {
      enumerable: true,
      get: getter,
    });
    const symbol = { ...canonicalIdentity(), [Symbol("hidden")]: true };
    const customPrototype = Object.assign(
      Object.create({ inherited: true }),
      canonicalIdentity(),
    );
    const nullPrototype = Object.assign(
      Object.create(null),
      canonicalIdentity(),
    );
    const nestedAccessor = canonicalIdentity() as unknown as {
      sceneSourceIdentity: Record<string, unknown>;
    };
    Object.defineProperty(
      nestedAccessor.sceneSourceIdentity,
      "executionPlanHash",
      { enumerable: true, get: getter },
    );
    const nestedSymbol = {
      ...canonicalIdentity(),
      sceneSourceIdentity: {
        ...canonicalIdentity().sceneSourceIdentity,
        [Symbol("hidden")]: true,
      },
    };
    const nestedPrototype = {
      ...canonicalIdentity(),
      sceneSourceIdentity: Object.assign(
        Object.create({ inherited: true }),
        canonicalIdentity().sceneSourceIdentity,
      ),
    };

    for (const value of [
      accessor,
      symbol,
      customPrototype,
      nullPrototype,
      nestedAccessor,
      nestedSymbol,
      nestedPrototype,
    ]) {
      expect(() => parseWorldBuildIdentityV1(value))
        .toThrow(/WORLD_BUILD_IDENTITY_INVALID/);
    }
    expect(getter).not.toHaveBeenCalled();

    for (const malformedHash of [
      ZERO_HASH,
      `sha256:${"A".repeat(64)}`,
      "sha256:1234",
      `sha512:${"1".repeat(64)}`,
    ]) {
      for (const field of [
        "worldPackageRootHash",
        "gameplayBootstrapHash",
        "worldRuntimeBootstrapHash",
      ]) {
        expect(() => parseWorldBuildIdentityV1({
          ...canonicalIdentity(),
          [field]: malformedHash,
        })).toThrow(/WORLD_BUILD_IDENTITY_INVALID/);
      }
      expect(() => parseWorldBuildIdentityV1({
        ...canonicalIdentity(),
        sceneSourceIdentity: {
          kind: "canonical-execution-plan",
          executionPlanHash: malformedHash,
        },
      })).toThrow(/WORLD_BUILD_IDENTITY_INVALID/);
      for (const field of [
        "nativeSceneBootstrapHash",
        "sceneModuleBundleHash",
        "nativeSceneContributionHash",
      ]) {
        expect(() => parseWorldBuildIdentityV1({
          ...nativeIdentity(),
          sceneSourceIdentity: {
            ...nativeIdentity().sceneSourceIdentity,
            [field]: malformedHash,
          },
        })).toThrow(/WORLD_BUILD_IDENTITY_INVALID/);
      }
    }
  });

  it("makes Native contribution mismatches produce distinct immutable identity hashes", () => {
    const admitted = nativeIdentity();
    const mismatched = {
      ...admitted,
      sceneSourceIdentity: {
        ...admitted.sceneSourceIdentity,
        nativeSceneContributionHash: HASH_A,
      },
    };

    expect(hashWorldBuildIdentityV1(mismatched)).not.toBe(
      hashWorldBuildIdentityV1(admitted),
    );
  });
});
