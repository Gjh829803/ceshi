import { describe, expect, it } from "vitest";

import { builtInSubjectResourceRegistry } from "./index";
import type { RegistrySubjectDefinitionV3 } from "./types-v3";

const SUBJECT_DEFINITION_REFS = [
  "worldkit://subject-definition/animal.quadruped.forward-steer@1",
  "worldkit://subject-definition/glider.paraglider.unpowered@1",
  "worldkit://subject-definition/humanoid.g-bot@1",
  "worldkit://subject-definition/surface-craft.ice-skimmer@1",
  "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
  "worldkit://subject-definition/watercraft.kayak.surface@1",
] as const;

const G_BOT_CLIPS = [
  "idle",
  "idle.gaming",
  "walk",
  "walk.step",
  "run",
  "jump",
  "fall",
  "land.hard",
  "land.hard.alt",
  "fly",
  "float",
  "swim.surface",
  "swim.tread",
  "swim.exit",
  "sit",
  "sit.idle",
  "sit.ground.idle",
  "sit.toStand",
  "stand",
  "lay.idle",
  "roll.toRun",
  "fight.enter",
  "emote.salute",
  "emote.angry",
  "dance.rumba",
] as const;

function capabilityDefinitions(): readonly RegistrySubjectDefinitionV3[] {
  return builtInSubjectResourceRegistry
    .listCapabilitySubjectDefinitions()
    .filter(
      (definition): definition is RegistrySubjectDefinitionV3 =>
        "schemaVersion" in definition && definition.schemaVersion === 3,
    );
}

describe("capability-driven subject registry", () => {
  it("registers the six phase-one subject packages while keeping four CLI definitions", () => {
    expect(capabilityDefinitions().map((definition) => definition.resourceRef)).toEqual(
      SUBJECT_DEFINITION_REFS,
    );
    expect(builtInSubjectResourceRegistry.listSubjectDefinitions()).toHaveLength(4);
  });

  it("freezes ten kernel IDs and exposes only K01, K02, K03, K04, K06 and K08 as runtime implementations", () => {
    const kernels = builtInSubjectResourceRegistry
      .listCapabilityResources()
      .filter((resource) => resource.kind === "motion-kernel");

    expect(kernels).toHaveLength(10);
    expect(
      kernels
        .filter((kernel) => kernel.runtimeStatus === "implemented")
        .map((kernel) => kernel.id)
        .sort(),
    ).toEqual([
      "K01.free-ground",
      "K02.forward-steer",
      "K04.surface-slide",
      "K06.water-surface",
      "K08.unpowered-glide",
      "K03.wheeled-arcade",
    ].sort());
    expect(
      kernels
        .filter((kernel) => kernel.runtimeStatus === "reserved")
        .map((kernel) => kernel.id)
        .sort(),
    ).toEqual([
      "K05.hover",
      "K07.underwater",
      "K09.powered-flight",
      "K10.zero-gravity-six-dof",
    ].sort());
    expect(kernels.every((kernel) => kernel.deterministic)).toBe(true);
  });

  it("resolves every package to compatible motion, control, camera and H01-H09 harness resources", () => {
    for (const definition of capabilityDefinitions()) {
      const motionProfile = builtInSubjectResourceRegistry.resolveMotionProfile(
        definition.profiles.motion.defaultMotionProfileRef,
      );
      const fallbackProfile = builtInSubjectResourceRegistry.resolveMotionProfile(
        definition.profiles.motion.fallbackMotionProfileRef,
      );
      const kernel = builtInSubjectResourceRegistry.resolveMotionKernel(
        motionProfile!.motionKernelRef,
      );
      const control = builtInSubjectResourceRegistry.resolveControlProfile(
        definition.profiles.controlProfileRef,
      );
      const cameraContext = builtInSubjectResourceRegistry.resolveCameraContextProfile(
        definition.profiles.cameraContextProfileRef,
      );
      const harness = builtInSubjectResourceRegistry.resolveHarnessProfile(
        definition.profiles.harnessProfileRef,
      );

      expect(motionProfile).toBeDefined();
      expect(fallbackProfile).toBeDefined();
      expect(kernel).toMatchObject({
        runtimeStatus: "implemented",
        commandKind: control!.commandKind,
      });
      expect(cameraContext).toBeDefined();
      expect(
        cameraContext!.rules.every(
          (rule) =>
            (rule.cameraRigProfileRef === undefined ||
              builtInSubjectResourceRegistry.resolveCameraRigProfile(
                rule.cameraRigProfileRef,
              ) !== undefined) &&
            (rule.cameraModifierRefs ?? []).every(
              (resourceRef) =>
                builtInSubjectResourceRegistry.resolveCameraModifierProfile(
                  resourceRef,
                ) !== undefined,
            ),
        ),
      ).toBe(true);
      expect(harness?.requiredCheckIds).toEqual([
        "H01",
        "H02",
        "H03",
        "H04",
        "H05",
        "H06",
        "H07",
        "H08",
        "H09",
      ]);
    }
  });

  it("publishes relationship profiles as reserved until their runtime behavior exists", () => {
    expect([
      "worldkit://relationship-profile/mount.reserved@1",
      "worldkit://relationship-profile/seat.driver@1",
      "worldkit://relationship-profile/tether.standard@1",
    ].map((resourceRef) =>
      builtInSubjectResourceRegistry.resolveRelationshipProfile(resourceRef)?.runtimeStatus
    )).toEqual(["reserved", "reserved", "reserved"]);
  });

  it("locks the current 25-clip G Bot artifact and keeps runtime state binding explicitly unready", () => {
    const asset = builtInSubjectResourceRegistry.resolveSubjectAsset(
      "worldkit://subject-asset/actor.humanoid.g-bot@1",
    );
    const actionSet = builtInSubjectResourceRegistry.resolveAnimationSet(
      "worldkit://animation-set/humanoid.ground.g-bot@1",
    );

    expect(asset).toMatchObject({
      artifact: {
        byteLength: 5_302_160,
        contentHash:
          "sha256:41833210e735788da0777fc37badcec03f90ccf17ab5a7d89103f0727abeeb1b",
      },
      inventory: {
        meshCount: 2,
        vertexCount: 28_374,
        triangleCount: 49_112,
        skeletonCount: 1,
        boneCount: 65,
        animationClipCount: 25,
        animationClipNames: [...G_BOT_CLIPS].sort(),
      },
      runtimeReadiness: {
        productionReady: false,
        runtimeStateBinding: "not-implemented",
      },
    });
    expect(actionSet?.requiredActionIds).toEqual([...G_BOT_CLIPS].sort());
    expect(actionSet?.animationBindings.map((binding) => binding.sourceClipName).sort()).toEqual(
      [...G_BOT_CLIPS].sort(),
    );
  });

  it("separates hard safety limits, authoring ranges and runtime parameter support", () => {
    const vehicle = builtInSubjectResourceRegistry.resolveMotionProfile(
      "worldkit://motion-profile/wheeled-arcade.medium@1",
    );
    const vehicleKernel = builtInSubjectResourceRegistry.resolveMotionKernel(
      "worldkit://motion-kernel/wheeled-arcade@1",
    );
    expect(vehicle?.parameters).toMatchObject({
      lowSpeedTurnRateRadiansPerSecond: 1,
      highSpeedTurnRateRadiansPerSecond: 0.38,
      steeringResponsePerSecond: 3.5,
      steeringReturnPerSecond: 6,
      fullSteeringAuthoritySpeedMetersPerSecond: 2.5,
      turnRateSpeedCurveExponent: 1.35,
      dragPerSecond: 0.7,
    });
    expect(vehicle?.authoringRanges?.lowSpeedTurnRateRadiansPerSecond).toEqual({
      minimum: 0.2,
      maximum: 5,
      step: 0.01,
    });
    expect(vehicleKernel?.runtimeParameterNames).toEqual(
      expect.arrayContaining(Object.keys(vehicle?.authoringRanges ?? {})),
    );

    const slide = builtInSubjectResourceRegistry.resolveMotionProfile(
      "worldkit://motion-profile/surface-slide.skimmer@1",
    );
    const slideKernel = builtInSubjectResourceRegistry.resolveMotionKernel(
      "worldkit://motion-kernel/surface-slide@1",
    );
    expect(slide?.parameters.slopeGravityRatio).toBeDefined();
    expect(slideKernel?.runtimeParameterNames).toContain("slopeGravityRatio");
  });

  it("maps the seven reusable camera presets to explicit heading behavior", () => {
    const expectedHeadingSources = {
      "worldkit://camera-profile/first-person.standard@1": "target-forward",
      "worldkit://camera-profile/orbit.medium@1": "view",
      "worldkit://camera-profile/follow.medium@1": "target-forward",
      "worldkit://camera-profile/chase.surface-fast@1": "target-velocity",
      "worldkit://camera-profile/follow.water-surface@1": "target-forward",
      "worldkit://camera-profile/flight.glide@1": "target-velocity",
      "worldkit://camera-profile/follow.mounted@1": "target-forward",
    } as const;
    for (const [resourceRef, headingSource] of Object.entries(expectedHeadingSources)) {
      const profile = builtInSubjectResourceRegistry.resolveCameraRigProfile(resourceRef);
      expect(profile?.headingSource).toBe(headingSource);
      expect(profile?.authoringRanges?.transitionSeconds).toBeDefined();
      expect(profile?.authoringRanges?.maximumPositionLagMeters?.minimum).toBe(0);
    }
    expect(
      builtInSubjectResourceRegistry.resolveCameraRigProfile(
        "worldkit://camera-profile/orbit.medium@1",
      )?.parameters.lookAheadSeconds,
    ).toBe(0);
    expect(
      builtInSubjectResourceRegistry.resolveCameraRigProfile(
        "worldkit://camera-profile/chase.surface-fast@1",
      )?.reverseHeadingPolicy,
    ).toBe("preserve-target-forward");
    expect(
      builtInSubjectResourceRegistry.resolveMotionKernel(
        "worldkit://motion-kernel/unpowered-glide@1",
      )?.runtimeParameterNames,
    ).toEqual(expect.arrayContaining([
      "pitchRateRadiansPerSecond",
      "rollRateRadiansPerSecond",
    ]));
  });
});
