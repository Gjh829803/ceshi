import {
  deriveWorldStateSnapshotRefV1,
  type GameplayInspectionSnapshotV1,
  type WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import type {
  WorldRuntimeCameraStateV4,
  WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import type {
  RuntimeHostPhaseV1,
  WorldSessionPublicationV1,
} from "@whitebox-world/runtime-host";
import { isEqual, isNil } from "lodash-es";

import { FIXED_TIME_STEP_SECONDS } from "./physics";
import type { BabylonRuntimeProjectionV1 } from "./runtime-projection";

function activePossessionEntityId(
  inspection: GameplayInspectionSnapshotV1,
  fixedInputControllerEntityId: string,
): string | undefined {
  const relationships = Object.values(
    inspection.relationshipStatesById,
  ).filter(
    (relationship) =>
      relationship.type === "possessedBy" &&
      relationship.controllerEntityId === fixedInputControllerEntityId,
  );
  if (relationships.length > 1) {
    throw new Error(
      "WORLDKIT_RUNTIME_POSSESSION_INVALID: Multiple canonical control owners were published.",
    );
  }
  const relationship = relationships[0];
  return relationship?.type === "possessedBy"
    ? relationship.controlledEntityId
    : undefined;
}

function cameraProjection(
  publication: WorldSessionPublicationV1,
  runtimeProjection: BabylonRuntimeProjectionV1,
  fixedInputControllerEntityId: string,
): WorldRuntimeCameraStateV4 {
  const controlledEntityId = activePossessionEntityId(
    publication.gameplayInspection,
    fixedInputControllerEntityId,
  );
  if (isNil(controlledEntityId)) return Object.freeze({ mode: "unbound" });
  const camera = runtimeProjection.camera;
  if (
    isNil(camera.activeCameraProfileRef) ||
    isNil(camera.activeCameraRigRef) ||
    isNil(camera.activeCameraModifierRefs) ||
    isNil(camera.safeFallbackActive) ||
    isNil(camera.viewYawOffsetRadians) ||
    isNil(camera.viewPitchOffsetRadians) ||
    isNil(camera.viewDistanceOffsetMeters) ||
    isNil(camera.targetEntityId) ||
    isNil(camera.selectionDecision) ||
    isNil(camera.isTargetSocketFallback) ||
    isNil(camera.desiredTargetPositionMetersXYZ) ||
    isNil(camera.desiredPositionMetersXYZ) ||
    isNil(camera.actualPositionMetersXYZ) ||
    isNil(camera.finalFovDegrees) ||
    isNil(camera.positionLagXYZ) ||
    isNil(camera.rotationLagRadiansXYZ) ||
    isNil(camera.fixedStepDeltaSeconds) ||
    isNil(camera.resolvedParameters) ||
    isNil(camera.previewParameterOverrides) ||
    isNil(camera.profileTransitionProgressRatio) ||
    isNil(camera.controlForwardXYZ) ||
    isNil(camera.subjectForwardXYZ) ||
    isNil(camera.subjectVelocityMetersPerSecondXYZ)
  ) {
    throw new Error(
      "WORLDKIT_RUNTIME_CAMERA_STATE_INVALID: Bound camera state is incomplete.",
    );
  }
  if (
    camera.targetEntityId !== camera.selectionDecision.targetEntityId ||
    camera.selectionDecision.committedTick !==
      publication.worldState.simulationTick ||
    camera.activeCameraProfileRef !==
      camera.selectionDecision.activeCameraRigProfileRef ||
    !isEqual(
      camera.activeCameraModifierRefs,
      camera.selectionDecision.activeCameraModifierRefs,
    ) ||
    camera.safeFallbackActive !== camera.selectionDecision.fallbackActive
  ) {
    throw new Error(
      "WORLDKIT_RUNTIME_CAMERA_STATE_INVALID: Bound camera publication combines different committed epochs.",
    );
  }
  return Object.freeze({
    mode: "tracking",
    id: camera.entityId,
    targetEntityId: camera.targetEntityId,
    positionMetersXYZ: Object.freeze([...camera.positionMetersXYZ]) as
      readonly [number, number, number],
    activeCameraProfileRef: camera.activeCameraProfileRef,
    ...(camera.subjectOcclusion === undefined ? {} : { subjectOcclusion: camera.subjectOcclusion }),
    ...(camera.authoredOpeningProfileRef === undefined ? {} : {
      authoredOpeningProfileRef: camera.authoredOpeningProfileRef,
    }),
    activeCameraRigRef: camera.activeCameraRigRef,
    activeCameraModifierRefs: Object.freeze([
      ...camera.activeCameraModifierRefs,
    ]),
    safeFallbackActive: camera.safeFallbackActive,
    viewYawOffsetRadians: camera.viewYawOffsetRadians,
    viewPitchOffsetRadians: camera.viewPitchOffsetRadians,
    viewDistanceOffsetMeters: camera.viewDistanceOffsetMeters,
    selectionDecision: Object.freeze({
      ...camera.selectionDecision,
      activeCameraModifierRefs: Object.freeze([
        ...camera.selectionDecision.activeCameraModifierRefs,
      ]),
      matchedCameraContextRuleIds: Object.freeze([
        ...camera.selectionDecision.matchedCameraContextRuleIds,
      ]),
      cameraViewPreference: Object.freeze({
        ...camera.selectionDecision.cameraViewPreference,
      }),
      diagnostics: Object.freeze(camera.selectionDecision.diagnostics.map(
        (diagnostic) => Object.freeze({ ...diagnostic }),
      )),
      explain: Object.freeze({
        ...camera.selectionDecision.explain,
        cameraViewPreference: Object.freeze({
          ...camera.selectionDecision.explain.cameraViewPreference,
        }),
        cameraContextRules: Object.freeze(
          camera.selectionDecision.explain.cameraContextRules.map((rule) =>
            Object.freeze({
              ...rule,
              unmatchedReasons: Object.freeze([...rule.unmatchedReasons]),
            })
          ),
        ),
        appliedCameraModifierRefs: Object.freeze([
          ...camera.selectionDecision.explain.appliedCameraModifierRefs,
        ]),
      }),
    }),
    ...(isNil(camera.selectedTargetSocketId)
      ? {}
      : { selectedTargetSocketId: camera.selectedTargetSocketId }),
    ...(isNil(camera.targetSocketPositionMetersXYZ)
      ? {}
      : {
          targetSocketPositionMetersXYZ: Object.freeze([
            ...camera.targetSocketPositionMetersXYZ,
          ]) as readonly [number, number, number],
        }),
    isTargetSocketFallback: camera.isTargetSocketFallback,
    desiredTargetPositionMetersXYZ: Object.freeze([
      ...camera.desiredTargetPositionMetersXYZ,
    ]) as readonly [number, number, number],
    desiredPositionMetersXYZ: Object.freeze([
      ...camera.desiredPositionMetersXYZ,
    ]) as readonly [number, number, number],
    actualPositionMetersXYZ: Object.freeze([
      ...camera.actualPositionMetersXYZ,
    ]) as readonly [number, number, number],
    finalFovDegrees: camera.finalFovDegrees,
    ...(isNil(camera.requestedArmLengthMeters)
      ? {}
      : { requestedArmLengthMeters: camera.requestedArmLengthMeters }),
    ...(isNil(camera.safeArmLengthMeters)
      ? {}
      : { safeArmLengthMeters: camera.safeArmLengthMeters }),
    ...(isNil(camera.effectiveArmLengthMeters)
      ? {}
      : { effectiveArmLengthMeters: camera.effectiveArmLengthMeters }),
    ...(isNil(camera.isCollisionRetracted)
      ? {}
      : { isCollisionRetracted: camera.isCollisionRetracted }),
    ...(isNil(camera.collisionHitEntityId)
      ? {}
      : { collisionHitEntityId: camera.collisionHitEntityId }),
    ...(isNil(camera.collisionHitPositionXYZ)
      ? {}
      : {
          collisionHitPositionXYZ: Object.freeze([
            ...camera.collisionHitPositionXYZ,
          ]) as readonly [number, number, number],
        }),
    ...(isNil(camera.collisionHitNormalXYZ)
      ? {}
      : {
          collisionHitNormalXYZ: Object.freeze([
            ...camera.collisionHitNormalXYZ,
          ]) as readonly [number, number, number],
        }),
    ...(isNil(camera.decollisionPhase)
      ? {}
      : { decollisionPhase: camera.decollisionPhase }),
    ...(isNil(camera.startedOverlapping)
      ? {}
      : { startedOverlapping: camera.startedOverlapping }),
    ...(isNil(camera.penetrationDepthMeters)
      ? {}
      : { penetrationDepthMeters: camera.penetrationDepthMeters }),
    ...(isNil(camera.clearHoldRemainingSeconds)
      ? {}
      : { clearHoldRemainingSeconds: camera.clearHoldRemainingSeconds }),
    positionLagXYZ: Object.freeze([...camera.positionLagXYZ]) as
      readonly [number, number, number],
    rotationLagRadiansXYZ: Object.freeze([...camera.rotationLagRadiansXYZ]) as
      readonly [number, number, number],
    ...(isNil(camera.recenterRemainingSeconds)
      ? {}
      : { recenterRemainingSeconds: camera.recenterRemainingSeconds }),
    // A zero-delta render-only camera initialization must not redefine the
    // fixed simulation step published by the canonical Runtime Snapshot.
    fixedStepDeltaSeconds: FIXED_TIME_STEP_SECONDS,
    resolvedParameters: Object.freeze({ ...camera.resolvedParameters }),
    previewParameterOverrides: Object.freeze({
      ...camera.previewParameterOverrides,
    }),
    profileTransitionProgressRatio: camera.profileTransitionProgressRatio,
    controlForwardXYZ: Object.freeze([...camera.controlForwardXYZ]) as
      readonly [number, number, number],
    subjectForwardXYZ: Object.freeze([...camera.subjectForwardXYZ]) as
      readonly [number, number, number],
    subjectVelocityMetersPerSecondXYZ: Object.freeze([
      ...camera.subjectVelocityMetersPerSecondXYZ,
    ]) as readonly [number, number, number],
  });
}

function subjectProjection(
  worldState: WorldStateSnapshotV1,
): WorldRuntimeSnapshotV4["world"]["subjectStatesByEntityId"] {
  const result: Record<
    string,
    WorldRuntimeSnapshotV4["world"]["subjectStatesByEntityId"][string]
  > = {};
  for (const [entityId, entityState] of Object.entries(
    worldState.entityStatesById,
  )) {
    if (entityState.kind !== "spatial-entity-state") continue;
    result[entityId] = Object.freeze({
      entityState,
      capabilityStatesById: Object.freeze(Object.fromEntries(
        Object.entries(worldState.capabilityStatesById).filter(
          ([, capabilityState]) =>
            capabilityState.ownerEntityId === entityId,
        ),
      )),
    });
  }
  return Object.freeze(result);
}

export interface ProjectBabylonWorldRuntimeSnapshotV4Input {
  readonly runtimeSessionId: string;
  readonly fixedInputControllerEntityId: string;
  readonly publication: WorldSessionPublicationV1;
  readonly runtimeProjection: BabylonRuntimeProjectionV1;
  readonly hostPhase: RuntimeHostPhaseV1;
  readonly isPaused: boolean;
}

export function projectBabylonWorldRuntimeSnapshotV4(
  input: ProjectBabylonWorldRuntimeSnapshotV4Input,
): WorldRuntimeSnapshotV4 {
  const { publication, runtimeProjection } = input;
  return Object.freeze({
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId: input.runtimeSessionId,
    worldSessionId: publication.worldState.worldSessionId,
    world: Object.freeze({
      publicationEpoch: publication.publicationEpoch,
      simulationTick: publication.worldState.simulationTick,
      worldStateRef: deriveWorldStateSnapshotRefV1({
        runtimeSessionId: publication.worldState.runtimeSessionId,
        worldSessionId: publication.worldState.worldSessionId,
        worldStateHash: publication.worldState.worldStateHash,
      }),
      worldStateHash: publication.worldState.worldStateHash,
      subjectStatesByEntityId: subjectProjection(publication.worldState),
      gameplayInspection: publication.gameplayInspection,
    }),
    view: Object.freeze({
      viewStateRevision: publication.viewState.viewStateRevision,
      camera: cameraProjection(
        publication,
        runtimeProjection,
        input.fixedInputControllerEntityId,
      ),
    }),
    runtime: Object.freeze({
      phase: input.hostPhase === "failed"
        ? "failed" as const
        : input.hostPhase === "disposed"
        ? "disposed" as const
        : "ready" as const,
      isPaused: input.isPaused,
      fixedTimeStepSeconds: FIXED_TIME_STEP_SECONDS,
    }),
    resources: Object.freeze({
      phase: input.hostPhase === "failed" ? "failed" as const : "ready" as const,
      meshCount: runtimeProjection.resources.meshes,
      physicsBodyCount: runtimeProjection.resources.bodies,
      terrainSampleCount: runtimeProjection.resources.terrainSamples,
    }),
  });
}
