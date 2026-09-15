import { expect, it, vi } from 'vitest';
import { CameraPerformance } from './performance';
import { CameraController } from './controller';
import { CameraConstraints, type CameraGeometryProvider } from './constraints';
import { parseCameraDocument, resolveCameraConfiguration } from '../config/camera';
import { prepareCameraIntent } from './strategies/evaluation';
import { evaluateThirdPerson } from './strategies/third-person';
import type { CameraSubjectFacts } from './subject';

it('has no clock reads while disabled and bounded independent stage windows',()=>{
  let clock=0;
  const now=vi.fn(()=>clock), metrics=new CameraPerformance(now);
  metrics.end(metrics.begin('fixed',1,1,1));metrics.endQuery(metrics.beginQuery());
  expect(now).not.toHaveBeenCalled();expect(metrics.inspect()).toBeUndefined();
  metrics.setEnabled(true);
  for(let tick=0;tick<300;tick++){
    const sample=metrics.begin('fixed',tick,4,7);
    const query=metrics.beginQuery();clock+=2;metrics.endQuery(query);clock+=3;metrics.end(sample);
  }
  const presentation=metrics.begin('presentation',300,4,7);clock+=1;metrics.end(presentation);
  const result=metrics.inspect()!;
  expect(result.samples).toHaveLength(241);
  expect(result.stages.fixed).toEqual({count:240,meanMilliseconds:5,p95Milliseconds:5,maximumMilliseconds:5,queryCount:240,queryMilliseconds:480});
  expect(result.samples[0]).toMatchObject({simulationTick:60,configurationRevision:4,lifecycleGeneration:7});
  const calls=now.mock.calls.length;expect(metrics.inspect()).toBe(result);expect(now).toHaveBeenCalledTimes(calls);
  metrics.setEnabled(false);expect(metrics.inspect()).toBeUndefined();
  metrics.setEnabled(true);expect(metrics.inspect()?.samples).toHaveLength(0);
});

it.each(['fixed','presentation'] as const)('accounts for visibility probes exactly once in %s without changing the result',stage=>{
  const subject:CameraSubjectFacts={id:'person',generation:1,kind:'humanoid',positionWorldMetersXYZ:[0,0,0],geometryQuaternionWorldXYZW:[0,0,0,1],geometryScaleXYZ:[1,1,1],speedMetersPerSecond:0};
  const configuration=resolveCameraConfiguration({kind:'world-camera',schemaVersion:1,defaultViewId:'orbit',binding:{targetEntityId:'person'},views:{orbit:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'},distanceMeters:8},orientation:{initialPitchRadians:0},constraints:{visibility:'preserve-framing'}}}}},
    {subjectId:'person',subjectGeneration:1,subjectKind:'humanoid',availableAnchors:[],headingAvailable:false});
  const proposal=evaluateThirdPerson({subject,configuration:configuration as Parameters<typeof evaluateThirdPerson>[0]['configuration'],deltaSeconds:0,intent:prepareCameraIntent({subject,configuration,deltaSeconds:0})}).proposal;
  const run=(enabled:boolean)=>{
    let clock=0,probes=0,visibilityCalls=0;
    const now=vi.fn(()=>clock),metrics=new CameraPerformance(now);
    const geometry:CameraGeometryProvider=()=>({
      probe:(from,to)=>{probes++;clock++;const distance=Math.hypot(...to.map((value,index)=>value-from[index]!));return {distanceMeters:Math.min(2,distance)};},
      isSubjectVisible:(eye,probe)=>{visibilityCalls++;for(let index=0;index<9;index++)probe(eye,[0,index*.2,0],0);return true;},
    });
    const constraints=new CameraConstraints(geometry,metrics);
    metrics.setEnabled(enabled);constraints.setDiagnosticsEnabled(true);
    const sample=metrics.begin(stage,1,1,1);
    const result=stage==='fixed'
      ?constraints.solve(proposal,configuration,subject,{simulationTick:1,deltaSeconds:1/60,aspect:1,cut:true}).proposal
      :constraints.project(proposal,configuration,subject,1,proposal,1);
    metrics.end(sample);
    expect(visibilityCalls).toBe(1);expect(probes).toBe(11);
    expect(constraints.inspectQueries()![stage]!.probes).toHaveLength(probes);
    if(enabled)expect(metrics.inspect()!.stages[stage]).toEqual({count:1,meanMilliseconds:11,p95Milliseconds:11,maximumMilliseconds:11,queryMilliseconds:11,queryCount:11});
    else {expect(now).not.toHaveBeenCalled();expect(metrics.inspect()).toBeUndefined();}
    return result;
  };
  expect(run(true)).toEqual(run(false));
});
it('degrades a failed auxiliary clock without throwing or retaining old samples',()=>{
  const metrics=new CameraPerformance(()=>{throw new Error('clock gone');});metrics.setEnabled(true);
  expect(()=>metrics.end(metrics.begin('input',1,1,1))).not.toThrow();
  expect(metrics.inspect()).toMatchObject({status:'unavailable',reason:'clock-unavailable',samples:[]});
});
it('measures actual controller phases while leaving canonical poses, history and inputs unchanged',()=>{
  const facts={id:'person',generation:1,kind:'ordinary',positionWorldMetersXYZ:[0,0,0] as const,geometryQuaternionWorldXYZW:[0,0,0,1] as const,geometryScaleXYZ:[1,1,1] as const,speedMetersPerSecond:0};
  const make=()=>new CameraController({sampleSubject:()=>facts,geometry:()=>({probe:(from,to)=>({distanceMeters:Math.hypot(...to.map((n,i)=>n-from[i]!))})})});
  const a=make(),b=make();const frame={simulationTick:0,lifecycleGeneration:1,aspect:1};
  const configuration=parseCameraDocument({kind:'world-camera',schemaVersion:1,activation:'immediate',defaultViewId:'orbit',binding:{targetEntityId:'person'},views:{orbit:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'}},orientation:{recenter:{enabled:false}}}}}});
  try {
    a.install(configuration,frame);b.install(configuration,frame);b.setPerformanceDiagnosticsEnabled(true);
    for(let tick=1;tick<=30;tick++){
      for(const controller of [a,b]){
        controller.prepareInput({orbitDeltaRadiansXY:[.01,0]},1/60,{...frame,simulationTick:tick});controller.evaluateAndCommit({...frame,simulationTick:tick});
      }
      const before=b.inspect();
      expect(b.sampleProjection({epoch:0,previousTick:tick-1,currentTick:tick,alpha:.5,cut:false},1)).toEqual(a.sampleProjection({epoch:0,previousTick:tick-1,currentTick:tick,alpha:.5,cut:false},1));
      expect(b.inspect().current).toEqual(before.current);
      expect(b.inspect().intent).toEqual(a.inspect().intent);
    }
    const reading=b.inspect();expect(reading.current).toEqual(a.inspect().current);
    expect(reading.performance?.stages.input?.count).toBe(30);expect(reading.performance?.stages.fixed?.queryCount).toBeGreaterThan(0);
    expect(reading.performance?.stages.presentation?.count).toBe(30);
    expect(b.inspect()).toBe(reading);
    b.setPerformanceDiagnosticsEnabled(false);expect(b.inspect()).toEqual(a.inspect());
  }finally{a.dispose();b.dispose();}
});
