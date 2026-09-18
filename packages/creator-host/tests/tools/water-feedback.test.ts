import {describe,expect,it} from 'vitest';
import {buildWaterFeedback,summarizeWaterFeedback} from '../../src/tools/water-feedback';
import {playtestSubmissionReadiness} from '../../src/tools/tools';

const contact={swimmingMode:'surface',volumeId:'pool',surfaceHeightMeters:0,depthMeters:2,submersionRatio:.6,feetBelowSurfaceMeters:1.1,
 requiredDepthMeters:1.28,requiredFeetBelowSurfaceMeters:.95,depthCheckPassed:true,immersionCheckPassed:true,
 wasSwimmingAtSample:false,entrySpeedMetersPerSecond:1,entrySerial:1};
const water={declaredVolumeCount:1,controllerActive:true,swimming:true,contact};
describe('advisory water feedback',()=>{
 it('reports native underwater mode and records surface transitions without rerunning physics',()=>{
  const submerged={...water,contact:{...contact,swimmingMode:'underwater'}};
  expect(buildWaterFeedback(submerged).code).toBe('SWIMMING_UNDERWATER');
  expect(summarizeWaterFeedback([{water},{water:submerged},{water:submerged},{water}]).events.map(e=>e.code))
   .toEqual(['SWIMMING','SWIMMING_UNDERWATER','SWIMMING']);
  expect(buildWaterFeedback({...water,contact:{...contact,swimmingMode:'flying'}}).code).toBe('WATER_DIAGNOSTICS_UNAVAILABLE');
 });
 it('reports measured swimming without changing or retaining mutable input',()=>{
  const input=structuredClone(water),result=buildWaterFeedback(input);
  expect(result.code).toBe('SWIMMING');expect(result.advisory).toBe(true);
  expect(result.evidence!.contact!.depthMeters).toBe(2);
  input.contact.depthMeters=0;expect(result.evidence!.contact!.depthMeters).toBe(2);
 });
 it.each([
  [undefined,'WATER_DIAGNOSTICS_UNAVAILABLE'],
  [{...water,controllerActive:false},'WATER_CONTROLLER_INACTIVE'],
  [{...water,declaredVolumeCount:0,swimming:false,contact:null},'NO_WATER_DECLARED'],
  [{...water,swimming:false,contact:null},'NO_WATER_CONTACT'],
  [{...water,swimming:false,contact:{...contact,depthMeters:.5,depthCheckPassed:false}},'WATER_TOO_SHALLOW'],
  [{...water,swimming:false,contact:{...contact,feetBelowSurfaceMeters:.1,immersionCheckPassed:false}},'NOT_SUBMERGED_ENOUGH'],
 ])('distinguishes the observation %j', (observation,code)=>{
  const result=buildWaterFeedback(observation);expect(result.code).toBe(code);expect(result.advisory).toBe(true);
  expect(result.nextChecks.length).toBeGreaterThan(0);
 });
 it('uses the recorded decision flags instead of introducing new depth rules',()=>{
  expect(buildWaterFeedback({...water,contact:{...contact,depthMeters:1.2,requiredDepthMeters:1.16,wasSwimmingAtSample:true}}).code).toBe('SWIMMING');
 });
 it.each([
  {...water,contact:{volumeId:'pool',depthCheckPassed:true,immersionCheckPassed:true}},
  {...water,declaredVolumeCount:-1,contact:null},
  {...water,declaredVolumeCount:1.5},
  ...Object.keys(contact).filter(key=>typeof contact[key as keyof typeof contact]==='number').flatMap(key=>
   [undefined,NaN,Infinity].map(value=>({...water,contact:{...contact,[key]:value}}))),
  {...water,contact:{...contact,wasSwimmingAtSample:undefined}},
 ])('falls back safely for incomplete or invalid telemetry %j',observation=>{
  expect(buildWaterFeedback(observation)).toMatchObject({advisory:true,code:'WATER_DIAGNOSTICS_UNAVAILABLE',evidence:null});
 });
 it('reports transitions with actual sample time and bounds retained history',()=>{
  const samples=Array.from({length:140},(_,i)=>({wallSeconds:i/10,simulationTick:i*6,water:{...water,swimming:i%2===0,contact:i%2===0?contact:null}}));
  const result=summarizeWaterFeedback(samples);
  expect(result.events).toHaveLength(128);expect(result.totalTransitions).toBe(140);expect(result.omittedTransitions).toBe(12);
  expect(result.events.at(-1)).toMatchObject({wallSeconds:13.9,simulationTick:834,code:'NO_WATER_CONTACT'});
  expect(summarizeWaterFeedback([{wallSeconds:0},{wallSeconds:1}]).events).toEqual([]);
  expect(summarizeWaterFeedback([{water},{water},{water}]).events).toHaveLength(1);
 });
 it('does not turn an advisory shallow-water observation into a new acceptance gate',()=>{
  const report={status:'passed',isCompleteEpisode:true,capturedInput:true,actualWallSeconds:1,inputWallSeconds:1,activePlaySeconds:1,videoMetadata:{durationSeconds:1},worldBuildHash:'world',episodeHash:'episode'};
  const current={worldBuildHash:'world',episodeHash:'episode'};
  expect(playtestSubmissionReadiness({...report,feedback:buildWaterFeedback({...water,swimming:false,contact:{...contact,depthCheckPassed:false}})},current))
   .toEqual(playtestSubmissionReadiness(report,current));
 });
});
