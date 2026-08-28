import { describe, expect, it } from "vitest";

import type { LayeredMoveV1 } from "./character-movement-contracts.js";
import { composeLayeredMovesV1, orderLayeredMovesV1 } from "./layered-move.js";

const impulse = (
  id: string,
  priority: number,
  startedTick: number,
  x: number,
): Extract<LayeredMoveV1, { kind: "impulse" }> => ({
  schemaVersion: 1,
  kind: "impulse",
  id,
  priority,
  startedTick,
  velocityDeltaMetersPerSecondXYZ: [x, 0, 0],
});

const root = (
  id: string,
  priority: number,
  startedTick: number,
  z: number,
): Extract<LayeredMoveV1, { kind: "root-motion" }> => ({
  schemaVersion: 1,
  kind: "root-motion",
  id,
  priority,
  startedTick,
  rootMotionSourceRef: `worldkit://root-motion/${id}@1`,
  rootMotionSourceHash: `sha256:${"a".repeat(64)}`,
  translationDeltaMetersXYZ: [0, 0, z],
  facingYawDeltaRadians: z,
});

describe("LayeredMove deterministic composition", () => {
  it("orders priority descending, started Tick ascending, then UTF-8 byte lexicographic ID", () => {
    const values = [
      impulse("z", 1, 2, 1),
      impulse("é", 1, 1, 2),
      impulse("a", 2, 9, 3),
      impulse("e", 1, 1, 4),
    ];
    expect(orderLayeredMovesV1(values).map((move) => move.id)).toEqual(["a", "e", "é", "z"]);
  });

  it("is insertion-order independent for ordering and floating-point accumulation", () => {
    const values = [
      impulse("large", 3, 4, 1e16),
      impulse("cancel", 2, 4, -1e16),
      impulse("small", 1, 4, 1),
      root("root-b", 4, 4, -0.25),
      root("root-a", 4, 4, 0.5),
    ];
    const expected = composeLayeredMovesV1(values);
    for (const permutation of [
      [...values].reverse(),
      [values[2]!, values[4]!, values[0]!, values[3]!, values[1]!],
      [values[1]!, values[3]!, values[2]!, values[0]!, values[4]!],
    ]) {
      expect(composeLayeredMovesV1(permutation)).toEqual(expected);
    }
    expect(expected.velocityDeltaMetersPerSecondXYZ).toEqual([1, 0, 0]);
    expect(expected.translationDeltaMetersXYZ).toEqual([0, 0, 0.25]);
    expect(expected.facingYawDeltaRadians).toBe(0.25);
    expect(Object.isFrozen(expected.orderedMoves)).toBe(true);
  });

  it("rejects duplicate stable IDs before composition", () => {
    expect(() => composeLayeredMovesV1([
      impulse("duplicate", 2, 1, 1),
      root("duplicate", 1, 1, 1),
    ])).toThrow("3C_INPUT_INVALID");
  });

  it("rejects ill-formed Unicode IDs instead of preserving surrogate insertion order", () => {
    const hostile = [
      impulse("\uD800", 1, 1, 1e16),
      impulse("\uD801", 1, 1, -1e16),
      impulse("\uD802", 1, 1, 1),
    ];
    expect(() => orderLayeredMovesV1(hostile)).toThrow("3C_INPUT_INVALID");
    expect(() => orderLayeredMovesV1([...hostile].reverse())).toThrow("3C_INPUT_INVALID");
  });

  it("rejects every non-finite intermediate impulse, translation and yaw accumulation", () => {
    expect(() => composeLayeredMovesV1([
      impulse("impulse-a", 3, 1, Number.MAX_VALUE),
      impulse("impulse-b", 2, 1, Number.MAX_VALUE),
    ])).toThrow("3C_INPUT_INVALID");
    expect(() => composeLayeredMovesV1([
      root("translation-a", 3, 1, Number.MAX_VALUE),
      root("translation-b", 2, 1, Number.MAX_VALUE),
    ])).toThrow("3C_INPUT_INVALID");
    expect(() => composeLayeredMovesV1([
      { ...root("yaw-a", 3, 1, 0), facingYawDeltaRadians: Number.MAX_VALUE },
      { ...root("yaw-b", 2, 1, 0), facingYawDeltaRadians: Number.MAX_VALUE },
    ])).toThrow("3C_INPUT_INVALID");
    expect(() => composeLayeredMovesV1([
      impulse("cancel-a", 3, 1, Number.MAX_VALUE),
      impulse("cancel-b", 2, 1, Number.MAX_VALUE),
      impulse("cancel-c", 1, 1, -Number.MAX_VALUE),
    ])).toThrow("3C_INPUT_INVALID");
  });
});
