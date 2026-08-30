import { describe, expect, it } from "vitest";

import {
  canonicalNativeSceneCheckResultBytesV1,
  hashNativeSceneCheckResultV1,
  parseNativeSceneCheckResultV1,
} from "./native-scene-diagnostics";

function diagnostic() {
  return {
    kind: "native-scene-diagnostic",
    schemaVersion: 1,
    id: "cloud-ridge.visual-only",
    severity: "warning",
    stage: "contribution-admission",
    code: "NATIVE_SCENE_VISUAL_ONLY_MESH",
    location: { kind: "registration", registrationId: "ridge" },
    measurement: { kind: "count", actualCount: 1, maximumCount: 4 },
    message: "One visual mesh has no collider registration.",
    repairHint: "Register an intentional proxy or keep it visual-only.",
  } as const;
}

function result() {
  return {
    kind: "native-scene-check-result",
    schemaVersion: 1,
    id: "cloud-ridge.check",
    checkedInput: {
      kind: "native-scene-module",
      sceneModuleRef: "worldkit://native-scene/cloud-ridge@1",
    },
    outcome: "passed",
    diagnostics: [diagnostic()],
  } as const;
}

describe("NativeSceneCheckResultV1 persistent contract", () => {
  it("deeply freezes and hashes only parsed canonical data", () => {
    const input = result();
    const parsed = parseNativeSceneCheckResultV1(input);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.checkedInput)).toBe(true);
    expect(Object.isFrozen(parsed.diagnostics)).toBe(true);
    expect(hashNativeSceneCheckResultV1(input)).toBe(
      hashNativeSceneCheckResultV1(parsed),
    );
    expect(canonicalNativeSceneCheckResultBytesV1(input)).toEqual(
      canonicalNativeSceneCheckResultBytesV1(parsed),
    );
  });

  it("rejects accessors, sparse diagnostics and unknown result fields", () => {
    const accessor = { ...result() } as Record<string, unknown>;
    Object.defineProperty(accessor, "id", {
      enumerable: true,
      get: () => "cloud-ridge.accessor",
    });
    expect(() => parseNativeSceneCheckResultV1(accessor)).toThrow(
      /NativeSceneCheckResultV1/,
    );

    const sparse = new Array(1);
    expect(() => parseNativeSceneCheckResultV1({
      ...result(),
      diagnostics: sparse,
    })).toThrow(/NativeSceneCheckResultV1/);
    expect(() => parseNativeSceneCheckResultV1({
      ...result(),
      extra: true,
    })).toThrow(/NativeSceneCheckResultV1/);
  });
});
