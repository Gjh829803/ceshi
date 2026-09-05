import { createSubjectSetup } from "../../.codex/skills/worldkit-block-builder/scripts/subject-setup.mjs";

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
    ...createSubjectSetup({ subjectPackId: "kart-control-lab.stk-kart", assemblyId: "stk-kart-player" }),
    spawnStandPositionMetersXYZ: [0, 0.5, 8],
    requiredTargets: [],
    requiredGroundTraversalBands: [],
    visualTargetFacings: [],
    spaceTransitions: [],
    requireSingleReachableComponent: true,
  };
}
