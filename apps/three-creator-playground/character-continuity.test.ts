import {expect,it} from 'vitest';
import * as THREE from 'three';
import type {WorldObservation,WorldSnapshot} from '@worldkit/three';
import {CharacterContinuityMonitor,summarizeCharacterContinuity} from './character-continuity';

function fixture(){
 const scene=new THREE.Scene(),root=new THREE.Group(),bone=new THREE.Bone();
 const mesh=new THREE.SkinnedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
 mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));root.add(mesh);scene.add(root);
 const world={scene,player:root,targets:{person:root},camera:new THREE.PerspectiveCamera()} as unknown as WorldObservation;
 const snapshot={controlledEntityId:'person',training:{character:{instanceId:'person'},mountedInstanceId:null}} as WorldSnapshot;
 return {world,snapshot,root,mesh,bone,monitor:new CharacterContinuityMonitor()};
}

it('keeps the same visual through seated bone motion, vehicle grouping and reset',()=>{
 const f=fixture(),initial=f.monitor.read(f.world,f.snapshot);
 const assembly=new THREE.Group();f.world.scene.add(assembly);assembly.add(f.root);
 f.bone.rotation.x=.8;f.root.position.set(1,2,3);
 const mounted={...f.snapshot,training:{...f.snapshot.training!,mountedInstanceId:'custom-bike'}};
 expect(f.monitor.read(f.world,mounted)).toMatchObject({status:'observed',issues:[],evidence:{rootUuid:initial.evidence!.rootUuid,mountedInstanceId:'custom-bike'}});
 f.root.position.set(0,0,0);f.bone.rotation.x=0;
 expect(f.monitor.read(f.world,f.snapshot).issues).toEqual([]);
});

it.each(['root','child','parent','material','scale','detached','layers'] as const)('detects a hidden rider through %s',kind=>{
 const f=fixture();f.monitor.read(f.world,f.snapshot);
 if(kind==='root')f.root.visible=false;
 if(kind==='child')f.mesh.visible=false;
 if(kind==='parent'){const parent=new THREE.Group();f.world.scene.add(parent);parent.add(f.root);parent.visible=false;}
 if(kind==='material')Object.assign(f.mesh.material,{transparent:true,opacity:0});
 if(kind==='scale')f.root.scale.setScalar(0);
 if(kind==='detached')f.root.removeFromParent();
 if(kind==='layers')f.mesh.layers.set(2);
 expect(f.monitor.read(f.world,f.snapshot).issues).toContain('CHARACTER_VISUAL_HIDDEN');
});

it.each(['root','mesh','geometry','skeleton','bones'] as const)('detects replaced %s even when UUIDs are copied',kind=>{
 const f=fixture();f.monitor.read(f.world,f.snapshot);
 if(kind==='root'){const replacement=f.root.clone();replacement.uuid=f.root.uuid;(f.world.targets as Record<string,THREE.Object3D>).person=replacement;f.world.scene.add(replacement);}
 if(kind==='mesh'){const replacement=f.mesh.clone();replacement.uuid=f.mesh.uuid;f.root.remove(f.mesh);f.root.add(replacement);}
 if(kind==='geometry')f.mesh.geometry=f.mesh.geometry.clone();
 if(kind==='skeleton')f.mesh.bind(new THREE.Skeleton([f.bone]));
 if(kind==='bones')f.mesh.skeleton.bones[0]=new THREE.Bone();
 expect(f.monitor.read(f.world,f.snapshot).issues).toContain(kind==='root'?'CHARACTER_ROOT_REPLACED':'CHARACTER_VISUAL_REPLACED');
});

it('does not certify a primitive stand-in or a world without humanoid telemetry',()=>{
 const f=fixture();f.root.remove(f.mesh);f.root.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));
 expect(f.monitor.read(f.world,f.snapshot)).toMatchObject({status:'unavailable',issues:['CHARACTER_RIG_UNOBSERVED']});
 expect(f.monitor.read(f.world,null)).toMatchObject({status:'unavailable',evidence:null});
});

it('retains the scene baseline when start reinstalls the public observer',()=>{
 const f=fixture();f.monitor.read(f.world,f.snapshot);
 const replacement=f.mesh.clone();f.root.remove(f.mesh);f.root.add(replacement);
 expect(f.monitor.read({...f.world},f.snapshot).issues).toContain('CHARACTER_VISUAL_REPLACED');
});

it('keeps separate baselines for independent worlds and retains failures in a bounded timeline',()=>{
 const a=fixture(),b=fixture(),first=a.monitor.read(a.world,a.snapshot);
 expect(a.monitor.read(b.world,b.snapshot).issues).toEqual([]);
 a.root.visible=false;const hidden=a.monitor.read(a.world,a.snapshot);
 a.root.visible=true;const restored=a.monitor.read(a.world,a.snapshot);
 const summary=summarizeCharacterContinuity([
  {wallSeconds:0,characterContinuity:first},{wallSeconds:1,characterContinuity:first},
  {wallSeconds:2,characterContinuity:hidden},{wallSeconds:3,characterContinuity:restored}]);
 expect(summary.issues).toContain('CHARACTER_VISUAL_HIDDEN');
 expect(summary.events.map(e=>e.wallSeconds)).toEqual([0,2,3]);
 expect(first.issues).toEqual([]);
 const long=summarizeCharacterContinuity(Array.from({length:140},(_,i)=>({wallSeconds:i,characterContinuity:i%2?first:hidden})));
 expect(long.events).toHaveLength(128);expect(long.omittedTransitions).toBe(12);
 expect(long.issues).toContain('CHARACTER_VISUAL_HIDDEN');
});
