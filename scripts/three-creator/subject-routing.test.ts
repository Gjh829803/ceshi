import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {afterEach,expect,it} from 'vitest';
import {ThreeCreatorTools} from './tools';
import {executeThreeCreatorTool} from './mcp';
import {openEpisodeBrowser} from '../three-episode/browser';
import type {Page} from 'playwright';

const services:ThreeCreatorTools[]=[],roots:string[]=[];
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'subject-routing-'));roots.push(root);
 const service=new ThreeCreatorTools(root,'three-sdk');services.push(service);return service;
}
afterEach(async()=>{for(const s of services.splice(0))await s.close();for(const r of roots.splice(0))await rm(r,{recursive:true,force:true});});
const call=(service:ThreeCreatorTools,name:string,args:Record<string,unknown>={})=>executeThreeCreatorTool(service,name,args) as Promise<any>;

it('switches the standalone subject through native keys, restores full object views and inherits the default in Episode',async()=>{
 const service=await fixture(),example=await service.examples('nonhuman-subject');
 for(const [name,content]of Object.entries(example.files))await writeFile(path.join(service.workspace,name),name==='main.ts'?
  // This test checks exact reset pixels, not multisample edge coverage. Software
  // WebGL on CI can resolve a wall edge differently by one sample after resize.
  // Use a single-sample fixture and retain the strict image equality assertions.
  content.replace('createWorld({scene,camera,canvas})','createWorld({scene,camera,renderer:new THREE.WebGLRenderer({canvas,antialias:false})})')
   .replace("defaultPerspective:'third-person'","defaultPerspective:'first-person'")+"\n(window as any).__subjectTestWorld=world;":content);
 const initial=await service.inspect();expect(initial.observation.snapshot.camera.perspective).toBe('first-person');
 const page=(service as unknown as {session:{page:Page}}).session.page;
 await page.keyboard.down('t');await page.waitForFunction(()=>window.__WORLDKIT_EVAL__!.snapshot!().camera.perspective==='third-person');
 await page.keyboard.down('t');expect(await page.evaluate(()=>window.__WORLDKIT_EVAL__!.snapshot!().camera.perspective)).toBe('third-person');await page.keyboard.up('t');
 await page.keyboard.press('t');await page.waitForFunction(()=>window.__WORLDKIT_EVAL__!.snapshot!().camera.perspective==='first-person');
 await page.evaluate(()=>{const input=document.createElement('input');input.id='view-focus';document.body.append(input);input.focus();});
 await page.keyboard.press('t');expect(await page.evaluate(()=>window.__WORLDKIT_EVAL__!.snapshot!().camera.perspective)).toBe('first-person');
 await page.evaluate(()=>document.getElementById('view-focus')!.remove());
 const captured=await page.evaluate(async()=>{
  const host=window.__THREE_CREATOR_HOST__!,observer=window.__WORLDKIT_EVAL__!,world=(window as unknown as {__subjectTestWorld:import('@worldkit/three').ThreeWorld}).__subjectTestWorld;
  await host.stop();host.capture('opening',[],null);const before=observer.snapshot!();
  let primaryHidden=false,objectShown=false;
  observer.withPresentation!(()=>{primaryHidden=!observer.player.children.some(o=>(o as import('three').Mesh).isMesh&&o.layers.test(observer.camera.layers));});
  observer.withPresentation!(()=>{objectShown=observer.player.children.some(o=>(o as import('three').Mesh).isMesh&&o.layers.test(observer.camera.layers));},{view:'object'});
  const first=host.capture('entity-triview',['player'],null).image,after=observer.snapshot!();
  world.setCameraPerspective('third-person');const third=host.capture('entity-triview',['player'],null).image;
  await host.reset();
  const masks=observer.player.children.map(o=>o.layers.mask);
  try{observer.withPresentation!(()=>{throw new Error('view failure fixture');});}catch{}
  const restoredOnFailure=observer.player.children.every((o,i)=>o.layers.mask===masks[i]);
  return {before,after,primaryHidden,objectShown,restoredOnFailure,sameObjectViews:first===third,reset:observer.snapshot!()};
 });
 expect(captured.primaryHidden).toBe(true);expect(captured.objectShown).toBe(true);expect(captured.sameObjectViews).toBe(true);
 expect(captured.after).toEqual(captured.before);expect(captured.reset.camera.perspective).toBe('first-person');expect(captured.restoredOnFailure).toBe(true);
 const candidate=await service.compiler.prepare(),episode=await openEpisodeBrowser({playableRoot:candidate.playableRoot});
 try{
  const start={positionWorldMetersXYZ:[0,.03,0] as const,facingYawRadians:0},viewport={widthPixels:640,heightPixels:360};
  expect((await episode.prepareSegment(start,viewport)).camera.perspective).toBe('first-person');
  const first=await episode.frame('image/png');expect(await episode.frame('image/png')).toEqual(first);
  expect((await episode.advance({cameraTogglePressed:true},5)).camera.perspective).toBe('third-person');
  await episode.release();expect((await episode.prepareSegment({...start,cameraPerspective:'third-person'},viewport)).camera.perspective).toBe('third-person');
  await episode.release();await episode.prepareSegment(start,viewport);expect((await episode.frame('image/png')).imageDataUrl).toBe(first.imageDataUrl);
  expect(episode.errors).toEqual([]);
 }finally{await episode.close();}
},30000);

it('offers subject-specific existing entry points without adding project fields or extra tool steps',async()=>{
 const service=await fixture(),environment=await call(service,'creator_describe_environment');
 expect(environment.subjectAuthoring.routes.map((r:any)=>r.id)).toEqual(['humanoid','mounted','nonhuman']);
 const starter=await call(service,'creator_get_authoring_schema');
 expect(starter.entryPoint.name).toBe('createWorld');
 const animal=await call(service,'creator_get_authoring_schema',{topic:'nonhuman-subject',sections:['guide','contracts','project']});
 expect(animal.entryPoint.name).toBe('createWorld');expect(animal.exampleTopic).toBe('nonhuman-subject');
 expect(animal.sdkContracts).toContain('setControlledEntity(');
 expect(animal.sdkContracts).toContain('registerMovement');
 expect(animal.sdkContracts).toContain('eyeOffsetLocalMetersXYZ');expect(animal.sdkContracts).toContain('setCameraPerspective');
 expect(animal.sdkGuide).toContain('keyboardToggleEnabled');
 expect(animal.humanAuthoring).toBeUndefined();expect(animal.characterCapabilities).toBeUndefined();
 expect(animal.project.required).not.toContain('subjectType');
 const human=await call(service,'creator_get_authoring_schema',{topic:'character-actions'});
 expect(human.entryPoint.name).toBe('createHumanoidWorld');
 const mounted=await call(service,'creator_get_authoring_schema',{topic:'mounted-interaction'});
 expect(mounted.entryPoint.name).toBe('createHumanoidWorld');
});

it('uses current workspace contracts for the nonhuman route and retains raw guidance boundaries',async()=>{
 const service=await fixture();await service.materializeRuntime();
 const file=path.join(service.workspace,'sdk/three-world/src/contracts.ts');
 await writeFile(file,(await readFile(file,'utf8')).replace('readonly jumpSpeedMetersPerSecond?:number;','readonly jumpSpeedMetersPerSecond?:number; readonly subjectProbe?:boolean;'));
 const schema=await call(service,'creator_get_authoring_schema',{topic:'nonhuman-subject',sections:['contracts']});
 expect(schema.sdkContracts).toContain('subjectProbe');
 expect(schema.runtimeGuidance.kind).toBe('workspace-sdk-source');
 expect(schema.runtimeDefinitions['training/humanoid/action-schema.ts']).toBeUndefined();
 const rawRoot=await mkdtemp(path.join(os.tmpdir(),'raw-subject-'));roots.push(rawRoot);
 const raw=new ThreeCreatorTools(rawRoot,'three-raw');services.push(raw);
 const env=await call(raw,'creator_describe_environment');expect(env.subjectAuthoring.routes).toEqual([]);
});

it('runs a nonhuman subject with no humanoid assets, collides, resets and captures through Episode',async()=>{
 const service=await fixture(),example=await call(service,'creator_get_examples',{topic:'nonhuman-subject'});
 expect(JSON.parse(example.files['project.json']).assetIds).toEqual([]);
 for(const [name,value]of Object.entries(example.files))await writeFile(path.join(service.workspace,name),String(value));
 const candidate=await service.compiler.prepare();
 const definitions=JSON.parse(await readFile(path.join(candidate.playableRoot,'asset-definitions.json'),'utf8'));
 expect(definitions.assets).toEqual([]);
 const inspected=await service.inspect();
 expect(inspected.observation.snapshot.controlledEntityId).toBe('fox');
 expect(inspected.observation.snapshot.training).toBeUndefined();
 expect(inspected.observation.snapshot.entities.filter((e:any)=>e.role==='actor').map((e:any)=>e.id)).toEqual(['fox']);
 expect(inspected.feedback.characterContinuity).toMatchObject({status:'not-applicable',issues:[]});
 expect(inspected.pageErrors).toEqual([]);expect(inspected.blockedNetworkRequests).toEqual([]);
 const episode=await openEpisodeBrowser({playableRoot:candidate.playableRoot});
 try{
  const start={positionWorldMetersXYZ:[0,.03,0] as const,facingYawRadians:0};
  await episode.prepareSegment(start,{widthPixels:640,heightPixels:360});
  const first=await episode.frame('image/png'),again=await episode.frame('image/png');expect(again).toEqual(first);
  const moved=await episode.advance({moveZRatio:-1},180),fox=moved.entities.find(e=>e.id==='fox')!;
  expect(fox.positionWorldMetersXYZ[2]).toBeLessThan(-1);
  expect(fox.positionWorldMetersXYZ[2]).toBeGreaterThan(-4);
  expect(moved.training).toBeUndefined();
  await episode.release();await episode.prepareSegment(start,{widthPixels:640,heightPixels:360});
  expect((await episode.frame('image/png')).imageDataUrl).toBe(first.imageDataUrl);
  expect(episode.errors).toEqual([]);
 }finally{await episode.close();}
},30000);
