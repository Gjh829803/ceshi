import {Euler,Matrix4,Quaternion,Scene,Vector3} from 'three';
import type {CharacterOptions} from '../engine-contracts';
import type {Character} from './character';

const actorCommands=new Set(['actor.move-to','actor.follow','actor.stop','actor.resume-autonomy','entity.despawn']);
export const isHumanoidActorCommand=(type:string):boolean=>actorCommands.has(type);

/** Shared by candidate validation and publication; no allocation or owner transfer. */
export function validateCharacterBinding(animation:Character,movement:CharacterOptions={}){
  if(!animation.loaded)throw new Error('HUMANOID_CHARACTER_BINDING_INVALID');
  for(const [key,value] of Object.entries(movement)){
    if(!['heightMeters','radiusMeters','walkSpeedMetersPerSecond','runSpeedMetersPerSecond','jumpSpeedMetersPerSecond'].includes(key)||!Number.isFinite(value)||value<0||((key==='walkSpeedMetersPerSecond'||key==='runSpeedMetersPerSecond')&&value===0))throw new Error('HUMANOID_MOVEMENT_UNSUPPORTED');
  }
  const root=animation.root;root.updateWorldMatrix(true,false);
  const position=root.getWorldPosition(new Vector3()),rotation=root.getWorldQuaternion(new Quaternion()),scale=root.getWorldScale(new Vector3());
  const angles=new Euler().setFromQuaternion(rotation,'YXZ');
  if(!root.matrixAutoUpdate||scale.distanceTo(new Vector3(1,1,1))>1e-9||!root.matrixWorld.elements.every(Number.isFinite)||Math.abs(angles.x)>1e-9||Math.abs(angles.z)>1e-9||root.parent&&(!(root.parent instanceof Scene)||!root.parent.matrixWorld.equals(new Matrix4())))throw new Error('HUMANOID_CHARACTER_TRANSFORM_INVALID');
  return {position,rotation,yaw:angles.y};
}
