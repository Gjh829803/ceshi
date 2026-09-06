import {
  createGameplayBootstrapV1,
  RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
  type GameplayBootstrapV1,
  type GameplayEntityDescriptorV1,
  type GameplayRelationshipStateV1,
} from "@whitebox-world/gameplay-contracts";
import { uniq } from "lodash-es";

import {
  CONTROL_TRANSITION_CAPABILITY_REF,
  createCoreControlFeatureFactoryV1,
} from "./core-control-feature";
export interface CoreGameplayBootstrapInputV1 {
  readonly worldId: string;
  readonly worldSeed: number;
  readonly entityDescriptors: readonly GameplayEntityDescriptorV1[];
  readonly initialRelationshipStates: readonly GameplayRelationshipStateV1[];
}

export function coreGameplayBootstrapResourceRefV1(
  input: Pick<CoreGameplayBootstrapInputV1, "worldId" | "worldSeed">,
): string {
  return `worldkit://gameplay-bootstrap/${input.worldId}.${input.worldSeed}@1`;
}

/**
 * Creates the canonical Gameplay bootstrap required by the built-in Runtime
 * Host. Authoring loaders and CLI pipelines must share this constructor so an
 * identical world always compiles to an identical Canonical Scene Plan lock.
 */
export function createCoreGameplayBootstrapV1(
  input: CoreGameplayBootstrapInputV1,
): GameplayBootstrapV1 {
  const coreControlManifest = createCoreControlFeatureFactoryV1().manifest;
  return createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: `${input.worldId}.gameplay`,
    version: 1,
    resourceRef: coreGameplayBootstrapResourceRefV1(input),
    semanticFactProjectorProfileResource:
      RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
    entityDescriptors: input.entityDescriptors,
    featureResourceLocks: [{
      resourceRef: coreControlManifest.resourceRef,
      contentHash: coreControlManifest.contentHash,
    }],
    semanticActionDefinitions: [],
    availableCapabilityRefs: uniq([
      ...input.entityDescriptors.flatMap(
        (descriptor) => descriptor.capabilityRefs,
      ),
      CONTROL_TRANSITION_CAPABILITY_REF,
    ]),
    initialRelationshipStates: input.initialRelationshipStates,
  });
}
