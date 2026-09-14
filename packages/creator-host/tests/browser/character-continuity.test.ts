import {expect,it} from 'vitest';
import * as THREE from 'three';
import type {WorldObservation,WorldSnapshot} from '@worldkit/three';
import {CharacterContinuityMonitor,summarizeCharacterContinuity} from '../../src/browser/character-continuity';

function fixture(){
 const scene=new THREE.Scene(),root=new THREE.Group(),bone=new THREE.Bone();
 const mesh:THREE.SkinnedMesh=new THREE.SkinnedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
 mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));root.add(mesh);scene.add(root);
 const world={scene,controlledObject:root,targets:{person:root},camera:new THREE.PerspectiveCamera()} as unknown as WorldObservation;
 const snapshot={controlledEntityId:'person',humanoid:{character:{instanceId:'person'},mountedInstanceId:null}} as WorldSnapshot;
 return {world,snapshot,root,mesh,bone,monitor:new CharacterContinuityMonitor()};
}

function firstPerson(snapshot:WorldSnapshot):WorldSnapshot{
 return {...snapshot,camera:{...snapshot.camera,mode:'follow',viewKind:'first-person'},humanoid:{...snapshot.humanoid!}};
}

it('defers temporary first-person geometry and verifies the original geometry on return',()=>{
 const f=fixture(),original=f.mesh.geometry,fp=firstPerson(f.snapshot);
 f.monitor.read(f.world,f.snapshot);f.mesh.geometry=original.clone();
 expect(f.monitor.read(f.world,fp)).toMatchObject({status:'partial',issues:[],evidence:{geometryIdentity:'deferred-first-person'}});
 f.mesh.geometry=original;
 expect(f.monitor.read(f.world,f.snapshot)).toMatchObject({status:'observed',evidence:{geometryIdentity:'checked'}});
 f.mesh.geometry=original.clone();f.monitor.read(f.world,fp);
 expect(f.monitor.read(f.world,f.snapshot).issues).toContain('CHARACTER_VISUAL_REPLACED');
});

it('establishes geometry only after leaving an initially first-person view',()=>{
 const f=fixture(),original=f.mesh.geometry;f.mesh.geometry=original.clone();
 expect(f.monitor.read(f.world,firstPerson(f.snapshot)).status).toBe('partial');
 f.mesh.geometry=original;
 expect(f.monitor.read(f.world,f.snapshot).status).toBe('observed');
 f.mesh.geometry=original.clone();
 expect(f.monitor.read(f.world,f.snapshot).issues).toContain('CHARACTER_VISUAL_REPLACED');
});

it.each(['mesh','skeleton','bones'] as const)('retains %s identity when first observed in first person',kind=>{
 const f=fixture(),fp=firstPerson(f.snapshot);f.monitor.read(f.world,fp);
 if(kind==='mesh'){f.root.remove(f.mesh);f.root.add(f.mesh.clone());}
 if(kind==='skeleton')f.mesh.bind(new THREE.Skeleton([f.bone]));
 if(kind==='bones')f.mesh.skeleton.bones[0]=new THREE.Bone();
 expect(f.monitor.read(f.world,fp).issues).toContain('CHARACTER_VISUAL_REPLACED');
 expect(f.monitor.read(f.world,f.snapshot).issues).toContain('CHARACTER_VISUAL_REPLACED');
});

it('permits empty head geometry in first person but detects hidden remaining body meshes',()=>{
 const f=fixture(),head=f.mesh.clone();f.root.add(head);f.monitor.read(f.world,f.snapshot);
 head.geometry=head.geometry.clone();head.geometry.setIndex([]);
 const fp=firstPerson(f.snapshot);
 expect(f.monitor.read(f.world,fp)).toMatchObject({status:'partial',issues:[]});
 f.mesh.visible=false;
 expect(f.monitor.read(f.world,fp).issues).toContain('CHARACTER_VISUAL_HIDDEN');
 f.mesh.visible=true;const body=f.mesh.clone();f.root.add(body);
 const monitor=new CharacterContinuityMonitor();monitor.read(f.world,fp);body.visible=false;
 expect(monitor.read(f.world,fp).issues).toContain('CHARACTER_VISUAL_HIDDEN');
});

it('fully checks authored cameras even when the saved Player perspective is first person',()=>{
 const f=fixture();f.monitor.read(f.world,f.snapshot);f.mesh.geometry=f.mesh.geometry.clone();
 const fp=firstPerson(f.snapshot),snapshot={...fp,camera:{...fp.camera,mode:'authored' as const}};
 expect(f.monitor.read(f.world,snapshot).issues).toContain('CHARACTER_VISUAL_REPLACED');
});

it('keeps the same visual through seated bone motion, vehicle grouping and reset',()=>{
 const f=fixture(),initial=f.monitor.read(f.world,f.snapshot);
 const assembly=new THREE.Group();f.world.scene.add(assembly);assembly.add(f.root);
 f.bone.rotation.x=.8;f.root.position.set(1,2,3);
 const mounted={...f.snapshot,humanoid:{...f.snapshot.humanoid!,mountedInstanceId:'custom-bike'}};
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

it('observes manual matrices and preserves legitimate planar transforms without writing matrices',()=>{
 const f=fixture();f.monitor.read(f.world,f.snapshot);
 f.mesh.matrixAutoUpdate=false;f.mesh.matrix.makeScale(0,0,0);
 const frozen=f.mesh.matrix.clone(),worldBefore=f.mesh.matrixWorld.clone();
 expect(f.monitor.read(f.world,f.snapshot).issues).toContain('CHARACTER_VISUAL_HIDDEN');
 expect(f.mesh.matrix.equals(frozen)).toBe(true);expect(f.mesh.matrixWorld.equals(worldBefore)).toBe(true);
 f.mesh.matrix.identity();f.mesh.scale.setScalar(0);
 expect(f.monitor.read(f.world,f.snapshot).issues).toEqual([]);
 f.mesh.matrix.makeScale(1,1,0);
 expect(f.monitor.read(f.world,f.snapshot).issues).toEqual([]);
 f.mesh.matrixWorldAutoUpdate=false;f.mesh.matrixWorld.makeScale(0,0,0);f.mesh.matrix.identity();
 expect(f.monitor.read(f.world,f.snapshot).issues).toContain('CHARACTER_VISUAL_HIDDEN');
});

it('uses only material groups that intersect the actual draw range',()=>{
 const f=fixture(),on=new THREE.MeshBasicMaterial(),off=new THREE.MeshBasicMaterial({visible:false});
 f.monitor.read(f.world,f.snapshot);
 f.mesh.material=[off,on];f.mesh.geometry.clearGroups();f.mesh.geometry.addGroup(0,6,0);
 expect(f.monitor.read(f.world,f.snapshot).issues).toContain('CHARACTER_VISUAL_HIDDEN');
 f.mesh.geometry.addGroup(6,6,1);
 expect(f.monitor.read(f.world,f.snapshot).issues).toEqual([]);
 f.mesh.geometry.setDrawRange(0,6);
 expect(f.monitor.read(f.world,f.snapshot).issues).toContain('CHARACTER_VISUAL_HIDDEN');
 f.mesh.geometry.setDrawRange(6,6);
 expect(f.monitor.read(f.world,f.snapshot).issues).toEqual([]);
 f.mesh.geometry.setDrawRange(0,0);
 expect(f.monitor.read(f.world,f.snapshot).issues).toContain('CHARACTER_VISUAL_HIDDEN');
});

it('ignores explicitly undefined unused material slots supported by Three',()=>{
 const f=fixture();f.monitor.read(f.world,f.snapshot);
 f.mesh.material=[undefined,new THREE.MeshBasicMaterial()] as unknown as THREE.Material[];
 f.mesh.geometry.clearGroups();f.mesh.geometry.addGroup(0,36,1);
 expect(f.monitor.read(f.world,f.snapshot).issues).toEqual([]);
});

it('isolates diagnostic exceptions and does not replace the baseline after a failed read',()=>{
 const f=fixture();f.monitor.read(f.world,f.snapshot);
 const material=f.mesh.material as THREE.Material;
 Object.defineProperty(material,'visible',{configurable:true,get(){throw new Error('fixture failure');}});
 expect(f.monitor.read(f.world,f.snapshot)).toMatchObject({advisory:true,status:'unavailable',issues:['CHARACTER_DIAGNOSTICS_UNAVAILABLE'],evidence:null});
 Object.defineProperty(material,'visible',{configurable:true,writable:true,value:true});
 f.mesh.geometry=f.mesh.geometry.clone();
 expect(f.monitor.read(f.world,f.snapshot).issues).toContain('CHARACTER_VISUAL_REPLACED');
});

it('does not invent material zero for an unassigned draw group',()=>{
 const f=fixture();f.monitor.read(f.world,f.snapshot);
 f.mesh.material=[new THREE.MeshBasicMaterial()];
 f.mesh.geometry.groups=[{start:0,count:36}];
 expect(f.monitor.read(f.world,f.snapshot).issues).toContain('CHARACTER_VISUAL_HIDDEN');
});

it('does not commit a partial baseline when the first diagnostic read fails',()=>{
 const f=fixture(),clone=f.mesh.matrix.clone;
 f.mesh.matrixAutoUpdate=false;f.mesh.matrix.clone=()=>{throw new Error('fixture failure');};
 expect(f.monitor.read(f.world,f.snapshot).status).toBe('unavailable');
 f.mesh.matrix.clone=clone;f.mesh.geometry=f.mesh.geometry.clone();
 expect(f.monitor.read(f.world,f.snapshot).issues).toEqual([]);
});

it('does not interpret rigid equipment changes as replacement of the skinned person',()=>{
 const f=fixture(),hat=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
 f.bone.add(hat);
 f.monitor.read(f.world,f.snapshot);
 hat.removeFromParent();
 expect(f.monitor.read(f.world,f.snapshot).issues).toEqual([]);
 f.bone.add(hat);hat.visible=false;
 expect(f.monitor.read(f.world,f.snapshot).issues).toEqual([]);
 f.mesh.visible=false;
 expect(f.monitor.read(f.world,f.snapshot).issues).toContain('CHARACTER_VISUAL_HIDDEN');
});

it('marks valid ordinary SDK worlds as outside Player diagnosis without inventing human failures',()=>{
 const f=fixture();
 const snapshot={schemaVersion:2,controlledEntityId:'fox',entities:[]} as unknown as WorldSnapshot;
 expect(f.monitor.read(f.world,snapshot)).toMatchObject({status:'not-applicable',issues:[],evidence:null});
 expect(f.monitor.read(f.world,null).status).toBe('unavailable');
});

it('does not relabel lost Player telemetry as a nonhuman world after observing a person',()=>{
 const f=fixture();f.monitor.read(f.world,f.snapshot);
 const snapshot={schemaVersion:2,controlledEntityId:'person',entities:[]} as unknown as WorldSnapshot;
 expect(f.monitor.read(f.world,snapshot)).toMatchObject({status:'unavailable',issues:['CHARACTER_TELEMETRY_UNAVAILABLE']});
});
