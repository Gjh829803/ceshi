import RAPIER from '@dimforge/rapier3d-compat';
import {Box3,Ray,Vector3,type Material,type Mesh,type Object3D} from 'three';
import type {CameraCollisionProbeResult} from '@whitebox-world/camera-collision';
import {extractCollisionGeometry,geometrySignature,isWorldVisible,worldPose,type WorldPose} from '../geometry';
import type {Vec3} from '../contracts';
import {CameraMeshShape} from './camera-mesh-shape';

interface Part {shape:CameraMeshShape;bounds:Box3;mesh:Mesh;materialIndex:number}
interface Volume {shape:CameraMeshShape;bounds:Box3;parts:readonly Part[]}
interface Geometry {parts:readonly Part[];volumes:readonly Volume[]}
interface Frame extends Geometry {id:string;pose:WorldPose}
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
 private readonly cache=new Map<Object3D,Geometry & {signature:string}>();
 private frames:Frame[]=[];
 readonly refinedActorIds=new Set<string>();
 constructor(private readonly vehicles:readonly {instanceId:string;object:Object3D}[]){}
 private release(geometry:Geometry):void{for(const p of [...geometry.parts,...geometry.volumes])p.shape.dispose();}
 dispose():void{for(const geometry of this.cache.values())this.release(geometry);this.cache.clear();this.frames=[];this.refinedActorIds.clear();}
 /** Sample the same visual pose used by this fixed step or display transaction. */
 sync():void {
  this.frames=[];this.refinedActorIds.clear();
  for(const {instanceId,object} of this.vehicles){
   try{
    const pose=worldPose(object),signature=geometrySignature(object,pose)+this.materialGroups(object);
    let cached=this.cache.get(object);
    if(!cached||cached.signature!==signature){
     const snapshot=extractCollisionGeometry(object,4096,1_000_000,false,true),parts:Part[]=[],volumes:Volume[]=[];
     try{
     for(const geometry of snapshot.geometries){
      const mesh=geometry.sourceObject,drawStart=mesh.geometry.drawRange.start;
      const groups=Array.isArray(mesh.material)?mesh.geometry.groups:[{start:drawStart,count:geometry.indices.length,materialIndex:0}],meshParts:Part[]=[];
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
     if(cached)this.release(cached);cached={signature,parts,volumes};this.cache.set(object,cached);
    }
    // Empty/incompatible subjects retain the movement envelope as a conservative fallback.
    if(cached.parts.length){this.refinedActorIds.add(instanceId);this.frames.push({id:instanceId,pose,parts:cached.parts,volumes:cached.volumes});}
   }catch(error){
    // Skinned/morphed or temporarily incomplete meshes must not silently lose collision.
    if(!(error instanceof Error)||!error.message.startsWith('PHYSICS_'))throw error;
   }
  }
 }
 private materialGroups(root:Object3D):string {
  const groups:string[]=[];root.traverse(object=>{const mesh=object as Mesh;if(mesh.isMesh)groups.push(String(Array.isArray(mesh.material)),JSON.stringify(mesh.geometry.groups));});return groups.join('|');
 }
 private local(frame:Frame,point:Vec3){return new Vector3(...point).sub(frame.pose.position).applyQuaternion(frame.pose.rotation.clone().invert());}
 private vector(frame:Frame,v:RAPIER.Vector):Vec3{return new Vector3(v.x,v.y,v.z).applyQuaternion(frame.pose.rotation).toArray();}
 probe(from:Vec3,to:Vec3,radius:number,excludedActorId?:string):CameraCollisionProbeResult {
  const length=Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2]);let nearest:CameraCollisionProbeResult={distanceMeters:length};
  for(const frame of this.frames){
   if(frame.id===excludedActorId)continue;
   const start=this.local(frame,from),end=this.local(frame,to),direction=end.clone().sub(start).normalize(),ray=new Ray(start,direction);
   for(const volume of frame.volumes){
    if(!volume.parts.every(visible)||!volume.bounds.containsPoint(start))continue;
    const surface=volume.shape.interior(start);if(!surface)continue;
    const outward=new Vector3(surface.x,surface.y,surface.z).sub(start),depth=outward.length();
    if(depth>1e-8)return {distanceMeters:0,colliderEntityId:frame.id,startedOverlapping:true,normalWorldXYZ:this.vector(frame,outward.multiplyScalar(1/depth)),penetrationDepthMeters:depth+radius};
   }
   for(const part of frame.parts){
    if(!visible(part))continue;
    const bounds=part.bounds.clone().expandByScalar(radius),point=new Vector3();
    if(!bounds.containsPoint(start)&&(!ray.intersectBox(bounds,point)||point.distanceTo(start)>nearest.distanceMeters))continue;
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
  for(const frame of this.frames){
   if(frame.id===excludedActorId)continue;
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
