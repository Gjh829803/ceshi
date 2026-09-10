import {beforeAll,it,expect} from 'vitest';
import {Vector3} from 'three';
import {EnvironmentQueries,initEnvironmentQueries,vehicleBody} from './environment/queries';
import {createVehicle,stepVehicle as prepareVehicle,emptyInput,type Input} from './simulation';
import {RAFT_SPEC} from '../../../../shared/preset-content/raft';
import {buildRaftModel} from '../../../../shared/preset-content/raft-model';
import {sampleRaftVisual} from './raft';
import {CANOE_WATER} from './kayak';
beforeAll(initEnvironmentQueries);
function fixture(water=false,slope=false,wall=false){
 const angle=Math.atan(.2);
 const q=new EnvironmentQueries({id:'raft-course',name:'Raft',description:'',bounds:{min:[-100,-20,-100],max:[100,50,100]},boxes:[{id:'floor',position:[0,water||slope?-11:-1,0],size:[200,2,200]},...(slope?[{id:'ramp',position:[0,-.2*Math.cos(angle),0] as const,size:[16,.4,40/Math.cos(angle)] as const,rotation:[angle,0,0] as const}]:[]),...(wall?[{id:'wall',position:[0,2,10] as const,size:[100,10,.2] as const}]:[])],water:water?[{id:'water',min:[-99,-10,slope?0:-99],max:[99,0,99],surface:0}]:[],regions:[],spawns:[],playerSpawn:[-10,0,0]});
 const v=createVehicle({...RAFT_SPEC,spawn:slope?[0,3.95,-15]:[0,water?.15:.365,0],yaw:0});let time=0;
 const run=(seconds:number,input:Partial<Input>={})=>{for(let n=0;n<Math.round(seconds*60);n++){time+=1/60;stepVehicle(v,{...emptyInput(),...input},1/60,time,q);}};return {q,v,run};
}
it('rows, reverses, brakes and turns on water, with faster cadence on Shift',()=>{
 const {q,v,run}=fixture(true);try{run(7);expect(v.motion.raft!.surface).toBe('water');expect(v.motion.kayak!.buoyancy).toBeCloseTo(9.81,1);run(5,{forward:1});expect(v.speed).toBeGreaterThan(1);const phase=v.motion.kayak!.phase;run(1,{forward:1,boost:true});expect(v.motion.kayak!.phase-phase).toBeGreaterThan(1);
 run(10,{forward:-1});expect(v.velocity.dot(new Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw)))).toBeLessThan(-.3);run(4,{brake:true});expect(v.speed).toBeLessThan(.1);const yaw=v.yaw;
 // Include recovery and four complete sweeps after switching out of reverse.
 run(4*CANOE_WATER.strokePeriod,{steer:1});expect(v.yaw).toBeLessThan(yaw-.2);
 }finally{q.dispose();}
});
it('does not motor across flat ground; slides down a real slope without input and floats after entering water',()=>{
 const flat=fixture();try{flat.run(5,{forward:1,boost:true,steer:1});expect(flat.v.position.z).toBeCloseTo(0,2);expect(flat.v.speed).toBeLessThan(.01);}finally{flat.q.dispose();}
 const {q,v,run}=fixture(true,true);try{run(10);console.log('RAFT_SHORE',v.position.toArray(),v.motion.raft,v.motion.kayak);expect(v.position.z).toBeGreaterThan(5);expect(v.motion.raft!.surface).toBe('water');expect(Math.abs(v.position.y)).toBeLessThan(.4);expect(q.overlaps(v.position,vehicleBody(v.spec),v.rotation)).toBe(false);}finally{q.dispose();}
});
it('rebounds with lost energy on landing, compresses only its tubes and settles',()=>{
 const {q,v,run}=fixture();try{v.position.y=4;v.grounded=false;let bounce=0,compression=0;
 for(let i=0;i<150;i++){run(1/60);bounce=Math.max(bounce,v.velocity.y);compression=Math.max(compression,v.motion.raft!.compression);}
 console.log('RAFT_DROP',{bounce,compression,impacts:v.motion.raft!.impacts});expect(bounce).toBeGreaterThan(.5);expect(bounce).toBeLessThan(3.3);expect(compression).toBeGreaterThan(.015);
 run(5);expect(v.velocity.length()).toBeLessThan(.1);expect(v.motion.raft!.compression).toBeLessThan(.005);expect(q.overlaps(v.position,vehicleBody(v.spec),v.rotation)).toBe(false);
 const model=buildRaftModel(),seat=model.getObjectByName('seat.driver')!.position.clone();sampleRaftVisual(model,{...v.motion.raft!,compression:.1});expect(model.getObjectByName('raft.tubes')!.scale.y).toBeLessThan(1);expect(model.getObjectByName('seat.driver')!.position).toEqual(seat);
 }finally{q.dispose();}
});
it('rebounds from a wall without crossing it',()=>{const {q,v,run}=fixture(false,false,true);try{v.velocity.z=8;run(1);expect(v.position.z).toBeLessThan(8);run(1);expect(v.motion.raft!.impacts).toBeGreaterThan(0);expect(v.velocity.z).toBeLessThan(0);expect(q.overlaps(v.position,vehicleBody(v.spec),v.rotation)).toBe(false);}finally{q.dispose();}});

function stepVehicle(...args:Parameters<typeof prepareVehicle>){prepareVehicle(...args);if(args[0].motion.wheelPhysics||args[0].motion.body)args[4].stepPhysics(args[2]);}
