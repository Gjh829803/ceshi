import * as T from 'three';
import type {DisplaySettings,DisplayType} from './display-settings';
export type DisplayRoot = {object:T.Object3D;type:DisplayType;id?:string};
export type DisplayContext = {
  roots:readonly DisplayRoot[];subjects:readonly T.Object3D[];
  /** Translation anchor for the observer: the vehicle root when mounted. */
  followTarget?:T.Object3D;
};
export const displayRootId = (root:DisplayRoot) => root.id ?? root.object.uuid;
export function withinDisplayRoot(object:T.Object3D,roots:ReadonlySet<T.Object3D>):boolean {
  for(let node:T.Object3D|null=object;node;node=node.parent)if(roots.has(node))return true;
  return false;
}
/** Scope is display-only and independent of per-object visibility. */
export function resolveDisplayScope(settings:DisplaySettings,context:DisplayContext) {
  const roots=settings.scope==='subject'?[...context.subjects]:settings.scope==='selected'
    ?context.roots.filter(root=>settings.selectedIds.includes(displayRootId(root))).map(root=>root.object):[];
  const rootSet=new Set(roots);
  const ids=settings.scope==='all'?null:new Set(context.roots.filter(root=>withinDisplayRoot(root.object,rootSet)).map(displayRootId));
  return {roots:rootSet,ids,centers:roots.map(root=>root.getWorldPosition(new T.Vector3()))};
}
