import type { CameraRigInput } from '../camera';
import type { WorldInput } from '../engine-contracts';
import type { EpisodeStart } from '../episode-contracts';
import type { HumanoidRuntime, HumanoidCommand } from './runtime';
import type { SkillResult } from './humanoid/action-schema';

/** Engine/World capability, deliberately absent from the public barrels. */
export interface HumanoidHostAccess {
  isDisposed(): boolean;
  command(command: HumanoidCommand): SkillResult | undefined;
  setEpisodeOwned(owned: boolean): void;
  advance(input: WorldInput, dt: number, pointer?: CameraRigInput): void;
  reset(): void;
  clearInput(): void;
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
