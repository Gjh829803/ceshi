import {describe, expect, it} from 'vitest';
import {summarizePlaytestTrace,summarizePlaytestActions} from './playtest-summary';

it('reports command rejection, failed operations and unobserved outcomes without deciding task success',()=>{
 const events=[
  {type:'keydown'},
  {type:'world-command',wallSeconds:1,command:{type:'actor.stop',entityId:'player'},worldCommandReceipt:{status:'rejected',error:{code:'PLAYER_INPUT_OWNS_ACTOR',message:'Controlled actor'}}},
  {type:'world-command',wallSeconds:2,command:{type:'actor.move-to',entityId:'npc'},worldCommandReceipt:{status:'accepted',operationId:'move'}},
  {type:'world-command',wallSeconds:3,command:{type:'humanoid.set-camera-mode'},worldCommandReceipt:{status:'applied'}},
 ];
 const operations=[{id:'move',status:'failed',error:{code:'NO_PATH',message:'Target off mesh'}},null,{id:'later',status:'running'},{id:'gone',status:'missing'}];
 const before=structuredClone({events,operations});const result=summarizePlaytestActions(events,operations);
 expect(result).toMatchObject({scope:'recorded-command-outcomes',commandCount:3,
  dispatchCounts:{applied:1,accepted:1,rejected:1},operationCounts:{failed:1,running:1,missing:1,unobserved:1},
  details:expect.arrayContaining([expect.objectContaining({status:'rejected',error:{code:'PLAYER_INPUT_OWNS_ACTOR',message:'Controlled actor'}}),expect.objectContaining({status:'failed',operationId:'move',error:{code:'NO_PATH',message:'Target off mesh'}})])});
 expect(result).not.toHaveProperty('passed');expect(result).not.toHaveProperty('status','succeeded');
 expect({events,operations}).toEqual(before);
 const bounded=summarizePlaytestActions(Array.from({length:12},()=>events[1]),[]);
 expect(bounded.dispatchCounts.rejected).toBe(12);expect(bounded.details).toHaveLength(8);expect(bounded.omittedDetails).toBe(4);
});

describe('recorded playtest time windows', () => {
  it('reports sampled braking and mounting without interpolating or changing the trace', () => {
    const trace = {samples: [
      {wallSeconds:10, simulationTick:600, positionMetersXYZ:[0,0,0], velocityMetersPerSecondXYZ:[3,0,4], humanoid:{mountedInstanceId:'car'}, camera:{mode:'follow'}},
      {wallSeconds:11, simulationTick:660, positionMetersXYZ:[3,0,4], velocityMetersPerSecondXYZ:[0,0,0], humanoid:{mountedInstanceId:'car'}, camera:{mode:'follow'}},
      {wallSeconds:12, simulationTick:0, positionMetersXYZ:[100,0,0], humanoid:{mountedInstanceId:null}, camera:{mode:'authored'}},
    ], keyboardEvents:[{type:'keydown',code:'Space',timeSeconds:10.5,isTrusted:true},{type:'keyup',code:'Space',timeSeconds:11.5}]};
    const before=structuredClone(trace);
    const result=summarizePlaytestTrace(trace,{fromSeconds:10,toSeconds:11,maxSamples:2});
    expect(result.summary).toMatchObject({sampleCount:2,speedSampleCount:2,observedMaximumSpeedMetersPerSecond:5,firstSpeedMetersPerSecond:5,lastSpeedMetersPerSecond:0,mountedInstanceIds:['car']});
    expect(result.samples.map(s=>s.traceSampleIndex)).toEqual([0,1]);
    expect(result.keyboardEvents).toEqual([{keyboardEventIndex:0,wallSeconds:10.5,type:'keydown',code:'Space',repeat:null,isTrusted:true}]);
    expect(trace).toEqual(before);
    const acrossReset=summarizePlaytestTrace(trace);
    expect(acrossReset.samples[2]).toMatchObject({simulationTick:0,positionMetersXYZ:[100,0,0],speedMetersPerSecond:null,mount:{status:'observed',instanceId:null}});
    expect(acrossReset.summary).not.toHaveProperty('travelledMeters');
  });
  it('bounds the response while computing maxima from every sample in the requested window', () => {
    const samples=Array.from({length:100},(_,i)=>({wallSeconds:i,positionMetersXYZ:[i,0,0],velocityMetersPerSecondXYZ:[i===37?30:1,0,0],humanoid:{mountedInstanceId:'car',controls:'x'.repeat(10000)}}));
    const result=summarizePlaytestTrace({samples,keyboardEvents:Array.from({length:100},(_,i)=>({timeSeconds:i,code:'x'.repeat(2000)}))},{maxSamples:3});
    expect(result.samples.map(s=>s.traceSampleIndex)).toEqual([0,50,99]);
    expect(result.summary.observedMaximumSpeedMetersPerSecond).toBe(30);
    expect(result.sampleSelection).toMatchObject({returned:3,omitted:97});
    expect(result.keyboardEvents).toHaveLength(32);expect(result.omittedKeyboardEvents).toBe(68);
    expect(JSON.stringify(result)).not.toContain('controls');expect(JSON.stringify(result).length).toBeLessThan(15000);
  });
  it('distinguishes absent telemetry from measured zero and keeps invalid timestamps out of a time window', () => {
    const result=summarizePlaytestTrace({samples:[{wallSeconds:NaN},{wallSeconds:0,velocityMetersPerSecondXYZ:[0,0,0]}, {wallSeconds:1,positionMetersXYZ:['0',0,0],velocityMetersPerSecondXYZ:[Infinity,0,0],observationError:'unavailable'}]});
    expect(result.summary).toMatchObject({invalidTimestampSamples:1,speedSampleCount:1,firstSpeedMetersPerSecond:0,lastSpeedMetersPerSecond:null,mountObservationCount:0});
    expect(result.samples[1]).toMatchObject({traceSampleIndex:2,positionMetersXYZ:null,speedMetersPerSecond:null,mount:{status:'unavailable',instanceId:null},observationError:'unavailable'});
  });
  it('does not substitute a nearby sample for an empty or future time window', () => {
    for(const range of [{fromSeconds:2,toSeconds:3},{fromSeconds:20}]){
      const result=summarizePlaytestTrace({samples:[{wallSeconds:0},{wallSeconds:10}]},range);
      expect(result).toMatchObject({status:'empty',selectedRange:null,samples:[],summary:{observedMaximumSpeedMetersPerSecond:null}});
    }
  });
  it.each([{fromSeconds:-1},{fromSeconds:5,toSeconds:4},{toSeconds:NaN},{maxSamples:1},{maxSamples:33},{maxSamples:2.5}])('rejects invalid query %j', query => {
    expect(()=>summarizePlaytestTrace({},query)).toThrow('THREE_PLAYTEST_QUERY_INVALID');
  });
});
