const {
  BoxGeometry,
  Mesh,
  Scene,
  SphereGeometry,
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
  const groundMaterial = createWorldkitBlockMaterialV1(
    BLOCK_PRESET_REFS_V1.walkable,
  );
  for (let z = -6; z <= 6; z += 1) {
    for (let x = -6; x <= 6; x += 1) {
      const block = new Mesh(new BoxGeometry(1, 1, 1), groundMaterial);
      block.position.set(x, 0, z);
      bindWorldkitBlockV1(block, {
        id: `ground-${x + 6}-${z + 6}`,
        presetRef: BLOCK_PRESET_REFS_V1.walkable,
      });
      scene.add(block);
    }
  }

  const subjectMaterial = createWorldkitSubjectMaterialV1();
  const body = new Mesh(new BoxGeometry(0.8, 0.8, 1.2), subjectMaterial);
  body.position.set(0, 0.4, 0);
  bindWorldkitSubjectMeshV1(body, {
    id: "custom-body",
    colliderContribution: "include",
    semanticTags: ["body", "custom"],
  });
  scene.add(body);

  const eye = new Mesh(new SphereGeometry(0.18, 16, 8), subjectMaterial);
  eye.position.set(0, 0.65, -0.65);
  bindWorldkitSubjectMeshV1(eye, {
    id: "custom-eye",
    semanticTags: ["attachment", "eye"],
  });
  scene.add(eye);

  return {
    scene,
    world: { id: "custom-mesh-subject", seed: 2048 },
    controlledSubject: {
      kind: "assembly",
      entityId: "player",
      visualTargetId: "visual-target-1",
      yawQuarterTurnsY: 0,
      assembly: {
        id: "custom-mesh-creature",
        baseSubject: {
          kind: "custom-mesh",
          subjectMeshBindingIds: ["custom-body"],
          category: "custom",
          bodyTopology: "custom",
          semanticClassId: "subject.custom.mesh-creature",
          displayName: "Custom mesh creature",
          description: "An Agent-drawn rigid controllable shape without bones.",
        },
        attachments: [{ subjectMeshBindingId: "custom-eye" }],
        motion: { motionPackId: "ground.root-standard" },
        presentation: { kind: "automatic" },
      },
    },
    camera: {
      kind: "pack",
      entityId: "camera-main",
      cameraPackId: "third-person.over-shoulder",
      target: { kind: "assembly-bounds", heightRatio: 0.6 },
      aspectRatio: 16 / 9,
    },
    subjectTraversalProfile: {
      clearanceHeightMeters: 0.8,
      footprintRadiusMetersXZ: 0.75,
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
    requireSingleReachableComponent: true,
  };
}
