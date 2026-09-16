import * as THREE from 'three';
import {afterEach,expect,it,vi} from 'vitest';
import {createWorld,type ThreeWorld} from '@worldkit/three';
import type {WorldObservation} from '@worldkit/three';
import type {Page} from 'playwright';
import {inspectViewport} from '../../src/browser/viewport-diagnostics.js';
import {captureSurfaceOverlap} from '../../src/browser/surface-overlap-highlight.js';
import {checkViewport} from '../../src/tools/viewport-check.js';

const worlds:ThreeWorld[]=[];
afterEach(()=>{for(const world of worlds.splice(0))world.dispose();vi.unstubAllGlobals();vi.restoreAllMocks();});

async function fixture(){
 // Only the rendering/browser boundary is stubbed; registry, physics, observer,
 // description queries and snapshots are the actual SDK implementation.
 const renderer={domElement:{width:800,height:600},shadowMap:{enabled:false,type:THREE.PCFShadowMap,needsUpdate:false},render(){},info:{memory:{geometries:0,textures:0},render:{calls:0}}} as unknown as THREE.WebGLRenderer;
 const world=await createWorld({scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),renderer,navigation:false});worlds.push(world);
 for(const id of ['hero','npc']){const object=new THREE.Group();object.position.set(id==='hero'?0:4,1,0);world.addCharacter({id,object,body:{heightMeters:1.8,radiusMeters:.3}});}
 world.setControlledEntity('hero');
 for(const id of ['hero','npc'])world.defineParameter({id:`${id}.visible`,description:`${id} visibility`,schema:{type:'boolean'},initialValue:true,writes:[{kind:'entity',entityId:id,channels:['visibility']}],plan:value=>[{type:'entity.set-visible',entityId:id,isVisible:value}]});
 vi.stubGlobal('window',new EventTarget());vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
 await world.start();world.stop();
 const observer=window.__WORLDKIT_EVAL__!;
 vi.resetModules();await import('../../src/browser/bridge.js');
 const host=window.__THREE_CREATOR_HOST__!;
 return {world,observer,host};
}

it('publishes SDK observer entity filters to remove unrelated entities and parameter contracts',async()=>{
 const {observer}=await fixture();
 const description=observer.capabilities!({entityIds:['npc']});
 expect(description.entities.map(entity=>entity.state.id)).toEqual(['npc']);
 expect(description.parameters.map(parameter=>parameter.id)).toEqual(['npc.visible']);
});

it('reads a snapshot without hierarchy traversal or optional diagnostics and leaves runtime state unchanged',async()=>{
 const {world,observer,host}=await fixture(),before=world.snapshot();
 observer.inspect=()=>{throw new Error('Optional diagnostics must not run');};
 vi.spyOn(observer.scene,'traverse').mockImplementation(()=>{throw new Error('Hierarchy must not be traversed');});
 const result=host.inspect({sections:['snapshot']});
 expect(result.snapshot).toEqual(before);
 expect(result.sample).toMatchObject({worldRevision:before.worldRevision,simulationTick:0,simulationSeconds:0,isRunning:false});
 expect(result.characterContinuity).toMatchObject({status:'not-applicable'});
 expect(result).not.toHaveProperty('objects');expect(result).not.toHaveProperty('diagnostics');expect(result).not.toHaveProperty('description');
 expect(world.snapshot()).toEqual(before);
});

it('passes the complete selection to the SDK and returns its description unchanged',async()=>{
 const {observer,host}=await fixture();
 const query={entityIds:['npc'],query:'npc'};
 const expected=observer.capabilities!(query),capabilities=vi.spyOn(observer,'capabilities');
 const result=host.inspect({...query,sections:['description']});
 expect(capabilities).toHaveBeenCalledWith(query);
 expect(result.description).toEqual(expected);
 expect(result).not.toHaveProperty('snapshot');expect(result).not.toHaveProperty('diagnostics');expect(result).not.toHaveProperty('objects');
});

it('uses the SDK empty-selection and text-search semantics without Host reinterpretation',async()=>{
 const {observer,host}=await fixture();
 for(const query of [{entityIds:[]},{entityIds:['npc'],query:'actor.move-to'}]){
  const expected=observer.capabilities!(query);
  expect(expected.entities).toEqual([]);
  expect(host.inspect({...query,sections:['description']}).description).toEqual(expected);
 }
});

it('returns the full inspection when sections are omitted',async()=>{
 const {host}=await fixture(),result=host.inspect();
 expect(result.description!.entities.map(entity=>entity.state.id)).toEqual(['hero','npc']);
 for(const key of ['controlledObject','camera','targets','snapshot','characterContinuity','description','commandsSupported','diagnostics','objects','renderer'])expect(result).toHaveProperty(key);
 expect((result.diagnostics as {snapshot:unknown}).snapshot).toEqual(result.snapshot);
});

it('reports unavailable raw telemetry as null',async()=>{
 const {observer,host}=await fixture();
 const {snapshot:_snapshot,inspect:_inspect,capabilities:_capabilities,...required}=observer;
 const raw:WorldObservation=required;
 window.__WORLDKIT_EVAL__=raw;
 const result=host.inspect({sections:['snapshot','description','diagnostics']});
 expect(result.sample).toEqual({worldRevision:null,simulationTick:null,simulationSeconds:null,isRunning:null});
 expect(result.snapshot).toBeNull();expect(result.description).toBeNull();expect(result.diagnostics).toBeNull();
 expect(result.characterContinuity).toMatchObject({status:'unavailable'});
});

it('keeps vehicle diagnostics opt-in and degrades a missing or throwing sampler locally',async()=>{
 const {observer,host,world}=await fixture(),before=world.snapshot();
 const inspectVehicles=vi.fn(()=>({worldRevision:0,simulationTick:0,simulationSeconds:0,isRunning:false,physicsStepSequence:null,vehicles:[]}));
 observer.inspectVehicles=inspectVehicles;
 expect(host.inspect()).not.toHaveProperty('vehicles');expect(inspectVehicles).not.toHaveBeenCalled();
 expect(host.inspect({sections:['vehicles'],entityIds:[],vehicleDetail:'wheels'}).vehicles).toMatchObject({vehicles:[]});
 expect(inspectVehicles).toHaveBeenCalledWith({entityIds:[],detail:'wheels'});
 observer.inspectVehicles=()=>{throw new Error('older runtime');};
 expect(host.inspect({sections:['vehicles']}).vehicles).toBeNull();
 delete observer.inspectVehicles;
 expect(host.inspect({sections:['vehicles']}).vehicles).toBeNull();
 expect(world.snapshot()).toEqual(before);
});

it('forwards committed camera inspection only on demand and preserves recording summaries',async()=>{
 const {world,observer,host}=await fixture(),before=world.snapshot();
 expect(observer.inspectCamera).toBeTypeOf('function');
 const inspect=vi.spyOn(observer,'inspectCamera');
 host.inspect({sections:['snapshot']});host.read();expect(inspect).not.toHaveBeenCalled();
 expect(host.inspect({sections:['camera']}).camera).toEqual(world.inspectCamera());
 expect(host.read().camera).toEqual(before.camera);
 expect(world.snapshot()).toEqual(before);
});

it('keeps camera failures local with an explicit reason',async()=>{
 const {observer,host}=await fixture();
 observer.inspectCamera=()=>{throw new Error('camera unavailable');};
 expect(host.inspect({sections:['camera']})).toMatchObject({camera:null,cameraAvailability:{status:'unavailable',reason:'inspection-failed'}});
 delete observer.inspectCamera;
 expect(host.inspect({sections:['camera']})).toMatchObject({camera:null,cameraAvailability:{status:'unavailable',reason:'observer-method-missing'}});
});

it('inspects coplanar surfaces only on demand and resolves entities outside capture targets',async()=>{
 const {world,observer,host}=await fixture();
 const group=new THREE.Group();group.name='arch';
 for(const color of [0xffffff,0x999999])group.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color})));
 world.addEntity({id:'stone-gate',name:'Stone gate',object:group,role:'decoration'});
 const before=world.snapshot(),matrix=group.matrix.clone(),children=[...group.children];
 expect(host.inspect({sections:['snapshot']})).not.toHaveProperty('surfaceOverlaps');
 expect(observer.targets['stone-gate']).toBeUndefined();
 const result=host.inspect({sections:['surface-overlaps'],entityIds:['stone-gate']});
 expect(result.surfaceOverlaps).toMatchObject({advisory:true,status:'complete'});
 expect(result.surfaceOverlaps?.findings).toEqual(expect.arrayContaining([expect.objectContaining({objects:[expect.objectContaining({entityId:'stone-gate'}),expect.objectContaining({entityId:'stone-gate'})]})]));
 expect(host.inspect({sections:['surface-overlaps'],entityIds:[]}).surfaceOverlaps?.findings).toEqual([]);
 expect(host.inspect({sections:['surface-overlaps'],query:'does not exist'}).surfaceOverlaps?.findings).toEqual([]);
 expect(world.snapshot()).toEqual(before);expect(group.matrix).toEqual(matrix);expect(group.children).toEqual(children);
});

it('keeps unsupported geometry selection and failed highlights local to advisory inspection',async()=>{
 const {world,observer,host}=await fixture(),before=world.snapshot();
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial());
 mesh.add(new THREE.Mesh(mesh.geometry,mesh.material));observer.scene.add(mesh);
 const {capabilities:_capabilities,getEntityGeometry:_getEntityGeometry,...rest}=observer;
 const raw={...rest,targets:{hero:observer.controlledObject}};
 window.__WORLDKIT_EVAL__=raw;
 const filtered=host.inspect({sections:['surface-overlaps'],query:'unknown'});
 expect(filtered.surfaceOverlaps).toMatchObject({advisory:true,status:'unavailable',reason:'selection-unavailable'});
 const highlighted=host.inspect({sections:['surface-overlaps','snapshot'],surfaceOverlaps:{highlight:true}});
 expect(highlighted.surfaceOverlaps?.findings.length).toBeGreaterThan(0);
 expect(highlighted.surfaceOverlapHighlight).toMatchObject({status:'unavailable'});
 expect(highlighted.snapshot).toEqual(before);expect(world.snapshot()).toEqual(before);
});

function viewportFixture(width = 480, height = 270, devicePixelRatio = 1, objectFit = 'fill') {
 const bounds = {width:1920,height:1080};
 const win = {innerWidth:1920,innerHeight:1080,devicePixelRatio,getComputedStyle:()=>({objectFit})};
 const canvas = {width,height,isConnected:true,ownerDocument:{defaultView:win},getBoundingClientRect:()=>bounds,parentElement:{getBoundingClientRect:()=>bounds}};
 const renderer = {domElement:canvas} as unknown as THREE.WebGLRenderer;
 const camera = new THREE.PerspectiveCamera(50,16/9);
 return {renderer,camera,canvas,bounds,win};
}

it('reports the 480-pixel case as advisory undersampling and keeps native density separate',()=>{
 const {renderer,camera}=viewportFixture();
 expect(inspectViewport(renderer,camera)).toMatchObject({advisory:true,status:'measured',evidence:{
  drawingBufferPixels:{width:480,height:270},canvasBoundsCssPixels:{width:1920,height:1080},pixelsPerCssPixel:{x:.25,y:.25},
 },warnings:[{code:'CANVAS_UNDERSAMPLED'}]});
 const retina=viewportFixture(1920,1080,2);
 expect(inspectViewport(retina.renderer,retina.camera)).toMatchObject({evidence:{nativeResolutionRatio:{x:.5,y:.5}},warnings:[]});
});

it('respects contain letterboxing, fixed embedded sizes and pixel rounding',()=>{
 const fit=viewportFixture(480,480,1,'contain');fit.bounds.width=480;fit.bounds.height=1080;fit.camera.aspect=1;
 expect(inspectViewport(fit.renderer,fit.camera)).toMatchObject({evidence:{displayedImageCssPixels:{width:480,height:480}},warnings:[]});
 const fixed=viewportFixture(320,240);fixed.bounds.width=320;fixed.bounds.height=240;fixed.camera.aspect=4/3;
 expect(inspectViewport(fixed.renderer,fixed.camera).warnings).toEqual([]);
 fixed.bounds.width=320.2;fixed.bounds.height=240.2;
 expect(inspectViewport(fixed.renderer,fixed.camera).warnings).toEqual([]);
});

it('reports stale camera aspect and treats a zero-sized viewport as unmeasured',()=>{
 const f=viewportFixture(1920,1080);f.camera.aspect=1;
 expect(inspectViewport(f.renderer,f.camera).warnings).toEqual([{code:'CAMERA_ASPECT_MISMATCH',message:expect.any(String)}]);
 f.bounds.width=0;
 expect(inspectViewport(f.renderer,f.camera)).toMatchObject({status:'unavailable',reason:'CANVAS_SIZE_UNAVAILABLE',evidence:null,warnings:[]});
});

it('isolates unavailable canvas measurements and leaves a viewport-only inspection read-only',async()=>{
 const {observer,host,world}=await fixture(),before=world.snapshot();
 const f=viewportFixture();Object.assign(observer.renderer,{domElement:f.canvas});
 const render=vi.spyOn(observer.renderer,'render');
 const matrix=observer.camera.projectionMatrix.toArray();
 vi.spyOn(observer.scene,'traverse').mockImplementation(()=>{throw new Error('no hierarchy traversal');});
 expect(host.inspect({sections:['viewport']}).viewport).toMatchObject({status:'measured',advisory:true});
 expect(world.snapshot()).toEqual(before);expect(observer.camera.projectionMatrix.toArray()).toEqual(matrix);expect(render).not.toHaveBeenCalled();
 f.canvas.getBoundingClientRect=()=>{throw new Error('detached or unavailable DOM');};
 expect(host.inspect({sections:['snapshot','viewport']})).toMatchObject({snapshot:before,viewport:{status:'unavailable',evidence:null,warnings:[]}});
});

it('restores the original viewport even when resize or diagnostic reads fail',async()=>{
 const setViewportSize=vi.fn().mockRejectedValueOnce(new Error('resize interrupted')).mockResolvedValue(undefined);
 const page={viewportSize:()=>({width:960,height:540}),setViewportSize,waitForTimeout:vi.fn().mockResolvedValue(undefined)} as unknown as Page;
 const result=await checkViewport(page,{width:1280,height:800},async()=>{throw new Error('bridge disconnected');});
 expect(setViewportSize.mock.calls).toEqual([[{width:1280,height:800}],[{width:960,height:540}]]);
 expect(result).toMatchObject({advisory:true,resizeStatus:'unavailable',restorationStatus:'unavailable',before:{status:'unavailable'},resized:{status:'unavailable'},restored:{status:'unavailable'}});
});


it.each(['kinematic','rotation','scale'] as const)('excludes known %s geometry without changing capture selection',async kind=>{
 const {world,observer,host}=await fixture();
 const object=new THREE.Group();
 for(let i=0;i<2;i++)object.add(new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial()));
 if(kind==='kinematic')world.addEntity({id:'moving',object,role:'obstacle',physics:{kind:'kinematic'}});
 else{
  world.addEntity({id:'moving',object,role:'decoration'});
  world.defineParameter({id:'transform',description:'Transform owner',schema:{type:'number'},initialValue:0,
   writes:[{kind:'entity',entityId:'moving',channels:[kind]}],plan:()=>[]});
 }
 expect(observer.getEntityGeometry!('moving')).toEqual({object,physicsKind:kind==='kinematic'?'kinematic':'none'});
 expect(observer.targets.moving).toBeUndefined();
 const before=world.snapshot();
 const result=host.inspect({sections:['surface-overlaps'],entityIds:['moving']}).surfaceOverlaps!;
 expect(result.findings).toEqual([]);
 expect(world.snapshot()).toEqual(before);
});

it('contains highlight and framebuffer failures inside a running SDK presentation transaction',async()=>{
 const {world,observer,host}=await fixture(),r=observer.renderer;
 const object=new THREE.Group();
 for(let i=0;i<2;i++)object.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial()));
 world.addEntity({id:'gate',object,role:'decoration'});
 Object.assign(r,{getRenderTarget:()=>null,getSize:(v:THREE.Vector2)=>v.set(800,600),getPixelRatio:()=>1,
  getViewport:(v:THREE.Vector4)=>v.set(0,0,800,600),getScissor:(v:THREE.Vector4)=>v.set(0,0,800,600),getScissorTest:()=>false,
  getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,xr:{enabled:false},setRenderTarget(){},setPixelRatio(){},setSize(){},setViewport(){},setScissor(){},setScissorTest(){}});
 Object.assign(r.domElement,{toDataURL:()=> 'data:image/png;base64,AA=='});
 const finding=host.inspect({sections:['surface-overlaps']}).surfaceOverlaps!.findings[0]!;
 await world.start();
 const before=world.snapshot(),children=[...observer.scene.children];
 expect(before.isRunning).toBe(true);
 expect(captureSurfaceOverlap(observer,finding)).toMatchObject({diagnostic:true});
 expect(world.snapshot()).toEqual(before);
 const original=new Error('DIAGNOSTIC_FAILED'),restore=new Error('FRAMEBUFFER_FAILED');
 const getSize=r.getSize,render=r.render;
 r.getSize=()=>{throw original;};
 r.render=()=>{throw restore;};
 expect(()=>captureSurfaceOverlap(observer,finding)).toThrow(original);
 expect(world.snapshot()).toEqual(before);expect(observer.scene.children).toEqual(children);
 r.getSize=getSize;
 expect(()=>captureSurfaceOverlap(observer,finding)).toThrow(restore);
 expect(world.snapshot()).toEqual(before);expect(observer.scene.children).toEqual(children);
 r.render=(scene,camera)=>{if(camera===observer.camera)throw restore;return render.call(r,scene,camera);};
 expect(()=>captureSurfaceOverlap(observer,finding)).toThrow(restore);
 expect(world.snapshot()).toEqual(before);expect(observer.scene.children).toEqual(children);
});


it('reports raw geometry at its sampled pose without inventing physics classification',async()=>{
 const {observer,host}=await fixture();
 const object=new THREE.Group();
 for(let i=0;i<2;i++)object.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial()));
 observer.scene.add(object);
 const {snapshot:_snapshot,inspect:_inspect,capabilities:_capabilities,getEntityGeometry:_geometry,...raw}=observer;
 window.__WORLDKIT_EVAL__={...raw,targets:{gate:object}};
 const result=host.inspect({sections:['surface-overlaps'],entityIds:['gate']}).surfaceOverlaps!;
 expect(result.findings.length).toBeGreaterThan(0);
 expect(result.scope).toContain('sampled pose');
 expect(result).not.toHaveProperty('physicsKind');
});
