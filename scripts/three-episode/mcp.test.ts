import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { ThreeCompiler, hashTree, type Candidate } from '../three-creator/compiler.js';
import { canonicalHash, type EpisodePlan, type EpisodeSourceManifest } from './contracts.js';
import { EpisodePlannerTools, EPISODE_TOOLS } from './mcp.js';
import { saveEpisodeSource } from './source.js';
import { createHash } from 'node:crypto';

const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let root: string, candidate: Candidate, source: EpisodeSourceManifest, sourceManifest: string, portableManifest: string, serial = 0;
function plan(): EpisodePlan { return { kind:'worldkit-three-episode-plan',schemaVersion:1,worldBuildHash:source.worldBuildHash,
 segments:Array.from({length:6},(_,index)=>({id:`segment-0${index}`,start:{positionWorldMetersXYZ:[index*2,0,0],facingYawRadians:0},waypoints:[{positionWorldMetersXYZ:[index*2,0,-35],gait:'walk'}],endBehavior:'reverse',purpose:`Fixture route ${index}`})) }; }
const output = () => path.join(root, `outputs-${++serial}`);
beforeAll(async()=>{
 root=await realpath(await mkdtemp(path.join(os.tmpdir(),'three-episode-mcp-test-')));
 const workspace=path.join(root,'author');await mkdir(workspace);
 await writeFile(path.join(workspace,'index.html'),'<html><head></head><body><canvas id="world"></canvas><script type="module" src="./main.ts"></script></body></html>');
 await writeFile(path.join(workspace,'main.ts'),`import * as THREE from 'three';
import {createWorld} from '@worldkit/three';
const scene=new THREE.Scene();scene.background=new THREE.Color(0x193148);
const camera=new THREE.PerspectiveCamera(50,16/9,.1,300);camera.position.set(3,4,7);camera.lookAt(0,1,0);
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#world'),antialias:true});renderer.setSize(1280,720);
const world=await createWorld({scene,camera,renderer,navigation:false,assetDefinitions:{}});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80,20,20),new THREE.MeshBasicMaterial({color:0x8a704f}));ground.rotation.x=-Math.PI/2;
world.addEntity({id:'ground',object:ground,role:'terrain'});
const actor=new THREE.Group();const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(.3,1.2),new THREE.MeshBasicMaterial({color:0x26b6ea}));mesh.position.y=.9;actor.add(mesh);
world.addCharacter({id:'actor',object:actor,body:{heightMeters:1.8,radiusMeters:.35}});world.setControlledEntity('actor');world.setCameraFollow({targetEntityId:'actor'});await world.start();`);
 candidate=await new ThreeCompiler(workspace,'three-sdk').prepare();
 const imagePath=path.join(candidate.root,'fixture-opening.png'),imageBytes=await sharp({create:{width:1,height:1,channels:3,background:'#193148'}}).png().toBuffer();await writeFile(imagePath,imageBytes);
 source={kind:'three-episode-source',schemaVersion:1,worldId:'mcp-fixture',sourceHash:candidate.sourceHash,worldBuildHash:candidate.worldBuildHash,runtimeHash:candidate.runtimeHash,
  sourceWorldBuildHash:candidate.worldBuildHash,sourceRuntimeHash:candidate.runtimeHash,sourceDeliveryManifestSha256:'f'.repeat(64),sourceRoot:candidate.sourceRoot,playableRoot:candidate.playableRoot,
  sourceFiles:await hashTree(candidate.sourceRoot),playableFiles:await hashTree(candidate.playableRoot),opening:{path:imagePath,sha256:sha(imageBytes)},targets:[{id:'actor',name:'Actor',role:'primary-subject',entityId:'actor',whiteboxTriview:{path:imagePath,sha256:sha(imageBytes)}}]};
 sourceManifest=path.join(candidate.root,'source.json');await writeFile(sourceManifest,JSON.stringify(source));
 const portableOriginal=path.join(candidate.root,'portable-source.json');await saveEpisodeSource(portableOriginal,source);
 const relocated=path.join(root,'relocated-bundle');await cp(candidate.root,relocated,{recursive:true});portableManifest=path.join(relocated,'portable-source.json');
 expect(await readFile(portableManifest)).toEqual(await readFile(portableOriginal));
},60_000);
afterAll(async()=>{await rm(root,{recursive:true,force:true});});

describe('Three Episode planner MCP boundary',()=>{
 it('offers exactly three tools, accepts free coordinates without observation gates and paginates declared source',async()=>{
  expect(EPISODE_TOOLS.map(tool=>tool.name)).toEqual(['episode_observe','episode_probe','episode_submit_plan']);
  const outputRoot=output(),service=await EpisodePlannerTools.create({sourceManifest,outputRoot});
  try{
   const read=await service.execute('episode_observe',{sourceFile:'main.ts',offsetCharacters:7,maximumCharacters:120});
   const content=JSON.parse((read.content[0] as {text:string}).text);expect(content.content).toHaveLength(120);expect(content.nextOffsetCharacters).toBe(127);
   const rejected=await service.execute('episode_observe',{sourceFile:'../credentials.json'});expect(rejected.isError).toBe(true);
   const submitted=await service.execute('episode_submit_plan',{plan:plan()});expect(submitted.isError).not.toBe(true);
   const evidence=JSON.parse(await readFile(path.join(outputRoot,'planner-tool-evidence.json'),'utf8'));
   expect(evidence.planHash).toBe(canonicalHash(plan()));expect(evidence.sourceHash).toBe(source.sourceHash);expect(evidence.submissionCount).toBe(1);
   expect(evidence.calls.some((call:any)=>call.tool==='episode_probe')).toBe(false);expect(JSON.parse(await readFile(path.join(outputRoot,'plan.json'),'utf8'))).toEqual(plan());
  }finally{await service.close();}
 });
 it('permits only failed segments to change in a repair and preserves passing plan bytes',async()=>{
  const previousPlan=plan(),repairInput=path.join(candidate.root,'repair.json');await writeFile(repairInput,JSON.stringify({previousPlan,failedSegmentIds:['segment-03'],failures:[{segmentId:'segment-03',code:'route-stuck'}]}));
  const outputRoot=output(),service=await EpisodePlannerTools.create({sourceManifest,outputRoot,repairInput});
  try{
   const wrong=structuredClone(previousPlan);wrong.segments[0]!.purpose='changed passing segment';
   expect((await service.execute('episode_submit_plan',{plan:wrong})).isError).toBe(true);
   const repaired=structuredClone(previousPlan);repaired.segments[3]!.waypoints=[{positionWorldMetersXYZ:[20,0,-25],gait:'walk'}];
   expect((await service.execute('episode_submit_plan',{plan:repaired})).isError).not.toBe(true);
   const saved=JSON.parse(await readFile(path.join(outputRoot,'plan.json'),'utf8')) as EpisodePlan;
   for(const [index,segment] of previousPlan.segments.entries())if(index!==3)expect(canonicalHash(saved.segments[index])).toBe(canonicalHash(segment));
  }finally{await service.close();}
 });
 it('rejects escaped manifest roots, unlisted files and output symlinks before exposing file contents',async()=>{
  const outside=path.join(root,'outside');await mkdir(outside);await writeFile(path.join(outside,'private.txt'),'test-only secret marker');
  const altered=path.join(candidate.root,'bad-source.json');await writeFile(altered,JSON.stringify({...source,sourceRoot:outside,sourceFiles:{'private.txt':sha('test-only secret marker')}}));
  await expect(EpisodePlannerTools.create({sourceManifest:altered,outputRoot:output()})).rejects.toThrow('SOURCE_PATH_ESCAPE');
  const alias=path.join(root,'output-symlink');await symlink(outside,alias);await expect(EpisodePlannerTools.create({sourceManifest,outputRoot:alias})).rejects.toThrow('OUTPUT_SYMLINK');
  const service=await EpisodePlannerTools.create({sourceManifest,outputRoot:output()});
  try{
   await writeFile(path.join(candidate.sourceRoot,'not-listed.txt'),'unlisted marker');
   const result=await service.execute('episode_observe',{sourceFile:'not-listed.txt'});expect(result.isError).toBe(true);expect(JSON.stringify(result)).not.toContain('unlisted marker');
  }finally{await service.close();await rm(path.join(candidate.sourceRoot,'not-listed.txt'));}
 });
 it.each(['absolute','relocated-portable'])('uses actual stdio MCP and Chromium with %s source for observation, picking, native probing and submission',async mode=>{
  const selectedManifest=mode==='absolute'?sourceManifest:portableManifest;
  const outputRoot=output(),transport=new StdioClientTransport({command:process.execPath,
   args:['--import',path.join(repository,'node_modules/tsx/dist/loader.mjs'),path.join(repository,'scripts/three-episode/mcp.ts'),'--source-manifest',selectedManifest,'--source-root',path.dirname(selectedManifest),'--output-root',outputRoot],
   cwd:repository,stderr:'pipe',env:{PATH:process.env.PATH??'/usr/bin:/bin',HOME:root,WORLDKIT_CHROMIUM_EXECUTABLE:chromium.executablePath(),TSX_DISABLE_CACHE:'1'}});
  let stderr='';transport.stderr?.on('data',data=>{stderr+=String(data);});
  const client=new Client({name:'episode-fixture-client',version:'1'},{capabilities:{}});
  try{
   await client.connect(transport);expect((await client.listTools()).tools).toHaveLength(3);
   const observed=await client.callTool({name:'episode_observe',arguments:{view:'top-down'}});
   expect(observed.isError,stderr).not.toBe(true);
   const content=observed.content as {type:string;text?:string;data?:string}[];
   const facts=JSON.parse(content.find(block=>block.type==='text')!.text!),image=content.find(block=>block.type==='image')!;
   const metadata=await sharp(Buffer.from(image.data!,'base64')).metadata();expect([metadata.width,metadata.height]).toEqual([1280,720]);expect(facts.capabilities.controlledEntityId).toBe('actor');
   const picked=await client.callTool({name:'episode_probe',arguments:{kind:'view-point',viewId:facts.viewId,pixelUv:[.3,.5]}});expect(picked.isError).not.toBe(true);
   const point=JSON.parse((picked.content as {text:string}[])[0]!.text).result;expect(point.visualHit).not.toBeNull();expect(point.startProbe.isValid).toBe(true);
   const probe=await client.callTool({name:'episode_probe',arguments:{kind:'start',start:{positionWorldMetersXYZ:[4,0,4],facingYawRadians:0}}});expect(probe.isError).not.toBe(true);expect(JSON.parse((probe.content as {text:string}[])[0]!.text).result.isValid).toBe(true);
   expect((await client.callTool({name:'episode_submit_plan',arguments:{plan:plan()}})).isError).not.toBe(true);
   const evidence=JSON.parse(await readFile(path.join(outputRoot,'planner-tool-evidence.json'),'utf8'));
   expect(evidence.calls).toHaveLength(4);expect(evidence.planHash).toBe(canonicalHash(plan()));expect(evidence.sourceManifestSha256).toBe(sha(await readFile(selectedManifest)));
   const actualBytes=await readFile(path.join(outputRoot,evidence.calls[0].image.path));expect(sha(actualBytes)).toBe(evidence.calls[0].image.sha256);
  }finally{await client.close();await transport.close();}
 },60_000);
});
