import { createWorld, type ThreeWorld, type WorldOptions } from './world.js';
import { Character } from './training/character.js';
import type { MapDefinition } from './training/environment/types.js';
import { validateTrainingMap } from './training/map-validation.js';
import type { TrainingProfile, TrainingVehicleInstance } from './training/runtime.js';
import type { AssetDefinition } from './engine-contracts.js';

export const DEFAULT_HUMANOID_ASSET_ID = 'humanoid.source-101';
export interface HumanoidResource { readonly path:string; readonly uri:string }
export type HumanoidAssetDefinition = AssetDefinition & { readonly resources?:readonly HumanoidResource[] };
export type HumanoidWorldOptions = Omit<WorldOptions,'training'|'assetDefinitions'> & {
  readonly map:MapDefinition;
  readonly characterId?:string;
  readonly assetDefinitions?:Readonly<Record<string,HumanoidAssetDefinition>>;
  readonly resourceUrl?:(logicalPath:string)=>string;
  readonly vehicles?:readonly TrainingVehicleInstance[];
  readonly profile?:TrainingProfile;
  /** A supplied character transfers its lifecycle to the returned World. */
  readonly character?:Character;
};

/** Load the supplied humanoid and bind its complete movement/interaction controller.
 * Scene geometry is authored with Three; map supplies collision and action anchors.
 * Other meshes bind through createWorld/addCharacter or the supplied vehicle instances.
 */
export async function createHumanoidWorld(options:HumanoidWorldOptions):Promise<ThreeWorld>{
  const {map,characterId='player',resourceUrl,vehicles=[],profile,character:provided,assetDefinitions:configured,...worldOptions}=options;
  validateTrainingMap(map);
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
    world=await createWorld({...worldOptions,assetDefinitions:definitions??{},training:{map,vehicles,character:{instanceId:characterId,object:character.root,animation:character}}});
    if(profile)world.training!.applyProfile(profile);
    world.setCaptureTargets([characterId]);
    return world;
  }catch(error){
    if(world)world.dispose();else character.dispose();
    throw error;
  }
}
