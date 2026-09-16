import * as THREE from 'three';
import type {WorldObservation} from '@worldkit/three';
import {withCapturePresentation} from './capture.js';
import type {SurfaceOverlapDiagnostics} from './surface-overlap-geometry.js';

type Finding=SurfaceOverlapDiagnostics['findings'][number];
type CaptureWorld=Pick<WorldObservation,'scene'|'renderer'|'camera'|'withPresentation'>;

/** Diagnostic-only local view. No input, pause, camera-owner change or simulation. */
export function captureSurfaceOverlap(world:CaptureWorld,finding:Finding){
 const primary=world.renderer.getRenderTarget()===null;
 let failed=false;
 try{return withDiagnosticPresentation(world,()=>capturePresentedOverlap(world,finding),{view:'object'});}
 catch(error){failed=true;throw error;}
 finally{
  // Restore the visible framebuffer after the capture transaction releases.
  // eslint-disable-next-line no-unsafe-finally -- Keep the diagnostic's primary failure.
  if(primary)try{withDiagnosticPresentation(world,()=>world.renderer.render(world.scene,world.camera));}catch(error){if(!failed)throw error;}
 }
}

// Optional diagnostic failures must not reach the SDK presentation callback:
// its failure boundary stops the runtime for actual world-frame failures.
function withDiagnosticPresentation<T>(world:CaptureWorld,work:()=>T,options?:{readonly view?:'world'|'object'}):T{
 const outcome=withCapturePresentation(world,()=>{
  try{return {ok:true as const,value:work()};}
  catch(error){return {ok:false as const,error};}
 },options);
 if(!outcome.ok)throw outcome.error;
 return outcome.value;
}

function capturePresentedOverlap({scene,renderer,camera:sourceCamera}:CaptureWorld,finding:Finding){
 const old={size:renderer.getSize(new THREE.Vector2()),pixelRatio:renderer.getPixelRatio(),viewport:renderer.getViewport(new THREE.Vector4()),
  scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),target:renderer.getRenderTarget(),
  cube:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),autoClear:renderer.autoClear,xr:renderer.xr.enabled,
  shadows:renderer.shadowMap.enabled,background:scene.background,fog:scene.fog};
 const lods:Array<[THREE.LOD,boolean]>=[];
 scene.traverse(object=>{if((object as THREE.LOD).isLOD)lods.push([object as THREE.LOD,(object as THREE.LOD).autoUpdate]);});
 const points=finding.polygonWorldMetersXYZ.map(p=>new THREE.Vector3(...p));
 if(points.length<3)throw new Error('SURFACE_HIGHLIGHT_POLYGON_UNAVAILABLE');
 const bounds=new THREE.Box3().setFromPoints(points),center=bounds.getCenter(new THREE.Vector3());
 const extent=Math.max(bounds.getSize(new THREE.Vector3()).length()*.8,.5);
 const normal=new THREE.Vector3(...finding.normalWorldXYZ).normalize();
 if(normal.lengthSq()<.5)throw new Error('SURFACE_HIGHLIGHT_NORMAL_INVALID');
 const eye=new THREE.Vector3().setFromMatrixPosition(sourceCamera.matrixWorld);
 if(eye.sub(center).dot(normal)<0)normal.negate();
 const camera=new THREE.OrthographicCamera(-extent*4/3,extent*4/3,extent,-extent,.01,extent*20+100);
 camera.position.copy(center).addScaledVector(normal,extent*4+1);
 camera.up.set(0,Math.abs(normal.y)>.9?0:1,Math.abs(normal.y)>.9?-1:0);
 camera.lookAt(center);camera.updateMatrixWorld(true);
 const overlay=new THREE.Group();overlay.name='diagnostic:surface-overlap';overlay.matrixAutoUpdate=false;
 const lineGeometry=new THREE.BufferGeometry().setFromPoints(points);
 const lineMaterial=new THREE.LineBasicMaterial({color:0xff007f,depthTest:false,depthWrite:false,toneMapped:false});
 const fillGeometry=new THREE.BufferGeometry(),vertices:number[]=[];
 for(let i=1;i<points.length-1;i++)for(const point of [points[0]!,points[i]!,points[i+1]!])vertices.push(point.x,point.y,point.z);
 fillGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 const fillMaterial=new THREE.MeshBasicMaterial({color:0xff007f,transparent:true,opacity:.4,side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});
 const fill=new THREE.Mesh(fillGeometry,fillMaterial),outline=new THREE.LineLoop(lineGeometry,lineMaterial);
 fill.renderOrder=999998;outline.renderOrder=999999;overlay.add(fill,outline);
 let failed=false;
 try{
  scene.updateMatrixWorld(true);
  if(Math.abs(scene.matrixWorld.determinant())<1e-12)throw new Error('SURFACE_HIGHLIGHT_TRANSFORM_INVALID');
  overlay.matrix.copy(scene.matrixWorld).invert();scene.add(overlay);
  for(const [lod] of lods)lod.autoUpdate=false;
  scene.fog=null;renderer.xr.enabled=false;renderer.shadowMap.enabled=false;renderer.setRenderTarget(null);
  renderer.setPixelRatio(1);renderer.setSize(800,600,false);renderer.setViewport(0,0,800,600);renderer.setScissorTest(false);renderer.autoClear=true;
  renderer.render(scene,camera);
  return {diagnostic:true as const,view:'surface-overlap' as const,findingId:finding.id,
   description:'Magenta marks the measured overlap in a temporary local camera view; overlay is visible through occluders. Not proof of visible flicker.',
   imageDataUrl:renderer.domElement.toDataURL('image/png'),cameraPositionWorldMetersXYZ:camera.position.toArray(),targetWorldMetersXYZ:center.toArray()};
 }catch(error){failed=true;throw error;}
 finally{
  const errors:unknown[]=[];const restore=(work:()=>void)=>{try{work();}catch(error){errors.push(error);}};
  restore(()=>overlay.removeFromParent());
  for(const geometry of [fillGeometry,lineGeometry])restore(()=>geometry.dispose());
  for(const material of [fillMaterial,lineMaterial])restore(()=>material.dispose());
  for(const [lod,autoUpdate] of lods)restore(()=>{lod.autoUpdate=autoUpdate;});
  restore(()=>{scene.background=old.background;scene.fog=old.fog;renderer.autoClear=old.autoClear;renderer.xr.enabled=old.xr;renderer.shadowMap.enabled=old.shadows;});
  restore(()=>renderer.setPixelRatio(old.pixelRatio));restore(()=>renderer.setSize(old.size.x,old.size.y,false));
  restore(()=>renderer.setRenderTarget(old.target,old.cube,old.mip));restore(()=>renderer.setViewport(old.viewport));
  restore(()=>renderer.setScissor(old.scissor));restore(()=>renderer.setScissorTest(old.scissorTest));
  // eslint-disable-next-line no-unsafe-finally -- Never disguise a failed cleanup as success.
  if(!failed&&errors.length)throw errors[0];
 }
}
