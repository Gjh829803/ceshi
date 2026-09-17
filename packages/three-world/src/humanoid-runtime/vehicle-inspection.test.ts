import {beforeAll,expect,it} from 'vitest';
import {createVehicle,emptyInput} from './simulation';
import {createRoadVehicleSpec} from './road-vehicle';
import {inspectVehicle} from './vehicle-inspection';
import {createAircraftSpec} from './aircraft-spec';
import {aircraftFamily} from './motion-families/aircraft/family';
import {EnvironmentQueries,initEnvironmentQueries} from './environment/queries';
import {AIRCRAFT} from '../config/aircraft';
beforeAll(initEnvironmentQueries);
it('samples detached summary and wheel evidence without changing simulation state',()=>{
 const v=createVehicle(createRoadVehicleSpec('car'));
 expect(inspectVehicle(v,'wheels')).toMatchObject({sample:{status:'unmeasured'},wheelContacts:null,wheels:null});
 v.motion.wheelPhysics!.sample={physicsStepSequence:4,phase:'pre-integration',deltaSeconds:1/120};v.grounded=false;v.motion.wheelPhysics!.wheels[0]!.contact=true;v.motion.wheelPhysics!.wheels[0]!.load=123;
 const before=JSON.stringify(v),summary=inspectVehicle(v);
 expect(summary).toMatchObject({instanceId:'car',grounded:false,wheelContacts:1,wheelCount:4,drive:{kind:'engine'}});
 expect(summary).not.toHaveProperty('wheels');
 const details=inspectVehicle(v,'wheels');expect(details.wheels![0]).toMatchObject({contact:true,loadNewtons:123});
 details.wheels![0]!.loadNewtons=0;
 expect(inspectVehicle(v,'wheels').wheels![0]!.loadNewtons).toBe(123);
 expect(JSON.stringify(v)).toBe(before);
 expect(inspectVehicle(v,'summary',5).sample.status).toBe('stale');
});
it('binds fresh model-free fixed-wing specs to existing force-driven physics',()=>{
 const a=createAircraftSpec('plane'),b=createAircraftSpec('plane');a.seat[0]=9;
 expect(b.seat[0]).toBe(0);expect(b.airframe.boxes).toEqual(AIRCRAFT.boxes);
 expect(()=>createAircraftSpec('vtol' as 'plane')).toThrow('VEHICLE_AIRCRAFT_KIND_INVALID');
 const v=createVehicle(b);expect(v.motion.aircraft).toBeDefined();expect(v.motion.body).toBeUndefined();
 const q=new EnvironmentQueries({id:'flight',name:'Flight',description:'',bounds:{min:[-500,-50,-500],max:[500,500,500]},boxes:[],water:[],regions:[],spawns:[],playerSpawn:[0,0,0]});
 try{
  v.position.y=100;v.velocity.set(0,0,35);
  aircraftFamily.step!(v,{...emptyInput(),boost:true},1/60,0,q);q.stepPhysics(1/60);
  expect(inspectVehicle(v).sample.solver).toEqual({physicsStepSequence:2,phase:'pre-integration',deltaSeconds:1/120});
  expect(v.throttle).toBeGreaterThan(0);expect(v.position.z).toBeGreaterThan(0);
  expect(inspectVehicle(v,'wheels')).toMatchObject({wheelCount:3,aircraft:{airspeedMetersPerSecond:v.motion.aircraft!.airspeedMetersPerSecond},drive:null});
  expect(inspectVehicle(v).aircraft).toMatchObject({altitudeMeters:v.position.y,verticalSpeedMetersPerSecond:v.velocity.y,dynamicPressurePascals:expect.any(Number),liftNewtons:expect.any(Number),dragNewtons:expect.any(Number),controlAuthority:expect.any(Number),transitionFactor:0});
  const aircraft=inspectVehicle(v).aircraft!;
  expect(aircraft.dynamicPressurePascals).toBeCloseTo(.5*AIRCRAFT.density*aircraft.airspeedMetersPerSecond**2,8);
 }finally{q.dispose();}
});
