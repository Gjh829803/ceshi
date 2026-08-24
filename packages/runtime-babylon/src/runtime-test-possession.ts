import type { BabylonWorldRuntime } from "./babylon-world-runtime";
import { BABYLON_GAMEPLAY_RUNTIME_INTERNAL } from "./gameplay-runtime-internal";

/** Test-only Gameplay transaction helper. Runtime creation itself stays unbound. */
export async function bindRuntimeTestPossession(
  runtime: BabylonWorldRuntime,
  controlledEntityId: string,
): Promise<void> {
  const prepared = await runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]()
    .preparePossessionTarget({ mode: "possessed", controlledEntityId });
  prepared.commitPrepared();
}

/** Test-only reset helper that mirrors the Host reset + initial-bind sequence. */
export async function resetAndBindRuntimeTestPossession(
  runtime: BabylonWorldRuntime,
  controlledEntityId: string,
): Promise<void> {
  runtime.reset();
  await bindRuntimeTestPossession(runtime, controlledEntityId);
}
