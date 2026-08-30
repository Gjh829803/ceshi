import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import { listBlockPresetsV1 } from "@whitebox-world/block-world";

/**
 * Runtime-only display palette for Block World.
 *
 * The preset registry remains authoritative for semantic identity, physics,
 * capture colors, and Planner/Builder communication. These colors only soften
 * the player-facing Babylon render into a bright pastel voxel style.
 */
export const BLOCK_WORLD_PASTEL_DISPLAY_COLORS_V1 = Object.freeze({
  walkable: "#F4F5F2",
  obstacle: "#D8E4EC",
  "interactive-solid": "#77C9C0",
  "interactive-trigger": "#CBE59A",
  water: "#91CEF1",
  "cloud-walkable": "#DDD7F1",
  "cloud-passable": "#F3F7FC",
  "visual-only": "#E7EBEF",
  "landmark-red": "#D9827C",
  "landmark-orange": "#E9B88A",
  "landmark-yellow": "#E2CB7D",
  "landmark-blue": "#86A9D6",
  "landmark-purple": "#AA83DB",
  "landmark-pink": "#DDA3C5",
} as const);

export interface WhiteboxMaterials {
  terrain: StandardMaterial;
  water: StandardMaterial;
  object: StandardMaterial;
  subject: StandardMaterial;
  blockBySemanticClassId: ReadonlyMap<string, StandardMaterial>;
}

function blockPresetName(resourceRef: string): string {
  return resourceRef
    .slice("worldkit://block-preset/".length)
    .replace(/@1$/, "");
}

export function createWhiteboxMaterials(scene: Scene): WhiteboxMaterials {
  const terrain = new StandardMaterial("worldkit.material.terrain", scene);
  terrain.diffuseColor = Color3.FromHexString("#DDECE5");
  terrain.ambientColor = terrain.diffuseColor.scale(0.3);
  terrain.specularColor = Color3.Black();
  // Heightfield triangles are compiled in engine-neutral row-major order.
  // Render both sides so the right-handed adapter never drops the ground.
  terrain.backFaceCulling = false;
  terrain.twoSidedLighting = true;

  const water = new StandardMaterial("worldkit.material.water", scene);
  water.diffuseColor = Color3.FromHexString("#91CEF1");
  water.ambientColor = water.diffuseColor.scale(0.3);
  water.emissiveColor = water.diffuseColor.scale(0.035);
  water.alpha = 0.68;
  water.specularColor = new Color3(0.25, 0.35, 0.4);
  water.backFaceCulling = false;

  const object = new StandardMaterial("worldkit.material.object", scene);
  object.diffuseColor = Color3.FromHexString("#E9B88A");
  object.ambientColor = object.diffuseColor.scale(0.3);
  object.emissiveColor = object.diffuseColor.scale(0.025);
  object.specularColor = Color3.Black();

  const subject = new StandardMaterial("worldkit.material.subject", scene);
  subject.diffuseColor = Color3.FromHexString("#E85D5D");
  subject.ambientColor = subject.diffuseColor.scale(0.3);
  subject.emissiveColor = subject.diffuseColor.scale(0.025);
  subject.specularColor = Color3.Black();

  const blockBySemanticClassId = new Map<string, StandardMaterial>();
  for (const preset of listBlockPresetsV1()) {
    const presetName = blockPresetName(preset.resourceRef);
    const material = new StandardMaterial(`worldkit.material.block.${presetName}`, scene);
    const displayColorHex = BLOCK_WORLD_PASTEL_DISPLAY_COLORS_V1[
      presetName as keyof typeof BLOCK_WORLD_PASTEL_DISPLAY_COLORS_V1
    ];
    const displayColor = Color3.FromHexString(displayColorHex);
    material.diffuseColor = displayColor;
    material.ambientColor = displayColor.scale(0.3);
    material.emissiveColor = displayColor.scale(0.025);
    material.specularColor = Color3.Black();
    material.alpha = preset.render.opacityRatio;
    material.disableLighting = false;
    material.maxSimultaneousLights = 2;
    material.backFaceCulling = preset.render.opacityRatio === 1;
    material.metadata = Object.freeze({
      blockPresetRef: preset.resourceRef,
      blockPresetColorHex: preset.render.colorHex,
      blockDisplayColorHex: displayColorHex,
    });
    blockBySemanticClassId.set(`block.${presetName}`, material);
  }

  return {
    terrain,
    water,
    object,
    subject,
    blockBySemanticClassId,
  };
}
