import type { MountedOnRelationshipStateV1 } from "@whitebox-world/gameplay-contracts";
import type {
  FixedInputOneTickV1,
  GameplayFixedTickActionProjectionV1,
  GameplayWorldStateProjectionV1,
  GameplayViewStateProjectionV1,
} from "@whitebox-world/runtime-host";

export interface BabylonGameplayMountedTransitionV1 {
  readonly operation: "mount" | "dismount";
  readonly relationship: MountedOnRelationshipStateV1;
  readonly possessionTarget: BabylonGameplayPossessionTargetV1;
}

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

export type PreparedBabylonGameplayFixedInputTickV1 =
  PreparedBabylonGameplayPossessionV1;

/**
 * Package-private seam consumed only by the provider-neutral Gameplay World
 * Port. Public Browser/CLI contracts never expose Babylon or Havok values.
 */
export interface BabylonGameplayRuntimeInternalV1 {
  readPossessionTarget(): BabylonGameplayPossessionTargetV1;
  readWorldProjection(): GameplayWorldStateProjectionV1;
  readViewProjection(): GameplayViewStateProjectionV1;
  hasEntity(entityId: string): boolean;
  isEntityControllable(entityId: string): boolean;
  estimateSemanticFactProjectionCapacity(): Readonly<{
    maximumSemanticFactCountAfterInput: number;
    maximumSemanticFactTransitionEventCount: number;
  }>;
  hasLockedActionPresentation(
    actorEntityId: string,
    semanticActionRef: string,
  ): boolean;
  preparePossessionTarget(
    target: BabylonGameplayPossessionTargetV1,
  ): Promise<PreparedBabylonGameplayPossessionV1>;
  prepareMountedRelationshipTransition(
    transition: BabylonGameplayMountedTransitionV1,
  ): Promise<PreparedBabylonGameplayPossessionV1>;
  runFixedInputTick(
    input: FixedInputOneTickV1,
    actionProjection: GameplayFixedTickActionProjectionV1,
  ): Promise<GameplayWorldStateProjectionV1>;
  /**
   * Additive Golden-path seam. Legacy Runtime implementations intentionally
   * omit it so RuntimeHost cannot mistake a mutating Tick for a transaction.
   */
  prepareFixedInputTick?(
    input: FixedInputOneTickV1,
    actionProjection: GameplayFixedTickActionProjectionV1,
  ): Promise<PreparedBabylonGameplayFixedInputTickV1>;
  dispose(): Promise<void>;
}
