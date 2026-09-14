import type {Vector3} from 'three';
/** 板体贴坡后的碰撞皮肤允许小量根节点抬升；不将其他车辆的接地阈值一并放宽。 */
export function skateboardSupport(positionY:number,floor:number,wasGrounded:boolean):boolean {
 return positionY<=floor+(wasGrounded?.35:.12);
}
export function skateboardRoll(normal:Vector3,forward:Vector3):number {
 return Math.atan2(normal.z*forward.x-normal.x*forward.z,normal.y);
}
