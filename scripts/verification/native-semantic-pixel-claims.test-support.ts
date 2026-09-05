import assert from "node:assert/strict";

import { measureIdentityMaskProjectionsV1 } from "../scenes/identity-mask-projection.js";

type ViewId = "opening" | "world-side" | "world-top-down";

export type NativeSemanticTargetMaskV1 = Readonly<{
  fixtureId: string;
  viewId: ViewId;
  widthPixels: number;
  heightPixels: number;
  occupancy: Uint8Array;
  cameraSignature: string;
}>;

export type NativeSemanticPixelClaimV1 = Readonly<{
  fixtureId: string;
  baselineFixtureId: string;
  viewId: ViewId;
  relation:
    | "fewer-pixels-same-bounds"
    | "zero-pixels"
    | "fewer-positive-pixels"
    | "two-components"
    | "same-mask"
    | "more-pixels";
}>;

const viewIds = new Set<string>(["opening", "world-side", "world-top-down"]);
const hasText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const maskKey = (fixtureId: string, viewId: ViewId) => JSON.stringify([fixtureId, viewId]);

function exactPixelBounds(mask: NativeSemanticTargetMaskV1): readonly number[] {
  let minX = mask.widthPixels;
  let minY = mask.heightPixels;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < mask.occupancy.length; index += 1) {
    if (mask.occupancy[index] === 0) continue;
    const x = index % mask.widthPixels;
    const y = Math.floor(index / mask.widthPixels);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
}

function componentCount(mask: NativeSemanticTargetMaskV1): number {
  const visited = new Uint8Array(mask.occupancy.length);
  const stack: number[] = [];
  let count = 0;
  const visit = (index: number) => {
    if (visited[index] === 0 && mask.occupancy[index] === 1) {
      visited[index] = 1;
      stack.push(index);
    }
  };
  for (let seed = 0; seed < mask.occupancy.length; seed += 1) {
    if (visited[seed] !== 0 || mask.occupancy[seed] !== 1) continue;
    count += 1;
    visit(seed);
    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % mask.widthPixels;
      // Explicit row guards: adjacent array indices need not be adjacent pixels.
      if (x > 0) visit(index - 1);
      if (x + 1 < mask.widthPixels) visit(index + 1);
      if (index >= mask.widthPixels) visit(index - mask.widthPixels);
      if (index + mask.widthPixels < mask.occupancy.length) visit(index + mask.widthPixels);
    }
  }
  return count;
}

/** Test-only oracle for decoded target identity masks, never a production gate.
 * The caller owns PNG/hash/target binding and derives Camera signatures from
 * actual capture requests/poses. No pixel inference from source geometry occurs.
 * All pairs require visible baseline pixels, identical dimensions and the same
 * nonempty Camera signature. Empty claims or absent observations cannot pass.
 */
export function assertNativeSemanticPixelClaimsV1(input: Readonly<{
  claims: readonly NativeSemanticPixelClaimV1[];
  masks: readonly NativeSemanticTargetMaskV1[];
}>): void {
  assert(Array.isArray(input.claims) && input.claims.length > 0, "semantic pixel claims must not be empty");
  assert(Array.isArray(input.masks) && input.masks.length > 0, "semantic target masks must not be empty");
  const measuredByKey = new Map<string, { mask: NativeSemanticTargetMaskV1; pixelCount: number }>();
  for (const mask of input.masks) {
    const context = `semantic mask ${mask.fixtureId}/${mask.viewId}`;
    assert(hasText(mask.fixtureId) && viewIds.has(mask.viewId), `${context}: invalid fixture/view`);
    assert(hasText(mask.cameraSignature), `${context}: Camera signature must be nonempty`);
    assert(mask.occupancy instanceof Uint8Array, `${context}: occupancy must be Uint8Array`);
    const key = maskKey(mask.fixtureId, mask.viewId);
    assert(!measuredByKey.has(key), `${context}: duplicate fixture/view mask`);
    // One target means the existing measurement owner accepts exactly 0 and 1,
    // and validates positive integer dimensions, product and byte-array length.
    let pixelCount: number;
    try {
      pixelCount = measureIdentityMaskProjectionsV1({
        widthPixels: mask.widthPixels, heightPixels: mask.heightPixels,
        targetCount: 1, admittedTargetByPixel: mask.occupancy,
      })[0]!.pixelCount;
    } catch (error) {
      throw new Error(`${context}: invalid binary mask`, { cause: error });
    }
    measuredByKey.set(key, { mask, pixelCount });
  }

  for (const claim of input.claims) {
    const context = `semantic claim ${claim.fixtureId} vs ${claim.baselineFixtureId}/${claim.viewId}/${claim.relation}`;
    assert(hasText(claim.fixtureId) && hasText(claim.baselineFixtureId) && viewIds.has(claim.viewId),
      `${context}: invalid fixture/view`);
    assert(claim.fixtureId !== claim.baselineFixtureId, `${context}: comparison requires distinct fixtures`);
    const fixture = measuredByKey.get(maskKey(claim.fixtureId, claim.viewId));
    const baseline = measuredByKey.get(maskKey(claim.baselineFixtureId, claim.viewId));
    assert(fixture && baseline, `${context}: missing fixture or baseline view mask`);
    assert(fixture.mask.widthPixels === baseline.mask.widthPixels && fixture.mask.heightPixels === baseline.mask.heightPixels,
      `${context}: dimensions differ`);
    assert(fixture.mask.cameraSignature === baseline.mask.cameraSignature, `${context}: Camera signatures differ`);
    assert(baseline.pixelCount > 0, `${context}: baseline has no visible target pixels`);
    const actual = `${context}: fixture=${fixture.pixelCount}, baseline=${baseline.pixelCount} pixels`;
    switch (claim.relation) {
      case "fewer-pixels-same-bounds": {
        assert(fixture.pixelCount > 0 && fixture.pixelCount < baseline.pixelCount, actual);
        // Basis-point bounds from the shared measurement are intentionally not
        // compared: rounding can hide a one-pixel boundary change on wide masks.
        assert.deepEqual(exactPixelBounds(fixture.mask), exactPixelBounds(baseline.mask), actual);
        break;
      }
      case "zero-pixels":
        assert.equal(fixture.pixelCount, 0, actual);
        break;
      case "fewer-positive-pixels":
        assert(fixture.pixelCount > 0 && fixture.pixelCount < baseline.pixelCount, actual);
        break;
      case "two-components":
        assert.equal(componentCount(fixture.mask), 2, `${actual}: expected exactly two 4-connected components`);
        break;
      case "same-mask":
        assert(fixture.mask.occupancy.every((value, index) => value === baseline.mask.occupancy[index]),
          `${actual}: target occupancy bits differ`);
        break;
      case "more-pixels":
        assert(fixture.pixelCount > baseline.pixelCount, actual);
        break;
      default:
        assert.fail(`${context}: unknown relation`);
    }
  }
}
