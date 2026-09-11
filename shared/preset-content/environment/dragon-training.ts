import type {EnvironmentDefinition} from './types';
import {block} from './modules';

/** 飞龙、人物与飞机共用同一物理世界。包含空中通行与平整地面起降空间。 */
export function createDragonTrainingMap():EnvironmentDefinition{
  const boxes=[block('dragon-ground',[0,-1,0],[1600,2,1600],'#d8ded7'),
    block('dragon-wide-wall',[0,45,250],[160,90,2],'#d4caba'),
    block('dragon-thin-wall',[110,40,70],[.4,80,100],'#c2cdd0')];
  for(const z of [80,150])for(const x of [-38,38])boxes.push(block(`flight-gate-${x}-${z}`,[x,30,z],[5,60,5],'#d0c5b3'));
  boxes.push(block('dragon-gate-top',[0,66,150],[81,3,5],'#d0c5b3'));
  boxes.push(block('dragon-runway',[-220,.01,0],[36,.02,1000],'#7c8588',undefined,false));
  return {id:'flying-creature-training',name:'飞龙 · 空中训练场',description:'悬停、转向、俯冲、喷火、着陆与上下龙训练。',
    bounds:{min:[-800,-50,-800],max:[800,600,800]},boxes,water:[],playerSpawn:[-25,0,-35],
    regions:[{id:'dragon-air',name:'飞龙空中训练',description:'松开 WASD 悬停 · Ctrl 刹停 · Shift 加速 · E 喷火 · Q 闪避 · F 着陆/上下龙 · Space 起飞/滑翔 · T 换视角',center:[0,40,90],size:[240,400],color:'#90b7a0',modes:['dragon']},
      {id:'dragon-staging',name:'人物与飞机准备区',description:'同一世界中的人物与飞机驾驶。',center:[-220,0,0],size:[80,1000],color:'#b0bcc1',modes:['character','plane']}],
    spawns:[{id:'vehicle-dragon',vehicleId:'dragon',name:'空中骑乘起点',position:[0,40,0],yaw:0,regionId:'dragon-air'},
      {id:'prepare-dragon-staging',name:'跑道入口',position:[-180,0,-350],yaw:0,regionId:'dragon-staging'},
      {id:'vehicle-plane',vehicleId:'plane',name:'动力飞机',position:[-220,0,-350],yaw:0,regionId:'dragon-staging'},
      {id:'vehicle-trainer-plane',vehicleId:'trainer-plane',name:'教练飞机',position:[-220,0,-400],yaw:0,regionId:'dragon-staging'}]};
}
