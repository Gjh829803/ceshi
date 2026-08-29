import type { Sha256HashV1 } from "@whitebox-world/protocol";

import type {
  LayeredMoveV1,
  LockedRootMotionSourceV1,
  RootMotionResourceRefV1,
} from "@whitebox-world/character-movement";
import type {
  GameplayActionStateV1,
  LocomotionCapabilityStateV2,
} from "@whitebox-world/gameplay-contracts";

export type LocomotionPresentationKeyV1 =
  | "locomotion.suspended"
  | "locomotion.idle"
  | "locomotion.walk"
  | "locomotion.run"
  | "locomotion.takeoff"
  | "locomotion.rising"
  | "locomotion.apex"
  | "locomotion.falling"
  | "locomotion.landing";

export type ActionPresentationKeyV1 = `action.${string}`;
export type SemanticPresentationKeyV1 =
  | LocomotionPresentationKeyV1
  | ActionPresentationKeyV1;

export type ActionPresentationResourceRefV1 =
  `worldkit://action-presentation/${string}@${number}`;
export type SemanticActionResourceRefV1 =
  `worldkit://semantic-action/${string}@${number}`;

export interface ActionPresentationClipV1 {
  readonly sourceClipName: string;
  readonly loopMode: "repeat" | "once";
  readonly playbackSpeedRatio: number;
  readonly blendDurationTicks: number;
}

export type ActionPresentationRootMotionV1 =
  | Readonly<{ mode: "none" }>
  | Readonly<{
      mode: "locked";
      rootMotionSourceRef: RootMotionResourceRefV1;
      rootMotionSourceHash: Sha256HashV1;
      priority: number;
    }>;

export interface ActionPresentationBindingBodyV1 {
  readonly kind: "action-presentation-binding";
  readonly schemaVersion: 1;
  readonly resourceRef: ActionPresentationResourceRefV1;
  readonly presentationKey: ActionPresentationKeyV1;
  readonly semanticActionRef: SemanticActionResourceRefV1;
  readonly semanticActionHash: Sha256HashV1;
  readonly isInterruptible: boolean;
  readonly clip: ActionPresentationClipV1;
  readonly rootMotion: ActionPresentationRootMotionV1;
}

export interface ActionPresentationBindingV1
  extends ActionPresentationBindingBodyV1 {
  readonly contentHash: Sha256HashV1;
}

export interface ActionPresentationRegistryV1 {
  readonly bindings: readonly ActionPresentationBindingV1[];
  resolveAction(
    semanticActionRef: string,
    semanticActionHash: string,
  ): ActionPresentationBindingV1 | undefined;
  resolveBinding(
    actionBindingRef: string,
    actionBindingHash: string,
  ): ActionPresentationBindingV1 | undefined;
  resolvePresentation(
    presentationKey: string,
  ): ActionPresentationBindingV1 | undefined;
  resolveRootMotionSource(
    rootMotionSourceRef: string,
    rootMotionSourceHash: string,
  ): LockedRootMotionSourceV1 | undefined;
}

export interface ActionPresentationResolveInputV1 {
  readonly schemaVersion: 1;
  readonly committedTick: number;
  readonly fixedDeltaSeconds: number;
  readonly locomotion: LocomotionCapabilityStateV2;
  readonly activeActionState?: GameplayActionStateV1;
}

export type ResolvedActionPresentationV1 =
  | Readonly<{
      schemaVersion: 1;
      committedTick: number;
      source: "locomotion";
      presentationKey: LocomotionPresentationKeyV1;
      layeredMoves: readonly LayeredMoveV1[];
    }>
  | Readonly<{
      schemaVersion: 1;
      committedTick: number;
      source: "action";
      presentationKey: ActionPresentationKeyV1;
      actionExecutionId: string;
      actionBindingRef: ActionPresentationResourceRefV1;
      actionBindingHash: Sha256HashV1;
      layeredMoves: readonly LayeredMoveV1[];
    }>;
