import * as THREE from 'three';

type Resource = THREE.BufferGeometry | THREE.Material | THREE.Texture;
type Kind = 'geometry' | 'material' | 'texture';
type Entry = {uuid:string;kind:Kind;owners:Set<string>;disposed:boolean};

/** Observe real dispose events without replacing disposal methods or owning their lifetime. */
export class ResourceObserver {
 private readonly seen=new WeakMap<Resource,Entry>();
 private readonly entries:Entry[]=[];
 private readonly detach=new Set<()=>void>();
 private watch(resource:Resource,kind:Kind,owner:string){
  const existing=this.seen.get(resource);
  if(existing){existing.owners.add(owner);return;}
  const entry:Entry={uuid:resource.uuid,kind,owners:new Set([owner]),disposed:false};
  this.seen.set(resource,entry);this.entries.push(entry);
  const off=()=>resource.removeEventListener('dispose',onDispose);
  const onDispose=()=>{entry.disposed=true;off();this.detach.delete(off);};
  resource.addEventListener('dispose',onDispose);this.detach.add(off);
 }
 observe(owner:string,object:THREE.Object3D){
  object.traverse(node=>{
   const mesh=node as THREE.Mesh;
   if(mesh.isMesh){
    this.watch(mesh.geometry,'geometry',owner);
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
     this.watch(material,'material',owner);
     for(const value of Object.values(material))if(value instanceof THREE.Texture)this.watch(value,'texture',owner);
    }
   }
   const skinned=node as THREE.SkinnedMesh;
   if(skinned.isSkinnedMesh&&skinned.skeleton.boneTexture)this.watch(skinned.skeleton.boneTexture,'texture',owner);
  });
 }
 releaseOwner(owner:string){for(const entry of this.entries)entry.owners.delete(owner);}
 snapshot(){
  const resources=this.entries.map(entry=>({...entry,owners:[...entry.owners]}));
  return {resources,shared:resources.filter(r=>!r.disposed&&r.owners.length>1).length,
   counts:Object.fromEntries((['geometry','material','texture'] as const).map(kind=>{
    const all=resources.filter(r=>r.kind===kind),released=all.filter(r=>r.disposed).length;
    return [kind,{total:all.length,released,pending:all.length-released}];
   })) as Record<Kind,{total:number;released:number;pending:number}>};
 }
 disconnect(){for(const off of this.detach)off();this.detach.clear();}
}
