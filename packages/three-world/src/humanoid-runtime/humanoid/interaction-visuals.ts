import type { Quaternion, Vector3 } from 'three';

export interface InteractionVisualTarget {
  id: string;
  slotId?:string;
  kind: 'pickup' | 'seat';
  position: Vector3;
  rotation?: Quaternion|undefined;
  state: string;
  size?: readonly number[]|undefined;
}
