const {
  BoxGeometry,
  Mesh,
  Scene,
} = globalThis.THREE;
const {
  BLOCK_PRESET_REFS_V1,
  bindWorldkitBlockV1,
  bindWorldkitSubjectMeshV1,
  createWorldkitBlockMaterialV1,
  createWorldkitSubjectMaterialV1,
} = globalThis.WorldKitBlock;

export function buildBlockWorld() {
  const scene = new Scene();
  const groundGeometry = new BoxGeometry(1, 1, 1);
  const groundMaterial = createWorldkitBlockMaterialV1(
    BLOCK_PRESET_REFS_V1.walkable,
  );
  for (let z = -6; z <= 6; z += 1) {
    for (let x = -6; x <= 6; x += 1) {
      const block = new Mesh(groundGeometry, groundMaterial);
      block.position.set(x, 0, z);
      bindWorldkitBlockV1(block, {
        id: `ground-${x + 6}-${z + 6}`,
        presetRef: BLOCK_PRESET_REFS_V1.walkable,
      });
      scene.add(block);
    }
  }

  const sword = new Mesh(
    new BoxGeometry(0.18, 0.08, 2.4),
    createWorldkitSubjectMaterialV1(),
  );
  sword.position.set(0, 0.05, 0);
  bindWorldkitSubjectMeshV1(sword, {
    id: "flying-sword",
    semanticTags: ["attachment", "flight", "sword"],
  });
  scene.add(sword);

  return {
    scene,
    world: { id: "flying-sword-assembly", seed: 1024 },
    controlledSubject: {
      kind: "assembly",
      entityId: "player",
      visualTargetId: "visual-target-1",
      yawQuarterTurnsY: 0,
      assembly: {
        id: "flying-sword-rider",
        baseSubject: {
          kind: "subject-pack",
          subjectPackId: "humanoid.g-bot",
        },
        attachments: [{ subjectMeshBindingId: "flying-sword" }],
        motion: { motionPackId: "flight.powered-standard" },
        presentation: {
          kind: "fixed-locomotion",
          presentationKey: "locomotion.idle",
        },
      },
    },
    camera: {
      kind: "pack",
      entityId: "camera-main",
      cameraPackId: "third-person.standard",
      target: {
        kind: "base-subject-socket",
        socketId: "ThirdPersonTarget",
      },
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
    requiredTargets: [],
    requiredGroundTraversalBands: [],
    visualTargetFacings: [],
    spaceTransitions: [],
    requireSingleReachableComponent: false,
  };
}
