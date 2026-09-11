import { describe, expect, it } from 'vitest';
import * as T from 'three';
import {buildInteractionVisuals} from '@worldkit/preset-content/humanoid/interaction-visuals';
import { createDisplayScene } from './display-scene';
import { defaultDisplaySettings } from './display-settings';

function fixture() {
  const scene = new T.Scene(), subject = new T.Group(), environment = new T.Group();
  const material = new T.MeshStandardMaterial({ color: '#db4d30' });
  const mesh = new T.Mesh(new T.BoxGeometry(), material), wall = new T.Mesh(new T.BoxGeometry(), material);
  subject.add(mesh); environment.add(wall); scene.add(subject, environment);
  scene.background = new T.Color('#345678'); scene.fog = new T.Fog('#345678', 1, 100);
  const light = new T.DirectionalLight(); scene.add(light);
  const context = { roots: [{ object: subject, type: 'person' as const }, { object: environment, type: 'environment' as const }], subjects: [subject] };
  return { scene, mesh, wall, material, context, light, preview: createDisplayScene(scene) };
}

describe('display-only scene transaction', () => {
  it('applies overlay opacity and x-ray settings to wireframes without changing source materials', () => {
    const f = fixture();
    try {
      f.preview.render({...defaultDisplaySettings(), mode: 'wireframe', opacity: .4, xray: true}, f.context, () => {
        expect(f.mesh.material.opacity).toBe(.4); expect(f.mesh.material.transparent).toBe(true); expect(f.mesh.material.depthTest).toBe(false);
      });
      expect(f.material.opacity).toBe(1); expect(f.material.depthTest).toBe(true);
    } finally { f.preview.dispose(); }
  });
  it('writes actual foreground depth in semantic and normal buffers even for transparent source materials', () => {
    const f = fixture(); f.material.transparent = true; f.material.opacity = .3; f.material.depthWrite = false; f.material.depthTest = false;
    try {
      for (const mode of ['depth', 'normal', 'semantic'] as const) f.preview.render({...defaultDisplaySettings(), mode}, f.context, () => {
        expect(f.mesh.material.transparent).toBe(false); expect(f.mesh.material.depthWrite).toBe(true); expect(f.mesh.material.depthTest).toBe(true);
      });
      expect(f.material.depthWrite).toBe(false); expect(f.material.depthTest).toBe(false);
    } finally { f.preview.dispose(); }
  });
  it('removes instance tint only inside semantic rendering and restores the instance buffer', () => {
    const f = fixture(), instances = new T.InstancedMesh(new T.BoxGeometry(), f.material, 1);
    instances.setColorAt(0, new T.Color('red')); f.context.subjects[0]!.add(instances);
    const colors = instances.instanceColor;
    try {
      f.preview.render({...defaultDisplaySettings(), mode: 'semantic'}, f.context, () => { expect(instances.instanceColor).toBe(null); });
      expect(instances.instanceColor).toBe(colors);
    } finally { f.preview.dispose(); }
  });
  it('restores shared materials, scene lighting and visibility even when drawing throws', () => {
    const f = fixture(), background = f.scene.background, fog = f.scene.fog;
    const hidden = new T.Mesh(new T.BoxGeometry(), f.material); hidden.visible = false; f.scene.add(hidden);
    f.mesh.layers.set(3);
    try {
      expect(() => f.preview.render({ ...defaultDisplaySettings(), mode: 'clay', scope: 'subject' }, f.context, () => {
        expect(f.mesh.material).not.toBe(f.material);
        expect(f.wall.visible).toBe(false);
        expect(hidden.visible).toBe(false);
        expect(f.light.visible).toBe(false);
        throw new Error('draw failed');
      })).toThrow('draw failed');
      expect(f.mesh.material).toBe(f.material); expect(f.wall.material).toBe(f.material);
      expect(f.wall.visible).toBe(true); expect(f.light.visible).toBe(true);
      expect(f.mesh.layers.mask).toBe(8); expect(f.scene.background).toBe(background); expect(f.scene.fog).toBe(fog);
    } finally { f.preview.dispose(); }
  });

  it('classifies children by their nearest registered root and leaves unknown objects unclassified', () => {
    const f = fixture(), unknown = new T.Mesh(new T.BoxGeometry(), f.material);
    f.scene.add(unknown);
    try {
      f.preview.render({ ...defaultDisplaySettings(), mode: 'semantic', types: ['person'] }, f.context, () => {
        expect(f.mesh.visible).toBe(true); expect(f.wall.visible).toBe(false); expect(unknown.visible).toBe(false);
        expect((f.mesh.material as unknown as T.MeshBasicMaterial).color.getHexString()).toBe('f4b860');
      });
      expect(f.wall.visible).toBe(true); expect(unknown.visible).toBe(true);
    } finally { f.preview.dispose(); }
  });

  it('preserves cutout textures, material arrays and actual skinned meshes', () => {
    const f = fixture(), texture = new T.Texture();
    const cutout = new T.MeshStandardMaterial({ map: texture, alphaMap: texture, alphaTest: .5, side: T.DoubleSide });
    const skin = new T.SkinnedMesh(new T.BoxGeometry(), [cutout, f.material]);
    f.context.subjects[0]!.add(skin);
    const original = skin.material;
    let disposed = false; texture.addEventListener('dispose', () => { disposed = true; });
    f.preview.render({ ...defaultDisplaySettings(), mode: 'unlit' }, f.context, () => {
      const materials = skin.material as unknown as T.MeshBasicMaterial[];
      expect(materials[0]!.map).toBe(texture); expect(materials[0]!.alphaMap).toBe(texture);
      expect(materials[0]!.alphaTest).toBe(.5); expect(materials[0]!.side).toBe(T.DoubleSide);
      expect(skin.parent).toBe(f.context.subjects[0]);
    });
    expect(skin.material).toBe(original);
    f.preview.dispose(); expect(disposed).toBe(false);
  });
});


it('builds only declared map props and never creates models from semantic observations',()=>{
 const scene=new T.Scene();
 const visual=buildInteractionVisuals(scene,[{id:'authored',size:[.2,.3,.4],position:[1,2,3]}]);
 try{
  const object=scene.getObjectByName('authored');expect(object).toBeDefined();expect(object!.position.toArray()).toEqual([1,2,3]);
  visual.update([{id:'custom-object',kind:'pickup',slotId:'pickup',position:new T.Vector3(5,5,5),state:'available'}]);
  expect(scene.getObjectByName('custom-object')).toBeUndefined();expect(object!.visible).toBe(false);
  visual.update([{id:'authored',kind:'pickup',slotId:'pickup',position:new T.Vector3(3,2,1),state:'placed'}]);
  expect(scene.getObjectByName('authored')).toBe(object);expect(object!.visible).toBe(true);expect(object!.position.toArray()).toEqual([3,2,1]);
 }finally{visual.dispose();}
 expect(scene.children).toHaveLength(0);
});
