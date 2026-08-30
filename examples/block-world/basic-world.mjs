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
  const addBlock = (id, presetRef, positionXYZ, visualGroupId) => {
    const mesh = new Mesh(geometry, material(presetRef));
    mesh.name = id;
    mesh.position.set(...positionXYZ);
    bindWorldkitBlockV1(mesh, {
      id,
      presetRef,
      ...(visualGroupId === undefined ? {} : { visualGroupId }),
    });
    scene.add(mesh);
  };

  // These loops and the one-block helper are authored by the Agent. WorldKit
  // intentionally stays at direct, bound box placement without a second DSL.
  for (let z = -96; z < 96; z += 1) {
    for (let x = -96; x < 96; x += 1) {
      addBlock(
        `ground-${x + 96}-${z + 96}`,
        BLOCK_PRESET_REFS_V1.walkable,
        [x, 0, z],
      );
    }
  }

  addBlock("palace-base", BLOCK_PRESET_REFS_V1.landmarkOrange, [64, 1, -64], "visual-target-2");
  addBlock("palace-tower", BLOCK_PRESET_REFS_V1.landmarkOrange, [64, 2, -64], "visual-target-2");
  addBlock("garden-rock", BLOCK_PRESET_REFS_V1.obstacle, [-2, 1, -2]);
  addBlock("water-edge", BLOCK_PRESET_REFS_V1.water, [-80, 1, 80]);
  addBlock("cloud-far", BLOCK_PRESET_REFS_V1.cloudPassable, [0, 12, -90]);

  return {
    scene,
    world: { id: "basic-block-world", seed: 1024 },
    controlledSubject: {
      kind: "registered",
      entityId: "player",
      subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
      visualTargetId: "visual-target-1",
      yawQuarterTurnsY: 0,
    },
    camera: {
      entityId: "camera-main",
      pitchRadians: 0.12,
      distanceMeters: 5,
      targetHeightMeters: 1.25,
      fovDegrees: 56,
      aspectRatio: 16 / 9,
    },
    subjectTraversalProfile: {
      clearanceHeightMeters: 1.8,
      footprintRadiusMetersXZ: 0.35,
      maximumStepUpMeters: 0.3,
      maximumStepDownMeters: 0.3,
      maximumAutoSmoothHeightDeltaMeters: 1,
      maximumAdjacentWalkableHeightDeltaMeters: 2,
      canStandOnCloud: false,
    },
    spawnStandPositionMetersXYZ: [0, 0.5, 0],
    requiredTargets: [
      {
        id: "garden-middle",
        navigationRole: "middle",
        standPositionMetersXYZ: [32, 0.5, -32],
      },
      {
        id: "garden-destination",
        navigationRole: "remote",
        standPositionMetersXYZ: [80, 0.5, -80],
      },
    ],
    requiredGroundTraversalBands: [{
      id: "entry-to-garden-middle",
      centerlineStandPositionsMetersXYZ: [
        [0, 0.5, 0],
        [16, 0.5, -16],
        [32, 0.5, -32],
      ],
      halfWidthMeters: 4,
      isBidirectional: true,
    }],
    spaceTransitions: [],
    requireSingleReachableComponent: true,
  };
}
