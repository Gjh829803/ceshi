import {describe,expect,it,vi} from 'vitest';
import {applyControlProfile,readEditableProfile} from './profile-runtime';
import {clearAssetProfile,getDefaultProfile,loadAssetProfile,parseAssetProfile,saveAssetProfile} from './profiles';
import {humanoid} from '@worldkit/three';

describe('asset aircraft profiles',()=>{
 it('ships complete fixed-wing tuning and round-trips it through storage',()=>{
  const profile=getDefaultProfile('plane')!;
  expect(profile.aircraftFlight).toEqual(humanoid.DEFAULT_AIRCRAFT_FLIGHT);
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  profile.aircraftFlight!.pitchGain=12;
  saveAssetProfile(storage,profile);
  expect(loadAssetProfile(storage,'plane')!.aircraftFlight).toMatchObject({pitchGain:12,rollGain:14});
 });
 it('keeps instance overrides in separate storage scopes',()=>{
  const profile=getDefaultProfile('plane')!,values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  profile.instanceId='plane';profile.aircraftFlight!.pitchGain=12;saveAssetProfile(storage,profile);
  expect(loadAssetProfile(storage,'plane','plane')).toMatchObject({instanceId:'plane',aircraftFlight:{pitchGain:12}});
  expect(loadAssetProfile(storage,'plane','plane-02')).toBeUndefined();
  expect(loadAssetProfile(storage,'plane')).toBeUndefined();
  // A v2 build before instance scopes were separated could have written this
  // same-instance profile to the asset key. Never treat that stale value as a
  // default that applies to every plane.
  values.set('worldkit.asset-profile.v2.plane',JSON.stringify(profile));
  expect(loadAssetProfile(storage,'plane')).toBeUndefined();
  const second={...getDefaultProfile('plane')!,instanceId:'plane-02',aircraftFlight:{...getDefaultProfile('plane')!.aircraftFlight!,pitchGain:15}};
  saveAssetProfile(storage,second);clearAssetProfile(storage,'plane','plane');
  expect(loadAssetProfile(storage,'plane','plane')).toBeUndefined();
  expect(loadAssetProfile(storage,'plane','plane-02')?.aircraftFlight?.pitchGain).toBe(15);
 });
 it('rejects specialized tuning on soaring profiles and incomplete tuning',()=>{
  const glider=getDefaultProfile('glider')!;
  expect(glider).not.toHaveProperty('aircraftFlight');
  expect(()=>parseAssetProfile({...glider,aircraftFlight:humanoid.DEFAULT_AIRCRAFT_FLIGHT})).toThrow('aircraftFlight unsupported');
  const plane=getDefaultProfile('plane')!;
  expect(()=>parseAssetProfile({...plane,aircraftFlight:{pitchGain:9}})).toThrow('complete aircraftFlight profile required');
 });
});


it('routes mount profiles by catalog identity, independently of scene instance names',()=>{
 const applyProfile=vi.fn(),profile=getDefaultProfile('horse')!,vehicles=[
  {instanceId:'riding-one',assetId:'creature.horse'},
  {instanceId:'riding-two',assetId:'creature.horse'},
  {instanceId:'cart',assetId:'vehicle.carriage'},
 ];
 const runtime={snapshot:()=>({vehicles}),applyProfile,exportProfile:()=>({vehicles:{'riding-two':{speed:7}}})} as unknown as humanoid.HumanoidRuntime;
 applyControlProfile(runtime,profile);
 expect(Object.keys(applyProfile.mock.calls[0]![0].vehicles)).toEqual(['riding-one','riding-two']);
 applyControlProfile(runtime,{...profile,instanceId:'riding-two'});
 expect(Object.keys(applyProfile.mock.calls[1]![0].vehicles)).toEqual(['riding-two']);
 expect(readEditableProfile(runtime,{...profile,instanceId:'riding-two'}).control.speed).toBe(7);
 expect(()=>applyControlProfile(runtime,{...profile,instanceId:'cart'})).toThrow('profile instance asset mismatch');
});
