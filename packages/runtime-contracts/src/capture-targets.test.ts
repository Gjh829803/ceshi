import { describe, expect, it } from "vitest";

import {
  validateSceneBriefImplementationMapDraftV1,
  validateSceneBriefImplementationMapV1,
  validateVisualCaptureGroupsV1,
  validateWhiteboxTriviewManifestV1,
  type SceneBriefImplementationMapDraftV1,
  type SceneBriefImplementationMapV1,
  type VisualCaptureGroupV1,
  type WhiteboxTriviewManifestV1,
} from "./capture-targets";

const hash = `sha256:${"a".repeat(64)}` as const;

function group(
  visualTargetId = "visual-target-1",
  runtimeEntityIds: readonly string[] = ["player"],
): VisualCaptureGroupV1 {
  return {
    visualTargetId,
    runtimeEntityIds,
    role: "primary-subject",
    semanticClassId: "visual.subject",
    identityColor: "#E85D5D",
  };
}

function finalMap(): SceneBriefImplementationMapV1 {
  return {
    kind: "worldkit-scene-brief-implementation-map",
    schemaVersion: 1,
    sceneId: "paper-moon-palace",
    sceneBriefHash: hash,
    authoringSpecId: "paper-moon-palace-world",
    authoringSpecHash: hash,
    visualTargetMappings: [{
      visualTargetId: "visual-target-1",
      runtimeEntityIds: ["player"],
    }],
    visualCaptureGroups: [group()],
  };
}

describe("hosted visual capture contracts", () => {
  it("keeps draft and final implementation maps as closed distinct unions", () => {
    const draft: SceneBriefImplementationMapDraftV1 = {
      kind: "worldkit-scene-brief-implementation-map-draft",
      schemaVersion: 1,
      sceneId: "paper-moon-palace",
      authoringSpecId: "paper-moon-palace-world",
      visualTargetMappings: [{
        visualTargetId: "visual-target-1",
        runtimeEntityIds: ["player"],
      }],
    };
    expect(validateSceneBriefImplementationMapDraftV1(draft)).toEqual([]);
    expect(validateSceneBriefImplementationMapV1(draft)).toContainEqual(
      expect.objectContaining({ code: "HOSTED_VISUAL_FINAL_KIND_INVALID", instancePath: "/kind" }),
    );

    const final = finalMap();
    expect(validateSceneBriefImplementationMapV1(final)).toEqual([]);
    expect(validateSceneBriefImplementationMapDraftV1(final)).toContainEqual(
      expect.objectContaining({ code: "HOSTED_VISUAL_DRAFT_KIND_INVALID", instancePath: "/kind" }),
    );

    expect(validateSceneBriefImplementationMapDraftV1({
      ...draft,
      mappings: draft.visualTargetMappings,
    })).toContainEqual(expect.objectContaining({
      code: "HOSTED_VISUAL_UNKNOWN_FIELD",
      instancePath: "/mappings",
    }));
  });

  it.each([null, {}, [], [{}]])(
    "returns stable diagnostics instead of throwing for malformed value %#",
    (value) => {
      expect(() => validateSceneBriefImplementationMapV1(value)).not.toThrow();
      expect(validateSceneBriefImplementationMapV1(value).length).toBeGreaterThan(0);
      expect(() => validateSceneBriefImplementationMapDraftV1(value)).not.toThrow();
      expect(validateSceneBriefImplementationMapDraftV1(value).length).toBeGreaterThan(0);
      expect(() => validateVisualCaptureGroupsV1(value)).not.toThrow();
      expect(validateVisualCaptureGroupsV1(value).length).toBeGreaterThan(0);
      expect(() => validateWhiteboxTriviewManifestV1(value)).not.toThrow();
      expect(validateWhiteboxTriviewManifestV1(value).length).toBeGreaterThan(0);
    },
  );

  it("uses visualTargetId as the only capture-group identity", () => {
    expect(validateVisualCaptureGroupsV1([group()])).toEqual([]);
    expect(validateVisualCaptureGroupsV1([{
      ...group(),
      id: "competing-id",
    }])).toContainEqual(expect.objectContaining({
      code: "HOSTED_VISUAL_UNKNOWN_FIELD",
      instancePath: "/0/id",
    }));
  });

  it("requires complete one-to-one mapping/group closure", () => {
    const value: SceneBriefImplementationMapV1 = {
      ...finalMap(),
      visualCaptureGroups: [group("visual-target-1", ["different-entity"])],
    };
    expect(validateSceneBriefImplementationMapV1(value)).toContainEqual(
      expect.objectContaining({
        code: "HOSTED_VISUAL_MAPPING_GROUP_MISMATCH",
        instancePath: "/visualCaptureGroups/0/runtimeEntityIds",
      }),
    );

    const reusedEntity: SceneBriefImplementationMapV1 = {
      ...finalMap(),
      visualTargetMappings: [
        { visualTargetId: "visual-target-1", runtimeEntityIds: ["player"] },
        { visualTargetId: "visual-target-2", runtimeEntityIds: ["player"] },
      ],
    };
    expect(validateSceneBriefImplementationMapV1(reusedEntity)).toContainEqual(
      expect.objectContaining({ code: "HOSTED_VISUAL_RUNTIME_ENTITY_REUSED" }),
    );
  });

  it("owns one whitebox tri-view manifest with canonical URI naming", () => {
    const value: WhiteboxTriviewManifestV1 = {
      kind: "worldkit-whitebox-triview-manifest",
      schemaVersion: 1,
      worldBuildIdentityHash: hash,
      whiteboxTriviews: [{
        ...group("traveler", ["traveler"]),
        views: ["front", "right", "back"],
        imageUri: "traveler/whitebox-triview.png",
      }],
    };
    expect(validateWhiteboxTriviewManifestV1(value)).toEqual([]);
    const removedPlanHashField = ["execution", "Plan", "Hash"].join("");

    expect(validateWhiteboxTriviewManifestV1({
      ...value,
      worldBuildIdentityHash: undefined,
      [removedPlanHashField]: hash,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "HOSTED_VISUAL_UNKNOWN_FIELD",
        instancePath: `/${removedPlanHashField}`,
      }),
      expect.objectContaining({
        code: "HOSTED_VISUAL_WORLD_BUILD_IDENTITY_HASH_INVALID",
        instancePath: "/worldBuildIdentityHash",
      }),
    ]));

    expect(validateWhiteboxTriviewManifestV1({
      ...value,
      kind: "worldkit-runtime-triview-manifest",
      targets: value.whiteboxTriviews,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "HOSTED_VISUAL_TRIVIEW_KIND_INVALID" }),
      expect.objectContaining({ code: "HOSTED_VISUAL_UNKNOWN_FIELD", instancePath: "/targets" }),
    ]));

    const traversal = {
      ...value,
      whiteboxTriviews: [{
        ...value.whiteboxTriviews[0]!,
        imageUri: "../traveler.png",
      }],
    };
    expect(validateWhiteboxTriviewManifestV1(traversal)).toContainEqual(
      expect.objectContaining({
        code: "HOSTED_VISUAL_TRIVIEW_URI_INVALID",
        instancePath: "/whiteboxTriviews/0/imageUri",
      }),
    );
  });
});
