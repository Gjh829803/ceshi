import { MAPS } from '@worldkit/preset-content/environment/maps';
import { emptyHumanoidInput, type EpisodeStart, type WorldInput } from '@worldkit/three';

export interface CameraRoute {
  readonly id: string;
  readonly scene: string;
  readonly start: EpisodeStart;
  readonly segments: readonly { readonly ticks: number; readonly input: WorldInput }[];
  readonly exitVehicle?: boolean;
}
const map=(id:string)=>MAPS.find(value=>value.id===id)!;
export const CAMERA_ROUTES: readonly CameraRoute[] = [
  {id:'campus-walk-orbit',scene:'campus',start:{positionWorldMetersXYZ:map('campus').playerSpawn,facingYawRadians:0},segments:[
    {ticks:180,input:{moveZRatio:1}}, {ticks:120,input:{cameraYawRatio:.6}},
    {ticks:120,input:{moveZRatio:-1,cameraYawRatio:-.3}}, {ticks:60,input:{}},
  ]},
  {id:'indoor-wall-orbit',scene:'indoor-lab',start:{positionWorldMetersXYZ:[-20.9,.03,0],facingYawRadians:0},segments:[
    {ticks:180,input:{cameraYawRatio:1}}, {ticks:180,input:{cameraYawRatio:-1}},
    {ticks:120,input:{moveZRatio:1,cameraPitchRatio:.2}},
  ]},
  {id:'grand-prix-drive-reverse',scene:'grand-prix',start:{positionWorldMetersXYZ:map('grand-prix').spawns.find(value=>value.id==='gp-straight-start')!.position,facingYawRadians:0,humanoid:{vehicleInstanceId:'supercar',mounted:true}},segments:[
    {ticks:180,input:{humanoid:{...emptyHumanoidInput(),forward:1}}}, {ticks:90,input:{humanoid:{...emptyHumanoidInput(),forward:1,steer:.6},cameraYawRatio:.4}},
    {ticks:90,input:{humanoid:{...emptyHumanoidInput(),brake:true}}}, {ticks:180,input:{humanoid:{...emptyHumanoidInput(),forward:-1}}},
    {ticks:90,input:{humanoid:{...emptyHumanoidInput(),brake:true}}},
  ],exitVehicle:true},
  {id:'grand-prix-inverted-exit',scene:'grand-prix',start:{positionWorldMetersXYZ:[-620,3,-95],facingYawRadians:0,humanoid:{vehicleInstanceId:'supercar',mounted:true,rollRadians:Math.PI}},segments:[
    {ticks:180,input:{}},
  ],exitVehicle:true},
];
