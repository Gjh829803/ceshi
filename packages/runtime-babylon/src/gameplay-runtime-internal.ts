import type { ExecutionPlanV5 } from "@whitebox-world/runtime-contracts";
import type {
  FixedInputOneTickV1,
  GameplayWorldStateProjectionV1,
  GameplayViewStateProjectionV1,
} from "@whitebox-world/runtime-host";

export const BABYLON_GAMEPLAY_RUNTIME_INTERNAL = Symbol(
  "whitebox-world.babylon-gameplay-runtime-internal.v1",
);

export type BabylonGameplayPossessionTargetV1 =
  | Readonly<{ mode: "unbound" }>
  | Readonly<{
      mode: "possessed";
      controlledEntityId: string;
    }>;

/**
 * Runtime-owned staged projection. Preparing this value must not mutate the
 * published input target, Camera target, render state, or capture epoch.
 * `commitPrepared` is a synchronous, no-throw pointer publication.
 */
export interface PreparedBabylonGameplayPossessionV1 {
  readonly projectedWorldStateAfter: GameplayWorldStateProjectionV1;
  readonly projectedViewStateAfter: GameplayViewStateProjectionV1;
  commitPrepared(): void;
  abort(): Promise<void>;
}

/**
 * Package-private seam consumed only by the provider-neutral Gameplay World
 * Port. Public Browser/CLI contracts never expose Babylon or Havok values.
 */
export interface BabylonGameplayRuntimeInternalV1 {
  readExecutionPlan(): ExecutionPlanV5;
  readPossessionTarget(): BabylonGameplayPossessionTargetV1;
  readWorldProjection(): GameplayWorldStateProjectionV1;
  readViewProjection(): GameplayViewStateProjectionV1;
  hasEntity(entityId: string): boolean;
  isEntityControllable(entityId: string): boolean;
  preparePossessionTarget(
    target: BabylonGameplayPossessionTargetV1,
  ): Promise<PreparedBabylonGameplayPossessionV1>;
  runFixedInputTick(
    input: FixedInputOneTickV1,
  ): Promise<GameplayWorldStateProjectionV1>;
  dispose(): Promise<void>;
}
