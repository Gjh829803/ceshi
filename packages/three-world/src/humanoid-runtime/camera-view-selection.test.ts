import {expect,it} from 'vitest';
import {Group} from 'three';
import {createWorld,createHumanoidCameraDocument} from '../index';

it('uses native swimming facts, preserves untouched preset values, and resumes after editing',async()=>{
 const world=await createWorld({navigation:false,assetDefinitions:{},humanoid:{map:{id:'selection',name:'Selection',description:'',bounds:{min:[-50,-10,-50],max:[50,50,50]},boxes:[{id:'floor',position:[0,-.5,0],size:[100,1,100]}],water:[{id:'pool',min:[-5,-10,-5],max:[5,2,5],surface:2}],regions:[],spawns:[],playerSpawn:[0,.03,0]},character:{instanceId:'person',object:new Group()},vehicles:[]}});
 try{
  const baseline=createHumanoidCameraDocument('person');
  const document={...baseline,viewSelection:{rules:[{id:'swim',when:{state:'swimming' as const},viewId:'water'}]},views:{...baseline.views,water:{kind:'third-person' as const,presetId:'humanoid.third-person',overrides:{position:{distanceMeters:5}}}}};
  world.setCameraFollow({configuration:document});world.step({},3);
  expect(world.humanoid!.simulation.controlledActor.controller.swimming).toBe(true);
  expect(world.snapshot().camera.viewId).toBe('water');
  expect(world.inspectCamera().resolved!.values.position).toHaveProperty("distanceMeters",5);
  expect(world.inspectCamera().resolved!.fields['position.anchorHalfLifeSeconds']?.source).toBe('view-preset');
  const before=world.snapshot();for(let n=0;n<5;n++)world.inspectCamera();expect(world.snapshot()).toEqual(before);
  world.setCameraView('third-person');world.step({},2);expect(world.snapshot().camera.viewId).toBe('third-person');
  world.resumeCameraViewSelection();expect(world.snapshot().camera.viewId).toBe('water');
  world.setCameraView('third-person');world.resumeCameraViewSelection();
  const edit=world.beginCameraEdit();edit.applyDraft(document,world.inspectCamera().configurationRevision);
  world.setCameraView('third-person');world.resumeCameraViewSelection();world.step({},2);
  expect(world.snapshot().camera.viewId).toBe('third-person');expect(world.inspectCamera().viewSelection?.suspendedBy).toBe('editing');
  edit.dispose();world.step({},1);expect(world.snapshot().camera.viewId).toBe('water');
  expect(world.humanoid!.prepareCharacter([20,.025,0],0)).toBe(true);
  world.step({},3);expect(world.snapshot().camera.viewId).toBe('third-person');
 }finally{world.dispose();}
});

it('keeps backwards input directed out of the water when the automatic view returns to default',async()=>{
 const world=await createWorld({navigation:false,assetDefinitions:{},humanoid:{map:{id:'selection-direction',name:'Selection direction',description:'',bounds:{min:[-50,-10,-50],max:[50,50,50]},boxes:[{id:'floor',position:[0,-.5,0],size:[100,1,100]}],water:[{id:'pool',min:[-20,-10,-20],max:[20,2,3],surface:2}],regions:[],spawns:[],playerSpawn:[0,.03,8]},character:{instanceId:'person',object:new Group()},vehicles:[]}});
 try{
  world.setControlledEntity('person');
  expect(world.humanoid!.prepareCharacter([0,.03,8],Math.PI)).toBe(true);
  const baseline=createHumanoidCameraDocument('person');
  world.setCameraFollow({configuration:{
   ...baseline,
   transition:{durationSeconds:.25},
   viewSelection:{rules:[{id:'swim',when:{state:'swimming'},viewId:'water',enterDelaySeconds:.1,exitDelaySeconds:.15}]},
   views:{...baseline.views,water:{kind:'third-person',presetId:'humanoid.third-person',overrides:{position:{distanceMeters:5}}}},
  }});
  world.step({moveZRatio:-1},300);
  expect(world.snapshot().camera.viewId).toBe('water');
  const yaw=world.snapshot().camera.desiredYawRadians!;
  for(let tick=0;tick<360;tick++){
   world.step({moveZRatio:1},1);
   expect(world.snapshot().camera.desiredYawRadians).toBeCloseTo(yaw);
  }
  expect(world.getEntityState('person').positionWorldMetersXYZ[2]).toBeGreaterThan(6);
  expect(world.snapshot().camera.viewId).toBe('third-person');
  expect(world.humanoid!.simulation.controlledActor.controller.swimming).toBe(false);
 }finally{world.dispose();}
});
