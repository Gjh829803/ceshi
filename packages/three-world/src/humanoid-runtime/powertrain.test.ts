import {describe,it,expect} from 'vitest';
import {DEFAULT_POWERTRAIN as c,createPowertrain,stepPowertrain,torqueAtRpm,validatePowertrain} from './powertrain';
const input={pedal:1,brake:false,speed:12,wheelOmega:12/.52,grounded:true,slipping:false,speedLimit:40};
describe('automatic powertrain',()=>{
 it('boosts forward torque below the speed limit without bypassing brakes, shifts or reverse',()=>{
  const normal=createPowertrain(c),boosted=createPowertrain(c);
  stepPowertrain(normal,c,input,1/60);stepPowertrain(boosted,c,{...input,boost:true},1/60);
  expect(boosted.engineTorque).toBeCloseTo(normal.engineTorque*1.8);expect(boosted.axleTorque).toBeGreaterThan(normal.axleTorque);
  for(const override of [{brake:true},{wheelOmega:1000},{speed:40}]){const s=createPowertrain(c);stepPowertrain(s,c,{...input,...override,boost:true},1/60);expect(s.engineTorque).toBe(0);}
  const reverse=[false,true].map(boost=>{const s=createPowertrain(c);s.gear=s.targetGear=-1;stepPowertrain(s,c,{...input,pedal:-1,speed:-2,wheelOmega:-4,boost},1/60);return s;});expect(reverse[1]!.engineTorque).toBeCloseTo(reverse[0]!.engineTorque);
  expect(()=>validatePowertrain({...c,boostTorqueMultiplier:NaN})).toThrow();expect(()=>validatePowertrain({...c,boostTorqueMultiplier:3})).not.toThrow();expect(()=>validatePowertrain({...c,boostTorqueMultiplier:4.1})).toThrow();
 });
 it('uses an RPM torque curve and validates authored ratios and units',()=>{
  expect(torqueAtRpm(c,3200)).toBeGreaterThan(torqueAtRpm(c,850));expect(torqueAtRpm(c,6200)).toBeLessThan(torqueAtRpm(c,3200));
  expect(()=>validatePowertrain(c)).not.toThrow();for(const changed of [{forwardRatios:[1,2]},{shiftSeconds:NaN},{torqueCurve:[[850,300],[850,400]] as const},{efficiency:2}])expect(()=>validatePowertrain({...c,...changed})).toThrow('VEHICLE_POWERTRAIN_CONFIG_INVALID');
 });
 it('interrupts axle torque while shifting and then engages the next gear progressively',()=>{
  const s=createPowertrain(c);s.rpm=5500;
  stepPowertrain(s,c,{...input,speed:20,wheelOmega:20/.52},1/120);expect(s.gear).toBe(0);expect(s.targetGear).toBe(2);expect(s.axleTorque).toBe(0);
  for(let n=0;n<30;n++)stepPowertrain(s,c,input,1/120);expect(s.gear).toBe(0);
  for(let n=0;n<17;n++)stepPowertrain(s,c,input,1/120);expect(s.gear).toBe(2);expect(s.engagement).toBeGreaterThan(0);expect(s.engagement).toBeLessThan(1);
  for(let n=0;n<30;n++)stepPowertrain(s,c,input,1/120);expect(s.engagement).toBe(1);expect(s.axleTorque).toBeGreaterThan(0);
 });
 it('downshifts under low wheel RPM without immediately hunting back up',()=>{
  const s=createPowertrain(c);s.gear=s.targetGear=3;s.rpm=1600;
  stepPowertrain(s,c,{...input,speed:8,wheelOmega:8/.52},1/120);expect(s.targetGear).toBe(2);
  for(let n=0;n<90;n++)stepPowertrain(s,c,{...input,speed:8,wheelOmega:8/.52},1/120);expect(s.gear).toBe(2);
 });
 it('kicks down for rolling boost, keeps normal cruising gear and avoids an over-rev downshift',()=>{
  for(const boost of [false,true]){const s=createPowertrain(c);s.gear=s.targetGear=2;s.rpm=2600;stepPowertrain(s,c,{...input,speed:15,wheelOmega:15/.52,roadWheelOmega:15/.52,boost},1/120);expect(s.targetGear).toBe(boost?1:2);if(boost){expect(s.shiftRemaining).toBeGreaterThan(0);expect(s.axleTorque).toBe(0);}}
  const fast=createPowertrain(c);fast.gear=fast.targetGear=2;fast.rpm=3800;stepPowertrain(fast,c,{...input,speed:22,wheelOmega:22/.52,roadWheelOmega:22/.52,boost:true},1/120);expect(fast.targetGear).toBe(2);
 });
 it('does not upshift because unloaded or slipping wheels overspeed',()=>{
  const settled=createPowertrain(c);settled.rpm=5600;stepPowertrain(settled,c,{...input,wheelOmega:40,roadWheelOmega:8/.52,boost:true},1/120);expect(settled.gear).toBe(1);
  for(const state of [{grounded:false,slipping:false},{grounded:true,slipping:true}]){const s=createPowertrain(c);s.rpm=5500;stepPowertrain(s,c,{...input,...state,wheelOmega:40},1/120);expect(s.gear).toBe(1);}
 });
 it('brakes before reversing in both directions and produces signed reverse torque',()=>{
  const s=createPowertrain(c);s.throttle=1;stepPowertrain(s,c,{...input,pedal:-1},1/120);expect(s.directionBraking).toBe(true);expect(s.gear).toBe(1);expect(s.engineTorque).toBe(0);
  for(let n=0;n<90;n++)stepPowertrain(s,c,{...input,pedal:-1,speed:0,wheelOmega:0},1/120);expect(s.gear).toBe(-1);expect(s.axleTorque).toBeLessThan(0);
  stepPowertrain(s,c,{...input,pedal:1,speed:-5,wheelOmega:-5/.52},1/120);expect(s.directionBraking).toBe(true);expect(s.gear).toBe(-1);
 });
 it('bounds RPM, applies engine braking and does not advance during a zero step',()=>{
  const s=createPowertrain(c);for(let n=0;n<240;n++)stepPowertrain(s,c,{...input,wheelOmega:200,slipping:true},1/120);expect(s.rpm).toBeLessThanOrEqual(c.maxRpm);expect(s.engineTorque).toBe(0);
  for(let n=0;n<120;n++)stepPowertrain(s,c,{...input,pedal:0},1/120);expect(s.axleTorque).toBeLessThan(0);
  const before={...s};stepPowertrain(s,c,input,0);expect(s).toEqual(before);expect(createPowertrain(c).rpm).toBe(c.idleRpm);
 });
});
