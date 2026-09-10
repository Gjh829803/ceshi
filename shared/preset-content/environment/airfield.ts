import type {EnvironmentDefinition} from './types';
import {block} from './modules';

/** 留出完整起落航线；跑道与机库都是同一训练物理世界中的真实几何。 */
export function createAircraftTrainingMap():EnvironmentDefinition {
 const boxes=[block('airfield-ground',[0,-1,0],[4000,2,4000],'#d6dcd5'),block('runway',[0,.01,0],[40,.02,1800],'#727a7e',undefined,false)];
 for(let z=-860;z<=860;z+=40)boxes.push(block(`centerline-${z}`,[0,.025,z],[.5,.01,18],'#f6f6f0',undefined,false));
 for(const x of [-18,18])boxes.push(block(`edge-${x}`,[x,.025,0],[.25,.01,1760],'#f6f6f0',undefined,false));
 for(const z of [-850,850])for(let x=-14;x<=14;x+=4)boxes.push(block(`threshold-${x}-${z}`,[x,.026,z],[2,.01,22],'#fff',undefined,false));
 for(const x of [-110,-50])boxes.push(block(`hangar-side-${x}`,[x,6,-650],[1,12,60]));
 boxes.push(block('hangar-back',[-80,6,-680],[60,12,1]),block('hangar-roof',[-80,12,-650],[61,1,61]));
 return {id:'aircraft-training',name:'飞机 · 起降训练场',description:'1800 米跑道、4 公里飞行区域；起飞、转弯、进近和着陆。',
 bounds:{min:[-2000,-50,-2000],max:[2000,1200,2000]},boxes,water:[],
 regions:[{id:'airfield',name:'飞机起降训练',description:'Shift 加油门，S 拉起，A/D 转弯，Ctrl 收油与地面刹车，T 驾驶舱。',center:[0,0,0],size:[40,1800],color:'#e4a17f',modes:['plane','character']}],
 spawns:[{id:'prepare-airfield',name:'跑道入口',position:[-13,0,-750],yaw:0,regionId:'airfield'},{id:'vehicle-plane',vehicleId:'plane',name:'主跑道 · 动力飞机',position:[-8,0,-750],yaw:0,regionId:'airfield'},
 {id:'vehicle-trainer-plane',vehicleId:'trainer-plane',name:'主跑道 · 教练机',position:[8,0,-750],yaw:0,regionId:'airfield'}],playerSpawn:[-13,0,-750]};
}
