const { BoxGeometry, Mesh, Scene } = globalThis.THREE;
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
  const addBlock = (id, presetRef, positionMetersXYZ, binding = {}) => {
    const mesh = new Mesh(geometry, material(presetRef));
    mesh.name = id;
    mesh.position.set(...positionMetersXYZ);
    bindWorldkitBlockV1(mesh, { id, presetRef, ...binding });
    scene.add(mesh);
  };

  for (let z = -4; z <= 4; z += 1) {
    for (let x = -4; x <= 4; x += 1) {
      addBlock(`entry-ground-${x + 4}-${z + 4}`, BLOCK_PRESET_REFS_V1.walkable, [x, 0, z]);
      addBlock(`courtyard-ground-${x + 4}-${z + 4}`, BLOCK_PRESET_REFS_V1.walkable, [x + 20, 0, z]);
    }
  }

  addBlock(
    "entry-gate-landmark",
    BLOCK_PRESET_REFS_V1.landmarkOrange,
    [4, 1, -2],
    { visualGroupId: "visual-target-2" },
  );
  addBlock(
    "courtyard-gate-landmark",
    BLOCK_PRESET_REFS_V1.landmarkOrange,
    [16, 1, -2],
    { visualGroupId: "visual-target-2" },
  );

  const outwardId = "gate-a-to-courtyard";
  const returnId = "gate-a-to-entry";
  addBlock(
    "entry-gate-trigger",
    BLOCK_PRESET_REFS_V1.interactiveTrigger,
    [3, 1, 0],
    { interactionInstanceId: outwardId },
  );
  addBlock(
    "courtyard-gate-trigger",
    BLOCK_PRESET_REFS_V1.interactiveTrigger,
    [17, 1, 0],
    { interactionInstanceId: returnId },
  );

  return {
    scene,
    world: { id: "linked-block-world", seed: 1207 },
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
        id: "entry-gate-middle",
        navigationRole: "middle",
        standPositionMetersXYZ: [3, 0.5, 0],
      },
      {
        id: "courtyard-destination",
        navigationRole: "remote",
        standPositionMetersXYZ: [20, 0.5, 0],
      },
    ],
    requiredGroundTraversalBands: [{
      id: "entry-gate-band",
      centerlineStandPositionsMetersXYZ: [
        [0, 0.5, 0],
        [3, 0.5, 0],
      ],
      halfWidthMeters: 1,
      isBidirectional: true,
    }],
    visualTargetFacings: [{
      visualTargetId: "visual-target-2",
      frontYawQuarterTurnsY: 0,
    }],
    spaceTransitions: [
      {
        id: outwardId,
        kind: "door",
        triggerBlockId: "entry-gate-trigger",
        sourceStandPositionMetersXYZ: [3, 0.5, 0],
        destinationStandPositionMetersXYZ: [17, 0.5, 0],
        destinationYawQuarterTurnsY: 3,
      },
      {
        id: returnId,
        kind: "door",
        triggerBlockId: "courtyard-gate-trigger",
        sourceStandPositionMetersXYZ: [17, 0.5, 0],
        destinationStandPositionMetersXYZ: [3, 0.5, 0],
        destinationYawQuarterTurnsY: 1,
      },
    ],
    requireSingleReachableComponent: true,
  };
}
