import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  hashBabylonNativeBlockCheckedLayoutInventoryV1,
  type BabylonNativeBlockCheckedLayoutV1,
} from "@whitebox-world/native-babylon-block-profile";
import { sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  assertWorldPackageAccessorFreeDataGraphV1,
  parseWorldPackageWorldBoundsV1,
  type WorldPackageWorldBoundsV1,
} from "@whitebox-world/world-package";

/** Frozen Host input; concrete bounds remain owned by the final WorldPackage. */
export type NativeSceneWorldBoundsPolicyV1 =
  | Readonly<{ mode: "fixed"; worldBounds: WorldPackageWorldBoundsV1 }>
  | Readonly<{ mode: "checked-block-layout" }>;

export function parseNativeSceneWorldBoundsPolicyV1(
  input: unknown,
): NativeSceneWorldBoundsPolicyV1 {
  assertWorldPackageAccessorFreeDataGraphV1(input, "NATIVE_WORLD_BOUNDS_POLICY_INVALID");
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("NATIVE_WORLD_BOUNDS_POLICY_INVALID");
  }
  const row = input as Record<string, unknown>;
  const keys = Object.keys(row).sort().join(",");
  if (row.mode === "checked-block-layout" && keys === "mode") {
    return Object.freeze({ mode: "checked-block-layout" });
  }
  if (row.mode === "fixed" && keys === "mode,worldBounds") {
    return Object.freeze({
      mode: "fixed", worldBounds: parseWorldPackageWorldBoundsV1(row.worldBounds),
    });
  }
  throw new TypeError("NATIVE_WORLD_BOUNDS_POLICY_INVALID");
}

export function hashNativeSceneWorldBoundsPolicyV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(parseNativeSceneWorldBoundsPolicyV1(input)) as Sha256HashV1;
}

export function resolveNativeSceneWorldBoundsV1(
  input: NativeSceneWorldBoundsPolicyV1,
  checkedLayout?: Pick<BabylonNativeBlockCheckedLayoutV1, "kind" | "schemaVersion" | "layout" | "checkResult">,
): WorldPackageWorldBoundsV1 {
  const policy = parseNativeSceneWorldBoundsPolicyV1(input);
  if (policy.mode === "fixed") return policy.worldBounds;
  if (checkedLayout === undefined) throw new TypeError("checked-block-layout-required");
  hashBabylonNativeBlockCheckedLayoutInventoryV1(checkedLayout);
  const minimum = new Vector3(Infinity, Infinity, Infinity);
  const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const block of checkedLayout.layout.blocks) {
    minimum.minimizeInPlaceFromFloats(...block.minimumMetersXYZ);
    maximum.maximizeInPlaceFromFloats(...block.maximumMetersXYZ);
  }
  // Legacy 9e35ab53 boundsForBlocks: all Blocks, not just targets or colliders.
  // Its vertical container margins are retained, but no hidden foundation is built.
  return parseWorldPackageWorldBoundsV1({
    centerMetersXZ: [(minimum.x + maximum.x) / 2, (minimum.z + maximum.z) / 2],
    sizeMetersXZ: [Math.max(16, maximum.x - minimum.x + 9), Math.max(16, maximum.z - minimum.z + 9)],
    heightRangeMeters: [minimum.y - 65, maximum.y + 16],
  });
}
