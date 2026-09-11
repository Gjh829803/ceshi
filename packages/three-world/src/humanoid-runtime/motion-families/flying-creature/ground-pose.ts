import {AnimationMixer,Vector3,type AnimationClip,type Object3D} from 'three';

/** 大厅姿态可能侧身展示；归一到骑手正前方，测量和运行时使用同一角度。 */
export function dragonGroundHeading(scene:Object3D,animations:readonly AnimationClip[],prefix:string):number{
  const clip=animations.find(c=>c.name===prefix+'_Ground_Idle'),seat=scene.getObjectByName('Seat'),head=scene.getObjectByName('Head');
  if(!clip||!seat||!head)return 0;
  const mixer=new AnimationMixer(scene);mixer.clipAction(clip).play();mixer.setTime(0);scene.updateWorldMatrix(true,true);
  const direction=head.getWorldPosition(new Vector3()).sub(seat.getWorldPosition(new Vector3()));
  const heading=Math.hypot(direction.x,direction.z)>.1?Math.atan2(direction.x,direction.z):0;
  mixer.stopAllAction();mixer.uncacheRoot(scene);scene.updateWorldMatrix(true,true);return heading;
}
