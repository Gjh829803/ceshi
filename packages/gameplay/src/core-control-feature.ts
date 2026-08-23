import { createGameplayFeatureManifestV1 } from "@whitebox-world/gameplay-contracts";

import type { GameplayCommandHandlerV1 } from "./gameplay-command-dispatcher";
import type { GameplayFeatureFactoryV1 } from "./gameplay-feature-manager";

export const CORE_CONTROL_FEATURE_REF =
  "worldkit://gameplay-feature/core-control@1" as const;
export const CONTROL_TRANSITION_CAPABILITY_REF =
  "worldkit://runtime-capability/control-transition@1" as const;

const manifest = createGameplayFeatureManifestV1({
  kind: "gameplay-feature",
  id: "core-control",
  version: 1,
  resourceRef: CORE_CONTROL_FEATURE_REF,
  dependencyFeatureRefs: [],
  requiredCapabilityRefs: [CONTROL_TRANSITION_CAPABILITY_REF],
  commandTypes: ["control.bind", "control.release"],
  resourceBudget: { stateSliceCount: 1, commandHandlerCount: 2 },
});

function handlers(): readonly GameplayCommandHandlerV1[] {
  return [
    {
      type: "control.bind",
      plan: ({ command, state, simulationTick }) =>
        state.planControl(command, simulationTick),
    },
    {
      type: "control.release",
      plan: ({ command, state, simulationTick }) =>
        state.planControl(command, simulationTick),
    },
  ];
}

export function createCoreControlFeatureFactoryV1(): GameplayFeatureFactoryV1 {
  return Object.freeze({
    manifest,
    create: () => ({
      resourceRef: CORE_CONTROL_FEATURE_REF,
      commandHandlers: handlers(),
      createStateSlice: () => Object.freeze({ kind: "core-control-state", schemaVersion: 1 }),
      prepare: () => undefined,
      activate: () => undefined,
      deactivate: () => undefined,
      dispose: () => undefined,
    }),
  });
}
