import * as THREE from 'three';
import type {CameraSubjectFacts} from './subject';
import type {CameraLifecycleEvent} from './lifecycle';
import type {CameraDocument} from '../config/camera/index';
import type {CharacterOptions,Vec3} from '../engine-contracts';

export interface CameraEntityFacts {object:THREE.Object3D;character?:CharacterOptions;options:{frontYawRadians?:number;eyePositionLocalMetersXYZ?:Vec3}}
/** Optional native subject source. It owns sampling and operation identity, not camera state.
 * Display samples must be read inside the caller's existing presentation transaction. */
export interface CameraSubjectSource {
 sampleCamera(binding:CameraDocument['binding'],generation:(id:string)=>number|undefined,display:boolean):CameraSubjectFacts|undefined;
 cameraOperation(binding:CameraDocument['binding']):string;
}
/** Adapts physical entities and their existing lifecycle revisions, without owning camera state. */
export class WorldCameraSubjects {
 generation:(id:string)=>number|undefined=()=>undefined;
 lifecycle:()=>number=()=>0;
 private previous:CameraSubjectFacts|undefined;
 private operation:string|undefined;
 private relocation=0;
 private operationSequence=0;
 constructor(private readonly entity:(id:string)=>CameraEntityFacts|undefined,private readonly velocity:(id:string)=>Vec3|undefined,private readonly nativeSource:CameraSubjectSource|undefined){}
 sample(binding:CameraDocument['binding'],display=false):CameraSubjectFacts|undefined{
  const native=this.nativeSource?.sampleCamera(binding,this.generation,display);if(native)return native;
  const entity=this.entity(binding.targetEntityId),generation=this.generation(binding.targetEntityId);if(!entity||generation===undefined)return;
  const object=entity.object;object.updateWorldMatrix(true,false);
  const rotation=object.getWorldQuaternion(new THREE.Quaternion()),scale=object.getWorldScale(new THREE.Vector3());
  const velocity=this.velocity(binding.targetEntityId);
  const eye=entity.options.eyePositionLocalMetersXYZ;
  return {id:binding.targetEntityId,generation,kind:'ordinary',positionWorldMetersXYZ:object.getWorldPosition(new THREE.Vector3()).toArray(),geometryQuaternionWorldXYZW:rotation.toArray(),geometryScaleXYZ:scale.toArray(),semanticQuaternionWorldXYZW:rotation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),entity.options.frontYawRadians??0)).toArray(),speedMetersPerSecond:velocity?Math.hypot(...velocity):0,...(velocity?{velocityWorldMetersPerSecondXYZ:velocity}:{}),...(eye?{eyeWorldMetersXYZ:new THREE.Vector3(...eye).applyMatrix4(object.matrixWorld).toArray()}:{}),...(entity.character?{body:{minimumHeightMeters:0,maximumHeightMeters:(entity.character.heightMeters??1.8)*Math.abs(scale.y)}}:{})};
 }
 private key(binding:CameraDocument['binding']):string{return `${this.relocation}:${this.nativeSource?.cameraOperation(binding)??''}`;}
 relocated(ids:readonly string[]):void{if(this.previous&&ids.includes(this.previous.id))this.relocation++;}
 adopt(binding:CameraDocument['binding']):void{this.previous=this.sample(binding);this.operation=this.key(binding);}
 event(binding:CameraDocument['binding']):CameraLifecycleEvent|undefined{
  const subject=this.sample(binding),previousSubject=this.previous,key=this.key(binding);
  if(!subject||!previousSubject)return;
  if(subject.id===previousSubject.id&&subject.generation===previousSubject.generation&&key===this.operation)return;
  return {operationId:`${this.lifecycle()}:${++this.operationSequence}`,kind:subject.id!==previousSubject.id||subject.generation!==previousSubject.generation?'retarget':'relocate',subject,previousSubject};
 }
 clear():void{this.previous=undefined;this.operation=undefined;}
}
