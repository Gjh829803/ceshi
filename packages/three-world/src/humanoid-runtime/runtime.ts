import {setSpaceDriveMode,requestSpaceDock,spaceTelemetry} from './motion-families/space/commands';
import type {SpaceDriveMode} from './motion-families/space/config';
import {copyFlyingCreatureState} from './motion-families/flying-creature/state';
import {ActorResources} from '../actor-resources';
import { readCameraWorldPose } from '../camera-observation';
import {
DEFAULT_HUMANOID_VIEW,
HUMANOID_VIEW_SCHEMA_PROPERTIES,
type HumanoidViewSettings,
} from '../config/camera';
import { ThreePhysics } from '../physics';
import { physicsHost } from '../physics-host';
import { isHumanoidActorCommand,validateActorBinding } from './character-binding';
import { claimCharacter } from './character-ownership';
import type { ActorInput } from './humanoid/actor';
import { resolveConfiguredFlyingCreatureFeel } from './motion-families/flying-creature/state';
import type { FlyingCreatureVisual } from './motion-families/flying-creature/visual';
import { vehicleDriveTelemetry,type VehicleDriveTelemetry } from './vehicle-dynamics';

import {
controlFields,
controlSchemaForFamily,
} from '../config/control-fields';

import {
HUMANOID_INPUT_GUIDES,
VEHICLE_APPROACH_DESCRIPTION,
type HumanoidInputGuide,
} from './input-guidance';

import { submersibleDiagnostics } from './motion-families/underwater/submersible';

import {
disposeSubmersibleVisual,
sampleSubmersibleVisual,
} from './submersible-visual';

import {
sampleRaftVisual,
type RaftState,
} from './motion-families/surface-vessel/raft';

import { jetSkiDiagnostics } from './motion-families/surface-vessel/jetski';

import {
disposeJetSkiVisual,
sampleJetSkiVisual,
} from './jetski-visual';

import { sampleKayakVisual } from './kayak-visual';
import { paddleRiderBody,type KayakState } from './motion-families/surface-vessel/paddling';

import {
copyUnicycleState,
refreshUnicycleSupport,
sampleUnicycleVisual,
UNICYCLE_TIMING,
type UnicycleState,
} from './motion-families/ground-vehicle/unicycle';

import {
copyAtvState,
sampleAtvVisual,
type AtvState,
} from './motion-families/ground-vehicle/atv';

import * as THREE from 'three';
import type { CameraRigInput } from '../camera';
import type { CameraTuning } from '../config/camera';
import { CAMERA_DISTANCE_METERS_SCHEMA,CAMERA_SCHEMA_PROPERTIES,DEFAULT_CAMERA_TUNING,parseCameraTuning,VEHICLE_CAMERA_DISTANCE_SCHEMA } from '../config/camera';
import { CONTROL_RANGES,parseMovementSettings,readMovementSettings,type MovementSettings } from '../config/control';
import { DEFAULT_CHARACTER_OPTIONS } from '../config/physics';
import type { CharacterDrive,CharacterOptions,PhysicsAudit,PhysicsCandidate,PhysicsEntityState,PhysicsPort,RigidPhysics,Vec3,WorldInput } from '../engine-contracts';
import type { EpisodeCapabilities,EpisodeStart,EpisodeStartProbe } from '../episode-contracts';
import { FollowCamera,type CameraSubject } from './camera';
import { Character } from './character';
import { characterCapabilities,type CharacterCapabilityAvailability,type CharacterCapabilityState } from './character-capabilities';
import type { VehicleSpec } from './config';
import { canPlaceCreature,resetCreatureState } from './creatures/controller';
import { EnvironmentQueries,initEnvironmentQueries,vehicleBody } from './environment/queries';
import type { EnvironmentDefinition,MapSpawn } from './environment/types';
import type { HorseVisual,SeatAnchor } from './horse';
import { registerHumanoidHost } from './host-access';
import type { SkillRequest,SkillResult } from './humanoid/action-schema';
import { CENTER,HUMANOID_BODY,RADIUS } from './humanoid/controller';
import { readHumanoid } from './humanoid/render-state';
import { HUMANOID_ACTION_INPUT_FIELDS } from './input';
import { validateEnvironment } from './map-validation';
import type { TankState } from './motion-families/ground-vehicle/tank';
import { PresentationState,type HumanoidDisplaySample } from './presentation';
import { createVehicle,emptyInput,resolveVehicleSpec,Simulation,type Input } from './simulation';
import { sampleSkiEquipment } from './ski-visual';
import { sampleTankVisual } from './tank-visual';

export type HumanoidCommand =
 | {readonly type:'space.set-drive-mode';readonly actorId?:string;readonly mode:SpaceDriveMode}
 | {readonly type:'space.dock';readonly actorId?:string;readonly portId:string|null}
 | {readonly type:'vehicle.prepare';readonly actorId?:string;readonly instanceId:string;readonly spawn:MapSpawn}
 | {readonly type:'vehicle.approach'|'vehicle.enter';readonly actorId?:string;readonly instanceId:string}
 | {readonly type:'vehicle.exit';readonly actorId?:string}
 | {readonly type:'vehicle.recover';readonly actorId?:string}
 | {readonly type:'humanoid.set-camera-mode';readonly mode:0|1|2}
 | {readonly type:'humanoid.set-input';readonly actorId?:string;readonly input:Input|null}
 | {readonly type:'humanoid.apply-profile';readonly profile:HumanoidProfile}
 | {readonly type:'humanoid.perform-action';readonly actorId?:string;readonly request:SkillRequest};
const HUMANOID_COMMAND_TYPES:ReadonlySet<string>=new Set<HumanoidCommand['type']>([
 'space.set-drive-mode','space.dock','vehicle.prepare','vehicle.approach','vehicle.enter','vehicle.exit','vehicle.recover',
 'humanoid.set-camera-mode','humanoid.set-input','humanoid.apply-profile','humanoid.perform-action',
]);
export function isHumanoidCommand(command:{type:string}):command is HumanoidCommand{return HUMANOID_COMMAND_TYPES.has(command.type);}

export interface VehicleInstance {
  readonly instanceId:string;
  readonly assetId:string;
  readonly spec:VehicleSpec;
  readonly object:THREE.Object3D;
  readonly visual?:HorseVisual;
  readonly flyingVisual?:FlyingCreatureVisual;
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
    readonly camera:{readonly owner:'authored'|'follow';readonly mode:0|1|2;readonly settings:CameraTuning|null;readonly framing:HumanoidCameraFraming};
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
  readonly vehicles:readonly {readonly instanceId:string;readonly assetId:string;readonly mode:VehicleSpec['mode'];readonly available:boolean;readonly speedMetersPerSecond:number;readonly throttle:number;readonly steering:number;readonly grounded:boolean;readonly submerged:boolean;readonly spaceFlight?:NonNullable<ReturnType<typeof spaceTelemetry>>}[];
  readonly transition:{readonly kind:''|'enter'|'exit';readonly remainingSeconds:number};
  readonly traversal:{readonly kind:string;readonly phase:string;readonly progress:number;readonly elapsedSeconds:number;readonly durationSeconds:number;readonly sourceActionId:string}|null;
  readonly surface:{readonly mode:string;readonly surfaceId:string|null;readonly pose:{readonly actionId:string;readonly timeSeconds:number;readonly phase:string}|null};
  readonly interactionTargets:readonly {readonly id:string;readonly slotId:string;readonly generation:number;readonly claim:import('../contracts').InteractionClaimState|null;readonly kind:'pickup'|'seat';readonly state:string;readonly approachPositionWorldMetersXYZ:Vec3;readonly facingYawRadians:number;readonly eligible:boolean;readonly reason:string;readonly message:string;readonly positionWorldMetersXYZ:Vec3;readonly rotationWorldQuaternionXYZW:readonly [number,number,number,number]}[];
  readonly vehicleDynamics:readonly {readonly flyingCreature:Readonly<import("./motion-families/flying-creature/state").FlyingCreatureStateV1>|null;readonly drive:VehicleDriveTelemetry|null;readonly physicsOwner:'rigid-body'|'controller';readonly unicycle:Readonly<UnicycleState>|null;readonly submersible:Readonly<ReturnType<typeof submersibleDiagnostics>>|null;readonly raft:Readonly<RaftState>|null;readonly jetski:Readonly<ReturnType<typeof jetSkiDiagnostics>>|null;readonly kayak:Readonly<KayakState>|null;readonly atv:Readonly<AtvState>|null;readonly tank:Readonly<TankState>|null;readonly instanceId:string;readonly launched:boolean;readonly pitchRadians:number;readonly rollRadians:number;readonly creature:{readonly gait:string;readonly phase:number;readonly flying:boolean;readonly leadPositionWorldMetersXYZ:Vec3|null;readonly leadYawRadians:number|null}|null}[];
}
const tuple=(v:THREE.Vector3):Vec3=>[v.x,v.y,v.z];

/** SDK-owned actor solver. The engine supplies every fixed tick and owns rendering. */
export class HumanoidRuntime implements PhysicsPort {
  environment:EnvironmentQueries;
  private currentSimulation:Simulation;
  get simulation():Simulation{return this.currentSimulation;}
  private replacementPending=false;
  readonly followCamera:FollowCamera;
  private readonly actors=new Map<string,{object:THREE.Object3D;animation?:Character;spawn?:'map';movement:CharacterOptions;initialPosition:THREE.Vector3;initialYaw:number}>();
  private cameraActor:string|undefined;
  get inputActorId():string{const id=this.simulation.controlledActorId;if(id===undefined)throw new Error('HUMANOID_INPUT_ACTOR_REQUIRED');return id;}
  get cameraTargetId():string|undefined{return this.cameraActor;}
  private get cameraSubject():CameraSubject{if(this.cameraTargetId===undefined)throw new Error('HUMANOID_CAMERA_TARGET_REQUIRED');return this.simulation.actor(this.cameraTargetId);}
  private actorAnimation(id:string|undefined){return id===undefined?undefined:this.actors.get(id)?.animation;}
  private setControlledActorOwned(id:string|undefined):void{if(id!==undefined)this.actorController(id);this.simulation.controlledActorId=id;this.previousJump=false;this.previousInteract=false;}
  setCameraTarget(id:string):void{this.assertExternalMutation();this.actorController(id);this.actorAnimation(this.cameraTargetId)?.setFirstPerson(false);this.cameraActor=id;this.setCameraModeOwned(this.followCamera.mode as 0|1|2);}
  private readonly actorInputs=new Map<string,{input:Input;source:'humanoid.set-input'|'setInput'}>();
  private readonly actorLastInputs=new Map<string,HumanoidInputObservation['lastApplied']>();
  private readonly objects=new Map<string,THREE.Object3D>();
  private readonly specs:VehicleSpec[];
  private disposed=false;
  private lifecycleGeneration=0;
  private episodeOwned=false;
  private readonly presentation:PresentationState;
  private presentationEpoch=0;
  private presentationCutTick:number|undefined;
  private visualSample:HumanoidDisplaySample|undefined;
  private authored=false;
  private baselineAuthored=false;
  private baselineCameraActor:string|undefined;
  private previousJump=false;
  private previousInteract=false;
  private baselineProfile:HumanoidProfile={};
  private profile:HumanoidProfile & {view:HumanoidViewSettings}={view:{...DEFAULT_HUMANOID_VIEW}};
  private readonly initialCamera:THREE.PerspectiveCamera;
  private currentMap:EnvironmentDefinition;
  private readonly visualUpdates=new Set<(deltaSeconds:number,sample:HumanoidDisplaySample)=>void>();
  private mapValidator:((map:EnvironmentDefinition)=>void)|undefined;
  private readonly simulationReplacements=new Set<(reason:'map'|'reset')=>void>();
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
    const release=options.character.animation?claimCharacter(options.character.animation):()=>{};
    try{await initEnvironmentQueries();return new HumanoidRuntime(options,camera,release);}catch(error){release();throw error;}
  }
  private readonly characterFactory:(()=>Promise<Character>)|undefined;
  private ordinaryPhysics:ThreePhysics;
  private readonly executionResources=new ActorResources();
  private releaseOrdinarySubstep:()=>void;
  private constructor(readonly options:HumanoidRuntimeOptions,readonly camera:THREE.PerspectiveCamera,private releaseCharacterOwnership:(()=>void)|undefined){
    this.characterFactory=options.character.animation?.createFactory();
    this.currentMap=options.map;
    this.specs=options.vehicles.map(v=>({...structuredClone(v.spec),id:v.instanceId}));
    this.environment=new EnvironmentQueries(this.instanceMap(options.map),this.executionResources);
    this.ordinaryPhysics=ThreePhysics.borrow(this.environment.borrowPhysics());
    this.releaseOrdinarySubstep=this.environment.beforePhysicsSubstep(f=>physicsHost(this.ordinaryPhysics).prepareSubstep(f));
    this.currentSimulation=new Simulation(this.environment,this.specs);
    this.cameraActor=options.character.instanceId;
    this.followCamera=new FollowCamera(camera,this.environment,options.vehicles);
    this.followCamera.eyePosition=target=>this.actorAnimation(this.cameraTargetId)?.eyePosition(target)??false;
    this.followCamera.configureTuning(options.cameraTuning??{});this.initialCamera=new THREE.PerspectiveCamera().copy(camera,false);
    this.profile={view:{...DEFAULT_HUMANOID_VIEW},character:{...this.simulation.characterControl},camera:{...options.cameraTuning},vehicles:Object.fromEntries(this.simulation.vehicles.map(v=>[v.spec.id,{...readMovementSettings(v.spec),camera:v.spec.camera}]))};
    this.commitProfile(this.prepareProfile({}));
    for(const v of options.vehicles)this.objects.set(v.instanceId,v.object);
    this.presentation=new PresentationState(this.simulation);
    registerHumanoidHost(this, {
      resources:this.executionResources,
      setMapValidator:validate=>{this.mapValidator=validate;},
      interactionBody:id=>physicsHost(this.ordinaryPhysics).interactionBody(id),
      claimCharacter:(id,character)=>id===this.options.character.instanceId&&character===this.options.character.animation&&this.releaseCharacterOwnership?this.releaseCharacterOwnership:claimCharacter(character),
      commitCharacterOwnership:id=>{if(id===this.options.character.instanceId)this.releaseCharacterOwnership=undefined;},
      bindCharacter:(id,character,settings,prevalidated)=>this.bindCharacter(id,character,settings,prevalidated),
      isDisposed: () => this.disposed,
      command: command => { this.assertLive(); return this.commandOwned(command); },
      setEpisodeOwned: owned => { this.assertLive(); this.episodeOwned=owned; },
      advance: (input,dt,pointer,drives,yaw) => { this.assertLive(); this.advanceOwned(input,dt,pointer,drives,yaw); },
      reset: () => { this.assertLive(); this.resetOwned(); },
      finishReset:()=>{this.assertLive();this.finishResetOwned();},
      setControlledActor:id=>{this.assertLive();this.setControlledActorOwned(id);},
      clearInput: () => { this.assertLive(); this.clearInputOwned(); },
      teleportCharacter:(id,position)=>{this.assertLive();this.ordinaryPhysics.teleport(id,position);},
      prepareEpisodeStart: start => { this.assertLive(); this.prepareEpisodeStartOwned(start); },
      present: (alpha,tick,view) => { this.assertLive(); return this.present(alpha,tick,view); },
    });
    options.character.object.position.copy(this.environment.safeSpawn(new THREE.Vector3(...options.map.playerSpawn),HUMANOID_BODY)??new THREE.Vector3(...options.map.playerSpawn));
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
    const fields:Record<HumanoidCommand['type'],readonly string[]>={'space.set-drive-mode':['actorId','mode'],'space.dock':['actorId','portId'],'vehicle.prepare':['instanceId','spawn','actorId'],'vehicle.approach':['instanceId','actorId'],'vehicle.enter':['instanceId','actorId'],'vehicle.exit':['actorId'],'vehicle.recover':['actorId'],'humanoid.set-camera-mode':['mode'],'humanoid.set-input':['input','actorId'],'humanoid.apply-profile':['profile'],'humanoid.perform-action':['request','actorId']};
    if(!Object.hasOwn(fields,command.type)||Object.keys(command).some(k=>k!=='type'&&!fields[command.type].includes(k)))throw new Error('HUMANOID_COMMAND_INVALID');
    const actorId=()=>('actorId' in command?command.actorId:undefined)??this.inputActorId;
    let accepted=true;
    switch(command.type){
      case 'space.set-drive-mode':setSpaceDriveMode(this.simulation.actor(actorId()).vehicle,command.mode);break;
      case 'space.dock':requestSpaceDock(this.simulation.actor(actorId()).vehicle,command.portId);break;
      case 'vehicle.prepare':if(!command.spawn||!Array.isArray(command.spawn.position)||command.spawn.position.length!==3||command.spawn.position.some(n=>!Number.isFinite(n))||!Number.isFinite(command.spawn.yaw))throw new Error('HUMANOID_SPAWN_INVALID');accepted=this.prepareOwned(command.instanceId,command.spawn,actorId());break;
      case 'vehicle.approach':accepted=this.approachOwned(command.instanceId,actorId());break;
      case 'vehicle.enter':accepted=this.enterOwned(command.instanceId,actorId());break;
      case 'vehicle.exit':accepted=this.exitOwned(actorId());break;
      case 'vehicle.recover':accepted=this.recoverVehicleOwned(actorId());break;
      case 'humanoid.set-camera-mode':this.setCameraModeOwned(command.mode);break;
      case 'humanoid.set-input':this.setActorInputOwned(command.actorId??this.inputActorId,command.input??undefined,'humanoid.set-input');break;
      case 'humanoid.apply-profile':this.applyProfileOwned(command.profile);break;
      case 'humanoid.perform-action': {
        // A command must obey the same restriction as per-tick humanoid input.
        // Reject before request() so no action or request identity gets queued.
        const actorId=command.actorId??this.inputActorId;
        const restriction=this.characterRestriction(actorId);
        if(restriction)throw new Error(`${restriction.code}: ${restriction.message}`);
        const result = this.actorController(actorId).skills.request(command.request);
        if (!result) throw new Error('HUMANOID_CHARACTER_UNAVAILABLE');
        return result;
      }
    }
    if (!accepted) {
      const interaction = command.type === 'vehicle.enter' || command.type === 'vehicle.exit';
      const code = interaction ? this.simulation.actor(actorId()).failureCode ?? 'HUMANOID_COMMAND_BLOCKED' : 'HUMANOID_COMMAND_BLOCKED';
      throw new Error(`${code}: ${this.simulation.actor(actorId()).message}`);
    }
  }
  inputGuide(actorId:string=this.inputActorId):HumanoidInputGuide{
    const vehicle=this.simulation.actor(actorId).vehicle;
    const family=vehicle?.spec.mode??'character';
    return {family,fields:vehicle?.motion.flyingCreature?{forward:'Positive dives, negative climbs; neutral WASD decelerates to hover.',steer:'Positive turns right about -Y and banks right.',boost:'Flapping boost consumes stamina.',slow:'Brake to zero; release keeps hovering.',brake:'Grounded: take off when overhead is clear. Airborne: glide with sink and inertia.',primary:'Hold flame; does not enable cruise.',secondary:'Evade on the rising edge; consumes stamina.'}:{...HUMANOID_INPUT_GUIDES[family]}};
  }
  commandDescriptors(id:string):import('../contracts').CommandDescriptor[]{
    const vec={type:'array',items:{type:'number'},minItems:3,maxItems:3};
    const object=(properties:Record<string,import('../contracts').JsonValue>,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
    const create=(type:HumanoidCommand['type'],properties:Record<string,import('../contracts').JsonValue>,optional:readonly string[]=[]):import('../contracts').CommandDescriptor=>({type,isAvailable:true,schema:{...object({type:{const:type},...properties},['type',...Object.keys(properties).filter(key=>!optional.includes(key))]),...(type==='vehicle.approach'?{description:VEHICLE_APPROACH_DESCRIPTION}:{})}});
    if(!this.hasActor(id))return this.options.vehicles.some(vehicle=>vehicle.instanceId===id)?[create('vehicle.prepare',{instanceId:{const:id},actorId:{type:'string'},spawn:object({id:{type:'string'},name:{type:'string'},position:vec,yaw:{type:'number'},regionId:{type:'string'},vehicleId:{type:'string'}},['id','name','position','yaw','regionId'])},['actorId']),create('vehicle.approach',{instanceId:{const:id},actorId:{type:'string'}},['actorId']),create('vehicle.enter',{instanceId:{const:id},actorId:{type:'string'}},['actorId'])]:[];
    const guide=this.inputGuide(id);
    const meaning=(key:string)=>guide.fields[key as keyof Input]??'Ignored for this control family; leave neutral.';
    const input=object(Object.fromEntries([...['forward','steer','lift','roll','pitch','strafe'].map(k=>[k,{type:'number',minimum:-1,maximum:1,description:meaning(k)}]),...['boost','brake','jump','slow','primary','secondary'].map(k=>[k,{type:'boolean',description:meaning(k)}]),['actions',object(Object.fromEntries(HUMANOID_ACTION_INPUT_FIELDS.map(key=>[key,{type:'boolean'}])),[])]]) as Record<string,import('../contracts').JsonValue>,['forward','steer','lift','roll','pitch','strafe','boost','brake','jump','slow']);
    const profile=object({view:object(HUMANOID_VIEW_SCHEMA_PROPERTIES,[]),character:object(controlSchemaForFamily('character'),[]),vehicles:object(Object.fromEntries(this.simulation.vehicles.map(vehicle=>[vehicle.spec.id,object({...controlSchemaForFamily(vehicle.motion.flyingCreature?'flying-creature':vehicle.spec.mode,!!(vehicle.motion.wheelPhysics||vehicle.motion.body?.powertrain)),camera:VEHICLE_CAMERA_DISTANCE_SCHEMA},[])])),[]),cameraDistanceMeters:{anyOf:[CAMERA_DISTANCE_METERS_SCHEMA,{type:'null'}]},camera:object(CAMERA_SCHEMA_PROPERTIES,[])},[]);
    const vehicle=this.simulation.actor(id).vehicle;
    return [...(vehicle?.motion.family==='space'?[create('space.set-drive-mode',{actorId:{const:id},mode:{enum:['assisted','inertial']}}),create('space.dock',{actorId:{const:id},portId:{enum:[null,...(vehicle.spec.spaceFlight!.dockingPorts?.map(p=>p.id)??[])]}})]:[]),...[create('vehicle.exit',{actorId:{const:id}}),create('vehicle.recover',{actorId:{const:id}})],create('humanoid.set-camera-mode',{mode:{enum:[0,1,2]}}),create('humanoid.set-input',{actorId:{const:id},input:{anyOf:[input,{type:'null'}]}}),create('humanoid.apply-profile',{profile}),create('humanoid.perform-action',{actorId:{const:id},request:object({requestId:{type:'string'},action:{enum:['roll','slide','pickup','putDown','sit','standUp']},targetId:{type:'string'},slotId:{type:'string'}},['requestId','action'])})];
  }
  snapshot(actorId:string=this.inputActorId):HumanoidSnapshot{
    const s=this.simulation,actor=s.actor(actorId),h=actor.controller,tr=h?.traversal,surface=h?.surface;
    const targets=h.skills.listTargets();
    const waterControllerActive=Boolean(h&&!actor.vehicle&&!tr),contact=waterControllerActive?h?.water:null;
    return {
      view:{...this.profile.view},
      controls:{character:readMovementSettings(s.characterControl),vehicles:Object.fromEntries(s.vehicles.map(v=>[v.spec.id,readMovementSettings(v.spec)]))},
      mapId:this.currentMap.id,timeSeconds:s.time,cameraMode:this.followCamera.mode as 0|1|2,mountedInstanceId:actor.vehicle?.spec.id??null,message:actor.message,
      water:{declaredVolumeCount:this.currentMap.water.length,controllerActive:waterControllerActive,swimming:waterControllerActive&&Boolean(h?.swimming),
        contact:contact?{volumeId:contact.volumeId,surfaceHeightMeters:contact.surfaceY,depthMeters:contact.depth,submersionRatio:contact.submersion,
          feetBelowSurfaceMeters:contact.feetBelowSurfaceMeters,requiredDepthMeters:contact.requiredDepthMeters,requiredFeetBelowSurfaceMeters:contact.requiredFeetBelowSurfaceMeters,
          depthCheckPassed:contact.depthCheckPassed,immersionCheckPassed:contact.immersionCheckPassed,wasSwimmingAtSample:contact.wasSwimmingAtSample,
          entrySpeedMetersPerSecond:contact.entrySpeed,entrySerial:contact.entrySerial}:null},
      characterCapabilities:this.characterCapabilities(actorId).map(({id,eligible,reason,message,targetId,slotId})=>({id,eligible,reason,message,...(targetId?{targetId}:{}),...(slotId?{slotId}:{})})),
      character:{swimStyle:h?.swimStyle??'breaststroke',instanceId:actorId,state:h?.state??actor.player.animation,swimming:!actor.vehicle&&actor.player.swimming,stance:h?.stance??'stand',carrying:h?.skills.carrying??null,seated:h?.skills.seated??null,activeAction:h?.skills.active?{requestId:h.skills.active.requestId,action:h.skills.active.id,phase:h.skills.active.phase,elapsedSeconds:h.skills.active.elapsed}:null},
      vehicles:s.vehicles.map((v,i)=>({instanceId:v.spec.id,assetId:this.options.vehicles[i]!.assetId,mode:v.spec.mode,available:s.available(v),speedMetersPerSecond:v.velocity.length(),throttle:v.throttle,steering:v.steering,grounded:v.grounded,submerged:v.submerged,...(v.motion.family==='space'?{spaceFlight:spaceTelemetry(v)!}:{})})),
      transition:{kind:actor.transitionKind,remainingSeconds:actor.transition},
      traversal:tr?{kind:tr.probe.kind,phase:tr.phase,progress:tr.progress,elapsedSeconds:tr.elapsed,durationSeconds:tr.duration,sourceActionId:tr.motion.sourceId}:null,
      surface:{mode:surface?.mode??'none',surfaceId:surface?.surface?.id??null,pose:surface?.pose?{actionId:surface.pose.key,timeSeconds:surface.pose.time,phase:surface.pose.phase??''}:null},
      interactionTargets:targets.map(t=>({id:t.entityId,slotId:t.slotId,generation:t.generation,claim:t.claim,kind:t.kind,state:t.state,approachPositionWorldMetersXYZ:t.approach,facingYawRadians:t.yaw,eligible:t.eligible,reason:t.reason,message:t.message,positionWorldMetersXYZ:t.position as Vec3,rotationWorldQuaternionXYZW:t.rotation as [number,number,number,number]})),
      vehicleDynamics:s.vehicles.map(v=>({flyingCreature:v.motion.flyingCreature?copyFlyingCreatureState(v.motion.flyingCreature):null,drive:vehicleDriveTelemetry(v),physicsOwner:v.motion.wheelPhysics||v.motion.body||v.motion.aircraft?'rigid-body':'controller',unicycle:copyUnicycleState(v.motion.unicycle)??null,submersible:v.motion.submersible?submersibleDiagnostics(v.motion.submersible):null,raft:v.motion.raft?{...v.motion.raft}:null,jetski:v.motion.jetski?jetSkiDiagnostics(v.motion.jetski):null,kayak:v.motion.kayak?{...v.motion.kayak}:null,atv:copyAtvState(v.motion.atv)??null,tank:v.motion.tank?{...v.motion.tank}:null,instanceId:v.spec.id,launched:v.launched,pitchRadians:v.pitch,rollRadians:v.roll,creature:v.motion.creature?{gait:v.motion.creature.gait,phase:v.motion.creature.phase,flying:v.motion.creature.flying,leadPositionWorldMetersXYZ:v.motion.creature.leadPosition?tuple(v.motion.creature.leadPosition):null,leadYawRadians:v.motion.creature.leadYaw??null}:null})),
    };
  }
  private characterRestriction(actorId:string=this.inputActorId):{code:string;message:string}|undefined{
    if(this.simulation.actor(actorId).transition>0)return {code:'HUMANOID_TRANSITION_ACTIVE',message:'骑乘切换尚未完成'};
    if(this.simulation.actor(actorId).vehicle?.spec.mode==='mount')return {code:'HUMANOID_ALREADY_MOUNTED',message:'人物已经骑乘'};
    return;
  }
  characterCapabilities(actorId:string=this.inputActorId):CharacterCapabilityState[]{const restriction=this.characterRestriction(actorId);return characterCapabilities(this.actorController(actorId)).map(card=>restriction?{...card,eligible:false,reason:restriction.code,message:restriction.message}:card);}
  actionIds(id:string):readonly string[]{return [...this.actorAnimation(id)?.availableHumanoidClips??[]];}
  animationState(id:string):import('../contracts').EntityState['animation']{const source=this.actorAnimation(id)?.sourceCharacter;if(!source)return;const key=Object.keys(source.weights).sort((a,b)=>(source.weights[b]??0)-(source.weights[a]??0))[0];if(!key||!source.actions[key])return;const action=source.actions[key];return {actionId:key,clipName:action.getClip().name,timeSeconds:action.time};}
  cameraSnapshot():import('../contracts').CameraState{
    const c=this.followCamera,{position,rotation:q}=readCameraWorldPose(this.camera);
    const actual={mode:this.cameraMode,positionWorldMetersXYZ:tuple(position),orientationWorldQuaternionXYZW:[q.x,q.y,q.z,q.w] as const};
    if(this.authored)return {...actual,desiredPositionWorldMetersXYZ:null,desiredYawRadians:null,desiredPitchRadians:null};
    return {...actual,desiredPositionWorldMetersXYZ:tuple(c.desiredPosition),desiredYawRadians:c.yaw,desiredPitchRadians:c.pitch,desiredArmDistanceMeters:c.desiredPosition.distanceTo(c.target),actualArmDistanceMeters:c.presentationTarget.distanceTo(position),collisionPhase:c.collisionLimited?'constrained':'clear'};
  }
  useAuthoredCamera():void{this.assertExternalMutation();this.authored=true;this.actorAnimation(this.cameraTargetId)?.setFirstPerson(false);}
  private setCameraModeOwned(mode:0|1|2):void{if(![0,1,2].includes(mode))throw new Error('HUMANOID_CAMERA_MODE_INVALID');const subject=this.cameraSubject;this.authored=false;this.followCamera.mode=mode;this.followCamera.reset(subject);this.actorAnimation(this.cameraTargetId)?.setFirstPerson(mode===1);this.followCamera.update(subject,0);this.followCamera.capturePresentationPose(subject,true);}
  validateInput(input:Input):void{
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('HUMANOID_INPUT_INVALID');
    for(const key of ['forward','steer','lift','roll','pitch','strafe'] as const)if(typeof input[key]!=='number'||!Number.isFinite(input[key])||Math.abs(input[key])>1)throw new Error('HUMANOID_INPUT_INVALID');
    for(const key of ['primary','secondary'] as const)if(input[key]!==undefined&&typeof input[key]!=='boolean')throw new Error('HUMANOID_INPUT_INVALID');
    for(const key of ['boost','brake','jump','slow'] as const)if(typeof input[key]!=='boolean')throw new Error('HUMANOID_INPUT_INVALID');
    if(Object.keys(input).some(key=>!['forward','steer','lift','roll','pitch','strafe','boost','brake','jump','slow','primary','secondary','actions'].includes(key)))throw new Error('HUMANOID_INPUT_INVALID');
    if(input.actions!==undefined&&(!input.actions||typeof input.actions!=='object'||Array.isArray(input.actions)||Object.entries(input.actions).some(([key,value])=>!(HUMANOID_ACTION_INPUT_FIELDS as readonly string[]).includes(key)||typeof value!=='boolean')))throw new Error('HUMANOID_INPUT_INVALID');
  }
  setInput(input:Input):()=>void;
  setInput(input:undefined):void;
  setInput(input:Input|undefined):(()=>void)|void;
  setInput(input:Input|undefined):(()=>void)|void{this.assertExternalMutation();return this.setActorInputOwned(this.inputActorId,input);}
  inspectBoarding(instanceId:string,actorId:string=this.inputActorId):BoardingObservation {
    this.assertLive();this.index(instanceId);return this.simulation.actor(actorId).inspectBoarding(instanceId);
  }
  inspectControls(actorId:string=this.inputActorId):HumanoidInputObservation{
    this.actorController(actorId);const override=this.actorInputs.get(actorId);
    return structuredClone({override:override?{source:override.source,input:override.input}:null,lastApplied:this.actorLastInputs.get(actorId)??null});
  }
  private setActorInputOwned(id:string,input:Input|undefined,source:'humanoid.set-input'|'setInput'='setInput'):(()=>void)|void{
    if(input!==undefined&&this.executionResources.inspect(id).some(claim=>claim.owner.kind==='navigation'))throw new Error('ACTOR_RESOURCE_BUSY: Stop navigation before installing explicit actor input.');
    this.actorController(id);this.actorLastInputs.delete(id);if(input===undefined){this.actorInputs.delete(id);return;}
    this.validateInput(input);const entry={input:structuredClone(input),source};this.actorInputs.set(id,entry);
    return()=>{if(this.disposed||this.actorInputs.get(id)!==entry)return;this.assertExternalMutation();this.actorInputs.delete(id);this.actorLastInputs.delete(id);};
  }
  private clearInputOwned():void{this.actorInputs.clear();this.actorLastInputs.clear();this.previousJump=false;this.previousInteract=false;}
  private index(id:string):number{const n=this.options.vehicles.findIndex(v=>v.instanceId===id);if(n<0)throw new Error(`HUMANOID_INSTANCE_UNKNOWN: ${id}`);return n;}
  prepare(id:string,spawn:MapSpawn):boolean{this.assertExternalMutation();return this.prepareOwned(id,spawn);}
  private prepareOwned(id:string,spawn:MapSpawn,actorId:string=this.inputActorId):boolean{const ok=this.simulation.actor(actorId).prepare(this.index(id),spawn);this.sync(0);return ok;}
  private approachOwned(id:string,actorId:string=this.inputActorId):boolean{this.index(id);const ok=this.simulation.actor(actorId).approach(id);this.sync(0);return ok;}
  recoverVehicle():boolean{this.assertExternalMutation();return this.recoverVehicleOwned();}
  private recoverVehicleOwned(actorId:string=this.inputActorId):boolean{const ok=this.simulation.actor(actorId).recoverVehicle();if(ok){this.setActorInputOwned(actorId,undefined);this.presentation.snap(this.simulation);if(this.cameraTargetId===actorId)this.followCamera.reset(this.cameraSubject);this.sync(0);}return ok;}
  interact():boolean{this.assertExternalMutation();const ok=this.simulation.controlledActor.interact();if(ok)this.sync(0);return ok;}
  summonDragon(id?:string,actorId:string=this.inputActorId):boolean{this.assertExternalMutation();return this.simulation.summonDragon(id,actorId);}
  enter(id:string):boolean{this.assertExternalMutation();return this.enterOwned(id);}
  private enterOwned(id:string,actorId:string=this.inputActorId):boolean{const ok=this.simulation.actor(actorId).enter(id);if(ok)this.sync(0);return ok;}
  exit():boolean{this.assertExternalMutation();return this.exitOwned();}
  private exitOwned(actorId:string=this.inputActorId):boolean{const ok=this.simulation.actor(actorId).exit();if(ok)this.sync(0);return ok;}
  private prepareCharacterOwned(position:Vec3,yaw=0,actorId:string=this.inputActorId):boolean{
    const actor=this.simulation.actor(actorId),ok=actor.prepareCharacter(new THREE.Vector3(...position),yaw);
    if(ok){this.actorInputs.delete(actorId);this.actorLastInputs.delete(actorId);this.sync(0);}return ok;
  }
  private defaultCameraMode():0|1{return this.profile.view.defaultPerspective==='first-person'?1:0;}
  private restoreDefaultCameraMode():void{
    if(this.authored){this.followCamera.mode=this.defaultCameraMode();}
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
    for(const v of this.simulation.vehicles)if(v.motion.flyingCreature)resolveConfiguredFlyingCreatureFeel({...v.spec,...vehicles[v.spec.id]!});
    const numbers=[...Object.values(character),...Object.values(vehicles).flatMap(v=>Object.values(v))];
    if(numbers.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))throw new Error('HUMANOID_PROFILE_INVALID');
    const cameraDistanceMeters=profile.cameraDistanceMeters===undefined?this.followCamera.baseDistance??null:profile.cameraDistanceMeters;
    if(cameraDistanceMeters!==null&&(!Number.isFinite(cameraDistanceMeters)||cameraDistanceMeters<=CAMERA_DISTANCE_METERS_SCHEMA.exclusiveMinimum||cameraDistanceMeters>CAMERA_DISTANCE_METERS_SCHEMA.maximum))throw new Error('HUMANOID_PROFILE_INVALID');
    return {view,cameraDistanceMeters,character,camera,vehicles};
  }
  private configureSimulation(simulation:Simulation,profile:ReturnType<HumanoidRuntime['prepareProfile']>):void{
    simulation.characterControl={...profile.character};
    const c=simulation.characterControl;
    for(const [id,actor] of simulation.actors){actor.controller.movementTuning={speedScale:c.speed/3.8,accelerationScale:c.accel/12,airControlScale:c.grip/3,turnScale:c.steer/14,maxSpeed:c.maxSpeed,slowSpeed:c.slowSpeed,coastDeceleration:c.coastDeceleration,jumpSpeed:c.jumpSpeed};this.applyActorMovement(actor.controller,this.actors.get(id)?.movement??{});}
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
    if(profile.view?.defaultPerspective!==undefined&&!this.authored)this.setCameraModeOwned(this.defaultCameraMode());
  }
  /** Export the replayable profile; camera contains explicit overrides, not mode defaults. */
  exportProfile():HumanoidProfile{return structuredClone(this.profile);}
  inspectConfiguration():HumanoidConfiguration{
    const vehicle=this.simulation.controlledActor.vehicle,family=vehicle?.spec.mode??'character';
    const controls=vehicle?.spec??this.simulation.characterControl;
    return {profile:this.exportProfile(),effective:{
      subjectId:vehicle?.spec.id??this.inputActorId,family,
      control:Object.fromEntries(controlFields(family,!!(vehicle?.motion.wheelPhysics||vehicle?.motion.body?.powertrain)).filter(field=>!field.disabled).map(field=>[field.key,controls[field.key]])),
      camera:{owner:this.authored?'authored':'follow',mode:this.followCamera.mode as 0|1|2,settings:this.authored?null:this.followCamera.getEffectiveTuning(this.cameraSubject),framing:this.inspectCameraFraming()},
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
    const camera=this.followCamera.getEffectiveTuning(this.cameraSubject);
    const offset=sample.offsets.targetHeightOffset!==0||sample.offsets.horizontalOffset!==0;
    const offsetsPending=Math.abs(camera.targetHeightOffset-sample.offsets.targetHeightOffset)>1e-9||Math.abs(camera.horizontalOffset-sample.offsets.horizontalOffset)>1e-9;
    const edge=point===null||point[0]<.05||point[0]>.95||point[1]<.1||point[1]>.9;
    return {advisory:true,status:'observed',reason:offsetsPending?'framing-offsets-await-camera-update':null,sampleSimulationSeconds:sample.simulationSeconds,sampledOffsets:sample.offsets,offsetsPending,headSource:sample.source,headPositionWorldMetersXYZ:tuple(sample.position),headScreenPositionNormalizedXY:point,headInFrame,
      issues:this.followCamera.mode===2&&offset&&edge?[{code:'SHOULDER_FRAMING_OFFSET_REVIEW',message:'The head anchor projects near or outside the frame with additional profile.camera offsets. Compare a current-view capture with targetHeightOffset and horizontalOffset at 0; these are additions to the SDK posture anchor, not eye height. Orbit and collision may also affect framing. Projection alone does not prove pixel visibility.'}]:[]};
  }
  onVisualUpdate(callback:(deltaSeconds:number,sample:HumanoidDisplaySample)=>void):()=>void{this.assertLive();this.visualUpdates.add(callback);return()=>{this.visualUpdates.delete(callback);};}
  onSimulationReplaced(callback:(reason:'map'|'reset')=>void):()=>void{this.assertLive();this.simulationReplacements.add(callback);return()=>{this.simulationReplacements.delete(callback);};}
  switchMap(map:EnvironmentDefinition):void{this.assertExternalMutation();
    const profile=this.prepareProfile(this.profile);validateEnvironment(map);this.mapValidator?.(map);
    const replacement=new EnvironmentQueries(this.instanceMap(map),this.executionResources);
    const previous=this.environment;
    let staged:Simulation|undefined,ordinary:ThreePhysics|undefined;
    try{this.assertRigidIds(this.ordinaryPhysics.audit().entities.map(entity=>entity.id),replacement);ordinary=physicsHost(this.ordinaryPhysics).fork(replacement.borrowPhysics());staged=new Simulation(replacement,this.simulation.vehicles.map(v=>structuredClone(v.spec)));this.configureSimulation(staged,profile);this.restoreActors(staged,profile);}
    catch(error){staged?.dispose();ordinary?.dispose();replacement.dispose();throw error;}
    this.releaseOrdinarySubstep();this.ordinaryPhysics.dispose();this.ordinaryPhysics=ordinary;
    this.releaseOrdinarySubstep=replacement.beforePhysicsSubstep(f=>physicsHost(this.ordinaryPhysics).prepareSubstep(f));
    this.lifecycleGeneration++;this.simulation.dispose();this.currentSimulation=staged!;this.currentMap=map;this.environment=replacement;this.followCamera.environment=replacement;this.commitProfile(profile);previous.dispose();
    for(const notify of this.simulationReplacements)notify('map');
    this.clearInputOwned();this.restoreDefaultCameraMode();this.sync(0);
  }
  sealInitialState():void{
    this.assertExternalMutation();this.baselineProfile=this.exportProfile();
    // Engine seals after scene setup, before the first start/step/reset.
    this.baselineAuthored=this.authored;this.baselineCameraActor=this.cameraTargetId;this.initialCamera.copy(this.camera,false);
  }
  episodeCapabilities():NonNullable<EpisodeCapabilities['humanoid']>{return {mapId:this.currentMap.id,characterInstanceId:this.inputActorId,vehicles:this.snapshot().vehicles.map(({instanceId,assetId,mode,available})=>({instanceId,assetId,mode,available})),cameraModes:[0,1,2],inputAxes:['forward','steer','lift','roll','pitch','strafe','boost','brake','jump','slow','primary','secondary','actions']};}
  private episodeCandidate(start:EpisodeStart){
    const config=start.humanoid!,index=this.index(config.vehicleInstanceId!),current=this.simulation.vehicles[index]!;
    if(!this.simulation.available(current))throw new Error('HUMANOID_VEHICLE_UNAVAILABLE');
    const candidate=createVehicle(current.spec);candidate.position.set(...start.positionWorldMetersXYZ);candidate.yaw=start.facingYawRadians+Math.PI;candidate.pitch=config.pitchRadians??0;candidate.roll=config.rollRadians??0;
    candidate.rotation.setFromEuler(new THREE.Euler(-candidate.pitch,candidate.yaw,candidate.roll,'YXZ'));
    if(config.velocityWorldMetersPerSecondXYZ)candidate.velocity.set(...config.velocityWorldMetersPerSecondXYZ);
    candidate.speed=candidate.velocity.length();candidate.throttle=config.throttle??0;candidate.launched=config.launched??candidate.speed>0;
    const floor=this.environment.support(candidate.position,.15,.1);candidate.grounded=!!floor&&Math.abs(floor.height-candidate.position.y)<.15;candidate.submerged=!!this.environment.waterAt(candidate.position)&&candidate.spec.mode==='submarine';
    resetCreatureState(candidate);if(candidate.motion.creature&&config.launched)candidate.motion.creature.flying=true;
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
    if(!config?.vehicleInstanceId)return this.probeCharacterStart(this.inputActorId,start.positionWorldMetersXYZ);
    const {candidate,index}=this.episodeCandidate(start),q=this.environment,safe=q.safeSpawn(candidate.position,vehicleBody(candidate.spec),candidate.rotation);
    let valid=!!safe&&safe.distanceTo(candidate.position)<=.35;
    if(safe)candidate.position.copy(safe);
    valid=valid&&canPlaceCreature(candidate,q);
    if(config.mounted!==false)valid=valid&&![...this.simulation.actors.values()].some(actor=>actor.id!==this.inputActorId&&actor.vehicle?.spec.id===candidate.spec.id);
    if(config.mounted!==false&&candidate.spec.bodyPhysics?.kind==='paddle')valid=valid&&!q.bodyOverlap({position:candidate.position,rotation:candidate.rotation,body:paddleRiderBody(candidate.spec.seat)},{excludedActorIds:new Set([candidate.spec.id]),excludedColliderHandles:new Set([this.simulation.controlledActor.controller.capsule.handle])});
    if(candidate.spec.archetype!=='raft'&&['paddled_boat','boat','submarine'].includes(candidate.spec.mode))valid=valid&&q.waterContains(candidate.position,candidate.spec.radius);
    // Start relocation cannot overwrite another parked actor's occupied envelope.
    valid=valid&&!this.simulation.vehicles.some((v,i)=>i!==index&&this.simulation.available(v)&&Math.abs(v.position.y-candidate.position.y)<2&&Math.hypot(v.position.x-candidate.position.x,v.position.z-candidate.position.z)<v.spec.radius+candidate.spec.radius);
    return {isValid:valid,requestedPositionWorldMetersXYZ:start.positionWorldMetersXYZ,resolvedPositionWorldMetersXYZ:tuple(candidate.position),diagnostics:valid?[]:[{code:'HUMANOID_START_BLOCKED',message:'The full vehicle envelope, medium or another actor blocks this start.'}]};
  }
  private prepareEpisodeStartOwned(start:EpisodeStart):void{
    const probe=this.probeEpisodeStart(start);if(!probe.isValid)throw new Error('HUMANOID_START_BLOCKED');
    this.clearInputOwned();this.actorAnimation(this.cameraTargetId)?.setFirstPerson(false);this.cameraActor=this.inputActorId;const config=start.humanoid;
    if(config?.vehicleInstanceId){
      const {candidate,index}=this.episodeCandidate({...start,positionWorldMetersXYZ:probe.resolvedPositionWorldMetersXYZ});Object.assign(this.simulation.vehicles[index]!,candidate);
      if(config.mounted===false){if(!this.approachOwned(config.vehicleInstanceId))throw new Error('HUMANOID_START_EXIT_BLOCKED');}
      else{if(!this.simulation.controlledActor.controller?.setMounted(true))throw new Error('HUMANOID_START_MOUNT_BLOCKED');this.simulation.controlledActor.vehicleIndex=index;this.simulation.controlledActor.transition=0;this.simulation.controlledActor.transitionKind='';this.simulation.controlledActor.dragonTransition=undefined;this.simulation.controlledActor.player.position.copy(candidate.position).add(new THREE.Vector3(...candidate.spec.seat).applyQuaternion(candidate.rotation));this.simulation.controlledActor.player.yaw=candidate.yaw;}
    }else if(!this.prepareCharacterOwned(probe.resolvedPositionWorldMetersXYZ,start.facingYawRadians+Math.PI))throw new Error('HUMANOID_START_BLOCKED');
    this.simulation.controlledActor.teleportRevision++;this.setCameraModeOwned(config?.cameraMode??this.defaultCameraMode());this.followCamera.reset(this.cameraSubject);this.sync(0);
  }
  private advanceOwned(input:WorldInput,dt:number,pointer:CameraRigInput={},drives:Readonly<Record<string,CharacterDrive>>={},controlYawRadians?:number):void{
    this.assertLive();
    if(input.cameraTogglePressed&&this.profile.view.keyboardToggleEnabled&&!this.authored)this.setCameraModeOwned((this.followCamera.mode+1)%3 as 0|1|2);
    if(!this.authored)this.followCamera.beforeFixedUpdate();
    const cameraBefore=this.authored?undefined:{revision:this.cameraSubject.teleportRevision,vehicle:this.cameraSubject.vehicleIndex};
    physicsHost(this.ordinaryPhysics).prepareStep(dt,Object.fromEntries(Object.entries(drives).filter(([id])=>!this.objects.has(id))));this.presentation.beforeStep(this.simulation);
    const sampled=input.humanoid??{...emptyInput(),forward:-(input.moveZRatio??0),steer:input.moveXRatio??0,lift:input.moveYRatio??0,boost:!!input.run,jump:input.jumpPressed??!!(input.jump&&!this.previousJump)};
    if(!this.authored&&(pointer.yawDeltaRadians||pointer.pitchDeltaRadians))this.followCamera.orbitRadians(pointer.yawDeltaRadians??0,pointer.pitchDeltaRadians??0,this.simulation.time,this.cameraSubject);
    if(!this.authored&&pointer.distanceDeltaMeters)this.followCamera.zoomByMeters(pointer.distanceDeltaMeters,this.cameraSubject);
    if(!this.authored&&(input.cameraYawRatio||input.cameraPitchRatio))this.followCamera.orbitRadians((input.cameraYawRatio??0)*dt*1.2,(input.cameraPitchRatio??0)*dt,this.simulation.time,this.cameraSubject);
    const actorInputs=new Map<string,ActorInput>();
    for(const [id,actor] of this.simulation.actors){
      const override=this.actorInputs.get(id),selected=id===this.simulation.controlledActorId;
      const controls=override?.input??(selected?sampled:this.driveInput(id,drives[id]));
      if(selected&&!override&&(input.interactPressed??!!(input.interact&&!this.previousInteract)))actor.interact();
      actorInputs.set(id,{input:controls,yaw:selected||override?(controlYawRadians??this.followCamera.yaw):0});
    }
    this.simulation.step(dt,actorInputs);
    for(const [id,value] of actorInputs)this.actorLastInputs.set(id,{input:structuredClone(value.input),source:this.actorInputs.get(id)?.source??(id===this.simulation.controlledActorId&&input.humanoid?'world.humanoid':'world-input'),simulationSeconds:this.simulation.time});
    for(const value of this.actorInputs.values())value.input={...value.input,jump:false,actions:{}};
    physicsHost(this.ordinaryPhysics).finishStep();this.presentation.afterStep(this.simulation);this.sync(dt);
    if(!this.authored){this.followCamera.update(this.cameraSubject,dt);this.followCamera.capturePresentationPose(this.cameraSubject,cameraBefore?.vehicle!==this.cameraSubject.vehicleIndex||cameraBefore?.revision!==this.cameraSubject.teleportRevision);}
    this.previousJump=!!input.jump;this.previousInteract=!!input.interact;
  }
  private sync(dt:number,snapCamera=true):void{
    for(const v of this.simulation.vehicles){const object=this.objects.get(v.spec.id)!;object.position.copy(v.position);object.quaternion.copy(v.rotation);object.visible=this.simulation.available(v);}
    for(const [id,binding] of this.actors){
      const actor=this.simulation.actor(id),mounted=actor.vehicle,logical=this.logicalPose(id)!;
      binding.object.position.copy(logical.position);binding.object.quaternion.copy(logical.rotation);
      if(dt===0&&mounted?.motion.unicycle){const support=refreshUnicycleSupport(mounted,this.environment);if(!support||mounted.speed>UNICYCLE_TIMING.stoppedSpeed){mounted.motion.unicycle.footDown=0;mounted.motion.unicycle.phase=mounted.grounded?'riding':'airborne';}}
      const pose=readHumanoid(actor.controller)!;pose.mounted=mounted?(mounted.spec.characterPose??'drive'):null;
      const t=actor.dragonTransition;if(t)pose.dragonMount={progress:1-actor.transition/t.duration,entering:t.entering,side:t.side};
      if(mounted?.motion.kayak)pose.kayakPose={...mounted.motion.kayak};
      if(mounted?.motion.jetski)pose.atvSteeringAngle=mounted.motion.jetski.steeringAngle;
      if(mounted?.motion.unicycle)pose.unicyclePose=copyUnicycleState(mounted.motion.unicycle);
      if(mounted?.motion.atv)pose.atvSteeringAngle=mounted.motion.atv.steeringAngle;
      if(mounted?.motion.sled)pose.sledPose={...mounted.motion.sled};
      binding.animation?.setFirstPerson(this.cameraTargetId===id&&!this.authored&&this.followCamera.mode===1);
      binding.animation?.update(dt,pose);binding.animation?.capturePresentationPose();if(dt===0)binding.animation?.capturePresentationPose();
    }
    for(const object of this.objects.values())object.updateWorldMatrix(true,true);
    if(dt===0){this.presentation.snap(this.simulation);this.presentationEpoch++;this.visualSample=undefined;this.presentationCutTick=undefined;}
    const display=this.presentation.sample(1,this.presentationEpoch,0,0);this.sampleHorses(display);
    this.options.vehicles.forEach((instance,index)=>instance.flyingVisual?.commit(display.vehicles[index]!,display.epoch,display.timeSeconds));
    this.alignHorseRiders();this.sampleSkiEquipment();
    if(dt===0&&!this.authored){if(snapCamera){this.followCamera.beforeFixedUpdate();this.followCamera.update(this.cameraSubject,0);}this.followCamera.capturePresentationPose(this.cameraSubject,true);}
  }
  private sampleHorses(sample: HumanoidDisplaySample): void {
    this.options.vehicles.forEach((instance, index) => {
      const pose = sample.vehicles[index]!;
      instance.flyingVisual?.sample(pose,sample.timeSeconds);
      if(![...this.simulation.actors.values()].some(actor=>actor.vehicleIndex===index)){instance.flyingVisual?.sampleReins(null);instance.flyingVisual?.sampleMount(undefined,null);}
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
  private sampleSkiEquipment():void{
    this.options.vehicles.forEach((instance,index)=>{if(instance.spec.mode==='ski'){const rider=[...this.simulation.actors.values()].find(actor=>actor.vehicleIndex===index);sampleSkiEquipment(instance.object,rider?this.actors.get(rider.id)!.object:null);}});
  }
  private alignHorseRiders():void{
    for(const [id,actor] of this.simulation.actors){
      const index=actor.vehicleIndex;if(index<0)continue;const instance=this.options.vehicles[index]!,binding=this.actors.get(id)!;
      if(instance.flyingVisual&&actor.dragonTransition){const object=binding.object;object.updateWorldMatrix(true,false);binding.animation?.alignMountedPelvis(object.matrixWorld.clone());instance.flyingVisual.sampleReins(null);const contacts=instance.flyingVisual.sampleMount(actor.dragonTransition,object);if(contacts)binding.animation?.fitDragonClimb(contacts);continue;}
      if(instance.flyingVisual){instance.flyingVisual.sampleMount(undefined,null);binding.animation?.alignMountedPelvis(instance.flyingVisual.readSeatWorld());instance.flyingVisual.sampleReins(binding.object);continue;}
      if(!instance.visual)continue;instance.object.updateWorldMatrix(true,true);const anchor=instance.visual.readSeatAnchor(actor.vehicle!.spec.seat,instance.seatAnchor);
      binding.animation?.alignMountedPelvis(instance.object.matrixWorld.clone().multiply(anchor));
    }
  }
  /** Physical observations never read temporarily interpolated roots. */
  logicalPose(id:string):{position:THREE.Vector3;rotation:THREE.Quaternion}|undefined{
    const actor=this.simulation.actors.get(id);
    if(actor){const mounted=actor.vehicle;return mounted&&!actor.dragonTransition?{position:mounted.position.clone().add(new THREE.Vector3(...mounted.spec.seat).applyQuaternion(mounted.rotation)),rotation:mounted.rotation.clone()}:{position:actor.player.position.clone(),rotation:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),actor.player.yaw)};}
    const vehicle=this.simulation.vehicles.find(v=>v.spec.id===id);return vehicle?{position:vehicle.position.clone(),rotation:vehicle.rotation.clone()}:undefined;
  }
  private present(alpha:number,tick:number,view:'world'|'object'='world'):()=>void {
    if(this.presentation.hasDiscontinuity(this.simulation)){
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
      for(const binding of this.actors.values())binding.animation?.applyPresentationPose(1);
      this.sampleHorses(this.presentation.sample(1,this.presentationEpoch,tick,tick));
      this.alignHorseRiders();this.sampleSkiEquipment();
      for(const object of this.objects.values())object.updateWorldMatrix(true,true);
    };
    try {
      restoreBody=this.actorAnimation(this.cameraTargetId)?.presentFirstPerson(view==='world'&&!this.authored&&this.followCamera.mode===1);
      sample.vehicles.forEach((pose,index)=>{
        const object=this.options.vehicles[index]!.object;
        object.position.copy(pose.position);object.quaternion.copy(pose.rotation);
      });
      this.sampleHorses(sample);
      for(const [id,binding] of this.actors){const pose=sample.actors[id]!;binding.object.position.copy(pose.position);binding.object.quaternion.copy(pose.rotation);binding.animation?.applyPresentationPose(sample.alpha);}
      const last=this.visualSample;
      if(!last||last.epoch!==sample.epoch||last.previousTick!==sample.previousTick||last.currentTick!==sample.currentTick||last.alpha!==sample.alpha){
        const elapsed=last&&last.epoch===sample.epoch?sample.timeSeconds-last.timeSeconds:0;
        for(const update of this.visualUpdates)update(elapsed,sample);
        this.visualSample=sample;
      }
      for(const [id,actor] of this.simulation.actors){if(actor.vehicleIndex<0||actor.dragonTransition)continue;const vehicle=sample.vehicles[actor.vehicleIndex]!,binding=this.actors.get(id)!;binding.object.position.copy(vehicle.position).add(new THREE.Vector3(...actor.vehicle!.spec.seat).applyQuaternion(vehicle.rotation));binding.object.quaternion.copy(vehicle.rotation);}
      for(const object of this.objects.values())object.updateWorldMatrix(true,true);this.alignHorseRiders();this.sampleSkiEquipment();
      if(!this.authored&&this.followCamera.initialized){const actor=this.simulation.actor(this.cameraTargetId!);this.followCamera.present(actor.vehicleIndex>=0?sample.vehicles[actor.vehicleIndex]!:sample.actors[actor.id]!,sample.alpha);}
      return restore;
    } catch(error){restore();throw error;}
  }
  state(id:string):PhysicsEntityState|undefined{
    const actor=this.simulation.actors.get(id);
    if(actor){const h=actor.controller,contacts:string[]=[];if(!actor.vehicle)for(let n=0;n<h.controller.numComputedCollisions();n++){const collider=h.controller.computedCollision(n)?.collider;if(collider)contacts.push(this.environment.colliderId(collider.handle));}return {id,positionMetersXYZ:tuple(this.logicalPose(id)!.position),velocityMetersPerSecondXYZ:tuple(actor.vehicle?.velocity??actor.player.velocity),isGrounded:actor.vehicle?.grounded??actor.player.grounded,collisionEntityIds:[...new Set(contacts)]};}
    const v=this.simulation.vehicles.find(v=>v.spec.id===id);return v?{id,positionMetersXYZ:tuple(v.position),velocityMetersPerSecondXYZ:tuple(v.velocity),isGrounded:v.grounded,collisionEntityIds:[]}:this.ordinaryPhysics.state(id);
  }
  hasActor(id:string):boolean{return this.actors.has(id);}
  allowsWorldCommand(type:string,id:string):boolean{return this.hasActor(id)&&isHumanoidActorCommand(type);}
  private driveInput(id:string,drive:CharacterDrive|undefined):Input{
    if(!drive||this.actorController(id).isMounted)return emptyInput();if(!('velocityMetersPerSecondXZ' in drive))throw new Error('HUMANOID_GROUND_DRIVE_REQUIRED');
    const [x,z]=drive.velocityMetersPerSecondXZ,tuning=this.actorController(id).movementTuning,walk=3.1*tuning.speedScale;
    const speed=Math.hypot(x,z),boost=speed>walk,limit=boost?tuning.maxSpeed:walk;
    return {...emptyInput(),steer:-x/limit,forward:z/limit,boost,jump:!!drive.jumpPressed};
  }
  private applyActorMovement(controller:ReturnType<HumanoidRuntime['actorController']>,movement:CharacterOptions):void{
    if(movement.walkSpeedMetersPerSecond!==undefined)controller.movementTuning.speedScale=movement.walkSpeedMetersPerSecond/3.1;
    if(movement.runSpeedMetersPerSecond!==undefined)controller.movementTuning.maxSpeed=movement.runSpeedMetersPerSecond;
    if(movement.jumpSpeedMetersPerSecond!==undefined)controller.movementTuning.jumpSpeed=movement.jumpSpeedMetersPerSecond;
  }
  private restoreActors(simulation:Simulation,profile:ReturnType<HumanoidRuntime['prepareProfile']>):void{
    for(const [id,binding] of this.actors){if(simulation.environment.colliderForId(id))throw new Error('HUMANOID_PHYSICS_ID_CONFLICT');const actor=simulation.addActor(id,binding.spawn==='map'?new THREE.Vector3(...simulation.environment.map.playerSpawn):binding.initialPosition,binding.initialYaw);if(binding.animation)actor.controller.setAvailableClips(binding.animation.availableHumanoidClips,binding.animation.motionSources);simulation.environment.colliderBindings.added(id,actor.controller.capsule);}
    this.configureSimulation(simulation,profile);simulation.controlledActorId=this.simulation.controlledActorId!==undefined&&simulation.actors.has(this.simulation.controlledActorId)?this.simulation.controlledActorId:undefined;
  }
  async createCharacter():Promise<Character>{
    this.assertExternalMutation();const factory=this.characterFactory;if(!factory)throw new Error('HUMANOID_SOURCE_UNAVAILABLE');
    const generation=this.lifecycleGeneration,character=await factory();
    if(this.disposed||generation!==this.lifecycleGeneration){character.dispose();throw new Error('HUMANOID_ACTOR_LOAD_STALE');}return character;
  }
  actorController(id:string){return this.simulation.actor(id).controller;}
  private bindCharacter(id:string,binding:import('./character-binding').RuntimeActorBinding,movement:CharacterOptions={},prevalidated=false):void{
    this.assertLive();this.assertRigidIds([id]);
    if(binding.spawn==='map')binding.object.position.set(...this.environment.map.playerSpawn);
    const {position,yaw}=validateActorBinding(binding,movement),{object,animation}=binding;
    const actor=this.simulation.addActor(id,position,yaw,prevalidated);
    try{if(animation)actor.controller.setAvailableClips(animation.availableHumanoidClips,animation.motionSources);this.environment.colliderBindings.added(id,actor.controller.capsule);}
    catch(error){this.simulation.removeActor(id);throw error;}
    const firstActor=this.actors.size===0;
    this.actors.set(id,{object,...(animation?{animation}:{}),...(binding.spawn?{spawn:binding.spawn}:{}),movement:{...movement},initialPosition:actor.player.position.clone(),initialYaw:actor.player.yaw});this.objects.set(id,object);
    this.configureSimulation(this.simulation,this.prepareProfile(this.profile));
    if(this.cameraTargetId!==undefined&&this.simulation.actors.has(this.cameraTargetId)){if(firstActor)this.followCamera.reset(this.cameraSubject);this.sync(0,!firstActor);}
  }
  addCharacter(id:string,object:THREE.Object3D,options:CharacterOptions={}):void{
    if(this.objects.has(id)){if(this.objects.get(id)!==object)throw new Error('HUMANOID_CONTENT_OBJECT_MISMATCH');return;}
    this.assertRigidIds([id]);this.ordinaryPhysics.addCharacter(id,object,options);
  }
  private assertRigidIds(ids:readonly string[],environment=this.environment):void{
    if(ids.some(id=>this.objects.has(id)||environment.colliderForId(id)||environment.interactions.hasMapEntity(id)))throw new Error('HUMANOID_PHYSICS_ID_CONFLICT');
  }
  addRigid(id:string,object:THREE.Object3D,options:RigidPhysics):void{
    this.assertRigidIds([id]);
    this.ordinaryPhysics.addRigid(id,object,options);
  }
  remove(id:string):void{if(this.actors.has(id)){this.simulation.removeActor(id);this.actors.delete(id);this.objects.delete(id);this.actorInputs.delete(id);this.actorLastInputs.delete(id);if(this.cameraTargetId===id){this.authored=true;this.cameraActor=undefined;}}else this.ordinaryPhysics.remove(id);}
  validateBatch(candidates:readonly PhysicsCandidate[],removed:readonly string[]=[]):void{
    if(candidates.some(c=>this.objects.has(c.id))||removed.some(id=>this.objects.has(id)&&!this.actors.has(id)))throw new Error('HUMANOID_USE_RUNTIME_COMMANDS');
    this.assertRigidIds(candidates.map(candidate=>candidate.id));
    this.ordinaryPhysics.validateBatch(candidates,removed);
  }
  refresh(id:string):void{this.ordinaryPhysics.refresh(id);}
  refreshMany(ids:readonly string[]):void{this.ordinaryPhysics.refreshMany(ids);}
  setEnabled(id:string,enabled:boolean):void{this.ordinaryPhysics.setEnabled(id,enabled);}
  teleport(id:string,position:Vec3):void{
    this.assertExternalMutation();
    if(this.hasActor(id)){if(!this.prepareCharacterOwned(position,this.simulation.actor(id).player.yaw,id))throw new Error('HUMANOID_START_BLOCKED');}
    else this.ordinaryPhysics.teleport(id,position);
  }
  applyImpulse(id:string,impulse:Vec3):void{this.assertExternalMutation();this.ordinaryPhysics.applyImpulse(id,impulse);}
  step():void{throw new Error('HUMANOID_REQUIRES_ENGINE_INPUT');}
  characterSettings(id:string):Required<CharacterOptions>{if(!this.hasActor(id))return this.ordinaryPhysics.characterSettings(id);const c=this.actorController(id).movementTuning;return {...DEFAULT_CHARACTER_OPTIONS,heightMeters:CENTER*2,radiusMeters:RADIUS,walkSpeedMetersPerSecond:3.1*c.speedScale,runSpeedMetersPerSecond:c.maxSpeed,jumpSpeedMetersPerSecond:c.jumpSpeed,maximumStepHeightMeters:.27};}
  probeCharacterStart(id:string,position:Vec3,support:'ground'|'free'='ground'):EpisodeStartProbe{
    if(!this.hasActor(id))return this.ordinaryPhysics.probeCharacterStart(id,position,support);
    this.actorController(id);
    const safe=this.environment.safeSpawn(new THREE.Vector3(...position),HUMANOID_BODY);const valid=!!safe&&safe.distanceTo(new THREE.Vector3(...position))<=.35&&!this.environment.bodyOverlap({position:safe,rotation:new THREE.Quaternion(),body:HUMANOID_BODY},{excludedColliderHandles:new Set([this.actorController(id).capsule.handle])},.015);
    return {isValid:valid,requestedPositionWorldMetersXYZ:position,resolvedPositionWorldMetersXYZ:safe?tuple(safe):position,diagnostics:valid?[]:[{code:'HUMANOID_START_BLOCKED',message:'No safe character start within alignment tolerance.'}]};
  }
  castCameraArm(target:Vec3,eye:Vec3,radius:number){return this.environment.cameraProbe(target,eye,radius);}
  probe(origin:Vec3,direction:Vec3,distance:number){const result=this.environment.raycast(new THREE.Vector3(...origin),new THREE.Vector3(...direction),distance);return result?{entityId:result.id,distanceMeters:result.distance,normalWorldXYZ:tuple(result.normal)}:null;}
  audit():PhysicsAudit{
    const ordinary=this.ordinaryPhysics.audit(),base={engine:'rapier' as const,entityCount:this.objects.size,colliderCount:this.environment.colliderCount,triangleCount:0,entities:[...this.objects.keys()].map(id=>({id,kind:this.actors.has(id)?'character':'vehicle',colliderCount:this.simulation.vehicles.find(v=>v.spec.id===id)?.spec.mode==='carriage'?2:1,triangleCount:0})),diagnostics:[]};
    return {...base,entityCount:base.entityCount+ordinary.entityCount,triangleCount:ordinary.triangleCount,
      entities:[...base.entities,...ordinary.entities],diagnostics:[...ordinary.diagnostics]};
  }
  private finishResetOwned():void{
    this.cameraActor=this.baselineCameraActor&&this.hasActor(this.baselineCameraActor)?this.baselineCameraActor:undefined;
    this.restoreDefaultCameraMode();this.sync(0);
    if(this.replacementPending){this.replacementPending=false;for(const notify of this.simulationReplacements)notify('reset');}
  }
  private resetOwned():void{
    const profile=this.prepareProfile(this.baselineProfile);validateEnvironment(this.currentMap);
    const replacement=new EnvironmentQueries(this.instanceMap(this.currentMap),this.executionResources),previous=this.environment;
    let staged:Simulation|undefined,ordinary:ThreePhysics|undefined;
    try{this.assertRigidIds(this.ordinaryPhysics.audit().entities.map(entity=>entity.id),replacement);ordinary=physicsHost(this.ordinaryPhysics).fork(replacement.borrowPhysics());staged=new Simulation(replacement,this.simulation.vehicles.map(v=>structuredClone(v.spec)));this.configureSimulation(staged,profile);this.restoreActors(staged,profile);}
    catch(error){staged?.dispose();ordinary?.dispose();replacement.dispose();throw error;}
    this.releaseOrdinarySubstep();this.ordinaryPhysics.dispose();this.ordinaryPhysics=ordinary;
    this.releaseOrdinarySubstep=replacement.beforePhysicsSubstep(f=>physicsHost(this.ordinaryPhysics).prepareSubstep(f));
    this.lifecycleGeneration++;this.simulation.dispose();this.currentSimulation=staged!;this.environment=replacement;this.followCamera.environment=replacement;this.commitProfile(profile);previous.dispose();this.clearInputOwned();
    this.replacementPending=true;
    this.authored=this.baselineAuthored;this.camera.copy(this.initialCamera,false);
    if(!this.authored)this.camera.fov=this.followCamera.tuning.baseFovDegrees;
    this.camera.updateProjectionMatrix();if(this.actors.size)this.finishResetOwned();
  }
  dispose():void{if(this.disposed)return;this.clearInputOwned();this.episodeOwned=false;this.disposed=true;this.followCamera.dispose();this.visualUpdates.clear();this.simulationReplacements.clear();this.simulation.dispose();this.releaseOrdinarySubstep();this.ordinaryPhysics.dispose();this.environment.dispose();if(this.releaseCharacterOwnership){try{this.options.character.animation?.dispose();}finally{this.releaseCharacterOwnership();this.releaseCharacterOwnership=undefined;}}for(const vehicle of this.options.vehicles){disposeSubmersibleVisual(vehicle.object);disposeJetSkiVisual(vehicle.object);vehicle.visual?.dispose();vehicle.flyingVisual?.dispose();}}
}
