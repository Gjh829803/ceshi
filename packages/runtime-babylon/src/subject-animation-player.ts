import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";

import type { ExecutionAnimationSetV1 } from "@whitebox-world/runtime-contracts";
import type { GroundHumanoidActionIdV1 } from "@whitebox-world/subject-actions";

import { SubjectAssetRuntimeErrorV1 } from "./subject-asset-cache";

interface SubjectAnimationPlayerOptionsV1 {
  animationGroups: readonly AnimationGroup[];
  animationSet: ExecutionAnimationSetV1;
  subjectAssetRef: string;
  artifactContentHash: string;
}

interface ValidatedActionAnimationV1 {
  actionId: GroundHumanoidActionIdV1;
  group: AnimationGroup;
  from: number;
  to: number;
  framesPerSecond: number;
  loopMode: "repeat" | "once";
  playbackSpeedRatio: number;
  blendDurationTicks: number;
}

interface ActiveAnimationV1 {
  animation: ValidatedActionAnimationV1;
  actionStartTick: number;
}

interface AnimationTransitionV1 {
  source: ActiveAnimationV1;
  target: ActiveAnimationV1;
  transitionStartTick: number;
  durationTicks: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export class SubjectAnimationPlayer {
  private readonly animationsByActionId: ReadonlyMap<
    GroundHumanoidActionIdV1,
    ValidatedActionAnimationV1
  >;
  private current: ActiveAnimationV1;
  private transition: AnimationTransitionV1 | undefined;
  private disposed = false;

  constructor(private readonly options: SubjectAnimationPlayerOptionsV1) {
    this.animationsByActionId = this.validateAnimations();
    const idle = this.animationFor("idle");
    this.current = { animation: idle, actionStartTick: 0 };
    this.reset();
  }

  get activeActionId(): GroundHumanoidActionIdV1 {
    return this.current.animation.actionId;
  }

  step(tick: number, actionId: GroundHumanoidActionIdV1): void {
    if (this.disposed) return;
    if (actionId !== this.current.animation.actionId) {
      this.beginTransition(tick, this.animationFor(actionId));
    }
    this.sample(tick);
  }

  reset(): void {
    if (this.disposed) return;
    for (const animation of this.animationsByActionId.values()) {
      animation.group.stop();
      animation.group.setWeightForAllAnimatables(0);
    }
    const idle = this.animationFor("idle");
    this.current = { animation: idle, actionStartTick: 0 };
    this.transition = undefined;
    this.startPaused(idle);
    idle.group.goToFrame(idle.from, true);
    idle.group.setWeightForAllAnimatables(1);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.transition = undefined;
    let disposalFailed = false;
    for (const animation of this.animationsByActionId.values()) {
      try {
        animation.group.stop();
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

  private validateAnimations(): ReadonlyMap<
    GroundHumanoidActionIdV1,
    ValidatedActionAnimationV1
  > {
    const incompatible = (): never => {
      throw new SubjectAssetRuntimeErrorV1(
        "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE",
        {
          subjectAssetRef: this.options.subjectAssetRef,
          artifactContentHash: this.options.artifactContentHash,
        },
      );
    };
    const result = new Map<GroundHumanoidActionIdV1, ValidatedActionAnimationV1>();
    for (const binding of this.options.animationSet.animationBindings) {
      if (
        !Number.isFinite(binding.playbackSpeedRatio) ||
        binding.playbackSpeedRatio <= 0 ||
        !Number.isFinite(binding.blendDurationSeconds) ||
        binding.blendDurationSeconds < 0 ||
        result.has(binding.actionId)
      ) {
        incompatible();
      }
      const matches = this.options.animationGroups.filter(
        (group) => group.name === binding.sourceClipName,
      );
      if (matches.length !== 1) incompatible();
      const group = matches[0]!;
      if (
        group.targetedAnimations.length === 0 ||
        !Number.isFinite(group.from) ||
        !Number.isFinite(group.to) ||
        group.from >= group.to
      ) {
        incompatible();
      }
      const frameRates = new Set(
        group.targetedAnimations.map((targeted) => targeted.animation.framePerSecond),
      );
      if (frameRates.size !== 1) incompatible();
      const framesPerSecond = [...frameRates][0]!;
      if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0) incompatible();
      result.set(binding.actionId, {
        actionId: binding.actionId,
        group,
        from: group.from,
        to: group.to,
        framesPerSecond,
        loopMode: binding.loopMode,
        playbackSpeedRatio: binding.playbackSpeedRatio,
        blendDurationTicks: Math.max(
          0,
          Math.round(binding.blendDurationSeconds * 60),
        ),
      });
    }
    for (const actionId of this.options.animationSet.requiredActionIds) {
      if (!result.has(actionId)) incompatible();
    }
    if (!result.has("idle")) incompatible();
    return result;
  }

  private animationFor(
    actionId: GroundHumanoidActionIdV1,
  ): ValidatedActionAnimationV1 {
    const animation = this.animationsByActionId.get(actionId);
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
    targetAnimation: ValidatedActionAnimationV1,
  ): void {
    if (this.transition !== undefined) {
      this.transition.source.animation.group.stop();
      this.transition.target.animation.group.setWeightForAllAnimatables(1);
    }
    const source = this.current;
    const target = { animation: targetAnimation, actionStartTick: tick };
    this.startPaused(targetAnimation);
    targetAnimation.group.goToFrame(targetAnimation.from, true);
    targetAnimation.group.setWeightForAllAnimatables(0);
    this.current = target;
    this.transition = {
      source,
      target,
      transitionStartTick: tick,
      durationTicks: targetAnimation.blendDurationTicks,
    };
  }

  private sample(tick: number): void {
    this.sampleActive(this.current, tick);
    const transition = this.transition;
    if (transition === undefined) {
      this.current.animation.group.setWeightForAllAnimatables(1);
      return;
    }
    this.sampleActive(transition.source, tick);
    const alpha = transition.durationTicks === 0
      ? 1
      : clamp(
          (tick - transition.transitionStartTick) / transition.durationTicks,
          0,
          1,
        );
    transition.source.animation.group.setWeightForAllAnimatables(1 - alpha);
    transition.target.animation.group.setWeightForAllAnimatables(alpha);
    if (alpha >= 1) {
      transition.source.animation.group.stop();
      this.transition = undefined;
    }
  }

  private sampleActive(active: ActiveAnimationV1, tick: number): void {
    const animation = active.animation;
    const elapsedFrames =
      ((tick - active.actionStartTick) / 60) *
      animation.playbackSpeedRatio *
      animation.framesPerSecond;
    const span = animation.to - animation.from;
    const frame = animation.loopMode === "repeat"
      ? animation.from + (((elapsedFrames % span) + span) % span)
      : Math.min(animation.to, animation.from + Math.max(0, elapsedFrames));
    animation.group.goToFrame(frame, true);
  }

  private startPaused(animation: ValidatedActionAnimationV1): void {
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
