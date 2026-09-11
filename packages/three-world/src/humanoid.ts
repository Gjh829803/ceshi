import {resolveLoadTextures,supportsModelTextureDecoding,type ModelLoadOptions} from './model-loader';
import {validateObjectColor} from './object-color';
import {claimCharacter} from './humanoid-runtime/character-ownership';
import { createWorld, type ThreeWorld, type WorldOptions } from './world.js';
import { Character } from './humanoid-runtime/character.js';
import type { EnvironmentDefinition } from './humanoid-runtime/environment/types.js';
import { validateEnvironment } from './humanoid-runtime/map-validation.js';
import type { HumanoidProfile, VehicleInstance } from './humanoid-runtime/runtime.js';
import type { AssetDefinition } from './engine-contracts.js';

export const DEFAULT_HUMANOID_ASSET_ID = 'humanoid.source-101';
export interface HumanoidResource { readonly path:string; readonly uri:string }
export type HumanoidAssetDefinition = AssetDefinition & { readonly resources?:readonly HumanoidResource[] };
export type HumanoidWorldOptions = Omit<WorldOptions,'humanoid'|'assetDefinitions'|'boundaries'> & {
  readonly map:EnvironmentDefinition;
  readonly characterId?:string;
  /** On-foot initial facing: radians about +Y, 0 faces -Z. Omit to face away from the opening camera. Mounted facing comes from the vehicle. */
  readonly characterFacingYawRadians?:number;
  /** Optional author-selected whitebox color, sRGB #RRGGBB. No role palette is imposed. */
  readonly characterColor?:string;
  /** Start the primary human already riding this grounded vehicle instance at its map spawn. Restored on reset. */
  readonly initialMountId?:string;
  readonly assetDefinitions?:Readonly<Record<string,HumanoidAssetDefinition>>;
  readonly resourceUrl?:(logicalPath:string)=>string;
  /** Preserve model textures by default when the host supports image decoding; false disables them. */
  readonly characterLoadOptions?:ModelLoadOptions;
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
  if((options as WorldOptions).boundaries!==undefined)throw new Error('WORLD_HUMANOID_BOUNDARIES_LOCATION: Put invisible fences in map.boundaries, not top-level options.');
  const {map,characterId='player',characterFacingYawRadians,characterColor,initialMountId,resourceUrl,characterLoadOptions,vehicles=[],profile,character:provided,assetDefinitions:configured,...worldOptions}=options;
  const modelLoadOptions={loadTextures:resolveLoadTextures(characterLoadOptions,supportsModelTextureDecoding())};
  validateEnvironment(map);
  if(characterColor!==undefined)validateObjectColor(characterColor);
  if(initialMountId!==undefined&&(typeof initialMountId!=='string'||!initialMountId.trim()||!vehicles.some(v=>v.instanceId===initialMountId)))throw new Error('HUMANOID_INITIAL_MOUNT_UNAVAILABLE');
  if(characterFacingYawRadians!==undefined&&!Number.isFinite(characterFacingYawRadians))throw new Error('HUMANOID_INITIAL_FACING_INVALID');
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
  const releasePreparation=claimCharacter(character);
  let world:ThreeWorld|undefined;
  try{
    if(characterColor!==undefined)character.setColor(characterColor);
    if(!character.loaded){
      const resources=new Map((definitions?.[DEFAULT_HUMANOID_ASSET_ID]?.resources??[]).map(resource=>[resource.path,resource.uri]));
      const resolve=resourceUrl??((logicalPath:string)=>{
        const uri=resources.get(logicalPath);
        if(!uri)throw new Error(`HUMANOID_RESOURCE_MISSING: ${logicalPath}`);
        return typeof document==='undefined'?uri:new URL(uri,document.baseURI).href;
      });
      await character.load(resolve,modelLoadOptions);
    }
    releasePreparation();
    world=await createWorld({...worldOptions,assetDefinitions:definitions??{},humanoid:{map,vehicles,character:{instanceId:characterId,object:character.root,animation:character,...(initialMountId!==undefined?{initialMountId}:{}),...(characterFacingYawRadians!==undefined?{facingYawRadians:characterFacingYawRadians}:{})}}});
    if(profile)world.humanoid!.applyProfile(profile);
    world.setCaptureTargets([characterId]);
    return world;
  }catch(error){
    if(world)world.dispose();else character.dispose();
    throw error;
  }finally{releasePreparation();}
}
