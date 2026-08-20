import { describe, expect, it } from "vitest";

import { builtInSubjectResourceRegistry } from "./index";
import type { RegistrySubjectDefinitionV3 } from "./types-v3";

const SUBJECT_DEFINITION_REFS = [
  "worldkit://subject-definition/animal.quadruped.forward-steer@1",
  "worldkit://subject-definition/glider.paraglider.unpowered@1",
  "worldkit://subject-definition/humanoid.g-bot.ground@1",
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
    .listAllSubjectDefinitions()
    .filter(
      (definition): definition is RegistrySubjectDefinitionV3 =>
        "schemaVersion" in definition && definition.schemaVersion === 3,
    );
}

describe("capability-driven subject registry", () => {
  it("registers the six phase-one subject packages without changing the legacy view", () => {
    expect(capabilityDefinitions().map((definition) => definition.resourceRef)).toEqual(
      SUBJECT_DEFINITION_REFS,
    );
    expect(builtInSubjectResourceRegistry.listSubjectDefinitions()).toHaveLength(3);
  });

  it("freezes ten kernel IDs and exposes only K01, K02, K03, K04, K06 and K08 as runtime implementations", () => {
    const kernels = builtInSubjectResourceRegistry
      .listAllResources()
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
            builtInSubjectResourceRegistry.resolveCameraRigProfile(
              rule.cameraRigProfileRef,
            ) !== undefined,
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

  it("locks the current 25-clip G Bot artifact and keeps runtime state binding explicitly unready", () => {
    const asset = builtInSubjectResourceRegistry.resolveSubjectAsset(
      "worldkit://subject-asset/actor.humanoid.g-bot@1",
    );
    const actionSet = builtInSubjectResourceRegistry.resolveAnimationSet(
      "worldkit://animation-set/humanoid.g-bot.all@1",
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
});
