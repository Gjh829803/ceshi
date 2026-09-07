import { HUMANOID_BINDINGS } from '../input';
/** Portable interaction descriptions: metres, Y up, heading in radians about Y. */
export interface InteractionTarget {
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
export interface SkillRequest { requestId: string; action: SkillId; targetId?: string|undefined }
export interface SkillResult {
  requestId: string;
  action: string;
  targetId?: string|undefined;
  status: 'running' | 'completed' | 'rejected' | 'cancelled';
  code: string;
  message: string;
  phase?: string;
}

export const ACTION_CLIP_IDS = ['roll','slide-start','slide-loop','slide-exit','carry-walk','pickup','sit-enter','sit-idle','sit-exit'] as const;
export const SURFACE_CLIP_IDS = ['hang-enter','hang-exit','hang-idle','hang-left','hang-right','climb-up','climb-down','climb-ledge',
  'prone-enter','prone-exit','prone-idle','prone-forward','prone-backward','prone-left','prone-right'] as const;
export const SKILL_DEFINITIONS = [
  {id:'roll',label:'翻滚',key:HUMANOID_BINDINGS.roll.key,requires:['grounded','emptyHands','notBusy'],effect:'向当前移动方向翻滚；碰撞可截断位移'},
  {id:'slide',label:'滑铲',key:HUMANOID_BINDINGS.slide.key,requires:['grounded','speed>=2.5m/s','emptyHands','notBusy'],effect:'收低胶囊并减速滑行；出口不足保持低姿态'},
  {id:'pickup',label:'拾取并搬运',key:'E',requires:['grounded','emptyHands','target.kind=pickup','approachWithin0.9m','pathClear'],effect:'对齐后播放拾取，在接触帧附着目标，再进入搬运'},
  {id:'putDown',label:'放下',key:'G',requires:['carrying','grounded','placementClear'],effect:'将物件放回可承托位置；没有专用放下动画'},
  {id:'sit',label:'坐下',key:'E',requires:['grounded','emptyHands','target.kind=seat','approachWithin0.9m','pathClear'],effect:'对齐座位，播放进入，然后保持真实坐姿循环'},
  {id:'standUp',label:'起身',key:'E / Space',requires:['seated','headroomClear'],effect:'播放起身并恢复行走'},
] as const;

export const ACTION_MANIFEST = {
  schemaVersion:'1.0', name:'Traversal Lab Action Kit', coordinateSystem:{units:'metres',up:'+Y',forward:'+Z',yaw:'radians'},
  skeleton:{name:'GASP research target',boneCount:101,requiresRetargetingForOtherRigs:true},
  rigResourcePath:'humanoid/source/gasp-research/climb-2m5.experimental.glb',
  transport:'In-page JavaScript bridge; register these methods as tools in the host Agent runtime.',
  methods:{
    describe:'Returns schemas, supported actions and limitations.',
    listTargets:'Returns stable IDs, state, approach position, eligibility and rejection reason.',
    execute:'Validate SkillRequest and start; returns requestId and running/rejected, never assumes completion.',
    getStatus:'Poll requestId until completed/rejected/cancelled.',
    cancel:'Cancel only where the controller can safely restore collision.',
  },
  requestSchema:{type:'object',additionalProperties:false,required:['requestId','action'],properties:{requestId:{type:'string',minLength:1,maxLength:80},action:{enum:SKILL_DEFINITIONS.map(a=>a.id)},targetId:{type:'string'}}},
  targetSchema:{type:'object',required:['id','kind','position','approach','yaw'],properties:{id:{type:'string'},kind:{enum:['pickup','seat']},position:{type:'array',items:{type:'number'},minItems:3,maxItems:3},approach:{type:'array',items:{type:'number'},minItems:3,maxItems:3},yaw:{type:'number'},massKg:{type:'number'},colliderIds:{type:'array',items:{type:'string'}}}},
  actions:SKILL_DEFINITIONS,
  animationAssets:[...ACTION_CLIP_IDS,...SURFACE_CLIP_IDS].map(id=>({id,resourcePath:`humanoid/source/actions/${id}.clip.json`,format:'THREE.AnimationClip JSON'})),
  surfaceControls:{prone:'Z: prone enter/exit; WASD move',climb:'B: attach/release registered surface; W/S vertical, A/D lateral, Space detach',api:'These surface controllers are exported separately as SurfaceActions; the interaction bridge above currently exposes the six listed request actions.'},
  swimmingAssets:['swim-idle','swim-forward','swim-freestyle'].map(id=>({id,resourcePath:`humanoid/source/swimming/${id}.clip.json`})),
  limitations:['3DGS appearance alone does not define movable entities, collision, mass, seats or grasp anchors.',
    'The world adapter must supply segmented entities, collision proxies and valid interaction targets.',
    'No navigation planner: approach positions are returned; an Agent must navigate before calling execute.',
    'Picking up an object must also update/remove its corresponding visual representation in the source world.',
    'This bridge is local; no model can access it until the host exposes its methods as callable tools.'],
};
