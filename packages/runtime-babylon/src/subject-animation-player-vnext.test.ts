import { Animation } from "@babylonjs/core/Animations/animation.js";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import type {
  ActiveLocomotionCapabilityStateV2,
  GameplayActionStateV1,
} from "@whitebox-world/gameplay-contracts";
import type { RuntimeAnimationSetV1 } from "@whitebox-world/runtime-contracts";
import {
  createActionPresentationRegistryV1,
  hashActionPresentationBindingV1,
  resolveActionPresentationV1,
  type ActionPresentationBindingBodyV1,
  type ActionPresentationResolveInputV1,
} from "@whitebox-world/subject-actions";
import { describe, expect, it, vi } from "vitest";

import { SubjectAnimationPlayer } from "./subject-animation-player.js";

function sceneFixture(): { engine: NullEngine; scene: Scene; root: TransformNode } {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
    deterministicLockstep: true,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
  return { engine, scene, root: new TransformNode("subject-authority-root", scene) };
}

function clipGroup(
  scene: Scene,
  name: string,
  target: object = new TransformNode(`${name}.bone`, scene),
  targetProperty = "rotation.x",
  framesPerSecond = 60,
  from = 0,
  to = 60,
): AnimationGroup {
  const group = new AnimationGroup(name, scene);
  const animation = new Animation(
    `${name}.animation`,
    targetProperty,
    framesPerSecond,
    Animation.ANIMATIONTYPE_FLOAT,
    Animation.ANIMATIONLOOPMODE_CYCLE,
  );
  animation.setKeys([{ frame: from, value: 0 }, { frame: to, value: 1 }]);
  group.addTargetedAnimation(animation, target);
  return group;
}

function authorityPoseBytes(root: TransformNode): Uint8Array {
  const quaternion = root.rotationQuaternion ?? Quaternion.Identity();
  return new Uint8Array(new Float64Array([
    root.position.x, root.position.y, root.position.z,
    root.rotation.x, root.rotation.y, root.rotation.z,
    quaternion.x, quaternion.y, quaternion.z, quaternion.w,
    root.scaling.x, root.scaling.y, root.scaling.z,
  ]).buffer).slice();
}

function ownedTargets(groups: readonly AnimationGroup[]): ReadonlySet<object> {
  return new Set(groups.flatMap((group) =>
    group.targetedAnimations.map((targeted) => targeted.target as object)
  ));
}

const animationSet: RuntimeAnimationSetV1 = {
  animationSetRef: "worldkit://animation-set/test@1",
  subjectAssetRef: "worldkit://subject-asset/test@1",
  rigProfileRef: "worldkit://rig-profile/test@1",
  defaultActionId: "idle",
  requiredActionIds: ["idle", "walk", "run", "jump"],
  animationBindings: [
    {
      actionId: "idle", sourceClipName: "Idle", loopMode: "repeat",
      semanticFamily: "ground",
      automaticPresentationKeys: ["locomotion.suspended", "locomotion.idle"],
      playbackSpeedRatio: 1, blendDurationSeconds: 0, rootMotionMode: "in-place",
    },
    {
      actionId: "walk", sourceClipName: "Walk", loopMode: "repeat",
      semanticFamily: "ground", automaticPresentationKeys: ["locomotion.walk"],
      playbackSpeedRatio: 1, blendDurationSeconds: 0.1, rootMotionMode: "in-place",
    },
    {
      actionId: "run", sourceClipName: "Run", loopMode: "repeat",
      semanticFamily: "ground", automaticPresentationKeys: ["locomotion.run"],
      playbackSpeedRatio: 1, blendDurationSeconds: 0.1, rootMotionMode: "in-place",
    },
    {
      actionId: "jump", sourceClipName: "Jump", loopMode: "once",
      semanticFamily: "airborne",
      automaticPresentationKeys: [
        "locomotion.takeoff", "locomotion.rising", "locomotion.apex",
        "locomotion.falling", "locomotion.landing",
      ],
      playbackSpeedRatio: 1, blendDurationSeconds: 0.1, rootMotionMode: "in-place",
    },
  ],
};

const gBotLikeAnimationSet: RuntimeAnimationSetV1 = {
  ...animationSet,
  requiredActionIds: [
    ...animationSet.requiredActionIds,
    "fall",
    "land.hard",
  ],
  animationBindings: [
    ...animationSet.animationBindings.map((binding) => binding.actionId === "jump"
      ? {
          ...binding,
          automaticPresentationKeys: [
            "locomotion.takeoff",
            "locomotion.rising",
            "locomotion.apex",
          ] as const,
        }
      : binding),
    {
      actionId: "fall", sourceClipName: "Fall", loopMode: "repeat",
      semanticFamily: "airborne", automaticPresentationKeys: ["locomotion.falling"],
      playbackSpeedRatio: 1, blendDurationSeconds: 0.12, rootMotionMode: "in-place",
    },
    {
      actionId: "land.hard", sourceClipName: "LandHard", loopMode: "once",
      semanticFamily: "airborne", automaticPresentationKeys: ["locomotion.landing"],
      playbackSpeedRatio: 1, blendDurationSeconds: 0.08, rootMotionMode: "in-place",
    },
  ],
};

function locomotion(
  tick: number,
  overrides: Partial<ActiveLocomotionCapabilityStateV2> = {},
): ActiveLocomotionCapabilityStateV2 {
  return {
    schemaVersion: 2,
    status: "active",
    mobilityMode: "grounded",
    gait: "idle",
    verticalPhase: "none",
    supportMode: "supported",
    movementMedium: "ground",
    facingYawRadians: 0,
    linearVelocity: { x: 0, y: 0, z: 0 },
    horizontalSpeedMetersPerSecond: 0,
    committedTick: tick,
    phaseEnteredTick: 0,
    transitionSequence: 0,
    ...overrides,
  };
}

function committed(
  tick: number,
  state = locomotion(tick),
): ActionPresentationResolveInputV1 {
  return {
    schemaVersion: 1,
    committedTick: tick,
    fixedDeltaSeconds: 1 / 60,
    locomotion: state,
  };
}

const emptyRegistry = createActionPresentationRegistryV1({
  schemaVersion: 1,
  bindings: [],
  rootMotionSources: [],
});

describe("SubjectAnimationPlayer committed presentation", () => {
  it("selects a Clip only from committed gait/verticalPhase, not contradictory velocity", () => {
    const { engine, scene, root } = sceneFixture();
    const groups = ["Idle", "Walk", "Run", "Jump"].map((name) => clipGroup(scene, name));
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: animationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    });

    player.step(resolveActionPresentationV1(committed(4, locomotion(4, {
      mobilityMode: "airborne",
      gait: "none",
      verticalPhase: "rising",
      supportMode: "unsupported",
      movementMedium: "air",
      linearVelocity: { x: 0, y: -50, z: 0 },
      phaseEnteredTick: 4,
    })), emptyRegistry));
    player.applyPose();

    expect(player.activePresentationKey).toBe("locomotion.rising");
    expect(player.debugTelemetry()).toMatchObject({
      schemaVersion: 1,
      committedTick: 4,
      presentationKey: "locomotion.rising",
      sourceClipName: "Jump",
    });
    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("projects G Bot airborne phases onto jump, fall, and landing Clips from committed phase entry", () => {
    const { engine, scene, root } = sceneFixture();
    const groups = ["Idle", "Walk", "Run", "Jump", "Fall", "LandHard"].map(
      (name) => clipGroup(scene, name),
    );
    const fallGoToFrame = vi.spyOn(groups[4]!, "goToFrame");
    const landingGoToFrame = vi.spyOn(groups[5]!, "goToFrame");
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet: gBotLikeAnimationSet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: gBotLikeAnimationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    });
    const airborne = (
      tick: number,
      verticalPhase: "takeoff" | "rising" | "apex" | "falling",
    ) => locomotion(tick, {
      mobilityMode: "airborne",
      gait: "none",
      verticalPhase,
      supportMode: "unsupported",
      movementMedium: "air",
      linearVelocity: {
        x: 0,
        y: verticalPhase === "falling" ? -2 : 2,
        z: 0,
      },
      phaseEnteredTick: tick,
    });

    for (const [tick, phase, clip] of [
      [1, "takeoff", "Jump"],
      [2, "rising", "Jump"],
      [3, "apex", "Jump"],
      [10, "falling", "Fall"],
    ] as const) {
      player.step(resolveActionPresentationV1(
        committed(tick, airborne(tick, phase)),
        emptyRegistry,
      ));
      player.applyPose();
      expect(player.debugTelemetry()).toMatchObject({
        committedTick: tick,
        presentationKey: `locomotion.${phase}`,
        sourceClipName: clip,
      });
    }
    expect(fallGoToFrame).toHaveBeenLastCalledWith(0, true);

    player.step(resolveActionPresentationV1(
      committed(17, airborne(17, "falling")),
      emptyRegistry,
    ));
    player.applyPose();
    expect(groups[4]!.animatables[0]?.weight).toBe(1);

    player.step(resolveActionPresentationV1(
      committed(18, locomotion(18, {
        verticalPhase: "landing",
        phaseEnteredTick: 18,
      })),
      emptyRegistry,
    ));
    player.applyPose();
    expect(player.debugTelemetry()).toMatchObject({
      presentationKey: "locomotion.landing",
      sourceClipName: "LandHard",
      normalizedTime: 0,
      blendWeight: 0,
      isTransitioning: true,
    });
    expect(landingGoToFrame).toHaveBeenLastCalledWith(0, true);
    expect(groups[4]!.animatables[0]?.weight).toBe(1);
    expect(groups[5]!.animatables[0]?.weight).toBe(0);

    player.step(resolveActionPresentationV1(
      committed(20, locomotion(20, {
        verticalPhase: "landing",
        phaseEnteredTick: 18,
      })),
      emptyRegistry,
    ));
    player.applyPose();
    expect(groups[4]!.animatables[0]?.weight).toBeCloseTo(0.6, 10);
    expect(groups[5]!.animatables[0]?.weight).toBeCloseTo(0.4, 10);

    player.step(resolveActionPresentationV1(
      committed(23, locomotion(23, {
        verticalPhase: "landing",
        phaseEnteredTick: 18,
      })),
      emptyRegistry,
    ));
    player.applyPose();
    expect(groups[5]!.animatables[0]?.weight).toBe(1);
    expect(player.debugTelemetry().isTransitioning).toBe(false);

    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("preserves the blended airborne pose when falling and landing interrupt in-flight transitions", () => {
    const { engine, scene, root } = sceneFixture();
    const groups = ["Idle", "Walk", "Run", "Jump", "Fall", "LandHard"].map(
      (name) => clipGroup(scene, name),
    );
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet: gBotLikeAnimationSet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: gBotLikeAnimationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    });
    const airborne = (
      tick: number,
      verticalPhase: "rising" | "falling",
      phaseEnteredTick: number,
    ) => locomotion(tick, {
      mobilityMode: "airborne",
      gait: "none",
      verticalPhase,
      supportMode: "unsupported",
      movementMedium: "air",
      linearVelocity: { x: 0, y: verticalPhase === "falling" ? -2 : 2, z: 0 },
      phaseEnteredTick,
    });
    const weights = (): readonly number[] => groups.map(
      (group) => group.animatables[0]?.weight ?? 0,
    );

    player.step(resolveActionPresentationV1(
      committed(1, airborne(1, "rising", 1)),
      emptyRegistry,
    ));
    player.applyPose();
    expect(weights()).toEqual([1, 0, 0, 0, 0, 0]);

    player.step(resolveActionPresentationV1(
      committed(2, airborne(2, "falling", 2)),
      emptyRegistry,
    ));
    player.applyPose();
    const fallingEntry = weights();
    expect(fallingEntry.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 10);
    expect(fallingEntry[0]).toBeGreaterThan(0.5);
    expect(fallingEntry[3]).toBeGreaterThan(0);
    expect(fallingEntry[3]).toBeLessThan(0.5);
    expect(fallingEntry[4]).toBe(0);

    player.step(resolveActionPresentationV1(
      committed(3, locomotion(3, {
        verticalPhase: "landing",
        phaseEnteredTick: 3,
      })),
      emptyRegistry,
    ));
    player.applyPose();
    const landingEntry = weights();
    expect(landingEntry.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 10);
    expect(landingEntry[0]).toBeGreaterThan(0);
    expect(landingEntry[3]).toBeGreaterThan(0);
    expect(landingEntry[4]).toBeGreaterThan(0);
    expect(landingEntry[5]).toBe(0);

    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("falls back to the jump Clip for falling and landing when no phase Clips exist", () => {
    const { engine, scene, root } = sceneFixture();
    const groups = ["Idle", "Walk", "Run", "Jump"].map((name) =>
      clipGroup(scene, name)
    );
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: animationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    });

    for (const [tick, verticalPhase] of [
      [1, "falling"],
      [2, "landing"],
    ] as const) {
      player.step(resolveActionPresentationV1(
        committed(tick, locomotion(tick, {
          mobilityMode: verticalPhase === "falling" ? "airborne" : "grounded",
          gait: verticalPhase === "falling" ? "none" : "idle",
          verticalPhase,
          supportMode: verticalPhase === "falling" ? "unsupported" : "supported",
          movementMedium: verticalPhase === "falling" ? "air" : "ground",
          linearVelocity: { x: 0, y: verticalPhase === "falling" ? -2 : 0, z: 0 },
          phaseEnteredTick: tick,
        })),
        emptyRegistry,
      ));
      player.applyPose();
      expect(player.debugTelemetry()).toMatchObject({
        presentationKey: `locomotion.${verticalPhase}`,
        sourceClipName: "Jump",
      });
    }

    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it.each([
    ["node", (root: TransformNode) => root, "rotation.x"],
    ["position", (root: TransformNode) => root.position, "x"],
    ["rotation", (root: TransformNode) => root.rotation, "x"],
    ["rotationQuaternion", (root: TransformNode) => root.rotationQuaternion!, "x"],
    ["scaling", (root: TransformNode) => root.scaling, "x"],
    ["absolutePosition", (root: TransformNode) => root.absolutePosition, "x"],
    ["absoluteScaling", (root: TransformNode) => root.absoluteScaling, "x"],
    ["absoluteRotationQuaternion", (root: TransformNode) =>
      root.absoluteRotationQuaternion, "x"],
  ] as const)("rejects a mapped Clip targeting the authority %s alias", (
    _label,
    target,
    property,
  ) => {
    const { engine, scene, root } = sceneFixture();
    root.rotationQuaternion = Quaternion.FromEulerAngles(0.1, 0.2, 0.3);
    root.computeWorldMatrix(true);
    const groups = [
      clipGroup(scene, "Idle", target(root), property),
      clipGroup(scene, "Walk"),
      clipGroup(scene, "Run"),
      clipGroup(scene, "Jump"),
    ];

    expect(() => new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: animationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    })).toThrow("SUBJECT_ASSET_ANIMATION_INCOMPATIBLE");
    scene.dispose();
    engine.dispose();
  });

  it("uses a hash-locked semantic Action binding and exposes Clip state as debug telemetry only", () => {
    const body = {
      kind: "action-presentation-binding",
      schemaVersion: 1,
      resourceRef: "worldkit://action-presentation/wave@1",
      presentationKey: "action.wave",
      semanticActionRef: "worldkit://semantic-action/wave@1",
      semanticActionHash: `sha256:${"1".repeat(64)}`,
      isInterruptible: true,
      clip: {
        sourceClipName: "Wave",
        loopMode: "once",
        playbackSpeedRatio: 1,
        blendDurationTicks: 2,
      },
      rootMotion: { mode: "none" },
    } as const satisfies ActionPresentationBindingBodyV1;
    const registry = createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [{ ...body, contentHash: hashActionPresentationBindingV1(body) }],
      rootMotionSources: [],
    });
    const { engine, scene, root } = sceneFixture();
    const groups = ["Idle", "Walk", "Run", "Jump", "Wave"].map((name) =>
      clipGroup(scene, name)
    );
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet,
      actionPresentationRegistry: registry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: animationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    });

    const committedAction = {
      id: "wave-1",
      kind: "action-state",
      semanticActionRef: body.semanticActionRef,
      semanticActionHash: body.semanticActionHash,
      actorEntityId: "player",
      mode: "active",
      startedSimulationTick: 12,
      lastTransitionSimulationTick: 12,
    } as const satisfies GameplayActionStateV1;
    player.step(resolveActionPresentationV1({
      ...committed(12),
      activeActionState: committedAction,
    }, registry), committedAction);
    const sameTickPresentation = resolveActionPresentationV1({
      ...committed(12),
      activeActionState: committedAction,
    }, registry);
    expect(() => player.step(
      structuredClone(sameTickPresentation),
      structuredClone(committedAction),
    )).not.toThrow();
    expect(() => player.step(sameTickPresentation, {
      ...committedAction,
      mode: "completing",
    })).toThrow("SUBJECT_ASSET_ANIMATION_INCOMPATIBLE");
    player.applyPose();

    expect(player.activePresentationKey).toBe("action.wave");
    expect(player.debugTelemetry()).toMatchObject({
      presentationKey: "action.wave",
      sourceClipName: "Wave",
      actionExecutionId: "wave-1",
    });
    expect(player.debugTelemetry()).not.toHaveProperty("locomotion");
    const forged = resolveActionPresentationV1({
      ...committed(13),
      activeActionState: {
        id: "wave-1",
        kind: "action-state",
        semanticActionRef: body.semanticActionRef,
        semanticActionHash: body.semanticActionHash,
        actorEntityId: "player",
        mode: "active",
        startedSimulationTick: 12,
        lastTransitionSimulationTick: 13,
      },
    }, registry);
    if (forged.source !== "action") throw new Error("expected Action presentation");
    expect(() => player.step({
      ...forged,
      actionBindingRef: "worldkit://action-presentation/not-wave@1",
    }, {
      ...committedAction,
      lastTransitionSimulationTick: 13,
    })).toThrow("3C_LAYERED_MOVE_SOURCE_UNRESOLVED");
    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it.each(["forwarding Proxy", "forwarding accessor"] as const)(
    "rejects a non-owned %s target before it can mutate authority",
    (kind) => {
      const { engine, scene, root } = sceneFixture();
      root.position.set(7, 8, 9);
      const beforePose = authorityPoseBytes(root);
      const forwardingTarget = kind === "forwarding Proxy"
        ? new Proxy(root.position, {})
        : Object.defineProperty({}, "x", {
            enumerable: true,
            get: () => root.position.x,
            set: (value: number) => { root.position.x = value; },
          });
      const groups = [
        clipGroup(scene, "Idle", forwardingTarget, "x"),
        clipGroup(scene, "Walk"),
        clipGroup(scene, "Run"),
        clipGroup(scene, "Jump"),
      ];
      const admittedTargets = ownedTargets(groups.slice(1));
      let player: SubjectAnimationPlayer | undefined;
      let failure: unknown;
      try {
        player = new SubjectAnimationPlayer({
          animationGroups: groups,
          animationSet,
          actionPresentationRegistry: emptyRegistry,
          authorityTransformNode: root,
          ownedVisualAnimationTargets: admittedTargets,
          subjectAssetRef: animationSet.subjectAssetRef,
          artifactContentHash: `sha256:${"a".repeat(64)}`,
        });
      } catch (error) {
        failure = error;
      }
      player?.dispose();

      expect(failure).toMatchObject({
        code: "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE",
      });
      expect(authorityPoseBytes(root)).toEqual(beforePose);
      scene.dispose();
      engine.dispose();
    },
  );

  it("does not mutate the authoritative Subject Transform while sampling presentation", () => {
    const { engine, scene, root } = sceneFixture();
    root.position.set(3, 4, 5);
    root.rotation.set(0.1, 0.2, 0.3);
    root.rotationQuaternion = Quaternion.FromEulerAngles(0.4, 0.5, 0.6);
    root.scaling.set(1.25, 0.75, 1.5);
    const beforePose = authorityPoseBytes(root);
    const groups = ["Idle", "Walk", "Run", "Jump"].map((name) => clipGroup(scene, name));
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: animationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    });

    player.step(resolveActionPresentationV1(
      committed(30, locomotion(30, { gait: "run" })),
      emptyRegistry,
    ));
    player.applyPose();
    expect(authorityPoseBytes(root)).toEqual(beforePose);

    player.step(resolveActionPresentationV1(
      committed(31, locomotion(31, { gait: "walk" })),
      emptyRegistry,
    ));
    player.applyPose();
    expect(authorityPoseBytes(root)).toEqual(beforePose);
    player.step(resolveActionPresentationV1(
      committed(40, locomotion(40, { gait: "walk" })),
      emptyRegistry,
    ));
    player.applyPose();
    expect(authorityPoseBytes(root)).toEqual(beforePose);
    player.reset();
    expect(authorityPoseBytes(root)).toEqual(beforePose);
    player.dispose();
    expect(authorityPoseBytes(root)).toEqual(beforePose);
    scene.dispose();
    engine.dispose();
  });

  it("changes vertical semantics without blending a Clip against itself", () => {
    const { engine, scene, root } = sceneFixture();
    const groups = ["Idle", "Walk", "Run", "Jump"].map((name) => clipGroup(scene, name));
    const jump = groups[3]!;
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: animationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    });
    const airborne = (tick: number, verticalPhase: "rising" | "apex") =>
      locomotion(tick, {
        mobilityMode: "airborne",
        gait: "none",
        verticalPhase,
        supportMode: "unsupported",
        movementMedium: "air",
        phaseEnteredTick: tick,
      });

    player.step(resolveActionPresentationV1(committed(4, airborne(4, "rising")), emptyRegistry));
    player.applyPose();
    player.step(resolveActionPresentationV1(committed(5, airborne(5, "apex")), emptyRegistry));
    player.applyPose();

    expect(player.activePresentationKey).toBe("locomotion.apex");
    expect(jump.animatables[0]?.weight).toBeGreaterThan(0);
    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("rejects Tick rewind/conflict, admits identical replay, and resets the projection epoch", () => {
    const { engine, scene, root } = sceneFixture();
    const groups = ["Idle", "Walk", "Run", "Jump"].map((name) => clipGroup(scene, name));
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: animationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    });
    const tick10Walk = resolveActionPresentationV1(
      committed(10, locomotion(10, { gait: "walk" })),
      emptyRegistry,
    );

    player.step(tick10Walk);
    expect(() => player.step(structuredClone(tick10Walk))).not.toThrow();
    expect(() => player.step(resolveActionPresentationV1(
      committed(9, locomotion(9)),
      emptyRegistry,
    ))).toThrow("SUBJECT_ASSET_ANIMATION_INCOMPATIBLE");
    expect(() => player.step(resolveActionPresentationV1(
      committed(10, locomotion(10, { gait: "run" })),
      emptyRegistry,
    ))).toThrow("SUBJECT_ASSET_ANIMATION_INCOMPATIBLE");
    expect(player.debugTelemetry()).toMatchObject({
      committedTick: 10,
      presentationKey: "locomotion.walk",
    });

    player.reset();
    expect(() => player.step(resolveActionPresentationV1(
      committed(1, locomotion(1, { gait: "run" })),
      emptyRegistry,
    ))).not.toThrow();
    expect(player.debugTelemetry()).toMatchObject({
      committedTick: 1,
      presentationKey: "locomotion.run",
    });
    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("never self-blends a shared physical group and restarts only a new Action execution", () => {
    const firstBody = {
      kind: "action-presentation-binding",
      schemaVersion: 1,
      resourceRef: "worldkit://action-presentation/walk-action@1",
      presentationKey: "action.walk-action",
      semanticActionRef: "worldkit://semantic-action/walk-action@1",
      semanticActionHash: `sha256:${"4".repeat(64)}`,
      isInterruptible: true,
      clip: {
        sourceClipName: "Walk",
        loopMode: "repeat",
        playbackSpeedRatio: 1,
        blendDurationTicks: 6,
      },
      rootMotion: { mode: "none" },
    } as const satisfies ActionPresentationBindingBodyV1;
    const secondBody = {
      ...firstBody,
      resourceRef: "worldkit://action-presentation/walk-action-alt@1",
      presentationKey: "action.walk-action-alt",
      semanticActionRef: "worldkit://semantic-action/walk-action-alt@1",
      semanticActionHash: `sha256:${"5".repeat(64)}`,
    } as const satisfies ActionPresentationBindingBodyV1;
    const registry = createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [firstBody, secondBody].map((body) => ({
        ...body,
        contentHash: hashActionPresentationBindingV1(body),
      })),
      rootMotionSources: [],
    });
    const { engine, scene, root } = sceneFixture();
    const groups = ["Idle", "Walk", "Run", "Jump"].map((name) => clipGroup(scene, name));
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet,
      actionPresentationRegistry: registry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: animationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    });
    const actionProjection = (
      tick: number,
      executionId: string,
      body: typeof firstBody | typeof secondBody,
      startedTick: number,
    ) => {
      const committedAction = {
        id: executionId,
        kind: "action-state",
        semanticActionRef: body.semanticActionRef,
        semanticActionHash: body.semanticActionHash,
        actorEntityId: "player",
        mode: "active",
        startedSimulationTick: startedTick,
        lastTransitionSimulationTick: tick,
      } as const satisfies GameplayActionStateV1;
      return {
        committedAction,
        presentation: resolveActionPresentationV1({
          ...committed(tick),
          activeActionState: committedAction,
        }, registry),
      };
    };

    player.step(resolveActionPresentationV1(
      committed(1, locomotion(1, { gait: "walk" })),
      registry,
    ));
    player.applyPose();
    player.step(resolveActionPresentationV1(
      committed(7, locomotion(7, { gait: "walk" })),
      registry,
    ));
    player.applyPose();
    const firstAction = actionProjection(8, "walk-action-1", firstBody, 8);
    player.step(firstAction.presentation, firstAction.committedAction);
    player.applyPose();
    expect(groups[1]!.animatables[0]?.weight).toBe(1);
    expect(player.debugTelemetry()).toMatchObject({
      presentationKey: "action.walk-action",
      normalizedTime: 0,
      isTransitioning: false,
    });

    const illegalDrift = actionProjection(9, "walk-action-1", secondBody, 8);
    expect(() => player.step(
      illegalDrift.presentation,
      illegalDrift.committedAction,
    )).toThrow("SUBJECT_ASSET_ANIMATION_INCOMPATIBLE");
    const secondAction = actionProjection(9, "walk-action-2", secondBody, 9);
    player.step(secondAction.presentation, secondAction.committedAction);
    player.applyPose();
    expect(groups[1]!.animatables[0]?.weight).toBe(1);
    expect(player.debugTelemetry()).toMatchObject({
      presentationKey: "action.walk-action-alt",
      normalizedTime: 0,
      isTransitioning: false,
    });

    player.step(resolveActionPresentationV1(
      committed(10, locomotion(10, { gait: "walk" })),
      registry,
    ));
    player.applyPose();
    expect(groups[1]!.animatables[0]?.weight).toBe(1);
    expect(player.debugTelemetry().presentationKey).toBe("locomotion.walk");
    expect(player.debugTelemetry().normalizedTime).toBeGreaterThan(0);
    expect(player.debugTelemetry().isTransitioning).toBe(false);

    const reusedAfterAbsence = actionProjection(11, "walk-action-2", firstBody, 11);
    player.step(reusedAfterAbsence.presentation, reusedAfterAbsence.committedAction);
    expect(player.activePresentationKey).toBe("action.walk-action");
    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("bounds repeat, once, transition, and maximum-safe elapsed Tick arithmetic", () => {
    const maximumElapsedTick = 2_147_483_647;
    const { engine, scene, root } = sceneFixture();
    const groups = [
      clipGroup(scene, "Idle", undefined, "rotation.x", 480, 0, 60),
      clipGroup(scene, "Walk", undefined, "rotation.x", 480),
      clipGroup(scene, "Run", undefined, "rotation.x", 480),
      clipGroup(scene, "Jump", undefined, "rotation.x", 480, 0, 60),
    ];
    const maximumPlaybackAnimationSet: RuntimeAnimationSetV1 = {
      ...animationSet,
      animationBindings: animationSet.animationBindings.map((binding) => ({
        ...binding,
        playbackSpeedRatio: 16,
      })),
    };
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet: maximumPlaybackAnimationSet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: animationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    });

    player.step(resolveActionPresentationV1(
      committed(maximumElapsedTick),
      emptyRegistry,
    ));
    player.applyPose();
    expect(player.debugTelemetry().normalizedTime).toBeCloseTo(56 / 60, 12);

    for (const excessiveTick of [maximumElapsedTick + 1, Number.MAX_SAFE_INTEGER]) {
      player.reset();
      const goToFrame = vi.spyOn(groups[0]!, "goToFrame");
      goToFrame.mockClear();
      player.step(resolveActionPresentationV1(
        committed(excessiveTick),
        emptyRegistry,
      ));
      expect(() => player.applyPose()).toThrow("SUBJECT_ASSET_ANIMATION_INCOMPATIBLE");
      expect(goToFrame).not.toHaveBeenCalled();
      goToFrame.mockRestore();
    }

    player.reset();
    player.step(resolveActionPresentationV1(
      committed(0, locomotion(0, {
        mobilityMode: "airborne",
        gait: "none",
        verticalPhase: "rising",
        supportMode: "unsupported",
        movementMedium: "air",
      })),
      emptyRegistry,
    ));
    player.step(resolveActionPresentationV1(
      committed(maximumElapsedTick, locomotion(maximumElapsedTick, {
        mobilityMode: "airborne",
        gait: "none",
        verticalPhase: "rising",
        supportMode: "unsupported",
        movementMedium: "air",
      })),
      emptyRegistry,
    ));
    player.applyPose();
    expect(player.debugTelemetry().normalizedTime).toBe(1);

    player.reset();
    player.step(resolveActionPresentationV1(
      committed(1, locomotion(1, { gait: "walk" })),
      emptyRegistry,
    ));
    player.step(resolveActionPresentationV1(
      committed(maximumElapsedTick + 2, locomotion(maximumElapsedTick + 2, {
        gait: "walk",
      })),
      emptyRegistry,
    ));
    expect(() => player.debugTelemetry()).toThrow(
      "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE",
    );
    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("stops each physical AnimationGroup exactly once during reset", () => {
    const { engine, scene, root } = sceneFixture();
    const groups = ["Idle", "Walk", "Run", "Jump"].map((name) => clipGroup(scene, name));
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: animationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    });
    const stops = groups.map((group) => vi.spyOn(group, "stop"));

    player.reset();

    for (const stop of stops) expect(stop).toHaveBeenCalledTimes(1);
    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("validates legacy contextual Clips without granting them presentation authority", () => {
    const contextualSet: RuntimeAnimationSetV1 = {
      ...animationSet,
      requiredActionIds: [...animationSet.requiredActionIds, "emote.salute"],
      animationBindings: [
        ...animationSet.animationBindings,
        {
          actionId: "emote.salute",
          sourceClipName: "Salute",
          semanticFamily: "emote",
          automaticPresentationKeys: [],
          loopMode: "once",
          playbackSpeedRatio: 1,
          blendDurationSeconds: 0.1,
          rootMotionMode: "in-place",
        },
      ],
    };
    const { engine, scene, root } = sceneFixture();
    const groups = ["Idle", "Walk", "Run", "Jump", "Salute"].map((name) =>
      clipGroup(scene, name)
    );
    const saluteStop = vi.spyOn(groups[4]!, "stop");
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet: contextualSet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: animationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    });

    const unregisteredAction = {
      id: "salute-1",
      kind: "action-state",
      semanticActionRef: "worldkit://semantic-action/emote-salute@1",
      semanticActionHash: `sha256:${"b".repeat(64)}`,
      actorEntityId: "player",
      mode: "starting",
      startedSimulationTick: 1,
      lastTransitionSimulationTick: 1,
    } as const satisfies GameplayActionStateV1;
    expect(() => player.step({
      schemaVersion: 1,
      committedTick: 1,
      source: "action",
      presentationKey: "action.emote-salute",
      actionExecutionId: "salute-1",
      actionBindingRef: "worldkit://action-presentation/emote-salute@1",
      actionBindingHash: `sha256:${"a".repeat(64)}`,
      layeredMoves: [],
    }, unregisteredAction)).toThrow("3C_LAYERED_MOVE_SOURCE_UNRESOLVED");

    player.dispose();
    expect(saluteStop).toHaveBeenCalledTimes(2);
    scene.dispose();
    engine.dispose();
  });

  it("rejects a water-family binding even when it claims an airborne presentation key", () => {
    const wrongFamilySet = {
      ...animationSet,
      animationBindings: animationSet.animationBindings.map((binding) => ({
        ...binding,
        semanticFamily: binding.actionId === "jump" ? "water" : "ground",
        automaticPresentationKeys: binding.actionId === "idle"
          ? ["locomotion.suspended", "locomotion.idle"]
          : binding.actionId === "walk"
            ? ["locomotion.walk"]
            : binding.actionId === "run"
              ? ["locomotion.run"]
              : ["locomotion.takeoff", "locomotion.rising", "locomotion.apex"],
      })),
    } as unknown as RuntimeAnimationSetV1;
    const { engine, scene, root } = sceneFixture();
    const groups = ["Idle", "Walk", "Run", "Jump"].map((name) =>
      clipGroup(scene, name)
    );

    expect(() => new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet: wrongFamilySet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: wrongFamilySet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    })).toThrow("SUBJECT_ASSET_ANIMATION_INCOMPATIBLE");

    scene.dispose();
    engine.dispose();
  });

  it.each([
    ["playback speed", {
      ...animationSet.animationBindings[1]!,
      playbackSpeedRatio: 16.000_001,
    }],
    ["blend duration", {
      ...animationSet.animationBindings[1]!,
      blendDurationSeconds: 10.1,
    }],
  ] as const)("rejects excessive legacy %s before starting Babylon groups", (
    _label,
    invalidBinding,
  ) => {
    const { engine, scene, root } = sceneFixture();
    const groups = ["Idle", "Walk", "Run", "Jump"].map((name) => clipGroup(scene, name));
    const walkStart = vi.spyOn(groups[1]!, "start");
    const invalidSet: RuntimeAnimationSetV1 = {
      ...animationSet,
      animationBindings: animationSet.animationBindings.map((binding) =>
        binding.actionId === "walk" ? invalidBinding : binding
      ),
    };

    expect(() => new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet: invalidSet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: animationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    })).toThrow("SUBJECT_ASSET_ANIMATION_INCOMPATIBLE");
    expect(walkStart).not.toHaveBeenCalled();
    scene.dispose();
    engine.dispose();
  });

  it.each([
    ["frames per second", Number.MAX_VALUE, 0, 60],
    ["frame span", 60, -Number.MAX_VALUE, Number.MAX_VALUE],
  ] as const)("rejects excessive %s before sending a non-finite frame to Babylon", (
    _label,
    framesPerSecond,
    from,
    to,
  ) => {
    const { engine, scene, root } = sceneFixture();
    const idle = clipGroup(
      scene,
      "Idle",
      new TransformNode("Idle.bone", scene),
      "rotation.x",
      framesPerSecond,
      from,
      to,
    );
    const goToFrame = vi.spyOn(idle, "goToFrame");
    const groups = [idle, ...["Walk", "Run", "Jump"].map((name) =>
      clipGroup(scene, name)
    )];

    expect(() => new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet,
      actionPresentationRegistry: emptyRegistry,
      authorityTransformNode: root,
      ownedVisualAnimationTargets: ownedTargets(groups),
      subjectAssetRef: animationSet.subjectAssetRef,
      artifactContentHash: `sha256:${"a".repeat(64)}`,
    })).toThrow("SUBJECT_ASSET_ANIMATION_INCOMPATIBLE");
    expect(goToFrame).not.toHaveBeenCalled();
    scene.dispose();
    engine.dispose();
  });
});
