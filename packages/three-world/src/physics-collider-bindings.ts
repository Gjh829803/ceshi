import type RAPIER from '@dimforge/rapier3d-compat';

/** Maps shared collider handles to entity identities and publishes authored edits.
 * Refreshing the native BVH neither integrates bodies nor consumes collision events. */
export class PhysicsColliderBindings {
  private readonly owners=new Map<number,string>();
  constructor(private readonly world:RAPIER.World) {}
  added(id:string,collider:RAPIER.Collider){
    this.owners.set(collider.handle,id);
    this.world.updateSceneQueries([collider.handle]);
  }
  removed(collider:RAPIER.Collider){this.owners.delete(collider.handle);}
  changed(colliders:readonly RAPIER.Collider[]){this.world.updateSceneQueries(colliders.map(c=>c.handle));}
  owner(handle:number){return this.owners.get(handle);}
  clear(){this.owners.clear();}
}
