import { describe, expect, it } from "vitest";

import {
  parseVisualIdentityPaletteV1,
} from "./visual-identity-palette.js";

const SCENE_BRIEF_HASH = `sha256:${"a".repeat(64)}` as const;

function palette(identityColor: string) {
  return {
    kind: "worldkit-visual-identity-palette",
    schemaVersion: 1,
    sceneId: "palette-profile-test",
    sceneBriefHash: SCENE_BRIEF_HASH,
    movementMode: "ground-walk",
    movementModeLabel: "Ground walk",
    targets: [
      {
        id: "visual-target-1",
        visualTargetId: "visual-target-1",
        targetKind: "subject",
        name: "Explorer",
        description: "controlled Subject",
        role: "primary-subject",
        semanticClassId: "visual.subject",
        identityColor: "#E85D5D",
      },
      {
        id: "visual-target-2",
        visualTargetId: "visual-target-2",
        targetKind: "landmark",
        name: "Gate",
        description: "primary gate",
        role: "primary-landmark",
        semanticClassId: "visual.gate",
        identityColor: "#F28E2B",
      },
      {
        id: "visual-target-3",
        visualTargetId: "visual-target-3",
        targetKind: "landmark",
        name: "Moon",
        description: "remote moon",
        role: "secondary-landmark",
        semanticClassId: "visual.moon",
        identityColor,
      },
    ],
  };
}

describe("parseVisualIdentityPaletteV1", () => {
  it("keeps the Native old target-3 yellow and Canonical target-3 purple isolated", () => {
    expect(parseVisualIdentityPaletteV1(palette("#D9A514"), {
      sceneSourceKind: "babylon-native",
      sceneId: "palette-profile-test",
      sceneBriefHash: SCENE_BRIEF_HASH,
    }).targets[2]!.identityColor).toBe("#D9A514");
    expect(parseVisualIdentityPaletteV1(palette("#8E6CCF"), {
      sceneSourceKind: "canonical",
      sceneId: "palette-profile-test",
      sceneBriefHash: SCENE_BRIEF_HASH,
    }).targets[2]!.identityColor).toBe("#8E6CCF");
    expect(() => parseVisualIdentityPaletteV1(palette("#8E6CCF"), {
      sceneSourceKind: "babylon-native",
      sceneId: "palette-profile-test",
      sceneBriefHash: SCENE_BRIEF_HASH,
    })).toThrow("WORLDKIT_VISUAL_IDENTITY_PALETTE_INVALID");
  });
});
