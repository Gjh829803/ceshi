import {buildVehicle} from '@worldkit/preset-content/models';
import {PresentationState} from './presentation';
import {isCameraVisualEffect} from './camera-visual-effects';
import {createWorld} from '../world';
import {beforeAll,it,expect,vi} from 'vitest';
vi.mock('@worldkit/preset-content/assets/resources',()=>({definitions:{},resolvePresetResource:()=>{throw new Error('UNEXPECTED_CREATURE_RESOURCE');}}));
import {Group,PerspectiveCamera,Vector3,Quaternion,Mesh,MeshStandardMaterial} from 'three';
import {createHumanoidCameraDocument} from '../config/camera/index';
import {EnvironmentQueries,initEnvironmentQueries} from './environment/queries';
import {Simulation,createVehicle,emptyInput,stepVehicle,type Input} from './simulation';
import {SPECS} from '@worldkit/preset-content/config';
import {getMap} from '@worldkit/preset-content/environment/maps';
import {readControls} from './input';
beforeAll(initEnvironmentQueries);
function fixture(){const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.id==='plane')!,spawn:[0,0,0]});const step=(input:Partial<Input>,n:number)=>{for(let i=0;i<n;i++){stepVehicle(v,{...emptyInput(),...input},1/60,i/60,q);q.stepPhysics(1/60);}};return {q,v,step};}
it.each(['helicopter','multirotor','tiltrotor'] as const)('%s Z/X produces opposite lateral travel and levels after release',subtype=>{
 for(const [key,sign] of [['KeyZ',-1],['KeyX',1]] as const){
  const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.aircraftSubtype===subtype)!,spawn:[0,100,0],yaw:0});
  const step=(keys:string[],n:number)=>{const input=readControls(new Set(keys),true,false,{},undefined,v.spec);for(let k=0;k<n;k++){stepVehicle(v,input,1/60,0,q);q.stepPhysics(1/60);}};
  try{v.throttle=.5;step([key],240);expect(v.roll*sign).toBeGreaterThan(.1);expect(v.position.x*sign).toBeLessThan(-1);
   step([],360);expect(Math.abs(v.roll)).toBeLessThan(.1);expect(v.throttle).toBe(.5);
  }finally{q.dispose();}
 }
});
it.each(['ControlLeft','KeyS'])('tiltrotor keyboard accelerates through transition, uses %s to return to rotor flight and descends without independent pitch',slowKey=>{
 const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.aircraftSubtype==='tiltrotor')!,spawn:[0,150,0],yaw:0});
 const step=(keys:string[],n:number)=>{const input=readControls(new Set(keys),true,false,{},undefined,v.spec);expect(input.pitch).toBe(0);for(let k=0;k<n;k++){stepVehicle(v,input,1/60,0,q);q.stepPhysics(1/60);}};
 try{v.throttle=.5;step(['KeyW'],1800);expect(v.motion.aircraft!.tilt).toBeGreaterThan(.65);expect(v.grounded).toBe(false);
  const speed=v.speed;step([slowKey],1200);expect(v.speed).toBeLessThan(speed*(slowKey==='ControlLeft'?.5:1));expect(v.motion.aircraft!.tilt).toBeLessThan(.25);expect(v.grounded).toBe(false);
  if(slowKey==='KeyS')expect(v.velocity.dot(new Vector3(0,0,1).applyQuaternion(v.rotation))).toBeLessThan(-1);
  const height=v.position.y;step(['KeyE'],60);step([],240);expect(v.position.y).toBeLessThan(height-1);
 }finally{q.dispose();}
});
it('glider takes off with W alone, trims speed with W/S and lands without manual pitch or roll',()=>{
 const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.id==='glider')!,spawn:[0,0,0],yaw:0});
 const step=(keys:string[],n:number)=>{const input=readControls(new Set(keys),true,false,{},undefined,v.spec);expect(input.pitch).toBe(0);expect(input.roll).toBe(0);for(let k=0;k<n;k++){stepVehicle(v,input,1/60,0,q);q.stepPhysics(1/60);}};
 try{step(['KeyW'],480);expect(v.position.y,'keyboard tow launch').toBeGreaterThan(1);expect(v.grounded).toBe(false);
  const tow=v.motion.aircraft!.towSeconds;step(['KeyW','KeyD'],120);expect(v.roll).toBeGreaterThan(.1);expect(v.motion.aircraft!.towSeconds).toBe(tow);expect(v.throttle).toBe(0);
  step(['KeyS'],120);step(['KeyC','ControlLeft','Space'],2400);expect(v.grounded).toBe(true);expect(v.speed).toBeLessThan(1);
 }finally{q.dispose();}
});
it('separates throttle from pitch and gives Ctrl priority over held W/Shift',()=>{
 const f=fixture();try{
  f.step({forward:1},90);expect(f.v.throttle).toBeGreaterThan(.4);
  const throttle=f.v.throttle;f.step({pitch:-1},30);expect(f.v.throttle).toBe(throttle);
  f.step({forward:1,boost:true,slow:true},90);expect(f.v.throttle).toBeCloseTo(0,12);
 }finally{f.q.dispose();}
});
it('glider braking cancels W tow and a released airborne tow cannot restart',()=>{
 const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.id==='glider')!,spawn:[0,0,0],yaw:0});
 const step=(keys:string[],ticks:number)=>{const input=readControls(new Set(keys),true,false,{},undefined,v.spec);for(let n=0;n<ticks;n++){stepVehicle(v,input,1/60,0,q);q.stepPhysics(1/60);}};
 try{
  for(const brake of ['Space','ControlLeft','KeyS']){step(['KeyW',brake],60);expect(v.motion.aircraft!.towSeconds).toBe(0);expect(v.speed).toBeLessThan(.2);}
  step(['KeyW'],60);expect(v.motion.aircraft!.towSeconds).toBeGreaterThan(0);
  v.position.y=10;v.grounded=false;v.launched=true;step([],1);const tow=v.motion.aircraft!.towSeconds;
  expect(v.motion.aircraft!.towReleased).toBe(true);step(['KeyW'],60);expect(v.motion.aircraft!.towSeconds).toBe(tow);
 }finally{q.dispose();}
});
it('rotorcraft keeps collective independent from horizontal speed, pitch and Ctrl',()=>{
 const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.aircraftSubtype==='helicopter')!,spawn:[0,100,0]});
 const step=(input:Partial<Input>,n:number)=>{for(let k=0;k<n;k++){stepVehicle(v,{...emptyInput(),...input},1/60,0,q);q.stepPhysics(1/60);}};
 try{
  v.throttle=.5;step({forward:-1},240);expect(v.velocity.z).toBeLessThan(-2);expect(v.throttle).toBe(.5);
  const speed=Math.abs(v.velocity.z);step({slow:true,forward:-1},240);expect(Math.abs(v.velocity.z)).toBeLessThan(speed*.6);expect(v.throttle).toBe(.5);
  step({pitch:-1},30);expect(v.throttle).toBe(.5);
  step({lift:1},30);expect(v.throttle).toBeGreaterThan(.5);step({lift:-1},60);expect(v.throttle).toBeLessThan(.5);
 }finally{q.dispose();}
});
it('rests on three spring contacts and brakes after landing',()=>{const {q,v,step}=fixture();try{step({},300);expect(v.grounded).toBe(true);expect(v.motion.aircraft!.wheels.filter(w=>w.load>100).length).toBe(3);expect(v.velocity.length()).toBeLessThan(.1);v.position.y=2;v.velocity.set(0,-2,12);step({slow:true},1200);expect(v.grounded).toBe(true);expect(v.velocity.length()).toBeLessThan(.3);expect(v.position.y).toBeGreaterThan(-.15);}finally{q.dispose();}});
it('takes off and turns through torque without teleporting orientation',()=>{const {q,v,step}=fixture();try{step({boost:true},300);expect(v.speed).toBeGreaterThan(22);const before=v.rotation.clone();step({pitch:-.5},1);expect(before.angleTo(v.rotation)).toBeLessThan(.03);step({pitch:-.5},360);expect(v.grounded).toBe(false);expect(v.position.y).toBeGreaterThan(5);step({steer:1},180);expect(v.roll).toBeGreaterThan(.15);step({},180);expect(Math.abs(v.roll)).toBeLessThan(.15);}finally{q.dispose();}});
it('keeps velocity independent from heading and resets angular state',()=>{const {q,v,step}=fixture();try{v.position.y=100;v.velocity.set(8,0,35);step({steer:1},1);expect(v.velocity.x).toBeGreaterThan(7);expect(createVehicle(v.spec).motion.aircraft!.angularVelocity.length()).toBe(0);}finally{q.dispose();}});
it('collides with a wall at cruise speed',()=>{const initial=fixture(),v=initial.v;initial.q.dispose();const q=new EnvironmentQueries({...getMap('aircraft-training'),boxes:[{id:'wall',position:[0,20,15],size:[100,40,1]}]});try{v.position.set(0,10,0);v.velocity.set(0,0,55);for(let i=0;i<60;i++){stepVehicle(v,emptyInput(),1/60,0,q);q.stepPhysics(1/60);}expect(v.position.z).toBeLessThan(15);}finally{q.dispose();}});

it('responds to asymmetric wheel support rather than flattening the whole aircraft',()=>{const f=fixture();f.q.dispose();const q=new EnvironmentQueries({...getMap('aircraft-training'),boxes:[...getMap('aircraft-training').boxes,{id:'bump',position:[1.1,.05,0],size:[.7,.1,.8]}]});try{for(let i=0;i<300;i++){stepVehicle(f.v,{...emptyInput(),brake:true},1/60,0,q);q.stepPhysics(1/60);}expect(Math.abs(f.v.roll)).toBeGreaterThan(.015);expect(Math.abs(f.v.roll)).toBeLessThan(.15);expect(f.v.motion.aircraft!.wheels.filter(w=>w.load>0).length).toBe(3);}finally{q.dispose();}});
it('limits suspension travel in a hard vertical landing',()=>{const {q,v,step}=fixture();try{v.position.y=1;v.velocity.y=-7;step({brake:true},120);expect(v.motion.aircraft!.hardLanding).toBe(true);expect(v.position.y).toBeGreaterThan(-.2);for(const wheel of v.motion.aircraft!.wheels)expect(Math.abs(wheel.compression)).toBeLessThanOrEqual(.18);}finally{q.dispose();}});
it('is repeatable at fixed input and close between 60 and 120 Hz',()=>{const run=(h:number)=>{const {q,v}=fixture();try{v.position.y=100;v.velocity.z=35;v.grounded=false;for(let n=0;n<6/h;n++){stepVehicle(v,{...emptyInput(),steer:.3},h,0,q);q.stepPhysics(h);}return v.position.clone();}finally{q.dispose();}};const a=run(1/60),b=run(1/60),c=run(1/120);expect(a.distanceTo(b)).toBe(0);expect(a.distanceTo(c)).toBeLessThan(.1);});
it('turns both ways within eight seconds without large altitude loss and responds to reversal',()=>{for(const direction of [-1,1])for(const speed of [35,45,58]){const {q,v,step}=fixture();try{v.position.set(0,200,0);v.velocity.set(0,0,speed);v.grounded=false;for(let n=0;n<300;n++)step({boost:v.speed<speed,slow:v.speed>speed+1},1);const start=v.position.clone(),heading=Math.atan2(v.velocity.x,v.velocity.z);let seconds=0;for(;seconds<20;seconds+=1/60){step({steer:direction,boost:v.speed<speed,slow:v.speed>speed+1},1);if(Math.abs(Math.atan2(Math.sin(Math.atan2(v.velocity.x,v.velocity.z)-heading),Math.cos(Math.atan2(v.velocity.x,v.velocity.z)-heading)))>=Math.PI/2)break;}expect(seconds).toBeLessThan(8);expect(Math.abs(v.position.y-start.y)).toBeLessThan(8);expect(v.roll*direction).toBeGreaterThan(.5);step({steer:-direction},120);expect(v.roll*direction).toBeLessThan(-.25);step({},180);expect(Math.abs(v.roll)).toBeLessThan(.12); }finally{q.dispose();}}});

for(const subtype of ['helicopter','multirotor','tiltrotor'] as const)it(`${subtype} lifts vertically, turns in hover, moves forward and lands`,()=>{
 const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.aircraftSubtype===subtype)!,spawn:[0,0,0]});
 const step=(input:Partial<Input>,n:number)=>{for(let i=0;i<n;i++){stepVehicle(v,{...emptyInput(),...input},1/60,0,q);q.stepPhysics(1/60);}};
 try{
  v.throttle=.7;step({},480);expect(v.position.y,subtype+' lift').toBeGreaterThan(5);expect(Math.hypot(v.position.x,v.position.z)).toBeLessThan(5);
  v.throttle=.5;step({},240);const altitude=v.position.y,yaw=v.yaw;
  step({steer:1},180);expect(Math.abs(v.yaw-yaw),subtype+' yaw').toBeGreaterThan(.3);expect(Math.abs(v.position.y-altitude)).toBeLessThan(3);
  step({steer:-1},180);step({},120);expect(Math.abs(v.roll)).toBeLessThan(.15);
  step({forward:1},360);expect(v.speed,subtype+' forward').toBeGreaterThan(3);
  expect(v.motion.aircraft!.rotorThrusts.every(Number.isFinite)).toBe(true);
  // 独立复位到水平进近状态，验证垂直着陆、关机和轮子承重。
  v.position.set(0,6,0);v.velocity.set(0,0,0);v.rotation.identity();v.pitch=v.roll=v.yaw=0;v.motion.aircraft!.angularVelocity.set(0,0,0);v.motion.aircraft!.tilt=0;v.throttle=.25;
  step({},600);v.throttle=0;step({brake:true},240);
  expect(v.grounded,subtype+' landed').toBe(true);expect(v.position.y).toBeGreaterThan(-.2);expect(v.velocity.length()).toBeLessThan(.3);
 }finally{q.dispose();}
});
it('pusher retains fixed-wing takeoff and tiltrotor transitions with airspeed',()=>{
 for(const subtype of ['pusher','tiltrotor'] as const){const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.aircraftSubtype===subtype)!,spawn:[0,0,0]});
 try{for(let i=0;i<1800;i++){stepVehicle(v,{...emptyInput(),forward:subtype==='pusher'&&i<180?1:subtype==='tiltrotor'&&i>400?1:0,lift:subtype==='tiltrotor'&&i<180?1:0,pitch:subtype==='pusher'&&i>300?-.3:0},1/60,0,q);q.stepPhysics(1/60);}
 expect(v.position.y,subtype).toBeGreaterThan(5);if(subtype==='tiltrotor')expect(v.motion.aircraft!.tilt,'transition').toBeGreaterThan(.65);
 }finally{q.dispose();}}
});

it('rejects invalid subtype bindings and leaves unpowered multirotor motors off under steering input',()=>{
 expect(()=>createVehicle({...SPECS[0]!,aircraftSubtype:'helicopter'})).toThrow('VEHICLE_AIRCRAFT_SUBTYPE_INVALID');
 const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.aircraftSubtype==='multirotor')!,spawn:[0,0,0]});
 try{for(let n=0;n<120;n++){stepVehicle(v,{...emptyInput(),steer:1,forward:1,roll:1},1/60,0,q);q.stepPhysics(1/60);}
 expect(v.motion.aircraft!.motorThrusts).toEqual([0,0,0,0]);expect(v.grounded).toBe(true);
 const reset=createVehicle(v.spec);expect(reset.motion.aircraft!.subtype).toBe('multirotor');expect(reset.motion.aircraft!.rotorPhases).toEqual([]);
 }finally{q.dispose();}
});

for(const kind of ['glider','paraglider','wingsuit','balloon'] as const)it(`${kind} uses soaring or thermal forces with finite state`,()=>{
 const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.aircraftSubtype===kind)!,spawn:[0,0,0]});
 const step=(input:Partial<Input>,n:number)=>{for(let j=0;j<n;j++){stepVehicle(v,{...emptyInput(),...input},1/60,0,q);q.stepPhysics(1/60);}};
 try{
 if(kind==='balloon'){
  step({},180);expect(v.grounded).toBe(true);step({lift:1},720);expect(v.position.y,'balloon rise').toBeGreaterThan(3);const temp=v.motion.aircraft!.temperatureKelvin;
  step({lift:-1},1800);expect(v.motion.aircraft!.temperatureKelvin).toBeLessThan(temp);expect(v.grounded,'balloon land').toBe(true);expect(v.position.x).toBeGreaterThan(1);
 }else if(kind==='glider'){
  step({boost:true,pitch:-.5},480);expect(v.position.y,'glider tow launch').toBeGreaterThan(1);const power=v.motion.aircraft!.towSeconds;step({},180);expect(v.motion.aircraft!.towSeconds).toBe(power);expect(v.throttle).toBe(0);
 }else{
  v.position.set(0,200,0);v.velocity.set(0,0,kind==='wingsuit'?20:10);v.grounded=false;step({},180);expect(v.position.y).toBeLessThan(200);expect(v.speed).toBeGreaterThan(3);
  const yaw=v.yaw;step({steer:1},180);expect(Math.abs(v.yaw-yaw)).toBeGreaterThan(.1);
  if(kind==='wingsuit'){step({brake:true},1);expect(v.motion.aircraft!.canopy).toBeLessThan(1);step({},180);expect(v.motion.aircraft!.canopy).toBe(1);expect(v.speed).toBeLessThan(20);}
 }
 expect([...v.position.toArray(),...v.velocity.toArray(),...v.rotation.toArray()].every(Number.isFinite)).toBe(true);
 }finally{q.dispose();}
});

for(const kind of ['paraglider','wingsuit'] as const)it(`${kind} launches from the actual platform and lands under canopy`,()=>{
 const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.aircraftSubtype===kind)!,spawn:[130,120,-735]});
 const step=(input:Partial<Input>,n:number)=>{for(let j=0;j<n;j++){stepVehicle(v,{...emptyInput(),...input},1/60,0,q);q.stepPhysics(1/60);}};
 try{
  step({boost:true},240);expect(v.position.z).toBeGreaterThan(-730);expect(v.grounded).toBe(false);expect(Math.abs(v.roll)).toBeLessThan(.3);
  if(kind==='wingsuit')step({brake:true},180);
  step({},1200);expect(v.velocity.y).toBeGreaterThan(-9);expect(v.motion.aircraft!.angularVelocity.length()).toBeLessThan(2);
  step({brake:true},6000);expect(v.grounded).toBe(true);expect(v.position.y).toBeGreaterThan(-.2);expect(v.speed).toBeLessThan(2);
 }finally{q.dispose();}
});

for(const mapId of ['campus','aircraft-training'])it(`${mapId} walks from ground through every launch ramp to the equipment`,async()=>{
 const map=getMap(mapId),cx=mapId==='campus'?-130:140,back=mapId==='campus'?-176:-752,cz=back-15;
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:new Group()},vehicles:SPECS.filter(s=>['wingsuit','paraglider'].includes(s.id)).map(spec=>({instanceId:spec.id,assetId:spec.id,spec,object:new Group()}))}});
 try{
  const rt=world.humanoid!,sim=rt.simulation;expect(sim.controlledActor.prepareCharacter(new Vector3(cx-2,.025,cz-10),0)).toBe(true);
  const walk=(x:number,y:number,z:number)=>{for(let n=0;n<1800;n++){const p=sim.controlledActor.player.position;if(Math.hypot(p.x-x,p.z-z)<.22&&Math.abs(p.y-y)<.4)return;const d=new Vector3(x-p.x,0,z-p.z).normalize().applyAxisAngle(new Vector3(0,1,0),-Math.atan2(rt.controlForwardWorldXYZ()[0],rt.controlForwardWorldXYZ()[2]));world.step({humanoid:{...emptyInput(),forward:d.z,steer:-d.x}},1);}throw new Error('Walk blocked '+JSON.stringify({target:[x,y,z],actual:sim.controlledActor.player.position.toArray()}));};
  for(let n=0;n<24;n++){const sign=n%2===0?1:-1,x=cx+(n%2===0?-2:2);walk(x,n*5,cz-sign*7.5);walk(x,(n+1)*5,cz+sign*7.5);if(n<23)walk(cx+(n%2===0?2:-2),(n+1)*5,cz+sign*7.5);}
  walk(cx-2,120,cz-7.5);walk(cx-2,120,back+3);
  expect(sim.controlledActor.player.position.y).toBeGreaterThan(119.5);for(const v of sim.vehicles)expect(v.position.y,v.spec.id).toBeGreaterThan(119);
  const gear=sim.vehicles[0]!;walk(gear.position.x-1.6,120,gear.position.z);expect(rt.enter(gear.spec.id)).toBe(true);
 }finally{world.dispose();}
},30000);

for(const mapId of ['campus','aircraft-training'])it(`${mapId} gives the wingsuit a usable run-up and initial glide`,()=>{
 const map=getMap(mapId),spawn=map.spawns.find(s=>s.vehicleId==='wingsuit')!,q=new EnvironmentQueries(map);
 const v=createVehicle({...SPECS.find(s=>s.id==='wingsuit')!,spawn:[...spawn.position],yaw:spawn.yaw});
 const step=(boost:boolean)=>{stepVehicle(v,{...emptyInput(),boost},1/60,0,q);q.stepPhysics(1/60);};
 try{
  let left=false;for(let n=0;n<480;n++){step(true);if(!v.grounded){left=true;break;}}
  expect(left).toBe(true);expect(v.motion.aircraft!.airspeedMetersPerSecond).toBeGreaterThan(10);
  const tow=v.motion.aircraft!.towSeconds;for(let n=0;n<300;n++)step(false);
  expect(v.position.y).toBeGreaterThan(85);expect(v.velocity.y).toBeGreaterThan(-12);
  expect(v.motion.aircraft!.towSeconds).toBe(tow);expect(v.throttle).toBe(0);
 }finally{q.dispose();}
});

// 可穿戴小类回归：按键时长不能改变展开速度；着陆后必须收伞并稳定。
it('wearable canopy duration is identical for a tap and a held key',()=>{
 const runs=[];
 for(const held of [false,true]){
  const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.id==='wingsuit')!,spawn:[0,200,0]});
  v.velocity.set(0,0,20);v.grounded=false;
  try{for(let n=0;n<120;n++){stepVehicle(v,{...emptyInput(),brake:held||n===0},1/60,0,q);q.stepPhysics(1/60);if(n===59)expect(v.motion.aircraft!.canopy).toBeCloseTo(.5,3);}
   expect(v.motion.aircraft!.canopy).toBeCloseTo(1,4);runs.push(v.motion.aircraft!.canopy);
  }finally{q.dispose();}
 }
 expect(runs[0]).toBe(runs[1]);
});
for(const subtype of ['wingsuit','paraglider'])it(subtype+' settles, stows and has finite wearable telemetry',()=>{
 const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.id===subtype)!,spawn:[0,25,0]});
 v.velocity.set(0,-2,8);v.grounded=false;if(subtype==='wingsuit')v.motion.aircraft!.canopy=1;
 try{for(let n=0;n<3600;n++){stepVehicle(v,{...emptyInput(),brake:true},1/60,0,q);q.stepPhysics(1/60);if(v.motion.aircraft!.wearable!.phase==='stowed')break;}
  expect(v.motion.aircraft!.wearable!.phase).toBe('stowed');expect(v.grounded).toBe(true);expect(v.speed).toBeLessThan(.5);
  expect(v.motion.aircraft!.wearable!.spread).toBe(0);expect(v.motion.aircraft!.wearable!.seated).toBe(0);
  expect(v.motion.aircraft!.wearable!.heightMeters).toBeLessThan(.2);
 }finally{q.dispose();}
});

for(const subtype of ['paraglider','wingsuit'])for(const steer of [-1,1])for(const approach of [false,true])it(`${subtype} landing steering ${steer}, approach=${approach} keeps the rider upright through stowing`,()=>{
 const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.id===subtype)!,spawn:[0,25,0]});
 v.velocity.set(0,-2,8);v.grounded=false;if(subtype==='wingsuit')v.motion.aircraft!.canopy=1;
 let touched=false,groundTicks=0,minUp=1,maxHeight=0;
 try{
  for(let n=0;n<3600;n++){
   stepVehicle(v,{...emptyInput(),steer:touched||approach&&v.position.y<6?steer:0},1/60,0,q);q.stepPhysics(1/60);
   if(v.grounded)touched=true;
   if(touched){groundTicks++;minUp=Math.min(minUp,new Vector3(0,1,0).applyQuaternion(v.rotation).y);maxHeight=Math.max(maxHeight,v.position.y);}
   if(groundTicks>=240)break;
  }
  const diagnostic=JSON.stringify({minUp,maxHeight,position:v.position.toArray(),rotation:v.rotation.toArray(),angular:v.motion.aircraft!.angularVelocity.toArray(),wear:v.motion.aircraft!.wearable});
  expect(touched,diagnostic).toBe(true);expect(minUp,diagnostic).toBeGreaterThan(.85);
  expect(maxHeight,diagnostic).toBeLessThan(.65);expect(v.motion.aircraft!.wearable!.phase,diagnostic).toBe('stowed');
  expect(v.grounded).toBe(true);expect(v.speed).toBeLessThan(.5);
 }finally{q.dispose();}
});

for(const subtype of ['wingsuit','paraglider'])it(subtype+' banks both ways and levels after release',()=>{
 const q=new EnvironmentQueries(getMap('aircraft-training')),v=createVehicle({...SPECS.find(s=>s.id===subtype)!,spawn:[0,300,0]});
 v.velocity.set(0,0,subtype==='wingsuit'?18:9);v.grounded=false;
 const step=(steer:number,n:number)=>{for(let k=0;k<n;k++){stepVehicle(v,{...emptyInput(),steer},1/60,0,q);q.stepPhysics(1/60);}};
 try{step(1,120);expect(v.roll).toBeGreaterThan(.1);step(-1,180);expect(v.roll).toBeLessThan(-.1);step(0,240);expect(Math.abs(v.roll)).toBeLessThan(.15);expect(v.position.y).toBeGreaterThan(150);}finally{q.dispose();}
});

it('wearable landing detects actual support on the campus incline, not only root height',()=>{
 const q=new EnvironmentQueries(getMap('campus')),v=createVehicle({...SPECS.find(s=>s.id==='wingsuit')!,spawn:[-117.27,20,144.16]});
 v.velocity.set(0,-2,0);v.grounded=false;v.motion.aircraft!.canopy=1;
 try{for(let n=0;n<1200;n++){stepVehicle(v,{...emptyInput(),brake:true},1/60,0,q);q.stepPhysics(1/60);if(v.motion.aircraft!.wearable!.phase==='stowed')break;}
  expect(v.motion.aircraft!.wearable!.phase).toBe('stowed');expect(v.grounded).toBe(true);expect(v.speed).toBeLessThan(.5);
 }finally{q.dispose();}
});


it('semantic aircraft actions match real fixed-wing input trajectories and reject conflicting requests',async()=>{
 const {aircraftActionInput,inspectAircraftActions}=await import('./motion-families/aircraft/actions');
 const semantic=fixture(),legacy=fixture();
 try{
  expect(inspectAircraftActions(semantic.v).find(a=>a.action==='increaseThrottle')?.available).toBe(true);
  expect(()=>aircraftActionInput(semantic.v,[{action:'pitchUp'},{action:'pitchDown'}])).toThrow('CONFLICT');
  expect(()=>aircraftActionInput(semantic.v,[{action:'deployCanopy'}])).toThrow('UNSUPPORTED');
  for(let n=0;n<660;n++){
   const actions:import('./motion-families/aircraft/actions').AircraftActionRequest[]=[{action:'increaseThrottle'}];
   if(n>=300)actions.push({action:'pitchUp',strength:.5});
   semantic.step(aircraftActionInput(semantic.v,actions),1);
   legacy.step({forward:1,pitch:n>=300?-.5:0},1);
  }
  expect(semantic.v.position.distanceTo(legacy.v.position)).toBe(0);
  expect(semantic.v.position.y).toBeGreaterThan(5);
 }finally{semantic.q.dispose();legacy.q.dispose();}
});
it('semantic runtime expires, supersedes, cancels on prepare and does not leak a stale release',async()=>{
 const spec=SPECS.find(s=>s.id==='plane')!;
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:getMap('aircraft-training'),character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:spec.id,assetId:spec.id,spec,object:new Group()}]}});
 try{
  const rt=world.humanoid!,sim=rt.simulation;
  sim.controlledActor.vehicleIndex=0;sim.controlledActor.transition=0;
  const old=rt.setAircraftActions([{action:'increaseThrottle'}],.1);
  rt.setAircraftActions([{action:'pitchUp',strength:.5}],.1);old();
  world.step({},1);expect(rt.inspectControls().lastApplied?.input.pitch).toBe(-.5);
  expect(rt.inspectControls().lastApplied?.source).toBe('aircraft-actions');
  world.step({},20);expect(rt.inspectControls().lastApplied?.input.pitch).toBeCloseTo(0);
  rt.setAircraftActions([{action:'increaseThrottle'}],10);
  sim.controlledActor.teleportRevision++;world.step({},1);expect(rt.inspectControls().lastApplied?.input.forward).toBeCloseTo(0);
  rt.setAircraftActions([{action:'increaseThrottle'}],10);
  rt.setInput(emptyInput());world.step({},1);expect(rt.inspectControls().lastApplied?.input.forward).toBeCloseTo(0);
  rt.setInput(undefined);rt.setAircraftActions([{action:'increaseThrottle'}],10);
  sim.controlledActor.vehicleIndex=-1;world.step({},1);expect(rt.inspectControls().lastApplied?.input.forward).toBeCloseTo(0);
 }finally{world.dispose();}
});
it('canopy semantic trigger is distinct from sustained canopy braking',async()=>{
 const {aircraftActionInput,inspectAircraftActions}=await import('./motion-families/aircraft/actions');
 const v=createVehicle(SPECS.find(s=>s.id==='wingsuit')!);
 v.grounded=true;expect(()=>aircraftActionInput(v,[{action:'deployCanopy'}])).toThrow('UNAVAILABLE');
 v.grounded=false;expect(aircraftActionInput(v,[{action:'deployCanopy'}]).brake).toBe(true);
 v.motion.aircraft!.canopy=.5;expect(()=>aircraftActionInput(v,[{action:'canopyBrake'}])).toThrow('UNAVAILABLE');
 v.motion.aircraft!.canopy=1;expect(aircraftActionInput(v,[{action:'canopyBrake'}]).brake).toBe(true);
 expect(inspectAircraftActions(v).find(a=>a.action==='deployCanopy')?.available).toBe(false);
});

it('runtime canopy request emits one trigger while automatic deployment continues',async()=>{
 const spec=SPECS.find(s=>s.id==='wingsuit')!;
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:getMap('aircraft-training'),character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:spec.id,assetId:spec.id,spec,object:new Group()}]}});
 try{
  const rt=world.humanoid!,sim=rt.simulation,v=sim.vehicles[0]!;
  sim.controlledActor.vehicleIndex=0;sim.controlledActor.transition=0;v.position.set(0,200,0);v.velocity.set(0,-3,20);v.grounded=false;v.launched=true;
  rt.setAircraftActions([{action:'deployCanopy'}],3);
  world.step({},1);expect(rt.inspectControls().lastApplied?.input.brake).toBe(true);
  world.step({},1);expect(rt.inspectControls().lastApplied?.input.brake).toBe(false);
  world.step({},150);expect(v.motion.aircraft!.canopy).toBe(1);
 }finally{world.dispose();}
});

for(const mapId of ['campus','aircraft-training'])it(`${mapId} carries a walking rider in the lift and returns empty`,async()=>{
 const map=getMap(mapId),lift=map.lifts![0]!;
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:new Group()},vehicles:[]}});
 try{const rt=world.humanoid!,sim=rt.simulation;
 sim.controlledActor.prepareCharacter(new Vector3(lift.position[0],.025,lift.position[2]-5),0);
 const walk=(z:number)=>{for(let n=0;n<600&&Math.abs(sim.controlledActor.player.position.z-z)>.12;n++){const d=new Vector3(0,0,Math.sign(z-sim.controlledActor.player.position.z)).applyAxisAngle(new Vector3(0,1,0),-Math.atan2(rt.controlForwardWorldXYZ()[0],rt.controlForwardWorldXYZ()[2]));world.step({humanoid:{...emptyInput(),forward:d.z,steer:-d.x}},1);}};
 walk(lift.position[2]);world.step({},1000);expect(sim.controlledActor.player.position.y,JSON.stringify({p:sim.controlledActor.player.position.toArray(),lift:sim.environment.propBoxPose('lift-floor')})).toBeCloseTo(120.1,1);expect(sim.controlledActor.controller.grounded).toBe(true);
 walk(lift.position[2]+6);expect(sim.controlledActor.player.position.y).toBeGreaterThan(119.8);world.step({},1000);
 expect(sim.environment.propBoxPose('lift-floor')!.position.y).toBeCloseTo(-.05,2);expect(sim.controlledActor.player.position.y).toBeGreaterThan(119.8);
 }finally{world.dispose();}
},20000);


it.each([{speed:8,pull:-1},{speed:12,pull:0}])('glider rolls on damped gear without repeated hops: %j',({speed,pull})=>{
 const q=new EnvironmentQueries({...getMap('aircraft-training'),boxes:[{id:'floor',position:[0,-.5,0],size:[400,1,400]}]}),v=createVehicle({...SPECS.find(s=>s.id==='glider')!,spawn:[0,.03,0],yaw:0});
 const step=(input:Partial<Input>={})=>{stepVehicle(v,{...emptyInput(),...input},1/60,0,q);q.stepPhysics(1/60);};
 try{for(let n=0;n<180;n++)step();v.velocity.z=speed;let maxHeight=0,maxImpulse=0;const previous=v.velocity.clone();
  for(let n=0;n<600;n++){step({pitch:pull});maxHeight=Math.max(maxHeight,v.position.y);maxImpulse=Math.max(maxImpulse,v.velocity.distanceTo(previous));previous.copy(v.velocity);expect(v.position.y).toBeGreaterThan(-.03);}
  expect(maxHeight).toBeLessThan(.04);expect(maxImpulse).toBeLessThan(.1);expect(v.motion.aircraft!.wheels.filter(w=>w.contact).length).toBeGreaterThan(1);
 }finally{q.dispose();}
});
it('glider hits an obstacle, settles and can be braked without repeated pitch impulses',()=>{
 const q=new EnvironmentQueries({...getMap('aircraft-training'),boxes:[{id:'floor',position:[0,-.5,0],size:[400,1,400]},{id:'wall',position:[0,3,22],size:[20,6,1]}]}),v=createVehicle({...SPECS.find(s=>s.id==='glider')!,spawn:[0,.03,0],yaw:0});
 const step=(input:Partial<Input>={})=>{stepVehicle(v,{...emptyInput(),...input},1/60,0,q);q.stepPhysics(1/60);};
 try{for(let n=0;n<180;n++)step();v.velocity.z=8;for(let n=0;n<600;n++)step({pitch:-1});
  expect(v.position.z).toBeLessThan(19);expect(v.position.z).toBeGreaterThan(17);const settled=v.position.clone();
  for(let n=0;n<180;n++){step({pitch:-1,brake:true});expect(v.motion.aircraft!.angularVelocity.length()).toBeLessThan(.03);expect(v.position.distanceTo(settled)).toBeLessThan(.03);}
 }finally{q.dispose();}
});
it.each(['plane','trainer-plane'])('%s returns directly to an upright third-person view from an inverted cockpit',async id=>{
 const spec={...SPECS.find(s=>s.id===id)!,spawn:[0,40,0] as [number,number,number],yaw:0};
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:{...getMap('aircraft-training'),boxes:[]},character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:id,assetId:id,spec,object:new Group()}]}});
 try{
  world.humanoid!.prepareEpisodeStart({positionWorldMetersXYZ:[0,40,0],facingYawRadians:0,humanoid:{mounted:true,vehicleInstanceId:id}});
  world.setCameraFollow({configuration:createHumanoidCameraDocument('person')});
  const v=world.humanoid!.simulation.vehicles[0]!;
  for(const roll of [Math.PI,179*Math.PI/180,-179*Math.PI/180]){
   v.rotation.setFromAxisAngle(new Vector3(0,0,1),roll);
   world.setCameraView('first-person');world.setCameraView('third-person');
   const pose=world.inspectCamera().current!;
   expect(pose.upWorldXYZ[1]).toBeGreaterThan(.95);
   expect(new Vector3(1,0,0).applyQuaternion(new Quaternion(...pose.quaternionWorldXYZW)).y).toBeCloseTo(0,9);
   const before=v.rotation.clone();for(let n=0;n<90;n++)expect(world.inspectCamera().current).toEqual(pose);
   expect(v.rotation.angleTo(before)).toBeLessThan(1e-7);
   for(let n=0;n<20;n++){world.step({},1);const current=world.inspectCamera().current!;expect(current.upWorldXYZ[1]).toBeGreaterThan(.95);expect(new Vector3(1,0,0).applyQuaternion(new Quaternion(...current.quaternionWorldXYZW)).y).toBeCloseTo(0,8);}
  }
 }finally{world.dispose();}
});

it('fixed-wing propeller fades into a camera-nonsolid blur at speed and restores clear blades when stopped',()=>{
 vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({beginPath(){},roundRect(){},fill(){},fillText(){}})})});
 const visual=buildVehicle(SPECS.find(s=>s.id==='plane')!),root=visual.root,shell=visual.aircraftShell!;
 try{const prop=root.getObjectByName('aircraft-propeller')!,blades=prop.children.filter(n=>n.name==='aircraft-blade'),blur=prop.getObjectByName('aircraft-propeller-blur') as Mesh;
  expect(isCameraVisualEffect(blur)).toBe(true);
  for(const fraction of [0,.25,1,0]){
   const input={rotorPhases:[900.25],tilt:0,rotorSpeedFraction:fraction};shell.update(input);
   expect(prop.rotation.z).toBe(900.25);expect(input.rotorPhases).toEqual([900.25]);
   expect(blur.visible).toBe(fraction>.12);expect(blades.every(b=>b.visible)).toBe(fraction<.45);
   const opacity=(blades[0] as Mesh).material as MeshStandardMaterial;
   if(fraction===0)expect(opacity.opacity).toBe(1);if(fraction===1)expect(opacity.opacity).toBe(0);
  }
 }finally{root.traverse(n=>{if(n instanceof Mesh){n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material])m.dispose();}});vi.unstubAllGlobals();}
});
it('aircraft body, rotor angle and rotor speed share the same display interpolation without advancing physics',()=>{
 const q=new EnvironmentQueries({...getMap('aircraft-training'),boxes:[]}),sim=new Simulation(q,[SPECS.find(s=>s.id==='trainer-plane')!]);
 try{const v=sim.vehicles[0]!,a=v.motion.aircraft!;v.position.set(0,100,0);a.rotorPhases=[0];a.rotorSpeedFraction=0;
  const display=new PresentationState(sim);display.beforeStep(sim);v.position.z=10;v.rotation.setFromAxisAngle(new Vector3(0,1,0),.2);a.rotorPhases[0]=10;a.rotorSpeedFraction=1;display.afterStep(sim);
  for(const alpha of [.25,.5,.75,.5]){display.interpolate(alpha);const sample=display.vehicles[0]!;expect(sample.position.z).toBeCloseTo(10*alpha);expect(sample.rotation.angleTo(new Quaternion())).toBeCloseTo(.2*alpha);expect(sample.aircraft!.rotorPhases[0]).toBeCloseTo(10*alpha);expect(sample.aircraft!.rotorSpeedFraction).toBeCloseTo(alpha);expect(v.position.z).toBe(10);expect(a.rotorPhases[0]).toBe(10);}
 }finally{sim.dispose();q.dispose();}
});
