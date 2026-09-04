import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { builtInSubjectResourceRegistry } from
  "./built-in-subject-resource-registry";
import {
  KART_CONTROL_LAB_COLLIDER_PROFILE_REF,
  KART_CONTROL_LAB_CONTROL_FEEL_PROFILE_REF,
  KART_CONTROL_LAB_LOCOMOTION_PROFILE_REF,
  KART_CONTROL_LAB_SUBJECT_ASSET_REF,
} from "./kart-control-lab-resource-manifests";

const DEFINITION_REF =
  "worldkit://subject-definition/kart-control-lab.stk-kart@1";

describe("Kart Control Lab STK kart intake", () => {
  it("registers the immutable static GLB with matching bytes and GPL provenance", async () => {
    const asset = builtInSubjectResourceRegistry.resolveSubjectAsset(
      KART_CONTROL_LAB_SUBJECT_ASSET_REF,
    )!;
    const bytes = await readFile(new URL(
      "../../../apps/playground/public/subject-assets/kart-control-lab/stk-kart/v1/stk-kart.glb",
      import.meta.url,
    ));

    expect(asset.artifact).toEqual({
      mediaType: "model/gltf-binary",
      byteLength: bytes.byteLength,
      contentHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    });
    expect(asset.inventory).toMatchObject({
      meshCount: 17,
      vertexCount: 1_620,
      triangleCount: 1_528,
      skeletonCount: 0,
      boneCount: 0,
      animationClipCount: 0,
      animationClipNames: [],
    });
    expect(asset.provenance).toMatchObject({
      licenseSpdxId: "GPL-3.0-or-later",
      redistributionPolicy: "allowed",
    });
  });

  it("closes the subject, collider, locomotion and STK feel registrations", () => {
    const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
      DEFINITION_REF,
    )!;
    const feel = builtInSubjectResourceRegistry.resolveControlFeelProfile(
      KART_CONTROL_LAB_CONTROL_FEEL_PROFILE_REF,
    )!;

    expect(definition.visualParts).toEqual([
      expect.objectContaining({
        kind: "asset",
        subjectAssetRef: KART_CONTROL_LAB_SUBJECT_ASSET_REF,
      }),
    ]);
    expect(definition.colliderPolicy).toEqual({
      kind: "profile",
      colliderProfileRef: KART_CONTROL_LAB_COLLIDER_PROFILE_REF,
    });
    expect(definition.profiles).toMatchObject({
      locomotionProfileRef: KART_CONTROL_LAB_LOCOMOTION_PROFILE_REF,
      controlFeelProfileRef: KART_CONTROL_LAB_CONTROL_FEEL_PROFILE_REF,
      motion: {
        defaultMotionProfileRef:
          "worldkit://motion-profile/wheeled-arcade.medium@1",
      },
      controlProfileRef:
        "worldkit://control-profile/throttle-steer.subject-local@1",
    });
    expect(feel.wheeledArcade).toMatchObject({
      maximumForwardSpeedMetersPerSecond: 25,
      maximumReverseSpeedMetersPerSecond: 12.1875,
      accelerationMetersPerSecondSquared: 8,
      coastDecelerationMetersPerSecondSquared: 5,
      lateralGripPerSecond: 10,
      speedTurnRadiusMetersCurve: [[0, 2.3], [10, 8.625], [25, 17.25], [45, 34.5]],
    });
  });
});
