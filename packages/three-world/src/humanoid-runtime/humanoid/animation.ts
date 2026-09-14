import type {KayakState} from '../motion-families/surface-vessel/paddling';
import type { Vector3 } from 'three';
import type { MotionPlan } from './motion';
import actionRuntime from './action-runtime.json';

/** Exact original durations for controller-owned action and surface loop clocks. */
export const SOURCE_ACTION_DURATIONS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(actionRuntime.clips.map(clip => [clip.id, clip.duration])),
);

export interface AuthoredPose { key: string; time: number; phase?: string }
export interface SourceCharacterSkills {
  pose: AuthoredPose | null;
  seated: string | null;
  carrying: string | null;
  active: { id: string } | null;
  syncCarried(position: Vector3): void;
}

/** Every field read by traversal-lab's original Character. No physics world is required. */
export interface SourceCharacterFrame {
  position: Vector3;
  facing: Vector3;
  motionSerial: number;
  traversal: { motion: MotionPlan; elapsed: number; duration: number } | null;
  completedMotion: { sourceId: string; sourceTime: number; serial: number } | null;
  speed: number;
  vertical: number;
  grounded: boolean;
  animationGrounded: boolean;
  stance: 'stand' | 'crouch';
  swimming: boolean;
  swimStyle: 'breaststroke' | 'freestyle';
  animationEvent: { id: number; kind: 'jump' | 'land' | 'start' | 'stop' | 'turn' | 'pivot'; elapsed: number; turn: number; heavy: boolean; moving: boolean; speed?: number; strength?: number } | null;
  surface: { pose: AuthoredPose | null } | null;
  skills: SourceCharacterSkills | null;
}

/** A render snapshot retains source timing and the original MotionPlan function.
 * simulationIdentity is the controller object; it stays stable while snapshots change.
 * The host adapter replaces syncCarried with a visual-only attachment callback.
 */
export type HumanoidRenderState = Omit<SourceCharacterFrame, 'skills'> & {
  simulationIdentity?: object;
  wearablePose?: {spread:number;seated:number;landing:number}|undefined;
  dragonMount?:{progress:number;entering:boolean;side:number};
  unicyclePose?: import('../motion-families/ground-vehicle/unicycle').UnicycleState | undefined;
  mounted?: 'unicycle' | 'stand' | 'drive' | 'ride' | 'sled' | 'ski' | 'tank' | 'submarine' | 'atv' | 'paddling' | null | 'wingsuit' | 'wingsuit-ready' | 'paraglider';
  atvSteeringAngle?:number;
  sledPose?: {push:number;brake:number;steer:number}; kayakPose?:KayakState;
  skills: (Omit<SourceCharacterSkills, 'syncCarried'> & { syncCarried?: SourceCharacterSkills['syncCarried'] }) | null;
};
