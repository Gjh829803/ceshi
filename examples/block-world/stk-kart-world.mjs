const {
  BoxGeometry,
  Mesh,
  Scene,
} = globalThis.THREE;
const {
  BLOCK_PRESET_REFS_V1,
  bindWorldkitBlockV1,
  createWorldkitBlockMaterialV1,
} = globalThis.WorldKitBlock;

export function buildBlockWorld() {
  const scene = new Scene();
  const geometry = new BoxGeometry(1, 1, 1);
  const materialByPresetRef = new Map();
  const material = (presetRef) => {
    const existing = materialByPresetRef.get(presetRef);
    if (existing !== undefined) return existing;
    const created = createWorldkitBlockMaterialV1(presetRef);
    materialByPresetRef.set(presetRef, created);
    return created;
  };
  for (let z = -15; z <= 15; z += 1) {
    for (let x = -15; x <= 15; x += 1) {
      const presetRef = x <= -6
        ? BLOCK_PRESET_REFS_V1.walkableIce
        : x >= 6
          ? BLOCK_PRESET_REFS_V1.walkableMud
          : BLOCK_PRESET_REFS_V1.walkable;
      const block = new Mesh(geometry, material(presetRef));
      block.position.set(x, 0, z);
      bindWorldkitBlockV1(block, {
        id: `track-${x + 15}-${z + 15}`,
        presetRef,
      });
      scene.add(block);
    }
  }

  return {
    scene,
    world: { id: "stk-kart-world", seed: 904 },
    controlledSubject: {
      kind: "assembly",
      entityId: "player",
      visualTargetId: "visual-target-1",
      yawQuarterTurnsY: 0,
      assembly: {
        id: "stk-kart-player",
        baseSubject: {
          kind: "subject-pack",
          subjectPackId: "kart-control-lab.stk-kart",
        },
        attachments: [],
        motion: { motionPackId: "vehicle.stk-kart.arcade" },
        presentation: { kind: "automatic" },
      },
    },
    camera: {
      kind: "pack",
      entityId: "camera-main",
      cameraPackId: "third-person.kart-chase",
      target: {
        kind: "base-subject-socket",
        socketId: "CameraTarget3D",
      },
      aspectRatio: 16 / 9,
    },
    subjectTraversalProfile: {
      clearanceHeightMeters: 2,
      footprintRadiusMetersXZ: 1,
      maximumStepUpMeters: 0.3,
      maximumStepDownMeters: 0.3,
      maximumAutoSmoothHeightDeltaMeters: 1,
      maximumAdjacentWalkableHeightDeltaMeters: 2,
      canStandOnCloud: false,
    },
    spawnStandPositionMetersXYZ: [0, 0.5, 8],
    requiredTargets: [],
    requiredGroundTraversalBands: [],
    visualTargetFacings: [],
    spaceTransitions: [],
    requireSingleReachableComponent: true,
  };
}
