import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

export interface WhiteboxMaterials {
  terrain: StandardMaterial;
  water: StandardMaterial;
  object: StandardMaterial;
  subject: StandardMaterial;
}

export function createWhiteboxMaterials(scene: Scene): WhiteboxMaterials {
  const terrain = new StandardMaterial("worldkit.material.terrain", scene);
  terrain.diffuseColor = new Color3(0.58, 0.64, 0.48);
  terrain.specularColor = Color3.Black();

  const water = new StandardMaterial("worldkit.material.water", scene);
  water.diffuseColor = new Color3(0.16, 0.58, 0.78);
  water.emissiveColor = new Color3(0.03, 0.12, 0.18);
  water.alpha = 0.68;
  water.specularColor = new Color3(0.25, 0.35, 0.4);
  water.backFaceCulling = false;

  const object = new StandardMaterial("worldkit.material.object", scene);
  object.diffuseColor = new Color3(0.76, 0.62, 0.28);
  object.specularColor = Color3.Black();

  const subject = new StandardMaterial("worldkit.material.subject", scene);
  subject.diffuseColor = new Color3(0.75, 0.18, 0.15);
  subject.specularColor = Color3.Black();

  return { terrain, water, object, subject };
}
