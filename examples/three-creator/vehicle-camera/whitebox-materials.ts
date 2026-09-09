import * as THREE from 'three';

/** Recolor only this instance; loaded asset materials and textures remain shared sources. */
export function applyWhiteboxMaterials(root: THREE.Object3D): () => void {
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const clones = new Map<THREE.Material, THREE.Material>();
  function whitebox(source: THREE.Material): THREE.Material {
    const existing = clones.get(source);
    if (existing) return existing;
    // clone() retains material type, transparency, alpha, side and texture references.
    const material = source.clone() as THREE.Material & {
      color?: THREE.Color; roughness?: number; metalness?: number;
    };
    material.color?.set(source.transparent ? '#d7dfe3' : '#e5e5e5');
    if (typeof material.roughness === 'number') material.roughness = 1;
    if (typeof material.metalness === 'number') material.metalness = 0;
    clones.set(source, material);
    return material;
  }
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    originals.set(mesh, mesh.material);
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(whitebox) : whitebox(mesh.material);
  });
  return () => {
    for (const [mesh, material] of originals) mesh.material = material;
    originals.clear();
    // Only these clones are owned here. Never dispose shared maps or geometry.
    for (const material of clones.values()) material.dispose();
    clones.clear();
  };
}
