import {SPECS} from '../config';
import {block} from './modules';
import type {EnvironmentBox,EnvironmentDefinition} from './types';

/** 独立真空训练区。只有空间载具可驾驶，人物在实体平台上上下船。 */
export function createSpaceTrainingMap():EnvironmentDefinition{
 const boxes:EnvironmentBox[]=[block('space-dock-platform',[-76,-1,-70],[64,2,52],'#c2cbd1')];
 // 两船出生位置沿用配置中的 home 泊位，跨地图不会对接到另一套坐标。
 for(const spec of SPECS.filter(s=>s.mode==='spacecraft')){
  const [x,,z]=spec.spawn;
  boxes.push(block(`bay-${spec.id}`,[x,.02,z],[spec.radius*2+2,.025,spec.radius*2+3],spec.color,undefined,false));
 }
 const frame=(id:string,x:number,y:number,z:number,width:number,height:number,roll=0)=>{
  const c=Math.cos(roll),s=Math.sin(roll),place=(dx:number,dy:number,w:number,h:number)=>boxes.push(block(`${id}-${dx}-${dy}`,[x+dx*c-dy*s,y+dx*s+dy*c,z],[w,h,2],'#b8d1dc',[0,0,roll]));
  place(-width/2,0,1.2,height+1.2);place(width/2,0,1.2,height+1.2);place(0,-height/2,width,1.2);place(0,height/2,width,1.2);
 };
 frame('lift-gate',-76,18,20,26,26);
 frame('climb-gate',-76,60,105,26,26);
 frame('strafe-left-gate',-135,60,190,24,24);
 frame('strafe-right-gate',-15,60,270,24,24);
 frame('roll-gate',-15,105,365,26,19,Math.PI/4);
 frame('inertia-gate',65,155,490,32,28);
 boxes.push(block('brake-target',[65,155,610],[55,35,3],'#d2b88c'));
 for(const [n,position] of [[0,[160,70,110]],[1,[215,105,145]],[2,[170,150,220]],[3,[240,70,275]]] as const)
  boxes.push(block(`collision-block-${n}`,position,[18+n*3,16+n*3,20],'#b8bfc8',[.2*n,.35*n,.15*n]));
 return {id:'space-training',name:'太空 · 飞行训练场',description:'独立太空区域：上下船、六自由度操纵、惯性制动、绕障与返回泊位。',
  bounds:{min:[-1200,-600,-1200],max:[1200,1000,1200]},boxes,water:[],
  regions:[
   {id:'space-dock',name:'停靠平台',description:'F 上下船 · T 三视角 · 选择穿梭机或飞碟',center:[-76,0,-70],size:[64,52],color:'#8db8cd',modes:['character','spacecraft']},
   {id:'space-course',name:'六自由度通道',description:'升降、侧移、俯仰与翻滚；黄色挡板前反推制动。',center:[-35,60,300],size:[240,580],color:'#a7c2d1',modes:['spacecraft']},
   {id:'space-collision',name:'绕障练习区',description:'实体障碍具有碰撞；练习低速绕行和惯性漂移。',center:[200,80,195],size:[150,230],color:'#c6b78e',modes:['spacecraft']},
  ],
  spawns:[{id:'space-entry',name:'平台入口',position:[-61.2,0,-70],yaw:Math.PI/2,regionId:'space-dock'},
   ...SPECS.filter(s=>s.mode==='spacecraft').map(s=>({id:`vehicle-${s.id}`,vehicleId:s.id,name:s.name,position:s.spawn,yaw:s.yaw,regionId:'space-dock'})),
   {id:'space-course-entry',name:'通道入口',position:[-76,18,-10],yaw:0,regionId:'space-course'},
   {id:'space-collision-entry',name:'绕障入口',position:[135,80,80],yaw:0,regionId:'space-collision'},
  ],playerSpawn:[-61.2,0,-70]};
}
