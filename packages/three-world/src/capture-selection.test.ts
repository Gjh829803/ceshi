import * as THREE from 'three';
import {describe,expect,it} from 'vitest';
import {assertCompleteCaptureSubject,normalizeCaptureSelection,observeCaptureSelection} from './capture-selection.js';
import type {CaptureTargetSelection} from './contracts.js';

function fixture() {
 const hero=new THREE.Group(),trees=new THREE.Group(),tree=new THREE.Group(),otherTree=new THREE.Group();trees.add(tree,otherTree);
 const lamps=new THREE.InstancedMesh(new THREE.BoxGeometry(.2,2,.3),new THREE.MeshBasicMaterial(),4);
 const entities=new Map<string,THREE.Object3D>([['trees',trees],['grass',new THREE.Group()],['hero',hero],['tower',new THREE.Group()],['lamps',lamps],['20',new THREE.Group()],['3',new THREE.Group()]]);
 return {hero,trees,tree,otherTree,lamps,entities,lookup:(id:string)=>entities.get(id)};
}
function rejects(callback:()=>unknown,code:string) {let failure:unknown;try{callback();}catch(error){failure=error;}expect(failure).toMatchObject({code});}

describe('explicit prioritized capture selection',()=>{
 it('defaults to the complete subject only and never expands an empty set to every entity',()=>{
  const {lookup,hero}=fixture(),selection=normalizeCaptureSelection([],lookup,'hero'),observed=observeCaptureSelection(selection,lookup,'hero');
  expect(observed.captureTargetIds).toEqual(['hero']);expect(observed.targets).toEqual({hero});expect(observed.targetRepresentativesById).toEqual({});
  expect(observeCaptureSelection(selection,lookup,undefined).captureTargetIds).toEqual([]);
 });

 it('keeps author priority after the subject, including IDs whose object-key ordering differs',()=>{
  const {lookup}=fixture(),selection=normalizeCaptureSelection(['20','tower','hero','3','tower'],lookup,'hero');
  const observed=observeCaptureSelection(selection,lookup,'hero');
  expect(observed.captureTargetIds).toEqual(['hero','20','tower','3','tower']);
  expect(observed.targets.tower).toBe(lookup('tower'));expect(observed.targets).not.toHaveProperty('grass');
 });

 it('keeps selected registered roots and exact live representatives as separate metadata',()=>{
  const {lookup,trees,tree,lamps}=fixture();
  const targets:CaptureTargetSelection[]=[{entityId:'trees',representative:{kind:'object',object:tree}},
   {entityId:'lamps',representative:{kind:'instance',object:lamps,instanceIndex:2}}];
  const selection=normalizeCaptureSelection(targets,lookup,'hero'),observed=observeCaptureSelection(selection,lookup,'hero');
  expect(observed.targets.trees).toBe(trees);expect(observed.targetRepresentativesById.trees).toEqual({kind:'object',object:tree});
  expect(observed.targetRepresentativesById.lamps).toEqual({kind:'instance',object:lamps,instanceIndex:2});
  expect(Object.isFrozen(selection)).toBe(true);expect(Object.isFrozen(selection[0]!.representative)).toBe(true);
  expect(Object.isFrozen(tree)).toBe(false);expect(tree.parent).toBe(trees);
  targets.length=0;expect(selection).toHaveLength(2);
 });

 it('rejects representative replacement of the controlled subject, even when it names the whole root',()=>{
  const {lookup,hero,tree}=fixture();
  rejects(()=>normalizeCaptureSelection([{entityId:'hero',representative:{kind:'object',object:hero}}],lookup,'hero'),'CAPTURE_SUBJECT_MUST_BE_COMPLETE');
  const selection=normalizeCaptureSelection([{entityId:'trees',representative:{kind:'object',object:tree}}],lookup,'hero');
  rejects(()=>assertCompleteCaptureSubject(selection,'trees'),'CAPTURE_SUBJECT_MUST_BE_COMPLETE');
 });

 it('validates object membership at selection and again after reparenting or entity replacement',()=>{
  const {lookup,tree,trees,entities}=fixture();
  rejects(()=>normalizeCaptureSelection([{entityId:'tower',representative:{kind:'object',object:tree}}],lookup,'hero'),'CAPTURE_REPRESENTATIVE_FOREIGN');
  const selection=normalizeCaptureSelection([{entityId:'trees',representative:{kind:'object',object:tree}}],lookup,'hero');
  tree.removeFromParent();rejects(()=>observeCaptureSelection(selection,lookup,'hero'),'CAPTURE_REPRESENTATIVE_FOREIGN');trees.add(tree);
  entities.set('trees',new THREE.Group());rejects(()=>observeCaptureSelection(selection,lookup,'hero'),'CAPTURE_REPRESENTATIVE_FOREIGN');
  entities.delete('trees');rejects(()=>observeCaptureSelection(selection,lookup,'hero'),'CAPTURE_ENTITY_MISSING');
 });

 it('validates indexed instance type, integer index, live count and buffer capacity',()=>{
  const {lookup,lamps}=fixture();
  for(const instanceIndex of [-1,.5,4,NaN])rejects(()=>normalizeCaptureSelection([{entityId:'lamps',representative:{kind:'instance',object:lamps,instanceIndex}}],lookup,'hero'),'CAPTURE_INSTANCE_INVALID');
  const selection=normalizeCaptureSelection([{entityId:'lamps',representative:{kind:'instance',object:lamps,instanceIndex:3}}],lookup,'hero');
  lamps.count=3;rejects(()=>observeCaptureSelection(selection,lookup,'hero'),'CAPTURE_INSTANCE_INVALID');
  lamps.count=5;rejects(()=>observeCaptureSelection(selection,lookup,'hero'),'CAPTURE_INSTANCE_INVALID');
  lamps.count=4.5;rejects(()=>observeCaptureSelection(selection,lookup,'hero'),'CAPTURE_INSTANCE_INVALID');
 });

 it('allows exact repeats for browser deduplication but rejects conflicting choices for one entity ID',()=>{
  const {lookup,tree,otherTree}=fixture();
  const choice={entityId:'trees',representative:{kind:'object' as const,object:tree}};
  expect(normalizeCaptureSelection([choice,choice],lookup,'hero')).toHaveLength(2);
  rejects(()=>normalizeCaptureSelection([choice,{entityId:'trees',representative:{kind:'object',object:otherTree}}],lookup,'hero'),'CAPTURE_SELECTION_CONFLICT');
  rejects(()=>normalizeCaptureSelection(['trees',choice],lookup,'hero'),'CAPTURE_SELECTION_CONFLICT');
 });

 it('rejects malformed selections and unsupported representative discriminators before saving them',()=>{
  const {lookup,tree}=fixture();
  for(const representative of [null,{kind:'invented',object:tree},{kind:'object',object:{}}])
   rejects(()=>normalizeCaptureSelection([{entityId:'trees',representative}] as unknown as CaptureTargetSelection[],lookup,'hero'),'CAPTURE_REPRESENTATIVE_INVALID');
  rejects(()=>normalizeCaptureSelection(null as unknown as CaptureTargetSelection[],lookup,'hero'),'CAPTURE_SELECTION_INVALID');
 });

 it('does not mistake Object prototype properties for representatives of valid entity IDs',()=>{
  const entities=new Map([['constructor',new THREE.Group()],['__proto__',new THREE.Group()]]),lookup=(id:string)=>entities.get(id);
  const selected=normalizeCaptureSelection(['__proto__'],lookup,'constructor'),observed=observeCaptureSelection(selected,lookup,'constructor');
  expect(observed.captureTargetIds).toEqual(['constructor','__proto__']);
  expect(observed.targetRepresentativesById.constructor).toBeUndefined();expect(observed.targetRepresentativesById.__proto__).toBeUndefined();
  expect(observed.targets.__proto__).toBe(entities.get('__proto__'));
 });
});
