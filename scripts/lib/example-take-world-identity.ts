import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  compileSimulationTakeV1,
  type SimulationTakeV1,
} from "@whitebox-world/control-capture";

export function bindSimulationTakeWorldIdentityV1(
  input: unknown,
  worldPackageRootHash: Sha256HashV1,
): SimulationTakeV1 {
  const source = compileSimulationTakeV1(input).take;
  return Object.freeze(compileSimulationTakeV1({
    ...source,
    worldPackageRootHash,
  }).take);
}
