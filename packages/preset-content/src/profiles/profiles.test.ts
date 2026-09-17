import {describe,expect,it} from 'vitest';
import {getDefaultProfile,loadAssetProfile,parseAssetProfile,saveAssetProfile} from './profiles';
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
 it('rejects specialized tuning on soaring profiles and incomplete tuning',()=>{
  const glider=getDefaultProfile('glider')!;
  expect(glider).not.toHaveProperty('aircraftFlight');
  expect(()=>parseAssetProfile({...glider,aircraftFlight:humanoid.DEFAULT_AIRCRAFT_FLIGHT})).toThrow('aircraftFlight unsupported');
  const plane=getDefaultProfile('plane')!;
  expect(()=>parseAssetProfile({...plane,aircraftFlight:{pitchGain:9}})).toThrow('complete aircraftFlight profile required');
 });
});
