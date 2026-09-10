import * as THREE from 'three';
import {describe, expect, it} from 'vitest';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {Page} from 'playwright';
import {applyWhiteboxMaterials} from '../../examples/three-creator/vehicle-camera/whitebox-materials.js';
import {readExampleFiles} from './example-files.js';
import {ThreeCreatorTools} from './tools.js';

describe('example-local whitebox materials', () => {
  it('recolors shared opaque and glass clones without mutating their sources', () => {
    const texture = new THREE.Texture();
    const opaque = new THREE.MeshStandardMaterial({color: '#cc6633', roughness: .2, metalness: .8});
    const glass = new THREE.MeshPhysicalMaterial({color: '#3388cc', roughness: .1,
      transparent: true, opacity: .25, side: THREE.DoubleSide, alphaTest: .12,
      depthWrite: false, map: texture, alphaMap: texture, transmission: .4, ior: 1.3});
    const root = new THREE.Group(), nested = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(), opaque);
    const otherBody = new THREE.Mesh(body.geometry, opaque);
    const window = new THREE.Mesh(body.geometry, glass);
    const otherWindow = new THREE.Mesh(body.geometry, glass);
    const outside = new THREE.Mesh(body.geometry, glass);
    root.add(body, window, nested); nested.add(otherBody, otherWindow);

    const restore = applyWhiteboxMaterials(root);
    try {
      expect(body.material).not.toBe(opaque);
      expect(otherBody.material).toBe(body.material);
      expect(window.material).not.toBe(glass);
      expect(otherWindow.material).toBe(window.material);
      expect(body.material.color.getHexString()).toBe('e5e5e5');
      expect(body.material).toMatchObject({roughness: 1, metalness: 0, transparent: false, opacity: 1});
      expect(window.material.color.getHexString()).toBe('d7dfe3');
      expect(window.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
      expect(window.material).toMatchObject({roughness: 1, metalness: 0, transparent: true,
        opacity: .25, side: THREE.DoubleSide, alphaTest: .12, depthWrite: false, transmission: .4, ior: 1.3});
      expect(window.material.map).toBe(texture);
      expect(window.material.alphaMap).toBe(texture);
      expect(outside.material).toBe(glass);
      expect(opaque.color.getHexString()).toBe('cc6633');
      expect(opaque).toMatchObject({roughness: .2, metalness: .8, transparent: false, opacity: 1});
      expect(glass.color.getHexString()).toBe('3388cc');
      expect(glass).toMatchObject({roughness: .1, transparent: true, opacity: .25,
        side: THREE.DoubleSide, alphaTest: .12, depthWrite: false, transmission: .4, ior: 1.3});
    } finally { restore(); opaque.dispose(); glass.dispose(); texture.dispose(); body.geometry.dispose(); }
  });

  it('preserves array slot order and aliases across arrays and single-material meshes', () => {
    const opaque = new THREE.MeshStandardMaterial({color: '#cc6633'});
    const glass = new THREE.MeshStandardMaterial({transparent: true, opacity: .25, side: THREE.DoubleSide});
    const original = [opaque, glass, opaque, glass];
    const geometry = new THREE.BoxGeometry();
    const panels = new THREE.Mesh(geometry, original), shared = new THREE.Mesh(geometry, original);
    const reverse = new THREE.Mesh(geometry, [glass, opaque]);
    const single = new THREE.Mesh(geometry, glass), root = new THREE.Group();
    root.add(panels, shared, reverse, single);
    const restore = applyWhiteboxMaterials(root);
    try {
      expect(panels.material).not.toBe(original);
      expect(panels.material).toHaveLength(4);
      const [bodyClone, glassClone] = panels.material;
      expect(bodyClone).not.toBe(opaque); expect(glassClone).not.toBe(glass);
      expect(panels.material[2]).toBe(bodyClone); expect(panels.material[3]).toBe(glassClone);
      expect(shared.material[0]).toBe(bodyClone); expect(shared.material[1]).toBe(glassClone);
      expect(reverse.material[0]).toBe(glassClone); expect(reverse.material[1]).toBe(bodyClone);
      expect(single.material).toBe(glassClone);
      expect(original).toEqual([opaque, glass, opaque, glass]);
      expect(original[0]).toBe(opaque); expect(original[1]).toBe(glass);
    } finally { restore(); opaque.dispose(); glass.dispose(); geometry.dispose(); }
  });

  it('restores exact original references and disposes each clone once without disposing shared resources', () => {
    const texture = new THREE.Texture(), geometry = new THREE.BoxGeometry();
    const opaque = new THREE.MeshStandardMaterial({map: texture});
    const glass = new THREE.MeshStandardMaterial({map: texture, transparent: true, opacity: .25});
    const original = [glass, opaque, glass];
    const panels = new THREE.Mesh(geometry, original), shared = new THREE.Mesh(geometry, original);
    const single = new THREE.Mesh(geometry, opaque), root = new THREE.Group();
    root.add(panels, shared, single);
    let sourceDisposals = 0, resourceDisposals = 0;
    for (const material of [opaque, glass]) material.addEventListener('dispose', () => sourceDisposals++);
    texture.addEventListener('dispose', () => resourceDisposals++);
    geometry.addEventListener('dispose', () => resourceDisposals++);
    const restore = applyWhiteboxMaterials(root);
    const clones = [...new Set([...panels.material, ...shared.material, single.material])];
    const disposals: THREE.Material[] = [];
    for (const clone of clones) clone.addEventListener('dispose', () => disposals.push(clone));
    // Disposal must restore remembered meshes even if scene ownership changed.
    root.remove(panels);
    restore(); restore();
    expect(panels.material).toBe(original); expect(shared.material).toBe(original);
    expect(single.material).toBe(opaque);
    expect(original[0]).toBe(glass); expect(original[1]).toBe(opaque); expect(original[2]).toBe(glass);
    expect(clones).toHaveLength(2);
    expect(disposals).toHaveLength(2);
    expect(new Set(disposals).size).toBe(2);
    expect(sourceDisposals).toBe(0); expect(resourceDisposals).toBe(0);
    opaque.dispose(); glass.dispose(); texture.dispose(); geometry.dispose();
  });

  it('supports basic and colorless materials while leaving non-mesh objects alone', () => {
    const basic = new THREE.MeshBasicMaterial({color: '#ff0000', side: THREE.BackSide, alphaTest: .5});
    const depth = new THREE.MeshDepthMaterial({side: THREE.DoubleSide});
    const geometry = new THREE.BoxGeometry(), root = new THREE.Group();
    const colored = new THREE.Mesh(geometry, basic), colorless = new THREE.Mesh(geometry, depth);
    const emptySlots = new THREE.Mesh(geometry, []);
    const lineMaterial = new THREE.LineBasicMaterial({color: '#ff0000'});
    const line = new THREE.LineSegments(geometry, lineMaterial);
    root.add(colored, colorless, emptySlots, line);
    const restore = applyWhiteboxMaterials(root);
    try {
      expect(colored.material).not.toBe(basic);
      expect(colored.material.color.getHexString()).toBe('e5e5e5');
      expect(colored.material).toMatchObject({side: THREE.BackSide, alphaTest: .5});
      expect(colorless.material).not.toBe(depth);
      expect(colorless.material).toBeInstanceOf(THREE.MeshDepthMaterial);
      expect(colorless.material.side).toBe(THREE.DoubleSide);
      expect(colorless.material).not.toHaveProperty('color');
      expect(emptySlots.material).toEqual([]);
      expect(line.material).toBe(lineMaterial);
    } finally { restore(); basic.dispose(); depth.dispose(); lineMaterial.dispose(); geometry.dispose(); }
  });
});

it('runs the self-drawn car and preset humanoid with native T cycling, F mounting and reset', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vehicle-camera-browser-'));
  const service = new ThreeCreatorTools(root, 'three-sdk');
  try {
    const example = await readExampleFiles(path.resolve('examples/three-creator/vehicle-camera'),
      'vehicle-camera', ['index.html', 'main.ts', 'project.json', 'episode.json', 'whitebox-materials.ts']);
    example.files['main.ts'] = example.files['main.ts']!.replace('await world.start(); presentation.focus();', `
const preparationEvidence:any[]=[];
const compile=world.renderer!.compileAsync.bind(world.renderer);
world.renderer!.compileAsync=async (...args)=>{
 preparationEvidence.push({phase:'compile',running:world.isRunning,tick:world.simulationTick,ready:!!window.__WORLDKIT_EVAL__});
 const result=await compile(...args);
 preparationEvidence.push({phase:'compiled',running:world.isRunning,tick:world.simulationTick,ready:!!window.__WORLDKIT_EVAL__});
 return result;
};
const draw=world.renderer!.render.bind(world.renderer);let opening=true;
world.renderer!.render=(...args)=>{
 if(opening){opening=false;preparationEvidence.push({phase:'render',running:world.isRunning,tick:world.simulationTick,ready:!!window.__WORLDKIT_EVAL__});}
 draw(...args);
};
await world.start();
preparationEvidence.push({phase:'started',running:world.isRunning,tick:world.simulationTick,ready:!!window.__WORLDKIT_EVAL__});
(window as any).__preparationEvidence=preparationEvidence;
presentation.focus();`);
    for (const [name, content] of Object.entries(example.files)) await writeFile(path.join(root, name), content);
    const initial = await service.inspect();
    expect(initial.pageErrors).toEqual([]); expect(initial.blockedNetworkRequests).toEqual([]);
    expect(initial.feedback.characterContinuity).toMatchObject({status: 'observed', issues: []});
    const page = (service as unknown as {session: {page: Page}}).session.page;
    expect(await page.evaluate(()=>(window as any).__preparationEvidence)).toEqual([
      {phase:'compile',running:false,tick:0,ready:false},
      {phase:'compiled',running:false,tick:0,ready:false},
      {phase:'render',running:false,tick:0,ready:false},
      {phase:'started',running:true,tick:0,ready:true},
    ]);
    const mode = () => page.evaluate(() => window.__WORLDKIT_EVAL__!.snapshot!().humanoid!.cameraMode);
    const visual = await page.evaluate(() => {
      const world = window.__WORLDKIT_EVAL__!;
      const rover = world.targets['rover']!;
      const materials: {transparent: boolean; opacity: number; side: number}[] = [];
      rover.traverse(object => {
        const mesh = object as import('three').Mesh;
        if (mesh.isMesh) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          materials.push({transparent: material.transparent, opacity: material.opacity, side: material.side});
        }
      });
      return {materials, humanoidUuid: world.controlledObject.uuid, view: world.snapshot!().humanoid!.view};
    });
    expect(visual.materials.some(material => material.transparent && material.opacity === .25 && material.side === THREE.DoubleSide)).toBe(true);
    expect(visual.materials.some(material => !material.transparent && material.opacity === 1)).toBe(true);
    expect(visual.view).toMatchObject({defaultPerspective: 'third-person', keyboardToggleEnabled: true});
    expect(await mode()).toBe(0);
    for (const next of [1, 2, 0]) {
      await page.keyboard.press('t');
      await page.waitForFunction(expected => window.__WORLDKIT_EVAL__!.snapshot!().humanoid!.cameraMode === expected, next);
    }
    await page.waitForFunction(() => window.__WORLDKIT_EVAL__!.snapshot!().entities.some(entity => entity.id === 'person' && entity.motion?.isGrounded));
    await page.keyboard.press('f');
    await page.waitForFunction(() => {
      const state = window.__WORLDKIT_EVAL__!.snapshot!().humanoid!;
      return state.mountedInstanceId === 'rover' && state.transition.remainingSeconds === 0;
    });
    await page.keyboard.press('t');
    await page.waitForFunction(() => window.__WORLDKIT_EVAL__!.snapshot!().humanoid!.cameraMode === 1);
    await page.keyboard.press('f');
    await page.waitForFunction(() => {
      const state = window.__WORLDKIT_EVAL__!.snapshot!().humanoid!;
      return state.mountedInstanceId === null && state.transition.remainingSeconds === 0;
    });
    await page.getByRole('button', {name: 'Reset'}).click();
    await page.waitForFunction(() => window.__WORLDKIT_EVAL__!.snapshot!().humanoid!.cameraMode === 0);
    expect(await page.evaluate(() => window.__WORLDKIT_EVAL__!.controlledObject.uuid)).toBe(visual.humanoidUuid);
    const final = await service.inspect();
    expect(final.feedback.characterContinuity).toMatchObject({status: 'observed', issues: []});
    expect(final.pageErrors).toEqual([]);
  } finally { await service.close(); await rm(root, {recursive: true, force: true}); }
}, 30000);

it('hands an authored opening to follow through the public Presentation surface without replacing SDK input', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opening-camera-browser-'));
  const service = new ThreeCreatorTools(root, 'three-sdk');
  try {
    const example = await readExampleFiles(path.resolve('examples/three-creator/vehicle-camera'),
      'vehicle-camera', ['index.html', 'main.ts', 'project.json', 'episode.json', 'whitebox-materials.ts', 'opening-camera.ts']);
    example.files['main.ts'] = `import {installOpeningCameraHandoff} from './opening-camera';\n` + example.files['main.ts']!.replace(
      'await world.start(); presentation.focus();', `
world.humanoid!.applyProfile({view:{defaultPerspective:'first-person'}});
world.useAuthoredCamera();camera.position.set(14,18,22);camera.lookAt(0,0,0);camera.fov=43;camera.updateProjectionMatrix();
world.setKeyBindings({forward:['KeyI']});
const releaseHandoff=installOpeningCameraHandoff(world,presentation.inputSurface);
(window as any).__openingTest={world,presentation,releaseHandoff};
await world.start(); presentation.focus();`);
    for (const [name, content] of Object.entries(example.files)) await writeFile(path.join(root, name), content);
    await service.inspect();
    const page = (service as unknown as {session: {page: Page}}).session.page;
    const read = () => page.evaluate(() => {
      const {world,presentation}=(window as any).__openingTest;
      return {mode:world.cameraMode,view:world.humanoid.snapshot().cameraMode,
        pose:world.camera.position.toArray(),fov:world.camera.fov,tick:world.simulationTick,
        focused:document.activeElement===presentation.inputSurface,
        isolated:presentation.inputSurface!==world.renderer.domElement&&!presentation.inputSurface.contains(presentation.ui.root)};
    });
    const initial=await read();expect(initial).toMatchObject({mode:'authored',fov:43,focused:true,isolated:true});
    // Unbound keys, repeats and UI input must not begin gameplay.
    await page.keyboard.press('w');expect((await read()).mode).toBe('authored');
    await page.evaluate(()=>{const {presentation}=(window as any).__openingTest;presentation.inputSurface.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyI',repeat:true,bubbles:true}));});
    expect((await read()).mode).toBe('authored');
    await page.getByRole('button',{name:'Reset'}).focus();await page.keyboard.press('i');expect((await read()).mode).toBe('authored');
    await page.evaluate(()=>{const {world,presentation}=(window as any).__openingTest;world.stop();presentation.focus();});
    await page.keyboard.press('i');expect((await read()).mode).toBe('authored');
    await page.evaluate(async()=>{const {world,presentation}=(window as any).__openingTest;await world.start();presentation.focus();});
    await page.keyboard.down('i');
    await page.waitForFunction(()=>(window as any).__openingTest.world.cameraMode==='follow');
    await page.waitForFunction(()=>(window as any).__openingTest.world.humanoid.inspectControls().lastApplied?.input.forward===1);
    await page.keyboard.up('i');expect((await read()).view).toBe(1);
    await page.keyboard.press('t');await page.waitForFunction(()=>(window as any).__openingTest.world.humanoid.snapshot().cameraMode===2);
    await service.preview('opening');const reset=await read();expect(reset).toMatchObject({mode:'authored',pose:initial.pose,fov:43,tick:0});
    // Creator semantic command uses the same public camera owner while paused.
    const receipt=await page.evaluate(()=>window.__WORLDKIT_EVAL__!.execute!({type:'humanoid.set-camera-mode',mode:0}));
    expect(receipt.status).toBe('applied');expect((await read()).mode).toBe('follow');
    // Episode selects its own view; DOM input must leave the exclusive clock alone.
    await page.evaluate(async()=>{await window.__WORLDKIT_EVAL__!.episode!.prepareSegment({positionWorldMetersXYZ:[1.9,0,0],facingYawRadians:0,humanoid:{cameraMode:2}},{widthPixels:640,heightPixels:360});(window as any).__openingTest.presentation.focus();});
    const before=await read();await page.keyboard.press('i');expect(await read()).toEqual(before);
    await page.evaluate(async()=>{window.__WORLDKIT_EVAL__!.episode!.release();await (window as any).__openingTest.world.reset();});
    expect((await read()).mode).toBe('authored');
    await page.evaluate(async()=>{const {world,presentation,releaseHandoff}=(window as any).__openingTest;releaseHandoff();await world.start();presentation.focus();});
    await page.keyboard.press('i');expect((await read()).mode).toBe('authored');
    expect((await service.inspect()).pageErrors).toEqual([]);
  } finally { await service.close(); await rm(root, {recursive:true,force:true}); }
}, 30000);
