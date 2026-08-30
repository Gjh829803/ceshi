import { describe, expect, it } from "vitest";

import {
  canonicalBabylonNativeDependencyLockBytesV1,
  hashBabylonNativeDependencyLockV1,
  parseBabylonNativeDependencyLockV1,
} from "./native-scene-dependency-lock";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;

function makeLock() {
  return {
    kind: "babylon-native-dependency-lock",
    schemaVersion: 1,
    lockfileHash: HASH_A,
    entries: [
      {
        packageName: "typescript",
        resolvedVersion: "5.9.2",
        packageManifestHash: HASH_A,
        packageIntegrityHash: HASH_B,
        usage: "bundle-toolchain",
      },
      {
        packageName: "@babylonjs/core",
        resolvedVersion: "9.23.0",
        packageManifestHash: HASH_B,
        packageIntegrityHash: HASH_A,
        usage: "runtime-external",
      },
    ],
  } as const;
}

describe("BabylonNativeDependencyLockV1", () => {
  it("sorts exact installed dependency entries and hashes parsed data", () => {
    const input = makeLock();
    const parsed = parseBabylonNativeDependencyLockV1(input);
    expect(parsed.entries.map((entry) => entry.packageName)).toEqual([
      "@babylonjs/core",
      "typescript",
    ]);
    expect(Object.isFrozen(parsed.entries[0])).toBe(true);
    expect(hashBabylonNativeDependencyLockV1(input)).toBe(
      hashBabylonNativeDependencyLockV1(parsed),
    );
    expect(canonicalBabylonNativeDependencyLockBytesV1(input)).toEqual(
      canonicalBabylonNativeDependencyLockBytesV1(parsed),
    );
  });

  it("rejects duplicates, Havok and unknown usage", () => {
    const input = makeLock();
    expect(() => parseBabylonNativeDependencyLockV1({
      ...input,
      entries: [input.entries[0], input.entries[0]],
    })).toThrow(/NATIVE_DEPENDENCY_LOCK_INVALID/);
    expect(() => parseBabylonNativeDependencyLockV1({
      ...input,
      entries: [{ ...input.entries[0], packageName: "@babylonjs/havok" }],
    })).toThrow(/NATIVE_DEPENDENCY_LOCK_INVALID/);
    expect(() => parseBabylonNativeDependencyLockV1({
      ...input,
      entries: [{ ...input.entries[0], usage: "runtime" }],
    })).toThrow(/NATIVE_DEPENDENCY_LOCK_INVALID/);
  });
});
