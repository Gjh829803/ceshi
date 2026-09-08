import { BufferGeometry, Object3D, SkinnedMesh } from 'three';

/** 实例私有的第一人称头部遮挡；不缩放骨骼，不修改共享源几何。 */
export class FirstPersonBody {
  private readonly meshes: { mesh: SkinnedMesh; original: BufferGeometry; local: BufferGeometry }[] = [];
  private active = false;
  constructor(root: Object3D) {
    root.traverse(object => {
      if (!(object instanceof SkinnedMesh)) return;
      const geometry = object.geometry, indices = geometry.index;
      const joints = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
      if (!joints || !weights) return;
      const hidden = new Set<number>();
      object.skeleton.bones.forEach((bone, index) => {
        for (let node: Object3D | null = bone; node; node = node.parent) {
          if (/^(head|neck)(_|$)/i.test(node.name)) { hidden.add(index); break; }
        }
      });
      if (!hidden.size) return;
      const cut = (vertex: number) => {
        let weight = 0;
        for (let i = 0; i < 4; i++) if (hidden.has(joints.getComponent(vertex, i))) weight += weights.getComponent(vertex, i);
        return weight > .2;
      };
      const local = geometry.clone(), kept: number[] = [];
      local.clearGroups();
      const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: indices?.count ?? joints.count, materialIndex: 0 }];
      for (const group of groups) {
        const start = kept.length;
        for (let i = group.start; i < group.start + group.count; i += 3) {
          const a = indices ? indices.getX(i) : i, b = indices ? indices.getX(i + 1) : i + 1, c = indices ? indices.getX(i + 2) : i + 2;
          if (!cut(a) && !cut(b) && !cut(c)) kept.push(a, b, c);
        }
        local.addGroup(start, kept.length - start, group.materialIndex);
      }
      local.setIndex(kept);
      this.meshes.push({ mesh: object, original: geometry, local });
    });
  }
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    for (const { mesh, original, local } of this.meshes) mesh.geometry = active ? local : original;
  }
  dispose(): void { this.setActive(false); for (const { local } of this.meshes) local.dispose(); }
}
