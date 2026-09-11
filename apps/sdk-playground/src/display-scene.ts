import * as T from 'three';
import { DISPLAY_TYPES, type DisplayRenderSettings, type DisplayType } from './display-settings';
import {displayRootId,resolveDisplayScope,withinDisplayRoot as within,type DisplayContext} from './display-context';
export type {DisplayContext} from './display-context';

/** A synchronous display transaction. Never owns transforms, skins, physics or time. */
export function createDisplayScene(scene: T.Scene) {
  const materials = new Map<T.Material, Map<string, T.Material>>();
  const depth = { near: { value: 0 }, far: { value: 60 } };
  const studio = new T.Group(); studio.name = 'display-studio-light'; studio.visible = false;
  studio.add(new T.HemisphereLight(0xffffff, 0x9297a0, 2));
  const key = new T.DirectionalLight(0xffffff, 2); key.position.set(4, 8, 6); studio.add(key); scene.add(studio);

  function materialFor(source: T.Material, settings: DisplayRenderSettings, type: DisplayType): T.Material {
    const cacheKey = `${settings.mode}:${type}`;
    let cache = materials.get(source); if (!cache) { cache = new Map(); materials.set(source, cache); }
    const original = source as T.MeshStandardMaterial;
    let material = cache.get(cacheKey) as T.MeshBasicMaterial;
    if (!material) {
      material = (settings.mode === 'clay' ? new T.MeshLambertMaterial() : new T.MeshBasicMaterial()) as T.MeshBasicMaterial;
      material.name = `display-${settings.mode}`;
      if (settings.mode !== 'unlit') {
        material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = diffuse;');
          if (settings.mode === 'normal') {
            shader.vertexShader = `varying vec3 vDisplayNormal;\n${shader.vertexShader}`
              .replace('#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )', '#if 1')
              .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvDisplayNormal = transformedNormal;');
            shader.fragmentShader = `varying vec3 vDisplayNormal;\n${shader.fragmentShader}`.replace('#include <opaque_fragment>', 'outgoingLight = normalize(vDisplayNormal) * (gl_FrontFacing ? 0.5 : -0.5) + 0.5;\n#include <opaque_fragment>');
          }
        };
        material.customProgramCacheKey = () => `display-${settings.mode}-v1`;
      }
      if (settings.mode === 'depth') {
        material.onBeforeCompile = shader => {
          shader.uniforms.displayNear = depth.near; shader.uniforms.displayFar = depth.far;
          shader.vertexShader = `varying float vDisplayDepth;\n${shader.vertexShader}`.replace('#include <project_vertex>', '#include <project_vertex>\nvDisplayDepth = -mvPosition.z;');
          shader.fragmentShader = `varying float vDisplayDepth;\nuniform float displayNear;\nuniform float displayFar;\n${shader.fragmentShader}`.replace('#include <opaque_fragment>', 'outgoingLight = vec3(clamp((vDisplayDepth - displayNear) / (displayFar - displayNear), 0.0, 1.0));\n#include <opaque_fragment>');
        };
        material.customProgramCacheKey = () => 'display-linear-depth-v1';
      }
      cache.set(cacheKey, material);
    }
    const map = settings.mode === 'unlit' || source.transparent || source.alphaTest > 0 ? original.map ?? null : null;
    const alphaMap = original.alphaMap ?? null;
    const buffer = ['depth', 'normal', 'semantic'].includes(settings.mode);
    const wireframe = settings.mode === 'wireframe';
    const transparent = wireframe || !buffer && source.transparent;
    const alphaTest = source.transparent ? Math.max(source.alphaTest, 1 / 255) : source.alphaTest;
    if (!!material.map !== !!map || !!material.alphaMap !== !!alphaMap || material.side !== source.side || material.transparent !== transparent || (material.alphaTest > 0) !== (alphaTest > 0)) material.needsUpdate = true;
    material.map = map; material.alphaMap = alphaMap;
    material.alphaTest = alphaTest; material.opacity = source.opacity * (wireframe ? settings.opacity : 1); material.visible = source.visible;
    material.side = source.side; material.transparent = transparent; material.depthTest = wireframe ? !settings.xray : buffer || source.depthTest;
    material.depthWrite = !wireframe && (buffer || source.depthWrite);
    material.wireframe = settings.mode === 'wireframe'; material.toneMapped = settings.mode === 'clay';
    material.vertexColors = settings.mode === 'unlit' && source.vertexColors;
    if (material.color) {
      if (settings.mode === 'unlit') material.color.copy(original.color ?? new T.Color('white'));
      else material.color.set(settings.mode === 'semantic' ? DISPLAY_TYPES.find(t => t.id === type)!.color : settings.mode === 'wireframe' ? '#d0dae3' : '#e5e7eb');
    }
    return material;
  }

  function render<Result>(settings: DisplayRenderSettings, context: DisplayContext, draw: () => Result, helpers: readonly T.Object3D[] = []): Result {
    const restore: (() => void)[] = [];
    const rootTypes = new Map(context.roots.map(root => [root.object, root.type]));
    const scope=resolveDisplayScope({...settings,mode:'material'},context);
    const hidden=new Set(context.roots.filter(root=>settings.hiddenIds.includes(displayRootId(root))).map(root=>root.object));
    const helperRoots = new Set([studio, ...helpers]);
    depth.near.value = settings.depthNear; depth.far.value = settings.depthFar;
    const background = scene.background, fog = scene.fog, override = scene.overrideMaterial;
    try {
      if (settings.mode !== 'material') {
        scene.fog = null; scene.overrideMaterial = null;
        scene.background = new T.Color(settings.mode === 'depth' ? '#ffffff' : settings.mode === 'clay' ? '#cdd3d9' : '#17212b');
      }
      scene.traverse(object => {
        if (within(object, helperRoots)) return;
        if ((object as T.Light).isLight && settings.mode === 'clay') {
          const visible = object.visible; restore.push(() => { object.visible = visible; }); object.visible = false; return;
        }
        const mesh = object as T.Mesh;
        if (!(mesh.isMesh || (object as T.Line).isLine || (object as T.Sprite).isSprite || (object as T.Points).isPoints)) return;
        let type: DisplayType = 'unknown';
        for (let node: T.Object3D | null = object; node; node = node.parent) { const found = rootTypes.get(node); if (found) { type = found; break; } }
        const visible = object.visible, material = mesh.material;
        restore.push(() => { object.visible = visible; mesh.material = material; });
        if (settings.mode === 'collision' || !settings.types.includes(type) || within(object,hidden) || scope.ids!==null && !within(object,scope.roots)) object.visible = false;
        if (settings.mode !== 'material' && settings.mode !== 'collision') {
          // Non-mesh helpers/labels are not geometric surfaces in diagnostic buffers.
          if (!mesh.isMesh) object.visible = false;
          else {
            mesh.material = Array.isArray(material) ? material.map(m => materialFor(m, settings, type)) : materialFor(material, settings, type);
            const instanced = mesh as T.InstancedMesh;
            if (instanced.isInstancedMesh && settings.mode !== 'unlit') {
              const colors = instanced.instanceColor; restore.push(() => { instanced.instanceColor = colors; }); instanced.instanceColor = null;
            }
          }
        }
      });
      studio.visible = settings.mode === 'clay';
      return draw();
    } finally {
      for (let i = restore.length - 1; i >= 0; i--) restore[i]!();
      studio.visible = false; scene.background = background; scene.fog = fog; scene.overrideMaterial = override;
    }
  }
  function clearMaterials() { for (const cache of materials.values()) for (const material of cache.values()) material.dispose(); materials.clear(); }
  return { render, clearMaterials, dispose() { clearMaterials(); studio.removeFromParent(); } };
}
