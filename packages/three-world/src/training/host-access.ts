import type { CameraRigInput } from '../camera';
import type { WorldInput } from '../engine-contracts';
import type { EpisodeStart } from '../episode-contracts';
import type { TrainingRuntime, TrainingCommand } from './runtime';
import type { SkillResult } from './humanoid/action-schema';

/** Engine/World capability, deliberately absent from the public barrels. */
export interface TrainingHostAccess {
  isDisposed(): boolean;
  command(command: TrainingCommand): SkillResult | undefined;
  setEpisodeOwned(owned: boolean): void;
  advance(input: WorldInput, dt: number, pointer?: CameraRigInput): void;
  reset(): void;
  clearInput(): void;
  prepareEpisodeStart(start: EpisodeStart): void;
  present(alpha: number, tick: number, view?:'world'|'object'): () => void;
}
const hosts = new WeakMap<TrainingRuntime, TrainingHostAccess>();
export function registerTrainingHost(runtime: TrainingRuntime, host: TrainingHostAccess): void {
  hosts.set(runtime, host);
}
export function trainingHost(runtime: TrainingRuntime): TrainingHostAccess {
  const host = hosts.get(runtime);
  if (!host) throw new Error('TRAINING_HOST_UNAVAILABLE');
  return host;
}
