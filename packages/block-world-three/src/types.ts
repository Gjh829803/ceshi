import type { Scene } from "three";

import type {
  BlockPositionMetersXYZV2,
  BlockRequiredGroundTraversalBandV2,
  BlockRequiredTargetV2,
  BlockSubjectTraversalProfileV2,
  BlockSubjectVisualPartV2,
  BlockWorldCameraV2,
  BlockWorldControlledSubjectV2,
  BlockWorldDiagnosticV2,
  BlockWorldIdentityV2,
  BlockWorldSpaceTransitionV2,
  BlockWorldManifestV2,
  BlockVisualTargetFacingV2,
} from "@whitebox-world/block-world";

export interface WorldkitBlockBindingInputV1 {
  readonly id: string;
  readonly presetRef: string;
  readonly visualGroupId?: string;
  readonly interactionInstanceId?: string;
  readonly initialStateId?: string;
}

export interface WorldkitBlockBindingV1 extends WorldkitBlockBindingInputV1 {
  readonly kind: "worldkit-three-block-binding";
  readonly schemaVersion: 1;
}

export interface WorldkitSubjectMeshBindingInputV1 {
  readonly id: string;
  readonly colliderContribution?: "include" | "exclude";
  readonly semanticTags: readonly string[];
}

export interface WorldkitSubjectMeshBindingV1
  extends WorldkitSubjectMeshBindingInputV1 {
  readonly kind: "worldkit-three-subject-mesh-binding";
  readonly schemaVersion: 1;
  readonly colliderContribution: "include" | "exclude";
}

export interface ExtractThreeBlockWorldResultV2 {
  readonly manifest: BlockWorldManifestV2;
  readonly subjectMeshParts: readonly Extract<
    BlockSubjectVisualPartV2,
    { kind: "primitive" }
  >[];
  readonly diagnostics: readonly BlockWorldDiagnosticV2[];
}

export interface ThreeBlockWorldAuthoringResultV2 {
  readonly scene: Scene;
  readonly world: BlockWorldIdentityV2;
  readonly controlledSubject: BlockWorldControlledSubjectV2;
  readonly camera: BlockWorldCameraV2;
  readonly subjectTraversalProfile: BlockSubjectTraversalProfileV2;
  readonly spawnStandPositionMetersXYZ: BlockPositionMetersXYZV2;
  readonly requiredTargets: readonly BlockRequiredTargetV2[];
  readonly requiredGroundTraversalBands: readonly BlockRequiredGroundTraversalBandV2[];
  readonly visualTargetFacings?: readonly BlockVisualTargetFacingV2[];
  readonly spaceTransitions?: readonly BlockWorldSpaceTransitionV2[];
  readonly requireSingleReachableComponent: boolean;
}

export type BuildThreeBlockWorldV2 =
  () => ThreeBlockWorldAuthoringResultV2 | Promise<ThreeBlockWorldAuthoringResultV2>;
