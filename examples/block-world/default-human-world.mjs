import { createSubjectSetup } from "../../.codex/skills/worldkit-block-builder/scripts/subject-setup.mjs";

const { BoxGeometry, Mesh, Scene } = globalThis.THREE;
const { BLOCK_PRESET_REFS_V1, bindWorldkitBlockV1, createWorldkitBlockMaterialV1 } = globalThis.WorldKitBlock;

export function buildBlockWorld() {
  const scene = new Scene();
  const geometry = new BoxGeometry(1, 1, 1);
  const material = createWorldkitBlockMaterialV1(BLOCK_PRESET_REFS_V1.walkable);
  for (let z = -6; z <= 6; z++) {
    for (let x = -6; x <= 6; x++) {
      const block = new Mesh(geometry, material);
      block.position.set(x, 0, z);
      bindWorldkitBlockV1(block, { id: `ground-${x + 6}-${z + 6}`, presetRef: BLOCK_PRESET_REFS_V1.walkable });
      scene.add(block);
    }
  }
  return {
    scene,
    world: { id: "default-human-world", seed: 905 },
    ...createSubjectSetup({ subjectPackId: "humanoid.g-bot" }),
    spawnStandPositionMetersXYZ: [0, 0.5, 4],
    requiredTargets: [
      { id: "middle-ground", navigationRole: "middle", standPositionMetersXYZ: [0, 0.5, 0] },
      { id: "remote-ground", navigationRole: "remote", standPositionMetersXYZ: [0, 0.5, -4] },
    ],
    requiredGroundTraversalBands: [{ id: "entry-ground", centerlineStandPositionsMetersXYZ: [[0, 0.5, 4], [0, 0.5, 0]], halfWidthMeters: 2, isBidirectional: true }],
    visualTargetFacings: [], spaceTransitions: [],
  };
}
