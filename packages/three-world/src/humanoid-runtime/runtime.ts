import {readCameraWorldPose} from '../camera-observation';
import {vehicleDriveTelemetry,type VehicleDriveTelemetry} from './vehicle-dynamics';
import {
  DEFAULT_HUMANOID_VIEW,
  HUMANOID_VIEW_SCHEMA_PROPERTIES,
  type HumanoidViewSettings,
} from '../config/camera';

import {
  controlFields,
  controlSchemaForFamily,
} from '../config/control-fields';

import {
  HUMANOID_INPUT_GUIDES,
  VEHICLE_APPROACH_DESCRIPTION,
  type HumanoidInputGuide,
} from './input-guidance';

import { submersibleDiagnostics } from './submersible';

import {
  sampleSubmersibleVisual,
  disposeSubmersibleVisual,
} from './submersible-visual';

import {
  sampleRaftVisual,
  type RaftState,
} from './raft';

import { jetSkiDiagnostics } from './jetski';

import {
  sampleJetSkiVisual,
  disposeJetSkiVisual,
} from './jetski-visual';

import type { KayakState } from './kayak';
import { sampleKayakVisual } from './kayak-visual';

import {
  copyUnicycleState,
  sampleUnicycleVisual,
  refreshUnicycleSupport,
  UNICYCLE_TIMING,
  type UnicycleState,
} from './unicycle';

import {
  copyAtvState,
  sampleAtvVisual,
  type AtvState,
} from './atv';

import * as THREE from 'three';
import {sampleTankVisual} from './tank-visual';
import type {TankState} from './tank';
import {sampleSkiEquipment} from './ski-visual';
import { registerHumanoidHost } from './host-access';
import { PresentationState, type HumanoidDisplaySample } from './presentation';
import { Simulation, emptyInput, createVehicle, resolveVehicleSpec, type Input } from './simulation';
import { canPlaceCreature, resetCreatureState } from './creatures/controller';
import { EnvironmentQueries, initEnvironmentQueries, vehicleBody } from './environment/queries';
import { FollowCamera } from './camera';
import { Character } from './character';
import type { HorseVisual, SeatAnchor } from './horse';
import { readHumanoid } from './humanoid/render-state';
import { readInteractionTargets } from './humanoid/render-state';
import {characterCapabilities,type CharacterCapabilityState,type CharacterCapabilityAvailability} from './character-capabilities';
import type { EnvironmentDefinition, MapSpawn } from './environment/types';
import type { VehicleSpec } from './config';
import {CONTROL_RANGES,CONTROL_SCHEMA_PROPERTIES,parseMovementSettings,readMovementSettings,type MovementSettings} from '../config/control';
import type { CameraTuning } from '../config/camera';
import { parseCameraTuning, DEFAULT_CAMERA_TUNING, CAMERA_SCHEMA_PROPERTIES, CAMERA_DISTANCE_METERS_SCHEMA, VEHICLE_CAMERA_DISTANCE_SCHEMA } from '../config/camera';
import { validateEnvironment } from './map-validation';
import { DEFAULT_CHARACTER_OPTIONS } from '../config/physics';
import type { PhysicsPort, PhysicsCandidate, CharacterOptions, RigidPhysics, Vec3, WorldInput, PhysicsEntityState, PhysicsAudit } from '../engine-contracts';
import type { EpisodeStartProbe, EpisodeStart, EpisodeCapabilities } from '../episode-contracts';
import type { CameraRigInput } from '../camera';
import {HUMANOID_ACTION_INPUT_FIELDS} from './input';
import {HUMANOID_BODY,RADIUS,CENTER} from './humanoid/controller';
import type { SkillRequest, SkillResult } from './humanoid/action-schema';

export type HumanoidCommand =
 | {readonly type:'vehicle.prepare';readonly instanceId:string;readonly spawn:MapSpawn}
 | {readonly type:'vehicle.approach'|'vehicle.enter';readonly instanceId:string}
 | {readonly type:'vehicle.exit'}
 | {readonly type:'vehicle.recover'}
 | {readonly type:'humanoid.set-camera-mode';readonly mode:0|1|2}
 | {readonly type:'humanoid.set-input';readonly input:Input|null}
 | {readonly type:'humanoid.apply-profile';readonly profile:HumanoidProfile}
 | {readonly type:'humanoid.perform-action';readonly request:SkillRequest};
const HUMANOID_COMMAND_TYPES:ReadonlySet<string>=new Set<HumanoidCommand['type']>([
 'vehicle.prepare','vehicle.approach','vehicle.enter','vehicle.exit','vehicle.recover',
 'humanoid.set-camera-mode','humanoid.set-input','humanoid.apply-profile','humanoid.perform-action',
]);
export function isHumanoidCommand(command:{type:string}):command is HumanoidCommand{return HUMANOID_COMMAND_TYPES.has(command.type);}

export interface VehicleInstance {
  readonly instanceId:string;
  readonly assetId:string;
  readonly spec:VehicleSpec;
  readonly object:THREE.Object3D;
  readonly visual?:HorseVisual;
  readonly seatAnchor?:SeatAnchor;
}
export interface HumanoidRuntimeOptions {
  readonly map:EnvironmentDefinition;
  readonly vehicles:readonly VehicleInstance[];
  readonly character:{readonly instanceId:string;readonly object:THREE.Object3D;readonly animation?:Character};
  readonly cameraTuning?:Partial<CameraTuning>;
}
export interface HumanoidProfile {
  /** Persistent opening/reset view; changing only keyboard permission preserves the current view. */
  readonly view?:Partial<HumanoidViewSettings>;
  readonly cameraDistanceMeters?:number|null;
  readonly character?:Partial<MovementSettings>;
  readonly camera?:Partial<CameraTuning>;
  readonly vehicles?:Readonly<Record<string,Partial<MovementSettings & {camera:number}>>>;
}
/** Replayable profile and the active controller's resolved settings. Observation only. */
export interface HumanoidConfiguration {
  readonly profile:HumanoidProfile;
  readonly effective:{
    readonly subjectId:string;
    readonly family:VehicleSpec['mode']|'character';
    readonly control:Partial<MovementSettings>;
    readonly camera:{readonly owner:'authored'|'follow';readonly mode:0|1|2;readonly settings:CameraTuning;readonly framing:HumanoidCameraFraming};
  };
}
/** Current camera anchor projection. Advisory only; it does not prove pixel visibility or absence of occlusion. */
export interface HumanoidCameraFraming {
  readonly advisory:true;
  readonly status:'observed'|'not-applicable'|'unavailable';
  readonly reason:string|null;
  readonly sampleSimulationSeconds:number|null;
  /** Offset inputs associated with this camera sample, interpolated between fixed poses. */
  readonly sampledOffsets:Readonly<Pick<CameraTuning,'targetHeightOffset'|'horizontalOffset'>>|null;
  /** True when configured offsets have not yet reached this displayed camera sample. */
  readonly offsetsPending:boolean|null;
  readonly headSource:'posture-eye'|'driver-eye'|'seat-eye-fallback'|null;
  readonly headPositionWorldMetersXYZ:Vec3|null;
  /** Top-left is [0,0], bottom-right [1,1]; null when behind the camera or unavailable. */
  readonly headScreenPositionNormalizedXY:readonly [number,number]|null;
  readonly headInFrame:boolean|null;
  readonly issues:readonly {readonly code:'SHOULDER_FRAMING_OFFSET_REVIEW';readonly message:string}[];
}
export interface BoardingObservation {
  readonly approachPositionWorldMetersXYZ:Vec3|null;
  readonly eligible:boolean;
  readonly reason:string;
  readonly message:string;
}
export interface HumanoidInputObservation {
  readonly override:{readonly source:'humanoid.set-input'|'setInput';readonly input:Input}|null;
  /** Last successful controller step; cleared when its input authority is released or replaced. */
  readonly lastApplied:{readonly source:'humanoid.set-input'|'setInput'|'world.humanoid'|'world-input';readonly input:Input;readonly simulationSeconds:number}|null;
}
export interface HumanoidSnapshot {
  readonly view:HumanoidViewSettings;
  readonly controls:{readonly character:MovementSettings;readonly vehicles:Readonly<Record<string,MovementSettings>>};
  readonly mapId:string;readonly timeSeconds:number;readonly cameraMode:0|1|2;
  readonly mountedInstanceId:string|null;readonly message:string;
  /** Latest controller sample, copied without issuing another physics query. */
  readonly water:{readonly declaredVolumeCount:number;readonly controllerActive:boolean;readonly swimming:boolean;readonly contact:{
    readonly volumeId:string;readonly surfaceHeightMeters:number;readonly depthMeters:number;readonly submersionRatio:number;
    readonly feetBelowSurfaceMeters:number;readonly requiredDepthMeters:number;readonly requiredFeetBelowSurfaceMeters:number;
    readonly depthCheckPassed:boolean;readonly immersionCheckPassed:boolean;readonly wasSwimmingAtSample:boolean;
    readonly entrySpeedMetersPerSecond:number;readonly entrySerial:number;
  }|null};
  readonly characterCapabilities:readonly CharacterCapabilityAvailability[];
  readonly character:{readonly instanceId:string;readonly state:string;readonly swimming:boolean;readonly swimStyle:'breaststroke'|'freestyle';readonly stance:string;readonly carrying:string|null;readonly seated:string|null;readonly activeAction:{readonly requestId:string;readonly action:string;readonly phase:string;readonly elapsedSeconds:number}|null};
  readonly vehicles:readonly {readonly instanceId:string;readonly assetId:string;readonly mode:VehicleSpec['mode'];readonly available:boolean;readonly speedMetersPerSecond:number;readonly throttle:number;readonly steering:number;readonly grounded:boolean;readonly submerged:boolean}[];
  readonly transition:{readonly kind:''|'enter'|'exit';readonly remainingSeconds:number};
  readonly traversal:{readonly kind:string;readonly phase:string;readonly progress:number;readonly elapsedSeconds:number;readonly durationSeconds:number;readonly sourceActionId:string}|null;
  readonly surface:{readonly mode:string;readonly surfaceId:string|null;readonly pose:{readonly actionId:string;readonly timeSeconds:number;readonly phase:string}|null};
  readonly interactionTargets:readonly {readonly id:string;readonly kind:'pickup'|'seat';readonly state:string;readonly approachPositionWorldMetersXYZ:Vec3;readonly facingYawRadians:number;readonly eligible:boolean;readonly reason:string;readonly message:string;readonly positionWorldMetersXYZ:Vec3;readonly rotationWorldQuaternionXYZW:readonly [number,number,number,number]}[];
  readonly vehicleDynamics:readonly {readonly drive:VehicleDriveTelemetry|null;readonly physicsOwner:'rigid-body'|'controller';readonly unicycle:Readonly<UnicycleState>|null;readonly submersible:Readonly<ReturnType<typeof submersibleDiagnostics>>|null;readonly raft:Readonly<RaftState>|null;readonly jetski:Readonly<ReturnType<typeof jetSkiDiagnostics>>|null;readonly kayak:Readonly<KayakState>|null;readonly atv:Readonly<AtvState>|null;readonly tank:Readonly<TankState>|null;readonly instanceId:string;readonly launched:boolean;readonly pitchRadians:number;readonly rollRadians:number;readonly creature:{readonly gait:string;readonly phase:number;readonly flying:boolean;readonly leadPositionWorldMetersXYZ:Vec3|null;readonly leadYawRadians:number|null}|null}[];
}
const tuple=(v:THREE.Vector3):Vec3=>[v.x,v.y,v.z];

/** SDK-owned actor solver. The engine supplies every fixed tick and owns rendering. */
export class HumanoidRuntime implements PhysicsPort {
  environment:EnvironmentQueries;
  readonly simulation:Simulation;
  readonly followCamera:FollowCamera;
  private input:Input|undefined;
  private inputGeneration=0;
  private inputSource:'humanoid.set-input'|'setInput'='setInput';
  private lastApplied:HumanoidInputObservation['lastApplied']=null;
  private readonly objects=new Map<string,THREE.Object3D>();
  private readonly specs:VehicleSpec[];
  private disposed=false;
  private episodeOwned=false;
  private readonly presentation:PresentationState;
  private presentationEpoch=0;
  private presentationCutTick:number|undefined;
  private visualSample:HumanoidDisplaySample|undefined;
  private authored=false;
  private baselineAuthored=false;
  private previousJump=false;
  private previousInteract=false;
  private baselineProfile:HumanoidProfile={};
  private profile:HumanoidProfile & {view:HumanoidViewSettings}={view:{...DEFAULT_HUMANOID_VIEW}};
  private readonly initialCamera:THREE.PerspectiveCamera;
  private currentMap:EnvironmentDefinition;
  private readonly visualUpdates=new Set<(deltaSeconds:number,sample:HumanoidDisplaySample)=>void>();
  private readonly simulationReplacements=new Set<()=>void>();
  static async create(options:HumanoidRuntimeOptions,camera:THREE.Camera):Promise<HumanoidRuntime>{
    validateEnvironment(options.map);
    if(Object.keys(options.cameraTuning??{}).some(k=>!Object.hasOwn(DEFAULT_CAMERA_TUNING,k)))throw new Error('HUMANOID_PROFILE_INVALID');
    parseCameraTuning({...DEFAULT_CAMERA_TUNING,...options.cameraTuning});
    if(!(camera instanceof THREE.PerspectiveCamera))throw new Error('HUMANOID_PERSPECTIVE_CAMERA_REQUIRED');
    const ids=[options.character.instanceId,...options.vehicles.map(v=>v.instanceId)];
    if(new Set(ids).size!==ids.length||ids.some(id=>!id.trim()))throw new Error('HUMANOID_INSTANCE_ID_INVALID');
    const ownedHorses = new Set<HorseVisual>();
    for(const vehicle of options.vehicles) {
      resolveVehicleSpec(vehicle.spec);
      if (vehicle.seatAnchor && !vehicle.visual) throw new Error('HORSE_INSTANCE_INVALID');
      if (vehicle.visual) {
        if (ownedHorses.has(vehicle.visual)) throw new Error('HORSE_INSTANCE_INVALID');
        ownedHorses.add(vehicle.visual);
        vehicle.object.updateWorldMatrix(true, false);
        const worldScale = new THREE.Vector3(); vehicle.object.getWorldScale(worldScale);
        if (vehicle.object !== vehicle.visual.root || !vehicle.visual.loaded || vehicle.spec.mode !== 'mount' ||
          vehicle.object.scale.distanceTo(new THREE.Vector3(1,1,1)) > 1e-9 || worldScale.distanceTo(new THREE.Vector3(1,1,1)) > 1e-9 ||
          !vehicle.object.matrixWorld.elements.every(Number.isFinite)) throw new Error('HORSE_INSTANCE_INVALID');
        vehicle.visual.readSeatAnchor(vehicle.spec.seat, vehicle.seatAnchor);
      }
    }
    await initEnvironmentQueries();return new HumanoidRuntime(options,camera);
  }
  private constructor(readonly options:HumanoidRuntimeOptions,readonly camera:THREE.PerspectiveCamera){
    this.currentMap=options.map;
    this.specs=options.vehicles.map(v=>({...structuredClone(v.spec),id:v.instanceId}));
    this.environment=new EnvironmentQueries(this.instanceMap(options.map));
    this.simulation=new Simulation(this.environment,this.specs);
    this.followCamera=new FollowCamera(camera,this.environment,options.vehicles);
    this.followCamera.eyePosition=target=>options.character.animation?.eyePosition(target)??false;
    this.followCamera.configureTuning(options.cameraTuning??{});this.initialCamera=new THREE.PerspectiveCamera().copy(camera,false);
    this.profile={view:{...DEFAULT_HUMANOID_VIEW},character:{...this.simulation.characterControl},camera:{...options.cameraTuning},vehicles:Object.fromEntries(this.simulation.vehicles.map(v=>[v.spec.id,{...readMovementSettings(v.spec),camera:v.spec.camera}]))};
    this.commitProfile(this.prepareProfile({}));
    this.objects.set(options.character.instanceId,options.character.object);
    for(const v of options.vehicles)this.objects.set(v.instanceId,v.object);
    const animation=options.character.animation;
    if(animation)this.simulation.setHumanoidAssets(animation.availableHumanoidClips,animation.motionSources);
    this.presentation=new PresentationState(this.simulation);
    registerHumanoidHost(this, {
      isDisposed: () => this.disposed,
      command: command => { this.assertLive(); return this.commandOwned(command); },
      setEpisodeOwned: owned => { this.assertLive(); this.episodeOwned=owned; },
      advance: (input,dt,pointer) => { this.assertLive(); this.advanceOwned(input,dt,pointer); },
      reset: () => { this.assertLive(); this.resetOwned(); },
      clearInput: () => { this.assertLive(); this.clearInputOwned(); },
      prepareEpisodeStart: start => { this.assertLive(); this.prepareEpisodeStartOwned(start); },
      present: (alpha,tick,view) => { this.assertLive(); return this.present(alpha,tick,view); },
    });
    this.followCamera.reset(this.simulation);this.sync(0,false);
  }
  private instanceMap(map:EnvironmentDefinition):EnvironmentDefinition {
    return {...map,spawns:map.spawns.flatMap(spawn=>{
      const match=this.options.vehicles.filter(v=>v.spec.id===spawn.vehicleId||v.assetId===spawn.vehicleId||v.instanceId===spawn.vehicleId);
      // Each asset's first instance inherits the authored slot. Duplicates use explicit preparation.
      return match.length?[{...spawn,vehicleId:match[0]!.instanceId}]:[spawn];
    })};
  }
  private assertLive():void { if(this.disposed)throw new Error('HUMANOID_DISPOSED'); }
  private assertExternalMutation():void {
    this.assertLive();
    if(this.episodeOwned)throw new Error('EPISODE_CAPTURE_OWNS_CLOCK');
  }
  advance(input:WorldInput,dt:number,pointer:CameraRigInput={}):void { this.assertExternalMutation(); this.advanceOwned(input,dt,pointer); }
  reset():void { this.assertExternalMutation(); this.resetOwned(); }
  prepareEpisodeStart(start:EpisodeStart):void { this.assertExternalMutation(); this.prepareEpisodeStartOwned(start); }
  clearInput():void { this.assertExternalMutation(); this.clearInputOwned(); }
  prepareCharacter(position:Vec3,yaw=0):boolean { this.assertExternalMutation(); return this.prepareCharacterOwned(position,yaw); }
  approach(id:string):boolean { this.assertExternalMutation(); return this.approachOwned(id); }
  setCameraMode(mode:0|1|2):void { this.assertExternalMutation(); this.setCameraModeOwned(mode); }
  get cameraMode():'authored'|'follow'{return this.authored?'authored':'follow';}
  command(command:HumanoidCommand):SkillResult|undefined{this.assertExternalMutation();return this.commandOwned(command);}
  private commandOwned(command:HumanoidCommand):SkillResult|undefined{
    const fields:Record<HumanoidCommand['type'],readonly string[]>={'vehicle.prepare':['instanceId','spawn'],'vehicle.approach':['instanceId'],'vehicle.enter':['instanceId'],'vehicle.exit':[],'vehicle.recover':[],'humanoid.set-camera-mode':['mode'],'humanoid.set-input':['input'],'humanoid.apply-profile':['profile'],'humanoid.perform-action':['request']};
    if(!Object.hasOwn(fields,command.type)||Object.keys(command).some(k=>k!=='type'&&!fields[command.type].includes(k)))throw new Error('HUMANOID_COMMAND_INVALID');
    let accepted=true;
    switch(command.type){
      case 'vehicle.prepare':if(!command.spawn||!Array.isArray(command.spawn.position)||command.spawn.position.length!==3||command.spawn.position.some(n=>!Number.isFinite(n))||!Number.isFinite(command.spawn.yaw))throw new Error('HUMANOID_SPAWN_INVALID');accepted=this.prepareOwned(command.instanceId,command.spawn);break;
      case 'vehicle.approach':accepted=this.approachOwned(command.instanceId);break;
      case 'vehicle.enter':accepted=this.enterOwned(command.instanceId);break;
      case 'vehicle.exit':accepted=this.exitOwned();break;
      case 'vehicle.recover':accepted=this.recoverVehicleOwned();break;
      case 'humanoid.set-camera-mode':this.setCameraModeOwned(command.mode);break;
      case 'humanoid.set-input':this.setInputOwned(command.input??undefined,'humanoid.set-input');break;
      case 'humanoid.apply-profile':this.applyProfileOwned(command.profile);break;
      case 'humanoid.perform-action': {
        // A command must obey the same restriction as per-tick humanoid input.
        // Reject before request() so no action or request identity gets queued.
        const restriction=this.characterRestriction();
        if(restriction)throw new Error(`${restriction.code}: ${restriction.message}`);
        const result = this.simulation.humanoid?.skills.request(command.request);
        if (!result) throw new Error('HUMANOID_CHARACTER_UNAVAILABLE');
        return result;
      }
    }
    if (!accepted) {
      const interaction = command.type === 'vehicle.enter' || command.type === 'vehicle.exit';
      const code = interaction ? this.simulation.failureCode ?? 'HUMANOID_COMMAND_BLOCKED' : 'HUMANOID_COMMAND_BLOCKED';
      throw new Error(`${code}: ${this.simulation.message}`);
    }
  }
  inputGuide():HumanoidInputGuide{
    const family=this.simulation.vehicle?.spec.mode??'character';
    return {family,fields:{...HUMANOID_INPUT_GUIDES[family]}};
  }
  commandDescriptors(id:string):import('../contracts').CommandDescriptor[]{
    const vec={type:'array',items:{type:'number'},minItems:3,maxItems:3};
    const object=(properties:Record<string,import('../contracts').JsonValue>,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
    const guide=this.inputGuide();
    const meaning=(key:string)=>guide.fields[key as keyof Input]??'Ignored for this control family; leave neutral.';
    const input=object(Object.fromEntries([...['forward','steer','lift','roll','pitch','strafe'].map(k=>[k,{type:'number',minimum:-1,maximum:1,description:meaning(k)}]),...['boost','brake','jump','slow'].map(k=>[k,{type:'boolean',description:meaning(k)}]),['actions',object(Object.fromEntries(HUMANOID_ACTION_INPUT_FIELDS.map(key=>[key,{type:'boolean'}])),[])]]) as Record<string,import('../contracts').JsonValue>,['forward','steer','lift','roll','pitch','strafe','boost','brake','jump','slow']);
    const create=(type:HumanoidCommand['type'],properties:Record<string,import('../contracts').JsonValue>):import('../contracts').CommandDescriptor=>({type,isAvailable:true,schema:{...object({type:{const:type},...properties}),...(type==='vehicle.approach'?{description:VEHICLE_APPROACH_DESCRIPTION}:{})}});
    if(id!==this.options.character.instanceId)return [create('vehicle.prepare',{instanceId:{const:id},spawn:object({id:{type:'string'},name:{type:'string'},position:vec,yaw:{type:'number'},regionId:{type:'string'},vehicleId:{type:'string'}},['id','name','position','yaw','regionId'])}),create('vehicle.approach',{instanceId:{const:id}}),create('vehicle.enter',{instanceId:{const:id}})];
    const profile=object({view:object(HUMANOID_VIEW_SCHEMA_PROPERTIES,[]),character:object(controlSchemaForFamily('character'),[]),vehicles:object(Object.fromEntries(this.simulation.vehicles.map(vehicle=>[vehicle.spec.id,object({...controlSchemaForFamily(vehicle.spec.mode,!!(vehicle.wheelPhysics||vehicle.bodyPhysics?.powertrain)),camera:VEHICLE_CAMERA_DISTANCE_SCHEMA},[])])),[]),cameraDistanceMeters:{anyOf:[CAMERA_DISTANCE_METERS_SCHEMA,{type:'null'}]},camera:object(CAMERA_SCHEMA_PROPERTIES,[])},[]);
    return [create('vehicle.exit',{}),create('vehicle.recover',{}),create('humanoid.set-camera-mode',{mode:{enum:[0,1,2]}}),create('humanoid.set-input',{input:{anyOf:[input,{type:'null'}]}}),create('humanoid.apply-profile',{profile}),create('humanoid.perform-action',{request:object({requestId:{type:'string'},action:{enum:['roll','slide','pickup','putDown','sit','standUp']},targetId:{type:'string'}},['requestId','action'])})];
  }
  snapshot():HumanoidSnapshot{
    const s=this.simulation,h=s.humanoid,tr=h?.traversal,surface=h?.surface;
    const targets=new Map(h?.skills.listTargets().map(target=>[target.id,target])??[]);
    const waterControllerActive=Boolean(h&&!s.vehicle&&!tr),contact=waterControllerActive?h?.water:null;
    return {
      view:{...this.profile.view},
      controls:{character:readMovementSettings(s.characterControl),vehicles:Object.fromEntries(s.vehicles.map(v=>[v.spec.id,readMovementSettings(v.spec)]))},
      mapId:this.currentMap.id,timeSeconds:s.time,cameraMode:this.followCamera.mode as 0|1|2,mountedInstanceId:s.vehicle?.spec.id??null,message:s.message,
      water:{declaredVolumeCount:this.currentMap.water.length,controllerActive:waterControllerActive,swimming:waterControllerActive&&Boolean(h?.swimming),
        contact:contact?{volumeId:contact.volumeId,surfaceHeightMeters:contact.surfaceY,depthMeters:contact.depth,submersionRatio:contact.submersion,
          feetBelowSurfaceMeters:contact.feetBelowSurfaceMeters,requiredDepthMeters:contact.requiredDepthMeters,requiredFeetBelowSurfaceMeters:contact.requiredFeetBelowSurfaceMeters,
          depthCheckPassed:contact.depthCheckPassed,immersionCheckPassed:contact.immersionCheckPassed,wasSwimmingAtSample:contact.wasSwimmingAtSample,
          entrySpeedMetersPerSecond:contact.entrySpeed,entrySerial:contact.entrySerial}:null},
      characterCapabilities:this.characterCapabilities().map(({id,eligible,reason,message,targetId})=>({id,eligible,reason,message,...(targetId?{targetId}:{})})),
      character:{swimStyle:h?.swimStyle??'breaststroke',instanceId:this.options.character.instanceId,state:h?.state??s.player.animation,swimming:!s.vehicle&&s.player.swimming,stance:h?.stance??'stand',carrying:h?.skills.carrying??null,seated:h?.skills.seated??null,activeAction:h?.skills.active?{requestId:h.skills.active.requestId,action:h.skills.active.id,phase:h.skills.active.phase,elapsedSeconds:h.skills.active.elapsed}:null},
      vehicles:s.vehicles.map((v,i)=>({instanceId:v.spec.id,assetId:this.options.vehicles[i]!.assetId,mode:v.spec.mode,available:s.available(v),speedMetersPerSecond:v.velocity.length(),throttle:v.throttle,steering:v.steering,grounded:v.grounded,submerged:v.submerged})),
      transition:{kind:s.transitionKind,remainingSeconds:s.transition},
      traversal:tr?{kind:tr.probe.kind,phase:tr.phase,progress:tr.progress,elapsedSeconds:tr.elapsed,durationSeconds:tr.duration,sourceActionId:tr.motion.sourceId}:null,
      surface:{mode:surface?.mode??'none',surfaceId:surface?.surface?.id??null,pose:surface?.pose?{actionId:surface.pose.key,timeSeconds:surface.pose.time,phase:surface.pose.phase??''}:null},
      interactionTargets:readInteractionTargets(h).filter(t=>targets.has(t.id)).map(t=>({id:t.id,kind:t.kind,state:t.state,approachPositionWorldMetersXYZ:targets.get(t.id)!.approach,facingYawRadians:targets.get(t.id)!.yaw,eligible:targets.get(t.id)!.eligible,reason:targets.get(t.id)!.reason,message:targets.get(t.id)!.message,positionWorldMetersXYZ:tuple(t.position),rotationWorldQuaternionXYZW:t.rotation?[t.rotation.x,t.rotation.y,t.rotation.z,t.rotation.w]:[0,0,0,1]})),
      vehicleDynamics:s.vehicles.map(v=>({drive:vehicleDriveTelemetry(v),physicsOwner:v.wheelPhysics||v.bodyPhysics?'rigid-body':'controller',unicycle:copyUnicycleState(v.unicycle)??null,submersible:v.submersible?submersibleDiagnostics(v.submersible):null,raft:v.raft?{...v.raft}:null,jetski:v.jetski?jetSkiDiagnostics(v.jetski):null,kayak:v.kayak?{...v.kayak}:null,atv:copyAtvState(v.atv)??null,tank:v.tank?{...v.tank}:null,instanceId:v.spec.id,launched:v.launched,pitchRadians:v.pitch,rollRadians:v.roll,creature:v.creature?{gait:v.creature.gait,phase:v.creature.phase,flying:v.creature.flying,leadPositionWorldMetersXYZ:v.creature.leadPosition?tuple(v.creature.leadPosition):null,leadYawRadians:v.creature.leadYaw??null}:null})),
    };
  }
  private characterRestriction():{code:string;message:string}|undefined{
    if(this.simulation.transition>0)return {code:'HUMANOID_TRANSITION_ACTIVE',message:'骑乘切换尚未完成'};
    if(this.simulation.vehicle?.spec.mode==='mount')return {code:'HUMANOID_ALREADY_MOUNTED',message:'人物已经骑乘'};
    return;
  }
  characterCapabilities():CharacterCapabilityState[]{const restriction=this.characterRestriction();return characterCapabilities(this.simulation.humanoid??undefined).map(card=>restriction?{...card,eligible:false,reason:restriction.code,message:restriction.message}:card);}
  actionIds(id:string):readonly string[]{return id===this.options.character.instanceId?[...this.options.character.animation?.availableHumanoidClips??[]]:[];}
  animationState(id:string):import('../contracts').EntityState['animation']{if(id!==this.options.character.instanceId)return;const source=this.options.character.animation?.sourceCharacter;if(!source)return;const key=Object.keys(source.weights).sort((a,b)=>(source.weights[b]??0)-(source.weights[a]??0))[0];if(!key||!source.actions[key])return;const action=source.actions[key];return {actionId:key,clipName:action.getClip().name,timeSeconds:action.time};}
  cameraSnapshot():import('../contracts').CameraState{
    const c=this.followCamera,{position,rotation:q}=readCameraWorldPose(this.camera);
    const actual={mode:this.cameraMode,positionWorldMetersXYZ:tuple(position),orientationWorldQuaternionXYZW:[q.x,q.y,q.z,q.w] as const};
    if(this.authored)return {...actual,desiredPositionWorldMetersXYZ:null,desiredYawRadians:null,desiredPitchRadians:null};
    return {...actual,desiredPositionWorldMetersXYZ:tuple(c.desiredPosition),desiredYawRadians:c.yaw,desiredPitchRadians:c.pitch,desiredArmDistanceMeters:c.desiredPosition.distanceTo(c.target),actualArmDistanceMeters:c.presentationTarget.distanceTo(position),collisionPhase:c.collisionLimited?'constrained':'clear'};
  }
  useAuthoredCamera():void{this.assertExternalMutation();this.authored=true;this.options.character.animation?.setFirstPerson(false);}
  private setCameraModeOwned(mode:0|1|2):void{if(![0,1,2].includes(mode))throw new Error('HUMANOID_CAMERA_MODE_INVALID');this.authored=false;this.followCamera.mode=mode;this.followCamera.reset(this.simulation);this.options.character.animation?.setFirstPerson(mode===1);this.followCamera.update(this.simulation,0);this.followCamera.capturePresentationPose(this.simulation,true);}
  validateInput(input:Input):void{
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('HUMANOID_INPUT_INVALID');
    for(const key of ['forward','steer','lift','roll','pitch','strafe'] as const)if(typeof input[key]!=='number'||!Number.isFinite(input[key])||Math.abs(input[key])>1)throw new Error('HUMANOID_INPUT_INVALID');
    for(const key of ['boost','brake','jump','slow'] as const)if(typeof input[key]!=='boolean')throw new Error('HUMANOID_INPUT_INVALID');
    if(Object.keys(input).some(key=>!['forward','steer','lift','roll','pitch','strafe','boost','brake','jump','slow','actions'].includes(key)))throw new Error('HUMANOID_INPUT_INVALID');
    if(input.actions!==undefined&&(!input.actions||typeof input.actions!=='object'||Array.isArray(input.actions)||Object.entries(input.actions).some(([key,value])=>!(HUMANOID_ACTION_INPUT_FIELDS as readonly string[]).includes(key)||typeof value!=='boolean')))throw new Error('HUMANOID_INPUT_INVALID');
  }
  setInput(input:Input):()=>void;
  setInput(input:undefined):void;
  setInput(input:Input|undefined):(()=>void)|void;
  setInput(input:Input|undefined):(()=>void)|void{this.assertExternalMutation();return this.setInputOwned(input);}
  inspectBoarding(instanceId:string):BoardingObservation {
    this.assertLive();this.index(instanceId);return this.simulation.inspectBoarding(instanceId);
  }
  inspectControls():HumanoidInputObservation {
    return structuredClone({override:this.input?{source:this.inputSource,input:this.input}:null,lastApplied:this.lastApplied});
  }
  private setInputOwned(input:Input|undefined,source:'humanoid.set-input'|'setInput'='setInput'):(()=>void)|void{
    if(input===undefined){this.input=undefined;this.inputGeneration++;this.lastApplied=null;return;}
    this.validateInput(input);const generation=++this.inputGeneration;
    this.input=structuredClone(input);this.inputSource=source;this.lastApplied=null;
    return()=>{this.assertExternalMutation();if(this.inputGeneration===generation){this.input=undefined;this.inputGeneration++;this.lastApplied=null;}};
  }
  private clearInputOwned():void{this.input=undefined;this.inputGeneration++;this.lastApplied=null;this.previousJump=false;this.previousInteract=false;}
  private index(id:string):number{const n=this.options.vehicles.findIndex(v=>v.instanceId===id);if(n<0)throw new Error(`HUMANOID_INSTANCE_UNKNOWN: ${id}`);return n;}
  prepare(id:string,spawn:MapSpawn):boolean{this.assertExternalMutation();return this.prepareOwned(id,spawn);}
  private prepareOwned(id:string,spawn:MapSpawn):boolean{const ok=this.simulation.prepare(this.index(id),spawn);this.sync(0);return ok;}
  private approachOwned(id:string):boolean{this.index(id);const ok=this.simulation.approach(id);this.sync(0);return ok;}
  recoverVehicle():boolean{this.assertExternalMutation();return this.recoverVehicleOwned();}
  private recoverVehicleOwned():boolean{const ok=this.simulation.recoverVehicle();if(ok){this.clearInputOwned();this.presentation.snap(this.simulation);this.followCamera.reset(this.simulation);this.sync(0);}return ok;}
  interact():boolean{this.assertExternalMutation();const ok=this.simulation.interact();if(ok)this.sync(0);return ok;}
  enter(id:string):boolean{this.assertExternalMutation();return this.enterOwned(id);}
  private enterOwned(id:string):boolean{const ok=this.simulation.enter(id);if(ok)this.sync(0);return ok;}
  exit():boolean{this.assertExternalMutation();return this.exitOwned();}
  private exitOwned():boolean{const ok=this.simulation.exit();if(ok)this.sync(0);return ok;}
  private prepareCharacterOwned(position:Vec3,yaw=0):boolean{const ok=this.simulation.prepareCharacter(new THREE.Vector3(...position),yaw);this.sync(0);return ok;}
  private defaultCameraMode():0|1{return this.profile.view.defaultPerspective==='first-person'?1:0;}
  private restoreDefaultCameraMode():void{
    if(this.authored){this.followCamera.mode=this.defaultCameraMode();this.followCamera.reset(this.simulation);}
    else this.setCameraModeOwned(this.defaultCameraMode());
  }
  private prepareProfile(profile:HumanoidProfile):HumanoidProfile & {view:HumanoidViewSettings;camera:Partial<CameraTuning>;character:MovementSettings;vehicles:Record<string,MovementSettings & {camera:number}>;cameraDistanceMeters:number|null}{
    const object=(value:unknown)=>!!value&&typeof value==='object'&&!Array.isArray(value);
    if(!object(profile)||Object.keys(profile).some(k=>!['view','character','camera','vehicles','cameraDistanceMeters'].includes(k)))throw new Error('HUMANOID_PROFILE_INVALID');
    for(const section of [profile.view,profile.character,profile.camera,profile.vehicles])if(section!==undefined&&!object(section))throw new Error('HUMANOID_PROFILE_INVALID');
    if(Object.keys(profile.view??{}).some(k=>!Object.hasOwn(HUMANOID_VIEW_SCHEMA_PROPERTIES,k)))throw new Error('HUMANOID_PROFILE_INVALID');
    const view={...this.profile.view,...profile.view};
    if(!['first-person','third-person'].includes(view.defaultPerspective)||typeof view.keyboardToggleEnabled!=='boolean')throw new Error('HUMANOID_PROFILE_INVALID');
    if(Object.keys(profile.camera??{}).some(k=>!Object.hasOwn(DEFAULT_CAMERA_TUNING,k)))throw new Error('HUMANOID_PROFILE_INVALID');
    for(const [id,values] of Object.entries(profile.vehicles??{})){this.index(id);if(!object(values)||Object.keys(values).some(k=>k!=='camera'&&!Object.hasOwn(CONTROL_RANGES,k)))throw new Error('HUMANOID_PROFILE_INVALID');}
    const camera={...this.profile.camera,...profile.camera};
    parseCameraTuning({...DEFAULT_CAMERA_TUNING,...camera});
    const character=parseMovementSettings(profile.character??{},this.simulation.characterControl);
    const vehicles=Object.fromEntries(this.simulation.vehicles.map(v=>{const {camera=v.spec.camera,...control}=profile.vehicles?.[v.spec.id]??{};return [v.spec.id,{...parseMovementSettings(control,readMovementSettings(v.spec)),camera}];}));
    const numbers=[...Object.values(character),...Object.values(vehicles).flatMap(v=>Object.values(v))];
    if(numbers.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))throw new Error('HUMANOID_PROFILE_INVALID');
    const cameraDistanceMeters=profile.cameraDistanceMeters===undefined?this.followCamera.baseDistance??null:profile.cameraDistanceMeters;
    if(cameraDistanceMeters!==null&&(!Number.isFinite(cameraDistanceMeters)||cameraDistanceMeters<=CAMERA_DISTANCE_METERS_SCHEMA.exclusiveMinimum||cameraDistanceMeters>CAMERA_DISTANCE_METERS_SCHEMA.maximum))throw new Error('HUMANOID_PROFILE_INVALID');
    return {view,cameraDistanceMeters,character,camera,vehicles};
  }
  private configureSimulation(simulation:Simulation,profile:ReturnType<HumanoidRuntime['prepareProfile']>):void{
    simulation.characterControl={...profile.character};
    const h=simulation.humanoid,c=simulation.characterControl;if(h)h.movementTuning={speedScale:c.speed/3.8,accelerationScale:c.accel/12,airControlScale:c.grip/3,turnScale:c.steer/14,maxSpeed:c.maxSpeed,slowSpeed:c.slowSpeed,coastDeceleration:c.coastDeceleration,jumpSpeed:c.jumpSpeed};
    for(const v of simulation.vehicles)Object.assign(v.spec,profile.vehicles[v.spec.id]);
  }
  private commitProfile(profile:ReturnType<HumanoidRuntime['prepareProfile']>):void{
    this.configureSimulation(this.simulation,profile);this.followCamera.configureTuning(profile.camera);
    if(profile.cameraDistanceMeters===null)delete this.followCamera.baseDistance;else this.followCamera.baseDistance=profile.cameraDistanceMeters;
    this.profile=structuredClone(profile);this.baselineProfile=structuredClone(profile);
  }
  applyProfile(profile:HumanoidProfile):void{this.assertExternalMutation();this.applyProfileOwned(profile);}
  private applyProfileOwned(profile:HumanoidProfile):void{
    this.commitProfile(this.prepareProfile(profile));
    if(profile.view?.defaultPerspective!==undefined)this.setCameraModeOwned(this.defaultCameraMode());
  }
  /** Export the replayable profile; camera contains explicit overrides, not mode defaults. */
  exportProfile():HumanoidProfile{return structuredClone(this.profile);}
  inspectConfiguration():HumanoidConfiguration{
    const vehicle=this.simulation.vehicle,family=vehicle?.spec.mode??'character';
    const controls=vehicle?.spec??this.simulation.characterControl;
    return {profile:this.exportProfile(),effective:{
      subjectId:vehicle?.spec.id??this.options.character.instanceId,family,
      control:Object.fromEntries(controlFields(family,!!(vehicle?.wheelPhysics||vehicle?.bodyPhysics?.powertrain)).filter(field=>!field.disabled).map(field=>[field.key,controls[field.key]])),
      camera:{owner:this.authored?'authored':'follow',mode:this.followCamera.mode as 0|1|2,settings:this.followCamera.getEffectiveTuning(this.simulation),framing:this.inspectCameraFraming()},
    }};
  }
  private inspectCameraFraming():HumanoidCameraFraming {
    const empty={advisory:true as const,sampleSimulationSeconds:null,sampledOffsets:null,offsetsPending:null,headSource:null,headPositionWorldMetersXYZ:null,headScreenPositionNormalizedXY:null,headInFrame:null,issues:[]};
    if(this.authored||this.followCamera.mode===1)return {...empty,status:'not-applicable',reason:this.authored?'authored-camera':'first-person'};
    const sample=this.followCamera.framingSample;
    if(!sample)return {...empty,status:'unavailable',reason:'no-camera-sample'};
    // Compose a private view matrix: inspection must not change camera matrices,
    // render interpolation, collision history, animation or the simulation clock.
    const matrix=this.camera.matrixAutoUpdate?new THREE.Matrix4().compose(this.camera.position,this.camera.quaternion,this.camera.scale):this.camera.matrix.clone();
    if(this.camera.parent)matrix.premultiply(this.camera.parent.matrixWorld);
    const clip=new THREE.Vector4(sample.position.x,sample.position.y,sample.position.z,1).applyMatrix4(matrix.invert()).applyMatrix4(this.camera.projectionMatrix);
    if(!clip.toArray().every(Number.isFinite)||Math.abs(clip.w)<1e-9)return {...empty,status:'unavailable',reason:'invalid-projection'};
    const point:readonly [number,number]|null=clip.w>0?[(clip.x/clip.w+1)/2,(1-clip.y/clip.w)/2]:null;
    const headInFrame=point!==null&&point.every(value=>value>=0&&value<=1)&&Math.abs(clip.z/clip.w)<=1;
    const camera=this.followCamera.getEffectiveTuning(this.simulation);
    const offset=sample.offsets.targetHeightOffset!==0||sample.offsets.horizontalOffset!==0;
    const offsetsPending=Math.abs(camera.targetHeightOffset-sample.offsets.targetHeightOffset)>1e-9||Math.abs(camera.horizontalOffset-sample.offsets.horizontalOffset)>1e-9;
    const edge=point===null||point[0]<.05||point[0]>.95||point[1]<.1||point[1]>.9;
    return {advisory:true,status:'observed',reason:offsetsPending?'framing-offsets-await-camera-update':null,sampleSimulationSeconds:sample.simulationSeconds,sampledOffsets:sample.offsets,offsetsPending,headSource:sample.source,headPositionWorldMetersXYZ:tuple(sample.position),headScreenPositionNormalizedXY:point,headInFrame,
      issues:this.followCamera.mode===2&&offset&&edge?[{code:'SHOULDER_FRAMING_OFFSET_REVIEW',message:'The head anchor projects near or outside the frame with additional profile.camera offsets. Compare a current-view capture with targetHeightOffset and horizontalOffset at 0; these are additions to the SDK posture anchor, not eye height. Orbit and collision may also affect framing. Projection alone does not prove pixel visibility.'}]:[]};
  }
  onVisualUpdate(callback:(deltaSeconds:number,sample:HumanoidDisplaySample)=>void):()=>void{this.assertLive();this.visualUpdates.add(callback);return()=>{this.visualUpdates.delete(callback);};}
  onSimulationReplaced(callback:()=>void):()=>void{this.assertLive();this.simulationReplacements.add(callback);return()=>{this.simulationReplacements.delete(callback);};}
  switchMap(map:EnvironmentDefinition):void{this.assertExternalMutation();
    const profile=this.prepareProfile(this.profile);validateEnvironment(map);
    const replacement=new EnvironmentQueries(this.instanceMap(map));
    const previous=this.environment;
    let staged:Simulation;try{staged=this.simulation.prepareEnvironment(replacement);this.configureSimulation(staged,profile);}catch(error){replacement.dispose();throw error;}
    this.simulation.adoptEnvironment(staged);this.currentMap=map;this.environment=replacement;this.followCamera.environment=replacement;this.commitProfile(profile);previous.dispose();
    for(const notify of this.simulationReplacements)notify();
    this.clearInputOwned();this.restoreDefaultCameraMode();this.sync(0);
  }
  sealInitialState():void{
    this.assertExternalMutation();this.baselineProfile=this.exportProfile();
    // Engine seals after scene setup, before the first start/step/reset.
    this.baselineAuthored=this.authored;this.initialCamera.copy(this.camera,false);
  }
  episodeCapabilities():NonNullable<EpisodeCapabilities['humanoid']>{return {mapId:this.currentMap.id,characterInstanceId:this.options.character.instanceId,vehicles:this.snapshot().vehicles.map(({instanceId,assetId,mode,available})=>({instanceId,assetId,mode,available})),cameraModes:[0,1,2],inputAxes:['forward','steer','lift','roll','pitch','strafe','boost','brake','jump','slow','actions']};}
  private episodeCandidate(start:EpisodeStart){
    const config=start.humanoid!,index=this.index(config.vehicleInstanceId!),current=this.simulation.vehicles[index]!;
    if(!this.simulation.available(current))throw new Error('HUMANOID_VEHICLE_UNAVAILABLE');
    const candidate=createVehicle(current.spec);candidate.position.set(...start.positionWorldMetersXYZ);candidate.yaw=start.facingYawRadians+Math.PI;candidate.pitch=config.pitchRadians??0;candidate.roll=config.rollRadians??0;
    candidate.rotation.setFromEuler(new THREE.Euler(-candidate.pitch,candidate.yaw,candidate.roll,'YXZ'));
    if(config.velocityWorldMetersPerSecondXYZ)candidate.velocity.set(...config.velocityWorldMetersPerSecondXYZ);
    candidate.speed=candidate.velocity.length();candidate.throttle=config.throttle??0;candidate.launched=config.launched??candidate.speed>0;
    const floor=this.environment.support(candidate.position,.15,.1);candidate.grounded=!!floor&&Math.abs(floor.height-candidate.position.y)<.15;candidate.submerged=!!this.environment.waterAt(candidate.position)&&candidate.spec.mode==='submarine';
    resetCreatureState(candidate);if(candidate.creature&&config.launched)candidate.creature.flying=true;
    return {candidate,index};
  }
  probeEpisodeStart(start:EpisodeStart):EpisodeStartProbe{
    const config=start.humanoid;
    if(config){
      for(const value of [config.pitchRadians,config.rollRadians,config.throttle])if(value!==undefined&&!Number.isFinite(value))throw new Error('HUMANOID_START_INVALID');
      if(config.throttle!==undefined&&(config.throttle<0||config.throttle>1))throw new Error('HUMANOID_START_INVALID');
      if(config.cameraMode!==undefined&&![0,1,2].includes(config.cameraMode))throw new Error('HUMANOID_START_INVALID');
      if(config.velocityWorldMetersPerSecondXYZ&&(!Array.isArray(config.velocityWorldMetersPerSecondXYZ)||config.velocityWorldMetersPerSecondXYZ.length!==3||config.velocityWorldMetersPerSecondXYZ.some(v=>!Number.isFinite(v))))throw new Error('HUMANOID_START_INVALID');
    }
    if(!config?.vehicleInstanceId)return this.probeCharacterStart(this.options.character.instanceId,start.positionWorldMetersXYZ);
    const {candidate,index}=this.episodeCandidate(start),q=this.environment,safe=q.safeSpawn(candidate.position,vehicleBody(candidate.spec),candidate.rotation);
    let valid=!!safe&&safe.distanceTo(candidate.position)<=.35;
    if(safe)candidate.position.copy(safe);
    valid=valid&&canPlaceCreature(candidate,q);
    if(candidate.spec.archetype!=='raft'&&['paddled_boat','boat','submarine'].includes(candidate.spec.mode))valid=valid&&q.waterContains(candidate.position,candidate.spec.radius);
    // Start relocation cannot overwrite another parked actor's occupied envelope.
    valid=valid&&!this.simulation.vehicles.some((v,i)=>i!==index&&this.simulation.available(v)&&Math.abs(v.position.y-candidate.position.y)<2&&Math.hypot(v.position.x-candidate.position.x,v.position.z-candidate.position.z)<v.spec.radius+candidate.spec.radius);
    return {isValid:valid,requestedPositionWorldMetersXYZ:start.positionWorldMetersXYZ,resolvedPositionWorldMetersXYZ:tuple(candidate.position),diagnostics:valid?[]:[{code:'HUMANOID_START_BLOCKED',message:'The full vehicle envelope, medium or another actor blocks this start.'}]};
  }
  private prepareEpisodeStartOwned(start:EpisodeStart):void{
    const probe=this.probeEpisodeStart(start);if(!probe.isValid)throw new Error('HUMANOID_START_BLOCKED');
    this.clearInputOwned();const config=start.humanoid;
    if(config?.vehicleInstanceId){
      const {candidate,index}=this.episodeCandidate({...start,positionWorldMetersXYZ:probe.resolvedPositionWorldMetersXYZ});Object.assign(this.simulation.vehicles[index]!,candidate);
      if(config.mounted===false){if(!this.approachOwned(config.vehicleInstanceId))throw new Error('HUMANOID_START_EXIT_BLOCKED');}
      else{if(!this.simulation.humanoid?.setMounted(true))throw new Error('HUMANOID_START_MOUNT_BLOCKED');this.simulation.active=index;this.simulation.transition=0;this.simulation.transitionKind='';this.simulation.player.position.copy(candidate.position).add(new THREE.Vector3(...candidate.spec.seat).applyQuaternion(candidate.rotation));this.simulation.player.yaw=candidate.yaw;}
    }else if(!this.prepareCharacterOwned(probe.resolvedPositionWorldMetersXYZ,start.facingYawRadians+Math.PI))throw new Error('HUMANOID_START_BLOCKED');
    this.simulation.teleportRevision++;this.setCameraModeOwned(config?.cameraMode??this.defaultCameraMode());this.followCamera.reset(this.simulation);this.sync(0);
  }
  private advanceOwned(input:WorldInput,dt:number,pointer:CameraRigInput={}):void{
    if(this.disposed)throw new Error('HUMANOID_DISPOSED');
    if(input.cameraTogglePressed&&this.profile.view.keyboardToggleEnabled&&!this.authored)this.setCameraModeOwned((this.followCamera.mode+1)%3 as 0|1|2);
    if(!this.authored)this.followCamera.beforeFixedUpdate();
    const previousBinding=this.presentation.active,previousRevision=this.presentation.revision;
    this.presentation.beforeStep(this.simulation);
    const controls=this.input??input.humanoid??{...emptyInput(),forward:-(input.moveZRatio??0),steer:input.moveXRatio??0,lift:input.moveYRatio??0,boost:!!input.run,jump:input.jumpPressed??!!(input.jump&&!this.previousJump)};
    if(!this.input&&(input.interactPressed??!!(input.interact&&!this.previousInteract))){if(this.simulation.interact())this.sync(0);}
    if(pointer.yawDeltaRadians||pointer.pitchDeltaRadians)this.followCamera.orbitRadians(pointer.yawDeltaRadians??0,pointer.pitchDeltaRadians??0,this.simulation.time,this.simulation);
    if(pointer.distanceDeltaMeters)this.followCamera.zoomByMeters(pointer.distanceDeltaMeters,this.simulation);
    if(input.cameraYawRatio||input.cameraPitchRatio)this.followCamera.orbitRadians((input.cameraYawRatio??0)*dt*1.2,(input.cameraPitchRatio??0)*dt,this.simulation.time,this.simulation);
    this.simulation.step(controls,dt,this.followCamera.yaw);
    this.lastApplied={source:this.input?this.inputSource:input.humanoid?'world.humanoid':'world-input',input:structuredClone(controls),simulationSeconds:this.simulation.time};
    this.presentation.afterStep(this.simulation);this.sync(dt);
    if(!this.authored){this.followCamera.update(this.simulation,dt);this.followCamera.capturePresentationPose(this.simulation,previousBinding!==this.simulation.active||previousRevision!==this.simulation.teleportRevision);}
    this.previousJump=!!input.jump;this.previousInteract=!!input.interact;
    // One-shot commands are consumed exactly once even during multi-tick frames.
    if(this.input)this.input={...this.input,jump:false,actions:{}};
  }
  private sync(dt:number,snapCamera=true):void {
    for(const v of this.simulation.vehicles){const object=this.objects.get(v.spec.id)!;object.position.copy(v.position);object.quaternion.copy(v.rotation);object.visible=this.simulation.available(v);}
    const p=this.simulation.player,object=this.options.character.object;
    this.options.character.animation?.setFirstPerson(!this.authored&&this.followCamera.mode===1);
    object.position.copy(p.position);object.rotation.set(0,p.yaw,0);
    const mounted=this.simulation.vehicle;
    if(dt===0&&mounted?.unicycle){
      const support=refreshUnicycleSupport(mounted,this.environment);
      if(!support||mounted.speed>UNICYCLE_TIMING.stoppedSpeed){mounted.unicycle.footDown=0;mounted.unicycle.phase=mounted.grounded?'riding':'airborne';}
    }
    if(mounted){object.position.copy(mounted.position).add(new THREE.Vector3(...mounted.spec.seat).applyQuaternion(mounted.rotation));object.quaternion.copy(mounted.rotation);}
    const pose=readHumanoid(this.simulation.humanoid);
    if(pose){pose.mounted=mounted?(mounted.spec.characterPose??'drive'):null;
      if(mounted?.kayak)pose.kayakPose={...mounted.kayak};
      if(mounted?.jetski)pose.atvSteeringAngle=mounted.jetski.steeringAngle;
      if(mounted?.unicycle)pose.unicyclePose=copyUnicycleState(mounted.unicycle);
      if(mounted?.atv)pose.atvSteeringAngle=mounted.atv.steeringAngle;
      if(mounted?.sled)pose.sledPose={...mounted.sled};}
    if(pose)this.options.character.animation?.update(dt,pose);
    for(const object of this.objects.values())object.updateWorldMatrix(true,true);
    this.options.character.animation?.capturePresentationPose();
    if(dt===0){
      this.presentation.snap(this.simulation);this.presentationEpoch++;this.visualSample=undefined;this.presentationCutTick=undefined;
      this.options.character.animation?.capturePresentationPose();
      if(!this.authored){
        if(snapCamera){
          this.followCamera.beforeFixedUpdate();
          this.followCamera.update(this.simulation,0);
        }
        this.followCamera.capturePresentationPose(this.simulation,true);
      }
    }
    this.sampleHorses(this.presentation.sample(1,this.presentationEpoch,0,0));
    this.alignHorseRider();this.sampleSkiEquipment();
  }
  private sampleHorses(sample: HumanoidDisplaySample): void {
    this.options.vehicles.forEach((instance, index) => {
      const pose = sample.vehicles[index]!;
      if(pose.submersible)sampleSubmersibleVisual(instance.object,pose.submersible,sample.timeSeconds);
      if(pose.raft)sampleRaftVisual(instance.object,pose.raft);
      if(pose.jetski)sampleJetSkiVisual(instance.object,pose.jetski,sample.timeSeconds);
      if(pose.unicycle)sampleUnicycleVisual(instance.object,pose.unicycle);
      if(pose.atv)sampleAtvVisual(instance.object,pose.atv);
      if(pose.kayak)sampleKayakVisual(instance.object,pose.kayak,pose.speed);
      if(pose.tank)sampleTankVisual(instance.object,pose.tank);
      instance.visual?.sample({epoch:sample.epoch,timeSeconds:sample.timeSeconds,
        phase:pose.creature?.phase ?? 0,speedMetersPerSecond:pose.speed,gait:pose.creature?.gait ?? 'graze'});
    });
  }
  private sampleSkiEquipment():void {
    this.options.vehicles.forEach((instance,index)=>{
      if(instance.spec.mode==='ski')sampleSkiEquipment(instance.object,index===this.simulation.active?this.options.character.object:null);
    });
  }
  private alignHorseRider(): void {
    const index = this.simulation.active;
    if (index < 0) return;
    const instance = this.options.vehicles[index]!;
    if (!instance.visual) return;
    instance.object.updateWorldMatrix(true, true);
    const anchor = instance.visual.readSeatAnchor(this.simulation.vehicles[index]!.spec.seat, instance.seatAnchor);
    this.options.character.animation?.alignMountedPelvis(instance.object.matrixWorld.clone().multiply(anchor));
  }
  /** Canonical copies: physical observations never read a temporary display root. */
  logicalPose(id:string):{position:THREE.Vector3;rotation:THREE.Quaternion}|undefined {
    if(id===this.options.character.instanceId){
      const mounted=this.simulation.vehicle;
      if(mounted)return {
        position:mounted.position.clone().add(new THREE.Vector3(...mounted.spec.seat).applyQuaternion(mounted.rotation)),
        rotation:mounted.rotation.clone(),
      };
      return {
        position:this.simulation.player.position.clone(),
        rotation:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),this.simulation.player.yaw),
      };
    }
    const vehicle=this.simulation.vehicles.find(value=>value.spec.id===id);
    return vehicle?{position:vehicle.position.clone(),rotation:vehicle.rotation.clone()}:undefined;
  }
  private present(alpha:number,tick:number,view:'world'|'object'='world'):()=>void {
    if(this.presentation.revision!==this.simulation.teleportRevision||this.presentation.active!==this.simulation.active){
      this.presentation.snap(this.simulation);this.presentationEpoch++;this.visualSample=undefined;this.presentationCutTick=undefined;
    }
    // A cut fixes every owner at the current sample until a new fixed interval.
    // In particular, a later RAF alpha cannot rewind only bones or the camera.
    const cut=this.presentationCutTick===tick;
    let sample=this.presentation.sample(cut?1:alpha,this.presentationEpoch,cut?tick:Math.max(0,tick-1),tick);
    const previous=this.visualSample;
    // Explicit captures may precede a live frame at an earlier interpolation time.
    // A rewind is a history cut, never a negative delta hidden by clamping.
    if(previous&&sample.timeSeconds<previous.timeSeconds){
      this.presentation.snap(this.simulation);this.presentationEpoch++;this.visualSample=undefined;
      this.presentationCutTick=tick;
      sample=this.presentation.sample(1,this.presentationEpoch,tick,tick);
    }
    let restoreBody:(()=>void)|undefined;
    const restore=()=>{
      restoreBody?.();
      for(const [id,object] of this.objects){
        const logical=this.logicalPose(id)!;
        object.position.copy(logical.position);
        object.quaternion.copy(logical.rotation);
      }
      this.options.character.animation?.applyPresentationPose(1);
      this.sampleHorses(this.presentation.sample(1,this.presentationEpoch,tick,tick));
      this.alignHorseRider();this.sampleSkiEquipment();
      for(const object of this.objects.values())object.updateWorldMatrix(true,true);
    };
    try {
      restoreBody=this.options.character.animation?.presentFirstPerson(view==='world'&&!this.authored&&this.followCamera.mode===1);
      sample.vehicles.forEach((pose,index)=>{
        const object=this.options.vehicles[index]!.object;
        object.position.copy(pose.position);object.quaternion.copy(pose.rotation);
      });
      this.sampleHorses(sample);
      const character=this.options.character.object;
      character.position.copy(sample.player.position);character.quaternion.copy(sample.player.rotation);
      this.options.character.animation?.applyPresentationPose(sample.alpha);
      const last=this.visualSample;
      if(!last||last.epoch!==sample.epoch||last.previousTick!==sample.previousTick||last.currentTick!==sample.currentTick||last.alpha!==sample.alpha){
        const elapsed=last&&last.epoch===sample.epoch?sample.timeSeconds-last.timeSeconds:0;
        for(const update of this.visualUpdates)update(elapsed,sample);
        this.visualSample=sample;
      }
      // Rider placement follows visual callbacks and uses the same vehicle sample.
      const index=this.simulation.active;
      if(index>=0){
        const vehicle=sample.vehicles[index]!,seat=this.simulation.vehicles[index]!.spec.seat;
        character.position.copy(vehicle.position).add(new THREE.Vector3(...seat).applyQuaternion(vehicle.rotation));
        character.quaternion.copy(vehicle.rotation);
      }
      for(const object of this.objects.values())object.updateWorldMatrix(true,true);
      this.alignHorseRider();this.sampleSkiEquipment();
      if(!this.authored&&this.followCamera.initialized)this.followCamera.present(index>=0?sample.vehicles[index]!:sample.player,sample.alpha);
      return restore;
    } catch(error){restore();throw error;}
  }
  state(id:string):PhysicsEntityState|undefined{
    if(id===this.options.character.instanceId){const p=this.simulation.player,h=this.simulation.humanoid,contacts:string[]=[];if(h&&!this.simulation.vehicle)for(let i=0;i<h.controller.numComputedCollisions();i++){const collision=h.controller.computedCollision(i);if(collision?.collider)contacts.push(this.environment.colliderId(collision.collider.handle));}return {id,positionMetersXYZ:tuple(this.logicalPose(id)!.position),velocityMetersPerSecondXYZ:tuple(this.simulation.vehicle?.velocity??p.velocity),isGrounded:this.simulation.vehicle?.grounded??p.grounded,collisionEntityIds:[...new Set(contacts)]};}
    const v=this.simulation.vehicles.find(v=>v.spec.id===id);return v?{id,positionMetersXYZ:tuple(v.position),velocityMetersPerSecondXYZ:tuple(v.velocity),isGrounded:v.grounded,collisionEntityIds:[]}:undefined;
  }
  addCharacter(id:string,object:THREE.Object3D,_options?:CharacterOptions):void{
    if(!this.objects.has(id)||this.objects.get(id)!==object)throw Object.assign(new Error(`HUMANOID_CONTENT_REGISTER_IN_OPTIONS: ${id} cannot be registered as physical content after Humanoid creation.`),{
      code:'HUMANOID_CONTENT_REGISTER_IN_OPTIONS',category:'content',phase:'physics',entityIds:[id],path:'world.addEntity',
      actual:'physical entity registration after Humanoid creation',expected:'map, vehicles or characters in Humanoid creation options',
      suggestedAction:"Register map collision, vehicles and characters through createHumanoidWorld options. For a pure capture landmark whose collision already exists, use role:'decoration' and omit physics.",
    });
  }
  addRigid(id:string,object:THREE.Object3D,_options:RigidPhysics):void{this.addCharacter(id,object);}
  remove(_id:string):void{}
  validateBatch(candidates:readonly PhysicsCandidate[],removed:readonly string[]=[]):void{if(candidates.length||removed.length)throw new Error('HUMANOID_USE_RUNTIME_COMMANDS');}
  refresh(_id:string):void{throw new Error('HUMANOID_USE_RUNTIME_COMMANDS');}
  refreshMany(ids:readonly string[]):void{if(ids.length)throw new Error('HUMANOID_USE_RUNTIME_COMMANDS');}
  setEnabled(_id:string,_enabled:boolean):void{throw new Error('HUMANOID_USE_RUNTIME_COMMANDS');}
  teleport(id:string,position:Vec3):void{this.assertExternalMutation();if(id!==this.options.character.instanceId||!this.prepareCharacterOwned(position,this.simulation.player.yaw))throw new Error('HUMANOID_START_BLOCKED');}
  applyImpulse(_id:string,_impulse:Vec3):void{throw new Error('HUMANOID_IMPULSE_UNSUPPORTED');}
  step():void{throw new Error('HUMANOID_REQUIRES_ENGINE_INPUT');}
  characterSettings(_id:string):Required<CharacterOptions>{const c=this.simulation.characterControl;return {...DEFAULT_CHARACTER_OPTIONS,heightMeters:CENTER*2,radiusMeters:RADIUS,walkSpeedMetersPerSecond:3.1*c.speed/3.8,runSpeedMetersPerSecond:c.maxSpeed,jumpSpeedMetersPerSecond:c.jumpSpeed,maximumStepHeightMeters:.27};}
  probeCharacterStart(id:string,position:Vec3):EpisodeStartProbe{
    if(id!==this.options.character.instanceId)throw new Error('HUMANOID_CHARACTER_REQUIRED');
    const safe=this.environment.safeSpawn(new THREE.Vector3(...position),HUMANOID_BODY);const valid=!!safe&&safe.distanceTo(new THREE.Vector3(...position))<=.35;
    return {isValid:valid,requestedPositionWorldMetersXYZ:position,resolvedPositionWorldMetersXYZ:safe?tuple(safe):position,diagnostics:valid?[]:[{code:'HUMANOID_START_BLOCKED',message:'No safe character start within alignment tolerance.'}]};
  }
  castCameraArm(target:Vec3,eye:Vec3,radius:number){return this.environment.cameraProbe(target,eye,radius);}
  probe(origin:Vec3,direction:Vec3,distance:number){const result=this.environment.raycast(new THREE.Vector3(...origin),new THREE.Vector3(...direction),distance);return result?{entityId:result.id,distanceMeters:result.distance,normalWorldXYZ:tuple(result.normal)}:null;}
  audit():PhysicsAudit{return {engine:'rapier',entityCount:this.objects.size,colliderCount:this.environment.colliderCount,triangleCount:0,entities:[...this.objects.keys()].map(id=>({id,kind:id===this.options.character.instanceId?'character':'vehicle',colliderCount:this.simulation.vehicles.find(v=>v.spec.id===id)?.spec.mode==='carriage'?2:1,triangleCount:0})),diagnostics:[]};}
  private resetOwned():void{
    const profile=this.prepareProfile(this.baselineProfile);validateEnvironment(this.currentMap);
    const replacement=new EnvironmentQueries(this.instanceMap(this.currentMap)),previous=this.environment;
    let staged:Simulation;try{staged=this.simulation.prepareEnvironment(replacement);this.configureSimulation(staged,profile);}catch(error){replacement.dispose();throw error;}
    this.simulation.adoptEnvironment(staged);this.environment=replacement;this.followCamera.environment=replacement;this.commitProfile(profile);previous.dispose();this.clearInputOwned();
    for(const notify of this.simulationReplacements)notify();
    this.authored=this.baselineAuthored;this.camera.copy(this.initialCamera,false);
    if(!this.authored)this.camera.fov=this.followCamera.tuning.baseFovDegrees;
    this.camera.updateProjectionMatrix();this.restoreDefaultCameraMode();this.sync(0);
  }
  dispose():void{if(this.disposed)return;this.clearInputOwned();this.episodeOwned=false;this.disposed=true;this.followCamera.dispose();this.visualUpdates.clear();this.simulationReplacements.clear();this.simulation.dispose();this.environment.dispose();this.options.character.animation?.dispose();for(const vehicle of this.options.vehicles){disposeSubmersibleVisual(vehicle.object);disposeJetSkiVisual(vehicle.object);vehicle.visual?.dispose();}}
}
