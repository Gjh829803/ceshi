import RAPIER from '@dimforge/rapier3d-compat';
import type {Vec3} from './contracts';
import {MAXIMUM_BOX_CELL_EDGE_METERS} from './config/physics';

/** One exact box volume: voxel solver cells remove internal faces; queries retain its outer box. */
class ExactBoxShape extends RAPIER.Voxels {
 readonly boxHalfExtents:Vec3;
 readonly contactVolume:RAPIER.Cuboid;
 private nativeSource:{colliders:RAPIER.ColliderSet;handle:number}|undefined;
 constructor(half:Vec3){
  // Voxel indices address minimum corners. Even counts center the complete volume at zero.
  const counts=half.map(value=>2*Math.ceil(value/MAXIMUM_BOX_CELL_EDGE_METERS));
  const cell=half.map((value,axis)=>value*2/counts[axis]!),coordinates:number[]=[];
  for(let x=-counts[0]!/2;x<counts[0]!/2;x++)for(let y=-counts[1]!/2;y<counts[1]!/2;y++)for(let z=-counts[2]!/2;z<counts[2]!/2;z++)coordinates.push(x,y,z);
  const data=new Int32Array(coordinates);
  super(data,Object.freeze({x:cell[0]!,y:cell[1]!,z:cell[2]!}));
  // Typed-array elements cannot be frozen. Inspection gets a copy of the canonical data.
  Object.defineProperty(this,'data',{get:()=>data.slice(),enumerable:true,configurable:false});
  this.boxHalfExtents=Object.freeze([...half]) as Vec3;
  this.contactVolume=new RAPIER.Cuboid(...half);Object.freeze(this.contactVolume.halfExtents);Object.freeze(this.contactVolume);
 }
 override intoRaw():ReturnType<RAPIER.Voxels['intoRaw']>{
  // Rapier coShape returns an Arc clone. createCollider consumes and frees this
  // temporary RawShape; the actual colliders retain the shared native volume/BVH.
  if(this.nativeSource&&this.nativeSource.colliders.get(this.nativeSource.handle)?.shape!==this)this.nativeSource=undefined;
  return this.nativeSource?this.nativeSource.colliders.raw.coShape(this.nativeSource.handle):super.intoRaw();
 }
 shareFrom(colliders:RAPIER.ColliderSet,handle:number):void{this.nativeSource??={colliders,handle};}
 seal():void{this.nativeSource=undefined;Object.freeze(this);}
}

/** Only this factory's proven complete box partitions have a box navigation surface. */
export function exactBoxHalfExtents(shape:RAPIER.Shape):Vec3|undefined{
 return shape instanceof ExactBoxShape?shape.boxHalfExtents:undefined;
}

/** Discrete contact of this same box volume. Rapier's voxel contact() is unsupported. */
export function contactColliderVolume(collider:RAPIER.Collider,shape:RAPIER.Shape,position:RAPIER.Vector,rotation:RAPIER.Rotation,prediction:number):RAPIER.ShapeContact|null{
 const geometry=collider.shape;
 const target=shape instanceof ExactBoxShape?shape.contactVolume:shape;
 return geometry instanceof ExactBoxShape?geometry.contactVolume.contactShape(collider.translation(),collider.rotation(),target,position,rotation,prediction):collider.contactShape(target,position,rotation,prediction);
}

/** Construction-scoped sharing. Every native source is a real map collider. */
export class FixedBoxColliderFactory {
 private readonly shapes=new Map<string,RAPIER.Cuboid|ExactBoxShape>();
 private disposed=false;
 constructor(private readonly world:RAPIER.World){}
 create(half:Vec3,configure:(descriptor:RAPIER.ColliderDesc)=>RAPIER.ColliderDesc):RAPIER.Collider{
  if(this.disposed)throw new Error('BOX_COLLIDER_FACTORY_DISPOSED');
  if(half.some(value=>!Number.isFinite(value)||value<=0))throw new Error('PHYSICS_BOX_DEGENERATE');
  const key=JSON.stringify(half);let shape=this.shapes.get(key);
  if(!shape){shape=half.some(value=>value*2>MAXIMUM_BOX_CELL_EDGE_METERS)?new ExactBoxShape(half):new RAPIER.Cuboid(...half);this.shapes.set(key,shape);}
  const descriptor=configure(new RAPIER.ColliderDesc(shape));if(descriptor.shape!==shape)throw new Error('BOX_COLLIDER_FACTORY_SHAPE_MISMATCH');
  const collider=this.world.createCollider(descriptor);
  if(shape instanceof ExactBoxShape)shape.shareFrom(this.world.colliders,collider.handle);
  return collider;
 }
 dispose():void{
  if(this.disposed)return;this.disposed=true;
  for(const shape of this.shapes.values())if(shape instanceof ExactBoxShape)shape.seal();else{Object.freeze(shape.halfExtents);Object.freeze(shape);}
  this.shapes.clear();
 }
}
