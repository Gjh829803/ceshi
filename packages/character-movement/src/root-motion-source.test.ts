import { describe, expect, it } from "vitest";

import {
  hashRootMotionSourceV1,
  parseLockedRootMotionSourceV1,
  sampleLockedRootMotionSourceV1,
} from "./root-motion-source.js";
import { parseLayeredMoveV1 } from "./character-movement-contracts.js";

function sourceBody() {
  return {
    schemaVersion: 1 as const,
    resourceRef: "worldkit://root-motion/vault@1" as const,
    fixedDeltaSeconds: 1 / 60,
    samples: [
      { translationDeltaMetersXYZ: [0, 0.1, -0.2] as const, facingYawDeltaRadians: 0.1 },
      { translationDeltaMetersXYZ: [0, 0.05, -0.3] as const, facingYawDeltaRadians: 0.2 },
    ],
  };
}

describe("locked root-motion sources", () => {
  it("strictly parses, verifies the canonical hash and deeply freezes fixed-Tick samples", () => {
    const body = sourceBody();
    const contentHash = hashRootMotionSourceV1(body);
    const source = parseLockedRootMotionSourceV1({ ...body, contentHash });
    expect(source.contentHash).toBe(contentHash);
    expect(Object.isFrozen(source)).toBe(true);
    expect(Object.isFrozen(source.samples)).toBe(true);
    expect(Object.isFrozen(source.samples[0]!.translationDeltaMetersXYZ)).toBe(true);
  });

  it("samples deterministically and rejects a locked-hash mismatch", () => {
    const body = sourceBody();
    const source = parseLockedRootMotionSourceV1({ ...body, contentHash: hashRootMotionSourceV1(body) });
    const first = sampleLockedRootMotionSourceV1(
      source,
      source.resourceRef,
      source.contentHash,
      1,
      1 / 60,
    );
    const second = sampleLockedRootMotionSourceV1(
      source,
      source.resourceRef,
      source.contentHash,
      1,
      1 / 60,
    );
    expect(first).toEqual(second);
    expect(first).toEqual(body.samples[1]);
    expect(() => sampleLockedRootMotionSourceV1(
      source,
      source.resourceRef,
      `sha256:${"b".repeat(64)}`,
      1,
      1 / 60,
    )).toThrow("3C_ROOT_MOTION_HASH_MISMATCH");
    expect(() => sampleLockedRootMotionSourceV1(
      source,
      "worldkit://root-motion/other@1",
      source.contentHash,
      1,
      1 / 60,
    )).toThrow("3C_LAYERED_MOVE_SOURCE_UNRESOLVED");
  });

  it("rejects wrong Tick rates, out-of-range indexes, exotic arrays and malformed samples", () => {
    const body = sourceBody();
    const source = parseLockedRootMotionSourceV1({ ...body, contentHash: hashRootMotionSourceV1(body) });
    expect(() => sampleLockedRootMotionSourceV1(source, source.resourceRef, source.contentHash, -1, 1 / 60))
      .toThrow("3C_ROOT_MOTION_SAMPLE_INVALID");
    expect(() => sampleLockedRootMotionSourceV1(source, source.resourceRef, source.contentHash, 2, 1 / 60))
      .toThrow("3C_ROOT_MOTION_SAMPLE_INVALID");
    expect(() => sampleLockedRootMotionSourceV1(source, source.resourceRef, source.contentHash, 0, 1 / 30))
      .toThrow("3C_ROOT_MOTION_SAMPLE_INVALID");
    const sparse = new Array(2);
    sparse[0] = body.samples[0];
    expect(() => parseLockedRootMotionSourceV1({
      ...body,
      samples: sparse,
      contentHash: hashRootMotionSourceV1(body),
    })).toThrow("3C_ROOT_MOTION_SAMPLE_INVALID");
    expect(() => parseLockedRootMotionSourceV1({
      ...body,
      samples: [{ ...body.samples[0], clipName: "Vault" }],
      contentHash: hashRootMotionSourceV1(body),
    })).toThrow("3C_ROOT_MOTION_SAMPLE_INVALID");
  });

  it.each([
    "not a Resource Ref",
    " worldkit://root-motion/vault@1",
    "worldkit://root-motion/vault@1\n",
    "worldkit://root-motion/vault",
    "worldkit://root-motion/vault@0",
    "worldkit://animation/vault@1",
    "worldkit://root-motion/Vault@1",
    "worldkit://root-motion/\uD800@1",
    "worldkit://root-motion/a..b@1",
    "worldkit://root-motion/a--b@1",
    "worldkit://root-motion/a.-b@1",
    "worldkit://root-motion/a-.b@1",
    "worldkit://root-motion/a-@1",
    "worldkit://root-motion/a.@1",
    "worldkit://root-motion/vault@01",
    "worldkit://root-motion/vault@9007199254740992",
    "worldkit://root-motion/vault@999999999999999999999999999999999999999999",
    `worldkit://root-motion/${"a".repeat(65)}@1`,
  ])("rejects malformed Root Motion ResourceRef %j on source and LayeredMove", (resourceRef) => {
    const body = { ...sourceBody(), resourceRef };
    expect(() => hashRootMotionSourceV1(body)).toThrow("3C_ROOT_MOTION_SAMPLE_INVALID");
    expect(() => parseLayeredMoveV1({
      schemaVersion: 1,
      kind: "root-motion",
      id: "vault-move",
      priority: 1,
      startedTick: 1,
      rootMotionSourceRef: resourceRef,
      rootMotionSourceHash: `sha256:${"a".repeat(64)}`,
      translationDeltaMetersXYZ: [0, 0, 0],
      facingYawDeltaRadians: 0,
    })).toThrow();
    const validBody = sourceBody();
    const validSource = parseLockedRootMotionSourceV1({
      ...validBody,
      contentHash: hashRootMotionSourceV1(validBody),
    });
    expect(() => sampleLockedRootMotionSourceV1(
      validSource,
      resourceRef as "worldkit://root-motion/vault@1",
      validSource.contentHash,
      0,
      1 / 60,
    )).toThrow("3C_LAYERED_MOVE_SOURCE_UNRESOLVED");
  });

  it("accepts the canonical ID and safe-integer version boundaries on every public surface", () => {
    const resourceRef = `worldkit://root-motion/${"a".repeat(64)}@${Number.MAX_SAFE_INTEGER}` as const;
    const body = { ...sourceBody(), resourceRef };
    const source = parseLockedRootMotionSourceV1({ ...body, contentHash: hashRootMotionSourceV1(body) });
    expect(sampleLockedRootMotionSourceV1(
      source,
      resourceRef,
      source.contentHash,
      0,
      1 / 60,
    )).toEqual(body.samples[0]);
    expect(parseLayeredMoveV1({
      schemaVersion: 1,
      kind: "root-motion",
      id: "boundary-move",
      priority: 1,
      startedTick: 1,
      rootMotionSourceRef: resourceRef,
      rootMotionSourceHash: source.contentHash,
      translationDeltaMetersXYZ: [0, 0, 0],
      facingYawDeltaRadians: 0,
    })).toMatchObject({ rootMotionSourceRef: resourceRef });
  });
});
