import * as T from 'three';
import type {VehicleSpec} from './config';

/** Source101 固定驾驶姿态：骨盆 y=1.3；当前 UEFN 蒙皮座垫顶面 y=1.168、脚踏顶面 y=.7025。
 * 握把沿用该骨架的驾驶姿态；座垫和脚踏按当前可见蒙皮复测；模型朝向为 +Z。
 * 舱内留空，不能用实心椭球包住驾驶员和相机。 */
export function buildSpaceModel(spec:VehicleSpec){
 const root=new T.Group(),seat=new T.Group(),engine:T.Mesh[]=[];root.name=spec.id;
 seat.position.set(...spec.seat);root.add(seat);
 const hull=new T.MeshStandardMaterial({color:spec.color,metalness:.35,roughness:.55});
 const dark=new T.MeshStandardMaterial({color:'#283542',roughness:.85});
 const light=new T.MeshBasicMaterial({color:'#65d9ff'});
 const glass=new T.MeshStandardMaterial({color:'#b1e2ed',transparent:true,opacity:.13,depthWrite:false,side:T.DoubleSide});
 const part=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,material:T.Material=hull)=>{
  const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.name=name;m.position.set(x,y,z);root.add(m);return m;
 };
 const ring=(name:string,profile:readonly (readonly[number,number])[],mat:T.Material=hull)=>{
  const mesh=new T.Mesh(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),64),mat);mesh.name=name;root.add(mesh);return mesh;
 };
 if(spec.spaceFlight?.hull==='disc'){
  ring('saucer-disc',[[2.65,.55],[2.7,.82],[3.45,.6],[5.5,.05],[5.5,-.1],[3.1,-.28],[2.65,.12],[2.65,.55]]);
  ring('saucer-rim-light',[[5.45,.045],[5.48,.04],[5.48,.09],[5.45,.095]],light);
  ring('saucer-canopy',[[2.65,.82],[2.50,1.65],[2.05,2.30],[1.30,2.65],[0,2.7]],glass);
  ring('saucer-crown',[[0,2.69],[.55,2.67],[.55,2.7],[0,2.7]]);
  const floor=new T.Mesh(new T.CylinderGeometry(2.65,2.65,.16,48),dark);floor.position.y=.61;floor.name='cabin-floor';root.add(floor);
  for(let a=0;a<8;a++){
   const t=a*Math.PI/4,r=4.1;const panel=part('saucer-panel',.8,.035,.65,Math.sin(t)*r,.42,Math.cos(t)*r,dark);panel.rotation.y=t;
  }
 }else{
  part('cabin-floor',1.8,.16,3.9,0,.61,-.1,dark);
  for(const x of [-1.5,1.5]){
   part('shuttle-pod',1.15,1.15,5.7,x,.55,-.6);
   part('shuttle-pod-light',.65,.12,.08,x,.65,2.3,light);
  }
  part('shuttle-nose',1.75,.8,1.1,0,.9,2.65);
  part('shuttle-rear',1.8,.8,.4,0,1,-2.3);
  for(const x of [-.88,.88])part('cockpit-side-glass',.03,1.45,2.5,x,1.8,.2,glass);
  part('cockpit-windscreen',1.75,1.2,.03,0,1.9,1.65,glass);
  part('cockpit-roof-glass',1.8,.03,2.5,0,2.53,.2,glass);
 }
 // 各型船共享同一个实际人物驾驶位。相机由主项目的 driver-eye 提供。
 part('seat-cushion',.72,.13,.5,0,1.103,.1,dark);
 part('seat-back',.74,.66,.12,0,1.53,-.24,dark);
 for(const x of [-.16,.16])part('space-pedal',.18,.035,.30,x,.685,.5,dark);
 for(const [x,y,z] of [[.214,1.508,.52],[-.195,1.524,.495]] as const){
  part('space-grip',.14,.025,.065,x,y,z,dark);
  part('space-grip-support',.035,.045,.46,x,y-.035,z+.23,dark);
 }
 part('space-dashboard',1.02,.28,.12,0,1.53,1.06,dark);
 for(const x of [-.32,0,.32])part('space-display',.26,.17,.01,x,1.55,.993,light);
 for(const x of [-1.4,1.4]){
  const m=new T.Mesh(new T.ConeGeometry(.22,.9,12),new T.MeshBasicMaterial({color:'#64d9ff',transparent:true,opacity:.65}));
  m.name='space-exhaust';m.visible=false;m.rotation.x=-Math.PI/2;m.position.set(x,.35,spec.spaceFlight?.hull==='disc'?-4.5:-3.35);root.add(m);engine.push(m);
 }
 return {root,seat,engine};
}

/** 主项目展示回调读取实际喷口推力，无推进的惯性滑行时熄灭尾焰。 */
export function updateSpaceExhaust(engine:readonly T.Mesh[],forceWorld:T.Vector3,rotation:T.Quaternion,maxThrust:number){
 const local=forceWorld.clone().applyQuaternion(rotation.clone().invert()),ratio=T.MathUtils.clamp(local.z/maxThrust,0,1);
 for(const flame of engine){flame.visible=ratio>.001;flame.scale.y=.25+ratio;}
}
