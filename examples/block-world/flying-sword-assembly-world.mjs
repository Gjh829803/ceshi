import { createSubjectSetup } from "../../.codex/skills/worldkit-block-builder/scripts/subject-setup.mjs";

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
    ...createSubjectSetup({
      subjectPackId: "humanoid.g-bot",
      assemblyId: "flying-sword-rider",
      attachments: [{ subjectMeshBindingId: "flying-sword" }],
      motionPackId: "flight.powered-standard",
      presentation: { kind: "fixed-action", actionId: "idle" },
    }),
    spawnStandPositionMetersXYZ: [0, 0.5, 0],
    requiredTargets: [],
    requiredGroundTraversalBands: [],
    visualTargetFacings: [],
    spaceTransitions: [],
    requireSingleReachableComponent: false,
  };
}
