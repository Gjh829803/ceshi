import { describe, expect, it } from "vitest";

import {
  CONTROL_TRANSITION_CAPABILITY_REF,
  createCoreGameplayBootstrapV1,
} from "./index";
import { createCoreControlFeatureFactoryV1 } from "./core-control-feature";

describe("createCoreGameplayBootstrapV1", () => {
  it("locks the authoritative core-control feature and capability", () => {
    const coreControlManifest = createCoreControlFeatureFactoryV1().manifest;

    const bootstrap = createCoreGameplayBootstrapV1({
      worldId: "route-world",
      worldSeed: 42,
      entityDescriptors: [{
        id: "player",
        entityDefinitionRef: "worldkit://subject-definition/humanoid@1",
        capabilityRefs: [
          "worldkit://runtime-capability/ground-locomotion@1",
          CONTROL_TRANSITION_CAPABILITY_REF,
        ],
      }],
    });

    expect(bootstrap.featureResourceLocks).toEqual([{
      resourceRef: coreControlManifest.resourceRef,
      contentHash: coreControlManifest.contentHash,
    }]);
    expect(bootstrap.availableCapabilityRefs).toEqual([
      CONTROL_TRANSITION_CAPABILITY_REF,
      "worldkit://runtime-capability/ground-locomotion@1",
    ]);
    expect(bootstrap).toMatchObject({
      id: "route-world.gameplay",
      version: 1,
      resourceRef: "worldkit://gameplay-bootstrap/route-world.42@1",
    });
  });
});
