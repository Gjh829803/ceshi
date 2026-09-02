import { describe, expect, it } from "vitest";

import {
  BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1,
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1,
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
  babylonNativeBlockChunkAxisIndexV1,
  babylonNativeBlockChunkBoundsMetersXZV1,
  babylonNativeBlockChunkIdV1,
  hashBabylonNativeBlockChunkPolicyV1,
  parseBabylonNativeBlockChunkPolicyV1,
  resolveBabylonNativeBlockChunkAssignmentV1,
  type BabylonNativeBlockChunkPolicyV1,
} from "./chunk-policy.js";

const CURRENT = BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1;

function extent(
  minimumMetersXYZ: readonly [number, number, number],
  maximumMetersXYZ: readonly [number, number, number],
) {
  return Object.freeze({
    minimumMetersXYZ,
    maximumMetersXYZ,
    straddlingId: "chunk-straddling-probe",
  });
}

describe("NBR-65F Chunk policy owner", () => {
  it("publishes a closed candidate set with one frozen current policy", () => {
    expect(BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1.map(({ id }) => id))
      .toEqual(["chunk-xz-2m", "chunk-xz-4m", "chunk-xz-8m", "chunk-xz-16m"]);
    expect(BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1).toContain(CURRENT);
    expect(CURRENT.sizeMetersXZ).toEqual([4, 4]);
    expect(CURRENT.originMetersXZ).toEqual([-0.5, -0.5]);
    expect(BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1)
      .toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hashBabylonNativeBlockChunkPolicyV1(CURRENT))
      .toBe(BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1);
    for (const candidate of BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1) {
      expect(Object.isFrozen(candidate)).toBe(true);
      expect(parseBabylonNativeBlockChunkPolicyV1(candidate))
        .toEqual(candidate);
    }
    expect(new Set(BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1
      .map(hashBabylonNativeBlockChunkPolicyV1)).size).toBe(4);
  });

  it("keeps every Chunk boundary on a Block face across the origin", () => {
    for (const candidate of BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1) {
      // A one-meter Block centered on an integer spans [c - 0.5, c + 0.5].
      // The Chunk grid must never cut that span.
      for (let center = -8; center <= 8; center += 1) {
        const assignment = resolveBabylonNativeBlockChunkAssignmentV1(
          candidate,
          extent([center - 0.5, 0, -0.5], [center + 0.5, 1, 0.5]),
        );
        expect(assignment.kind).toBe("grid-chunk");
      }
    }
  });

  it("resolves signed Chunk indexes and bounds deterministically", () => {
    expect(babylonNativeBlockChunkAxisIndexV1(CURRENT, 0, 0)).toBe(0);
    expect(babylonNativeBlockChunkAxisIndexV1(CURRENT, 0, 3.4)).toBe(0);
    expect(babylonNativeBlockChunkAxisIndexV1(CURRENT, 0, 3.6)).toBe(1);
    expect(babylonNativeBlockChunkAxisIndexV1(CURRENT, 1, -1)).toBe(-1);
    expect(babylonNativeBlockChunkIdV1([0, 0])).toBe("grid-chunk-xp0-zp0");
    expect(babylonNativeBlockChunkIdV1([-1, 2])).toBe("grid-chunk-xn1-zp2");
    expect(babylonNativeBlockChunkBoundsMetersXZV1(CURRENT, [-1, 0])).toEqual({
      minimumMetersXZ: [-4.5, -0.5],
      maximumMetersXZ: [-0.5, 3.5],
    });
  });

  it("reports one straddling extent instead of moving it into a Chunk", () => {
    const straddling = resolveBabylonNativeBlockChunkAssignmentV1(
      CURRENT,
      extent([3, 0, 0], [5, 1, 1]),
    );
    expect(straddling).toEqual({
      kind: "chunk-straddling",
      id: "chunk-straddling-probe",
    });
  });

  it("rejects forged Chunk policies instead of repairing them", () => {
    const forged: readonly unknown[] = [
      null,
      [],
      { ...CURRENT, sizeMetersXZ: [0, 4] },
      { ...CURRENT, sizeMetersXZ: [4, 4, 4] },
      { ...CURRENT, boundaryMode: "half-open-center-owned" },
      { ...CURRENT, id: "Chunk-4m" },
      { ...CURRENT, extra: 1 },
      Object.defineProperty({ ...CURRENT }, "id", {
        enumerable: true,
        get: () => "chunk-xz-4m",
      }),
    ];
    for (const candidate of forged) {
      expect(() => parseBabylonNativeBlockChunkPolicyV1(candidate))
        .toThrow(/WORLDKIT_NATIVE_BLOCK_CHUNK_POLICY_INVALID/);
    }
    expect(() => babylonNativeBlockChunkAxisIndexV1(
      CURRENT,
      0,
      Number.NaN,
    )).toThrow(/WORLDKIT_NATIVE_BLOCK_CHUNK_POLICY_INVALID/);
  });

  it("keeps a wider Chunk profile a strict coarsening of a finer one", () => {
    const fine = BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1[0];
    const coarse: BabylonNativeBlockChunkPolicyV1 =
      BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1[3];
    const groupsByPolicy = [fine, coarse].map((candidate) => {
      const idsByChunk = new Map<string, string[]>();
      for (let x = -6; x <= 6; x += 1) {
        for (let z = -6; z <= 6; z += 1) {
          const assignment = resolveBabylonNativeBlockChunkAssignmentV1(
            candidate,
            extent([x - 0.5, 0, z - 0.5], [x + 0.5, 1, z + 0.5]),
          );
          const members = idsByChunk.get(assignment.id) ?? [];
          members.push(`${x},${z}`);
          idsByChunk.set(assignment.id, members);
        }
      }
      return idsByChunk;
    });
    expect(groupsByPolicy[0]!.size).toBeGreaterThan(groupsByPolicy[1]!.size);
    for (const members of groupsByPolicy[0]!.values()) {
      const coarseIds = new Set([...groupsByPolicy[1]!.entries()]
        .filter(([, coarseMembers]) =>
          members.some((member) => coarseMembers.includes(member)))
        .map(([id]) => id));
      expect(coarseIds.size).toBe(1);
    }
  });
});
