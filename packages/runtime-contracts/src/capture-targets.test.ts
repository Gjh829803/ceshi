import { describe, expect, it } from "vitest";

import {
  validateRuntimeTriviewManifestV1,
  validateCaptureTargetManifestV1,
  validateSceneBriefImplementationMapV1,
  type CaptureTargetManifestV1,
  type RuntimeTriviewManifestV1,
  type SceneBriefImplementationMapV1,
} from "./capture-targets";

const hash = `sha256:${"a".repeat(64)}` as const;

describe("capture target contracts", () => {
  it("accepts a lightweight Scene Brief implementation map", () => {
    const value: SceneBriefImplementationMapV1 = {
      kind: "worldkit-scene-brief-implementation-map",
      schemaVersion: 1,
      sceneId: "paper-moon-palace",
      sceneBriefHash: hash,
      authoringSpecId: "paper-moon-palace-world",
      authoringSpecHash: hash,
      mappings: [{ visualTargetId: "visual-target-1", runtimeEntityIds: ["player"] }],
      visualCaptureGroups: [{
        id: "visual-target-1",
        visualTargetId: "visual-target-1",
        runtimeEntityIds: ["player"],
        role: "primary-subject",
        semanticClassId: "visual.subject",
        identityColor: "#E85D5D",
      }],
    };
    expect(validateSceneBriefImplementationMapV1(value)).toEqual([]);
  });

  it("requires canonical front/right/back capture order", () => {
    const value: CaptureTargetManifestV1 = {
      kind: "worldkit-capture-target-manifest",
      schemaVersion: 1,
      sceneId: "paper-moon-palace",
      sceneBriefHash: hash,
      executionPlanHash: hash,
      targets: [{
        id: "traveler-triview",
        visualTargetId: "traveler",
        runtimeEntityIds: ["traveler"],
        role: "primary-subject",
        semanticClassId: "subject.traveler",
        identityColor: "#E85D5D",
        views: ["front", "right", "back"],
      }],
    };
    expect(validateCaptureTargetManifestV1(value)).toEqual([]);
    value.targets[0]!.views = ["front", "back", "right"];
    expect(validateCaptureTargetManifestV1(value)).toContain("Capture target 'traveler-triview' is invalid.");
  });

  it("binds every runtime tri-view target to its canonical relative PNG", () => {
    const value: RuntimeTriviewManifestV1 = {
      kind: "worldkit-runtime-triview-manifest",
      schemaVersion: 1,
      executionPlanHash: hash,
      targets: [{
        id: "traveler",
        visualTargetId: "traveler",
        runtimeEntityIds: ["traveler"],
        role: "primary-subject",
        semanticClassId: "subject.traveler",
        identityColor: "#E85D5D",
        views: ["front", "right", "back"],
        imagePath: "traveler/whitebox-triview.png",
      }],
    };
    expect(validateRuntimeTriviewManifestV1(value)).toEqual([]);
    value.targets[0]!.imagePath = "../traveler.png";
    expect(validateRuntimeTriviewManifestV1(value)).toContain("Runtime tri-view target 'traveler' is invalid.");
  });

  it("rejects more than five visual groups and incomplete compound landmarks", () => {
    const targets = Array.from({ length: 6 }, (_, index) => ({
      id: `target-${index}`,
      visualTargetId: `target-${index}`,
      runtimeEntityIds: [`entity-${index}`],
      role: index === 0 ? "primary-subject" as const : "key-object" as const,
      semanticClassId: `visual.${index}`,
      identityColor: "#E85D5D" as const,
    }));
    const value: SceneBriefImplementationMapV1 = {
      kind: "worldkit-scene-brief-implementation-map",
      schemaVersion: 1,
      sceneId: "paper-moon-palace",
      sceneBriefHash: hash,
      authoringSpecId: "paper-moon-palace-world",
      authoringSpecHash: hash,
      mappings: targets.map(({ visualTargetId, runtimeEntityIds }) => ({ visualTargetId, runtimeEntityIds })),
      visualCaptureGroups: targets,
    };
    expect(validateSceneBriefImplementationMapV1(value)).toContain(
      "Visual capture groups must contain 1-5 targets including the primary subject.",
    );
    value.visualCaptureGroups = [{ ...targets[0]!, runtimeEntityIds: ["different-entity"] }];
    expect(validateSceneBriefImplementationMapV1(value)).toContain(
      "Visual capture group 'target-0' must contain the complete Scene Brief target mapping for 'target-0'.",
    );
  });

  it("rejects mappings that are absent from capture groups or reuse an entity", () => {
    const value: SceneBriefImplementationMapV1 = {
      kind: "worldkit-scene-brief-implementation-map",
      schemaVersion: 1,
      sceneId: "paper-moon-palace",
      sceneBriefHash: hash,
      authoringSpecId: "paper-moon-palace-world",
      authoringSpecHash: hash,
      mappings: [
        { visualTargetId: "visual-target-1", runtimeEntityIds: ["player"] },
        { visualTargetId: "visual-target-2", runtimeEntityIds: ["player"] },
      ],
      visualCaptureGroups: [{
        id: "visual-target-1",
        visualTargetId: "visual-target-1",
        runtimeEntityIds: ["player"],
        role: "primary-subject",
        semanticClassId: "visual.subject",
        identityColor: "#E85D5D",
      }],
    };
    const errors = validateSceneBriefImplementationMapV1(value);
    expect(errors).toContain(
      "A runtime entity may belong to only one Scene Brief implementation mapping.",
    );
    expect(errors).toContain(
      "Scene Brief implementation mappings and visual capture groups must contain the same visualTargetIds.",
    );
  });
});
