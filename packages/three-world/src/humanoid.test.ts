import {readFile} from 'node:fs/promises';
import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import catalog from '../../../assets/three-creator/asset-catalog.json';
import {createHumanoidWorld,type HumanoidAssetDefinition} from './humanoid';
import {createWorld,type ThreeWorld} from './world';
import type {EnvironmentDefinition} from './humanoid-runtime/environment/types';
import {Character} from './humanoid-runtime/character';

const worlds:ThreeWorld[]=[];
const map:EnvironmentDefinition={id:'room',name:'Room',description:'Supported floor',bounds:{min:[-30,-5,-30],max:[30,20,30]},boxes:[{id:'floor',position:[0,-.5,0],size:[60,1,60]}],water:[],regions:[],spawns:[],playerSpawn:[0,.04,0]};
afterEach(()=>{for(const world of worlds.splice(0))world.dispose();vi.unstubAllGlobals();});

it('uses explicit standalone resources without requiring a Creator catalog',async()=>{
  vi.stubGlobal('document',{baseURI:'https://standalone.test/'});
  const fetch=vi.fn(async()=>new Response(null,{status:404}));vi.stubGlobal('fetch',fetch);
  const character=new Character();const resourceUrl=(path:string)=>`https://resources.test/${path}`;
  const load=vi.spyOn(character,'load').mockImplementation(async resolver=>{
    expect(resolver).toBe(resourceUrl);throw new Error('RESOURCE_LOAD_FAILURE');
  });
  const dispose=vi.spyOn(character,'dispose');
  await expect(createHumanoidWorld({map,resourceUrl,character})).rejects.toThrow('RESOURCE_LOAD_FAILURE');
  expect(load).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();expect(dispose).toHaveBeenCalledOnce();
});

it('loads the complete humanoid and performs a physical action through the public world',async()=>{
  const definition=catalog.assets.find(asset=>asset.id==='humanoid.source-101')!;
  const resources=new Map(definition.resources!.map(resource=>[resource.path,resource.sourcePath]));
  vi.stubGlobal('ProgressEvent',class extends Event{constructor(type:string,init:object){super(type);Object.assign(this,init);}});
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
    const uri=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const logical=decodeURIComponent(new URL(uri).pathname.slice(1));
    const file=resources.get(logical);if(!file)throw new Error(`Unexpected resource ${logical}`);
    return new Response(await readFile(file));
  }));
  const camera=new THREE.PerspectiveCamera(55,1,.05,200);camera.position.set(3,3,6);camera.lookAt(0,1,0);
  const world=await createHumanoidWorld({scene:new THREE.Scene(),camera,map,characterId:'person',assetDefinitions:{[definition.id]:definition as unknown as HumanoidAssetDefinition},resourceUrl:path=>`https://humanoid.test/${path}`});worlds.push(world);
  expect(world).toHaveProperty('humanoid');
  const animation=world.humanoid!.options.character.animation!;
  expect(animation.availableHumanoidClips.size).toBe(48);
  expect(world.snapshot().controlledEntityId).toBe('person');
  const bounds=new THREE.Box3().setFromObject(animation.root,true);expect(bounds.getSize(new THREE.Vector3()).y).toBeGreaterThan(1.5);
  world.step({},30);
  const start=world.getEntityState('person').positionWorldMetersXYZ;
  const receipt=await world.execute({type:'humanoid.perform-action',request:{requestId:'roll-once',action:'roll'}});
  expect(receipt.status).toBe('accepted');world.step({},120);
  if(receipt.status==='accepted')expect(world.operations.get(receipt.operationId).status).toBe('succeeded');
  const end=world.getEntityState('person').positionWorldMetersXYZ;
  expect(Math.hypot(end[0]-start[0],end[2]-start[2])).toBeGreaterThan(1);
  await world.reset();world.step({},30);
  expect(world.snapshot().humanoid?.character.activeAction).toBeNull();
  expect(world.snapshot().errors).toEqual([]);
  // Breaking API rename: old commands must not reach the controller.
  expect(await world.execute({type:'training.action',request:{requestId:'legacy-roll',action:'roll'}} as never)).toMatchObject({status:'rejected'});
  expect(world).not.toHaveProperty('training');
  expect(world).not.toHaveProperty('player');
  expect(await world.execute({type:'character.perform-action',request:{requestId:'old-character-roll',action:'roll'}} as never)).toMatchObject({status:'rejected'});
  expect(world.snapshot()).not.toHaveProperty('player');
  expect(world.snapshot()).not.toHaveProperty('training');

});

it('binds an authored non-human mesh to a custom movement intent with real collision',async()=>{
  const world=await createWorld({scene:new THREE.Scene(),navigation:false,assetDefinitions:{}});worlds.push(world);
  world.registerMovement({id:'hover',version:1,description:'Horizontal hover intent',initialState:null,update:context=>({state:null,velocityWorldMetersPerSecondXYZ:[(context.input.moveXRatio??0)*3,0,0],applyGravity:false})});
  const subject=new THREE.Mesh(new THREE.IcosahedronGeometry(.4),new THREE.MeshStandardMaterial());subject.position.set(0,1,0);
  world.addCharacter({id:'orb',object:subject,body:{heightMeters:.8,radiusMeters:.35},movement:{kind:'custom',movementId:'hover'}});
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.4,4,8));wall.position.set(2,1,0);world.addEntity({id:'wall',object:wall,role:'obstacle'});
  world.setControlledEntity('orb');world.step({moveXRatio:1},120);
  const state=world.getEntityState('orb');expect(state.positionWorldMetersXYZ[0]).toBeGreaterThan(1);expect(state.positionWorldMetersXYZ[0]).toBeLessThan(1.8);expect(state.positionWorldMetersXYZ[1]).toBeCloseTo(1,2);
  expect(state.motion?.collisionEntityIds).toContain('wall');
  subject.geometry.dispose();(subject.material as THREE.Material).dispose();wall.geometry.dispose();(wall.material as THREE.Material).dispose();
});
