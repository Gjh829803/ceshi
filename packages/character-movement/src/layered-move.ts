import {
  parseLayeredMoveV1,
  type LayeredMoveV1,
  type MovementVec3V1,
} from "./character-movement-contracts.js";

export interface LayeredMoveCompositionV1 {
  readonly orderedMoves: readonly LayeredMoveV1[];
  readonly velocityDeltaMetersPerSecondXYZ: MovementVec3V1;
  readonly translationDeltaMetersXYZ: MovementVec3V1;
  readonly facingYawDeltaRadians: number;
}

const encoder = new TextEncoder();

function compareUtf8Bytes(left: string, right: string): number {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index]! - rightBytes[index]!;
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

function stableNumber(value: number): number {
  return value === 0 ? 0 : value;
}

function frozenVec3(x: number, y: number, z: number): MovementVec3V1 {
  return Object.freeze([stableNumber(x), stableNumber(y), stableNumber(z)]);
}

function invalidComposition(detail: string): never {
  throw new RangeError(`3C_INPUT_INVALID: ${detail}`);
}

function checkedAdd(left: number, right: number, field: string): number {
  const result = left + right;
  if (!Number.isFinite(result) || Object.is(result, -0)) {
    invalidComposition(`LayeredMove ${field} accumulation is non-finite or negative zero.`);
  }
  return result;
}

export function orderLayeredMovesV1(input: readonly LayeredMoveV1[]): readonly LayeredMoveV1[] {
  let parsed: LayeredMoveV1[];
  try {
    parsed = input.map(parseLayeredMoveV1);
  } catch {
    return invalidComposition("LayeredMove data or stable ID is invalid.");
  }
  const ids = new Set<string>();
  for (const move of parsed) {
    if (ids.has(move.id)) {
      throw new RangeError(`3C_INPUT_INVALID: duplicate LayeredMove id '${move.id}'.`);
    }
    ids.add(move.id);
  }
  parsed.sort((left, right) =>
    right.priority - left.priority ||
    left.startedTick - right.startedTick ||
    compareUtf8Bytes(left.id, right.id)
  );
  return Object.freeze(parsed);
}

export function composeLayeredMovesV1(
  input: readonly LayeredMoveV1[],
): LayeredMoveCompositionV1 {
  const orderedMoves = orderLayeredMovesV1(input);
  let velocityX = 0;
  let velocityY = 0;
  let velocityZ = 0;
  let translationX = 0;
  let translationY = 0;
  let translationZ = 0;
  let facingYaw = 0;
  for (const move of orderedMoves) {
    if (move.kind === "impulse") {
      velocityX = checkedAdd(velocityX, move.velocityDeltaMetersPerSecondXYZ[0], "impulse X");
      velocityY = checkedAdd(velocityY, move.velocityDeltaMetersPerSecondXYZ[1], "impulse Y");
      velocityZ = checkedAdd(velocityZ, move.velocityDeltaMetersPerSecondXYZ[2], "impulse Z");
    } else {
      translationX = checkedAdd(translationX, move.translationDeltaMetersXYZ[0], "translation X");
      translationY = checkedAdd(translationY, move.translationDeltaMetersXYZ[1], "translation Y");
      translationZ = checkedAdd(translationZ, move.translationDeltaMetersXYZ[2], "translation Z");
      facingYaw = checkedAdd(facingYaw, move.facingYawDeltaRadians, "facing yaw");
    }
  }
  return Object.freeze({
    orderedMoves,
    velocityDeltaMetersPerSecondXYZ: frozenVec3(velocityX, velocityY, velocityZ),
    translationDeltaMetersXYZ: frozenVec3(translationX, translationY, translationZ),
    facingYawDeltaRadians: stableNumber(facingYaw),
  });
}
