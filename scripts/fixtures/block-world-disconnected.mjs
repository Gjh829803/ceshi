const { BoxGeometry, Mesh, Scene } = globalThis.THREE;
const {
  BLOCK_PRESET_REFS_V1,
  bindWorldkitBlockV1,
  createWorldkitBlockMaterialV1,
} = globalThis.WorldKitBlock;

export function buildBlockWorld() {
  const scene = new Scene();
  for (const [id, x] of [["ground-spawn", 0], ["ground-middle", 1], ["ground-island", 4]]) {
    const mesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      createWorldkitBlockMaterialV1(BLOCK_PRESET_REFS_V1.walkable),
    );
    mesh.position.set(x, 0, 0);
    bindWorldkitBlockV1(mesh, {
      id,
      presetRef: BLOCK_PRESET_REFS_V1.walkable,
    });
    scene.add(mesh);
  }
  return {
    scene,
    world: { id: "disconnected-block-world", seed: 2048 },
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
        id: "target-middle",
        navigationRole: "middle",
        standPositionMetersXYZ: [1, 0.5, 0],
      },
      {
        id: "target-island",
        navigationRole: "remote",
        standPositionMetersXYZ: [4, 0.5, 0],
      },
    ],
    requiredGroundTraversalBands: [{
      id: "entry-island-band",
      centerlineStandPositionsMetersXYZ: [
        [0, 0.5, 0],
        [1, 0.5, 0],
        [4, 0.5, 0],
      ],
      halfWidthMeters: 0.75,
      isBidirectional: true,
    }],
    spaceTransitions: [],
    requireSingleReachableComponent: true,
  };
}
