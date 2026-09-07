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
    movementModes: ["ground-walk"],
    movementModeLabels: ["Ground walk"],
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
  it("preserves every ordered movement/label pair and rejects the removed singular contract", () => {
    const source = { ...palette("#D9A514"), movementModes: ["flight", "ground-walk", "custom"],
      movementModeLabels: ["空中飞行（滑翔翼）", "陆地步行", "磁力墙面行走"] };
    const expected = { sceneSourceKind: "babylon-native" as const, sceneId: source.sceneId, sceneBriefHash: SCENE_BRIEF_HASH };
    const parsed = parseVisualIdentityPaletteV1(source, expected);
    expect(parsed.movementModes).toEqual(source.movementModes);
    expect(parsed.movementModeLabels).toEqual(source.movementModeLabels);
    expect(Object.isFrozen(parsed.movementModes)).toBe(true);
    expect(() => parseVisualIdentityPaletteV1({ ...source, movementModeLabels: ["飞行"] }, expected)).toThrow();
    expect(() => parseVisualIdentityPaletteV1({ ...source, movementModes: ["flight", "invented-mode", "custom"] }, expected)).toThrow();
    const { movementModes: _modes, movementModeLabels: _labels, ...identity } = source;
    expect(() => parseVisualIdentityPaletteV1({ ...identity, movementMode: "ground-walk", movementModeLabel: "陆地步行" }, expected)).toThrow();
  });
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
