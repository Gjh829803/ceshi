import { HUMANOID_BINDINGS } from '../input';
/** Portable interaction descriptions: metres, Y up, heading in radians about Y. */
export interface InteractionTarget {
  slotId: string;
  id: string;
  label: string;
  kind: 'pickup' | 'seat';
  position: [number, number, number];
  approach: [number, number, number];
  yaw: number;
  size?: [number, number, number];
  massKg?: number;
  /** Collision modules belonging to the target; never a whole environment mesh. */
  colliderIds?: string[];
}

export type SkillId = 'roll' | 'slide' | 'pickup' | 'putDown' | 'sit' | 'standUp';
export interface SkillRequest { requestId: string; action: SkillId; targetId?: string|undefined;slotId?:string|undefined }
export interface SkillResult {
  requestId: string;
  action: string;
  targetId?: string|undefined;
  slotId?:string|undefined;
  status: 'running' | 'completed' | 'rejected' | 'cancelled';
  code: string;
  message: string;
  phase?: string;
}

export const ACTION_CLIP_IDS = ['roll','slide-start','slide-loop','slide-exit','carry-walk','pickup','sit-enter','sit-idle','sit-exit'] as const;
export const SURFACE_CLIP_IDS = ['hang-enter','hang-exit','hang-idle','hang-left','hang-right','climb-up','climb-down','climb-ledge',
  'prone-enter','prone-exit','prone-idle','prone-forward','prone-backward','prone-left','prone-right'] as const;
import {ACTION_TUNING} from '../../config/actions';
export {ACTION_TUNING} from '../../config/actions';
export const SKILL_DEFINITIONS = [
  {id:'roll',label:'翻滚',key:HUMANOID_BINDINGS.roll.key,requires:['grounded','emptyHands','notBusy'],effect:'向当前移动方向翻滚；碰撞可截断位移'},
  {id:'slide',label:'滑铲',key:HUMANOID_BINDINGS.slide.key,requires:['grounded',`speed>=${ACTION_TUNING.slideMinimumSpeedMetersPerSecond}m/s`,'emptyHands','notBusy'],effect:'收低胶囊并减速滑行；出口不足保持低姿态'},
  {id:'pickup',label:'拾取并搬运',key:HUMANOID_BINDINGS.interact.key,requires:['grounded','emptyHands','target.kind=pickup','approachWithin0.9m','pathClear'],effect:'对齐后播放拾取，在接触帧附着目标，再进入搬运'},
  {id:'putDown',label:'放下',key:HUMANOID_BINDINGS.interact.key,requires:['carrying','grounded','placementClear'],effect:'将物件放回可承托位置；没有专用放下动画'},
  {id:'sit',label:'坐下',key:'E',requires:['grounded','emptyHands','target.kind=seat','approachWithin0.9m','pathClear'],effect:'对齐座位，播放进入，然后保持真实坐姿循环'},
  {id:'standUp',label:'起身',key:'E / Space',requires:['seated','headroomClear'],effect:'播放起身并恢复行走'},
] as const;
