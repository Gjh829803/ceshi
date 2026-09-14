import {mkdtemp,mkdir,rm,writeFile as writeFixtureFile} from 'node:fs/promises';
import path from 'node:path';
const writeFile:typeof writeFixtureFile=async(file,data,options)=>{await mkdir(path.dirname(String(file)),{recursive:true});return writeFixtureFile(file,data,options);};
import os from 'node:os';
import {expect,it} from 'vitest';
import type {Page} from 'playwright';
import {ThreeCreatorTools} from '../../src/tools/tools';
import {executeThreeCreatorTool} from '../../src/cli/mcp';
import {createAssetPolicySnapshot,assetPolicyHash} from '../../src/assets/asset-policy.mjs';
import catalog from '../../../../assets/three-creator/asset-catalog.json';


function cameraFixtureSource(source:string, firstPerson=false):string {
 return `import {createHumanoidCameraDocument as cameraTestDocument} from '@worldkit/three';\n`+source.replace('await world.start();',`world.setCameraFollow({configuration:{...cameraTestDocument('person','${firstPerson?'first-person':'third-person'}'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});window.cameraTestWorld=world;await world.start();`);
}

it('captures a complete rider in object views while preserving the configured first-person world',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'rider-full-capture-')),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const example=await service.examples('custom-vehicle');
  for(const [name,content]of Object.entries(example.files))await writeFile(path.join(root,name),name==='main.ts'?cameraFixtureSource(content,true):content);
  await service.inspect();const page=(service as unknown as {session:{page:Page}}).session.page;
  const result=await page.evaluate(async()=>{
   const host=window.__THREE_CREATOR_HOST__!,world=window.__WORLDKIT_EVAL__!;await host.stop();
   host.capture('opening',[],null);
   const before=world.snapshot!(),first=host.capture('entity-triview',['player'],null).image;
   const after=world.snapshot!();
   const meshes:import('three').SkinnedMesh[]=[];world.controlledObject.traverse(o=>{if((o as import('three').SkinnedMesh).isSkinnedMesh)meshes.push(o as import('three').SkinnedMesh);});
   const clipped=meshes.map(mesh=>mesh.geometry);
   const failedRender=world.renderer.render;
   world.renderer.render=()=>{throw new Error('object capture fixture');};
   try{host.capture('entity-triview',['player'],null);}catch{}finally{world.renderer.render=failedRender;}
   const restoredAfterFailure=meshes.every((mesh,i)=>mesh.geometry===clipped[i]);
   (window as unknown as {cameraTestWorld:import('@worldkit/three').ThreeWorld}).cameraTestWorld.setCameraView('third-person');
   const full=host.capture('entity-triview',['player'],null).image;
   return {sameImage:first===full,before,after,restoredAfterFailure};
  });
  expect(result.before.camera.viewKind).toBe('first-person');expect(result.after).toEqual(result.before);
  expect(result.sameImage).toBe(true);expect(result.restoredAfterFailure).toBe(true);
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},30000);

it('uses configured first-person defaults and SDK keyboard toggles in a generated rider world',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'rider-view-settings-')),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const example=await service.examples('custom-vehicle');
  for(const [name,content]of Object.entries(example.files))await writeFile(path.join(root,name),name==='main.ts'?cameraFixtureSource(content,true):content);
  const initial=await service.inspect();expect(initial.observation.snapshot.camera.viewKind).toBe('first-person');
  const page=(service as unknown as {session:{page:Page}}).session.page;
  const mode=()=>page.evaluate(()=>window.__WORLDKIT_EVAL__!.snapshot!().camera.viewKind);
  await page.keyboard.down('t');await page.waitForFunction(()=>window.__WORLDKIT_EVAL__!.snapshot!().camera.viewKind==='shoulder');
  await page.keyboard.down('t');expect(await mode()).toBe('shoulder');await page.keyboard.up('t');
  await page.keyboard.press('t');await page.waitForFunction(()=>window.__WORLDKIT_EVAL__!.snapshot!().camera.viewKind==='third-person');
  await page.keyboard.press('t');await page.waitForFunction(()=>window.__WORLDKIT_EVAL__!.snapshot!().camera.viewKind==='first-person');
  await page.evaluate(()=>{const input=document.createElement('input');input.id='focus-fixture';document.body.append(input);input.focus();});
  await page.keyboard.press('t');expect(await mode()).toBe('first-person');
  await page.evaluate(()=>document.getElementById('focus-fixture')!.remove());await page.mouse.click(20,20);
  await page.evaluate(()=>{const world=(window as unknown as {cameraTestWorld:import('@worldkit/three').ThreeWorld}).cameraTestWorld;world.setCameraFollow({configuration:{...world.inspectCamera().document!,input:{cycleViewIds:[]}}});});
  await page.keyboard.press('t');expect(await mode()).toBe('first-person');
  await page.evaluate(()=>(window as unknown as {cameraTestWorld:import('@worldkit/three').ThreeWorld}).cameraTestWorld.setCameraView('third-person'));expect(await mode()).toBe('third-person');
  await page.evaluate(async()=>{await window.__THREE_CREATOR_HOST__!.reset();});expect(await mode()).toBe('first-person');
  await page.keyboard.press('t');expect(await mode()).toBe('first-person');
  const result=await service.inspect();expect(result.pageErrors).toEqual([]);
  expect(result.feedback.characterContinuity.issues).toEqual([]);
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},30000);

it('observes SDK first-person clipping as partial and restores full rider checks on return',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'rider-perspectives-')),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const example=await service.examples('custom-vehicle');
  for(const [name,content]of Object.entries(example.files))await writeFile(path.join(root,name),name==='main.ts'?cameraFixtureSource(content):content);
  await service.inspect();const page=(service as unknown as {session:{page:Page}}).session.page;
  const result=await page.evaluate(async()=>{
   const host=window.__THREE_CREATOR_HOST__!,world=window.__WORLDKIT_EVAL__!;
   await host.stop();const initial=host.read().characterContinuity;
   const meshes:import('three').SkinnedMesh[]=[];
   world.controlledObject.traverse(object=>{if((object as import('three').SkinnedMesh).isSkinnedMesh)meshes.push(object as import('three').SkinnedMesh);});
   const geometries=meshes.map(mesh=>mesh.geometry);
   const enter=(window as unknown as {cameraTestWorld:import('@worldkit/three').ThreeWorld}).cameraTestWorld.setCameraView('first-person');
   const firstPerson=host.read().characterContinuity,clipped=world.withPresentation!(()=>meshes.some((mesh,i)=>mesh.geometry!==geometries[i]));
   const firstImage=host.capture('opening',[],null).image;
   const repeatedImage=host.capture('opening',[],null).image;
   world.controlledObject.visible=false;const hidden=host.read().characterContinuity;world.controlledObject.visible=true;
   const exit=(window as unknown as {cameraTestWorld:import('@worldkit/three').ThreeWorld}).cameraTestWorld.setCameraView('third-person');
   const restored=host.read().characterContinuity,originalGeometry=meshes.every((mesh,i)=>mesh.geometry===geometries[i]);
   return {initial,enter,firstPerson,clipped,repeatedCaptureIdentical:firstImage===repeatedImage,hidden,exit,restored,originalGeometry};
  });
  expect(result.enter).toBeUndefined();expect(result.exit).toBeUndefined();
  expect(result.clipped).toBe(true);expect(result.originalGeometry).toBe(true);expect(result.repeatedCaptureIdentical).toBe(true);
  expect(result.firstPerson).toMatchObject({status:'partial',issues:[],evidence:{geometryIdentity:'deferred-first-person',rootUuid:result.initial.evidence!.rootUuid}});
  expect(result.hidden.issues).toContain('CHARACTER_VISUAL_HIDDEN');
  expect(result.restored).toMatchObject({status:'observed',issues:[],evidence:{geometryIdentity:'checked'}});
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},30000);

it('runs a custom vehicle with only the preset human asset and exposes hidden-rider evidence',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'custom-vehicle-'));
 const service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const example=await service.examples('custom-vehicle');
  expect(JSON.parse(example.files['project.json']).assetIds).toEqual(['humanoid.uefn-mannequin']);
  for(const [file,content]of Object.entries(example.files))await writeFile(path.join(root,file),String(content));
  const initial=await service.inspect();
  expect(initial.pageErrors).toEqual([]);expect(initial.blockedNetworkRequests).toEqual([]);
  expect(initial.feedback.characterContinuity).toMatchObject({status:'observed',issues:[]});
  const page=(service as unknown as {session:{page:Page}}).session.page;
  await page.waitForFunction(()=>window.__WORLDKIT_EVAL__?.snapshot?.().entities.some(entity=>entity.id==='person'&&entity.motion?.isGrounded));
  const result=await page.evaluate(async()=>{
   const observer=window.__WORLDKIT_EVAL__!,host=window.__THREE_CREATOR_HOST__!;
   await host.stop();host.beginTrace();
   const tick=observer.snapshot!().simulationTick;
   const start=host.read().characterContinuity;
   const enter=await observer.execute!({type:'vehicle.enter',instanceId:'custom-bike'});
   const mounted=host.read().characterContinuity;
   observer.controlledObject.visible=false;
   const hidden=host.read().characterContinuity;
   observer.controlledObject.visible=true;
   const endTick=observer.snapshot!().simulationTick;
   const children=[...observer.controlledObject.children];
   const replacements=children.map(child=>child.clone());
   observer.controlledObject.remove(...children);observer.controlledObject.add(...replacements);
   await host.start();const restarted=host.read().characterContinuity;
   observer.controlledObject.remove(...replacements);observer.controlledObject.add(...children);
   return {tick,endTick,start,enter,mounted,hidden,restarted};
  });
  expect(result.enter.status,JSON.stringify(result.enter)).toBe('applied');
  await page.waitForFunction(()=>window.__WORLDKIT_EVAL__?.snapshot?.().humanoid?.transition.remainingSeconds===0);
  const after=await page.evaluate(async()=>{
   const observer=window.__WORLDKIT_EVAL__!,host=window.__THREE_CREATOR_HOST__!;
   await host.stop();
   const exit=await observer.execute!({type:'vehicle.exit'});
   const dismounted=host.read().characterContinuity;
   await host.reset();const reset=host.read().characterContinuity;host.endTrace();
   return {exit,dismounted,reset};
  });
  expect(after.exit.status,JSON.stringify(after.exit)).toBe('applied');
  expect(result.mounted).toMatchObject({status:'observed',issues:[],evidence:{mountedInstanceId:'custom-bike',rootUuid:result.start.evidence!.rootUuid}});
  expect(result.hidden.issues).toContain('CHARACTER_VISUAL_HIDDEN');
  expect(result.restarted.issues).toContain('CHARACTER_VISUAL_REPLACED');
  expect(after.dismounted.evidence?.mountedInstanceId).toBeNull();
  expect(after.reset.issues).toEqual([]);expect(after.reset.evidence?.rootUuid).toBe(result.start.evidence!.rootUuid);
  expect(result.endTick).toBe(result.tick);
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},30000);

it('allows procedural vehicle geometry when the frozen policy forbids custom external asset files',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'custom-vehicle-policy-'));
 const snapshot=createAssetPolicySnapshot({schemaVersion:1,allowedAssetIds:['humanoid.uefn-mannequin'],defaultHumanoidAssetId:'humanoid.uefn-mannequin',allowCustomAssets:false},catalog.assets);
 const file=path.join(root,'policy.json');await writeFile(file,JSON.stringify(snapshot));
 await mkdir(path.join(root,'author'));
 const service=new ThreeCreatorTools(path.join(root,'author'),'three-sdk',{assetPolicySnapshotPath:file,assetPolicySha256:assetPolicyHash(snapshot)});
 try{
  const example=await service.examples('custom-vehicle');
  for(const [name,content]of Object.entries(example.files))await writeFile(path.join(service.workspace,name),content);
  const candidate=await service.compiler.prepare();
  expect(candidate.profile).toBe('three-sdk');
  const schema=await service.schema();expect(schema.humanAuthoring?.exampleTopic).toBe('getting-started');
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},30000);

it('matches actual rider pixels for manual transforms and material groups without blocking Host observation',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'rider-renderability-'));
 const service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const example=await service.examples('custom-vehicle');
  for(const [file,content]of Object.entries(example.files))await writeFile(path.join(root,file),content);
  await service.inspect();
  const page=(service as unknown as {session:{page:Page}}).session.page;
  const result=await page.evaluate(async()=>{
   const world=window.__WORLDKIT_EVAL__!,host=window.__THREE_CREATOR_HOST__!;
   await host.stop();
   const meshes:import('three').SkinnedMesh[]=[];
   world.controlledObject.traverse(object=>{if((object as import('three').SkinnedMesh).isSkinnedMesh)meshes.push(object as import('three').SkinnedMesh);});
   const saved=meshes.map(mesh=>({mesh,matrix:mesh.matrix.clone(),auto:mesh.matrixAutoUpdate,groups:structuredClone(mesh.geometry.groups),material:mesh.material}));
   const normal=host.capture('opening',[],null).image;
   world.controlledObject.visible=false;const hidden=host.capture('opening',[],null).image;world.controlledObject.visible=true;
   for(const {mesh}of saved){mesh.matrixAutoUpdate=false;mesh.matrix.makeScale(0,0,0);mesh.matrixWorldNeedsUpdate=true;}
   const collapsed=host.capture('opening',[],null).image,matrixFeedback=host.read().characterContinuity;
   for(const s of saved){s.mesh.matrix.copy(s.matrix);s.mesh.matrixAutoUpdate=s.auto;s.mesh.matrixWorldNeedsUpdate=true;}
   for(const {mesh,material}of saved){
    const on=(Array.isArray(material)?material[0]!:material).clone(),off=on.clone();off.visible=false;
    mesh.material=[off,on];mesh.geometry.clearGroups();mesh.geometry.addGroup(0,mesh.geometry.index!.count,0);
   }
   const grouped=host.capture('opening',[],null).image,groupFeedback=host.read().characterContinuity;
   for(const {mesh,material}of saved){
    mesh.material=[undefined,Array.isArray(material)?material[0]:material] as import('three').Material[];
    mesh.geometry.clearGroups();mesh.geometry.addGroup(0,mesh.geometry.index!.count,1);
   }
   const supported=host.capture('opening',[],null).image,supportedFeedback=host.read().characterContinuity;
   const target=meshes[0]!,clone=target.matrix.clone,auto=target.matrixAutoUpdate;
   target.matrixAutoUpdate=false;
   target.matrix.clone=()=>{throw new Error('diagnostic-only clone failure');};
   const degraded={ready:host.ready(),feedback:host.inspect().characterContinuity};
   target.matrix.clone=clone;target.matrixAutoUpdate=auto;
   for(const s of saved){s.mesh.material=s.material;s.mesh.geometry.groups=s.groups;}
   return {normalDiffersFromHidden:normal!==hidden,collapsedEqualsHidden:collapsed===hidden,groupedEqualsHidden:grouped===hidden,
    supportedEqualsNormal:supported===normal,matrixFeedback,groupFeedback,supportedFeedback,degraded,recovered:host.read().characterContinuity};
  });
  expect(result.normalDiffersFromHidden).toBe(true);
  expect(result.collapsedEqualsHidden).toBe(true);expect(result.matrixFeedback.issues).toContain('CHARACTER_VISUAL_HIDDEN');
  expect(result.groupedEqualsHidden).toBe(true);expect(result.groupFeedback.issues).toContain('CHARACTER_VISUAL_HIDDEN');
  expect(result.supportedEqualsNormal).toBe(true);expect(result.supportedFeedback.issues).toEqual([]);
  expect(result.degraded).toMatchObject({ready:true,feedback:{advisory:true,status:'unavailable',issues:['CHARACTER_DIAGNOSTICS_UNAVAILABLE']}});
  expect(result.recovered.issues).toEqual([]);
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},30000);

it('keeps the preset identity when the integrated SDK equips and removes rigid accessories',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'rider-attachments-')),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const example=await service.examples('custom-vehicle');
  for(const [name,content]of Object.entries(example.files)){
   const source=name==='main.ts'?content.replace('type EnvironmentDefinition','HumanoidCharacter,type EnvironmentDefinition').replace(
    'const world=await createHumanoidWorld({',
    "const character=new HumanoidCharacter();(window as any).__attachmentFixture={character,hat:new THREE.Mesh(new THREE.BoxGeometry(.3,.2,.3),new THREE.MeshBasicMaterial())};\nconst world=await createHumanoidWorld({character,"):content;
   await writeFile(path.join(root,name),source);
  }
  await service.inspect();const page=(service as unknown as {session:{page:Page}}).session.page;
  const result=await page.evaluate(async()=>{
   const host=window.__THREE_CREATOR_HOST__!,world=window.__WORLDKIT_EVAL__!;
   const fixture=(window as unknown as {__attachmentFixture:{character:import('@worldkit/three').HumanoidCharacter;hat:import('three').Mesh}}).__attachmentFixture;
   await host.stop();const before=host.read().characterContinuity;
   const detach=fixture.character.attach('head',fixture.hat),equipped=host.read().characterContinuity;
   await host.reset();const reset=host.read().characterContinuity,retained=fixture.hat.parent!==null;
   detach();const removed=host.read().characterContinuity;
   world.controlledObject.visible=false;const hidden=host.read().characterContinuity;world.controlledObject.visible=true;
   return {before,equipped,reset,retained,removed,hidden};
  });
  for(const state of [result.equipped,result.reset,result.removed]){
   expect(state.issues).toEqual([]);expect(state.evidence?.rootUuid).toBe(result.before.evidence?.rootUuid);
  }
  expect(result.retained).toBe(true);expect(result.hidden.issues).toContain('CHARACTER_VISUAL_HIDDEN');
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},30000);
