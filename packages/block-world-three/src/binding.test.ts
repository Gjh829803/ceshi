import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { describe, expect, it } from "vitest";

import { BLOCK_PRESET_REFS_V1 } from "@whitebox-world/block-world";

import {
  bindWorldkitBlockV1,
  createWorldkitBlockMaterialV1,
  readWorldkitBlockBindingV1,
} from "./binding.js";

describe("Three.js block binding", () => {
  it("binds immutable preset identity without using userData as authority", () => {
    const mesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      createWorldkitBlockMaterialV1(BLOCK_PRESET_REFS_V1.landmarkOrange),
    );
    bindWorldkitBlockV1(mesh, {
      id: "palace-block-001",
      presetRef: BLOCK_PRESET_REFS_V1.landmarkOrange,
      visualGroupId: "palace-main",
    });
    const binding = readWorldkitBlockBindingV1(mesh)!;
    expect(binding).toEqual({
      kind: "worldkit-three-block-binding",
      schemaVersion: 1,
      id: "palace-block-001",
      presetRef: BLOCK_PRESET_REFS_V1.landmarkOrange,
      visualGroupId: "palace-main",
    });
    expect(Object.isFrozen(binding)).toBe(true);
    expect(mesh.userData).toEqual({});
    expect(() => bindWorldkitBlockV1(mesh, {
      id: "palace-block-002",
      presetRef: BLOCK_PRESET_REFS_V1.landmarkOrange,
    })).toThrow("BLOCK_BINDING_INVALID");
  });

  it("rejects unknown presets and materials not created for the selected preset", () => {
    const raw = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    expect(() => bindWorldkitBlockV1(raw, {
      id: "raw-block-001",
      presetRef: BLOCK_PRESET_REFS_V1.walkable,
    })).toThrow("must use a WorldKit material");
    expect(() => createWorldkitBlockMaterialV1(
      "worldkit://block-preset/invented@1",
    )).toThrow("unknown preset");
  });
});
