import {inspectAircraftActions,aircraftActionInput,type AircraftActionRequest} from './motion-families/aircraft/actions';
import {mountedPose,mountedRiderOffset} from './motion-families/aircraft/wearable-flight';
import type {CameraFollowOptions} from '../contracts';
import {setSpaceDriveMode,requestSpaceDock,spaceTelemetry} from './motion-families/space/commands';
import type {SpaceDriveMode} from './motion-families/space/config';
import {copyFlyingCreatureState} from './motion-families/flying-creature/state';
import {ActorResources} from '../actor-resources';
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
import type { CameraPointerInput } from '../input';
import { CONTROL_RANGES,parseMovementSettings,readMovementSettings,type MovementSettings } from '../config/control';
import { DEFAULT_CHARACTER_OPTIONS } from '../config/physics';
import type { CharacterDrive,CharacterOptions,PhysicsAudit,PhysicsCandidate,PhysicsEntityState,PhysicsPort,RigidPhysics,Vec3,WorldInput } from '../engine-contracts';
import type { EpisodeCapabilities,EpisodeStart,EpisodeStartProbe } from '../episode-contracts';
import { HumanoidCameraGeometry,sampleHumanoidCameraSubject,type HumanoidCameraRequests } from './camera-host';
import type { PresentationSampleContext } from '../camera/state';
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

 | {readonly type:'humanoid.set-input';readonly actorId?:string;readonly input:Input|null}
 | {readonly type:'humanoid.apply-profile';readonly profile:HumanoidProfile}
 | {readonly type:'humanoid.perform-action';readonly actorId?:string;readonly request:SkillRequest};
const HUMANOID_COMMAND_TYPES:ReadonlySet<string>=new Set<HumanoidCommand['type']>([
 'space.set-drive-mode','space.dock','vehicle.prepare','vehicle.approach','vehicle.enter','vehicle.exit','vehicle.recover',
 'humanoid.set-input','humanoid.apply-profile','humanoid.perform-action',
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
  readonly character:{readonly instanceId:string;readonly object:THREE.Object3D;readonly animation?:Character;readonly facingYawRadians?:number;readonly initialMountId?:string};
}
export interface HumanoidProfile {
  readonly character?:Partial<MovementSettings>;
  readonly vehicles?:Readonly<Record<string,Partial<MovementSettings>>>;
}
/** Replayable profile and the active controller's resolved settings. Observation only. */
export interface HumanoidConfiguration {
  readonly profile:HumanoidProfile;
  readonly effective:{
    readonly subjectId:string;
    readonly family:VehicleSpec['mode']|'character';
    readonly control:Partial<MovementSettings>;
  };
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
  readonly lastApplied:{readonly source:'aircraft-actions'|'humanoid.set-input'|'setInput'|'world.humanoid'|'world-input';readonly input:Input;readonly simulationSeconds:number}|null;
}
export interface HumanoidSnapshot {
  readonly controls:{readonly character:MovementSettings;readonly vehicles:Readonly<Record<string,MovementSettings>>};
  readonly teleportRevision:number;
  readonly recovery:null|{sequence:number;status:'recovered'|'blocked';trigger:'fall'|'outside-map';reason:string;simulationSeconds:number;subjectInstanceId:string;from:Vec3;to:Vec3|null};
  readonly mapId:string;readonly timeSeconds:number;
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
  readonly vehicles:readonly {readonly instanceId:string;readonly assetId:string;readonly mode:VehicleSpec['mode'];readonly aircraftSubtype?:VehicleSpec['aircraftSubtype'];readonly available:boolean;readonly speedMetersPerSecond:number;readonly throttle:number;readonly steering:number;readonly grounded:boolean;readonly submerged:boolean;readonly spaceFlight?:NonNullable<ReturnType<typeof spaceTelemetry>>}[];
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
  private cameraRequests:HumanoidCameraRequests|undefined;
  private readonly cameraGeometry:HumanoidCameraGeometry;
  private readonly actors=new Map<string,{object:THREE.Object3D;animation?:Character;spawn?:'map';movement:CharacterOptions;initialPosition:THREE.Vector3;initialYaw:number}>();
  get inputActorId():string{const id=this.simulation.controlledActorId;if(id===undefined)throw new Error('HUMANOID_INPUT_ACTOR_REQUIRED');return id;}
  get cameraTargetId():string|undefined{return this.cameraRequests?.inspect().document?.binding.targetEntityId;}
  private actorAnimation(id:string|undefined){return id===undefined?undefined:this.actors.get(id)?.animation;}
  private setControlledActorOwned(id:string|undefined):void{if(id!==undefined)this.actorController(id);this.simulation.controlledActorId=id;this.previousJump=false;this.previousInteract=false;}
  setCameraTarget(id:string):void{this.assertExternalMutation();this.actorController(id);const document=this.cameraRequests?.inspect().document;if(!document)throw new Error('CAMERA_FOLLOW_REQUIRED');this.cameraRequests?.follow({configuration:{...document,binding:{...document.binding,targetEntityId:id}}});}
  private readonly actorInputs=new Map<string,{input:Input;source:'humanoid.set-input'|'setInput'}>();
  private readonly actorLastInputs=new Map<string,HumanoidInputObservation['lastApplied']>();
  private readonly objects=new Map<string,THREE.Object3D>();
  private readonly specs:VehicleSpec[];
  private disposed=false;
  private lifecycleGeneration=0;
  private episodeOwned=false;
  private readonly presentation:PresentationState;
  private presentationEpoch=0;
  private presentationDirty=true;
  private visualSample:HumanoidDisplaySample|undefined;
  private characterFacingPrepared=false;
  private baselinePrimaryYaw:number|undefined;
  private previousJump=false;
  private previousInteract=false;
  private baselineProfile:HumanoidProfile={};
  private profile:HumanoidProfile={};
  private currentMap:EnvironmentDefinition;
  private readonly visualUpdates=new Set<(deltaSeconds:number,sample:HumanoidDisplaySample)=>void>();
  private mapValidator:((map:EnvironmentDefinition)=>void)|undefined;
  private readonly simulationReplacements=new Set<(reason:'map'|'reset')=>void>();
  static async create(options:HumanoidRuntimeOptions,camera:THREE.Camera):Promise<HumanoidRuntime>{
    validateEnvironment(options.map);
    if(options.character.facingYawRadians!==undefined&&!Number.isFinite(options.character.facingYawRadians))throw new Error('HUMANOID_INITIAL_FACING_INVALID');
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
    this.cameraGeometry=new HumanoidCameraGeometry(options.vehicles);
    this.profile={character:{...this.simulation.characterControl},vehicles:Object.fromEntries(this.simulation.vehicles.map(v=>[v.spec.id,{...readMovementSettings(v.spec)}]))};
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
      teleportCharacter:(id,position)=>{this.assertLive();this.teleportOwned(id,position);},
      applyImpulse:(id,impulse)=>{this.assertLive();this.ordinaryPhysics.applyImpulse(id,impulse);},
      prepareEpisodeStart: start => { this.assertLive(); this.prepareEpisodeStartOwned(start); },
      hasMovementIntent:()=>{const input=this.actorInputs.get(this.simulation.controlledActorId??'')?.input;return !!input&&(!!input.forward||!!input.steer||!!input.strafe||!!input.lift||!!input.roll||!!input.pitch||input.jump);},
      bindCamera:requests=>{this.cameraRequests=requests;},
      sampleCamera:(binding,generation,display=false)=>sampleHumanoidCameraSubject(this.simulation,binding,generation,this.objects,display,(id,target)=>this.actorAnimation(id)?.eyePosition(target)??false),
      cameraGeometry:subject=>this.cameraGeometry.bind(this.environment,this.simulation,subject),
      cameraOperation:binding=>{const actor=this.simulation.actors.get(binding.targetEntityId);const vehicleId=actor&&binding.mountTarget!=='actor'?actor.vehicle?.spec.id:binding.targetEntityId;return `${this.lifecycleGeneration}:${actor?.teleportRevision??''}:${actor?.vehicle?.spec.id??''}:${vehicleId?this.simulation.vehicleRelocationOccurrence(vehicleId):0}`;},
      presentationDiscontinuity:()=>this.presentationDirty||this.presentation.hasDiscontinuity(this.simulation),
      present: (context,view) => { this.assertLive(); return this.present(context,view); },
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
    this.cameraRequests?.assertExternalMutation();
  }
  advance(input:WorldInput,dt:number,pointer:CameraPointerInput={}):void { this.assertExternalMutation(); this.advanceOwned(input,dt,pointer); }
  reset():void { this.assertExternalMutation(); this.resetOwned(); }
  /** Physical placement only. Episode camera/view preparation belongs to World’s Episode port. */
  prepareEpisodeStart(start:Omit<EpisodeStart,'cameraViewId'>):void { this.assertExternalMutation(); if('cameraViewId' in start)throw new Error('HUMANOID_PLACEMENT_CAMERA_UNSUPPORTED');this.prepareEpisodeStartOwned(start); }
  clearInput():void { this.assertExternalMutation(); this.clearInputOwned(); }
  prepareCharacter(position:Vec3,yaw=0):boolean { this.assertExternalMutation(); return this.prepareCharacterOwned(position,yaw); }
  approach(id:string):boolean { this.assertExternalMutation(); return this.approachOwned(id); }
  get cameraMode():'authored'|'follow-pending'|'follow'{return this.cameraRequests?.inspect().mode??'authored';}
  private get firstPerson():boolean{return this.cameraMode==='follow'&&this.cameraRequests?.inspect().resolved?.kind==='first-person';}
  controlForwardWorldXYZ():readonly [number,number,number]{return this.cameraRequests?.forward()??[0,0,-1];}
  setCameraFollow(options:CameraFollowOptions):void{this.assertExternalMutation();this.cameraRequests?.follow(options);}
  command(command:HumanoidCommand):SkillResult|undefined{this.assertExternalMutation();return this.commandOwned(command);}
  private commandOwned(command:HumanoidCommand):SkillResult|undefined{
    const fields:Record<HumanoidCommand['type'],readonly string[]>={'space.set-drive-mode':['actorId','mode'],'space.dock':['actorId','portId'],'vehicle.prepare':['instanceId','spawn','actorId'],'vehicle.approach':['instanceId','actorId'],'vehicle.enter':['instanceId','actorId'],'vehicle.exit':['actorId'],'vehicle.recover':['actorId'],'humanoid.set-input':['input','actorId'],'humanoid.apply-profile':['profile'],'humanoid.perform-action':['request','actorId']};
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
    const profile=object({character:object(controlSchemaForFamily('character'),[]),vehicles:object(Object.fromEntries(this.simulation.vehicles.map(vehicle=>[vehicle.spec.id,object(controlSchemaForFamily(vehicle.motion.flyingCreature?'flying-creature':vehicle.spec.mode,!!(vehicle.motion.wheelPhysics||vehicle.motion.body?.powertrain)),[])])),[])},[]);
    const vehicle=this.simulation.actor(id).vehicle;
    return [...(vehicle?.motion.family==='space'?[create('space.set-drive-mode',{actorId:{const:id},mode:{enum:['assisted','inertial']}}),create('space.dock',{actorId:{const:id},portId:{enum:[null,...(vehicle.spec.spaceFlight!.dockingPorts?.map(p=>p.id)??[])]}})]:[]),...[create('vehicle.exit',{actorId:{const:id}}),create('vehicle.recover',{actorId:{const:id}})],create('humanoid.set-input',{actorId:{const:id},input:{anyOf:[input,{type:'null'}]}}),create('humanoid.apply-profile',{profile}),create('humanoid.perform-action',{actorId:{const:id},request:object({requestId:{type:'string'},action:{enum:['roll','slide','pickup','putDown','sit','standUp']},targetId:{type:'string'},slotId:{type:'string'}},['requestId','action'])})];
  }
  snapshot(actorId:string=this.inputActorId):HumanoidSnapshot{
    const s=this.simulation,actor=s.actor(actorId),h=actor.controller,tr=h?.traversal,surface=h?.surface;
    const targets=h.skills.listTargets();
    const waterControllerActive=Boolean(h&&!actor.vehicle&&!tr),contact=waterControllerActive?h?.water:null;
    return {
      controls:{character:readMovementSettings(s.characterControl),vehicles:Object.fromEntries(s.vehicles.map(v=>[v.spec.id,readMovementSettings(v.spec)]))},
      teleportRevision:actor.teleportRevision,recovery:actor.recovery?{...structuredClone(actor.recovery),subjectInstanceId:actor.recovery.vehicleId??actor.id}:null,
      mapId:this.currentMap.id,timeSeconds:s.time,mountedInstanceId:actor.vehicle?.spec.id??null,message:actor.message,
      water:{declaredVolumeCount:this.currentMap.water.length,controllerActive:waterControllerActive,swimming:waterControllerActive&&Boolean(h?.swimming),
        contact:contact?{volumeId:contact.volumeId,surfaceHeightMeters:contact.surfaceY,depthMeters:contact.depth,submersionRatio:contact.submersion,
          feetBelowSurfaceMeters:contact.feetBelowSurfaceMeters,requiredDepthMeters:contact.requiredDepthMeters,requiredFeetBelowSurfaceMeters:contact.requiredFeetBelowSurfaceMeters,
          depthCheckPassed:contact.depthCheckPassed,immersionCheckPassed:contact.immersionCheckPassed,wasSwimmingAtSample:contact.wasSwimmingAtSample,
          entrySpeedMetersPerSecond:contact.entrySpeed,entrySerial:contact.entrySerial}:null},
      characterCapabilities:this.characterCapabilities(actorId).map(({id,eligible,reason,message,targetId,slotId})=>({id,eligible,reason,message,...(targetId?{targetId}:{}),...(slotId?{slotId}:{})})),
      character:{swimStyle:h?.swimStyle??'breaststroke',instanceId:actorId,state:h?.state??actor.player.animation,swimming:!actor.vehicle&&actor.player.swimming,stance:h?.stance??'stand',carrying:h?.skills.carrying??null,seated:h?.skills.seated??null,activeAction:h?.skills.active?{requestId:h.skills.active.requestId,action:h.skills.active.id,phase:h.skills.active.phase,elapsedSeconds:h.skills.active.elapsed}:null},
      vehicles:s.vehicles.map((v,i)=>({instanceId:v.spec.id,assetId:this.options.vehicles[i]!.assetId,mode:v.spec.mode,...(v.motion.aircraft?{aircraftSubtype:v.motion.aircraft.subtype}:{}),available:s.available(v),speedMetersPerSecond:v.velocity.length(),throttle:v.throttle,steering:v.steering,grounded:v.grounded,submerged:v.submerged,...(v.motion.family==='space'?{spaceFlight:spaceTelemetry(v)!}:{})})),
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
  cameraSnapshot():import('../contracts').CameraState{return this.cameraRequests!.snapshot();}
  useAuthoredCamera():void{this.assertExternalMutation();this.cameraRequests?.authored();}
  validateInput(input:Input):void{
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('HUMANOID_INPUT_INVALID');
    for(const key of ['forward','steer','lift','roll','pitch','strafe'] as const)if(typeof input[key]!=='number'||!Number.isFinite(input[key])||Math.abs(input[key])>1)throw new Error('HUMANOID_INPUT_INVALID');
    for(const key of ['primary','secondary'] as const)if(input[key]!==undefined&&typeof input[key]!=='boolean')throw new Error('HUMANOID_INPUT_INVALID');
    for(const key of ['boost','brake','jump','slow'] as const)if(typeof input[key]!=='boolean')throw new Error('HUMANOID_INPUT_INVALID');
    if(Object.keys(input).some(key=>!['forward','steer','lift','roll','pitch','strafe','boost','brake','jump','slow','primary','secondary','actions'].includes(key)))throw new Error('HUMANOID_INPUT_INVALID');
    if(input.actions!==undefined&&(!input.actions||typeof input.actions!=='object'||Array.isArray(input.actions)||Object.entries(input.actions).some(([key,value])=>!(HUMANOID_ACTION_INPUT_FIELDS as readonly string[]).includes(key)||typeof value!=='boolean')))throw new Error('HUMANOID_INPUT_INVALID');
  }
  private aircraftRejections=new Map<string,string>();
  private aircraftIntents=new Map<string,{vehicle:import('./simulation').VehicleState;revision:number;requests:AircraftActionRequest[];remaining:number}>();
  inspectAircraftActionExecution(actorId=this.inputActorId){this.assertLive();this.actorController(actorId);const intent=this.aircraftIntents.get(actorId);return {active:!!intent,remainingSeconds:Math.max(0,intent?.remaining??0),rejection:this.aircraftRejections.get(actorId)??null};}
  /** 查询对应驾驶者的飞机动作，不推进模拟。 */
  inspectAircraftActions(actorId=this.inputActorId){this.assertLive();return inspectAircraftActions(this.simulation.actor(actorId).vehicle);}
  /** 动作由对应驾驶者拥有，在世界的固定时钟中执行。 */
  setAircraftActions(requests:readonly AircraftActionRequest[],durationSeconds:number,actorId=this.inputActorId):()=>void{
    this.assertExternalMutation();const actor=this.simulation.actor(actorId),vehicle=actor.vehicle;
    if(!vehicle?.motion.aircraft)throw new Error('AIRCRAFT_NOT_MOUNTED');
    if(!Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>60)throw new Error('AIRCRAFT_ACTION_DURATION_INVALID');
    if(actor.transition>0)throw new Error('AIRCRAFT_TRANSITION_ACTIVE');
    if(this.executionResources.inspect(actorId).some(claim=>claim.owner.kind==='navigation'))throw new Error('ACTOR_RESOURCE_BUSY: Stop navigation before installing aircraft actions.');
    aircraftActionInput(vehicle,requests);this.setActorInputOwned(actorId,undefined);
    const intent={vehicle,revision:actor.teleportRevision,requests:structuredClone([...requests]),remaining:durationSeconds};
    this.aircraftRejections.delete(actorId);this.aircraftIntents.set(actorId,intent);
    return()=>{if(this.disposed||this.aircraftIntents.get(actorId)!==intent)return;this.assertExternalMutation();this.aircraftIntents.delete(actorId);};
  }
  private aircraftInput(actorId:string,dt:number):Input|undefined{
    const intent=this.aircraftIntents.get(actorId);if(!intent)return;
    const actor=this.simulation.actor(actorId);
    if(intent.vehicle!==actor.vehicle||intent.revision!==actor.teleportRevision||intent.remaining<=0){this.aircraftIntents.delete(actorId);return;}
    let input:Input;
    try{input=aircraftActionInput(intent.vehicle,intent.requests);}catch(error){this.aircraftRejections.set(actorId,error instanceof Error?error.message:String(error));this.aircraftIntents.delete(actorId);return emptyInput();}
    intent.remaining-=dt;intent.requests=intent.requests.filter(r=>r.action!=='deployCanopy');
    if(intent.remaining<=0||intent.requests.length===0)this.aircraftIntents.delete(actorId);
    return input;
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
    this.actorController(id);if(input!==undefined)this.validateInput(input);this.aircraftIntents.delete(id);this.actorLastInputs.delete(id);if(input===undefined){this.actorInputs.delete(id);return;}
    const entry={input:structuredClone(input),source};this.actorInputs.set(id,entry);
    return()=>{if(this.disposed||this.actorInputs.get(id)!==entry)return;this.assertExternalMutation();this.actorInputs.delete(id);this.actorLastInputs.delete(id);};
  }
  private clearInputOwned():void{this.aircraftIntents.clear();this.aircraftRejections.clear();this.actorInputs.clear();this.actorLastInputs.clear();this.previousJump=false;this.previousInteract=false;}
  private index(id:string):number{const n=this.options.vehicles.findIndex(v=>v.instanceId===id);if(n<0)throw new Error(`HUMANOID_INSTANCE_UNKNOWN: ${id}`);return n;}
  prepare(id:string,spawn:MapSpawn):boolean{this.assertExternalMutation();return this.prepareOwned(id,spawn);}
  private prepareOwned(id:string,spawn:MapSpawn,actorId:string=this.inputActorId):boolean{const ok=this.simulation.actor(actorId).prepare(this.index(id),spawn);this.sync(0);return ok;}
  private approachOwned(id:string,actorId:string=this.inputActorId):boolean{this.index(id);const ok=this.simulation.actor(actorId).approach(id);this.sync(0);return ok;}
  recoverVehicle():boolean{this.assertExternalMutation();return this.recoverVehicleOwned();}
  private recoverVehicleOwned(actorId:string=this.inputActorId):boolean{const ok=this.simulation.actor(actorId).recoverVehicle();if(ok){this.setActorInputOwned(actorId,undefined);this.presentation.snap(this.simulation);this.sync(0);}return ok;}
  interact():boolean{this.assertExternalMutation();const ok=this.simulation.controlledActor.interact();if(ok)this.sync(0);return ok;}
  summonDragon(id?:string,actorId:string=this.inputActorId):boolean{this.assertExternalMutation();return this.simulation.summonDragon(id,actorId);}
  enter(id:string):boolean{this.assertExternalMutation();return this.enterOwned(id);}
  private enterOwned(id:string,actorId:string=this.inputActorId):boolean{const ok=this.simulation.actor(actorId).enter(id);if(ok)this.sync(0);return ok;}
  exit():boolean{this.assertExternalMutation();return this.exitOwned();}
  private exitOwned(actorId:string=this.inputActorId):boolean{const ok=this.simulation.actor(actorId).exit();if(ok)this.sync(0);return ok;}
  private prepareCharacterOwned(position:Vec3,yaw=0,actorId:string=this.inputActorId):boolean{
    const actor=this.simulation.actor(actorId),ok=actor.prepareCharacter(new THREE.Vector3(...position),yaw);
    if(ok){if(actorId===this.options.character.instanceId)this.characterFacingPrepared=true;this.actorInputs.delete(actorId);this.actorLastInputs.delete(actorId);this.sync(0);}return ok;
  }
  private prepareProfile(profile:HumanoidProfile):HumanoidProfile & {character:MovementSettings;vehicles:Record<string,MovementSettings>}{
    const object=(value:unknown)=>!!value&&typeof value==='object'&&!Array.isArray(value);
    if(!object(profile)||Object.keys(profile).some(k=>!['character','vehicles'].includes(k)))throw new Error('HUMANOID_PROFILE_INVALID');
    for(const section of [profile.character,profile.vehicles])if(section!==undefined&&!object(section))throw new Error('HUMANOID_PROFILE_INVALID');
    for(const [id,values] of Object.entries(profile.vehicles??{})){this.index(id);if(!object(values)||Object.keys(values).some(k=>!Object.hasOwn(CONTROL_RANGES,k)))throw new Error('HUMANOID_PROFILE_INVALID');}
    const character=parseMovementSettings(profile.character??{},this.simulation.characterControl);
    const vehicles=Object.fromEntries(this.simulation.vehicles.map(v=>{const control=profile.vehicles?.[v.spec.id]??{};return [v.spec.id,{...parseMovementSettings(control,readMovementSettings(v.spec))}];}));
    for(const v of this.simulation.vehicles)if(v.motion.flyingCreature)resolveConfiguredFlyingCreatureFeel({...v.spec,...vehicles[v.spec.id]!});
    const numbers=[...Object.values(character),...Object.values(vehicles).flatMap(v=>Object.values(v))];
    if(numbers.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))throw new Error('HUMANOID_PROFILE_INVALID');
    return {character,vehicles};
  }
  private configureSimulation(simulation:Simulation,profile:ReturnType<HumanoidRuntime['prepareProfile']>):void{
    simulation.characterControl={...profile.character};
    const c=simulation.characterControl;
    for(const [id,actor] of simulation.actors){actor.controller.movementTuning={speedScale:c.speed/3.8,accelerationScale:c.accel/12,airControlScale:c.grip/3,turnScale:c.steer/14,maxSpeed:c.maxSpeed,slowSpeed:c.slowSpeed,coastDeceleration:c.coastDeceleration,jumpSpeed:c.jumpSpeed};this.applyActorMovement(actor.controller,this.actors.get(id)?.movement??{});}
    for(const v of simulation.vehicles)Object.assign(v.spec,profile.vehicles[v.spec.id]);
  }
  private commitProfile(profile:ReturnType<HumanoidRuntime['prepareProfile']>):void{
    this.configureSimulation(this.simulation,profile);
    this.profile=structuredClone(profile);this.baselineProfile=structuredClone(profile);
  }
  applyProfile(profile:HumanoidProfile):void{this.assertExternalMutation();this.applyProfileOwned(profile);}
  private applyProfileOwned(profile:HumanoidProfile):void{
    this.commitProfile(this.prepareProfile(profile));
  }
  /** Export replayable movement settings; camera configuration belongs to World. */
  exportProfile():HumanoidProfile{return structuredClone(this.profile);}
  inspectConfiguration():HumanoidConfiguration{
    const vehicle=this.simulation.controlledActor.vehicle,family=vehicle?.spec.mode??'character';
    const controls=vehicle?.spec??this.simulation.characterControl;
    return {profile:this.exportProfile(),effective:{
      subjectId:vehicle?.spec.id??this.inputActorId,family,
      control:Object.fromEntries(controlFields(family,!!(vehicle?.motion.wheelPhysics||vehicle?.motion.body?.powertrain)).filter(field=>!field.disabled).map(field=>[field.key,controls[field.key]])),
    }};
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
    this.lifecycleGeneration++;this.simulation.dispose();this.currentSimulation=staged!;this.currentMap=map;this.environment=replacement;this.commitProfile(profile);previous.dispose();
    for(const notify of this.simulationReplacements)notify('map');
    this.clearInputOwned();this.sync(0);
  }
  validateInitialState():void {
    const id=this.options.character.initialMountId;if(id===undefined)return;
    const actor=this.simulation.actor(this.options.character.instanceId);
    if(actor.vehicle?.spec.id!==id)throw new Error('HUMANOID_INITIAL_MOUNT_STATE_CHANGED');
    actor.validateInitialMount(id);
  }
  sealInitialState():void{
    this.assertExternalMutation();this.baselineProfile=this.exportProfile();
    // Engine seals after scene setup, before the first start/step/reset.
    if(!this.characterFacingPrepared&&true&&this.hasActor(this.options.character.instanceId)&&!this.simulation.actor(this.options.character.instanceId).vehicle){
      const actor=this.simulation.actor(this.options.character.instanceId),eye=this.camera.getWorldPosition(new THREE.Vector3()),direction=actor.player.position.clone().sub(eye);direction.y=0;
      if(direction.lengthSq()<1e-10){this.camera.getWorldDirection(direction);direction.y=0;}
      const yaw=this.options.character.facingYawRadians!==undefined?this.options.character.facingYawRadians+Math.PI:direction.lengthSq()<1e-10?Math.PI:Math.atan2(direction.x,direction.z);
      actor.player.yaw=yaw;actor.controller.facing.set(Math.sin(yaw),0,Math.cos(yaw));this.actors.get(actor.id)!.initialYaw=yaw;const object=this.actors.get(actor.id)!.object;object.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);object.updateWorldMatrix(true,true);this.presentation.snap(this.simulation);this.presentationDirty=true;
    }
    this.baselinePrimaryYaw=this.simulation.actors.get(this.options.character.instanceId)?.player.yaw;

  }
  episodeCapabilities():NonNullable<EpisodeCapabilities['humanoid']>{return {mapId:this.currentMap.id,characterInstanceId:this.inputActorId,vehicles:this.snapshot().vehicles.map(({instanceId,assetId,mode,aircraftSubtype,available})=>({instanceId,assetId,mode,aircraftSubtype,available})),inputAxes:['forward','steer','lift','roll','pitch','strafe','boost','brake','jump','slow','primary','secondary','actions']};}
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
    this.clearInputOwned();const config=start.humanoid;
    if(config?.vehicleInstanceId){
      const {candidate,index}=this.episodeCandidate({...start,positionWorldMetersXYZ:probe.resolvedPositionWorldMetersXYZ});Object.assign(this.simulation.vehicles[index]!,candidate);this.simulation.noteVehicleRelocation(candidate.spec.id);
      if(config.mounted===false){if(!this.approachOwned(config.vehicleInstanceId))throw new Error('HUMANOID_START_EXIT_BLOCKED');}
      else this.simulation.controlledActor.commitMountedStart(index);
    }else if(!this.prepareCharacterOwned(probe.resolvedPositionWorldMetersXYZ,start.facingYawRadians+Math.PI))throw new Error('HUMANOID_START_BLOCKED');
    this.simulation.controlledActor.teleportRevision++;this.sync(0);
  }
  private advanceOwned(input:WorldInput,dt:number,pointer:CameraPointerInput={},drives:Readonly<Record<string,CharacterDrive>>={},controlYawRadians?:number):void{
    this.assertLive();
    physicsHost(this.ordinaryPhysics).prepareStep(dt,Object.fromEntries(Object.entries(drives).filter(([id])=>!this.objects.has(id))));this.presentation.beforeStep(this.simulation);
    const sampled=input.humanoid??{...emptyInput(),forward:-(input.moveZRatio??0),steer:input.moveXRatio??0,lift:input.moveYRatio??0,boost:!!input.run,jump:input.jumpPressed??!!(input.jump&&!this.previousJump)};
    const actorInputs=new Map<string,ActorInput>(),aircraftDriven=new Set<string>();
    for(const [id,actor] of this.simulation.actors){
      const override=this.actorInputs.get(id),selected=id===this.simulation.controlledActorId;
      const semantic=this.aircraftInput(id,dt);if(semantic)aircraftDriven.add(id);
      const controls=semantic??override?.input??(selected?sampled:this.driveInput(id,drives[id]));
      if(selected&&!override&&!semantic&&(input.interactPressed??!!(input.interact&&!this.previousInteract)))actor.interact();
      actorInputs.set(id,{input:controls,yaw:selected||override?(controlYawRadians??Math.atan2(this.controlForwardWorldXYZ()[0],this.controlForwardWorldXYZ()[2])):0});
    }
    const recoverySequences=new Map([...this.simulation.actors].map(([id,actor])=>[id,actor.recovery?.sequence]));
    this.simulation.step(dt,actorInputs);
    for(const [id,value] of actorInputs)this.actorLastInputs.set(id,{input:structuredClone(value.input),source:aircraftDriven.has(id)?'aircraft-actions':this.actorInputs.get(id)?.source??(id===this.simulation.controlledActorId&&input.humanoid?'world.humanoid':'world-input'),simulationSeconds:this.simulation.time});
    for(const value of this.actorInputs.values())value.input={...value.input,jump:false,actions:{}};
    physicsHost(this.ordinaryPhysics).finishStep();this.presentationDirty=this.presentation.hasDiscontinuity(this.simulation);this.presentation.afterStep(this.simulation);this.sync(dt);
    this.previousJump=!!input.jump;this.previousInteract=!!input.interact;
    for(const [id,actor] of this.simulation.actors)if(actor.recovery?.status==='recovered'&&actor.recovery.sequence!==recoverySequences.get(id)){this.actorInputs.delete(id);this.actorLastInputs.delete(id);}
  }
  private sync(dt:number):void{
    for(const [id,intent] of this.aircraftIntents){const actor=this.simulation.actors.get(id);if(!actor||actor.vehicle!==intent.vehicle||actor.teleportRevision!==intent.revision)this.aircraftIntents.delete(id);}
    for(const v of this.simulation.vehicles){const object=this.objects.get(v.spec.id)!;object.position.copy(v.position);object.quaternion.copy(v.rotation);object.visible=this.simulation.available(v);}
    for(const [id,binding] of this.actors){
      const actor=this.simulation.actor(id),mounted=actor.vehicle,logical=this.logicalPose(id)!;
      binding.object.position.copy(logical.position);binding.object.quaternion.copy(logical.rotation);
      if(dt===0&&mounted?.motion.unicycle){const support=refreshUnicycleSupport(mounted,this.environment);if(!support||mounted.speed>UNICYCLE_TIMING.stoppedSpeed){mounted.motion.unicycle.footDown=0;mounted.motion.unicycle.phase=mounted.grounded?'riding':'airborne';}}
      const pose=readHumanoid(actor.controller)!;pose.mounted=mounted?mountedPose(mounted):null;
      pose.wearablePose=mounted?.motion.aircraft?.wearable?{spread:mounted.motion.aircraft.wearable.spread,seated:mounted.motion.aircraft.wearable.seated,landing:mounted.motion.aircraft.wearable.landingSeconds}:undefined;
      if(mounted&&pose.mounted==='wingsuit-ready')pose.speed=Math.hypot(mounted.velocity.x,mounted.velocity.z);
      const t=actor.dragonTransition;if(t)pose.dragonMount={progress:1-actor.transition/t.duration,entering:t.entering,side:t.side};
      if(mounted?.motion.kayak)pose.kayakPose={...mounted.motion.kayak};
      if(mounted?.motion.jetski)pose.atvSteeringAngle=mounted.motion.jetski.steeringAngle;
      if(mounted?.motion.unicycle)pose.unicyclePose=copyUnicycleState(mounted.motion.unicycle);
      if(mounted?.motion.atv)pose.atvSteeringAngle=mounted.motion.atv.steeringAngle;
      if(mounted?.motion.sled)pose.sledPose={...mounted.motion.sled};
      binding.animation?.update(dt,pose);binding.animation?.capturePresentationPose();if(dt===0)binding.animation?.capturePresentationPose();
    }
    for(const object of this.objects.values())object.updateWorldMatrix(true,true);
    if(dt===0){this.presentation.snap(this.simulation);this.presentationDirty=true;this.visualSample=undefined;}
    const display=this.presentation.sample(1,this.presentationEpoch,0,0);this.sampleHorses(display);
    this.options.vehicles.forEach((instance,index)=>instance.flyingVisual?.commit(display.vehicles[index]!,display.epoch,display.timeSeconds));
    this.alignHorseRiders();this.sampleSkiEquipment();
    if(dt===0)this.cameraRequests?.changed();
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
    if(actor){const mounted=actor.vehicle;return mounted&&!actor.dragonTransition?{position:mounted.position.clone().add(new THREE.Vector3(...mountedRiderOffset(mounted)).applyQuaternion(mounted.rotation)),rotation:mounted.rotation.clone()}:{position:actor.player.position.clone(),rotation:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),actor.player.yaw)};}
    const vehicle=this.simulation.vehicles.find(v=>v.spec.id===id);return vehicle?{position:vehicle.position.clone(),rotation:vehicle.rotation.clone()}:undefined;
  }
  private present(context:PresentationSampleContext,view:'world'|'object'='world'):()=>void {
    const tick=context.currentTick;
    if(context.cut||this.presentation.hasDiscontinuity(this.simulation))this.presentation.snap(this.simulation);
    this.presentationEpoch=context.epoch;this.presentationDirty=false;
    const sample=this.presentation.sample(context.alpha,context.epoch,context.previousTick,context.currentTick);
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
      restoreBody=this.actorAnimation(this.cameraTargetId)?.presentFirstPerson(view==='world'&&this.firstPerson);
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
      for(const [id,actor] of this.simulation.actors){if(actor.vehicleIndex<0||actor.dragonTransition)continue;const vehicle=sample.vehicles[actor.vehicleIndex]!,binding=this.actors.get(id)!;binding.object.position.copy(vehicle.position).add(new THREE.Vector3(...mountedRiderOffset(actor.vehicle!)).applyQuaternion(vehicle.rotation));binding.object.quaternion.copy(vehicle.rotation);}
      for(const object of this.objects.values())object.updateWorldMatrix(true,true);this.alignHorseRiders();this.sampleSkiEquipment();
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
    for(const [id,binding] of this.actors){if(simulation.environment.colliderForId(id))throw new Error('HUMANOID_PHYSICS_ID_CONFLICT');const mount=id===this.options.character.instanceId?this.options.character.initialMountId:undefined;const actor=simulation.addActor(id,binding.spawn==='map'?new THREE.Vector3(...simulation.environment.map.playerSpawn):binding.initialPosition,binding.initialYaw,mount!==undefined);if(binding.animation)actor.controller.setAvailableClips(binding.animation.availableHumanoidClips,binding.animation.motionSources);simulation.environment.colliderBindings.added(id,actor.controller.capsule);if(mount!==undefined)actor.initializeMounted(mount);}
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
    const mount=id===this.options.character.instanceId?this.options.character.initialMountId:undefined;
    const actor=this.simulation.addActor(id,position,yaw,prevalidated||mount!==undefined);
    try{if(animation)actor.controller.setAvailableClips(animation.availableHumanoidClips,animation.motionSources);this.environment.colliderBindings.added(id,actor.controller.capsule);if(mount!==undefined)actor.initializeMounted(mount);}
    catch(error){this.simulation.removeActor(id);throw error;}
    if(id===this.options.character.instanceId){
      const explicit=this.replacementPending?this.baselinePrimaryYaw:this.options.character.facingYawRadians!==undefined?this.options.character.facingYawRadians+Math.PI:undefined;
      if(explicit!==undefined&&!actor.vehicle){actor.player.yaw=explicit;actor.controller.facing.set(Math.sin(explicit),0,Math.cos(explicit));}
    }
    this.actors.set(id,{object,...(animation?{animation}:{}),...(binding.spawn?{spawn:binding.spawn}:{}),movement:{...movement},initialPosition:actor.player.position.clone(),initialYaw:actor.player.yaw});this.objects.set(id,object);
    this.configureSimulation(this.simulation,this.prepareProfile(this.profile));
    this.sync(0);
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
  remove(id:string):void{if(this.actors.has(id)){this.simulation.removeActor(id);this.aircraftIntents.delete(id);this.aircraftRejections.delete(id);this.actors.delete(id);this.objects.delete(id);this.actorInputs.delete(id);this.actorLastInputs.delete(id);}else this.ordinaryPhysics.remove(id);}
  validateBatch(candidates:readonly PhysicsCandidate[],removed:readonly string[]=[]):void{
    if(candidates.some(c=>this.objects.has(c.id))||removed.some(id=>this.objects.has(id)&&!this.actors.has(id)))throw new Error('HUMANOID_USE_RUNTIME_COMMANDS');
    this.assertRigidIds(candidates.map(candidate=>candidate.id));
    this.ordinaryPhysics.validateBatch(candidates,removed);
  }
  refresh(id:string):void{this.ordinaryPhysics.refresh(id);}
  refreshMany(ids:readonly string[]):void{this.ordinaryPhysics.refreshMany(ids);}
  setEnabled(id:string,enabled:boolean):void{this.ordinaryPhysics.setEnabled(id,enabled);}
  teleport(id:string,position:Vec3):void{this.assertExternalMutation();this.teleportOwned(id,position);}
  private teleportOwned(id:string,position:Vec3):void{
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

    this.sync(0);
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
    this.lifecycleGeneration++;this.simulation.dispose();this.currentSimulation=staged!;this.environment=replacement;this.commitProfile(profile);previous.dispose();this.clearInputOwned();
    this.replacementPending=true;
    if(this.actors.size)this.finishResetOwned();
  }
  dispose():void{if(this.disposed)return;this.clearInputOwned();this.episodeOwned=false;this.disposed=true;this.cameraGeometry.dispose();this.visualUpdates.clear();this.simulationReplacements.clear();this.simulation.dispose();this.releaseOrdinarySubstep();this.ordinaryPhysics.dispose();this.environment.dispose();if(this.releaseCharacterOwnership){try{this.options.character.animation?.dispose();}finally{this.releaseCharacterOwnership();this.releaseCharacterOwnership=undefined;}}for(const vehicle of this.options.vehicles){disposeSubmersibleVisual(vehicle.object);disposeJetSkiVisual(vehicle.object);vehicle.visual?.dispose();vehicle.flyingVisual?.dispose();}}
}
