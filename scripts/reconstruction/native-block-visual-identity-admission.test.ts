import { describe, expect, it } from "vitest";

import {
  admitNativeBlockVisualIdentityBindingsV1,
  NATIVE_BLOCK_VISUAL_IDENTITY_BINDING_DIAGNOSTIC_CODE_V1,
} from "./native-block-visual-identity-admission.js";

const SCENE_BRIEF_HASH = `sha256:${"a".repeat(64)}` as const;
const semanticSilhouetteTargets = [{
  acceptanceTargetRef: "worldkit://acceptance-target/visual-target-3@1",
  visualGroupId: "moon-group",
}] as const;

const palette = {
  kind: "worldkit-visual-identity-palette",
  schemaVersion: 1,
  sceneId: "native-identity-admission",
  sceneBriefHash: SCENE_BRIEF_HASH,
  movementModes: ["ground-walk"],
  movementModeLabels: ["Ground walk"],
  targets: [
    { id: "visual-target-1", visualTargetId: "visual-target-1", targetKind: "subject", name: "Explorer", description: "controlled Subject", role: "primary-subject", semanticClassId: "visual.subject", identityColor: "#E85D5D" },
    { id: "visual-target-2", visualTargetId: "visual-target-2", targetKind: "landmark", name: "Gate", description: "primary gate", role: "primary-landmark", semanticClassId: "visual.gate", identityColor: "#F28E2B" },
    { id: "visual-target-3", visualTargetId: "visual-target-3", targetKind: "landmark", name: "Moon", description: "remote moon", role: "secondary-landmark", semanticClassId: "visual.moon", identityColor: "#D9A514" },
  ],
} as const;

function manifest(identityColorHex: string) {
  return {
    kind: "native-block-authoring",
    controlledSubject: { visualTargetId: "visual-target-1", design: { kind: "registered" as const, subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2" } },
    groundExploration: { mode: "case-defined" as const },
    openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
    schemaVersion: 1,
    entryModulePath: "scene.ts",
    blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
    visualGroups: [{
      frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "moon-group",
      acceptanceTargetRef: "worldkit://acceptance-target/visual-target-3@1",
      semanticClassId: "visual.moon",
      identityColorHex,
    }],
  };
}

describe("admitNativeBlockVisualIdentityBindingsV1", () => {
  it("admits an exact empty target set but still rejects undeclared or missing groups", () => {
    const input = { sceneId: "native-identity-admission", sceneBriefSemanticHash: SCENE_BRIEF_HASH,
      semanticSilhouetteTargets: [], visualIdentityPalette: { ...palette, targets: [palette.targets[0]] },
      authoringManifest: { ...manifest("#D9A514"), visualGroups: [] } };
    expect(admitNativeBlockVisualIdentityBindingsV1(input)).toMatchObject({ outcome: "passed", bindings: [] });
    expect(admitNativeBlockVisualIdentityBindingsV1({ ...input, authoringManifest: manifest("#D9A514") }))
      .toMatchObject({ outcome: "rejected", diagnostics: [{ reason: "manifest-case-bijection-mismatch" }] });
    expect(admitNativeBlockVisualIdentityBindingsV1({ ...input, semanticSilhouetteTargets,
      visualIdentityPalette: palette }))
      .toMatchObject({ outcome: "rejected", diagnostics: [{ reason: "manifest-case-bijection-mismatch" }] });
  });

  it("admits Native target-3 only with the old frozen yellow", () => {
    expect(admitNativeBlockVisualIdentityBindingsV1({
      sceneId: "native-identity-admission",
      sceneBriefSemanticHash: SCENE_BRIEF_HASH,
      semanticSilhouetteTargets,
      visualIdentityPalette: palette,
      authoringManifest: manifest("#D9A514"),
    })).toMatchObject({
      outcome: "passed",
      bindings: [{
        visualTargetId: "visual-target-3",
        visualGroupId: "moon-group",
        identityColorHex: "#D9A514",
      }],
    });
  });

  it("rejects an otherwise unique Builder-selected replacement color", () => {
    expect(admitNativeBlockVisualIdentityBindingsV1({
      sceneId: "native-identity-admission",
      sceneBriefSemanticHash: SCENE_BRIEF_HASH,
      semanticSilhouetteTargets,
      visualIdentityPalette: palette,
      authoringManifest: manifest("#123456"),
    })).toMatchObject({
      outcome: "rejected",
      diagnostics: [{
        code: NATIVE_BLOCK_VISUAL_IDENTITY_BINDING_DIAGNOSTIC_CODE_V1,
        reason: "identity-color-mismatch",
        visualTargetId: "visual-target-3",
        expectedIdentityColorHex: "#D9A514",
        actualIdentityColorHex: "#123456",
      }],
    });
  });
});
