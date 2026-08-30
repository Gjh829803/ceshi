import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BabylonNativeSceneBootstrapV1 } from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

import type { BabylonNativeLockedAssetResolverV1 } from "./assets.js";
import type { BabylonNativeHostRandomV1 } from "./random.js";

export interface BabylonNativeSpawnMarkerV1 {
  readonly id: string;
  readonly positionMetersXYZ: readonly [number, number, number];
  readonly facingRadians: number;
}

export type BabylonNativeTraversalBindingV1 =
  | Readonly<{ kind: "not-traversable" }>
  | Readonly<{
      kind: "static-surface";
      surfaceEntityId: string;
      logicalSubshapeId: string;
      traversalSurfaceProfileRef: string;
    }>;

export interface BabylonNativeStaticColliderV1 {
  readonly id: string;
  readonly mesh: Mesh;
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
}

export interface BabylonNativeSceneRegistrationV1 {
  registerSpawnMarker(marker: Readonly<BabylonNativeSpawnMarkerV1>): void;
  registerStaticCollider(collider: Readonly<BabylonNativeStaticColliderV1>): void;
}

export interface BabylonNativeSceneBuildContextV1 {
  readonly scene: Scene;
  readonly bootstrap: BabylonNativeSceneBootstrapV1;
  readonly random: BabylonNativeHostRandomV1;
  readonly assets: BabylonNativeLockedAssetResolverV1;
  readonly registration: BabylonNativeSceneRegistrationV1;
}

export interface BabylonNativeSceneModuleV1 {
  readonly kind: "babylon-native-scene-module";
  readonly id: string;
  build(context: BabylonNativeSceneBuildContextV1): void | Promise<void>;
}

function invalidModule(): never {
  throw new TypeError(
    "Value must match the closed BabylonNativeSceneModuleV1 definition.",
  );
}

export function defineBabylonNativeScene(
  input: BabylonNativeSceneModuleV1,
): BabylonNativeSceneModuleV1 {
  if (
    typeof input !== "object" ||
    isNil(input) ||
    Array.isArray(input)
  ) return invalidModule();

  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) invalidModule();
    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== 3 ||
      keys.some((key) => typeof key !== "string") ||
      !["kind", "id", "build"].every((key) => keys.includes(key))
    ) return invalidModule();

    const descriptors = Object.getOwnPropertyDescriptors(input);
    for (const key of ["kind", "id", "build"] as const) {
      const descriptor = descriptors[key];
      if (
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return invalidModule();
    }

    const kind = descriptors.kind!.value as unknown;
    const id = descriptors.id!.value as unknown;
    const build = descriptors.build!.value as unknown;
    if (
      kind !== "babylon-native-scene-module" ||
      typeof id !== "string" ||
      id.length === 0 ||
      id.trim() !== id ||
      id.normalize("NFC") !== id ||
      typeof build !== "function"
    ) return invalidModule();

    return Object.freeze({
      kind: "babylon-native-scene-module",
      id,
      build: build as BabylonNativeSceneModuleV1["build"],
    });
  } catch {
    return invalidModule();
  }
}
