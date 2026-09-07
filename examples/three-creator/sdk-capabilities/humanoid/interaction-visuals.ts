import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Scene, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface InteractionVisualTarget {
  id: string;
  kind: 'pickup' | 'seat';
  position: Vector3;
  rotation?: Quaternion|undefined;
  state: string;
  size?: readonly number[]|undefined;
}

/** Snapshot-only presentation: the simulation owns target state and physics. */
export function buildInteractionVisuals(scene: Scene) {
  const root = new Group(); root.name = 'humanoid-interaction-targets'; scene.add(root);
  const parcels = new Map<string, { group: Group; size: string }>();
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
  return {
    update(targets: readonly InteractionVisualTarget[]) {
      if (disposed) return;
      const visible = new Set<string>();
      for (const target of targets) {
        if (target.kind !== 'pickup') continue;
        visible.add(target.id);
        const size = target.size?.length === 3 && target.size.every(n => Number.isFinite(n) && n > 0) ? target.size : [.13, .13, .13];
        const signature = size.join(',');
        let parcel = parcels.get(target.id);
        if (!parcel || parcel.size !== signature) {
          if (parcel) release(parcel.group);
          parcel = { group: create(target.id, size), size: signature }; parcels.set(target.id, parcel);
        }
        parcel.group.position.copy(target.position);
        if (target.rotation) parcel.group.quaternion.copy(target.rotation); else parcel.group.quaternion.identity();
        parcel.group.visible = target.state !== 'removed';
      }
      for (const [id, parcel] of parcels) if (!visible.has(id)) { release(parcel.group); parcels.delete(id); }
    },
    dispose() {
      if (disposed) return;
      disposed = true; parcels.forEach(parcel => release(parcel.group)); parcels.clear(); root.removeFromParent(); root.clear();
    },
  };
}
