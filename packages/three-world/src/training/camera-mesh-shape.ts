import RAPIER from '@dimforge/rapier3d-compat';

/** Retain Rapier's native mesh/BVH. Shape convenience methods rebuild it on every query. */
export class CameraMeshShape {
 private readonly raw:ReturnType<RAPIER.TriMesh['intoRaw']>;
 private readonly origin=RAPIER.VectorOps.intoRaw({x:0,y:0,z:0});
 private readonly rotation=RAPIER.RotationOps.intoRaw({x:0,y:0,z:0,w:1});
 private disposed=false;
 readonly indices:Uint32Array;
 constructor(shape:RAPIER.TriMesh){
  this.indices=shape.indices;
  try{this.raw=shape.intoRaw();}catch(error){this.origin.free();this.rotation.free();throw error;}
 }
 dispose():void{if(this.disposed)return;this.disposed=true;this.raw.free();this.origin.free();this.rotation.free();}
 interior(point:RAPIER.Vector):RAPIER.Vector|undefined {
  const p=RAPIER.VectorOps.intoRaw(point);
  try{
   if(!this.raw.containsPoint(this.origin,this.rotation,p))return;
   return RAPIER.PointProjection.fromBuffer(this.raw.projectPoint(this.origin,this.rotation,p,false)).point;
  }finally{p.free();}
 }
 probeBall(start:RAPIER.Vector,direction:RAPIER.Vector,radius:number,distance:number):
  {overlap:true;depth:number;normal:RAPIER.Vector}|{overlap:false;distance:number;normal:RAPIER.Vector;point:RAPIER.Vector}|undefined {
  const p=RAPIER.VectorOps.intoRaw(start),ball=new RAPIER.Ball(radius).intoRaw();
  try{
   const rawContact=this.raw.contactShape(this.origin,this.rotation,ball,p,this.rotation,0);
   const contact=rawContact?RAPIER.ShapeContact.fromBuffer(rawContact):undefined;
   if(contact&&contact.distance<=0)return {overlap:true,depth:-contact.distance,normal:contact.normal1};
   if(distance<=1e-12)return;
   const velocity=RAPIER.VectorOps.intoRaw(direction);
   try{
    const hit=this.raw.castShape(this.origin,this.rotation,this.origin,ball,p,this.rotation,velocity,0,distance,true);
    if(!hit)return;
    try{
     // Rapier 0.20 ShapeCastHit layout: time, witness1, witness2, normal1, normal2.
     const data=new Float32Array(13);hit.getComponents(data);
     return {overlap:false,distance:data[0]!,point:{x:data[1]!,y:data[2]!,z:data[3]!},normal:{x:data[7]!,y:data[8]!,z:data[9]!}};
    }finally{hit.free();}
   }finally{velocity.free();}
  }finally{p.free();ball.free();}
 }
 castRay(start:RAPIER.Vector,direction:RAPIER.Vector,distance:number):number {
  const p=RAPIER.VectorOps.intoRaw(start),v=RAPIER.VectorOps.intoRaw(direction);
  try{return this.raw.castRay(this.origin,this.rotation,p,v,distance,true);}finally{p.free();v.free();}
 }
}
