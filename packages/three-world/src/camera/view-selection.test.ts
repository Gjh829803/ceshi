import {expect,it} from 'vitest';
import {selectCameraView} from './view-selection';
import type {CameraViewSelectionMemory} from './view-selection';
const rules=[{id:'swim',when:{state:'swimming' as const},viewId:'water',enterDelaySeconds:.1,exitDelaySeconds:.1}];
const run=(swimming:boolean|undefined,memory:CameraViewSelectionMemory={},current='default',dt=.05)=>selectCameraView({rules,defaultViewId:'default',currentViewId:current,states:swimming===undefined?undefined:{swimming},memory,deltaSeconds:dt,available:()=>({available:true})});
it('debounces state transitions without restarting an unchanged selection',()=>{
 let a=run(true);expect(a.viewId).toBe('default');
 a=run(true,a.memory);expect(a.viewId).toBe('water');expect(a.inspection.ruleId).toBe('swim');
 a=run(true,a.memory,'water');expect(a.memory.pending).toBeUndefined();
 const brief=run(false,a.memory,'water');expect(brief.viewId).toBe('water');
 expect(run(true,brief.memory,'water').memory.pending).toBeUndefined();
 const leaving=run(false,brief.memory,'water');expect(leaving.viewId).toBe('default');
});
it('pins manual choice until its owner clears it',()=>{
 const a=run(true,{manualViewId:'close'});expect(a.viewId).toBe('close');expect(a.inspection.source).toBe('manual');
 expect(run(true,{},'close',.1).viewId).toBe('water');
});
it('uses priority then document order and reports unavailable rules locally',()=>{
 const base={defaultViewId:'default',currentViewId:'default',memory:{},deltaSeconds:0,states:{swimming:true}};
 const competing=[{...rules[0]!,enterDelaySeconds:0},{id:'priority',when:{state:'swimming' as const},viewId:'close',priority:2},{id:'tie',when:{state:'swimming' as const},viewId:'other',priority:2}];
 expect(selectCameraView({...base,rules:competing,available:()=>({available:true})}).viewId).toBe('close');
 const skipped=selectCameraView({...base,rules:competing,available:id=>({available:id!=='close'})});
 expect(skipped.viewId).toBe('other');expect(skipped.inspection.unavailableRules).toContainEqual({ruleId:'priority',viewId:'close',reason:'view-unavailable'});
 expect(run(undefined).inspection.unavailableRules).toEqual([{ruleId:'swim',viewId:'water',reason:'state-unavailable'}]);
});
it('retains a legal current view when the default is unavailable',()=>{
 const result=selectCameraView({rules,defaultViewId:'default',currentViewId:'close',states:{swimming:false},memory:{},deltaSeconds:0,available:id=>({available:id==='close'})});
 expect(result.viewId).toBe('close');expect(result.inspection.source).toBe('retained');expect(result.inspection.unavailableDefaultView).toEqual({viewId:'default'});
});

import {CameraController} from './controller';
import {parseCameraDocument} from '../config/camera';
import type {CameraSubjectFacts} from './subject';
function fixture(extra:Record<string,unknown>={}) {
 let subject:CameraSubjectFacts={id:'person',generation:1,kind:'humanoid',body:{minimumHeightMeters:0,maximumHeightMeters:1.8},positionWorldMetersXYZ:[0,0,0],geometryQuaternionWorldXYZW:[0,0,0,1],geometryScaleXYZ:[1,1,1],speedMetersPerSecond:0,states:{swimming:false}};
 let tick=0;
 const frame=()=>({simulationTick:tick,lifecycleGeneration:1,aspect:1});
 const controller=new CameraController({sampleSubject:()=>subject,geometry:()=>({probe:(a,b)=>({distanceMeters:Math.hypot(...a.map((v,i)=>v-b[i]!))})})});
 const base={kind:'third-person',overrides:{position:{anchor:{kind:'origin'},distanceMeters:6,armHalfLifeSeconds:0},constraints:{collision:{enabled:false}},orientation:{recenter:{enabled:false}}}};
 const document=parseCameraDocument({kind:'world-camera',schemaVersion:1,activation:'immediate',defaultViewId:'default',binding:{targetEntityId:'person'},views:{default:base,water:{...base,overrides:{...base.overrides,position:{...base.overrides.position,distanceMeters:4}}}},viewSelection:{rules:[{id:'swim',when:{state:'swimming'},viewId:'water'}]},...extra});
 controller.install(document,frame());controller.commitBaseline();
 return {controller,document,frame,subject:()=>subject,replace:(value:CameraSubjectFacts)=>{subject=value;},set:(value:Partial<CameraSubjectFacts>)=>{subject={...subject,...value};},
  step:(input={})=>{tick++;controller.prepareInput(input,1/60,frame());return controller.evaluateAndCommit(frame());},
  prepare:()=>{tick++;controller.prepareInput({},1/60,frame());}};
}
it('commits automatic selection with input once and retains orbit during repeated state frames',()=>{
 const f=fixture();try{
  f.set({states:{swimming:true}});const revision=f.controller.inspect().cameraCommitRevision;
  f.prepare();expect(f.controller.inspect().resolved!.viewId).toBe('default');
  f.controller.evaluateAndCommit(f.frame());expect(f.controller.inspect().resolved!.viewId).toBe('water');
  expect(f.controller.inspect().cameraCommitRevision).toBe(revision+1);
  f.step({orbitDeltaRadiansXY:[.3,0]});const yaw=f.controller.inspect().intent!.yawRadians;
  f.step();expect(f.controller.inspect().intent!.yawRadians).toBe(yaw);
  const before=f.controller.inspect();for(let n=0;n<10;n++)expect(f.controller.inspect()).toBe(before);
  f.set({states:{swimming:false}});f.step();expect(f.controller.inspect().resolved!.viewId).toBe('default');
 }finally{f.controller.dispose();}
});
it('does not commit selection timers when prepared input is aborted',()=>{
 const f=fixture({viewSelection:{rules:[{id:'swim',when:{state:'swimming'},viewId:'water',enterDelaySeconds:1/30}]}});try{
  f.set({states:{swimming:true}});const before=f.controller.inspect();f.prepare();f.controller.abortPreparedInput();expect(f.controller.inspect()).toBe(before);
  f.step();expect(f.controller.inspect().resolved!.viewId).toBe('default');f.step();expect(f.controller.inspect().resolved!.viewId).toBe('water');
 }finally{f.controller.dispose();}
});
it('preserves manual priority, rejects invalid choices transactionally, and resumes current state',()=>{
 const f=fixture();try{
  f.set({states:{swimming:true}});f.step();f.controller.setView('default',f.frame());f.step();expect(f.controller.inspect().viewSelection?.source).toBe('manual');
  const before=f.controller.inspect();expect(()=>f.controller.setView('missing',f.frame())).toThrow();expect(f.controller.inspect()).toBe(before);
  f.controller.resumeViewSelection(f.frame());expect(f.controller.inspect().resolved!.viewId).toBe('water');
  f.controller.reset(f.frame());expect(f.controller.inspect().resolved!.viewId).toBe('default');f.step();expect(f.controller.inspect().resolved!.viewId).toBe('water');
 }finally{f.controller.dispose();}
});
it('suspends for an owner and does not take over authored cameras',()=>{
 const f=fixture();try{
  f.set({states:{swimming:true}});const release=f.controller.suspendViewSelection('episode');f.step();expect(f.controller.inspect().resolved!.viewId).toBe('default');expect(f.controller.inspect().viewSelection?.suspendedBy).toBe('episode');
  release();f.step();expect(f.controller.inspect().resolved!.viewId).toBe('water');
  f.controller.useAuthored();expect(f.controller.inspect().mode).toBe('authored');expect(()=>f.controller.resumeViewSelection(f.frame())).toThrow('CAMERA_FOLLOW_REQUIRED');
 }finally{f.controller.dispose();}
});
it('skips a rule requiring unavailable subject anchors without poisoning the current camera',()=>{
 const f=fixture({views:{default:{kind:'third-person',overrides:{constraints:{collision:{enabled:false}}}},water:{kind:'first-person'}}});try{
  f.set({states:{swimming:true}});f.step();expect(f.controller.inspect().resolved!.viewId).toBe('default');expect(f.controller.inspect().viewSelection?.unavailableRules).toEqual([{ruleId:'swim',viewId:'water',reason:'view-unavailable',failure:{code:'CAMERA_CONFIGURATION_INVALID',fieldPath:'/views/water/position/anchor',message:'/views/water/position/anchor: eye anchor unavailable on subject person'}}]);
 }finally{f.controller.dispose();}
});
it('validates rule references, IDs and delays before installation',()=>{
 const f=fixture();try{
  for(const patch of [{viewId:'missing'},{enterDelaySeconds:-1},{priority:1.5},{when:{state:'guessed'}}])expect(()=>parseCameraDocument({...f.document,viewSelection:{rules:[{...f.document.viewSelection!.rules[0],...patch}]}})).toThrow();
  expect(()=>parseCameraDocument({...f.document,viewSelection:{rules:[...f.document.viewSelection!.rules,...f.document.viewSelection!.rules]}})).toThrow();
 }finally{f.controller.dispose();}
});

it('returns to the new subject default before admitting an old state-specific view',()=>{
 const f=fixture({views:{default:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'}},constraints:{collision:{enabled:false}}}},water:{kind:'first-person',overrides:{constraints:{collision:{enabled:false}}}}}});
 try{
  f.set({states:{swimming:true},eyeWorldMetersXYZ:[0,1,0]});f.step();expect(f.controller.inspect().resolved!.viewId).toBe('water');
  const previousSubject=f.subject();const {eyeWorldMetersXYZ:_,...vehicle}=previousSubject;
  const next={...vehicle,id:'vehicle',generation:2,kind:'vehicle',states:{swimming:false}};
  f.set(next);f.controller.applyLifecycle({operationId:'mount',kind:'retarget',previousSubject,subject:next},f.frame());
  expect(f.controller.inspect().resolved!.viewId).toBe('default');expect(f.controller.inspect().resolved!.subjectId).toBe('vehicle');
 }finally{f.controller.dispose();}
});

it('retains a compatible current view when the replacement subject lacks the default anchor',()=>{
 const f=fixture({views:{default:{kind:'third-person',overrides:{constraints:{collision:{enabled:false}}}},water:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'}},constraints:{collision:{enabled:false}}}}}});
 try{
  f.set({states:{swimming:true}});f.step();const previousSubject=f.subject();const {body:_,...bodyless}=previousSubject;
  const next={...bodyless,id:'other',generation:2,kind:'ordinary',states:{swimming:false}};
  f.replace(next);
  const actual=f.subject();
  f.controller.applyLifecycle({operationId:'replace',kind:'retarget',previousSubject,subject:actual},f.frame());
  expect(f.controller.inspect().resolved!.viewId).toBe('water');expect(f.controller.inspect().viewSelection?.source).toBe('retained');
 }finally{f.controller.dispose();}
});

it('does not retain an unavailable automatic view for its exit delay',()=>{
 const f=fixture({viewSelection:{rules:[{id:'swim',when:{state:'swimming'},viewId:'water',exitDelaySeconds:1}]},views:{default:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'}},constraints:{collision:{enabled:false}}}},water:{kind:'first-person',overrides:{constraints:{collision:{enabled:false}}}}}});
 try{
  f.set({states:{swimming:true},eyeWorldMetersXYZ:[0,1,0]});f.step();expect(f.controller.inspect().resolved!.viewId).toBe('water');
  const {eyeWorldMetersXYZ:_,...withoutEye}=f.subject();f.replace(withoutEye);
  expect(()=>f.step()).not.toThrow();
  expect(f.controller.inspect().resolved!.viewId).toBe('default');
  expect(f.controller.inspect().viewSelection?.unavailableRules).toEqual([{ruleId:'swim',viewId:'water',reason:'view-unavailable',failure:{code:'CAMERA_CONFIGURATION_INVALID',fieldPath:'/views/water/position/anchor',message:'/views/water/position/anchor: eye anchor unavailable on subject person'}}]);
 }finally{f.controller.dispose();}
});

it('invalidates pending rules on document changes and restores them with a checkpoint',()=>{
 const f=fixture({viewSelection:{rules:[{id:'swim',when:{state:'swimming'},viewId:'water',enterDelaySeconds:1/30}]}});
 try{
  f.set({states:{swimming:true}});f.step();
  const checkpoint=f.controller.captureCheckpoint();
  expect(checkpoint.inspection.viewSelection?.pending?.elapsedSeconds).toBeCloseTo(1/60);
  f.controller.install({...f.document,viewSelection:{rules:[]}},f.frame());f.step();
  expect(f.controller.inspect().viewSelection?.pending).toBeUndefined();
  f.controller.restoreCheckpoint(checkpoint,f.controller.inspect().cameraCommitRevision);
  f.step();expect(f.controller.inspect().resolved!.viewId).toBe('water');
 }finally{f.controller.dispose();}
});

it('preserves orbit heading across automatic changes while adopting the destination framing',()=>{
 const f=fixture();
 try{
  f.set({semanticQuaternionWorldXYZW:[0,0,0,1]});
  f.step({orbitDeltaRadiansXY:[.4,0]});
  const before=f.controller.inspect().intent!;
  // Backwards movement turns the actor around without turning the orbit camera.
  f.set({states:{swimming:true},semanticQuaternionWorldXYZW:[0,1,0,0]});f.step();
  expect(f.controller.inspect().intent!.yawRadians).toBeCloseTo(before.yawRadians);
  expect(f.controller.inspect().intent!.distanceMeters).toBe(4);
  f.set({states:{swimming:false}});f.step();
  expect(f.controller.inspect().intent!.yawRadians).toBeCloseTo(before.yawRadians);
  expect(f.controller.inspect().intent!.distanceMeters).toBe(6);
  f.controller.setView('water',f.frame());
  expect(Math.abs(f.controller.inspect().intent!.yawRadians)).toBeCloseTo(Math.PI);
 }finally{f.controller.dispose();}
});

it('selects a matching rule in the first activating input while preserving an idle opening',()=>{
 const f=fixture({activation:'on-input'});
 try{
  f.set({states:{swimming:true}});f.step();
  expect(f.controller.inspect()).toMatchObject({mode:'follow-pending',resolved:{viewId:'default'}});
  const revision=f.controller.inspect().cameraCommitRevision;
  f.step({movement:true});
  expect(f.controller.inspect()).toMatchObject({mode:'follow',resolved:{viewId:'water'},cameraCommitRevision:revision+1});
 }finally{f.controller.dispose();}
});
