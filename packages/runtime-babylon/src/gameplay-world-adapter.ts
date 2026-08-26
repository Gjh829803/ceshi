import type {
  FixedInputOneTickV1,
  GameplayFixedInputCapacityEstimateV1,
  GameplayWorldPortV1,
  GameplayWorldStateProjectionV1,
  GameplayWorldTransactionV1,
  GameplayWorldTransitionV1,
} from "@whitebox-world/runtime-host";
import { isNil } from "lodash-es";

import {
  BABYLON_GAMEPLAY_RUNTIME_INTERNAL,
  type BabylonGameplayMountedTransitionV1,
  type BabylonGameplayPossessionTargetV1,
  type BabylonGameplayRuntimeInternalV1,
} from "./gameplay-runtime-internal";

export interface BabylonGameplayRuntimeAccessV1 {
  [BABYLON_GAMEPLAY_RUNTIME_INTERNAL](): BabylonGameplayRuntimeInternalV1;
}

function portError(code: string, message: string): Error {
  return new Error(`${code}: ${message}`);
}

function fail(code: string): never {
  throw portError(code, "Gameplay World Port rejected the transition.");
}

function assertSingleFixedTick(input: FixedInputOneTickV1): void {
  if (input.ticks !== 1) {
    throw new RangeError(
      "Gameplay World Port accepts exactly one fixed tick.",
    );
  }
}

function sameTarget(
  left: BabylonGameplayPossessionTargetV1,
  right: BabylonGameplayPossessionTargetV1,
): boolean {
  return left.mode === right.mode &&
    (left.mode === "unbound" ||
      (right.mode === "possessed" &&
        left.controlledEntityId === right.controlledEntityId));
}

function nextPossessionTarget(
  internal: BabylonGameplayRuntimeInternalV1,
  fixedInputControllerEntityId: string,
  transition: GameplayWorldTransitionV1,
): BabylonGameplayPossessionTargetV1 | undefined {
  if (
    transition.type === "action.activate" ||
    transition.type === "action.cancel" ||
    transition.type === "action.complete"
  ) {
    return fail("GAMEPLAY_ACTION_PRESENTATION_UNAVAILABLE");
  }

  const current = internal.readPossessionTarget();
  const additions = transition.relationshipChanges.filter(
    (change) => change.operation === "add",
  );
  const removals = transition.relationshipChanges.filter(
    (change) => change.operation === "remove",
  );
  if (
    additions.length > 1 ||
    removals.length > 1 ||
    additions.length + removals.length !== transition.relationshipChanges.length
  ) return fail("GAMEPLAY_POSSESSION_TRANSITION_INVALID");

  const added = additions[0]?.after;
  const removed = removals[0]?.before;
  if (
    (!isNil(added) && added.type !== "possessedBy") ||
    (!isNil(removed) && removed.type !== "possessedBy")
  ) return fail("GAMEPLAY_POSSESSION_TRANSITION_INVALID");

  const addedControllerEntityId = added?.controllerEntityId;
  const removedControllerEntityId = removed?.controllerEntityId;
  if (
    !isNil(addedControllerEntityId) &&
    !isNil(removedControllerEntityId) &&
    addedControllerEntityId !== removedControllerEntityId
  ) return fail("GAMEPLAY_POSSESSION_TRANSITION_INVALID");
  const transitionControllerEntityId = !isNil(addedControllerEntityId)
    ? addedControllerEntityId
    : removedControllerEntityId;
  if (isNil(transitionControllerEntityId)) {
    return fail("GAMEPLAY_POSSESSION_TRANSITION_INVALID");
  }
  if (transitionControllerEntityId !== fixedInputControllerEntityId) {
    return undefined;
  }

  if (transition.type === "control.release") {
    if (
      additions.length !== 0 ||
      isNil(removed) ||
      current.mode !== "possessed" ||
      removed.controlledEntityId !== current.controlledEntityId
    ) return fail("GAMEPLAY_POSSESSION_TRANSITION_STALE");
    return Object.freeze({ mode: "unbound" });
  }

  if (
    isNil(added) ||
    !internal.hasEntity(added.controlledEntityId) ||
    !internal.isEntityControllable(added.controlledEntityId)
  ) return fail("GAMEPLAY_POSSESSION_TARGET_UNAVAILABLE");

  if (current.mode === "unbound") {
    if (!isNil(removed)) {
      return fail("GAMEPLAY_POSSESSION_TRANSITION_STALE");
    }
  } else {
    if (
      isNil(removed) ||
      removed.controlledEntityId !== current.controlledEntityId ||
      removed.controllerEntityId !== added.controllerEntityId
    ) return fail("GAMEPLAY_POSSESSION_TRANSITION_STALE");
  }

  const next = Object.freeze({
    mode: "possessed" as const,
    controlledEntityId: added.controlledEntityId,
  });
  if (sameTarget(current, next)) {
    return fail("GAMEPLAY_POSSESSION_TRANSITION_INVALID");
  }
  return next;
}

function mountedTransition(
  internal: BabylonGameplayRuntimeInternalV1,
  fixedInputControllerEntityId: string,
  transition: GameplayWorldTransitionV1,
): BabylonGameplayMountedTransitionV1 | undefined {
  if (
    transition.type !== "action.activate" ||
    !("trustedActionEffectPlan" in transition) ||
    isNil(transition.trustedActionEffectPlan)
  ) return undefined;
  const effect = transition.trustedActionEffectPlan;
  if (effect.kind !== "mounted-relationship-effect-plan") {
    return fail("GAMEPLAY_MOUNTED_TRANSITION_INVALID");
  }
  const relationship = effect.relationshipChanges
    .map((change) => change.operation === "add" ? change.after : change.before)
    .find((candidate) => candidate.type === "mountedOn");
  const possession = effect.relationshipChanges
    .filter((change) => change.operation === "add")
    .map((change) => change.after)
    .find((candidate) =>
      candidate.type === "possessedBy" &&
      candidate.controllerEntityId === fixedInputControllerEntityId
    );
  const current = internal.readPossessionTarget();
  if (
    isNil(relationship) ||
    relationship.type !== "mountedOn" ||
    isNil(possession) ||
    possession.type !== "possessedBy" ||
    current.mode !== "possessed" ||
    current.controlledEntityId !== effect.requiredControlledEntityId ||
    !internal.hasEntity(relationship.riderEntityId) ||
    !internal.hasEntity(relationship.mountEntityId) ||
    !internal.isEntityControllable(possession.controlledEntityId)
  ) return fail("GAMEPLAY_MOUNTED_TRANSITION_STALE");
  return Object.freeze({
    operation: effect.operation,
    relationship,
    possessionTarget: Object.freeze({
      mode: "possessed" as const,
      controlledEntityId: possession.controlledEntityId,
    }),
  });
}

function noOpTransaction(
  internal: BabylonGameplayRuntimeInternalV1,
): GameplayWorldTransactionV1 {
  let projectedWorldStateAfter: GameplayWorldStateProjectionV1;
  let projectedViewStateAfter: ReturnType<
    BabylonGameplayRuntimeInternalV1["readViewProjection"]
  >;
  try {
    projectedWorldStateAfter = internal.readWorldProjection();
    projectedViewStateAfter = internal.readViewProjection();
  } catch {
    throw portError(
      "GAMEPLAY_WORLD_PORT_QUERY_FAILED",
      "Gameplay World Port could not read the current projection.",
    );
  }
  const abortPromise = Promise.resolve();
  return Object.freeze({
    projectedWorldStateAfter,
    projectedViewStateAfter,
    commitPrepared: (): void => undefined,
    abort: (): Promise<void> => abortPromise,
  });
}

function providerNeutralTransaction(
  transaction: GameplayWorldTransactionV1,
): GameplayWorldTransactionV1 {
  let abortPromise: Promise<void> | undefined;
  return Object.freeze({
    projectedWorldStateAfter: transaction.projectedWorldStateAfter,
    projectedViewStateAfter: transaction.projectedViewStateAfter,
    commitPrepared: (): void => {
      try {
        transaction.commitPrepared();
      } catch {
        throw portError(
          "ADAPTER_COMMIT_CONTRACT_VIOLATED",
          "Gameplay World Port could not commit the prepared transition.",
        );
      }
    },
    abort: (): Promise<void> => {
      if (!isNil(abortPromise)) return abortPromise;
      try {
        abortPromise = transaction.abort().catch(() => {
          throw portError(
            "ADAPTER_ABORT_FAILED",
            "Gameplay World Port could not abort the prepared transition.",
          );
        });
      } catch {
        abortPromise = Promise.reject(portError(
          "ADAPTER_ABORT_FAILED",
          "Gameplay World Port could not abort the prepared transition.",
        ));
      }
      return abortPromise;
    },
  });
}

class BabylonGameplayWorldPortV1 implements GameplayWorldPortV1 {
  constructor(
    private readonly internal: BabylonGameplayRuntimeInternalV1,
    private readonly fixedInputControllerEntityId: string,
  ) {}

  initialize(): Promise<GameplayWorldStateProjectionV1> {
    try {
      return Promise.resolve(this.internal.readWorldProjection());
    } catch {
      return Promise.reject(portError(
        "GAMEPLAY_WORLD_PORT_INITIALIZATION_FAILED",
        "Gameplay World Port could not initialize its projection.",
      ));
    }
  }

  hasEntity(entityId: string): boolean {
    return this.internal.hasEntity(entityId);
  }

  isEntityControllable(controlledEntityId: string): boolean {
    return this.internal.isEntityControllable(controlledEntityId);
  }

  isActionAvailable(
    actorEntityId: string,
    _semanticActionRef: string,
    transition: GameplayWorldTransitionV1,
  ): boolean {
    // State-only presentation remains fail-closed. A trusted mounted effect is
    // already locked by Ref+Hash and is revalidated in prepare, so it does not
    // require an unrelated animation mapping.
    return transition.type === "action.activate" &&
      "trustedActionEffectPlan" in transition &&
      transition.trustedActionEffectPlan?.kind ===
        "mounted-relationship-effect-plan" &&
      this.internal.hasEntity(actorEntityId);
  }

  async prepareGameplayTransition(
    transition: GameplayWorldTransitionV1,
  ): Promise<GameplayWorldTransactionV1> {
    const mounted = mountedTransition(
      this.internal,
      this.fixedInputControllerEntityId,
      transition,
    );
    if (!isNil(mounted)) {
      try {
        return providerNeutralTransaction(
          await this.internal.prepareMountedRelationshipTransition(mounted),
        );
      } catch {
        throw portError(
          "ADAPTER_PREPARE_FAILED",
          "Gameplay World Port could not prepare the mounted transition.",
        );
      }
    }
    const target = nextPossessionTarget(
      this.internal,
      this.fixedInputControllerEntityId,
      transition,
    );
    if (isNil(target)) return noOpTransaction(this.internal);
    try {
      return providerNeutralTransaction(
        await this.internal.preparePossessionTarget(target),
      );
    } catch {
      throw portError(
        "ADAPTER_PREPARE_FAILED",
        "Gameplay World Port could not prepare the transition.",
      );
    }
  }

  estimateFixedInputTickCapacity(
    input: FixedInputOneTickV1,
  ): GameplayFixedInputCapacityEstimateV1 {
    assertSingleFixedTick(input);
    const projection = this.internal.readWorldProjection();
    return Object.freeze({
      maximumSemanticFactCountAfterInput:
        Object.keys(projection.semanticFactsById).length,
      maximumSemanticFactTransitionEventCount: 0,
    });
  }

  async runFixedInputTick(
    input: FixedInputOneTickV1,
  ): Promise<GameplayWorldStateProjectionV1> {
    assertSingleFixedTick(input);
    try {
      return await this.internal.runFixedInputTick(input);
    } catch {
      throw portError(
        "ADAPTER_FIXED_INPUT_FAILED",
        "Gameplay World Port could not run fixed input.",
      );
    }
  }

  snapshot(): GameplayWorldStateProjectionV1 {
    return this.internal.readWorldProjection();
  }

  dispose(): Promise<void> {
    try {
      return this.internal.dispose().catch(() => {
        throw portError(
          "GAMEPLAY_WORLD_PORT_DISPOSE_FAILED",
          "Gameplay World Port could not dispose its resources.",
        );
      });
    } catch {
      return Promise.reject(portError(
        "GAMEPLAY_WORLD_PORT_DISPOSE_FAILED",
        "Gameplay World Port could not dispose its resources.",
      ));
    }
  }
}

export function createBabylonGameplayWorldPortV1(
  runtime: BabylonGameplayRuntimeAccessV1,
  fixedInputControllerEntityId: string,
): GameplayWorldPortV1 {
  if (
    isNil(fixedInputControllerEntityId) ||
    typeof fixedInputControllerEntityId !== "string" ||
    fixedInputControllerEntityId.length === 0
  ) {
    throw new TypeError("FIXED_INPUT_CONTROLLER_ENTITY_ID_INVALID");
  }
  let internal: BabylonGameplayRuntimeInternalV1;
  try {
    internal = runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]();
  } catch {
    throw new TypeError("GAMEPLAY_RUNTIME_INTERNAL_UNAVAILABLE");
  }
  if (isNil(internal) || typeof internal !== "object") {
    throw new TypeError("GAMEPLAY_RUNTIME_INTERNAL_UNAVAILABLE");
  }
  return Object.freeze(new BabylonGameplayWorldPortV1(
    internal,
    fixedInputControllerEntityId,
  ));
}
