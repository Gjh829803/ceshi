import type { CameraRigInput } from '../camera';
import type { WorldInput } from '../engine-contracts';
import type { EpisodeStart } from '../episode-contracts';
import type { HumanoidRuntime, HumanoidCommand } from './runtime';
import type { SkillResult } from './humanoid/action-schema';

/** Engine/World capability, deliberately absent from the public barrels. */
export interface HumanoidHostAccess {
  readonly resources:import('../actor-resources').ActorResources;
  isDisposed(): boolean;
  setMapValidator(validate:(map:import('./environment/types').EnvironmentDefinition)=>void):void;
  interactionBody(id:string):import('../interaction-body').InteractionBody;
  claimCharacter(id:string,character:import('./character').Character):()=>void;
  commitCharacterOwnership(id:string):void;
  bindCharacter(id:string,binding:import('./character-binding').RuntimeActorBinding,settings?:import('../engine-contracts').CharacterOptions,prevalidated?:boolean):void;
  command(command: HumanoidCommand): SkillResult | undefined;
  setEpisodeOwned(owned: boolean): void;
  advance(input: WorldInput, dt: number, pointer?: CameraRigInput, drives?:Readonly<Record<string,import('../engine-contracts').CharacterDrive>>,controlYawRadians?:number): void;
  reset(): void;
  finishReset():void;
  clearInput(): void;
  setControlledActor(id:string|undefined):void;
  teleportCharacter(id:string,position:import('../engine-contracts').Vec3):void;
  prepareEpisodeStart(start: EpisodeStart): void;
  present(alpha: number, tick: number, view?:'world'|'object'): () => void;
}
const hosts = new WeakMap<HumanoidRuntime, HumanoidHostAccess>();
export function registerHumanoidHost(runtime: HumanoidRuntime, host: HumanoidHostAccess): void {
  hosts.set(runtime, host);
}
export function humanoidHost(runtime: HumanoidRuntime): HumanoidHostAccess {
  const host = hosts.get(runtime);
  if (!host) throw new Error('HUMANOID_HOST_UNAVAILABLE');
  return host;
}
