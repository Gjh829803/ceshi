import { createWorld, type ThreeWorld, type WorldOptions } from './world.js';
import { Character } from './humanoid-runtime/character.js';
import type { EnvironmentDefinition } from './humanoid-runtime/environment/types.js';
import { validateEnvironment } from './humanoid-runtime/map-validation.js';
import type { HumanoidProfile, VehicleInstance } from './humanoid-runtime/runtime.js';
import type { AssetDefinition } from './engine-contracts.js';

export const DEFAULT_HUMANOID_ASSET_ID = 'humanoid.source-101';
export interface HumanoidResource { readonly path:string; readonly uri:string }
export type HumanoidAssetDefinition = AssetDefinition & { readonly resources?:readonly HumanoidResource[] };
export type HumanoidWorldOptions = Omit<WorldOptions,'humanoid'|'assetDefinitions'> & {
  readonly map:EnvironmentDefinition;
  readonly characterId?:string;
  readonly assetDefinitions?:Readonly<Record<string,HumanoidAssetDefinition>>;
  readonly resourceUrl?:(logicalPath:string)=>string;
  readonly vehicles?:readonly VehicleInstance[];
  readonly profile?:HumanoidProfile;
  /** A supplied character transfers its lifecycle to the returned World. */
  readonly character?:Character;
};

/** Load the supplied humanoid and bind its complete movement/interaction controller.
 * Scene geometry is authored with Three; map supplies collision and action anchors.
 * Other meshes bind through createWorld/addCharacter or the supplied vehicle instances.
 */
export async function createHumanoidWorld(options:HumanoidWorldOptions):Promise<ThreeWorld>{
  const {map,characterId='player',resourceUrl,vehicles=[],profile,character:provided,assetDefinitions:configured,...worldOptions}=options;
  validateEnvironment(map);
  if(!characterId.trim()||vehicles.some(vehicle=>vehicle.instanceId===characterId))throw new Error('HUMANOID_INSTANCE_ID_INVALID');
  let definitions=configured;
  if(!definitions&&!resourceUrl&&!provided?.loaded&&typeof document!=='undefined'){
    const response=await fetch(new URL('./asset-definitions.json',document.baseURI));
    if(!response.ok)throw new Error(`HUMANOID_CATALOG_FAILED: HTTP ${response.status}`);
    const catalog=await response.json() as {schemaVersion:number;assets:HumanoidAssetDefinition[]};
    if(catalog.schemaVersion!==1||!Array.isArray(catalog.assets))throw new Error('HUMANOID_CATALOG_INVALID');
    definitions=Object.fromEntries(catalog.assets.map(asset=>[asset.id,asset]));
  }
  const character=provided??new Character();
  let world:ThreeWorld|undefined;
  try{
    if(!character.loaded){
      const resources=new Map((definitions?.[DEFAULT_HUMANOID_ASSET_ID]?.resources??[]).map(resource=>[resource.path,resource.uri]));
      const resolve=resourceUrl??((logicalPath:string)=>{
        const uri=resources.get(logicalPath);
        if(!uri)throw new Error(`HUMANOID_RESOURCE_MISSING: ${logicalPath}`);
        return typeof document==='undefined'?uri:new URL(uri,document.baseURI).href;
      });
      await character.load(resolve);
    }
    world=await createWorld({...worldOptions,assetDefinitions:definitions??{},humanoid:{map,vehicles,character:{instanceId:characterId,object:character.root,animation:character}}});
    if(profile)world.humanoid!.applyProfile(profile);
    world.setCaptureTargets([characterId]);
    return world;
  }catch(error){
    if(world)world.dispose();else character.dispose();
    throw error;
  }
}
