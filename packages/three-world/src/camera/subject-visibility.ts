import { Material, Object3D } from "three";

/** Render-local materials keep shared assets and other subjects untouched. */
export class CameraSubjectVisibility {
  private readonly materials = new Map<Material, {material: Material; sourceVersion: number}>();

  present(roots: readonly Object3D[], opacity: number): () => void {
    const undo: (() => void)[] = [];
    const used = new Set<Material>();
    const visited = new Set<Object3D>();
    const restore = () => { for (let i = undo.length - 1; i >= 0; i--) undo[i]!(); };
    try {
      if (opacity < 1) for (const root of roots) root.traverse(object => {
        if (visited.has(object)) return;
        visited.add(object);
        const mesh = object as Object3D & {
          isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean;
          material: Material | Material[];
        };
        if (!mesh.isMesh && !mesh.isLine && !mesh.isPoints && !mesh.isSprite) return;
        if (opacity <= 0) {
          const visible = mesh.visible;
          undo.push(() => { mesh.visible = visible; });
          mesh.visible = false;
          return;
        }
        const original = mesh.material;
        const faded = (source: Material) => {
          used.add(source);
          let entry = this.materials.get(source);
          if (!entry) {
            entry = {material: source.clone(), sourceVersion: source.version};
            this.materials.set(source, entry);
          }
          entry.material.copy(source);
          // Three's Material.copy deliberately omits shader hooks. Preserve the
          // subject's color/vertex shader contract while changing only alpha.
          entry.material.onBeforeCompile = source.onBeforeCompile;
          entry.material.customProgramCacheKey = source.customProgramCacheKey;
          entry.material.opacity = source.opacity * opacity;
          entry.material.transparent = true;
          entry.material.depthWrite = false;
          if (entry.sourceVersion !== source.version) entry.material.needsUpdate = true;
          entry.sourceVersion = source.version;
          return entry.material;
        };
        undo.push(() => { mesh.material = original; });
        mesh.material = Array.isArray(original) ? original.map(faded) : faded(original);
      });
      for (const [source, entry] of this.materials) if (!used.has(source)) {
        entry.material.dispose();
        this.materials.delete(source);
      }
      return restore;
    } catch (error) {
      restore();
      throw error;
    }
  }

  dispose(): void {
    for (const entry of this.materials.values()) entry.material.dispose();
    this.materials.clear();
  }
}
