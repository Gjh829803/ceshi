import {expect,it} from 'vitest';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import type {Page} from 'playwright';
import {ThreeCreatorTools} from '../../src/tools/tools.js';
import {executeThreeCreatorTool,toolContent} from '../../src/cli/mcp.js';

const source=`import * as T from 'three';
const scene=new T.Scene();scene.background=new T.Color('#dddddd');scene.fog=new T.Fog('#dddddd',20,100);
const camera=new T.PerspectiveCamera(50,4/3,.1,100);camera.position.set(0,2,8);camera.lookAt(0,0,0);
const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(800,600);document.body.append(renderer.domElement);
const player=new T.Group();scene.add(player);const gate=new T.Group();gate.name='gate';scene.add(gate);
for(const [name,color,x] of [['pillar',0xffffff,0],['arch',0x999999,.4]]){const mesh=new T.Mesh(new T.PlaneGeometry(3,3),new T.MeshBasicMaterial({color,side:T.DoubleSide}));mesh.name=name;mesh.position.x=x;gate.add(mesh);}
let ticks=0,startCalls=0,stopCalls=0,resetCalls=0;
const render=()=>renderer.render(scene,camera);
window.__WORLDKIT_EVAL__={ready:true,scene,camera,renderer,controlledObject:player,targets:{player,gate},startLive(){startCalls++},stopLive(){stopCalls++},reset(){resetCalls++;render()}};
window.overlapFixture={scene,camera,renderer,gate,stats:()=>({ticks,startCalls,stopCalls,resetCalls})};render();`;

it('returns bounded advisory findings and real diagnostic pixels while restoring renderer, scene and lifecycle',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'surface-overlap-')),service=new ThreeCreatorTools(root,'three-raw');
 try{
  await writeFile(path.join(root,'index.html'),'<html><body><script type="module" src="./main.js"></script></body></html>');
  await writeFile(path.join(root,'main.js'),source);
  const ordinary=await service.inspect({sections:['snapshot']});expect(ordinary.observation).not.toHaveProperty('surfaceOverlaps');
  const page=(service as unknown as {session:{page:Page}}).session.page;
  await page.evaluate(()=>{
   const f=(window as any).overlapFixture,r=f.renderer;
   r.setPixelRatio(1.5);r.setSize(640,480,false);r.setViewport(7,8,600,400);r.setScissor(9,10,580,380);r.setScissorTest(true);r.autoClear=false;r.xr.enabled=true;r.shadowMap.enabled=true;
   f.state=()=>({stats:f.stats(),camera:f.camera.matrixWorld.toArray(),projection:f.camera.projectionMatrix.toArray(),children:f.scene.children.map((o:any)=>o.uuid),
    background:f.scene.background.getHex(),fog:[f.scene.fog.near,f.scene.fog.far],pixelRatio:r.getPixelRatio(),size:[r.domElement.width,r.domElement.height],
    viewport:r.getViewport({copy(v:any){return [v.x,v.y,v.z,v.w]}}),scissor:r.getScissor({copy(v:any){return [v.x,v.y,v.z,v.w]}}),scissorTest:r.getScissorTest(),autoClear:r.autoClear,xr:r.xr.enabled,shadows:r.shadowMap.enabled});
   f.before=f.state();
  });
  const pending=await executeThreeCreatorTool(service,'world_inspect',{sections:['surface-overlaps'],entityIds:['gate'],surfaceOverlaps:{highlight:true}}) as {operationId:string};
  const operation=await service.getOperation(pending.operationId,25);expect(operation.status).toBe('succeeded');
  const result=operation.result as Awaited<ReturnType<ThreeCreatorTools['inspect']>>;
  expect(result.observation.surfaceOverlaps).toMatchObject({advisory:true,status:'complete'});
  expect(result.observation.surfaceOverlaps.findings.length).toBeGreaterThan(0);
  expect(result.observation.surfaceOverlapHighlight).toMatchObject({diagnostic:true,status:'captured',view:'surface-overlap'});
  expect(result.observation.surfaceOverlapHighlight).not.toHaveProperty('imageDataUrl');
  expect(result.image).toBeDefined();expect((await toolContent(service,result)).map(c=>c.type)).toEqual(['text','image']);
  const artifact=JSON.parse(await readFile(path.join(path.dirname(result.image!.path),'inspection.json'),'utf8'));
  expect(artifact).toMatchObject({sourceHash:result.sourceHash,runtimeHash:result.runtimeHash,runtimeSourceHash:result.runtimeSourceHash,
   worldBuildHash:result.worldBuildHash,sample:result.observation.sample,image:result.image});
  const pixels=await sharp(await readFile(result.image!.path)).removeAlpha().raw().toBuffer({resolveWithObject:true});
  expect([pixels.info.width,pixels.info.height]).toEqual([800,600]);
  let magenta=0;for(let i=0;i<pixels.data.length;i+=3)if(pixels.data[i]!>180&&pixels.data[i+1]!<150&&pixels.data[i+2]!>80)magenta++;
  expect(magenta).toBeGreaterThan(100);
  expect(await page.evaluate(()=>{const f=(window as any).overlapFixture;return JSON.stringify(f.before)===JSON.stringify(f.state());})).toBe(true);
  await page.evaluate(()=>{const f=(window as any).overlapFixture,r=f.renderer;f.render=r.render;r.render=function(scene:any,camera:any){if(camera.isOrthographicCamera)throw new Error('DIAGNOSTIC_RENDER_FAILED');return f.render.call(this,scene,camera);};});
  const failed=await service.inspect({sections:['surface-overlaps'],surfaceOverlaps:{highlight:true}});
  expect(failed.observation.surfaceOverlaps.findings.length).toBeGreaterThan(0);
  expect(failed.observation.surfaceOverlapHighlight).toMatchObject({status:'unavailable',reason:'capture-failed'});
  expect(failed.image).toBeUndefined();
  expect(await page.evaluate(()=>{const f=(window as any).overlapFixture;return JSON.stringify(f.before)===JSON.stringify(f.state());})).toBe(true);
  await expect(executeThreeCreatorTool(service,'world_inspect',{sections:['surface-overlaps'],surfaceOverlaps:{maxTriangles:30001}})).rejects.toThrow();
  const partial=await service.inspect({sections:['surface-overlaps'],surfaceOverlaps:{maxTriangles:1}});
  expect(partial.observation.surfaceOverlaps).toMatchObject({status:'partial',advisory:true});
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},30000);
