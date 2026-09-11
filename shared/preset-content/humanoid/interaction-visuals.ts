import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import type {humanoid} from '@worldkit/three';

/** Content construction creates map props once; observation only projects existing visuals. */
export function buildInteractionVisuals(scene:Object3D,definitions:readonly {id:string;size:readonly number[];position:readonly number[]}[]) {
  const root = new Group(); root.name = 'humanoid-interaction-targets'; scene.add(root);
  const parcels = new Map<string,Group>();
  let disposed = false;
  const release = (group: Group) => {
    const materials = new Set<MeshStandardMaterial>();
    group.traverse(node => {
      if (!(node instanceof Mesh)) return;
      node.geometry.dispose();
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material as MeshStandardMaterial);
    });
    materials.forEach(material => material.dispose());
    group.removeFromParent(); group.clear();
  };
  const create = (id: string, size: readonly number[]) => {
    const group = new Group(); group.name = id;
    const [w, h, d] = size as readonly [number, number, number];
    const body = new Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(.007, w / 8, h / 8, d / 8)),
      new MeshStandardMaterial({ color: 0xf1b157, roughness: .48, metalness: .12 }));
    body.castShadow = body.receiveShadow = true; group.add(body);
    const bands = new MeshStandardMaterial({ color: 0x586b70, roughness: .72 });
    for (const dimensions of [[w + .002, h + .002, Math.min(.021, d / 4)], [Math.min(.021, w / 4), h + .003, d + .003]] as [number, number, number][])
      group.add(new Mesh(new BoxGeometry(...dimensions), bands));
    root.add(group); return group;
  };
  for(const definition of definitions){
    if(parcels.has(definition.id)||definition.size.length!==3||!definition.size.every(n=>Number.isFinite(n)&&n>0)||definition.position.length!==3||!definition.position.every(Number.isFinite)){
      parcels.forEach(release);root.removeFromParent();throw new Error('MAP_PROP_VISUAL_INVALID');
    }
    const group=create(definition.id,definition.size);group.position.fromArray(definition.position);parcels.set(definition.id,group);
  }
  return {
    update(targets:readonly humanoid.InteractionVisualTarget[]) {
      if(disposed)return;
      for(const group of parcels.values())group.visible=false;
      for(const target of targets){
        const group=parcels.get(target.id);if(!group)continue;
        group.position.copy(target.position);
        if(target.rotation)group.quaternion.copy(target.rotation);else group.quaternion.identity();
        group.visible=target.state!=='removed';
      }
    },
    dispose(){if(disposed)return;disposed=true;parcels.forEach(release);parcels.clear();root.removeFromParent();root.clear();},
  };
}
