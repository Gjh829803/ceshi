import baseline from '../../test-fixtures/camera/main-native-trajectories.json';
import {createHumanoidCameraDocument} from '../config/camera';
import { CameraCollisionSolver } from '@worldkit/camera-collision';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { createMountedFixture } from './mounted-test-fixture';
import { describe, expect, it, vi } from 'vitest';
import { createWorld } from '../world';
import { humanoidHost } from './host-access';
import { emptyInput } from './simulation';
import type { EnvironmentDefinition } from './environment/types';

const map: EnvironmentDefinition = {
  id: 'opening', name: 'Opening', description: '',
  bounds: { min: [-50, -10, -50], max: [50, 50, 50] },
  boxes: [{ id: 'floor', position: [0, -.5, 0], size: [100, 1, 100] }],
  water: [], regions: [], spawns: [], playerSpawn: [0, .03, 0],
};
async function fixture(boxes: EnvironmentDefinition['boxes'] = map.boxes) {
  const world = await createWorld({ camera: new PerspectiveCamera(), navigation: false, assetDefinitions: {},
    humanoid: { map: { ...map, boxes }, character: { instanceId: 'person', object: new Group() }, vehicles: [] } });
  world.useAuthoredCamera();
  const camera = world.camera as PerspectiveCamera;
  camera.position.set(0, 2.15, -5.4); camera.lookAt(0, -3.5, 90); camera.rotateZ(.09);
  camera.fov = 48; camera.near = .12; camera.far = 830; camera.updateProjectionMatrix();
  return world;
}


describe('Humanoid opening facing', () => {
  it.each([[0,2,6],[6,3,0],[-4,2,-6]])('faces away from the final camera without changing its framing (%j)', async (x,y,z) => {
    const world=await fixture();
    try {
      world.camera.position.set(x,y,z);world.camera.lookAt(0,1,0);
      const opening=world.camera.clone();world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'person'},activation:'on-input',transition:{durationSeconds:0},views:{'third-person':{kind:'third-person',overrides:{framing:{kind:'preserve-opening'},position:{armHalfLifeSeconds:0},zoom:{range:{kind:'unbounded'},halfLifeSeconds:0}}}}}});world.step({},0);
      const runtime=world.humanoid!,expected=runtime.simulation.controlledActor.player.position.clone().sub(opening.position).setY(0).normalize();
      expect(runtime.simulation.controlledActor.controller.facing.dot(expected)).toBeCloseTo(1,8);
      const yaw=runtime.simulation.controlledActor.player.yaw;
      const restore=humanoidHost(runtime).present({epoch:0,previousTick:Math.max(0,world.simulationTick-1),currentTick:world.simulationTick,alpha:.5,cut:false});restore();
      expect(runtime.simulation.controlledActor.player.yaw).toBe(yaw);
      expect(world.camera.position.distanceTo(opening.position)).toBeLessThan(1e-7);
      expect(world.camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
      world.step({moveXRatio:1},30);
      await world.reset();
      expect(runtime.simulation.controlledActor.player.yaw).toBe(yaw);
      expect(world.camera.position.distanceTo(opening.position)).toBeLessThan(1e-7);
      // Episode chooses a segment's facing independently; reset still restores the opening.
      humanoidHost(runtime).prepareEpisodeStart({positionWorldMetersXYZ:[2,.03,2],facingYawRadians:Math.PI/2});
      expect(runtime.simulation.controlledActor.controller.facing.x).toBeCloseTo(-1,8);
      await world.reset();expect(runtime.simulation.controlledActor.player.yaw).toBe(yaw);
    } finally {world.dispose();}
  });

  it('preserves an explicit public facing across camera edits and reset', async () => {
    const camera=new PerspectiveCamera();camera.position.set(0,2,6);camera.lookAt(0,1,0);
    const world=await createWorld({camera,navigation:false,assetDefinitions:{},humanoid:{map,vehicles:[],character:{instanceId:'person',object:new Group(),facingYawRadians:Math.PI/2}}});
    try {
      expect(world.humanoid!.simulation.controlledActor.controller.facing.x).toBeCloseTo(-1,8);
      camera.position.set(-6,3,2);world.useAuthoredCamera();world.step({},0);
      expect(world.humanoid!.simulation.controlledActor.controller.facing.x).toBeCloseTo(-1,8);
      world.step({moveZRatio:1},30);await world.reset();
      expect(world.humanoid!.simulation.controlledActor.controller.facing.x).toBeCloseTo(-1,8);
    } finally {world.dispose();}
  });

  it('keeps an explicitly prepared heading and handles a vertical camera deterministically', async () => {
    const world=await fixture();
    try {
      world.camera.position.set(0,10,0);world.camera.lookAt(0,0,0);world.step({},0);
      expect(Number.isFinite(world.humanoid!.simulation.controlledActor.player.yaw)).toBe(true);
    } finally {world.dispose();}
    const prepared=await fixture();
    try {
      prepared.humanoid!.prepareCharacter([0,.03,0],.7);prepared.step({},0);
      expect(prepared.humanoid!.simulation.controlledActor.player.yaw).toBeCloseTo(.7,8);
      await prepared.reset();expect(prepared.humanoid!.simulation.controlledActor.player.yaw).toBeCloseTo(.7,8);
    } finally {prepared.dispose();}
  });
});

// Captured from the real pre-refactor runtime, not regenerated from this solver.
it.each(baseline.cases)('matches main native camera trajectory: $scene / $action',async({scene,action,samples})=>{
 const boxes:EnvironmentDefinition['boxes'][number][]=[{id:'ground',position:[0,-.5,0],size:[180,1,180]}];
 if(scene==='wall'||scene==='corner')boxes.push({id:'wall-x',position:[1,2,0],size:[.2,4,18]});
 if(scene==='corner')boxes.push({id:'wall-z',position:[0,2,1],size:[18,4,.2]});
 if(scene==='corridor')for(const x of [-1.5,1.5])boxes.push({id:'wall-'+x,position:[x,2,0],size:[.2,4,18]});
 const world=await createWorld({camera:new PerspectiveCamera(58,1000/700,.08,200),navigation:false,assetDefinitions:{},humanoid:{map:{...map,boxes},character:{instanceId:'person',object:new Group()},vehicles:[]}});
 try{
  humanoidHost(world.humanoid!).prepareEpisodeStart({positionWorldMetersXYZ:[0,.03,0],facingYawRadians:Math.PI});
  world.setCameraFollow({configuration:createHumanoidCameraDocument('person')});
  // Episode prepare performs one empty fixed step before accepting input.
  world.step({},1);
  const checkpoints=new Map(samples.map(sample=>[sample.tick,sample]));
  for(let tick=0;tick<baseline.steps;tick++){
   const yaw=action==='orbit'?(tick<60?0:tick<240?1:tick<420?-1:0):action==='walk-turn'?(tick>=120&&tick<240?.6:0):0;
   const pitch=action==='pitch'?(tick>=60&&tick<180?.4:tick>=240&&tick<360?-.4:0):0;
   world.step({humanoid:{...emptyInput(),forward:action==='walk-turn'&&tick<360?1:0},cameraYawRatio:yaw,cameraPitchRatio:pitch},1);
   const expected=checkpoints.get(tick);if(!expected)continue;
   expect(world.camera.position.distanceTo(new Vector3(...expected.position)),`eye at ${tick}`).toBeLessThan(2e-5);
   expect(world.camera.quaternion.angleTo(new Quaternion(...expected.quaternion)),`orientation at ${tick}`).toBeLessThan(2e-7);
   expect(new Vector3(...world.getEntityState('person').positionWorldMetersXYZ).distanceTo(new Vector3(...expected.actor)),`actor at ${tick}`).toBeLessThan(2e-5);
  }
 }finally{world.dispose();}
},20000);
