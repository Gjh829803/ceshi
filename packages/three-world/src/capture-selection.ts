import * as THREE from 'three';
import type {CaptureTargetRepresentative,CaptureTargetSelection} from './contracts.js';
import {failure,requireId} from './control-support.js';

export interface SelectedCaptureTarget {
 readonly entityId:string;
 readonly representative?:CaptureTargetRepresentative;
}
type EntityLookup=(entityId:string)=>THREE.Object3D|undefined;

function isWithin(object:THREE.Object3D,root:THREE.Object3D):boolean {
 for(let current:THREE.Object3D|null=object;current;current=current.parent)if(current===root)return true;
 return false;
}

function validateRepresentative(representative:CaptureTargetRepresentative,root:THREE.Object3D):void {
 if(!representative||typeof representative!=='object'||!['object','instance'].includes(representative.kind)||
  !(representative.object instanceof THREE.Object3D))
  throw failure('CAPTURE_REPRESENTATIVE_INVALID','Choose a live object or indexed instance from the selected entity.');
 if(!isWithin(representative.object,root))throw failure('CAPTURE_REPRESENTATIVE_FOREIGN','The representative is no longer inside its selected entity.');
 if(representative.kind==='instance') {
  const {object,instanceIndex}=representative;
  if(!(object instanceof THREE.InstancedMesh)||!(object.instanceMatrix instanceof THREE.InstancedBufferAttribute)||
   !Number.isSafeInteger(object.instanceMatrix.count)||!Number.isSafeInteger(object.count)||object.count<0||object.count>object.instanceMatrix.count||
   !Number.isSafeInteger(instanceIndex)||instanceIndex<0||instanceIndex>=object.count)
   throw failure('CAPTURE_INSTANCE_INVALID','Choose an existing integer instance index within the live instance count and buffer.');
 }
}

export function assertCompleteCaptureSubject(selections:readonly SelectedCaptureTarget[],controlledEntityId:string|undefined):void {
 if(controlledEntityId&&selections.some(selection=>selection.entityId===controlledEntityId&&selection.representative!==undefined))
  throw failure('CAPTURE_SUBJECT_MUST_BE_COMPLETE','The controlled subject is always captured complete; remove its representative selection first.');
}

function validateSelection(selection:SelectedCaptureTarget,lookup:EntityLookup):THREE.Object3D {
 const root=lookup(selection.entityId);
 if(!(root instanceof THREE.Object3D))throw failure('CAPTURE_ENTITY_MISSING',`Capture entity ${selection.entityId} is not registered.`);
 if(selection.representative!==undefined)validateRepresentative(selection.representative,root);
 return root;
}

function sameRepresentative(left:CaptureTargetRepresentative|undefined,right:CaptureTargetRepresentative|undefined):boolean {
 return left===right||Boolean(left&&right&&left.kind===right.kind&&left.object===right.object&&
  (left.kind==='object'||right.kind==='instance'&&left.instanceIndex===right.instanceIndex));
}

/** Copy only selection metadata. Scene object identity stays borrowed and is validated again on observation. */
export function normalizeCaptureSelection(targets:readonly CaptureTargetSelection[],lookup:EntityLookup,controlledEntityId:string|undefined):readonly SelectedCaptureTarget[] {
 if(!Array.isArray(targets))throw failure('CAPTURE_SELECTION_INVALID','Capture targets must be an ordered array.');
 const selections:SelectedCaptureTarget[]=[],byId=new Map<string,SelectedCaptureTarget>();
 for(const target of targets) {
  if(typeof target!=='string'&&(!target||typeof target!=='object'))throw failure('CAPTURE_SELECTION_INVALID','Choose an entity ID or an entity/representative selection.');
  const entityId=typeof target==='string'?target:target.entityId;requireId(entityId);
  const representative=typeof target==='string'?undefined:target.representative;
  const selection:SelectedCaptureTarget={entityId,...(representative===undefined?{}:{representative})};
  assertCompleteCaptureSubject([selection],controlledEntityId);validateSelection(selection,lookup);
  const previous=byId.get(entityId);
  if(previous&&!sameRepresentative(previous.representative,representative))throw failure('CAPTURE_SELECTION_CONFLICT','One entity ID cannot name different representatives in the same capture selection.');
  const saved=Object.freeze({entityId,...(representative===undefined?{}:{representative:Object.freeze({...representative})})});
  selections.push(saved);byId.set(entityId,saved);
 }
 return Object.freeze(selections);
}

/** No importance heuristics: complete subject first, then the author's priority. */
export function observeCaptureSelection(selections:readonly SelectedCaptureTarget[],lookup:EntityLookup,controlledEntityId:string|undefined):{
 readonly captureTargetIds:readonly string[];
 readonly targets:Readonly<Record<string,THREE.Object3D>>;
 readonly targetRepresentativesById:Readonly<Record<string,CaptureTargetRepresentative>>;
} {
 assertCompleteCaptureSubject(selections,controlledEntityId);
 const ordered=controlledEntityId?[{entityId:controlledEntityId},...selections.filter(selection=>selection.entityId!==controlledEntityId)]:[...selections];
 const targets:Record<string,THREE.Object3D>=Object.create(null),representatives:Record<string,CaptureTargetRepresentative>=Object.create(null);
 for(const selection of ordered) {
  const root=validateSelection(selection,lookup);Object.defineProperty(targets,selection.entityId,{value:root,enumerable:true,configurable:true});
  if(selection.representative)Object.defineProperty(representatives,selection.entityId,{value:Object.freeze({...selection.representative}),enumerable:true,configurable:true});
 }
 return {captureTargetIds:Object.freeze(ordered.map(selection=>selection.entityId)),targets:Object.freeze(targets),targetRepresentativesById:Object.freeze(representatives)};
}
