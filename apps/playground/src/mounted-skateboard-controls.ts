import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type {
  GameplayCommandV1,
} from "@whitebox-world/gameplay-contracts";
import type {
  WorldRuntimeSnapshotV4,
  WorldkitBrowserApiV5,
} from "@whitebox-world/runtime-contracts";

import {
  MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
  MOUNTED_SKATEBOARD_S1_DISMOUNT_ACTION_REF,
  MOUNTED_SKATEBOARD_S1_DISMOUNT_COMMAND_ID,
  MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST,
  MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST_REF,
  MOUNTED_SKATEBOARD_S1_MOUNT_ACTION_REF,
  MOUNTED_SKATEBOARD_S1_MOUNT_COMMAND_ID,
  MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST,
  MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST_REF,
  MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID,
} from "./scenes/mounted-skateboard-s1.js";

const CONTROLLER_ENTITY_ID = "controller-primary" as const;
const RIDER_ENTITY_ID = "player" as const;
const MOUNTED_CAMERA_MODIFIER_REF =
  "worldkit://camera-modifier/mounted-framing@1" as const;

export type MountedSkateboardOperationV1 = "mount" | "dismount";

export interface MountedSkateboardControlStateV1 {
  readonly mode: "on-foot" | "mounted" | "inconsistent";
  readonly controlledEntityId?: string;
  readonly cameraTargetEntityId?: string;
  readonly activeCameraProfileRef?: string;
  readonly activeCameraModifierRefs: readonly string[];
  readonly requestedArmLengthMeters?: number;
  readonly effectiveArmLengthMeters?: number;
  readonly mountedCameraModifierActive: boolean;
}

function controlledEntityId(snapshot: WorldRuntimeSnapshotV4): string | undefined {
  const possession = Object.values(
    snapshot.world.gameplayInspection.relationshipStatesById,
  ).filter((relationship) =>
    relationship.type === "possessedBy" &&
    relationship.controllerEntityId === CONTROLLER_ENTITY_ID
  );
  return possession.length === 1 && possession[0]?.type === "possessedBy"
    ? possession[0].controlledEntityId
    : undefined;
}

export function deriveMountedSkateboardControlStateV1(
  snapshot: WorldRuntimeSnapshotV4,
): MountedSkateboardControlStateV1 {
  const relationship = snapshot.world.gameplayInspection
    .relationshipStatesById[MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID];
  const isMounted = relationship?.type === "mountedOn" &&
    relationship.riderEntityId === RIDER_ENTITY_ID &&
    relationship.mountEntityId === MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID;
  const controlled = controlledEntityId(snapshot);
  const camera = snapshot.view.camera;
  const trackingCamera = camera.mode === "tracking" ? camera : undefined;
  const mode = isMounted && controlled === MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID
    ? "mounted"
    : !isMounted && controlled === RIDER_ENTITY_ID
      ? "on-foot"
      : "inconsistent";
  return Object.freeze({
    mode,
    ...(controlled === undefined ? {} : { controlledEntityId: controlled }),
    ...(trackingCamera === undefined
      ? {}
      : {
          cameraTargetEntityId: trackingCamera.targetEntityId,
          activeCameraProfileRef: trackingCamera.activeCameraProfileRef,
          ...(trackingCamera.requestedArmLengthMeters === undefined
            ? {}
            : { requestedArmLengthMeters: trackingCamera.requestedArmLengthMeters }),
          ...(trackingCamera.effectiveArmLengthMeters === undefined
            ? {}
            : { effectiveArmLengthMeters: trackingCamera.effectiveArmLengthMeters }),
        }),
    activeCameraModifierRefs: trackingCamera?.activeCameraModifierRefs ?? [],
    mountedCameraModifierActive:
      trackingCamera?.activeCameraModifierRefs.includes(
        MOUNTED_CAMERA_MODIFIER_REF,
      ) ?? false,
  });
}

export function createMountedSkateboardGameplayCommandV1(
  operation: MountedSkateboardOperationV1,
  snapshot: WorldRuntimeSnapshotV4,
): GameplayCommandV1 {
  const isMount = operation === "mount";
  const request = isMount
    ? MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST
    : MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST;
  const command: GameplayCommandV1 = {
    schemaVersion: 1,
    id: isMount
      ? MOUNTED_SKATEBOARD_S1_MOUNT_COMMAND_ID
      : MOUNTED_SKATEBOARD_S1_DISMOUNT_COMMAND_ID,
    type: "action.activate",
    runtimeSessionId: snapshot.runtimeSessionId,
    worldSessionId: snapshot.worldSessionId,
    controllerEntityId: CONTROLLER_ENTITY_ID,
    expectedPossession: {
      mode: "possessed" as const,
      controlledEntityId: isMount
        ? RIDER_ENTITY_ID
        : MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
    },
    actionExecutionId: isMount
      ? "action-execution.mounted-skateboard-s1.mount"
      : "action-execution.mounted-skateboard-s1.dismount",
    semanticActionRef: isMount
      ? MOUNTED_SKATEBOARD_S1_MOUNT_ACTION_REF
      : MOUNTED_SKATEBOARD_S1_DISMOUNT_ACTION_REF,
    actorEntityId: RIDER_ENTITY_ID,
    actionRequestRef: isMount
      ? MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST_REF
      : MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST_REF,
    actionRequestHash: sha256CanonicalJson(request) as Sha256HashV1,
  };
  return Object.freeze(command);
}

export interface MountedSkateboardControlsV1 {
  refresh(): void;
  dispose(): void;
}

export function installMountedSkateboardControlsV1(
  root: HTMLDivElement,
  api: WorldkitBrowserApiV5,
): MountedSkateboardControlsV1 {
  root.hidden = false;
  root.innerHTML = `
    <div class="mounted-controls-heading">
      <span>CAMERA / MOUNT ACCEPTANCE</span>
      <strong data-mounted-status>准备挂载</strong>
    </div>
    <div class="mounted-controls-actions">
      <button type="button" data-mounted-action="mount">Mount 上滑板</button>
      <button type="button" data-mounted-action="dismount">Dismount 下滑板</button>
    </div>
    <dl class="mounted-controls-telemetry">
      <div><dt>Possession</dt><dd data-mounted-possession>—</dd></div>
      <div><dt>Camera Target</dt><dd data-mounted-camera-target>—</dd></div>
      <div><dt>Modifier</dt><dd data-mounted-camera-modifier>—</dd></div>
      <div><dt>Arm requested / effective</dt><dd data-mounted-camera-arm>—</dd></div>
    </dl>
    <p class="mounted-controls-result" data-mounted-result>点击 Mount 后可直接使用 WASD 移动并观察镜头。</p>
  `;
  const mountButton = root.querySelector<HTMLButtonElement>(
    '[data-mounted-action="mount"]',
  )!;
  const dismountButton = root.querySelector<HTMLButtonElement>(
    '[data-mounted-action="dismount"]',
  )!;
  const status = root.querySelector<HTMLElement>("[data-mounted-status]")!;
  const possession = root.querySelector<HTMLElement>("[data-mounted-possession]")!;
  const cameraTarget = root.querySelector<HTMLElement>("[data-mounted-camera-target]")!;
  const modifier = root.querySelector<HTMLElement>("[data-mounted-camera-modifier]")!;
  const arm = root.querySelector<HTMLElement>("[data-mounted-camera-arm]")!;
  const result = root.querySelector<HTMLElement>("[data-mounted-result]")!;
  let isBusy = false;
  let completedCycle = false;
  let currentWorldSessionId: string | undefined;

  const render = (): void => {
    const snapshot = api.getSnapshot();
    if (currentWorldSessionId !== snapshot.worldSessionId) {
      currentWorldSessionId = snapshot.worldSessionId;
      completedCycle = false;
      result.textContent = "点击 Mount 后可直接使用 WASD 移动并观察镜头。";
    }
    const state = deriveMountedSkateboardControlStateV1(snapshot);
    status.textContent = state.mode === "mounted"
      ? "已挂载"
      : state.mode === "on-foot"
        ? completedCycle ? "验收完成" : "准备挂载"
        : "状态不一致";
    status.dataset.mode = state.mode;
    possession.textContent = state.controlledEntityId ?? "unbound";
    cameraTarget.textContent = state.cameraTargetEntityId ?? "unbound";
    modifier.textContent = state.mountedCameraModifierActive
      ? "mounted-framing active"
      : "none";
    arm.textContent = state.requestedArmLengthMeters === undefined
      ? "disabled"
      : `${state.requestedArmLengthMeters.toFixed(2)}m / ${state.effectiveArmLengthMeters?.toFixed(2) ?? "—"}m`;
    mountButton.disabled = isBusy || completedCycle || state.mode !== "on-foot";
    dismountButton.disabled = isBusy || state.mode !== "mounted";
  };

  const execute = async (operation: MountedSkateboardOperationV1): Promise<void> => {
    if (isBusy) return;
    isBusy = true;
    result.textContent = operation === "mount" ? "正在提交挂载事务…" : "正在提交安全下车事务…";
    render();
    try {
      const receipt = await api.executeGameplayCommand(
        createMountedSkateboardGameplayCommandV1(operation, api.getSnapshot()),
      );
      if (receipt.status !== "committed") {
        result.textContent = `${receipt.status}: ${receipt.diagnostic.code}`;
        return;
      }
      await api.runFixedInput([{ actions: [], ticks: 1 }]);
      if (operation === "dismount") completedCycle = true;
      result.textContent = operation === "mount"
        ? "挂载已提交：使用 WASD 移动，确认 7m mounted-framing 后再 Dismount。"
        : "下车已提交：镜头目标与 modifier 应恢复；重置世界后可重复验收。";
    } catch (error) {
      result.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      isBusy = false;
      render();
    }
  };
  const mount = (): void => { void execute("mount"); };
  const dismount = (): void => { void execute("dismount"); };
  mountButton.addEventListener("click", mount);
  dismountButton.addEventListener("click", dismount);
  const interval = window.setInterval(render, 250);
  render();

  return Object.freeze({
    refresh: render,
    dispose() {
      window.clearInterval(interval);
      mountButton.removeEventListener("click", mount);
      dismountButton.removeEventListener("click", dismount);
      root.replaceChildren();
      root.hidden = true;
    },
  });
}
