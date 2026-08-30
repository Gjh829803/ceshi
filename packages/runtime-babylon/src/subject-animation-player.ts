import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";

import type { RuntimeAnimationSetV1 } from "@whitebox-world/runtime-contracts";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import type { GameplayActionStateV1 } from "@whitebox-world/gameplay-contracts";
import {
  AUTOMATIC_LOCOMOTION_PRESENTATION_KEYS_V1,
  type GroundHumanoidActionIdV1,
} from "@whitebox-world/subject-contracts";
import {
  ACTION_PRESENTATION_BLEND_DURATION_TICKS_MAX_V1,
  ACTION_PRESENTATION_PLAYBACK_SPEED_RATIO_MAX_V1,
  verifyResolvedActionPresentationV1,
  type ActionPresentationRegistryV1,
  type ResolvedActionPresentationV1,
  type SemanticPresentationKeyV1,
} from "@whitebox-world/subject-actions";

import { FIXED_TIME_STEP_SECONDS } from "./physics";
import { SubjectAssetRuntimeErrorV1 } from "./subject-asset-cache";

interface SubjectAnimationPlayerOptionsV1 {
  animationGroups: readonly AnimationGroup[];
  animationSet: RuntimeAnimationSetV1;
  actionPresentationRegistry: ActionPresentationRegistryV1;
  authorityTransformNode: TransformNode;
  ownedVisualAnimationTargets: ReadonlySet<object>;
  subjectAssetRef: string;
  artifactContentHash: string;
}

interface ValidatedPresentationAnimationV1 {
  presentationKey: SemanticPresentationKeyV1;
  group: AnimationGroup;
  sourceClipName: string;
  from: number;
  to: number;
  framesPerSecond: number;
  loopMode: "repeat" | "once";
  playbackSpeedRatio: number;
  blendDurationTicks: number;
}

interface ValidatedAnimationsV1 {
  byPresentationKey: ReadonlyMap<
    SemanticPresentationKeyV1,
    ValidatedPresentationAnimationV1
  >;
  ownedGroups: readonly AnimationGroup[];
}

interface ActiveAnimationV1 {
  animation: ValidatedPresentationAnimationV1;
  presentation: ResolvedActionPresentationV1;
  actionStartTick: number;
}

interface WeightedActiveAnimationV1 {
  readonly active: ActiveAnimationV1;
  readonly startWeight: number;
}

interface AnimationTransitionV1 {
  readonly sources: readonly WeightedActiveAnimationV1[];
  readonly target: ActiveAnimationV1;
  readonly targetStartWeight: number;
  readonly transitionStartTick: number;
  readonly durationTicks: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

interface EffectiveAnimationWeightV1 {
  readonly active: ActiveAnimationV1;
  readonly weight: number;
}

export interface AnimationPresentationDebugTelemetryV1 {
  readonly schemaVersion: 1;
  readonly committedTick: number;
  readonly presentationKey: SemanticPresentationKeyV1;
  readonly sourceClipName: string;
  readonly normalizedTime: number;
  readonly blendWeight: number;
  readonly isTransitioning: boolean;
  readonly actionExecutionId?: string;
}

const GROUND_AUTOMATIC_PRESENTATION_KEYS = new Set<SemanticPresentationKeyV1>([
  "locomotion.suspended",
  "locomotion.idle",
  "locomotion.walk",
  "locomotion.run",
]);

const AUTOMATIC_PRESENTATION_KEYS = new Set<SemanticPresentationKeyV1>(
  AUTOMATIC_LOCOMOTION_PRESENTATION_KEYS_V1,
);

const ANIMATION_SEMANTIC_FAMILIES = new Set([
  "ground",
  "airborne",
  "flight",
  "water",
  "posture",
  "combat",
  "emote",
  "dance",
]);

const ANIMATION_PRESENTATION_FRAMES_PER_SECOND_MAX_V1 = 480;
const ANIMATION_PRESENTATION_ABSOLUTE_FRAME_MAX_V1 = 1_000_000;
const ANIMATION_PRESENTATION_FRAME_SPAN_MAX_V1 = 1_000_000;
export const MAX_ANIMATION_ELAPSED_TICKS_V1 = 2_147_483_647;

export class SubjectAnimationPlayer {
  private readonly animationsByPresentationKey: ReadonlyMap<
    SemanticPresentationKeyV1,
    ValidatedPresentationAnimationV1
  >;
  private readonly ownedAnimationGroups: readonly AnimationGroup[];
  private current: ActiveAnimationV1;
  private transition: AnimationTransitionV1 | undefined;
  private latestTick = 0;
  private latestProjection:
    | Readonly<{ committedTick: number; canonicalBytes: string }>
    | undefined;
  private readonly executionProofsById = new Map<string, string>();
  private activeActionExecutionId: string | undefined;
  private disposed = false;

  constructor(private readonly options: SubjectAnimationPlayerOptionsV1) {
    const validated = this.validateAnimations();
    this.animationsByPresentationKey = validated.byPresentationKey;
    this.ownedAnimationGroups = validated.ownedGroups;
    const idle = this.animationFor("locomotion.idle");
    this.current = {
      animation: idle,
      presentation: Object.freeze({
        schemaVersion: 1,
        committedTick: 0,
        source: "locomotion",
        presentationKey: "locomotion.idle",
        layeredMoves: Object.freeze([]),
      }),
      actionStartTick: 0,
    };
    this.reset();
  }

  get activeActionId(): GroundHumanoidActionIdV1 {
    const key = this.current.animation.presentationKey;
    if (key === "locomotion.walk") return "walk";
    if (key === "locomotion.run") return "run";
    if (key === "locomotion.small-jump.takeoff") return "jump.small.takeoff";
    if (key === "locomotion.small-jump.airborne") return "jump.small.airborne";
    if ([
      "locomotion.takeoff", "locomotion.rising", "locomotion.apex",
      "locomotion.falling", "locomotion.landing",
    ].includes(key)) return "jump";
    return "idle";
  }

  get activePresentationKey(): SemanticPresentationKeyV1 {
    return this.current.animation.presentationKey;
  }

  step(
    input: ResolvedActionPresentationV1,
    committedActionState?: GameplayActionStateV1,
  ): void {
    if (this.disposed) return;
    const presentation = verifyResolvedActionPresentationV1(
      input,
      this.options.actionPresentationRegistry,
      committedActionState,
    );
    const tick = presentation.committedTick;
    const canonicalBytes = stringifyCanonicalJson({
      presentation,
      committedActionState: committedActionState === undefined
        ? null
        : {
            id: committedActionState.id,
            kind: committedActionState.kind,
            semanticActionRef: committedActionState.semanticActionRef,
            semanticActionHash: committedActionState.semanticActionHash,
            actorEntityId: committedActionState.actorEntityId,
            mode: committedActionState.mode,
            startedSimulationTick: committedActionState.startedSimulationTick,
            lastTransitionSimulationTick:
              committedActionState.lastTransitionSimulationTick,
            ...(committedActionState.actionRequestRef === undefined
              ? {}
              : {
                  actionRequestRef: committedActionState.actionRequestRef,
                  actionRequestHash: committedActionState.actionRequestHash,
                }),
          },
    });
    if (this.latestProjection !== undefined) {
      if (tick < this.latestProjection.committedTick ||
        (tick === this.latestProjection.committedTick &&
          canonicalBytes !== this.latestProjection.canonicalBytes)) {
        throw new SubjectAssetRuntimeErrorV1(
          "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE",
          {
            subjectAssetRef: this.options.subjectAssetRef,
            artifactContentHash: this.options.artifactContentHash,
          },
        );
      }
      if (tick === this.latestProjection.committedTick) return;
    }
    this.commitExecutionProof(presentation, committedActionState);
    const actionExecutionId = presentation.source === "action"
      ? presentation.actionExecutionId
      : undefined;
    const actionBindingRef = presentation.source === "action"
      ? presentation.actionBindingRef
      : undefined;
    const currentActionExecutionId = this.current.presentation.source === "action"
      ? this.current.presentation.actionExecutionId
      : undefined;
    const currentActionBindingRef = this.current.presentation.source === "action"
      ? this.current.presentation.actionBindingRef
      : undefined;
    const samePresentation = presentation.presentationKey ===
        this.current.presentation.presentationKey &&
      actionExecutionId === currentActionExecutionId &&
      actionBindingRef === currentActionBindingRef;
    if (!samePresentation) {
      const targetAnimation = this.animationFor(presentation.presentationKey);
      if (targetAnimation.group === this.current.animation.group) {
        const startsNewActionExecution = presentation.source === "action" &&
          (this.current.presentation.source !== "action" ||
            presentation.actionExecutionId !== currentActionExecutionId);
        this.current.animation = targetAnimation;
        this.current.presentation = presentation;
        if (startsNewActionExecution) this.current.actionStartTick = tick;
      } else {
        this.beginTransition(tick, targetAnimation, presentation);
      }
    } else {
      this.current.presentation = presentation;
    }
    this.latestTick = tick;
    this.latestProjection = Object.freeze({ committedTick: tick, canonicalBytes });
  }

  applyPose(): void {
    if (this.disposed) return;
    this.sample(this.latestTick);
  }

  debugTelemetry(): AnimationPresentationDebugTelemetryV1 {
    const animation = this.current.animation;
    const span = animation.to - animation.from;
    const elapsedFrames = this.elapsedFrames(this.current, this.latestTick);
    const normalizedTime = animation.loopMode === "repeat"
      ? (((elapsedFrames % span) + span) % span) / span
      : clamp(Math.max(0, elapsedFrames) / span, 0, 1);
    const transition = this.transition;
    const blendWeight = transition === undefined
      ? 1
      : this.effectiveTransitionWeights(transition, this.latestTick)
          .find(({ active }) => active === transition.target)?.weight ?? 0;
    return Object.freeze({
      schemaVersion: 1,
      committedTick: this.latestTick,
      presentationKey: animation.presentationKey,
      sourceClipName: animation.sourceClipName,
      normalizedTime,
      blendWeight,
      isTransitioning: transition !== undefined && blendWeight < 1,
      ...(this.current.presentation.source !== "action"
        ? {}
        : { actionExecutionId: this.current.presentation.actionExecutionId }),
    });
  }

  reset(): void {
    if (this.disposed) return;
    for (const group of this.ownedAnimationGroups) {
      group.stop();
      group.setWeightForAllAnimatables(0);
    }
    const idle = this.animationFor("locomotion.idle");
    this.current = {
      animation: idle,
      presentation: Object.freeze({
        schemaVersion: 1,
        committedTick: 0,
        source: "locomotion",
        presentationKey: "locomotion.idle",
        layeredMoves: Object.freeze([]),
      }),
      actionStartTick: 0,
    };
    this.transition = undefined;
    this.latestTick = 0;
    this.latestProjection = undefined;
    this.executionProofsById.clear();
    this.activeActionExecutionId = undefined;
    this.startPaused(idle);
    idle.group.goToFrame(idle.from, true);
    idle.group.setWeightForAllAnimatables(1);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.transition = undefined;
    let disposalFailed = false;
    for (const group of this.ownedAnimationGroups) {
      try {
        group.stop();
      } catch {
        disposalFailed = true;
      }
    }
    if (disposalFailed) {
      throw new SubjectAssetRuntimeErrorV1("SUBJECT_ASSET_DISPOSE_FAILED", {
        subjectAssetRef: this.options.subjectAssetRef,
        artifactContentHash: this.options.artifactContentHash,
      });
    }
  }

  private validateAnimations(): ValidatedAnimationsV1 {
    const incompatible = (): never => {
      throw new SubjectAssetRuntimeErrorV1(
        "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE",
        {
          subjectAssetRef: this.options.subjectAssetRef,
          artifactContentHash: this.options.artifactContentHash,
        },
      );
    };
    const result = new Map<SemanticPresentationKeyV1, ValidatedPresentationAnimationV1>();
    const ownedGroups = new Set<AnimationGroup>();
    const authority = this.options.authorityTransformNode;
    const forbiddenAuthorityTargets = new Set<unknown>([
      authority,
      authority.position,
      authority.rotation,
      authority.rotationQuaternion,
      authority.scaling,
      authority.absolutePosition,
      authority.absoluteScaling,
      authority.absoluteRotationQuaternion,
      authority.getPivotMatrix(),
      authority.getWorldMatrix(),
    ].filter((target) => target !== null && target !== undefined));
    const ownedVisualAnimationTargets = new Set<object>();
    for (const target of this.options.ownedVisualAnimationTargets) {
      if ((typeof target !== "object" && typeof target !== "function") ||
        target === null || forbiddenAuthorityTargets.has(target)) {
        return incompatible();
      }
      ownedVisualAnimationTargets.add(target);
    }
    const validateClip = (
      sourceClipName: string,
      loopMode: "repeat" | "once",
      playbackSpeedRatio: number,
      blendDurationTicks: number,
    ): Omit<ValidatedPresentationAnimationV1, "presentationKey"> => {
      if (!Number.isFinite(playbackSpeedRatio) || playbackSpeedRatio <= 0 ||
        playbackSpeedRatio > ACTION_PRESENTATION_PLAYBACK_SPEED_RATIO_MAX_V1 ||
        !Number.isSafeInteger(blendDurationTicks) || blendDurationTicks < 0 ||
        blendDurationTicks > ACTION_PRESENTATION_BLEND_DURATION_TICKS_MAX_V1 ||
        Object.is(blendDurationTicks, -0)) {
        return incompatible();
      }
      const matches = this.options.animationGroups.filter(
        (group) => group.name === sourceClipName,
      );
      if (matches.length !== 1) return incompatible();
      const group = matches[0]!;
      if (
        group.targetedAnimations.length === 0 ||
        group.targetedAnimations.some((targeted) =>
          (typeof targeted.target !== "object" &&
            typeof targeted.target !== "function") ||
          targeted.target === null ||
          !ownedVisualAnimationTargets.has(targeted.target)
        ) ||
        !Number.isFinite(group.from) ||
        !Number.isFinite(group.to) ||
        Math.abs(group.from) > ANIMATION_PRESENTATION_ABSOLUTE_FRAME_MAX_V1 ||
        Math.abs(group.to) > ANIMATION_PRESENTATION_ABSOLUTE_FRAME_MAX_V1 ||
        group.from >= group.to ||
        !Number.isFinite(group.to - group.from) ||
        group.to - group.from > ANIMATION_PRESENTATION_FRAME_SPAN_MAX_V1
      ) return incompatible();
      const frameRates = new Set(
        group.targetedAnimations.map((targeted) => targeted.animation.framePerSecond),
      );
      if (frameRates.size !== 1) return incompatible();
      const framesPerSecond = [...frameRates][0]!;
      if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0 ||
        framesPerSecond > ANIMATION_PRESENTATION_FRAMES_PER_SECOND_MAX_V1) {
        return incompatible();
      }
      ownedGroups.add(group);
      return {
        group,
        sourceClipName,
        from: group.from,
        to: group.to,
        framesPerSecond,
        loopMode,
        playbackSpeedRatio,
        blendDurationTicks,
      };
    };
    const bindPresentation = (
      presentationKey: SemanticPresentationKeyV1,
      clip: Omit<ValidatedPresentationAnimationV1, "presentationKey">,
    ): void => {
      if (result.has(presentationKey)) incompatible();
      result.set(presentationKey, { presentationKey, ...clip });
    };
    const seenLegacyActionIds = new Set<GroundHumanoidActionIdV1>();
    for (const binding of this.options.animationSet.animationBindings) {
      if (
        !Number.isFinite(binding.playbackSpeedRatio) ||
        binding.playbackSpeedRatio <= 0 ||
        binding.playbackSpeedRatio >
          ACTION_PRESENTATION_PLAYBACK_SPEED_RATIO_MAX_V1 ||
        !Number.isFinite(binding.blendDurationSeconds) ||
        binding.blendDurationSeconds < 0 ||
        Object.is(binding.blendDurationSeconds, -0) ||
        binding.blendDurationSeconds / FIXED_TIME_STEP_SECONDS >
          ACTION_PRESENTATION_BLEND_DURATION_TICKS_MAX_V1 ||
        binding.rootMotionMode !== "in-place" ||
        !ANIMATION_SEMANTIC_FAMILIES.has(binding.semanticFamily) ||
        !Array.isArray(binding.automaticPresentationKeys)
      ) {
        incompatible();
      }
      if (seenLegacyActionIds.has(binding.actionId)) incompatible();
      seenLegacyActionIds.add(binding.actionId);
      const blendDurationTicks = Math.max(
        0,
        Math.round(binding.blendDurationSeconds / FIXED_TIME_STEP_SECONDS),
      );
      const clip = validateClip(
        binding.sourceClipName,
        binding.loopMode,
        binding.playbackSpeedRatio,
        blendDurationTicks,
      );
      for (const key of binding.automaticPresentationKeys) {
        if (!AUTOMATIC_PRESENTATION_KEYS.has(key)) incompatible();
        const expectedFamily = GROUND_AUTOMATIC_PRESENTATION_KEYS.has(key)
          ? "ground"
          : "airborne";
        if (binding.semanticFamily !== expectedFamily) incompatible();
        bindPresentation(key, clip);
      }
    }
    for (const actionId of this.options.animationSet.requiredActionIds) {
      if (!seenLegacyActionIds.has(actionId)) {
        incompatible();
      }
    }
    for (const binding of this.options.actionPresentationRegistry.bindings) {
      bindPresentation(binding.presentationKey, validateClip(
        binding.clip.sourceClipName,
        binding.clip.loopMode,
        binding.clip.playbackSpeedRatio,
        binding.clip.blendDurationTicks,
      ));
    }
    if (!result.has("locomotion.idle")) incompatible();
    return Object.freeze({
      byPresentationKey: result,
      ownedGroups: Object.freeze([...ownedGroups]),
    });
  }

  private animationFor(
    presentationKey: SemanticPresentationKeyV1,
  ): ValidatedPresentationAnimationV1 {
    const animation = this.animationsByPresentationKey.get(presentationKey);
    if (animation !== undefined) return animation;
    throw new SubjectAssetRuntimeErrorV1(
      "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE",
      {
        subjectAssetRef: this.options.subjectAssetRef,
        artifactContentHash: this.options.artifactContentHash,
      },
    );
  }

  private beginTransition(
    tick: number,
    targetAnimation: ValidatedPresentationAnimationV1,
    presentation: ResolvedActionPresentationV1,
  ): void {
    const effectiveSources = this.transition === undefined
      ? [{ active: this.current, weight: 1 }]
      : this.effectiveTransitionWeights(this.transition, tick);
    const target = { animation: targetAnimation, presentation, actionStartTick: tick };
    this.startPaused(targetAnimation);
    let targetStartWeight = 0;
    const sourcesByGroup = new Map<AnimationGroup, WeightedActiveAnimationV1>();
    for (const source of effectiveSources) {
      if (source.weight <= 0) continue;
      if (source.active.animation.group === targetAnimation.group) {
        targetStartWeight += source.weight;
        continue;
      }
      const existing = sourcesByGroup.get(source.active.animation.group);
      sourcesByGroup.set(source.active.animation.group, {
        active: source.active,
        startWeight: (existing?.startWeight ?? 0) + source.weight,
      });
    }
    targetStartWeight = clamp(targetStartWeight, 0, 1);
    targetAnimation.group.setWeightForAllAnimatables(targetStartWeight);
    this.current = target;
    this.transition = {
      sources: Object.freeze([...sourcesByGroup.values()]),
      target,
      targetStartWeight,
      transitionStartTick: tick,
      durationTicks: targetAnimation.blendDurationTicks,
    };
  }

  private sample(tick: number): void {
    const transition = this.transition;
    if (transition === undefined) {
      this.current.animation.group.setWeightForAllAnimatables(1);
      this.sampleActive(this.current, tick);
      return;
    }
    const weights = this.effectiveTransitionWeights(transition, tick);
    for (const { active, weight } of weights) {
      active.animation.group.setWeightForAllAnimatables(weight);
      this.sampleActive(active, tick);
    }
    const targetWeight = weights.find(({ active }) =>
      active === transition.target
    )?.weight ?? 0;
    if (targetWeight >= 1) {
      for (const source of transition.sources) {
        source.active.animation.group.stop();
      }
      this.transition = undefined;
    }
  }

  private effectiveTransitionWeights(
    transition: AnimationTransitionV1,
    tick: number,
  ): readonly EffectiveAnimationWeightV1[] {
    const alpha = transition.durationTicks === 0
      ? 1
      : clamp(
          this.checkedElapsedTicks(tick, transition.transitionStartTick) /
            transition.durationTicks,
          0,
          1,
        );
    const remaining = 1 - alpha;
    return Object.freeze([
      ...transition.sources.map((source) => Object.freeze({
        active: source.active,
        weight: source.startWeight * remaining,
      })),
      Object.freeze({
        active: transition.target,
        weight: transition.targetStartWeight +
          (1 - transition.targetStartWeight) * alpha,
      }),
    ]);
  }

  private sampleActive(active: ActiveAnimationV1, tick: number): void {
    const animation = active.animation;
    const elapsedFrames = this.elapsedFrames(active, tick);
    const span = animation.to - animation.from;
    const frame = animation.loopMode === "repeat"
      ? animation.from + (((elapsedFrames % span) + span) % span)
      : Math.min(animation.to, animation.from + Math.max(0, elapsedFrames));
    if (!Number.isFinite(frame)) this.failIncompatible();
    animation.group.goToFrame(frame, true);
  }

  private elapsedFrames(active: ActiveAnimationV1, tick: number): number {
    const elapsedTicks = this.checkedElapsedTicks(tick, active.actionStartTick);
    const elapsedFrames = elapsedTicks * FIXED_TIME_STEP_SECONDS *
      active.animation.playbackSpeedRatio * active.animation.framesPerSecond;
    if (!Number.isFinite(elapsedFrames) || elapsedFrames < 0 ||
      elapsedFrames > Number.MAX_SAFE_INTEGER) {
      return this.failIncompatible();
    }
    return elapsedFrames;
  }

  private checkedElapsedTicks(laterTick: number, earlierTick: number): number {
    const elapsedTicks = laterTick - earlierTick;
    if (!Number.isSafeInteger(elapsedTicks) || elapsedTicks < 0 ||
      elapsedTicks > MAX_ANIMATION_ELAPSED_TICKS_V1) {
      return this.failIncompatible();
    }
    return elapsedTicks;
  }

  private commitExecutionProof(
    presentation: ResolvedActionPresentationV1,
    committedActionState: GameplayActionStateV1 | undefined,
  ): void {
    if (presentation.source === "locomotion") {
      this.executionProofsById.clear();
      this.activeActionExecutionId = undefined;
      return;
    }
    if (committedActionState === undefined) return this.failIncompatible();
    const proof = stringifyCanonicalJson({
      semanticActionRef: committedActionState.semanticActionRef,
      semanticActionHash: committedActionState.semanticActionHash,
      actionBindingRef: presentation.actionBindingRef,
      actionBindingHash: presentation.actionBindingHash,
      startedSimulationTick: committedActionState.startedSimulationTick,
    });
    const existing = this.executionProofsById.get(presentation.actionExecutionId);
    if (existing !== undefined && existing !== proof) return this.failIncompatible();
    if (this.activeActionExecutionId !== undefined &&
      this.activeActionExecutionId !== presentation.actionExecutionId) {
      this.executionProofsById.delete(this.activeActionExecutionId);
    }
    this.executionProofsById.set(presentation.actionExecutionId, proof);
    this.activeActionExecutionId = presentation.actionExecutionId;
  }

  private failIncompatible(): never {
    throw new SubjectAssetRuntimeErrorV1(
      "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE",
      {
        subjectAssetRef: this.options.subjectAssetRef,
        artifactContentHash: this.options.artifactContentHash,
      },
    );
  }

  private startPaused(animation: ValidatedPresentationAnimationV1): void {
    if (!animation.group.isStarted) {
      animation.group.start(
        animation.loopMode === "repeat",
        animation.playbackSpeedRatio,
        animation.from,
        animation.to,
      );
    }
    animation.group.pause();
  }
}
