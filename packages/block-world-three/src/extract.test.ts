import {
  BoxGeometry,
  Group,
  Mesh,
  type MeshBasicMaterial,
  Scene,
} from "three";
import { describe, expect, it } from "vitest";

import { BLOCK_PRESET_REFS_V1 } from "@whitebox-world/block-world";

import {
  bindWorldkitBlockV1,
  createWorldkitBlockMaterialV1,
} from "./binding.js";
import { extractThreeBlockWorldV2 } from "./extract.js";

function boundBlock(
  id: string,
  presetRef: string = BLOCK_PRESET_REFS_V1.walkable,
): Mesh<BoxGeometry, MeshBasicMaterial> {
  return bindWorldkitBlockV1(
    new Mesh(new BoxGeometry(1, 1, 1), createWorldkitBlockMaterialV1(presetRef)),
    { id, presetRef },
  );
}

describe("Three.js Block World extraction", () => {
  it("derives integer cells and quarter turns from nested final world transforms", () => {
    const scene = new Scene();
    const group = new Group();
    group.position.set(2, 0, -3);
    group.rotation.y = Math.PI / 2;
    const mesh = boundBlock("ground-main-001");
    mesh.position.set(1, 0, 0);
    group.add(mesh);
    scene.add(group);

    const result = extractThreeBlockWorldV2(scene);
    expect(result.diagnostics).toEqual([]);
    expect(result.manifest.blocks).toEqual([{
      id: "ground-main-001",
      presetRef: BLOCK_PRESET_REFS_V1.walkable,
      shape: "full",
      positionMetersXYZ: [2, 0, -4],
      rotationQuarterTurnsY: 1,
    }]);
  });

  it("rejects unbound, deformed, off-grid, scaled, tilted, and recolored meshes", () => {
    const scene = new Scene();
    scene.add(new Mesh(new BoxGeometry(1, 1, 1), createWorldkitBlockMaterialV1(
      BLOCK_PRESET_REFS_V1.walkable,
    )));

    const deformed = boundBlock("deformed-block");
    deformed.geometry.translate(0.25, 0, 0);
    deformed.position.set(1, 0, 0);
    scene.add(deformed);

    const offGrid = boundBlock("off-grid-block");
    offGrid.position.set(2.25, 0, 0);
    scene.add(offGrid);

    const scaled = boundBlock("scaled-block");
    scaled.position.set(3, 0, 0);
    scaled.scale.set(2, 1, 1);
    scene.add(scaled);

    const tilted = boundBlock("tilted-block");
    tilted.position.set(4, 0, 0);
    tilted.rotation.x = 0.1;
    scene.add(tilted);

    const recolored = boundBlock("recolored-block");
    recolored.position.set(5, 0, 0);
    recolored.material.color.set("#FFFFFF");
    scene.add(recolored);

    const result = extractThreeBlockWorldV2(scene);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "BLOCK_MESH_UNBOUND",
      "BLOCK_MESH_GEOMETRY_INVALID",
      "BLOCK_MESH_POSITION_INVALID",
      "BLOCK_MESH_SCALE_INVALID",
      "BLOCK_MESH_ROTATION_INVALID",
      "BLOCK_MATERIAL_INVALID",
    ]));
    expect(result.manifest.blocks).toEqual([]);
  });

  it("extracts half, exact quarter-volume, and small shapes on the micro-grid", () => {
    const scene = new Scene();
    const shapes = [
      ["half-main", [1, 0.5, 1], [0, 0.25, 0]],
      ["quarter-main", [0.5, 0.5, 1], [1.25, 0.25, 0]],
      ["small-main", [0.5, 0.5, 0.5], [2.25, 0.25, 0.25]],
    ] as const;
    for (const [id, size, position] of shapes) {
      const mesh = bindWorldkitBlockV1(
        new Mesh(new BoxGeometry(size[0], size[1], size[2]), createWorldkitBlockMaterialV1(
          BLOCK_PRESET_REFS_V1.obstacle,
        )),
        { id, presetRef: BLOCK_PRESET_REFS_V1.obstacle },
      );
      mesh.position.set(position[0], position[1], position[2]);
      scene.add(mesh);
    }
    const result = extractThreeBlockWorldV2(scene);
    expect(result.diagnostics).toEqual([]);
    expect(result.manifest.blocks.map(({ id, shape, positionMetersXYZ }) => ({
      id,
      shape,
      positionMetersXYZ,
    }))).toEqual([
      { id: "half-main", shape: "half", positionMetersXYZ: [0, 0.25, 0] },
      { id: "quarter-main", shape: "quarter", positionMetersXYZ: [1.25, 0.25, 0] },
      { id: "small-main", shape: "small", positionMetersXYZ: [2.25, 0.25, 0.25] },
    ]);
  });
});
