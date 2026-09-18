import {TRAVERSAL_LIMITS,CROUCH_HALF,RADIUS,type HumanoidController} from './humanoid/controller';
import {SURFACE_TUNING,SWIMMING_TUNING} from '../config/actions';
import {ACTION_TUNING,SKILL_DEFINITIONS,type SkillId} from './humanoid/action-schema';
import type {HumanoidActionInput} from './simulation';
import {SWIM_ROOT_DEPTH,SWIM_SPEED,SWIM_FAST_SPEED} from './humanoid/water-physics';

export interface CharacterCapability {
  readonly id:string;
  readonly label:string;
  readonly summary:string;
  readonly trigger:{readonly kind:'skill';readonly action:SkillId}|{readonly kind:'input';readonly pulse?:Readonly<HumanoidActionInput>;readonly jump?:boolean;readonly continuous?:readonly string[]}|{readonly kind:'automatic'};
  readonly requires:readonly string[];
  readonly scene:readonly string[];
  readonly parameters:Readonly<Record<string,number|string>>;
  readonly completion:string;
  readonly source:string;
}
export interface CharacterCapabilityAvailability {
  readonly id:string;
  readonly eligible:boolean;
  readonly reason:string;
  readonly message:string;
  readonly targetId?:string;
  readonly slotId?:string;
}
export interface CharacterCapabilityState extends CharacterCapability,CharacterCapabilityAvailability {}
const skillCards:CharacterCapability[]=SKILL_DEFINITIONS.map((skill):CharacterCapability=>({
  id:skill.id,label:skill.label,summary:skill.effect,trigger:{kind:'skill',action:skill.id},requires:[...skill.requires,'unmounted'],
  scene:skill.id==='slide'?['Solid ground and a run-up. A low tunnel is optional; its ceiling needs real collision. Exit requires standing clearance.']:
    skill.id==='pickup'?['Pickup target with approach/yaw and a grasp anchor matching the table-height clip; weight <= 8 kg.']:
    skill.id==='putDown'?['Clear, flat waist-height support in front of the actor.']:
    skill.id==='sit'?['Seat target with valid approach/yaw and unobstructed capsule path.']:['Solid support and body clearance.'],
  parameters:skill.id==='slide'?{minimumSpeedMetersPerSecond:ACTION_TUNING.slideMinimumSpeedMetersPerSecond,heightMeters:ACTION_TUNING.slideHeightMeters,entrySeconds:ACTION_TUNING.slideEntryDurationSeconds,loopSeconds:ACTION_TUNING.slideLoopSeconds,exitSeconds:ACTION_TUNING.slideExitDurationSeconds}:
    skill.id==='pickup'?{maximumMassKg:ACTION_TUNING.maximumPickupMassKg,approachRadiusMeters:ACTION_TUNING.approachRadiusMeters,approachVerticalToleranceMeters:ACTION_TUNING.approachVerticalToleranceMeters}:
    skill.id==='sit'?{approachRadiusMeters:ACTION_TUNING.approachRadiusMeters}: {},
  completion:skill.id==='slide'?'Operation succeeded and standing. Under a low ceiling, continue movement until the actor has room to rise.':
    skill.id==='pickup'?'Operation succeeded and the selected entity/slot has this actor\'s held claim.':skill.id==='putDown'?'Receipt applied and character.carrying is null; target.state is placed.':
    skill.id==='sit'?'Operation succeeded and the selected entity/slot has this actor\'s occupied claim.':skill.id==='standUp'?'Operation succeeded and character.seated is null.':'Operation succeeded.',
  source:'sdk/three-world/src/humanoid-runtime/humanoid/action-system.ts',
}));
/** Read this catalog first; stateful input recipes must be verified in a snapshot. */
export const CHARACTER_CAPABILITIES:readonly CharacterCapability[]=[
  {id:'move',label:'移动',summary:'Walk/run from directional input; start, stop and turn animations follow actual motion.',trigger:{kind:'input',continuous:['forward','steer','boost','slow']},requires:['unmounted','movement not owned by another action'],scene:['Collision-backed ground and navigable body clearance.'],parameters:{profile:'player.profile.character'},completion:'Observe position and actual speed.',source:'sdk/three-world/src/humanoid-runtime/humanoid/controller.ts'},
  {id:'jump',label:'跳跃 / 翻越',summary:'One jump edge; directional input allows collision-probed vault, mantle or climb. In a low posture Space first attempts to rise.',trigger:{kind:'input',jump:true},requires:['unmounted','ground support or coyote interval','empty hands','clear body path'],scene:['Ordinary jump needs free space. Traversal needs a real collider, reachable top and supported landing.'],parameters:{minimumTraversalHeightMeters:TRAVERSAL_LIMITS.minimumHeightMeters,maximumTraversalHeightMeters:TRAVERSAL_LIMITS.maximumHeightMeters,minimumTraversalDepthMeters:TRAVERSAL_LIMITS.minimumDepthMeters},completion:'Observe traversal progress or airborne/landing state; rejected probes explain blocked geometry.',source:'sdk/three-world/src/humanoid-runtime/humanoid/controller.ts'},
  {id:'crouch',label:'蹲伏',summary:'Toggle standing/crouching once. Keyboard: crouch alone; sprint + a new crouch press requests slide.',trigger:{kind:'input',pulse:{toggleCrouch:true}},requires:['unmounted','grounded','empty hands','not busy'],scene:['Low passage needs a real ceiling collider; standing requires headroom.'],parameters:{heightMeters:2*(CROUCH_HALF+RADIUS)},completion:'character.stance equals desired stance. Do not repeat a toggle after reaching the target.',source:'sdk/three-world/src/humanoid-runtime/humanoid/controller.ts'},
  ...skillCards,
  {id:'prone',label:'匍匐',summary:'Toggle prone once; steer and move after the entry transition. Rise with the next toggle or jump edge.',trigger:{kind:'input',pulse:{prone:true},continuous:['forward','steer']},requires:['unmounted','grounded','empty hands','not busy'],scene:['Free entry space for the whole body; crawl passage needs collision and standing exit clearance.'],parameters:{heightMeters:SURFACE_TUNING.proneHeightMeters,speedMetersPerSecond:SURFACE_TUNING.proneSpeedMetersPerSecond},completion:'surface.mode is prone with prone-idle/prone-forward pose, or none after rising.',source:'sdk/three-world/src/humanoid-runtime/humanoid/surface-actions.ts'},
  {id:'climb',label:'壁面攀爬',summary:'Enter a registered wall or ladder. Direction input controls height/lateral travel; Space tries a valid top-out.',trigger:{kind:'input',pulse:{climb:true},continuous:['forward','steer']},requires:['unmounted','standing','empty hands','not busy','facing eligible surface'],scene:['climbSurfaces entry bound by colliderId to a real collider, with outward normal, width and vertical limits.'],parameters:{entryDistanceMinimumMeters:SURFACE_TUNING.entryDistanceMinimumMeters,entryDistanceMaximumMeters:SURFACE_TUNING.entryDistanceMaximumMeters,verticalSpeedMetersPerSecond:SURFACE_TUNING.climbVerticalSpeedMetersPerSecond,lateralSpeedMetersPerSecond:SURFACE_TUNING.climbLateralSpeedMetersPerSecond},completion:'surface.mode is climbing and surface.surfaceId matches the intended surface; observe height/position while moving.',source:'sdk/three-world/src/humanoid-runtime/humanoid/surface-actions.ts'},
  {id:'releaseClimb',label:'松开攀爬面',summary:'Release the attached surface; gravity resumes.',trigger:{kind:'input',pulse:{releaseClimb:true}},requires:['climbing'],scene:['Provide a safe landing below the release point.'],parameters:{},completion:'surface.mode is none; observe landing separately.',source:'sdk/three-world/src/humanoid-runtime/humanoid/surface-actions.ts'},
  {id:'swim',label:'游泳 / 潜水',summary:'Native surface swimming and diving. Deep-water entry is automatic; forward/steer/lift control movement and boost accelerates horizontal swimming.',trigger:{kind:'automatic'},requires:['unmounted','inside declared deep water'],scene:['Declare water volume, surface and bottom heights plus a real colliding pool bottom/shore. Decorative water alone is insufficient.'],parameters:{entryDepthMeters:SWIM_ROOT_DEPTH+.13,entryFeetBelowSurfaceMeters:.95,speedMetersPerSecond:SWIM_SPEED,fastSpeedMetersPerSecond:SWIM_FAST_SPEED,verticalSpeedMetersPerSecond:SWIMMING_TUNING.verticalSpeedMetersPerSecond},completion:'water.swimming, water.contact.swimmingMode (surface/underwater), measured position and contact depth/immersion checks; shallow water returns to walking.',source:'sdk/three-world/src/humanoid-runtime/humanoid/water-physics.ts'},
  {id:'swimStyle',label:'泳姿',summary:'Toggle breaststroke/freestyle once while swimming. Available in the action menu or a custom binding.',trigger:{kind:'input',pulse:{toggleSwimStyle:true}},requires:['swimming'],scene:['Active deep-water swimming.'],parameters:{},completion:'character.swimStyle equals desired style; do not repeat after reaching the target.',source:'sdk/three-world/src/humanoid-runtime/simulation.ts'},
];
export const ANIMATION_ONLY_CLIP_IDS=Object.freeze(['prone-backward','prone-left','prone-right','climb-ledge'] as const);
/** Eligibility uses the same queries as execution. No movement, request or physics step is issued. */
export function characterCapabilities(h:HumanoidController|undefined):CharacterCapabilityState[]{
  const targets=h?.skills.listTargets()??[];
  return CHARACTER_CAPABILITIES.map(card=>{
    let state:{eligible:boolean;reason:string;message:string};let targetId:string|undefined,slotId:string|undefined;
    if(!h)state={eligible:false,reason:'CHARACTER_UNAVAILABLE',message:'人形控制器不可用'};
    else if(h.isMounted)state={eligible:false,reason:'MOUNTED',message:'请先离开载具或坐骑'};
    else if(card.trigger.kind==='skill'){
      if(card.id==='pickup'||card.id==='sit'){const candidates=targets.filter(t=>t.action===card.id).sort((a,b)=>Math.hypot(a.approach[0]-h.position.x,a.approach[1]-h.position.y,a.approach[2]-h.position.z)-Math.hypot(b.approach[0]-h.position.x,b.approach[1]-h.position.y,b.approach[2]-h.position.z));const target=candidates.find(t=>t.eligible)??candidates[0];targetId=target?.entityId;slotId=target?.slotId;}
      state=h.skills.eligibility(card.trigger.action,targetId,slotId);
    }else if(card.id==='crouch')state=h.crouchEligibility();
    else if(card.id==='prone'||card.id==='climb'||card.id==='releaseClimb')state=h.surface.eligibility(card.id);
    else if(card.id==='swim'||card.id==='swimStyle')state={eligible:h.swimming,reason:h.swimming?'READY':'NOT_SWIMMING',message:h.swimming?'正在游泳':'需要进入满足深度和浸入条件的水体'};
    else {const busy=!!(h.skills.active||h.skills.seated||h.traversal);const ready=card.id==='jump'?!busy&&!h.skills.carrying&&h.surface.mode==='none'&&!h.swimming&&h.grounded:!busy;state={eligible:ready,reason:ready?'READY':busy?'BUSY':'INVALID_STATE',message:ready?'可执行':'当前状态不满足动作条件'};}
    return {...structuredClone(card),...state,...(targetId?{targetId}:{}),...(slotId?{slotId}:{})};
  });
}
