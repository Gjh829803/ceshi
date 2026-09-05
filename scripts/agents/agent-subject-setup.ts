import type {
  BlockCameraPackIdV1,
  BlockCameraTargetBindingV1,
  BlockMotionPackIdV1,
  BlockSubjectAssemblyDefinitionV1,
  BlockWorldPackCameraV1,
  CheckBlockWorldInputV2,
} from "@whitebox-world/block-world";
import catalogJson from "../../.codex/skills/worldkit-block-builder/references/agent-authoring-catalog.json";
import type { AgentAuthoringCatalogV2 } from "../lib/agent-authoring-catalog.js";

const catalog = catalogJson as unknown as AgentAuthoringCatalogV2;

/** Small menu for discovery; inspect just the chosen row with getSubjectPack. */
export function listSubjectPacks({ includePrimitiveProxies = false } = {}) {
  return structuredClone(catalog.subjectPacks
    .filter(({ visualKind }) => includePrimitiveProxies || visualKind !== "primitive-proxy")
    .map(({ id, displayName, visualKind, category, selectionPolicy, recommendedMotionPackIds }) => ({
      id, displayName, visualKind, category, selectionPolicy, recommendedMotionPackIds,
    })));
}

export function listCameraPacks() {
  return structuredClone(catalog.cameraPacks);
}

/** Return a private copy so one scene cannot alter another scene's defaults. */
export function getSubjectPack(subjectPackId: string) {
  const pack = catalog.subjectPacks.find(({ id }) => id === subjectPackId);
  if (pack === undefined) throw new Error(`Unknown Subject Pack: ${subjectPackId}`);
  return structuredClone(pack);
}

export function getCameraPack(cameraPackId: BlockCameraPackIdV1) {
  const pack = catalog.cameraPacks.find(({ id }) => id === cameraPackId);
  if (pack === undefined) throw new Error(`Unknown Camera Pack: ${cameraPackId}`);
  return structuredClone(pack);
}

export interface CameraSetupOptions {
  cameraPackId: BlockCameraPackIdV1;
  entityId?: string;
  subjectPackId?: string;
  target?: BlockCameraTargetBindingV1;
  tuning?: BlockWorldPackCameraV1["tuning"];
}

/** Works with both reusable bases and Agent-drawn rigid shapes. */
export function createCameraSetup(options: CameraSetupOptions): BlockWorldPackCameraV1 {
  const pack = getCameraPack(options.cameraPackId);
  const subject = options.subjectPackId === undefined ? undefined : getSubjectPack(options.subjectPackId);
  let target = options.target;
  if (target === undefined && pack.mode === "first-person") {
    const eye = subject?.sockets.find(({ id }) => id === "FirstPersonView");
    if (eye === undefined) throw new Error("First person needs a published FirstPersonView Socket or an explicit target point.");
    target = { kind: "base-subject-socket", socketId: eye.id };
  }
  target ??= subject?.recommendedSetup.camera.target ?? { kind: "assembly-bounds", heightRatio: 0.65 };
  return structuredClone({
    kind: "pack",
    entityId: options.entityId ?? "camera-main",
    cameraPackId: options.cameraPackId,
    target,
    ...(options.tuning === undefined ? {} : { tuning: options.tuning }),
    aspectRatio: 16 / 9,
  });
}

export interface SubjectSetupOptions {
  subjectPackId: string;
  entityId?: string;
  assemblyId?: string;
  visualTargetId?: string;
  yawQuarterTurnsY?: number;
  attachments?: BlockSubjectAssemblyDefinitionV1["attachments"];
  motionPackId?: BlockMotionPackIdV1;
  presentation?: BlockSubjectAssemblyDefinitionV1["presentation"];
  camera?: Omit<CameraSetupOptions, "subjectPackId" | "cameraPackId"> & {
    cameraPackId?: BlockCameraPackIdV1;
  };
}

/** Expand recommendations into ordinary Assembly fields; explicit choices win. */
export function createSubjectSetup(options: SubjectSetupOptions): Pick<
  CheckBlockWorldInputV2,
  "controlledSubject" | "camera" | "subjectTraversalProfile" | "requireSingleReachableComponent"
> {
  const pack = getSubjectPack(options.subjectPackId);
  const defaults = pack.recommendedSetup;
  const motionPackId = options.motionPackId ?? defaults.motion.motionPackId;
  if (!pack.compatibleMotionPackIds.includes(motionPackId)) {
    throw new Error(`Motion Pack ${motionPackId} cannot be compiled with ${pack.id}.`);
  }
  const motion = catalog.motionPacks.find(({ id }) => id === motionPackId)!;
  const attachments = structuredClone(options.attachments ?? []);
  const cameraPackId = options.camera?.cameraPackId ?? defaults.camera.cameraPackId;
  const cameraOptions: CameraSetupOptions = {
    ...options.camera,
    cameraPackId,
    subjectPackId: pack.id,
  };
  if (cameraOptions.target === undefined && attachments.length > 0 &&
      getCameraPack(cameraPackId).mode === "third-person") {
    cameraOptions.target = { kind: "assembly-bounds", heightRatio: 0.65 };
  }
  return {
    controlledSubject: {
      kind: "assembly",
      entityId: options.entityId ?? "player",
      visualTargetId: options.visualTargetId ?? "visual-target-1",
      yawQuarterTurnsY: options.yawQuarterTurnsY ?? 0,
      assembly: {
        id: options.assemblyId ?? "player-assembly",
        baseSubject: { kind: "subject-pack", subjectPackId: pack.id },
        attachments,
        motion: { motionPackId },
        presentation: structuredClone(options.presentation ?? defaults.presentation),
      },
    },
    camera: createCameraSetup(cameraOptions),
    subjectTraversalProfile: structuredClone(pack.traversalEnvelope),
    requireSingleReachableComponent: motion.movementModes.every((mode) => mode.startsWith("ground-")),
  };
}
