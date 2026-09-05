import { createSubjectSetup } from "../../.codex/skills/worldkit-block-builder/scripts/subject-setup.mjs";

const { BoxGeometry, Mesh, Scene } = globalThis.THREE;
const {
  BLOCK_PRESET_REFS_V1, bindWorldkitBlockV1, bindWorldkitSubjectMeshV1,
  createWorldkitBlockMaterialV1, createWorldkitSubjectMaterialV1,
} = globalThis.WorldKitBlock;

export function buildBlockWorld() {
  const scene = new Scene();
  const groundGeometry = new BoxGeometry(1, 1, 1);
  const groundMaterial = createWorldkitBlockMaterialV1(BLOCK_PRESET_REFS_V1.walkable);
  for (let z = -6; z <= 6; z++) {
    for (let x = -6; x <= 6; x++) {
      const block = new Mesh(groundGeometry, groundMaterial);
      block.position.set(x, 0, z);
      bindWorldkitBlockV1(block, { id: `ground-${x + 6}-${z + 6}`, presetRef: BLOCK_PRESET_REFS_V1.walkable });
      scene.add(block);
    }
  }
  const platform = new Mesh(new BoxGeometry(1.4, 0.1, 2), createWorldkitSubjectMaterialV1());
  platform.position.set(0, 0.05, 0);
  bindWorldkitSubjectMeshV1(platform, { id: "flying-platform", semanticTags: ["attachment", "flight", "platform"] });
  scene.add(platform);
  const seat = new Mesh(new BoxGeometry(0.7, 0.12, 0.75), createWorldkitSubjectMaterialV1());
  seat.position.set(0, 0.82, 0.12);
  bindWorldkitSubjectMeshV1(seat, { id: "seat", semanticTags: ["attachment", "seat"] });
  scene.add(seat);
  const support = new Mesh(new BoxGeometry(0.18, 0.66, 0.18), createWorldkitSubjectMaterialV1());
  support.position.set(0, 0.43, 0.12);
  bindWorldkitSubjectMeshV1(support, { id: "seat-support", semanticTags: ["attachment", "support"] });
  scene.add(support);
  return {
    scene,
    world: { id: "seated-flight-assembly", seed: 905 },
    ...createSubjectSetup({
      subjectPackId: "humanoid.g-bot",
      assemblyId: "seated-platform-rider",
      attachments: ["flying-platform", "seat", "seat-support"].map((subjectMeshBindingId) => ({ subjectMeshBindingId })),
      motionPackId: "flight.powered-standard",
      presentation: { kind: "fixed-action", actionId: "sit.idle" },
      camera: {
        cameraPackId: "third-person.standard",
        target: { kind: "subject-local-point", positionMetersXYZ: [0, 0.85, 0] },
        tuning: { distanceMeters: 4, pitchRadians: 0.22 },
      },
    }),
    spawnStandPositionMetersXYZ: [0, 0.5, 0],
    requiredTargets: [], requiredGroundTraversalBands: [],
    visualTargetFacings: [], spaceTransitions: [],
  };
}
