import { describe, expect, it } from "vitest";

import {
  inspectWhiteboxTriviewPixelsV1,
  validateSceneBriefImplementationMapDraftV1,
  validateSceneBriefImplementationMapV1,
  validateVisualCaptureGroupsV1,
  validateWhiteboxTriviewManifestV1,
  validateWhiteboxCaptureReceiptV1,
  type SceneBriefImplementationMapDraftV1,
  type SceneBriefImplementationMapV1,
  type VisualCaptureGroupV1,
  type WhiteboxTriviewManifestV1,
  type WhiteboxCaptureReceiptV1,
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
  it("measures complete tri-view foreground coverage instead of sparse color samples", () => {
    const pixels = new Uint8ClampedArray(9 * 9 * 4);
    for (let pixel = 0; pixel < 81; pixel += 1) {
      const offset = pixel * 4;
      pixels.set([232, 93, 93, 255], offset);
    }

    expect(inspectWhiteboxTriviewPixelsV1(pixels, 9, 9)).toEqual({
      widthPixels: 9,
      heightPixels: 9,
      foregroundPixelCount: 81,
      minimumForegroundPixelCount: 81,
      foregroundBoundsPixels: {
        minimumPixelsXY: [0, 0],
        maximumPixelsXY: [8, 8],
      },
      viewInspections: [
        {
          view: "front",
          foregroundPixelCount: 27,
          minimumForegroundPixelCount: 27,
          foregroundBoundsPixels: {
            minimumPixelsXY: [0, 0],
            maximumPixelsXY: [2, 8],
          },
          isRenderable: true,
        },
        {
          view: "right",
          foregroundPixelCount: 27,
          minimumForegroundPixelCount: 27,
          foregroundBoundsPixels: {
            minimumPixelsXY: [0, 0],
            maximumPixelsXY: [2, 8],
          },
          isRenderable: true,
        },
        {
          view: "back",
          foregroundPixelCount: 27,
          minimumForegroundPixelCount: 27,
          foregroundBoundsPixels: {
            minimumPixelsXY: [0, 0],
            maximumPixelsXY: [2, 8],
          },
          isRenderable: true,
        },
      ],
      isRenderable: true,
    });

    for (let y = 0; y < 9; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        pixels.set([241, 241, 237, 255], (y * 9 + x) * 4);
      }
    }
    expect(inspectWhiteboxTriviewPixelsV1(pixels, 9, 9)).toMatchObject({
      viewInspections: [
        { view: "front", foregroundPixelCount: 0, isRenderable: false },
        { view: "right", foregroundPixelCount: 27, isRenderable: true },
        { view: "back", foregroundPixelCount: 27, isRenderable: true },
      ],
      isRenderable: false,
    });

    for (let pixel = 0; pixel < 81; pixel += 1) {
      pixels[pixel * 4 + 2] = 237;
      pixels[pixel * 4] = 241;
      pixels[pixel * 4 + 1] = 241;
      pixels[pixel * 4 + 3] = 255;
    }
    expect(inspectWhiteboxTriviewPixelsV1(pixels, 9, 9)).toMatchObject({
      foregroundPixelCount: 0,
      foregroundBoundsPixels: null,
      viewInspections: [
        { view: "front", foregroundPixelCount: 0, isRenderable: false },
        { view: "right", foregroundPixelCount: 0, isRenderable: false },
        { view: "back", foregroundPixelCount: 0, isRenderable: false },
      ],
      isRenderable: false,
    });
    expect(() => inspectWhiteboxTriviewPixelsV1(pixels, 10, 9)).toThrow(
      "RGBA byte length",
    );
    expect(() => inspectWhiteboxTriviewPixelsV1(
      new Uint8ClampedArray(10 * 9 * 4),
      10,
      9,
    )).toThrow("three equal panels");
  });

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

  it("closes the Host-owned runtime and tri-view capture receipt variants", () => {
    const runtimeReceipt: WhiteboxCaptureReceiptV1 = {
      kind: "worldkit-whitebox-capture-receipt",
      schemaVersion: 1,
      sceneId: "paper-moon-palace",
      worldBuildIdentityHash: hash,
      authoringSpecHash: hash,
      openingFrameContentHash: hash,
      runtimeSnapshotContentHash: hash,
      phase: "runtime-ready",
      signatureAlgorithm: "ed25519",
      signerKeyId: "capture-test-host-key",
      signatureBase64: Buffer.alloc(64).toString("base64"),
    };
    expect(validateWhiteboxCaptureReceiptV1(runtimeReceipt)).toEqual([]);
    expect(validateWhiteboxCaptureReceiptV1({
      ...runtimeReceipt,
      phase: "triview-ready",
      whiteboxTriviewManifestContentHash: hash,
      whiteboxTriviewImageContentHashesByVisualTargetId: { traveler: hash },
    })).toEqual([]);
    expect(validateWhiteboxCaptureReceiptV1({
      ...runtimeReceipt,
      runtimeSessionId: "forbidden-self-report",
    })).toContainEqual(expect.objectContaining({
      code: "HOSTED_VISUAL_UNKNOWN_FIELD",
      instancePath: "/runtimeSessionId",
    }));
  });
});
