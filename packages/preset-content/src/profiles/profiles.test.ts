import {describe,expect,it,vi} from 'vitest';
import {clearAssetProfile,getDefaultProfile,loadAssetProfile,parseAssetProfile,saveAssetProfile} from './profiles';
import {humanoid} from '@worldkit/three';
import {SPECS} from '../config';
import {assetIdForPreset} from '../assets/catalog';
import {applyControlProfile,readEditableProfile} from './profile-runtime';

describe('profile runtime asset identities',()=>{
 const vehicles=SPECS.map(spec=>({instanceId:`instance-${spec.id}`,assetId:assetIdForPreset(spec)}));
 function fixture(instances=vehicles){
  const applyProfile=vi.fn(),exportProfile=vi.fn(()=>({vehicles:{}}));
  const runtime={snapshot:()=>({vehicles:instances}),applyProfile,exportProfile} as unknown as humanoid.HumanoidRuntime;
  return {runtime,applyProfile};
 }
 it.each(SPECS.map(spec=>spec.id))('restores %s defaults against its real catalog identity',id=>{
  const {runtime,applyProfile}=fixture(),profile=getDefaultProfile(id)!;
  applyControlProfile(runtime,profile);
  expect(applyProfile).toHaveBeenCalledWith(expect.objectContaining({vehicles:{[`instance-${id}`]:profile.control}}));
  expect(readEditableProfile(runtime,profile).control).toEqual(profile.control);
 });
 it('applies horse defaults to both instances and scoped edits only to the selected horse',()=>{
  const {runtime,applyProfile}=fixture([
   {instanceId:'horse-a',assetId:'creature.horse'},
   {instanceId:'horse-b',assetId:'creature.horse'},
   {instanceId:'carriage',assetId:'vehicle.carriage'},
  ]),profile=getDefaultProfile('horse')!;
  applyControlProfile(runtime,profile);
  expect(applyProfile).toHaveBeenLastCalledWith({vehicles:{'horse-a':profile.control,'horse-b':profile.control}});
  applyControlProfile(runtime,{...profile,instanceId:'horse-b'});
  expect(applyProfile).toHaveBeenLastCalledWith({vehicles:{'horse-b':profile.control}});
  expect(()=>applyControlProfile(runtime,{...profile,instanceId:'carriage'})).toThrow('profile instance asset mismatch');
  expect(()=>applyControlProfile(runtime,{...profile,instanceId:'missing'})).toThrow('profile instance not found');
 });
 it('continues to match the active dragon variant',()=>{
  const {runtime,applyProfile}=fixture([{instanceId:'dragon',assetId:assetIdForPreset({id:'dragon',mode:'dragon'},'D02')}]);
  const profile=getDefaultProfile('dragon')!;
  applyControlProfile(runtime,profile);
  expect(applyProfile).toHaveBeenCalledWith({vehicles:{dragon:profile.control}});
 });
});

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
 it('matches creature catalog identities when applying mount profiles',()=>{
  const applied: unknown[]=[];
  const runtime={
   snapshot:()=>({vehicles:[{instanceId:'horse',assetId:'creature.horse'}]}),
   applyProfile:(profile:unknown)=>{applied.push(profile);},
  } as unknown as humanoid.HumanoidRuntime;
  applyControlProfile(runtime,getDefaultProfile('horse')!);
  expect(applied).toHaveLength(1);
  expect((applied[0] as {vehicles:Record<string,unknown>}).vehicles).toHaveProperty('horse');
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
