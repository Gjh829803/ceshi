import {beforeAll,expect,it} from 'vitest';
import {listMotionFamilies,motionFamilyForMode,motionSubtypeControlFields,resolveMotionFamilyMovement} from './registry';
import {defaultMovementSettings} from '../../config/control';
import {SPECS} from '../../../../../shared/preset-content/config';
import {getMap} from '../../../../../shared/preset-content/environment/maps';
import {createVehicle,emptyInput,stepVehicle} from '../simulation';
import {EnvironmentQueries,initEnvironmentQueries} from '../environment/queries';
beforeAll(initEnvironmentQueries);
it('assigns every current mode exactly once to seven categories and keeps catalog reads isolated',()=>{
 const families=listMotionFamilies();expect(families.map(f=>f.id)).toEqual(['human','ground-vehicle','surface-vessel','aircraft','flying-creature','underwater','space']);
 for(const spec of SPECS)expect(families.filter(f=>f.modes.includes(spec.mode))).toHaveLength(1);
 expect(motionFamilyForMode('character')).toBe('human');expect(motionFamilyForMode('plane')).toBe('aircraft');expect(motionFamilyForMode('dragon')).toBe('flying-creature');
 for(const [mode,category] of [['skateboard','ground-vehicle'],['paddled_boat','surface-vessel'],['submarine','underwater'],['spacecraft','space']] as const)expect(motionFamilyForMode(mode)).toBe(category);
 const raft=families.find(f=>f.id==='surface-vessel')!.subtypes.find(s=>s.id==='surface-vessel.raft')!;
 expect(raft).toMatchObject({mode:'paddled_boat',controlFamily:'raft'});
 expect(motionSubtypeControlFields('surface-vessel','surface-vessel.paddled_boat').find(f=>f.key==='accel')?.label).toBe('划桨峰值加速度');
 families[0]!.subtypes[0]!.name='changed';expect(listMotionFamilies()[0]!.subtypes[0]!.name).toBe('人物');
 expect(motionSubtypeControlFields('aircraft','aircraft.rotorcraft')).toEqual([]);
});
it('rejects cross-category subtypes, reserved algorithms and invalid ranges without sharing configuration',()=>{
 const defaults=defaultMovementSettings('plane',SPECS.find(s=>s.mode==='plane')!);
 expect(()=>resolveMotionFamilyMovement('ground-vehicle','aircraft.plane',{},defaults)).toThrow('MOTION_SUBTYPE_MISMATCH');
 expect(()=>resolveMotionFamilyMovement('aircraft','aircraft.vtol',{},defaults)).toThrow('MOTION_SUBTYPE_UNAVAILABLE');
 for(const value of [{speed:NaN},{speed:201},{throttleResponse:-1},{unregistered:1}])expect(()=>resolveMotionFamilyMovement('aircraft','aircraft.plane',value,defaults)).toThrow('HUMANOID_CONTROL_INVALID');
 const a=resolveMotionFamilyMovement('aircraft','aircraft.plane',{speed:40},defaults),b=resolveMotionFamilyMovement('aircraft','aircraft.plane',{speed:40},defaults);a.speed=10;expect(b.speed).toBe(40);expect(defaults.speed).not.toBe(10);
});
it('keeps two aircraft states and unrelated vehicle configuration independent during registered stepping',()=>{
 const plane=SPECS.find(s=>s.id==='plane')!,a=createVehicle(plane),b=createVehicle(plane),car=createVehicle(SPECS.find(s=>s.id==='rover')!);
 const q=new EnvironmentQueries(getMap('aircraft-training')),before=b.position.clone(),originalSpeed=car.spec.speed;
 try{a.spec.speed=48;for(let tick=0;tick<120;tick++){stepVehicle(a,{...emptyInput(),boost:true},1/60,tick/60,q);q.stepPhysics(1/60);}
 expect(a.aircraft).not.toBe(b.aircraft);expect(a.aircraft!.wheels).not.toBe(b.aircraft!.wheels);expect(a.velocity.length()).toBeGreaterThan(1);expect(b.position.equals(before)).toBe(true);expect(b.throttle).toBe(0);expect(car.spec.speed).toBe(originalSpeed);
 }finally{q.dispose();}
});
