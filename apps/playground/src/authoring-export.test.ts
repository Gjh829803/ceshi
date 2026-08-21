import { describe, expect, it } from "vitest";

import type { CapabilityDemoHostOverlayV1 } from "./authoring-loader";
import { withCapabilityDemoHostOverlay } from "./authoring-export";

const RELATIONSHIP_DEFERRED_OVERLAY: CapabilityDemoHostOverlayV1 = {
  kind: "capability-demo",
  id: "capability-demo",
  schemaVersion: 1,
  subjectDefinitionRef:
    "worldkit://subject-definition/watercraft.kayak.surface@1",
  changes: [{
    type: "relationship-capabilities-deferred",
    sourceSubjectDefinitionRef:
      "worldkit://subject-definition/watercraft.kayak.surface@1",
    runtimeSubjectDefinitionRef:
      "worldkit://subject-definition/playground-preview.watercraft.kayak.surface@1",
    deferredCapabilityRefs: ["worldkit://capability/relationship.seat@1"],
  }],
};

describe("withCapabilityDemoHostOverlay", () => {
  it("preserves the explicit relationship deferral in exported authoring JSON", () => {
    expect(withCapabilityDemoHostOverlay(
      { schemaVersion: 4 as const, subjectDefinition: { resourceRef: "canonical" } },
      RELATIONSHIP_DEFERRED_OVERLAY,
    )).toEqual({
      schemaVersion: 4,
      subjectDefinition: { resourceRef: "canonical" },
      capabilityDemoHostOverlay: RELATIONSHIP_DEFERRED_OVERLAY,
    });
  });

  it("does not invent a host overlay for an unmodified canonical package", () => {
    expect(withCapabilityDemoHostOverlay(
      { schemaVersion: 4 as const, subjectDefinition: { resourceRef: "canonical" } },
      undefined,
    )).toEqual({
      schemaVersion: 4,
      subjectDefinition: { resourceRef: "canonical" },
    });
  });
});
