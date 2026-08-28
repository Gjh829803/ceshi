import type { CharacterBodyPortV1 } from "@whitebox-world/character-movement";

import {
  createBabylonCharacterBodyPortForTestingInternalV1,
  type BabylonCharacterBodyNativeAllocationV1,
  type BabylonCharacterBodyNativeDriverV1,
  type BabylonCharacterBodyPortOptionsV1,
} from "./babylon-character-body-port.js";

/** Testing-only relative-module seam. Never export this module from the package barrel. */
export function createBabylonCharacterBodyPortForTestingV1(
  input: BabylonCharacterBodyPortOptionsV1,
  nativeDriverFactory: (
    allocation: BabylonCharacterBodyNativeAllocationV1,
  ) => BabylonCharacterBodyNativeDriverV1,
): CharacterBodyPortV1 {
  return createBabylonCharacterBodyPortForTestingInternalV1(
    input,
    nativeDriverFactory,
  );
}
