import type { EnvironmentBox, Vec3 } from './types';
export function block(id:string,position:Vec3,size:Vec3,color='#b8c8cc',rotation?:Vec3,collision=true):EnvironmentBox{return {id,position,size,color,...(rotation?{rotation}:{}),collision};}
/** Open frontage, low-clearance lane and a rear mezzanine reached by 21 walkable steps. */
export function indoorModule(cx:number,cz:number):EnvironmentBox[]{
 const b:EnvironmentBox[]=[];
 const add=(id:string,x:number,y:number,z:number,w:number,h:number,d:number,color='#bccbd0')=>b.push(block(`indoor-${id}`,[cx+x,y,cz+z],[w,h,d],color));
 add('wall-left',-22,4,0,.5,8,48);add('wall-right',22,4,0,.5,8,48);add('wall-back',0,4,24,44,8,.5);
 add('door-left',-12,4,-24,20,8,.5);add('door-right',12,4,-24,20,8,.5);add('door-lintel',0,5.6,-24,4,4.8,.5,'#608995');
 add('mezzanine',-4,4.2,14,35,.4,19,'#899fa9');
 add('low-ceiling',-13,2.7,-3,12,.4,12,'#e3b775');
 for(const x of [-18,-6,6])add(`column-${x}`,x,2,9,.8,4,.8,'#648896');
 for(let i=0;i<21;i++)add(`stair-${i}`,14,(i+1)*.1,-7+i*.6,5,(i+1)*.2,.6);
 add('landing',14,4.2,8,6,.4,6,'#899fa9');
 add('rail-back',-4,4.85,23,35,.9,.18,'#e3b775');add('rail-left',-21,4.85,14,.18,.9,18,'#e3b775');
 // Separate garage bay; wide open front lets ground vehicles enter.
 add('garage-side',34,3,7,.5,6,28,'#8198a2');add('garage-back',28,3,21,12,6,.5,'#8198a2');add('garage-roof',28,6,7,12,.5,28,'#8198a2');
 return b;
}
/** Thin rotated top slab: endpoints describe the actual traversable upper face. */
export function ramp(id:string,x:number,z:number,width:number,run:number,rise:number,start=0,color='#91acb4'):EnvironmentBox{
 const angle=-Math.atan2(rise,run),thickness=.3;
 return block(id,[x,start+rise/2-thickness*Math.cos(angle)/2,z-thickness*Math.sin(angle)/2],[width,thickness,Math.hypot(run,rise)],color,[angle,0,0]);
}
