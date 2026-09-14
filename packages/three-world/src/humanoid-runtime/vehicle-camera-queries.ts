import RAPIER from '@dimforge/rapier3d-compat';
import {Box3,Matrix4,Object3D,Ray,Vector3,type BufferGeometry,type InstancedMesh,type Material,type Mesh} from 'three';
import type {CameraCollisionProbeResult} from '@worldkit/camera-collision';
import {collisionMeshes,extractCollisionGeometry,geometryAttributeVersion,isWorldVisible,poseFromWorldMatrix,worldPose,type WorldPose} from '../geometry';
import type {Vec3} from '../contracts';
import {CameraMeshShape} from './camera-mesh-shape';
import {isCameraVisualEffect} from './camera-visual-effects';
import {cameraGeometrySource,cameraMeshSource,cameraMeshAtMatrix,cameraMeshLocalBounds,cameraMeshWorldBounds} from './camera-mesh-sample';

interface Part {shape:CameraMeshShape;bounds:Box3;mesh:Mesh;materialIndex:number}
interface Volume {shape:CameraMeshShape;bounds:Box3;parts:readonly Part[]}
interface Geometry {parts:readonly Part[];volumes:readonly Volume[]}
interface Frame extends Geometry {id:string;pose:WorldPose}
interface VehicleFrame {id:string;bounds:Box3;fallbackBounds:Box3|undefined;parts:CachedFrame[];prepared:boolean;failed:boolean;unknown:boolean}
interface CachedFrame extends Frame {source:Mesh;poseReady:boolean;boundsValid:boolean;mesh:Mesh;sampleMatrix:Matrix4;localBounds:Box3;matrix:Matrix4;shapeMatrix:Matrix4;worldBounds:Box3;revision:ReturnType<typeof meshRevision>}
function geometryRevision(geometry:BufferGeometry){
 const position=geometry.getAttribute('position'),index=geometry.getIndex();
 return {source:cameraGeometrySource(geometry),position,index,positionCount:position?.count,indexCount:index?.count,positionVersion:geometryAttributeVersion(position),indexVersion:geometryAttributeVersion(index??undefined),
  drawStart:geometry.drawRange.start,drawCount:geometry.drawRange.count};
}
function sameGeometryRevision(g:BufferGeometry,r:ReturnType<typeof geometryRevision>):boolean {
 const p=g.getAttribute('position'),i=g.getIndex();
 return r.position===p&&r.index===i&&r.positionCount===p?.count&&r.indexCount===i?.count&&r.positionVersion===geometryAttributeVersion(p)&&r.indexVersion===geometryAttributeVersion(i??undefined)
  &&r.drawStart===g.drawRange.start&&r.drawCount===g.drawRange.count;
}
interface SampledGeometry {source:BufferGeometry;revision:ReturnType<typeof geometryRevision>;sample:object}
function meshRevision(mesh:Mesh,geometry:SampledGeometry){
 const instances=(mesh as InstancedMesh).isInstancedMesh?mesh as InstancedMesh:undefined;
 return {geometry,geometryRevision:geometry.revision,materialArray:Array.isArray(mesh.material),groups:Array.isArray(mesh.material)?mesh.geometry.groups.map(g=>({...g})):undefined,morphs:mesh.morphTargetInfluences?.slice(),
  instanceMatrix:instances?.instanceMatrix,instanceVersion:instances?.instanceMatrix.version,instanceCount:instances?.count};
}
/** Geometry is shared, but material layout, morphs and instances belong to each mesh. */
function sameRevision(mesh:Mesh,r:ReturnType<typeof meshRevision>,geometry:SampledGeometry):boolean {
 const instances=(mesh as InstancedMesh).isInstancedMesh?mesh as InstancedMesh:undefined,morphs=mesh.morphTargetInfluences;
 return r.geometryRevision===geometry.revision&&r.materialArray===Array.isArray(mesh.material)
  // Single-material extraction covers the draw range and does not use groups.
  &&(!r.groups||(r.groups.length===mesh.geometry.groups.length&&r.groups.every((a,n)=>{const b=mesh.geometry.groups[n]!;return a.start===b.start&&a.count===b.count&&a.materialIndex===b.materialIndex;})))
  &&r.morphs?.length===morphs?.length&&(!r.morphs||r.morphs.every((v,n)=>v===morphs![n]))
  &&r.instanceMatrix===instances?.instanceMatrix&&r.instanceVersion===instances?.instanceMatrix.version&&r.instanceCount===instances?.count;
}
function material(part:Part):Material|undefined{return Array.isArray(part.mesh.material)?part.mesh.material[part.materialIndex]:part.mesh.material;}
function visible(part:Part){const m=material(part);return !!m&&m.visible&&m.opacity>0&&isWorldVisible(part.mesh);}
function opaque(part:Part){const m=material(part);return visible(part)&&!(m!.transparent&&m!.opacity<1)&&!('transmission' in m!&&typeof m.transmission==='number'&&m.transmission>0);}
/** Only closed, consistently wound components have a solid interior; open windows do not. */
function closedGeometry(vertices:Float32Array,indices:Uint32Array):{vertices:Float32Array;indices:Uint32Array}|undefined {
 const bounds=new Box3().setFromArray(vertices),size=bounds.getSize(new Vector3());
 // Numerical seams in Three primitives are far smaller than a camera sphere.
 // Cap welding at 10 micrometres so authored apertures stay open at large scales.
 const tolerance=Math.min(1e-5,Math.max(1e-7,size.length()*1e-7));
 const ids=new Map<string,number>(),vertexIds:number[]=[],welded:number[]=[],triangles:number[]=[];
 for(let i=0;i<vertices.length;i+=3){
  const key=[vertices[i]!,vertices[i+1]!,vertices[i+2]!].map(v=>Math.round(v/tolerance)).join(',');
  if(!ids.has(key)){ids.set(key,ids.size);welded.push(vertices[i]!,vertices[i+1]!,vertices[i+2]!);}vertexIds.push(ids.get(key)!);
 }
 for(let i=0;i<indices.length;i+=3){const a=vertexIds[indices[i]!]!,b=vertexIds[indices[i+1]!]!,c=vertexIds[indices[i+2]!]!;if(a!==b&&b!==c&&c!==a)triangles.push(a,b,c);}
 const edges=new Map<string,{count:number;direction:number}>();
 for(let i=0;i<triangles.length;i+=3)for(let e=0;e<3;e++){
  const a=triangles[i+e]!,b=triangles[i+(e+1)%3]!;
  const key=a<b?`${a}:${b}`:`${b}:${a}`,edge=edges.get(key)??{count:0,direction:0};edge.count++;edge.direction+=a<b?1:-1;edges.set(key,edge);
 }
 if(edges.size>0&&[...edges.values()].every(e=>e.count===2&&e.direction===0))return {vertices:Float32Array.from(welded),indices:Uint32Array.from(triangles)};
}

/** Camera-only shape queries over authored vehicle meshes. No colliders or second world. */
export class VehicleCameraQueries {
 private readonly cache=new Map<Object3D,CachedFrame>();
 private readonly geometryRevisions=new WeakMap<BufferGeometry,SampledGeometry>();
 private frames:VehicleFrame[]=[];
 private readonly poseSample=new Object3D();
 private readonly rigidMatrix=new Matrix4();
 private readonly shapeMatrix=new Matrix4();
 private readonly unitScale=new Vector3(1,1,1);
 private refinementSequence=0;
 get refinementRevision():number{return this.refinementSequence;}
 readonly refinedActorIds=new Set<string>();
 constructor(private readonly vehicles:readonly {instanceId:string;object:Object3D}[]){}
 private release(geometry:Geometry):void{for(const p of [...geometry.parts,...geometry.volumes])p.shape.dispose();}
 dispose():void{for(const geometry of this.cache.values())this.release(geometry);this.cache.clear();this.frames=[];this.refinedActorIds.clear();this.refinementSequence++;}
 /** Publish fresh broad-phase bounds for this fixed or display sample. */
 sync(fallbackBounds:ReadonlyMap<string,Box3>=new Map()):void {
  this.frames=[];this.refinedActorIds.clear();this.refinementSequence++;
  const liveMeshes=new Set<Object3D>(),sample={};
  for(const {instanceId,object} of this.vehicles){
   const vehicle:VehicleFrame={id:instanceId,bounds:new Box3(),fallbackBounds:fallbackBounds.get(instanceId)?.clone(),parts:[],prepared:false,failed:false,unknown:false};
   this.frames.push(vehicle);
   try{
    worldPose(object);let allPrepared=true;
    for(const mesh of collisionMeshes(object)){
     if(isCameraVisualEffect(mesh))continue;
     liveMeshes.add(mesh);
     let cached=this.cache.get(mesh);
     let geometry=cached?.revision.geometry.source===mesh.geometry?cached.revision.geometry:this.geometryRevisions.get(mesh.geometry);
     if(!geometry){
      geometry={source:mesh.geometry,revision:geometryRevision(mesh.geometry),sample};this.geometryRevisions.set(mesh.geometry,geometry);
     }else if(geometry.sample!==sample){
      if(!sameGeometryRevision(mesh.geometry,geometry.revision))geometry.revision=geometryRevision(mesh.geometry);
      geometry.sample=sample;
     }
     // Source changes remain eager: bounds and failure policy may both change.
     if(!cached||!sameRevision(mesh,cached.revision,geometry))cached=this.prepareFrame(instanceId,mesh,geometry,cached,undefined,true);
     if(!cached.sampleMatrix.equals(mesh.matrixWorld)){
      cached.poseReady=false;cached.sampleMatrix.copy(mesh.matrixWorld);
      cached.boundsValid=cameraMeshWorldBounds(cached.localBounds,cached.sampleMatrix,cached.worldBounds);
     }
     vehicle.unknown ||= !cached.boundsValid;
     allPrepared &&= cached.poseReady;
     vehicle.parts.push(cached);vehicle.bounds.union(cached.worldBounds);
    }
    if(!vehicle.unknown&&allPrepared)this.publishPrepared(vehicle);
   }catch(error){this.failVehicle(vehicle,error);}
  }
  for(const [mesh,geometry] of this.cache)if(!liveMeshes.has(mesh)){this.release(geometry);this.cache.delete(mesh);}
 }
 private publishPrepared(vehicle:VehicleFrame):void {
  vehicle.prepared=true;
  if(vehicle.parts.some(part=>part.parts.length)&&!this.refinedActorIds.has(vehicle.id)){this.refinedActorIds.add(vehicle.id);this.refinementSequence++;}
 }
 private failVehicle(vehicle:VehicleFrame,error:unknown):void {
  if(!(error instanceof Error)||!error.message.startsWith('PHYSICS_'))throw error;
  // A bad rigid part invalidates refinement for the entire vehicle, including
  // siblings away from this ray. Its native movement envelope stays eligible.
  vehicle.failed=true;vehicle.prepared=true;if(this.refinedActorIds.delete(vehicle.id))this.refinementSequence++;
 }
 private prepareVehicle(vehicle:VehicleFrame):void {
  if(vehicle.prepared)return;
  try{
   vehicle.parts=vehicle.parts.map(part=>this.prepareFrame(vehicle.id,part.mesh,part.revision.geometry,part,part.sampleMatrix));
   this.publishPrepared(vehicle);
  }catch(error){this.failVehicle(vehicle,error);}
 }
 private prepareFrame(instanceId:string,mesh:Mesh,geometry:SampledGeometry,cached:CachedFrame|undefined,sampledMatrix?:Matrix4,sourceChanged=false):CachedFrame {
  if(cached&&!sourceChanged&&cached.boundsValid&&cached.matrix.equals(sampledMatrix??mesh.matrixWorld)){cached.poseReady=true;return cached;}
  const revised=!cached||sourceChanged;
  const source=cached&&!sourceChanged?cached.source:cameraMeshSource(mesh,geometry.revision.source);
  const revision=cached&&!sourceChanged?cached.revision:meshRevision(mesh,geometry);
  const matrix=sampledMatrix??mesh.matrixWorld;
  this.poseSample.matrixWorld.copy(matrix);
  const pose=poseFromWorldMatrix(this.poseSample);
    this.rigidMatrix.compose(pose.position,pose.rotation,this.unitScale);
    this.shapeMatrix.copy(this.rigidMatrix).invert().multiply(matrix);
    // Match geometrySignature's transform precision, without serializing all
    // geometry IDs, attributes and groups whenever only the rigid pose changes.
    for(let n=0;n<16;n++)this.shapeMatrix.elements[n]=Math.round(this.shapeMatrix.elements[n]!*1e8)/1e8;
    if(!cached||revised||!cached.shapeMatrix.equals(this.shapeMatrix)){
     const snapshot=extractCollisionGeometry(cameraMeshAtMatrix(source,matrix),4096,1_000_000,false,true,false),parts:Part[]=[],volumes:Volume[]=[];
     try{
     for(const geometry of snapshot.geometries){
      const drawStart=source.geometry.drawRange.start;
      const groups=Array.isArray(source.material)?source.geometry.groups:[{start:drawStart,count:geometry.indices.length,materialIndex:0}],meshParts:Part[]=[];
      for(const group of groups){
       const start=Math.max(0,group.start-drawStart),end=Math.min(geometry.indices.length,group.start+group.count-drawStart);
       if(end<=start)continue;
       const indices=geometry.indices.slice(start,end),bounds=new Box3(),point=new Vector3();
       for(const index of indices)bounds.expandByPoint(point.fromArray(geometry.vertices,index*3));
       const part={shape:new CameraMeshShape(new RAPIER.TriMesh(geometry.vertices,indices)),bounds,mesh,materialIndex:group.materialIndex??0};meshParts.push(part);parts.push(part);
      }
      const solid=meshParts.reduce((n,p)=>n+p.shape.indices.length,0)===geometry.indices.length?closedGeometry(geometry.vertices,geometry.indices):undefined;
      if(solid){
       const bounds=new Box3();for(const part of meshParts)bounds.union(part.bounds);
       volumes.push({shape:new CameraMeshShape(new RAPIER.TriMesh(solid.vertices,solid.indices,RAPIER.TriMeshFlags.ORIENTED)),bounds,parts:meshParts});
      }
     }
     }catch(error){this.release({parts,volumes});throw error;}
     if(cached)this.release(cached);
     cached={id:instanceId,source,poseReady:true,boundsValid:true,mesh,parts,volumes,pose,sampleMatrix:matrix.clone(),localBounds:cameraMeshLocalBounds(source),matrix:matrix.clone(),shapeMatrix:this.shapeMatrix.clone(),worldBounds:new Box3(),revision};this.cache.set(mesh,cached);
    }else{
     cached.poseReady=true;cached.pose=pose;cached.matrix.copy(matrix);
    }

   cached.boundsValid=cameraMeshWorldBounds(cached.localBounds,cached.sampleMatrix,cached.worldBounds);
   if(!cached.boundsValid)throw new Error('PHYSICS_TRANSFORM_INVALID: Camera bounds must be finite.');
   return cached;
 }
 private local(frame:Frame,point:Vec3){return new Vector3(...point).sub(frame.pose.position).applyQuaternion(frame.pose.rotation.clone().invert());}
 private vector(frame:Frame,v:RAPIER.Vector):Vec3{return new Vector3(v.x,v.y,v.z).applyQuaternion(frame.pose.rotation).toArray();}
 private *candidates(from:Vec3,to:Vec3,radius:number,excludedActorId?:string):Iterable<Frame>{
  const start=new Vector3(...from),end=new Vector3(...to),sweep=new Box3().setFromPoints([start,end]).expandByScalar(radius);
  // Bounds contain the actual authored mesh, not the smaller movement envelope.
  // Only the broad phase is approximate; nearby windows/glass still use triangles.
  // Resolve every candidate before yielding: an overlap may return early, but
  // the host still needs the final per-query fallback filter for all candidates.
  for(const vehicle of this.frames)if(vehicle.id!==excludedActorId&&(vehicle.unknown||vehicle.bounds.intersectsBox(sweep)||vehicle.fallbackBounds?.intersectsBox(sweep)))this.prepareVehicle(vehicle);
  for(const vehicle of this.frames)if(vehicle.id!==excludedActorId&&vehicle.prepared&&!vehicle.failed&&vehicle.bounds.intersectsBox(sweep))yield* vehicle.parts;
 }
 probe(from:Vec3,to:Vec3,radius:number,excludedActorId?:string):CameraCollisionProbeResult {
  const length=Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2]);let nearest:CameraCollisionProbeResult={distanceMeters:length};
  for(const frame of this.candidates(from,to,radius,excludedActorId)){
   const start=this.local(frame,from),end=this.local(frame,to),direction=end.clone().sub(start).normalize(),ray=new Ray(start,direction);
   for(const volume of frame.volumes){
    if(!volume.parts.every(radius===0?opaque:visible)||!volume.bounds.containsPoint(start))continue;
    const surface=volume.shape.interior(start);if(!surface)continue;
    const outward=new Vector3(surface.x,surface.y,surface.z).sub(start),depth=outward.length();
    if(depth>1e-8)return {distanceMeters:0,colliderEntityId:frame.id,startedOverlapping:true,normalWorldXYZ:this.vector(frame,outward.multiplyScalar(1/depth)),penetrationDepthMeters:depth+radius};
   }
   for(const part of frame.parts){
    if(!(radius===0?opaque(part):visible(part)))continue;
    const bounds=part.bounds.clone().expandByScalar(radius),point=new Vector3();
    if(!bounds.containsPoint(start)&&(!ray.intersectBox(bounds,point)||point.distanceTo(start)>nearest.distanceMeters))continue;
    if(radius===0){
      const distance=part.shape.castRay(start,direction,nearest.distanceMeters);
      if(distance>=0&&distance<=nearest.distanceMeters)nearest={distanceMeters:distance,colliderEntityId:frame.id,startedOverlapping:distance===0};
      continue;
    }
    // Direct Shape.castShape normals/witnesses are local to shape 1, unlike World.castShape.
    const hit=part.shape.probeBall(start,direction,radius,nearest.distanceMeters);
    if(hit?.overlap)return {distanceMeters:0,colliderEntityId:frame.id,startedOverlapping:true,normalWorldXYZ:this.vector(frame,hit.normal),penetrationDepthMeters:hit.depth};
    if(hit){const p=new Vector3(hit.point.x,hit.point.y,hit.point.z).applyQuaternion(frame.pose.rotation).add(frame.pose.position);
     nearest={distanceMeters:hit.distance,colliderEntityId:frame.id,normalWorldXYZ:this.vector(frame,hit.normal),hitPositionWorldMetersXYZ:p.toArray(),startedOverlapping:false,penetrationDepthMeters:0};}
   }
  }
  return nearest;
 }
 visibleBetween(from:Vec3,to:Vec3,excludedActorId?:string):boolean {
  const length=Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2]);if(length<1e-12)return true;
  for(const frame of this.candidates(from,to,0,excludedActorId)){
   const start=this.local(frame,from),direction=this.local(frame,to).sub(start).normalize(),ray=new Ray(start,direction);
   for(const part of frame.parts){
    if(!opaque(part))continue;
    const point=new Vector3();if(!part.bounds.containsPoint(start)&&(!ray.intersectBox(part.bounds,point)||point.distanceTo(start)>=length))continue;
    const distance=part.shape.castRay(start,direction,length*.99999);
    if(distance>=0&&distance<length*.99999)return false;
   }
  }
  return true;
 }
}
