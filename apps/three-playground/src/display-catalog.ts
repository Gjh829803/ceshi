import * as T from 'three';
import type {HumanoidRuntime} from '@worldkit/three';
import type {EnvironmentDefinition} from '../../../shared/preset-content/environment/types';
import type {DisplayContext,DisplayRoot} from './display-context';
import type {DisplayObjectRow,DisplayType} from './display-settings';

export function resolveDisplayColliderId(physics:HumanoidRuntime['simulation']['humanoid'],fallback:(handle:number)=>string,handle:number):string {
  if(physics){
    if(physics.capsule.handle===handle)return 'person';
    for(const target of physics.skills.targets.values())if(target.collider?.handle===handle)return target.definition.id;
    for(const [n,crate] of physics.crates.entries())for(let c=0;c<crate.body.numColliders();c++)if(crate.body.collider(c).handle===handle)return 'crate:'+n;
  }
  return fallback(handle);
}

/** Adapt already-authored object identities; never require a new layer schema. */
export function buildDisplayCatalog(input:{scene:T.Scene;map:EnvironmentDefinition;environment:T.Object3D;person:T.Object3D;
  vehicles:readonly {id:string;name:string;type:DisplayType;object:T.Object3D;available:boolean}[];currentVehicleId?:string;colliderIds:ReadonlySet<string>}) {
  const roots:DisplayRoot[]=[],rows:DisplayObjectRow[]=[];
  const add=(id:string,name:string,type:DisplayType,object:T.Object3D,parentId?:string,available=true,tags:readonly string[]=[])=>{
    roots.push({id,type,object});rows.push({id,name,type,available,hasCollider:input.colliderIds.has(id),tags,...(parentId?{parentId}:{})});
  };
  add('person','主体人物','person',input.person);
  for(const v of input.vehicles)add(v.id,v.name,v.type,v.object,undefined,v.available);
  const mapId='map:'+input.map.id;add(mapId,input.map.name,'environment',input.environment);
  const names=new Map<string,T.Object3D>();input.environment.traverse(object=>{if(object.name)names.set(object.name,object);});
  for(const box of input.map.boxes){const object=names.get(box.id);if(!object)continue;
    const interaction=input.map.interactions?.find(a=>a.colliderIds?.includes(box.id));
    add(box.id,interaction?interaction.label+' · '+box.id:box.id,'environment',object,mapId,true,interaction?['interaction']:[]);
  }
  for(const water of input.map.water){const object=names.get('water:'+water.id);if(object)add('water:'+water.id,'水体 · '+water.id,'environment',object,mapId);}
  const interactions=input.scene.getObjectByName('humanoid-interaction-targets');
  if(interactions){for(const object of interactions.children){const authored=input.map.interactions?.find(a=>a.id===object.name);add(object.name,authored?.label??object.name,'interaction',object);}}
  const known=new Set(roots.map(r=>r.object));
  // Unknown top-level visual roots remain individually selectable without invented capabilities.
  for(const object of input.scene.children){if(known.has(object)||object===interactions||object.name.startsWith('display-')||(object as T.Light).isLight||(object as T.Camera).isCamera)continue;
    let visual=false;object.traverse(node=>{if((node as T.Mesh).isMesh)visual=true;});
    if(visual)add('object:'+object.uuid,object.name||'未命名对象','unknown',object);
  }
  const vehicle=input.vehicles.find(v=>v.id===input.currentVehicleId);
  const context:DisplayContext={roots,subjects:vehicle?[input.person,vehicle.object]:[input.person]};
  return {context,rows};
}
