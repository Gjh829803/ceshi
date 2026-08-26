import type {
  CameraRigTrackV1,
  CompiledSimulationTakeV1,
  ControlIntentTrackV1,
} from "@whitebox-world/control-capture";
import type {
  ExpectedPossessionV1,
  GameplayCommandReceiptV1,
  GameplayCommandV1,
} from "@whitebox-world/gameplay-contracts";
import type {
  CameraViewInputV1,
  ControlCaptureCapabilitiesV1,
  ControlCaptureRequestV1,
  FixedInputV1,
  RenderReadyReceiptV1,
  RuntimeActivityReceiptV1,
  RuntimeActivityRequestV1,
  RuntimeControlCaptureFrameV1,
  WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import { isEqual, isNil } from "lodash-es";

export interface SimulationTakeBrowserDriverV1 {
  getControlCaptureCapabilities(): ControlCaptureCapabilitiesV1 | Promise<ControlCaptureCapabilitiesV1>;
  setPaused(paused: boolean): WorldRuntimeSnapshotV4 | Promise<WorldRuntimeSnapshotV4>;
  reset(): Promise<WorldRuntimeSnapshotV4>;
  acquireRuntimeActivity(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1 | Promise<RuntimeActivityReceiptV1>;
  releaseRuntimeActivity(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1 | Promise<RuntimeActivityReceiptV1>;
  executeGameplayCommand(
    command: GameplayCommandV1,
  ): Promise<GameplayCommandReceiptV1>;
  runFixedInput(steps: readonly FixedInputV1[]): Promise<WorldRuntimeSnapshotV4>;
  adjustCameraView(input: CameraViewInputV1): WorldRuntimeSnapshotV4 | Promise<WorldRuntimeSnapshotV4>;
  waitForSimulationTick(expectedSimulationTick: number): Promise<WorldRuntimeSnapshotV4>;
  waitForRenderReady(expectedSimulationTick: number): Promise<RenderReadyReceiptV1>;
  captureControlFrame(request: ControlCaptureRequestV1): Promise<RuntimeControlCaptureFrameV1>;
}

export interface RunCompiledSimulationTakeOptionsV1 {
  readonly compiledTake: CompiledSimulationTakeV1;
  readonly driver: SimulationTakeBrowserDriverV1;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly onFrame: (frame: RuntimeControlCaptureFrameV1) => void | Promise<void>;
}

export interface SimulationTakeRunResultV1 {
  readonly capturedFrameCount: number;
  readonly runtimeSessionId: string;
  readonly semanticClasses: RuntimeControlCaptureFrameV1["semanticClasses"];
  readonly instances: RuntimeControlCaptureFrameV1["instances"];
}

function validateCaptureDimensions(
  widthPixels: number,
  heightPixels: number,
  capabilities: ControlCaptureCapabilitiesV1,
): void {
  if (!capabilities.available) {
    throw new Error("CONTROL_CAPTURE_CAPABILITY_UNAVAILABLE");
  }
  if (
    capabilities.captureProfileRef !== "worldkit://capture/profile/control-video@1" ||
    capabilities.captureEncodingProfileRef !== "worldkit://capture/encoding/web-v1@1"
  ) {
    throw new Error("CONTROL_CAPTURE_PROFILE_MISMATCH");
  }
  if (
    !Number.isSafeInteger(widthPixels) ||
    !Number.isSafeInteger(heightPixels) ||
    widthPixels < 1 ||
    heightPixels < 1 ||
    widthPixels > capabilities.maximumWidthPixels ||
    heightPixels > capabilities.maximumHeightPixels
  ) {
    throw new RangeError("Control capture dimensions exceed Browser capabilities.");
  }
}

function actionsForIntent(
  moveAxesXZ: readonly [number, number],
  runEnabled: boolean,
  jumpPressed: boolean,
): FixedInputV1["actions"] {
  const actions: FixedInputV1["actions"][number][] = [];
  if (moveAxesXZ[1] > 0) actions.push("move-forward");
  if (moveAxesXZ[1] < 0) actions.push("move-backward");
  if (moveAxesXZ[0] < 0) actions.push("move-left");
  if (moveAxesXZ[0] > 0) actions.push("move-right");
  if (jumpPressed) actions.push("jump");
  if (runEnabled) actions.push("run");
  return actions;
}

function assertCapturedFrame(
  frame: RuntimeControlCaptureFrameV1,
  request: ControlCaptureRequestV1,
  receipt: RenderReadyReceiptV1,
): void {
  if (
    frame.captureFrameIndex !== request.captureFrameIndex ||
    frame.simulationTick !== request.expectedSimulationTick ||
    frame.renderReadyReceiptId !== receipt.id ||
    frame.renderFrameIndex !== receipt.renderFrameIndex ||
    frame.runtimeSessionId !== receipt.runtimeSessionId ||
    frame.widthPixels !== request.widthPixels ||
    frame.heightPixels !== request.heightPixels ||
    frame.snapshot.world.simulationTick !== request.expectedSimulationTick
  ) {
    throw new Error("CONTROL_CAPTURE_FRAME_METADATA_MISMATCH");
  }
  const expectedPassIds = [
    "neutral-color",
    "linear-depth-meters",
    "semantic-class-id",
    "instance-id",
    "world-normal",
  ];
  if (!isEqual(Object.keys(frame.passesById).sort(), expectedPassIds.sort())) {
    throw new Error("CONTROL_CAPTURE_REQUIRED_PASS_MISSING");
  }
  for (const [passId, payload] of Object.entries(frame.passesById)) {
    if (payload.passId !== passId || payload.byteLength < 1 || payload.bytesBase64.length < 1) {
      throw new Error("CONTROL_CAPTURE_PASS_PAYLOAD_INVALID");
    }
  }
}

function expectedPossessionForController(
  snapshot: WorldRuntimeSnapshotV4,
  controllerEntityId: string,
): ExpectedPossessionV1 {
  const possession = Object.values(
    snapshot.world.gameplayInspection.relationshipStatesById,
  ).find((relationship) =>
    relationship.type === "possessedBy" &&
    relationship.controllerEntityId === controllerEntityId
  );
  return isNil(possession) || possession.type !== "possessedBy"
    ? { mode: "unbound" }
    : {
        mode: "possessed",
        controlledEntityId: possession.controlledEntityId,
      };
}

export async function runCompiledSimulationTakeV1(
  options: RunCompiledSimulationTakeOptionsV1,
): Promise<SimulationTakeRunResultV1> {
  const { compiledTake, driver } = options;
  validateCaptureDimensions(
    options.widthPixels,
    options.heightPixels,
    await driver.getControlCaptureCapabilities(),
  );
  if (compiledTake.take.controllers.length !== 1) {
    throw new Error("SIMULATION_TAKE_CONTROLLER_COUNT_UNSUPPORTED");
  }
  const controller = compiledTake.take.controllers[0]!;
  const controlTrack = compiledTake.take.tracks.find(
    (track): track is ControlIntentTrackV1 =>
      track.kind === "control-intent" && track.controllerId === controller.id,
  );
  const cameraTracks = compiledTake.take.tracks.filter(
    (track): track is CameraRigTrackV1 => track.kind === "camera-rig",
  );
  if (cameraTracks.length > 1) {
    throw new Error("SIMULATION_TAKE_CAMERA_TRACK_COUNT_UNSUPPORTED");
  }
  const cameraTrack = cameraTracks[0];

  await driver.setPaused(true);
  const resetSnapshot = await driver.reset();
  const activityRequest: RuntimeActivityRequestV1 = {
    schemaVersion: 1,
    id: `activity:simulation-take:${compiledTake.take.id}:${resetSnapshot.worldSessionId}`,
    activityKind: "simulation-take",
    expectedWorldSessionId: resetSnapshot.worldSessionId,
  };
  const activity = await driver.acquireRuntimeActivity(activityRequest);
  if (activity.status !== "active") {
    throw new Error("SIMULATION_TAKE_ACTIVITY_ACQUIRE_REJECTED");
  }

  let primaryFailure: unknown;
  try {
    if (
      activity.requestId !== activityRequest.id ||
      activity.activityKind !== activityRequest.activityKind ||
      activity.worldSessionId !== activityRequest.expectedWorldSessionId
    ) {
      throw new Error("SIMULATION_TAKE_ACTIVITY_ACQUIRE_REJECTED");
    }
    const expectedPossession = expectedPossessionForController(
      resetSnapshot,
      controller.id,
    );
    if (
      expectedPossession.mode !== "possessed" ||
      expectedPossession.controlledEntityId !== controller.controlledEntityId
    ) {
      const bindingCommand: GameplayCommandV1 = {
        schemaVersion: 1,
        id: `command:simulation-take:${compiledTake.take.id}:${resetSnapshot.worldSessionId}:control.bind`,
        type: "control.bind",
        runtimeSessionId: resetSnapshot.runtimeSessionId,
        worldSessionId: resetSnapshot.worldSessionId,
        controllerEntityId: controller.id,
        controlledEntityId: controller.controlledEntityId,
        expectedPossession,
      };
      const binding = await driver.executeGameplayCommand(bindingCommand);
      if (binding.status !== "committed") {
        throw new Error("SIMULATION_TAKE_CONTROL_BINDING_REJECTED");
      }
    }
    if (
      !isNil(cameraTrack) &&
      (
        resetSnapshot.view.camera.mode !== "tracking" ||
        cameraTrack.cameraEntityId !== resetSnapshot.view.camera.id
      )
    ) {
      throw new Error("SIMULATION_TAKE_CAMERA_ENTITY_MISMATCH");
    }

    if (compiledTake.take.startTick > resetSnapshot.world.simulationTick) {
      await driver.runFixedInput([{
        actions: [],
        ticks: compiledTake.take.startTick - resetSnapshot.world.simulationTick,
      }]);
    }
    let activeMoveAxesXZ: readonly [number, number] = [0, 0];
    let activeRunEnabled = false;
    let cameraYawOffsetRadians = 0;
    let cameraPitchOffsetRadians = 0;
    let cameraDistanceOffsetMeters = 0;
    const captureByTick = new Map(
      compiledTake.captureSchedulePlan.entries.map((entry) => [entry.simulationTick, entry]),
    );
    let runtimeSessionId: string | undefined;
    let semanticClasses: RuntimeControlCaptureFrameV1["semanticClasses"] | undefined;
    let instances: RuntimeControlCaptureFrameV1["instances"] | undefined;

    for (
      let tick = compiledTake.take.startTick;
      tick < compiledTake.take.endTickExclusive;
      tick += 1
    ) {
      const intentKeyframe = controlTrack?.keyframes.find((keyframe) => keyframe.tick === tick);
      if (!isNil(intentKeyframe)) {
        activeMoveAxesXZ = intentKeyframe.moveAxesXZ;
        activeRunEnabled = intentKeyframe.runEnabled;
      }
      const cameraKeyframe = cameraTrack?.keyframes.find((keyframe) => keyframe.tick === tick);
      if (!isNil(cameraKeyframe)) {
        await driver.adjustCameraView({
          yawDeltaRadians: cameraKeyframe.viewYawOffsetRadians - cameraYawOffsetRadians,
          pitchDeltaRadians: cameraKeyframe.viewPitchOffsetRadians - cameraPitchOffsetRadians,
          zoomDeltaMeters: cameraKeyframe.viewDistanceOffsetMeters - cameraDistanceOffsetMeters,
        });
        cameraYawOffsetRadians = cameraKeyframe.viewYawOffsetRadians;
        cameraPitchOffsetRadians = cameraKeyframe.viewPitchOffsetRadians;
        cameraDistanceOffsetMeters = cameraKeyframe.viewDistanceOffsetMeters;
      }

      const capture = captureByTick.get(tick);
      if (!isNil(capture)) {
        await driver.waitForSimulationTick(tick);
        const receipt = await driver.waitForRenderReady(tick);
        const request: ControlCaptureRequestV1 = {
          captureFrameIndex: capture.captureFrameIndex,
          expectedSimulationTick: tick,
          renderReadyReceiptId: receipt.id,
          widthPixels: options.widthPixels,
          heightPixels: options.heightPixels,
        };
        const frame = await driver.captureControlFrame(request);
        assertCapturedFrame(frame, request, receipt);
        if (isNil(runtimeSessionId)) {
          runtimeSessionId = frame.runtimeSessionId;
          semanticClasses = frame.semanticClasses;
          instances = frame.instances;
        } else if (
          runtimeSessionId !== frame.runtimeSessionId ||
          !isEqual(semanticClasses, frame.semanticClasses) ||
          !isEqual(instances, frame.instances)
        ) {
          throw new Error("CONTROL_CAPTURE_FRAME_TABLE_MISMATCH");
        }
        await options.onFrame(frame);
      }

      const jumpPressed = intentKeyframe?.jumpPressed === true;
      await driver.runFixedInput([{
        actions: actionsForIntent(activeMoveAxesXZ, activeRunEnabled, jumpPressed),
        ticks: 1,
      }]);
    }

    if (isNil(runtimeSessionId) || isNil(semanticClasses) || isNil(instances)) {
      throw new Error("SIMULATION_TAKE_CAPTURE_SCHEDULE_EMPTY");
    }
    return {
      capturedFrameCount: compiledTake.captureSchedulePlan.entries.length,
      runtimeSessionId,
      semanticClasses,
      instances,
    };
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    try {
      const released = await driver.releaseRuntimeActivity(activityRequest);
      if (
        (released.status !== "released" && released.status !== "terminated-by-host") ||
        released.requestId !== activityRequest.id ||
        released.activityKind !== activityRequest.activityKind ||
        released.worldSessionId !== activityRequest.expectedWorldSessionId
      ) {
        throw new Error("SIMULATION_TAKE_ACTIVITY_RELEASE_REJECTED");
      }
    } catch (releaseError) {
      if (isNil(primaryFailure)) throw releaseError;
    }
  }
}
