import type {Object3D} from 'three';

const effects=new WeakSet<Object3D>();
/** SDK-owned spray/foam/bubbles are visual feedback, never solid camera surfaces. */
export function markCameraVisualEffect(root:Object3D):void {effects.add(root);}
export function isCameraVisualEffect(object:Object3D):boolean {
 for(let node:Object3D|null=object;node;node=node.parent)if(effects.has(node))return true;
 return false;
}
