import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
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
  walkable: "#E8EEE9",
  "walkable-ice": "#DDF5FF",
  "walkable-mud": "#A98566",
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

export const BLOCK_WORLD_GROUND_GRID_DISPLAY_V1 = Object.freeze({
  minorSpacingMeters: 1,
  majorSpacingMeters: 4,
  textureResolutionPixels: 64,
  minorLineContrastRatio: 0.045,
  majorLineContrastRatio: 0.075,
} as const);

export interface WhiteboxMaterials {
  terrain: StandardMaterial;
  water: StandardMaterial;
  object: StandardMaterial;
  subject: StandardMaterial;
  blockBySemanticClassId: ReadonlyMap<string, StandardMaterial>;
  blockWalkableSurfaceBySemanticClassId: ReadonlyMap<string, StandardMaterial>;
}

function blockPresetName(resourceRef: string): string {
  return resourceRef
    .slice("worldkit://block-preset/".length)
    .replace(/@1$/, "");
}

function createBlockGroundGridTexture(scene: Scene): RawTexture {
  const {
    majorSpacingMeters,
    minorSpacingMeters,
    textureResolutionPixels,
    minorLineContrastRatio,
    majorLineContrastRatio,
  } = BLOCK_WORLD_GROUND_GRID_DISPLAY_V1;
  const minorSpacingPixels = textureResolutionPixels *
    minorSpacingMeters / majorSpacingMeters;
  const minorLineValue = Math.round(255 * (1 - minorLineContrastRatio));
  const majorLineValue = Math.round(255 * (1 - majorLineContrastRatio));
  const data = new Uint8Array(textureResolutionPixels * textureResolutionPixels * 3);
  for (let y = 0; y < textureResolutionPixels; y += 1) {
    for (let x = 0; x < textureResolutionPixels; x += 1) {
      const isMajorLine = x === 0 || y === 0;
      const isMinorLine = x % minorSpacingPixels === 0 ||
        y % minorSpacingPixels === 0;
      const value = isMajorLine
        ? majorLineValue
        : isMinorLine ? minorLineValue : 255;
      const offset = (y * textureResolutionPixels + x) * 3;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
    }
  }
  const texture = RawTexture.CreateRGBTexture(
    data,
    textureResolutionPixels,
    textureResolutionPixels,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.name = "worldkit.texture.block-ground-grid";
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 1 / majorSpacingMeters;
  texture.vScale = 1 / majorSpacingMeters;
  texture.anisotropicFilteringLevel = 4;
  return texture;
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
  const blockWalkableSurfaceBySemanticClassId = new Map<string, StandardMaterial>();
  const blockGroundGridTexture = createBlockGroundGridTexture(scene);
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
    if (preset.traversal.supportSurfaceMode !== "none") {
      const walkableSurfaceMaterial = new StandardMaterial(
        `worldkit.material.block-walkable-surface.${presetName}`,
        scene,
      );
      walkableSurfaceMaterial.diffuseColor = displayColor;
      walkableSurfaceMaterial.ambientColor = displayColor.scale(0.3);
      walkableSurfaceMaterial.emissiveColor = displayColor.scale(0.025);
      walkableSurfaceMaterial.specularColor = Color3.Black();
      walkableSurfaceMaterial.alpha = preset.render.opacityRatio;
      walkableSurfaceMaterial.disableLighting = false;
      walkableSurfaceMaterial.maxSimultaneousLights = 2;
      walkableSurfaceMaterial.backFaceCulling = false;
      walkableSurfaceMaterial.twoSidedLighting = true;
      if (preset.traversal.supportSurfaceMode === "ground") {
        walkableSurfaceMaterial.diffuseTexture = blockGroundGridTexture;
      }
      walkableSurfaceMaterial.metadata = Object.freeze({
        blockPresetRef: preset.resourceRef,
        blockPresetColorHex: preset.render.colorHex,
        blockDisplayColorHex: displayColorHex,
        ...(preset.traversal.supportSurfaceMode === "ground"
          ? { blockGroundGridDisplay: BLOCK_WORLD_GROUND_GRID_DISPLAY_V1 }
          : {}),
      });
      blockWalkableSurfaceBySemanticClassId.set(
        `block.${presetName}`,
        walkableSurfaceMaterial,
      );
    }
  }

  return {
    terrain,
    water,
    object,
    subject,
    blockBySemanticClassId,
    blockWalkableSurfaceBySemanticClassId,
  };
}
