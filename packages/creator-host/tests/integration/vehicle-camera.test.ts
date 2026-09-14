import * as THREE from 'three';
import {describe, expect, it} from 'vitest';
import {mkdtemp, rm, writeFile as writeFixtureFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const writeFile:typeof writeFixtureFile=async(file,data,options)=>{await mkdir(path.dirname(String(file)),{recursive:true});return writeFixtureFile(file,data,options);};
import type {Page} from 'playwright';
import {applyWhiteboxMaterials} from '../../../../examples/three-creator/vehicle-camera/whitebox-materials.js';
import {readExampleFiles} from '../../src/discovery/example-files.js';
import {ThreeCreatorTools} from '../../src/tools/tools.js';

function expectResetCamera(actual:import('@worldkit/three').CameraState,initial:import('@worldkit/three').CameraState){
 const {cameraCommitRevision,configurationRevision,lifecycleGeneration,subjectGeneration,...framing}=actual;
 const {cameraCommitRevision:oldCommit,configurationRevision:oldConfiguration,lifecycleGeneration:oldLifecycle,subjectGeneration:oldSubject,...opening}=initial;
 expect(framing).toEqual(opening);expect(cameraCommitRevision).toBeGreaterThan(oldCommit);expect(configurationRevision).toBeGreaterThanOrEqual(oldConfiguration);expect(lifecycleGeneration).not.toBe(oldLifecycle);expect(subjectGeneration).not.toBe(oldSubject);
}

it('publishes a mounted opening and follows real driving without replacing the authored lens',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'creator-mounted-opening-')),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:['humanoid.uefn-mannequin']}));
  await writeFile(path.join(root,'index.html'),'<!doctype html><html><body style="margin:0"><script type="module" src="./main.ts"></script></body></html>');
  await writeFile(path.join(root,'main.ts'),`
import * as THREE from 'three';
import {createHumanoidWorld,humanoid} from '@worldkit/three';
const scene=new THREE.Scene();scene.background=new THREE.Color('#fff');scene.add(new THREE.HemisphereLight(0xffffff,0xffffff,2));
const canvas=document.createElement('canvas');document.body.append(canvas);
const map={id:'initial-ride',name:'Ride',description:'Initialization regression',bounds:{min:[-40,-5,-40],max:[40,20,40]},
 boxes:[{id:'floor',position:[0,-.5,0],size:[80,1,80]}],water:[],playerSpawn:[0,.025,0],
 regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[80,80],color:'#fff',modes:['motorcycle']}],
 spawns:[{id:'bike-start',name:'Bike',regionId:'road',vehicleId:'bike',position:[0,.025,0],yaw:Math.PI}]};
const world=await createHumanoidWorld({scene,canvas,map,initialMountId:'bike',characterLoadOptions:{loadTextures:false},
 vehicles:[{instanceId:'bike',assetId:'custom.motorcycle',object:new THREE.Group(),spec:humanoid.createRoadVehicleSpec('motorcycle')}],
});
world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'player'},activation:'on-input',views:{'third-person':{kind:'third-person',opening:{positionWorldMetersXYZ:[4,3,7],lookAtWorldMetersXYZ:[0,1,0],fovDegrees:46},overrides:{framing:{kind:'preserve-opening'},orientation:{recenter:{enabled:true,delaySeconds:.1,yawHalfLifeSeconds:Math.LN2/1.8}}}}}}});
world.setCaptureTargets(['player']);const presentation=world.createPresentation();
(window as any).mountedOpening={world,presentation};await world.start();presentation.focus();
`);
  const first=await service.preview('opening');
  const page=(service as unknown as {session:{page:Page}}).session.page;
  const read=()=>page.evaluate(()=>{const {world}=(window as any).mountedOpening;return {snapshot:world.snapshot(),fov:world.camera.fov};});
  const opening=await read();expect(opening.snapshot).toMatchObject({simulationTick:0,humanoid:{mountedInstanceId:'bike',transition:{remainingSeconds:0}},camera:{mode:'follow-pending',subjectEntityId:'bike'}});
  for(const [i,value]of opening.snapshot.camera.positionWorldMetersXYZ.entries())expect(value).toBeCloseTo([4,3,7][i]!,10);expect(opening.fov).toBeCloseTo(46,10);
  await page.evaluate(async()=>{const {world,presentation}=(window as any).mountedOpening;await world.start();presentation.focus();});
  await page.keyboard.down('w');
  await expect.poll(async()=>{const state=await read();return state.snapshot.camera.desiredYawRadians;},{timeout:15000}).not.toBeNull();
  await page.keyboard.down('d');
  const facing=new THREE.Quaternion(...opening.snapshot.camera.orientationWorldQuaternionXYZW);
  await expect.poll(async()=>new THREE.Quaternion(...(await read()).snapshot.camera.orientationWorldQuaternionXYZW).angleTo(facing),{timeout:15000}).toBeGreaterThan(.05);
  await page.keyboard.up('d');await page.keyboard.up('w');
  const driven=await read();expect(driven.snapshot.camera.mode).toBe('follow');expect(driven.snapshot.humanoid.mountedInstanceId).toBe('bike');expect(driven.fov).toBeCloseTo(46,10);
  expect(new THREE.Vector3(...driven.snapshot.camera.positionWorldMetersXYZ).distanceTo(new THREE.Vector3(4,3,7))).toBeGreaterThan(.1);
  const reset=await service.preview('opening'),restored=await read();expect(restored.snapshot.humanoid.mountedInstanceId).toBe('bike');
  expectResetCamera(restored.snapshot.camera,opening.snapshot.camera);expect(reset.image.sha256).toBe(first.image.sha256);
  for(const framing of ['preserve-opening','target'] as const){
    await page.evaluate(async framing=>{const {world,presentation}=(window as any).mountedOpening;
      if(framing==='target')world.setCameraFollow({configuration:{...world.inspectCamera().document,activation:'immediate',transition:{durationSeconds:0},views:{'third-person':{kind:'third-person',overrides:{lens:{verticalFovDegrees:46},position:{distanceMeters:8},orientation:{initialPitchRadians:.35,recenter:{enabled:true}}}}}}});
      await world.start();presentation.focus();
    },framing);
    const beforeOrbit=(await read()).snapshot.camera;
    await page.keyboard.down('ArrowLeft');await page.keyboard.down('ArrowDown');
    await expect.poll(async()=>{const c=(await read()).snapshot.camera;return c.desiredYawRadians-beforeOrbit.desiredYawRadians;}).toBeGreaterThan(.1);
    await page.keyboard.up('ArrowLeft');await page.keyboard.up('ArrowDown');
    const keyed=(await read()).snapshot.camera;
    expect(keyed.desiredPitchRadians).toBeGreaterThan(beforeOrbit.desiredPitchRadians);
    const canvas=await page.locator('canvas').first().boundingBox();expect(canvas).not.toBeNull();
    const x=canvas!.x+canvas!.width*.5,y=canvas!.y+canvas!.height*.5;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y+20,{steps:5});
    await expect.poll(async()=>(await read()).snapshot.camera.desiredYawRadians).toBeCloseTo(keyed.desiredYawRadians-.14,5);
    await page.mouse.up();const dragged=(await read()).snapshot.camera;
    expect(dragged.desiredPitchRadians).toBeGreaterThan(keyed.desiredPitchRadians);
    for(const mounted of [false,true]){
      await page.keyboard.press('f');
      await expect.poll(async()=>{const h=(await read()).snapshot.humanoid;return h.mountedInstanceId===(mounted?'bike':null)&&h.transition.remainingSeconds===0;},{timeout:10000}).toBe(true);
      const switched=(await read()).snapshot.camera;
      // Native mount handoff restores the selected subject's calibrated orbit.
      if(framing==='target'){expect(switched.desiredYawRadians).toBeCloseTo(0,5);expect(switched.desiredPitchRadians).toBeCloseTo(.35,5);expect(switched.desiredArmDistanceMeters).toBe(8);}
      expect((await read()).fov).toBeCloseTo(46,10);
    }
    const mounted=(await read()).snapshot.camera;
    await page.keyboard.down('ArrowRight');
    await expect.poll(async()=>(await read()).snapshot.camera.desiredYawRadians).toBeLessThan(mounted.desiredYawRadians-.1);
    await page.keyboard.up('ArrowRight');
    await service.preview('opening');expectResetCamera((await read()).snapshot.camera,opening.snapshot.camera);
  }
  const sheets=await service.triviews();expect(sheets.pageErrors).toEqual([]);expect((await read()).fov).toBeCloseTo(46,10);
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},70000);

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
      'vehicle-camera', ['index.html', 'main.ts', 'project.json', 'episode.json', 'whitebox-materials.ts','config/camera.json']);
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
    const mode = () => page.evaluate(() => window.__WORLDKIT_EVAL__!.snapshot!().camera.viewKind);
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
      return {materials, humanoidUuid: world.controlledObject.uuid, view: world.inspectCamera!().document};
    });
    expect(visual.materials.some(material => material.transparent && material.opacity === .25 && material.side === THREE.DoubleSide)).toBe(true);
    expect(visual.materials.some(material => !material.transparent && material.opacity === 1)).toBe(true);
    expect(visual.view).toMatchObject({defaultViewId:'third-person',input:{cycleViewIds:['third-person','first-person','shoulder']}});
    expect(await mode()).toBe('third-person');
    for (const next of ['first-person','shoulder','third-person']) {
      await page.keyboard.press('t');
      await page.waitForFunction(expected => window.__WORLDKIT_EVAL__!.snapshot!().camera.viewKind === expected, next);
    }
    await page.waitForFunction(() => window.__WORLDKIT_EVAL__!.snapshot!().entities.some(entity => entity.id === 'person' && entity.motion?.isGrounded));
    await page.keyboard.press('f');
    await page.waitForFunction(() => {
      const state = window.__WORLDKIT_EVAL__!.snapshot!().humanoid!;
      return state.mountedInstanceId === 'rover' && state.transition.remainingSeconds === 0;
    });
    await page.keyboard.press('t');
    await page.waitForFunction(() => window.__WORLDKIT_EVAL__!.snapshot!().camera.viewKind === 'first-person');
    await page.keyboard.press('f');
    await page.waitForFunction(() => {
      const state = window.__WORLDKIT_EVAL__!.snapshot!().humanoid!;
      return state.mountedInstanceId === null && state.transition.remainingSeconds === 0;
    });
    await page.getByRole('button', {name: 'Reset'}).click();
    await page.waitForFunction(() => window.__WORLDKIT_EVAL__!.snapshot!().camera.viewKind === 'third-person');
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
      'vehicle-camera', ['index.html', 'main.ts', 'project.json', 'episode.json', 'whitebox-materials.ts','config/camera.json']);
    example.files['main.ts'] = example.files['main.ts']!.replace(
      'await world.start(); presentation.focus();', `

world.useAuthoredCamera();camera.position.set(14,18,22);camera.lookAt(0,0,0);camera.fov=43;camera.updateProjectionMatrix();
world.setKeyBindings({forward:['KeyI']});
world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'person'},activation:'on-input',input:{cycleViewIds:['third-person','first-person','shoulder']},views:{'third-person':{kind:'third-person',opening:{positionWorldMetersXYZ:[14,18,22],lookAtWorldMetersXYZ:[0,0,0],fovDegrees:43},overrides:{framing:{kind:'preserve-opening'},position:{subjectTranslationHalfLifeSeconds:0,armHalfLifeSeconds:0,anchorHalfLifeSeconds:0},orientation:{recenter:{enabled:false}},lens:{nearMeters:camera.near,farMeters:camera.far}}},'first-person':{kind:'first-person'},shoulder:{kind:'shoulder'}}}});
(window as any).__openingTest={world,presentation};
await world.start(); presentation.focus();`);
    for (const [name, content] of Object.entries(example.files)) await writeFile(path.join(root, name), content);
    await service.inspect();
    const page = (service as unknown as {session: {page: Page}}).session.page;
    const read = () => page.evaluate(() => {
      const {world,presentation}=(window as any).__openingTest;
      const observer=window.__WORLDKIT_EVAL__!;return observer.withPresentation!(()=>({mode:world.cameraMode,view:world.snapshot().camera.viewKind,
        pose:world.camera.position.toArray(),orientation:world.camera.quaternion.toArray(),fov:world.camera.fov,tick:world.simulationTick,
        subjectPosition:observer.targets.person!.getWorldPosition(world.camera.position.clone()).toArray(),
        focused:document.activeElement===presentation.inputSurface,
        isolated:presentation.inputSurface!==world.renderer.domElement&&!presentation.inputSurface.contains(presentation.ui.root)}));
    });
    const initial=await read();expect(initial).toMatchObject({mode:'follow-pending',fov:43,focused:true,isolated:true});
    // Unbound keys, UI focus and a paused clock must leave follow pending.
    await page.keyboard.press('w');expect((await read()).mode).toBe('follow-pending');
    await page.getByRole('button',{name:'Reset'}).focus();await page.keyboard.press('i');expect((await read()).mode).toBe('follow-pending');
    await page.evaluate(()=>{const {world,presentation}=(window as any).__openingTest;world.stop();presentation.focus();});
    await page.keyboard.press('i');expect((await read()).mode).toBe('follow-pending');
    await page.evaluate(async()=>{const {world,presentation}=(window as any).__openingTest;await world.start();presentation.focus();});
    const beforeInput=await read();
    await page.keyboard.down('i');
    await page.waitForFunction(()=>(window as any).__openingTest.world.cameraMode==='follow');
    await page.waitForFunction(()=>(window as any).__openingTest.world.humanoid.inspectControls().lastApplied?.input.forward===1);
    await page.keyboard.up('i');
    await page.evaluate(()=>{const {world}=(window as any).__openingTest;world.stop();world.render();});
    const playing=await read();expect(playing.view).toBe('third-person');expect(playing.fov).toBe(initial.fov);
    for(const [index,value] of initial.orientation.entries())expect(playing.orientation[index]).toBeCloseTo(value,9);
    // Compare framing against measured subject displacement; ground settling is real movement.
    for(let axis=0;axis<3;axis++)expect(playing.pose[axis]-beforeInput.pose[axis]).toBeCloseTo(playing.subjectPosition[axis]!-beforeInput.subjectPosition[axis]!,5);
    await page.evaluate(async()=>{const {world,presentation}=(window as any).__openingTest;await world.start();presentation.focus();});
    // After the authored third-person opening activates, explicit T switching uses the SDK input owner.
    await page.keyboard.press('t');await page.waitForFunction(()=>(window as any).__openingTest.world.snapshot().camera.viewKind==='first-person');
    await page.keyboard.press('t');await page.waitForFunction(()=>(window as any).__openingTest.world.snapshot().camera.viewKind==='shoulder');
    await service.preview('opening');const reset=await read();expect(reset).toMatchObject({mode:'follow-pending',pose:initial.pose,orientation:initial.orientation,fov:43,tick:0});
    // Creator semantic command uses the same public camera owner while paused.
    const receipt=await page.evaluate(()=>(window as any).__openingTest.world.setCameraView('third-person'));
    expect(receipt).toBeUndefined();expect((await read()).mode).toBe('follow');
    // Episode selects its own view; DOM input must leave the exclusive clock alone.
    await page.evaluate(async()=>{await window.__WORLDKIT_EVAL__!.episode!.prepareSegment({positionWorldMetersXYZ:[1.9,0,0],facingYawRadians:0,cameraViewId:'shoulder',humanoid:{}},{widthPixels:640,heightPixels:360});(window as any).__openingTest.presentation.focus();});
    const before=await read();await page.keyboard.press('i');expect(await read()).toEqual(before);
    await page.evaluate(async()=>{window.__WORLDKIT_EVAL__!.episode!.release();await (window as any).__openingTest.world.reset();});
    expect((await read()).mode).toBe('follow-pending');
    await page.evaluate(async()=>{const {world,presentation}=(window as any).__openingTest;await world.start();presentation.focus();});
    // Restarting live input after Episode release retains the world's pending follow policy.
    await page.keyboard.down('i');await page.waitForFunction(()=>(window as any).__openingTest.world.cameraMode==='follow');await page.keyboard.up('i');
    expect((await read()).fov).toBe(43);
    await service.preview('opening');
    await page.evaluate(async()=>{const {world,presentation}=(window as any).__openingTest;await world.start();presentation.focus();});
    const bounds=await page.evaluate(()=>{const r=(window as any).__openingTest.presentation.inputSurface.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
    await page.mouse.move(bounds.x,bounds.y);await page.mouse.wheel(0,80);
    await page.waitForFunction(()=>(window as any).__openingTest.world.cameraMode==='follow');
    expect((await read()).fov).toBe(43);
    expect((await service.inspect()).pageErrors).toEqual([]);
  } finally { await service.close(); await rm(root, {recursive:true,force:true}); }
}, 30000);
