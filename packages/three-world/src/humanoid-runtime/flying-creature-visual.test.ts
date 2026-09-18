import {testAssetResourceUrl} from '../test-asset-library';
import {createHumanoidCameraDocument} from '../config/camera/index';
import {parseFixtureGlb} from './textured-glb-fixture';
import {fileURLToPath} from 'node:url';
import RAPIER from '@dimforge/rapier3d-compat';
import type {WorldEngine} from '../engine';
import {Character} from './character';
import {createWorld} from '../world';
import {createFlyingCreatureSpec} from './motion-families/flying-creature/controller';
import {createDragonTrainingMap} from '@worldkit/preset-content/environment/dragon-training';
import {emptyInput} from './simulation';
import {readFileSync} from 'node:fs';
import {afterEach,expect,it,vi} from 'vitest';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FlyingCreatureVisual} from './motion-families/flying-creature/visual';
import {createFlyingCreatureStateV1} from './motion-families/flying-creature/state';
import {CreatureFlame} from './motion-families/flying-creature/flame';
import type {MotionPose} from './presentation';
import {DRAGON_VARIANTS} from '@worldkit/preset-content/dragon-variants';
import {getDefaultProfile,parseAssetProfile} from '@worldkit/preset-content/platform/profiles';
afterEach(()=>{vi.restoreAllMocks();});
async function fixture(id='D01'){
  vi.stubGlobal('ProgressEvent',class{constructor(public type:string){}});
  const variant=DRAGON_VARIANTS.find(v=>v.id===id)!;
  const bytes=readFileSync(new URL(testAssetResourceUrl(`flying-creatures/${variant.id}/model.glb`)));
  const model=await parseFixtureGlb(bytes);
  vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue(model);vi.spyOn(T.TextureLoader.prototype,'loadAsync').mockResolvedValue(new T.Texture());
  const visual=new FlyingCreatureVisual();await visual.load({dragonUrl:'fixture',flameTextureUrl:'fixture',animationPrefix:id});
  const pose:MotionPose={position:new T.Vector3(),rotation:new T.Quaternion(),velocity:new T.Vector3(),yaw:0,speed:0,steering:0,flyingCreature:createFlyingCreatureStateV1()};
  return {visual,pose,model};
}
it.each(DRAGON_VARIANTS.map(v=>v.id))('%s protects real torso, neck and head skin in ordinary flight while leaving tips free',async id=>{
  const {visual,pose}=await fixture(id),meshes:T.SkinnedMesh[]=[];
  visual.root.traverse(n=>{if(n instanceof T.SkinnedMesh)meshes.push(n);});
  const variant=DRAGON_VARIANTS.find(v=>v.id===id)!;
  try{
    let worst=-Infinity,outsideTips=0,checked=0,detail:unknown;
    for(const mode of ['hover','cruise','boost','ground'] as const)for(let frame=0;frame<17;frame++){
      const probes=(mode==='ground'?variant.ground!.probes:variant.collisionProbes!).map(p=>({center:new T.Vector3(...p.center),radius:p.radius}));
      Object.assign(pose.flyingCreature!,{mode:mode==='ground'?'hover':mode,groundBlend:mode==='ground'?1:0,bankRadians:0,pitchRadians:0});pose.speed=mode==='hover'||mode==='ground'?0:mode==='cruise'?18:31;
      visual.sample(pose,(frame+.37)/17*2.3);visual.root.updateMatrixWorld(true);
      for(const mesh of meshes){
        const mat=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
        if(/1003|hair|fur/i.test(mat?.name??''))continue;
        mesh.skeleton.update();
        const indices=mesh.geometry.attributes.skinIndex!,weights=mesh.geometry.attributes.skinWeight!;
        for(let n=0;n<indices.count;n+=13){
          let core=0,total=0;
          for(let axis=0;axis<4;axis++){const w=weights.getComponent(n,axis);total+=w;if(/^(Pelvis|Spine\d*|Neck\d*|Head|Jaw)$/i.test(mesh.skeleton.bones[indices.getComponent(n,axis)]!.name))core+=w;}
          const p=mesh.getVertexPosition(n,new T.Vector3()).applyMatrix4(mesh.matrixWorld);
          const outside=Math.min(...probes.map(probe=>p.distanceTo(probe.center)-probe.radius));
          if(core/total>.65){checked++;if(outside>worst){worst=outside;detail={id,mode,frame,point:p.toArray()};}}
          else if(outside>1)outsideTips++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);expect(outsideTips).toBeGreaterThan(100);
    expect(worst,JSON.stringify(detail)).toBeLessThan(.05);
  }finally{visual.dispose();vi.unstubAllGlobals();}
});
it('flame opens the jaw without shortening the neck and repeated display sampling is stable',async()=>{
  const {visual,pose}=await fixture();try{
    const head=visual.root.getObjectByName('Head')!,jaw=visual.root.getObjectByName('Jaw')!;
    visual.sample(pose,.21);const originalHead=head.matrixWorld.clone(),originalJaw=jaw.quaternion.clone();
    Object.assign(pose.flyingCreature!,{flamePhase:'loop',flamePhaseSeconds:.4});visual.sample(pose,.21);
    expect(head.matrixWorld.elements).toEqual(originalHead.elements);expect(jaw.quaternion.angleTo(originalJaw)).toBeGreaterThan(.01);
    const sample=jaw.quaternion.clone(),seat=visual.readSeatWorld();visual.sample(pose,.4);visual.sample(pose,.21);
    expect(jaw.quaternion.angleTo(sample)).toBeLessThan(1e-7);expect(visual.readSeatWorld().elements).toEqual(seat.elements);
    const size=new T.Vector3();seat.decompose(new T.Vector3(),new T.Quaternion(),size);expect(size.distanceTo(new T.Vector3(1,1,1))).toBeLessThan(1e-7);
  }finally{visual.dispose();vi.unstubAllGlobals();}
});
it('flame history advances only on commits and clears on reset',()=>{
  const flame=new CreatureFlame(new T.Texture()),root=new T.Group();root.add(flame.object);try{
    for(let tick=0;tick<60;tick++)flame.commit(1,tick,tick/60,1,new T.Vector3(),new T.Vector3(0,0,1),new T.Vector3());
    flame.sample(.95,root);const count=flame.object.geometry.drawRange.count,positions=Array.from(flame.object.geometry.attributes.position!.array);
    expect(count).toBeGreaterThan(20);flame.sample(.95,root);expect(flame.object.geometry.drawRange.count).toBe(count);expect(Array.from(flame.object.geometry.attributes.position!.array)).toEqual(positions);
    flame.commit(2,0,0,0,new T.Vector3(),new T.Vector3(0,0,1),new T.Vector3());flame.sample(0,root);expect(flame.object.geometry.drawRange.count).toBe(0);
  }finally{flame.dispose();}
});

it.each(DRAGON_VARIANTS.map(v=>v.id))('%s keeps mounted views at real Source101 eyes through orbit, flight and V switches',async id=>{
  const {visual}=await fixture(id),variant=DRAGON_VARIANTS.find(v=>v.id===id)!;
  vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>{
    const bytes=readFileSync(fileURLToPath(url));return parseFixtureGlb(bytes);
  });
  vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(readFileSync(fileURLToPath(String(input)))));
  const rider=new Character();await rider.load(testAssetResourceUrl);
  const world=await createWorld({camera:new T.PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:createDragonTrainingMap(),
    character:{instanceId:'person',object:rider.root,animation:rider},vehicles:[{instanceId:'dragon',assetId:`creature.dragon.${id.toLowerCase()}`,spec:{...createFlyingCreatureSpec('dragon'),flyingCreatureGround:variant.ground!,...(variant.collisionProbes?{flyingCreatureCollision:variant.collisionProbes}:{})},object:visual.root,flyingVisual:visual}]}});
  try{
    const runtime=world.humanoid!;world.setCameraFollow({configuration:{...createHumanoidCameraDocument('person'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});
    expect(world.snapshot().humanoid?.vehicles[0]?.assetId).toBe(`creature.dragon.${id.toLowerCase()}`);
    runtime.prepareEpisodeStart({positionWorldMetersXYZ:[0,40,0],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'dragon',mounted:true}});
    const document=world.inspectCamera().document!;world.setCameraFollow({configuration:{...document,views:Object.fromEntries(Object.entries(document.views).map(([key,view])=>[key,{...view,overrides:{...view.overrides,position:{...view.overrides?.position,subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0},orientation:{...view.overrides?.orientation,pitchLimitsRadians:{kind:'bounded',minimumRadians:-85*Math.PI/180,maximumRadians:85*Math.PI/180}}}}]))} as import('../config/camera/index').CameraDocument});
    const meshes:T.SkinnedMesh[]=[];rider.root.traverse(n=>{if(n instanceof T.SkinnedMesh)meshes.push(n);});
    const full=meshes.map(mesh=>mesh.geometry.index?.count??0);
    const eye=()=>{const point=new T.Vector3();expect(rider.eyePosition(point)).toBe(true);return point;};
    for(const mode of [0,1,2] as const){
      world.setCameraView(['third-person','first-person','shoulder'][mode]!);
      for(let frame=0;frame<120;frame++)world.step({cameraPitchRatio:-1},1);
      expect(world.camera.getWorldDirection(new T.Vector3()).y,id+':sky view '+mode).toBeGreaterThan(.99);
      expect(world.camera.quaternion.toArray().every(Number.isFinite)).toBe(true);
      if(mode===1)expect(world.camera.position.distanceTo(eye())).toBeLessThan(1e-6);
    }
    world.setCameraView('third-person');
    for(const direction of [-1,1]){
      world.step({cameraTogglePressed:true},1);expect(world.inspectCamera().resolved?.kind).toBe('first-person');
      expect(world.camera.position.distanceTo(eye())).toBeLessThan(1e-6);
      for(let n=0;n<60;n++){
        world.step({cameraYawRatio:direction,cameraPitchRatio:direction,humanoid:{...emptyInput(),steer:direction,boost:true}},1);
        expect(world.camera.position.distanceTo(eye())).toBeLessThan(1e-6);
        const engine=(world as unknown as {engine:WorldEngine}).engine;
        for(const alpha of [.1,.5,.9])engine.withPresentation(()=>{
          expect(world.camera.position.distanceTo(eye())).toBeLessThan(1e-6);
          expect(world.camera.quaternion.toArray().every(Number.isFinite)).toBe(true);
        },alpha);
      }
      const engine=(world as unknown as {engine:WorldEngine}).engine;engine.withPresentation(()=>expect(meshes.some((mesh,i)=>(mesh.geometry.index?.count??0)<full[i]!)).toBe(true));
      expect(meshes.map(mesh=>mesh.geometry.index?.count??0)).toEqual(full);
      world.step({},1);world.step({cameraTogglePressed:true},1);expect(world.inspectCamera().resolved?.kind).toBe('shoulder');
      expect(meshes.map(mesh=>mesh.geometry.index?.count??0)).toEqual(full);
      const vehicle=runtime.simulation.controlledActor.vehicle!,offset=world.camera.position.clone().sub(eye()).applyQuaternion(vehicle.rotation.clone().invert());
      expect(offset.length()).toBeGreaterThan(1);expect(offset.length()).toBeLessThan(3);
      world.step({},1);world.step({cameraTogglePressed:true},1);expect(world.inspectCamera().resolved?.kind).toBe('third-person');
      expect(meshes.map(mesh=>mesh.geometry.index?.count??0)).toEqual(full);
    }
    world.setCameraView('first-person');runtime.prepareEpisodeStart({positionWorldMetersXYZ:[0,40,0],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'dragon',mounted:true,}});
    expect(world.camera.position.distanceTo(eye())).toBeLessThan(1e-6);
    world.setCameraView('third-person');
    expect(runtime.exit()).toBe(true);world.step({},720);
    expect(runtime.simulation.controlledActor.vehicle!.motion.flyingCreature!.groundPhase).toBe('grounded');
    world.setCameraView('first-person');
    expect(world.camera.position.distanceTo(eye()),id+':ground eye').toBeLessThan(.001);
    const sight=visual.root.getObjectByName('Head')!.getWorldPosition(new T.Vector3()).sub(new T.Vector3().setFromMatrixPosition(visual.readSeatWorld()));sight.y=0;
    expect(sight.normalize().dot(new T.Vector3(0,0,1)),id+':ground body faces rider view').toBeGreaterThan(.6);
    world.setCameraView('third-person');
    // 长身龙额外覆盖右侧堵塞后左侧下龙，以及左侧重新登乘。
    const human=runtime.simulation.controlledActor.controller,body=human.standingQueryBody;
    const blockedRight=id==='D09'&&body.kind==='capsule'?human.world.createCollider(RAPIER.ColliderDesc.cuboid(.45,1,.45).setTranslation(Math.max(...variant.ground!.probes.map(p=>p.center[0]+p.radius))+body.radius+.18,1,variant.ground!.seat[2])):undefined;
    if(blockedRight)world.step({},1);
    expect(runtime.exit(),runtime.simulation.controlledActor.message).toBe(true);
    const actor=runtime.simulation.controlledActor;
    expect(actor.vehicleIndex).toBe(-1);expect(human.capsule.isEnabled()).toBe(true);
    expect(actor.transition).toBe(0);expect(actor.dragonTransition).toBeUndefined();
    if(blockedRight){expect(actor.player.position.x).toBeLessThan(0);human.world.removeCollider(blockedRight,true);}
    world.step({},1);
    expect(visual.sampleMount(actor.dragonTransition,rider.root)).toBeUndefined();
    expect(visual.root.getObjectByName('dragon-saddle-ladder')!.visible).toBe(false);
    expect(world.camera.position.toArray().every(Number.isFinite)).toBe(true);
    world.step({},20);expect(actor.player.position.y).toBeLessThan(.1);
    expect(runtime.enter('dragon'),actor.message).toBe(true);
    expect(actor.transition).toBe(0);expect(actor.dragonTransition).toBeUndefined();
    world.step({},1);
    expect(visual.sampleMount(actor.dragonTransition,rider.root)).toBeUndefined();
    expect(visual.root.getObjectByName('dragon-saddle-ladder')!.visible).toBe(false);
    expect(runtime.simulation.controlledActor.vehicle!.grounded).toBe(true);expect(runtime.simulation.controlledActor.controller.capsule.isEnabled()).toBe(false);
    expect(rider.hip!.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3().setFromMatrixPosition(visual.readSeatWorld()))).toBeLessThan(.001);
    world.step({humanoid:{...emptyInput(),jump:true}},1);world.step({},180);
    expect(runtime.simulation.controlledActor.vehicle!.motion.flyingCreature!.groundPhase).toBe('airborne');
  }finally{world.dispose();vi.unstubAllGlobals();}
},30000);

it('closes the real dive loop without moving the saddle across its animation seam',async()=>{
  const {visual,pose}=await fixture();try{
    pose.speed=31;Object.assign(pose.flyingCreature!,{mode:'dive',speedMetersPerSecond:31});
    for(const time of [1.5,3,4.5]){
      visual.sample(pose,time-.00001);const before=visual.readSeatWorld();
      visual.sample(pose,time+.00001);const after=visual.readSeatWorld();
      expect(new T.Vector3().setFromMatrixPosition(before).distanceTo(new T.Vector3().setFromMatrixPosition(after))).toBeLessThan(.001);
    }
  }finally{visual.dispose();vi.unstubAllGlobals();}
});
it('crossfades flight modes only on fixed commits and survives display cuts and reset',async()=>{
  const {visual,pose}=await fixture();try{
    pose.speed=31;Object.assign(pose.flyingCreature!,{mode:'boost',speedMetersPerSecond:31,tick:15});
    visual.commit(pose,1,.25);const before=new T.Vector3().setFromMatrixPosition(visual.readSeatWorld());
    Object.assign(pose.flyingCreature!,{mode:'dive',tick:16});visual.commit(pose,1,.25+1/60);
    expect(before.distanceTo(new T.Vector3().setFromMatrixPosition(visual.readSeatWorld()))).toBeLessThan(.4);
    const fixed=visual.readSeatWorld().elements.slice();visual.sample(pose,.255);const display=visual.readSeatWorld().elements.slice();
    visual.sample(pose,.25+1/60);expect(visual.readSeatWorld().elements).toEqual(fixed);
    visual.sample(pose,.255);expect(visual.readSeatWorld().elements).toEqual(display);
    visual.commit(pose,2,.25+1/60);expect(visual.readSeatWorld().elements).toEqual(fixed);
    pose.flyingCreature!.tick=17;visual.commit(pose,2,.25+2/60);
    expect(new T.Vector3().setFromMatrixPosition(new T.Matrix4().fromArray(fixed)).distanceTo(new T.Vector3().setFromMatrixPosition(visual.readSeatWorld()))).toBeLessThan(.4);
    pose.flyingCreature=createFlyingCreatureStateV1();pose.speed=0;visual.commit(pose,3,0);
    expect(visual.inspect().clips.map(clip=>clip.name)).toEqual(['D01_Flight_Hovering']);
  }finally{visual.dispose();vi.unstubAllGlobals();}
});

it.each(DRAGON_VARIANTS.slice(1).map(v=>v.id))('%s uses its own clips and stable attachments through blended flight',async id=>{
  const {visual,pose,model}=await fixture(id);
  const meshes:T.SkinnedMesh[]=[];visual.root.traverse(n=>{if(n instanceof T.SkinnedMesh)meshes.push(n);});
  try{
    expect(model.animations).toHaveLength(id==='D02'?18:16);expect(meshes.length).toBeGreaterThanOrEqual(2);
    for(const mode of ['hover','cruise','boost','dive','evade'] as const)for(const turn of [-1,0,1])for(let frame=0;frame<17;frame++){
      pose.speed=mode==='hover'?0:31;Object.assign(pose.flyingCreature!,{mode,bankRadians:turn*.7,pitchRadians:turn*.6,evadeDirection:turn<0?-1:1,evadeRemainingSeconds:.45*(1-frame/17)});
      visual.sample(pose,(frame+.37)/17*2.3);visual.root.updateMatrixWorld(true);
      expect(visual.inspect().clips.every(c=>c.name.startsWith(id+'_'))).toBe(true);
      expect(visual.inspect().attachments.Seat!.every(Number.isFinite)).toBe(true);
    }
    pose.speed=0;pose.flyingCreature!.mode='hover';pose.flyingCreature!.flamePhase='loop';visual.sample(pose,.2);
    expect(visual.inspect().clips.some(c=>c.name===id+'_Shoot_FlameThrowerLoop')).toBe(true);
    const attachments=visual.inspect().attachments;expect(attachments.Seat!.every(Number.isFinite)).toBe(true);
    const head=new T.Vector3(...attachments.Head!),fire=new T.Vector3(...attachments.CenturyFireSocket!);
    expect(fire.distanceTo(head)).toBeLessThan(5);
  }finally{visual.dispose();vi.unstubAllGlobals();}
});

it('publishes eleven selectable complete rigs with embedded textures and source-timed clips',()=>{
  const imported=DRAGON_VARIANTS.filter(v=>/^D\d+$/.test(v.id));
  expect(imported.map(v=>v.id)).toEqual(Array.from({length:11},(_,i)=>'D'+String(i+1).padStart(2,'0')));
  const sources=JSON.parse(readFileSync(new URL(testAssetResourceUrl('flying-creatures/variant-sources.json')),'utf8'));
  for(const variant of imported.slice(1)){
    const profile=getDefaultProfile('dragon')!;
    expect(()=>parseAssetProfile({...profile,envelope:variant.envelope})).not.toThrow();
    const bytes=readFileSync(new URL(testAssetResourceUrl(`flying-creatures/${variant.id}/model.glb`)));
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    const source=sources.find((s:{id:string})=>s.id===variant.id);
    const groundSources=JSON.parse(readFileSync(new URL(testAssetResourceUrl('flying-creatures/ground-sources.json')),'utf8'));
    Object.assign(source.clips,groundSources.find((g:{id:string})=>g.id===variant.id).clips);
    expect(source.parts[0].source.toLowerCase()).toContain('naked');expect(source.parts[1].source).toContain('Harness01');
    expect(json.images.length).toBeGreaterThanOrEqual(2);expect(json.images.every((image:{bufferView?:number;uri?:string})=>image.bufferView!==undefined&&!image.uri)).toBe(true);
    expect(json.materials.every((material:{alphaMode:string})=>material.alphaMode==='MASK')).toBe(true);
    for(const clip of json.animations){
      const end=Math.max(...clip.samplers.map((sampler:{input:number})=>json.accessors[sampler.input].max[0]));
      expect(Math.abs(end-source.clips[clip.name].durationSeconds),variant.id+':'+clip.name).toBeLessThanOrEqual(1/30+.0001);
      expect(source.clips[clip.name].nonUnitScaleKeys).toBe(0);
    }
  }
});

it.each(['D04','D06','D07','D10','D11'])('%s preserves bind translations for UE Skeleton-mode bones in every exported clip',async id=>{
  const {visual,model}=await fixture(id);
  const sources=JSON.parse(readFileSync(new URL(testAssetResourceUrl('flying-creatures/variant-sources.json')),'utf8'));
  const source=sources.find((s:{id:string})=>s.id===id);
  const groundSources=JSON.parse(readFileSync(new URL(testAssetResourceUrl('flying-creatures/ground-sources.json')),'utf8'));Object.assign(source.clips,groundSources.find((g:{id:string})=>g.id===id).clips);
  // 直接从蒙皮逆绑定矩阵恢复局部绑定位置，避免拿错误动画自身生成的包围盒充当正确性证据。
  const mesh=model.scene.getObjectByProperty('isSkinnedMesh',true) as T.SkinnedMesh;
  const bind=new Map(mesh.skeleton.bones.map((bone,i)=>[bone.name,mesh.skeleton.boneInverses[i]!.clone().invert()]));
  const mixer=new T.AnimationMixer(model.scene);
  try{
    for(const clip of model.animations){
      const corrected=source.clips[clip.name].retarget.bones.filter((b:{mode:string})=>b.mode==='Skeleton');
      expect(corrected.length).toBeGreaterThan(0);
      const action=mixer.clipAction(clip);action.play();
      for(const phase of [0,.17,.43,.79,.99]){
        mixer.setTime(clip.duration*phase);model.scene.updateMatrixWorld(true);
        for(const {bone:name} of corrected){
          const bone=model.scene.getObjectByName(name)!;
          const parent=bind.get(bone.parent!.name),own=bind.get(name)!;
          const local=parent?parent.clone().invert().multiply(own):own;
          expect(bone.position.distanceTo(new T.Vector3().setFromMatrixPosition(local)),`${id}/${clip.name}/${name}`).toBeLessThan(.003);
        }
      }
      action.stop();
    }
  }finally{mixer.stopAllAction();mixer.uncacheRoot(model.scene);visual.dispose();vi.unstubAllGlobals();}
});

it('retains every D09 body triangle and its original paired forelimbs',async()=>{
  const {visual,model}=await fixture('D09');
  try{
    let triangles=0;
    model.scene.traverse(node=>{
      if(node instanceof T.SkinnedMesh&&node.name.startsWith('D09_Body01_Naked'))triangles+=node.geometry.index!.count/3;
    });
    // 源 D09_Body01_Naked 三个材质分区分别有 14847、23816、14446 个三角形。
    expect(triangles).toBe(53109);
    for(const side of ['L','R'])for(const name of ['UpperArm','ForeArm','Hand'])expect(model.scene.getObjectByName(`${name}_${side}`)).toBeDefined();
    for(const side of ['L','R'])expect(model.scene.getObjectByName(`Thigh_${side}`)).toBeUndefined();
  }finally{visual.dispose();vi.unstubAllGlobals();}
});
