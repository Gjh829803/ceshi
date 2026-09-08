import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {expect,it} from 'vitest';
import type {Page} from 'playwright';
import {ThreeCreatorTools} from './tools';
import {executeThreeCreatorTool} from './mcp';
import {createAssetPolicySnapshot,assetPolicyHash} from './asset-policy.mjs';
import catalog from '../../assets/three-creator/asset-catalog.json';

it('runs a custom vehicle with only the preset human asset and exposes hidden-rider evidence',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'custom-vehicle-'));
 const service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const example:any=await executeThreeCreatorTool(service,'creator_get_examples',{topic:'custom-vehicle'});
  expect(JSON.parse(example.files['project.json']).assetIds).toEqual(['humanoid.source-101']);
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
   const enter=await observer.execute!({type:'training.enter',instanceId:'custom-bike'});
   const mounted=host.read().characterContinuity;
   observer.player.visible=false;
   const hidden=host.read().characterContinuity;
   observer.player.visible=true;
   const endTick=observer.snapshot!().simulationTick;
   const children=[...observer.player.children];
   const replacements=children.map(child=>child.clone());
   observer.player.remove(...children);observer.player.add(...replacements);
   await host.start();const restarted=host.read().characterContinuity;
   observer.player.remove(...replacements);observer.player.add(...children);
   return {tick,endTick,start,enter,mounted,hidden,restarted};
  });
  expect(result.enter.status,JSON.stringify(result.enter)).toBe('applied');
  await page.waitForFunction(()=>window.__WORLDKIT_EVAL__?.snapshot?.().training?.transition.remainingSeconds===0);
  const after=await page.evaluate(async()=>{
   const observer=window.__WORLDKIT_EVAL__!,host=window.__THREE_CREATOR_HOST__!;
   await host.stop();
   const exit=await observer.execute!({type:'training.exit'});
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
 const snapshot=createAssetPolicySnapshot({schemaVersion:1,allowedAssetIds:['humanoid.source-101'],defaultHumanoidAssetId:'humanoid.source-101',allowCustomAssets:false},catalog.assets);
 const file=path.join(root,'policy.json');await writeFile(file,JSON.stringify(snapshot));
 await mkdir(path.join(root,'author'));
 const service=new ThreeCreatorTools(path.join(root,'author'),'three-sdk',{assetPolicySnapshotPath:file,assetPolicySha256:assetPolicyHash(snapshot)});
 try{
  const example=await service.examples('custom-vehicle');
  for(const [name,content]of Object.entries(example.files))await writeFile(path.join(service.workspace,name),content);
  const candidate=await service.compiler.prepare();
  expect(candidate.profile).toBe('three-sdk');
  const schema=await service.schema();expect(schema.humanAuthoring.exampleTopic).toBe('custom-vehicle');
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
});
