import { describe, expect, it } from "vitest";

import {
  builtInSubjectDefaultRegistry,
  builtInSubjectResourceRegistry,
  createSubjectResourceRegistry,
  resolveSubjectPresetClosureV1,
  XIER120_SUBJECT_DEFINITIONS,
} from "./index";
import type {
  RegistrySubjectDefinitionV3,
  SubjectRegistryReferenceEdgeV1,
  SubjectRegistryResourceV3,
} from "./types-v3";

const SUBJECT_DEFINITION_REFS = [
  "worldkit://subject-definition/animal.quadruped.forward-steer@1",
  "worldkit://subject-definition/animal.quadruped.forward-steer@2",
  "worldkit://subject-definition/glider.paraglider.unpowered@1",
  "worldkit://subject-definition/humanoid.g-bot@2",
  "worldkit://subject-definition/humanoid.rigged-golden@2",
  "worldkit://subject-definition/humanoid.third-person@1",
  "worldkit://subject-definition/kart-control-lab.stk-kart@1",
  "worldkit://subject-definition/quadruped.ground-proxy@1",
  "worldkit://subject-definition/surface-craft.ice-skimmer@1",
  "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
  "worldkit://subject-definition/watercraft.kayak.surface@1",
  ...XIER120_SUBJECT_DEFINITIONS
    .map((definition) => definition.resourceRef)
    .sort((left, right) => left.localeCompare(right)),
] as const;

const PUBLIC_DEFAULT_REFS = [
  "worldkit://subject-definition/animal.quadruped.forward-steer@2",
  "worldkit://subject-definition/glider.paraglider.unpowered@1",
  "worldkit://subject-definition/humanoid.g-bot@2",
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

function publicReferenceValues(
  value: unknown,
  sourcePath = "",
): readonly { sourcePath: string; targetResourceRef: string }[] {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      publicReferenceValues(child, `${sourcePath}/${index}`)
    );
  }
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    if (key === "resourceRef" || key === "contentHash") return [];
    const childPath = `${sourcePath}/${key}`;
    if (
      key.endsWith("Ref") &&
      typeof child === "string" &&
      child.startsWith("worldkit://")
    ) {
      return [{ sourcePath: childPath, targetResourceRef: child }];
    }
    if (key.endsWith("Refs") && Array.isArray(child)) {
      return child.flatMap((targetResourceRef, index) =>
        typeof targetResourceRef === "string" &&
          targetResourceRef.startsWith("worldkit://")
          ? [{
              sourcePath: `${childPath}/${index}`,
              targetResourceRef,
            }]
          : []
      );
    }
    return publicReferenceValues(child, childPath);
  });
}

function capabilityDefinitions(): readonly RegistrySubjectDefinitionV3[] {
  return builtInSubjectResourceRegistry
    .listDiscoverableResources({ kind: "subject-definition" })
    .filter(
      (definition): definition is RegistrySubjectDefinitionV3 =>
        "schemaVersion" in definition && definition.schemaVersion === 3,
    );
}

describe("capability-driven subject registry", () => {
  it("exposes one frozen, sorted, identity-resolving discovery view", () => {
    const registry = builtInSubjectResourceRegistry;

    expect(typeof registry.resolveResource).toBe("function");
    expect(typeof registry.listDiscoverableResources).toBe("function");
    expect("listSubjectDefinitions" in registry).toBe(false);
    expect("listCapabilitySubjectDefinitions" in registry).toBe(false);
    expect("listResources" in registry).toBe(false);
    expect("listCapabilityResources" in registry).toBe(false);

    const resources = registry.listDiscoverableResources();
    const resourceRefs = resources.map((resource) => resource.resourceRef);
    expect(resourceRefs).toEqual([...resourceRefs].sort((left, right) =>
      left.localeCompare(right)
    ));
    expect(new Set(resourceRefs).size).toBe(resourceRefs.length);
    expect(Object.isFrozen(resources)).toBe(true);
    expect(resources.every(Object.isFrozen)).toBe(true);
    for (const resource of resources) {
      expect(registry.resolveResource(resource.resourceRef)).toBe(resource);
    }

    const controlFeelProfiles = registry.listDiscoverableResources({
      kind: "control-feel-profile",
    });
    expect(controlFeelProfiles.length).toBeGreaterThan(0);
    expect(controlFeelProfiles.every(
      (resource) => resource.kind === "control-feel-profile",
    )).toBe(true);
    expect(Object.isFrozen(controlFeelProfiles)).toBe(true);
  });

  it("enumerates every public Registry Ref and drives the exact dependency closure", () => {
    const listReferenceEdges = (
      resource: SubjectRegistryResourceV3,
    ): readonly SubjectRegistryReferenceEdgeV1[] =>
      builtInSubjectResourceRegistry.listReferenceEdges(resource);
    const resources = builtInSubjectResourceRegistry.listDiscoverableResources();
    for (const resource of resources) {
      const edges = listReferenceEdges(resource);
      for (const reference of publicReferenceValues(resource)) {
        expect(edges).toContainEqual(expect.objectContaining(reference));
      }
      for (const edge of edges) {
        expect(edge.sourceResourceRef).toBe(resource.resourceRef);
        const target = builtInSubjectResourceRegistry.resolveResource(
          edge.targetResourceRef,
        );
        expect(target).toBeDefined();
        expect(edge.expectedResourceKinds).toContain(target?.kind);
      }
    }

    const freeGroundKernel = builtInSubjectResourceRegistry.resolveMotionKernel(
      "worldkit://motion-kernel/free-ground@1",
    )!;
    expect(listReferenceEdges(freeGroundKernel)).toContainEqual(
      expect.objectContaining({
        sourcePath: "/fallbackMotionProfileRef",
        type: "back-reference",
      }),
    );
    const goldenRig = builtInSubjectResourceRegistry.resolveRigProfile(
      "worldkit://rig-profile/biped.golden@2",
    )!;
    expect(listReferenceEdges(goldenRig)).toContainEqual(
      expect.objectContaining({
        sourcePath: "/compatibleSubjectAssetRefs/0",
        type: "metadata",
      }),
    );

    const dependencyRefs = new Set<string>();
    const visit = (resourceRef: string): void => {
      if (dependencyRefs.has(resourceRef)) return;
      dependencyRefs.add(resourceRef);
      const resource = builtInSubjectResourceRegistry.resolveResource(resourceRef);
      expect(resource).toBeDefined();
      for (const edge of listReferenceEdges(resource!)) {
        if (edge.type === "dependency") visit(edge.targetResourceRef);
      }
    };
    const subjectDefinitionRef =
      "worldkit://subject-definition/vehicle.four-wheel.arcade@1";
    visit(subjectDefinitionRef);
    expect(resolveSubjectPresetClosureV1(
      builtInSubjectResourceRegistry,
      subjectDefinitionRef,
    ).entries.map((entry) => entry.resourceRef)).toEqual(
      [...dependencyRefs].sort((left, right) => left.localeCompare(right)),
    );
  });

  it("keeps immutable current Subject versions and exact public defaults", () => {
    expect(capabilityDefinitions().map((definition) => definition.resourceRef)).toEqual(
      SUBJECT_DEFINITION_REFS,
    );
    expect(
      builtInSubjectDefaultRegistry.listPublicDefaults()
        .map((entry) => entry.subjectDefinitionRef),
    ).toEqual(PUBLIC_DEFAULT_REFS);
    expect(builtInSubjectResourceRegistry.listDiscoverableResources({
      kind: "subject-definition",
    })).toHaveLength(
      11 + XIER120_SUBJECT_DEFINITIONS.length,
    );
  });

  it("discovers the primitive humanoid as one capability-driven V3 Definition", () => {
    const resourceRef = "worldkit://subject-definition/humanoid.third-person@1";
    const discoveryRows = builtInSubjectResourceRegistry
      .listDiscoverableResources({ kind: "subject-definition" })
      .filter((definition) => definition.resourceRef === resourceRef);
    const resolved = builtInSubjectResourceRegistry.resolveSubjectDefinition(resourceRef);

    expect(discoveryRows).toHaveLength(1);
    expect(discoveryRows[0]?.contentHash).toBe(resolved?.contentHash);
    expect(resolved).toMatchObject({
      schemaVersion: 3,
      actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
      colliderPolicy: {
        kind: "profile",
        colliderProfileRef: "worldkit://collider-profile/humanoid.medium-capsule@1",
      },
      capabilityRefs: ["worldkit://capability/locomotion.ground@1"],
      profiles: {
        physicsBodyProfileRef:
          "worldkit://physics-body-profile/character.capability-medium@1",
      },
      visualBinding: { mode: "static" },
    });
  });

  it("freezes ten kernel IDs and exposes powered flight as the seventh runtime implementation", () => {
    const kernels = builtInSubjectResourceRegistry
      .listDiscoverableResources({ kind: "motion-kernel" });

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
      "K09.powered-flight",
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

  it("keeps movement control deadzone on the control profile root", () => {
    const controls = builtInSubjectResourceRegistry
      .listDiscoverableResources({ kind: "control-profile" });

    expect(controls).toHaveLength(4);
    for (const control of controls) {
      expect(control.moveDeadzoneRatio).toBe(
        control.resourceRef ===
            "worldkit://control-profile/throttle-steer.subject-local@1"
          ? 0.05
          : 0.1,
      );
      expect(control).not.toHaveProperty("inputTuning");
      expect(control).not.toHaveProperty("responseExponent");
    }
    expect(builtInSubjectResourceRegistry.resolveControlProfile(
      "worldkit://control-profile/flight.camera-relative@1",
    )).toMatchObject({
      commandKind: "flight-attitude",
      inputSpace: "flight-frame",
      facingPolicy: "flight-derived",
    });
    expect(builtInSubjectResourceRegistry.resolveControlProfile(
      "worldkit://control-profile/throttle-steer.subject-local@1",
    )).toMatchObject({
      commandKind: "throttle-steer",
      inputSpace: "subject-local",
      facingPolicy: "steering-derived",
      lateralMovementPolicy: "forbidden",
    });
  });

  it("publishes one implemented mountedOn profile with role-qualified sockets", () => {
    const mountedOn = builtInSubjectResourceRegistry.resolveRelationshipProfile(
      "worldkit://relationship-profile/mounted-on.stand-ground@1",
    );

    expect(mountedOn).toMatchObject({
      relationshipType: "mountedOn",
      runtimeStatus: "implemented",
      requiredRiderSocketIds: ["FootAlignment"],
      requiredMountSocketIds: ["MountStand"],
      controlTransferMode: "to-mount",
      cameraTargetRole: "controlled-entity",
      maximumMountDistanceMeters: 2,
    });
    expect(mountedOn).not.toHaveProperty("requiredSourceSocketIds");
    expect(mountedOn).not.toHaveProperty("requiredTargetSocketIds");
    expect(
      builtInSubjectResourceRegistry.resolveRelationshipProfile(
        "worldkit://relationship-profile/mount.reserved@1",
      ),
    ).toBeUndefined();
  });

  it("keeps seat and tether reserved with their own role-qualified sockets", () => {
    const seat = builtInSubjectResourceRegistry.resolveRelationshipProfile(
      "worldkit://relationship-profile/seat.driver@1",
    );
    const tether = builtInSubjectResourceRegistry.resolveRelationshipProfile(
      "worldkit://relationship-profile/tether.standard@1",
    );

    expect(seat).toMatchObject({
      relationshipType: "seat",
      runtimeStatus: "reserved",
      requiredOccupantSocketIds: ["SeatAlignment"],
      requiredSeatSocketIds: ["DriverSeat"],
    });
    expect(tether).toMatchObject({
      relationshipType: "tether",
      runtimeStatus: "reserved",
      requiredTetheredSocketIds: ["TetherSource"],
      requiredTetherAnchorSocketIds: ["TetherTarget"],
    });
  });

  it("locks the current 25-clip G Bot artifact and reports partial committed state binding", () => {
    const asset = builtInSubjectResourceRegistry.resolveSubjectAsset(
      "worldkit://subject-asset/actor.humanoid.g-bot@2",
    );
    const actionSet = builtInSubjectResourceRegistry.resolveAnimationSet(
      "worldkit://animation-set/humanoid.ground.g-bot@2",
    );

    expect(asset).toMatchObject({
      artifact: {
        byteLength: 6_743_072,
        contentHash:
          "sha256:4bcf3fabdba1e083ef54bf172fd962ca740e0f2fabdb9cddaae45d5ea208718f",
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
        runtimeStateBinding: "partial",
      },
    });
    expect(actionSet?.requiredActionIds).toEqual([...G_BOT_CLIPS].sort());
    expect(actionSet?.animationBindings.map((binding) => binding.sourceClipName).sort()).toEqual(
      [...G_BOT_CLIPS].sort(),
    );
  });

  it("keeps motion profiles and kernels free of retired parameter schemas", () => {
    const vehicle = builtInSubjectResourceRegistry.resolveMotionProfile(
      "worldkit://motion-profile/wheeled-arcade.medium@1",
    );
    const vehicleKernel = builtInSubjectResourceRegistry.resolveMotionKernel(
      "worldkit://motion-kernel/wheeled-arcade@1",
    );
    expect(vehicle).toMatchObject({
      kind: "motion-profile",
      motionKernelRef: "worldkit://motion-kernel/wheeled-arcade@1",
      motionTags: ["arcade", "ground", "surface-fast", "wheeled"],
    });
    expect(vehicle).not.toHaveProperty("parameters");
    expect(vehicleKernel).not.toHaveProperty("parameterSchemaRef");
    expect(vehicleKernel).not.toHaveProperty("runtimeParameterNames");

    const feel = builtInSubjectResourceRegistry.resolveControlFeelProfile(
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
    );
    expect(feel?.accelerationMetersPerSecondSquared).toBe(16);
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
    expect(builtInSubjectResourceRegistry.resolveCameraContextProfile(
      "worldkit://camera-context/agent.over-shoulder@1",
    )?.rules[0]).toMatchObject({
      when: {},
      cameraModifierRefs: ["worldkit://camera-modifier/aim-framing@1"],
    });
    expect(builtInSubjectResourceRegistry.resolveCameraContextProfile(
      "worldkit://camera-context/agent.giant@1",
    )?.rules[0]).toMatchObject({
      cameraModifierRefs: ["worldkit://camera-modifier/giant-framing@1"],
    });
    expect(builtInSubjectResourceRegistry.resolveCameraContextProfile(
      "worldkit://camera-context/agent.first-person@1",
    )?.defaultCameraRigProfileRef).toBe(
      "worldkit://camera-profile/first-person.standard@1",
    );
  });

  it("rejects retired Motion Kernel fields at Catalog admission", () => {
    const kernel = builtInSubjectResourceRegistry.resolveMotionKernel(
      "worldkit://motion-kernel/free-ground@1",
    );
    expect(kernel).toBeDefined();
    const { contentHash: _contentHash, ...input } = structuredClone(kernel!);

    expect(() => createSubjectResourceRegistry([{
      ...input,
      parameterSchemaRef: "worldkit://motion-parameter-schema/free-ground@1",
      runtimeParameterNames: ["walkSpeedMetersPerSecond"],
    } as never])).toThrowError(/SUBJECT_REGISTRY_UNKNOWN_FIELD/);
  });
});
