const { BoxGeometry, Mesh, Scene } = globalThis.THREE;
const {
  BLOCK_PRESET_REFS_V1,
  bindWorldkitBlockV1,
  createWorldkitBlockMaterialV1,
} = globalThis.WorldKitBlock;

export function buildBlockWorld() {
  const scene = new Scene();
  const geometries = {
    full: new BoxGeometry(1, 1, 1),
    half: new BoxGeometry(1, 0.5, 1),
    quarter: new BoxGeometry(0.5, 0.5, 1),
    small: new BoxGeometry(0.5, 0.5, 0.5),
  };
  const materials = new Map();
  const material = (presetRef) => {
    const current = materials.get(presetRef);
    if (current !== undefined) return current;
    const created = createWorldkitBlockMaterialV1(presetRef);
    materials.set(presetRef, created);
    return created;
  };
  const place = (id, shape, presetRef, positionMetersXYZ) => {
    const mesh = new Mesh(geometries[shape], material(presetRef));
    mesh.position.set(...positionMetersXYZ);
    bindWorldkitBlockV1(mesh, { id, presetRef });
    scene.add(mesh);
  };

  for (let z = -2; z <= 2; z += 1) {
    for (let x = -4; x <= -2; x += 1) {
      place(`low-${x + 4}-${z + 2}`, "full", BLOCK_PRESET_REFS_V1.walkable, [x, 0, z]);
    }
    place(`transition-half-${z + 2}`, "half", BLOCK_PRESET_REFS_V1.walkable, [-1, 0.75, z]);
    for (let x = 0; x <= 4; x += 1) {
      place(`high-${x}-${z + 2}`, "full", BLOCK_PRESET_REFS_V1.walkable, [x, 1, z]);
    }
  }
  place("rail-quarter-left", "quarter", BLOCK_PRESET_REFS_V1.obstacle, [-0.75, 1.75, -2]);
  place("rail-quarter-right", "quarter", BLOCK_PRESET_REFS_V1.obstacle, [-0.25, 1.75, -2]);
  place("detail-small", "small", BLOCK_PRESET_REFS_V1.obstacle, [2.25, 1.75, -1.75]);

  return {
    scene,
    world: { id: "mixed-shape-slope-world", seed: 505 },
    controlledSubject: {
      kind: "registered",
      entityId: "player",
      subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
      visualTargetId: "visual-target-1",
      yawQuarterTurnsY: 3,
    },
    camera: {
      entityId: "camera-main",
      pitchRadians: 0.12,
      distanceMeters: 6,
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
    spawnStandPositionMetersXYZ: [-3, 0.5, 0],
    requiredTargets: [
      {
        id: "slope-middle",
        navigationRole: "middle",
        standPositionMetersXYZ: [-1, 1, 0],
      },
      {
        id: "high-platform",
        navigationRole: "remote",
        standPositionMetersXYZ: [3, 1.5, 0],
      },
    ],
    requiredGroundTraversalBands: [{
      id: "entry-slope-band",
      centerlineStandPositionsMetersXYZ: [
        [-3, 0.5, 0],
        [-1, 1, 0],
      ],
      halfWidthMeters: 1,
      isBidirectional: true,
    }],
    spaceTransitions: [],
    requireSingleReachableComponent: true,
  };
}
