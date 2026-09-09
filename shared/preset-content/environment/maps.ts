import type { EnvironmentBox, EnvironmentDefinition, MapRegion, MapSpawn } from './types';
import { block, indoorModule, ramp } from './modules';
import { createCampusCharacterCourse, createCharacterWorkshop } from '../humanoid/workshop';
import { SPECS } from '../config';
import { createGrandPrix } from './grand-prix';
const characterCourse=createCampusCharacterCourse();
const groundModes=['character','wheeled','bike','slide','hover','mount','carriage'];
const regions:MapRegion[]=[
 {id:'staging',name:'01 / 车辆准备区',description:'上下车、转向与六快捷槽',center:[-12,0,66],size:[130,54],color:'#ddb573',modes:groundModes},
 {id:'indoor',name:'02 / 室内实验楼',description:'门洞 · 立柱 · 低顶 · 楼梯 · 二层 · 车库',center:[-180,0,-20],size:[76,68],color:'#77b9c6',modes:groundModes},
 {id:'grades',name:'03 / 地形测试',description:'5° / 12° / 22° 梯度、横坡与台阶',center:[35,0,170],size:[140,100],color:'#d49d7c',modes:groundModes},
 {id:'water',name:'04 / 水域实验场',description:'浅滩、码头桩、水下顶棚与深水',center:[324,-2,0],size:[308,490],color:'#5cafbb',modes:['character','boat','sub','hover']},
 {id:'airfield',name:'05 / 航空跑道',description:'宽门机库、起飞、空中门框',center:[-285,0,0],size:[46,620],color:'#e4a17f',modes:['plane','glider','hover','dragon']},
 {id:'launch',name:'06 / 滑翔高台',description:'33 米高台、释放与着陆',center:[-130,33,-155],size:[32,41],color:'#b3c8d5',modes:['glider']},
 {id:'six-dof',name:'07 / 六向空间',description:'垂直、横移、俯仰与滚转框架',center:[-84,0,-70],size:[50,65],color:'#b9ace1',modes:['space','hover','dragon']},
 {id:'circuit',name:'08 / 环道与绕桩',description:'高速转向、刹车与低速绕桩',center:[-28,0,73],size:[300,300],color:'#96bfa5',modes:groundModes},
 {id:'creatures',name:'09 / 生物骑乘场',description:'骑马步态 · 马车牵引 · 飞龙起降',center:[60,0,35],size:[90,70],color:'#a6b57f',modes:['character','mount','carriage','dragon']},
 characterCourse.region,
];
const originalSpawns:MapSpawn[]=SPECS.map(spec=>({id:`vehicle-${spec.id}`,vehicleId:spec.id,name:spec.name,position:[...spec.spawn],yaw:spec.yaw,
 regionId:spec.mode==='boat'||spec.mode==='sub'?'water':spec.mode==='plane'?'airfield':spec.mode==='glider'?'launch':spec.mode==='space'?'six-dof':['mount','carriage','dragon'].includes(spec.mode)?'creatures':'staging'}));
function campusBoxes():EnvironmentBox[]{
 const b:EnvironmentBox[]=[block('ground-main',[-165,-2.5,0],[670,5,1000]),block('ground-north',[335,-2.5,372.5],[330,5,255]),block('ground-south',[335,-2.5,-372.5],[330,5,255]),block('ground-east',[489,-2.5,0],[22,5,490]),block('basin-floor',[324,-45,0],[308,2,490],'#607f7d'),...indoorModule(-180,-20)];
 const add=(id:string,x:number,y:number,z:number,w:number,h:number,d:number,color?:string,collision=true)=>b.push(block(id,[x,y,z],[w,h,d],color,undefined,collision));
 add('basin-west-wall',168,-23,0,4,42,490);add('basin-east-wall',479,-23,0,2,42,490);add('basin-north-wall',324,-23,246,310,42,2);add('basin-south-wall',324,-23,-246,310,42,2);
 add('launch-deck',-130,16.5,-155.5,32,33,41);
 b.push(ramp('elevation-ramp',-109,127.5,30,65,22));add('elevation-deck',-94,11,181,60,22,42);
 add('dock',183,-.75,0,48,1.5,10,'#819da5');
 for(let i=0;i<5;i++)add(`dock-pier-${i}`,197,-12,-18-i*14,1.8,24,1.8,'#bcaa88');
 add('dock-secondary',193,-.6,-50,12,1.2,80,'#94a8aa');
 b.push(block('shallow-bank',[192.5,-4-.15*Math.cos(Math.atan2(8,45)),-175],[Math.hypot(45,8),.3,38],'#bdb89c',[0,0,-Math.atan2(8,45)]));
 add('sub-ceiling',284,-12,105,46,2,40,'#779b9e');add('sub-wall-left',261,-20,105,2,16,40);add('sub-wall-right',307,-20,105,2,16,40);
 for(const [i,deg] of [5,12,22].entries()){const x=5+i*22,rise=Math.tan(deg*Math.PI/180)*32;b.push(ramp(`grade-${deg}`,x,162,14,32,rise));add(`grade-${deg}-landing`,x,rise/2,181,14,rise,6,'#91acb4');}
 b.push(block('grade-crossfall',[86,1.25,176],[22,.3,34],'#b1bda9',[0,0,.10]));
 for(let i=0;i<6;i++)add(`grade-step-${i}`,90,(i+1)*.12,211+i*3,18,(i+1)*.24,3,'#b7c6c7');
 // 三辆四轮车出发后直行即可验证交错单轮压坎与整轴减速带。
 for(const [lane,x] of [-24,-10,-38].entries()){const start=lane===2?35:64;
  add('suspension-left-'+lane,x-1.1,.06,start+14,.9,.12,1.1,'#c7a271');
  add('suspension-right-'+lane,x+1.1,.06,start+20,.9,.12,1.1,'#c7a271');
  add('suspension-axle-'+lane,x,.075,start+26,3.2,.15,1.1,'#c7a271');
 }
 add('thin-wall',-64,3.5,-42,.3,7,38,'#d2a482');
 for(let i=0;i<14;i++)add(`slalom-${i}`,-43+(i%2)*14,.65,108+i*5,.9,1.3,.9,'#e6a170');
 // Hangar opens toward the runway; aircraft spawn remains unobstructed.
 add('hangar-left',-326,10,-330,2,20,70,'#8ca5b0');add('hangar-right',-244,10,-330,2,20,70,'#8ca5b0');add('hangar-back',-285,10,-365,84,20,2,'#8ca5b0');add('hangar-roof',-285,20,-330,84,1,70,'#8198a3');
 for(let i=0;i<5;i++){const z=-80+i*80,y=20+i*13;for(const side of [-1,1])add(`flight-frame-${i}-${side}`,-285+side*20,y,z,1.2,30,1.2,'#e2ac7d');add(`flight-frame-${i}-top`,-285,y+15,z,41,1.2,1.2,'#e2ac7d');}
 for(let i=0;i<3;i++){const y=12+i*16;for(const x of [-105,-63])add(`six-frame-${i}-${x}`,x,y,-91,.8,24,.8,'#b09bd9');add(`six-frame-${i}-top`,-84,y+12,-91,42,.8,.8,'#b09bd9');}
 // Small shelter sits beyond the paddock's east edge; every spawn and the
 // horse/carriage articulation sweep remains in the clear central yard.
 for(const x of [108,116])for(const z of [8,24])add(`stable-post-${x}-${z}`,x,1.7,z,.35,3.4,.35,'#826344');
 add('stable-roof',112,3.55,16,10,.35,19,'#837257');
 add('stable-back',116,1.5,16,.25,3,16,'#b1956b');
 for(const x of [32,46,60,74,88])add(`paddock-marker-${x}`,x,.24,0,.55,.48,.55,'#c7ae76');
  b.push(...characterCourse.boxes);
  for(const box of b)if(/^(slalom-|paddock-marker-|suspension-)/.test(box.id))box.rigidGroup={id:box.id,massKg:box.id.startsWith('suspension-')?25:8};
 return b;
}
const campus:EnvironmentDefinition={id:'campus',name:'VECTOR 综合训练园区',description:'连续驾驶、室内、多层地形、水域与飞行测试场',bounds:{min:[-500,-50,-500],max:[500,300,500]},boxes:campusBoxes(),water:[{id:'basin',min:[170,-44,-245],max:[478,-2,245],surface:-2}],regions,playerSpawn:[-24,0,55],spawns:[...originalSpawns,...[
 ['staging',-24,0,55],['indoor',-180,0,-51],['grades',5,0,139],['water',210,-2,-95],['airfield',-285,0,-250],['launch',-130,33,-166],['six-dof',-84,1,-70],['circuit',-28,0,220],
 ['creatures',60,0,10],
].map(([id,x,y,z])=>({id:`prepare-${id}`,name:regions.find(r=>r.id===id)!.name,position:[Number(x),Number(y),Number(z)] as const,yaw:0,regionId:String(id)})),characterCourse.spawn],interactions:characterCourse.interactions,climbSurfaces:characterCourse.climbSurfaces,characterTrials:characterCourse.characterTrials};
const lab:EnvironmentDefinition={id:'indoor-lab',name:'室内专项实验室',description:'双层实验楼与开放车库',characterCameraDistanceMeters:5.6,bounds:{min:[-65,-10,-75],max:[65,40,75]},boxes:[block('lab-ground',[0,-2.5,0],[130,5,150]),...indoorModule(0,0)],water:[],regions:[{...regions[1]!,center:[0,0,0]}],spawns:[{id:'prepare-indoor',name:'实验楼入口',position:[0,0,-31],yaw:0,regionId:'indoor'}],playerSpawn:[0,0,-31]};
export const MAPS:readonly EnvironmentDefinition[]=[campus,lab,createCharacterWorkshop(),createGrandPrix()];
export function getMap(id:string):EnvironmentDefinition{const map=MAPS.find(m=>m.id===id);if(!map)throw new Error(`Unknown map: ${id}`);return map;}
