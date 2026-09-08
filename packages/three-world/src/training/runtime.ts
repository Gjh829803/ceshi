import * as THREE from 'three';
import { Simulation, emptyInput, createVehicle, resolveVehicleSpec, type Input } from './simulation';
import { canPlaceCreature, resetCreatureState } from './creatures/controller';
import { EnvironmentQueries, initEnvironmentQueries, PLAYER_BODY, vehicleBody } from './environment/queries';
import { FollowCamera } from './camera';
import { Character } from './character';
import { readHumanoid } from './humanoid/render-state';
import { readInteractionTargets } from './humanoid/render-state';
import type { MapDefinition, MapSpawn } from './environment/types';
import type { VehicleSpec } from './config';
import {CONTROL_RANGES,CONTROL_SCHEMA_PROPERTIES,parseTrainingControl,readTrainingControl,type TrainingControl} from './control-tuning';
import type { CameraTuning } from './platform/session';
import { parseCameraTuning, DEFAULT_CAMERA_TUNING } from './platform/session';
import { validateTrainingMap } from './map-validation';
import { DEFAULT_CHARACTER_OPTIONS } from '../physics';
import type { PhysicsPort, PhysicsCandidate, CharacterOptions, RigidPhysics, Vec3, WorldInput, PhysicsEntityState, PhysicsAudit } from '../engine-contracts';
import type { EpisodeStartProbe, EpisodeStart, EpisodeCapabilities } from '../episode-contracts';
import type { CameraRigInput } from '../camera';
import type { SkillRequest, SkillResult } from './humanoid/action-schema';

export type TrainingCommand =
 | {readonly type:'training.prepare';readonly instanceId:string;readonly spawn:MapSpawn}
 | {readonly type:'training.approach'|'training.enter';readonly instanceId:string}
 | {readonly type:'training.exit'}
 | {readonly type:'training.camera';readonly mode:0|1|2}
 | {readonly type:'training.input';readonly input:Input|null}
 | {readonly type:'training.profile';readonly profile:TrainingProfile}
 | {readonly type:'training.action';readonly request:SkillRequest};
export function isTrainingCommand(command:{type:string}):command is TrainingCommand{return command.type.startsWith('training.');}

export interface TrainingVehicleInstance {
  readonly instanceId:string;
  readonly assetId:string;
  readonly spec:VehicleSpec;
  readonly object:THREE.Object3D;
}
export interface TrainingOptions {
  readonly map:MapDefinition;
  readonly vehicles:readonly TrainingVehicleInstance[];
  readonly character:{readonly instanceId:string;readonly object:THREE.Object3D;readonly animation?:Character};
  readonly cameraTuning?:Partial<CameraTuning>;
}
export interface TrainingProfile {
  readonly cameraDistanceMeters?:number|null;
  readonly character?:Partial<TrainingControl>;
  readonly camera?:Partial<CameraTuning>;
  readonly vehicles?:Readonly<Record<string,Partial<TrainingControl & {camera:number}>>>;
}
export interface TrainingSnapshot {
  readonly controls:{readonly character:TrainingControl;readonly vehicles:Readonly<Record<string,TrainingControl>>};
  readonly mapId:string;readonly timeSeconds:number;readonly cameraMode:0|1|2;
  readonly mountedInstanceId:string|null;readonly message:string;
  /** Latest controller sample, copied without issuing another physics query. */
  readonly water:{readonly declaredVolumeCount:number;readonly controllerActive:boolean;readonly swimming:boolean;readonly contact:{
    readonly volumeId:string;readonly surfaceHeightMeters:number;readonly depthMeters:number;readonly submersionRatio:number;
    readonly feetBelowSurfaceMeters:number;readonly requiredDepthMeters:number;readonly requiredFeetBelowSurfaceMeters:number;
    readonly depthCheckPassed:boolean;readonly immersionCheckPassed:boolean;readonly wasSwimmingAtSample:boolean;
    readonly entrySpeedMetersPerSecond:number;readonly entrySerial:number;
  }|null};
  readonly character:{readonly instanceId:string;readonly state:string;readonly swimming:boolean;readonly stance:string;readonly carrying:string|null;readonly seated:string|null;readonly activeAction:{readonly requestId:string;readonly action:string;readonly phase:string;readonly elapsedSeconds:number}|null};
  readonly vehicles:readonly {readonly instanceId:string;readonly assetId:string;readonly mode:VehicleSpec['mode'];readonly available:boolean;readonly speedMetersPerSecond:number;readonly throttle:number;readonly steering:number;readonly grounded:boolean;readonly submerged:boolean}[];
  readonly transition:{readonly kind:''|'enter'|'exit';readonly remainingSeconds:number};
  readonly traversal:{readonly kind:string;readonly phase:string;readonly progress:number;readonly elapsedSeconds:number;readonly durationSeconds:number;readonly sourceActionId:string}|null;
  readonly surface:{readonly mode:string;readonly surfaceId:string|null;readonly pose:{readonly actionId:string;readonly timeSeconds:number;readonly phase:string}|null};
  readonly interactionTargets:readonly {readonly id:string;readonly kind:'pickup'|'seat';readonly state:string;readonly positionWorldMetersXYZ:Vec3;readonly rotationWorldQuaternionXYZW:readonly [number,number,number,number]}[];
  readonly vehicleDynamics:readonly {readonly instanceId:string;readonly launched:boolean;readonly pitchRadians:number;readonly rollRadians:number;readonly creature:{readonly gait:string;readonly phase:number;readonly flying:boolean;readonly leadPositionWorldMetersXYZ:Vec3|null;readonly leadYawRadians:number|null}|null}[];
}
const tuple=(v:THREE.Vector3):Vec3=>[v.x,v.y,v.z];

/** SDK-owned actor solver. The engine supplies every fixed tick and owns rendering. */
export class TrainingRuntime implements PhysicsPort {
  environment:EnvironmentQueries;
  readonly simulation:Simulation;
  readonly followCamera:FollowCamera;
  private input:Input|undefined;
  private inputGeneration=0;
  private readonly objects=new Map<string,THREE.Object3D>();
  private readonly specs:VehicleSpec[];
  private disposed=false;
  private authored=false;
  private previousJump=false;
  private previousInteract=false;
  private baselineProfile:TrainingProfile={};
  private profile:TrainingProfile={};
  private readonly initialCamera:THREE.PerspectiveCamera;
  private readonly baseTuning:CameraTuning;
  private currentMap:MapDefinition;
  private readonly visualUpdates=new Set<(deltaSeconds:number)=>void>();
  private readonly simulationReplacements=new Set<()=>void>();
  static async create(options:TrainingOptions,camera:THREE.Camera):Promise<TrainingRuntime>{
    validateTrainingMap(options.map);
    if(Object.keys(options.cameraTuning??{}).some(k=>!Object.hasOwn(DEFAULT_CAMERA_TUNING,k)))throw new Error('TRAINING_PROFILE_INVALID');
    parseCameraTuning({...DEFAULT_CAMERA_TUNING,...options.cameraTuning});
    if(!(camera instanceof THREE.PerspectiveCamera))throw new Error('TRAINING_PERSPECTIVE_CAMERA_REQUIRED');
    const ids=[options.character.instanceId,...options.vehicles.map(v=>v.instanceId)];
    if(new Set(ids).size!==ids.length||ids.some(id=>!id.trim()))throw new Error('TRAINING_INSTANCE_ID_INVALID');
    for(const vehicle of options.vehicles)resolveVehicleSpec(vehicle.spec);
    await initEnvironmentQueries();return new TrainingRuntime(options,camera);
  }
  private constructor(readonly options:TrainingOptions,readonly camera:THREE.PerspectiveCamera){
    this.currentMap=options.map;
    this.specs=options.vehicles.map(v=>({...structuredClone(v.spec),id:v.instanceId}));
    this.environment=new EnvironmentQueries(this.instanceMap(options.map));
    this.simulation=new Simulation(this.environment,this.specs);
    this.followCamera=new FollowCamera(camera,[],this.environment);
    this.followCamera.tuning=parseCameraTuning({...DEFAULT_CAMERA_TUNING,...options.cameraTuning});this.baseTuning={...this.followCamera.tuning};this.initialCamera=camera.clone();
    this.profile={character:{...this.simulation.characterControl},camera:{...this.baseTuning},vehicles:Object.fromEntries(this.simulation.vehicles.map(v=>[v.spec.id,{...readTrainingControl(v.spec),camera:v.spec.camera}]))};
    this.objects.set(options.character.instanceId,options.character.object);
    for(const v of options.vehicles)this.objects.set(v.instanceId,v.object);
    const animation=options.character.animation;
    if(animation)this.simulation.setHumanoidAssets(animation.availableHumanoidClips,animation.motionSources);
    this.sync(0);this.followCamera.reset(this.simulation);
  }
  private instanceMap(map:MapDefinition):MapDefinition {
    return {...map,spawns:map.spawns.flatMap(spawn=>{
      const match=this.options.vehicles.filter(v=>v.spec.id===spawn.vehicleId||v.assetId===spawn.vehicleId||v.instanceId===spawn.vehicleId);
      // Each asset's first instance inherits the authored slot. Duplicates use explicit preparation.
      return match.length?[{...spawn,vehicleId:match[0]!.instanceId}]:[spawn];
    })};
  }
  get cameraMode():'authored'|'follow'{return this.authored?'authored':'follow';}
  command(command:TrainingCommand):SkillResult|undefined{
    const fields:Record<TrainingCommand['type'],readonly string[]>={'training.prepare':['instanceId','spawn'],'training.approach':['instanceId'],'training.enter':['instanceId'],'training.exit':[],'training.camera':['mode'],'training.input':['input'],'training.profile':['profile'],'training.action':['request']};
    if(!Object.hasOwn(fields,command.type)||Object.keys(command).some(k=>k!=='type'&&!fields[command.type].includes(k)))throw new Error('TRAINING_COMMAND_INVALID');
    let accepted=true;
    switch(command.type){
      case 'training.prepare':if(!command.spawn||!Array.isArray(command.spawn.position)||command.spawn.position.length!==3||command.spawn.position.some(n=>!Number.isFinite(n))||!Number.isFinite(command.spawn.yaw))throw new Error('TRAINING_SPAWN_INVALID');accepted=this.prepare(command.instanceId,command.spawn);break;
      case 'training.approach':accepted=this.approach(command.instanceId);break;
      case 'training.enter':accepted=this.enter(command.instanceId);break;
      case 'training.exit':accepted=this.exit();break;
      case 'training.camera':this.setCameraMode(command.mode);break;
      case 'training.input':this.setInput(command.input??undefined);break;
      case 'training.profile':this.applyProfile(command.profile);break;
      case 'training.action':{const result=this.simulation.humanoid?.skills.request(command.request);if(!result)throw new Error('TRAINING_CHARACTER_UNAVAILABLE');return result;}
    }
    if (!accepted) {
      const interaction = command.type === 'training.enter' || command.type === 'training.exit';
      const code = interaction ? this.simulation.failureCode ?? 'TRAINING_COMMAND_BLOCKED' : 'TRAINING_COMMAND_BLOCKED';
      throw new Error(`${code}: ${this.simulation.message}`);
    }
  }
  commandDescriptors(id:string):import('../contracts').CommandDescriptor[]{
    const vec={type:'array',items:{type:'number'},minItems:3,maxItems:3};
    const object=(properties:Record<string,import('../contracts').JsonValue>,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
    const input=object(Object.fromEntries([...['forward','steer','lift','roll','pitch','strafe'].map(k=>[k,{type:'number',minimum:-1,maximum:1}]),...['boost','brake','jump','slow'].map(k=>[k,{type:'boolean'}]),['humanoid',{type:'object',additionalProperties:{type:'boolean'}}]]) as Record<string,import('../contracts').JsonValue>,['forward','steer','lift','roll','pitch','strafe','boost','brake','jump','slow']);
    const create=(type:TrainingCommand['type'],properties:Record<string,import('../contracts').JsonValue>):import('../contracts').CommandDescriptor=>({type,isAvailable:true,schema:object({type:{const:type},...properties})});
    if(id!==this.options.character.instanceId)return [create('training.prepare',{instanceId:{const:id},spawn:object({id:{type:'string'},name:{type:'string'},position:vec,yaw:{type:'number'},regionId:{type:'string'},vehicleId:{type:'string'}},['id','name','position','yaw','regionId'])}),create('training.approach',{instanceId:{const:id}}),create('training.enter',{instanceId:{const:id}})];
    const profile=object({character:object(CONTROL_SCHEMA_PROPERTIES,[]),vehicles:{type:'object',additionalProperties:object({...CONTROL_SCHEMA_PROPERTIES,camera:{type:'number',minimum:0}},[])},cameraDistanceMeters:{anyOf:[{type:'number',exclusiveMinimum:0,maximum:100},{type:'null'}]},camera:{type:'object',description:'Partial CameraTuning; validated by the camera owner.'}},[]);
    return [create('training.exit',{}),create('training.camera',{mode:{enum:[0,1,2]}}),create('training.input',{input:{anyOf:[input,{type:'null'}]}}),create('training.profile',{profile}),create('training.action',{request:object({requestId:{type:'string'},action:{enum:['roll','slide','pickup','putDown','sit','standUp']},targetId:{type:'string'}},['requestId','action'])})];
  }
  snapshot():TrainingSnapshot{
    const s=this.simulation,h=s.humanoid,tr=h?.traversal,surface=h?.surface;
    const waterControllerActive=Boolean(h&&!s.vehicle&&!tr),contact=waterControllerActive?h?.water:null;
    return {
      controls:{character:readTrainingControl(s.characterControl),vehicles:Object.fromEntries(s.vehicles.map(v=>[v.spec.id,readTrainingControl(v.spec)]))},
      mapId:this.currentMap.id,timeSeconds:s.time,cameraMode:this.followCamera.mode as 0|1|2,mountedInstanceId:s.vehicle?.spec.id??null,message:s.message,
      water:{declaredVolumeCount:this.currentMap.water.length,controllerActive:waterControllerActive,swimming:waterControllerActive&&Boolean(h?.swimming),
        contact:contact?{volumeId:contact.volumeId,surfaceHeightMeters:contact.surfaceY,depthMeters:contact.depth,submersionRatio:contact.submersion,
          feetBelowSurfaceMeters:contact.feetBelowSurfaceMeters,requiredDepthMeters:contact.requiredDepthMeters,requiredFeetBelowSurfaceMeters:contact.requiredFeetBelowSurfaceMeters,
          depthCheckPassed:contact.depthCheckPassed,immersionCheckPassed:contact.immersionCheckPassed,wasSwimmingAtSample:contact.wasSwimmingAtSample,
          entrySpeedMetersPerSecond:contact.entrySpeed,entrySerial:contact.entrySerial}:null},
      character:{instanceId:this.options.character.instanceId,state:h?.state??s.player.animation,swimming:!s.vehicle&&s.player.swimming,stance:h?.stance??'stand',carrying:h?.skills.carrying??null,seated:h?.skills.seated??null,activeAction:h?.skills.active?{requestId:h.skills.active.requestId,action:h.skills.active.id,phase:h.skills.active.phase,elapsedSeconds:h.skills.active.elapsed}:null},
      vehicles:s.vehicles.map((v,i)=>({instanceId:v.spec.id,assetId:this.options.vehicles[i]!.assetId,mode:v.spec.mode,available:s.available(v),speedMetersPerSecond:v.velocity.length(),throttle:v.throttle,steering:v.steering,grounded:v.grounded,submerged:v.submerged})),
      transition:{kind:s.transitionKind,remainingSeconds:s.transition},
      traversal:tr?{kind:tr.probe.kind,phase:tr.phase,progress:tr.progress,elapsedSeconds:tr.elapsed,durationSeconds:tr.duration,sourceActionId:tr.motion.sourceId}:null,
      surface:{mode:surface?.mode??'none',surfaceId:surface?.surface?.id??null,pose:surface?.pose?{actionId:surface.pose.key,timeSeconds:surface.pose.time,phase:surface.pose.phase??''}:null},
      interactionTargets:readInteractionTargets(h).map(t=>({id:t.id,kind:t.kind,state:t.state,positionWorldMetersXYZ:tuple(t.position),rotationWorldQuaternionXYZW:t.rotation?[t.rotation.x,t.rotation.y,t.rotation.z,t.rotation.w]:[0,0,0,1]})),
      vehicleDynamics:s.vehicles.map(v=>({instanceId:v.spec.id,launched:v.launched,pitchRadians:v.pitch,rollRadians:v.roll,creature:v.creature?{gait:v.creature.gait,phase:v.creature.phase,flying:v.creature.flying,leadPositionWorldMetersXYZ:v.creature.leadPosition?tuple(v.creature.leadPosition):null,leadYawRadians:v.creature.leadYaw??null}:null})),
    };
  }
  actionIds(id:string):readonly string[]{return id===this.options.character.instanceId?[...this.options.character.animation?.availableHumanoidClips??[]]:[];}
  animationState(id:string):import('../contracts').EntityState['animation']{if(id!==this.options.character.instanceId)return;const source=this.options.character.animation?.sourceCharacter;if(!source)return;const key=Object.keys(source.weights).sort((a,b)=>(source.weights[b]??0)-(source.weights[a]??0))[0];if(!key||!source.actions[key])return;const action=source.actions[key];return {actionId:key,clipName:action.getClip().name,timeSeconds:action.time};}
  cameraSnapshot():import('../contracts').CameraState{const c=this.followCamera,q=this.camera.quaternion;return {mode:this.cameraMode,positionWorldMetersXYZ:tuple(this.camera.position),orientationWorldQuaternionXYZW:[q.x,q.y,q.z,q.w],desiredPositionWorldMetersXYZ:tuple(c.desiredPosition),desiredYawRadians:c.yaw,desiredPitchRadians:c.pitch,desiredArmDistanceMeters:c.distance,actualArmDistanceMeters:c.target.distanceTo(this.camera.position),collisionPhase:c.collisionLimited?'constrained':'clear'};}
  useAuthoredCamera():void{this.authored=true;}
  setCameraMode(mode:0|1|2):void{if(![0,1,2].includes(mode))throw new Error('TRAINING_CAMERA_MODE_INVALID');this.authored=false;this.followCamera.mode=mode;this.followCamera.initialized=false;}
  validateInput(input:Input):void{for(const key of ['forward','steer','lift','roll','pitch','strafe'] as const)if(typeof input[key]!=='number'||!Number.isFinite(input[key])||Math.abs(input[key])>1)throw new Error('TRAINING_INPUT_INVALID');for(const key of ['boost','brake','jump','slow'] as const)if(typeof input[key]!=='boolean')throw new Error('TRAINING_INPUT_INVALID');if(input.humanoid&&Object.values(input.humanoid).some(v=>typeof v!=='boolean'))throw new Error('TRAINING_INPUT_INVALID');}
  setInput(input:Input):()=>void;
  setInput(input:undefined):void;
  setInput(input:Input|undefined):(()=>void)|void;
  setInput(input:Input|undefined):(()=>void)|void{if(input===undefined){this.input=undefined;this.inputGeneration++;return;}this.validateInput(input);const generation=++this.inputGeneration;this.input={...input,humanoid:{...input.humanoid}};return()=>{if(this.inputGeneration===generation){this.input=undefined;this.inputGeneration++;}};}
  clearInput():void{this.setInput(undefined);this.previousJump=false;this.previousInteract=false;}
  private index(id:string):number{const n=this.options.vehicles.findIndex(v=>v.instanceId===id);if(n<0)throw new Error(`TRAINING_INSTANCE_UNKNOWN: ${id}`);return n;}
  prepare(id:string,spawn:MapSpawn):boolean{const ok=this.simulation.prepare(this.index(id),spawn);this.sync(0);return ok;}
  approach(id:string):boolean{this.index(id);const ok=this.simulation.approach(id);this.sync(0);return ok;}
  interact():boolean{const ok=this.simulation.interact();if(ok)this.sync(0);return ok;}
  enter(id:string):boolean{const ok=this.simulation.enter(id);if(ok)this.sync(0);return ok;}
  exit():boolean{const ok=this.simulation.exit();if(ok)this.sync(0);return ok;}
  prepareCharacter(position:Vec3,yaw=0):boolean{const ok=this.simulation.prepareCharacter(new THREE.Vector3(...position),yaw);this.sync(0);return ok;}
  private prepareProfile(profile:TrainingProfile):TrainingProfile & {camera:CameraTuning;character:TrainingControl;vehicles:Record<string,TrainingControl & {camera:number}>;cameraDistanceMeters:number|null}{
    const object=(value:unknown)=>!!value&&typeof value==='object'&&!Array.isArray(value);
    if(!object(profile)||Object.keys(profile).some(k=>!['character','camera','vehicles','cameraDistanceMeters'].includes(k)))throw new Error('TRAINING_PROFILE_INVALID');
    for(const section of [profile.character,profile.camera,profile.vehicles])if(section!==undefined&&!object(section))throw new Error('TRAINING_PROFILE_INVALID');
    if(Object.keys(profile.camera??{}).some(k=>!Object.hasOwn(DEFAULT_CAMERA_TUNING,k)))throw new Error('TRAINING_PROFILE_INVALID');
    for(const [id,values] of Object.entries(profile.vehicles??{})){this.index(id);if(!object(values)||Object.keys(values).some(k=>k!=='camera'&&!Object.hasOwn(CONTROL_RANGES,k)))throw new Error('TRAINING_PROFILE_INVALID');}
    const camera=parseCameraTuning({...this.followCamera.tuning,...profile.camera});
    const character=parseTrainingControl(profile.character??{},this.simulation.characterControl);
    const vehicles=Object.fromEntries(this.simulation.vehicles.map(v=>{const {camera=v.spec.camera,...control}=profile.vehicles?.[v.spec.id]??{};return [v.spec.id,{...parseTrainingControl(control,readTrainingControl(v.spec)),camera}];}));
    const numbers=[...Object.values(character),...Object.values(vehicles).flatMap(v=>Object.values(v))];
    if(numbers.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))throw new Error('TRAINING_PROFILE_INVALID');
    const cameraDistanceMeters=profile.cameraDistanceMeters===undefined?this.followCamera.baseDistance??null:profile.cameraDistanceMeters;
    if(cameraDistanceMeters!==null&&(!Number.isFinite(cameraDistanceMeters)||cameraDistanceMeters<=0||cameraDistanceMeters>100))throw new Error('TRAINING_PROFILE_INVALID');
    return {cameraDistanceMeters,character,camera,vehicles};
  }
  private configureSimulation(simulation:Simulation,profile:ReturnType<TrainingRuntime['prepareProfile']>):void{
    simulation.characterControl={...profile.character};
    const h=simulation.humanoid,c=simulation.characterControl;if(h)h.movementTuning={speedScale:c.speed/3.8,accelerationScale:c.accel/12,airControlScale:c.grip/3,turnScale:c.steer/14,maxSpeed:c.maxSpeed,slowSpeed:c.slowSpeed,coastDeceleration:c.coastDeceleration,jumpSpeed:c.jumpSpeed};
    for(const v of simulation.vehicles)Object.assign(v.spec,profile.vehicles[v.spec.id]);
  }
  private commitProfile(profile:ReturnType<TrainingRuntime['prepareProfile']>):void{
    this.configureSimulation(this.simulation,profile);this.followCamera.tuning={...profile.camera};
    if(profile.cameraDistanceMeters===null)delete this.followCamera.baseDistance;else this.followCamera.baseDistance=profile.cameraDistanceMeters;
    this.profile=structuredClone(profile);this.baselineProfile=structuredClone(profile);
  }
  applyProfile(profile:TrainingProfile):void{this.commitProfile(this.prepareProfile(profile));}
  exportProfile():TrainingProfile{return structuredClone(this.profile);}
  onVisualUpdate(callback:(deltaSeconds:number)=>void):()=>void{this.visualUpdates.add(callback);return()=>{this.visualUpdates.delete(callback);};}
  onSimulationReplaced(callback:()=>void):()=>void{this.simulationReplacements.add(callback);return()=>{this.simulationReplacements.delete(callback);};}
  switchMap(map:MapDefinition):void{
    const profile=this.prepareProfile(this.profile);validateTrainingMap(map);
    const replacement=new EnvironmentQueries(this.instanceMap(map));
    const previous=this.environment;
    let staged:Simulation;try{staged=this.simulation.prepareEnvironment(replacement);this.configureSimulation(staged,profile);}catch(error){replacement.dispose();throw error;}
    this.simulation.adoptEnvironment(staged);this.currentMap=map;this.environment=replacement;this.followCamera.environment=replacement;this.commitProfile(profile);previous.dispose();
    for(const notify of this.simulationReplacements)notify();
    this.clearInput();this.followCamera.reset(this.simulation);this.sync(0);
  }
  sealInitialState():void{this.baselineProfile=this.exportProfile();}
  episodeCapabilities():NonNullable<EpisodeCapabilities['training']>{return {mapId:this.currentMap.id,characterInstanceId:this.options.character.instanceId,vehicles:this.snapshot().vehicles.map(({instanceId,assetId,mode,available})=>({instanceId,assetId,mode,available})),cameraModes:[0,1,2],inputAxes:['forward','steer','lift','roll','pitch','strafe','boost','brake','jump','slow','humanoid']};}
  private episodeCandidate(start:EpisodeStart){
    const config=start.training!,index=this.index(config.vehicleInstanceId!),current=this.simulation.vehicles[index]!;
    if(!this.simulation.available(current))throw new Error('TRAINING_VEHICLE_UNAVAILABLE');
    const candidate=createVehicle(current.spec);candidate.position.set(...start.positionWorldMetersXYZ);candidate.yaw=start.facingYawRadians+Math.PI;candidate.pitch=config.pitchRadians??0;candidate.roll=config.rollRadians??0;
    candidate.rotation.setFromEuler(new THREE.Euler(-candidate.pitch,candidate.yaw,candidate.roll,'YXZ'));
    if(config.velocityWorldMetersPerSecondXYZ)candidate.velocity.set(...config.velocityWorldMetersPerSecondXYZ);
    candidate.speed=candidate.velocity.length();candidate.throttle=config.throttle??0;candidate.launched=config.launched??candidate.speed>0;
    const floor=this.environment.support(candidate.position,.15,.1);candidate.grounded=!!floor&&Math.abs(floor.height-candidate.position.y)<.15;candidate.submerged=!!this.environment.waterAt(candidate.position)&&candidate.spec.mode==='sub';
    resetCreatureState(candidate);if(candidate.creature&&config.launched)candidate.creature.flying=true;
    return {candidate,index};
  }
  probeEpisodeStart(start:EpisodeStart):EpisodeStartProbe{
    const config=start.training;
    if(config){
      for(const value of [config.pitchRadians,config.rollRadians,config.throttle])if(value!==undefined&&!Number.isFinite(value))throw new Error('TRAINING_START_INVALID');
      if(config.throttle!==undefined&&(config.throttle<0||config.throttle>1))throw new Error('TRAINING_START_INVALID');
      if(config.cameraMode!==undefined&&![0,1,2].includes(config.cameraMode))throw new Error('TRAINING_START_INVALID');
      if(config.velocityWorldMetersPerSecondXYZ&&(!Array.isArray(config.velocityWorldMetersPerSecondXYZ)||config.velocityWorldMetersPerSecondXYZ.length!==3||config.velocityWorldMetersPerSecondXYZ.some(v=>!Number.isFinite(v))))throw new Error('TRAINING_START_INVALID');
    }
    if(!config?.vehicleInstanceId)return this.probeCharacterStart(this.options.character.instanceId,start.positionWorldMetersXYZ);
    const {candidate,index}=this.episodeCandidate(start),q=this.environment,safe=q.safeSpawn(candidate.position,vehicleBody(candidate.spec),candidate.rotation);
    let valid=!!safe&&safe.distanceTo(candidate.position)<=.35;
    if(safe)candidate.position.copy(safe);
    valid=valid&&canPlaceCreature(candidate,q);
    if(['boat','sub'].includes(candidate.spec.mode))valid=valid&&q.waterContains(candidate.position,candidate.spec.radius);
    // Start relocation cannot overwrite another parked actor's occupied envelope.
    valid=valid&&!this.simulation.vehicles.some((v,i)=>i!==index&&this.simulation.available(v)&&Math.abs(v.position.y-candidate.position.y)<2&&Math.hypot(v.position.x-candidate.position.x,v.position.z-candidate.position.z)<v.spec.radius+candidate.spec.radius);
    return {isValid:valid,requestedPositionWorldMetersXYZ:start.positionWorldMetersXYZ,resolvedPositionWorldMetersXYZ:tuple(candidate.position),diagnostics:valid?[]:[{code:'TRAINING_START_BLOCKED',message:'The full vehicle envelope, medium or another actor blocks this start.'}]};
  }
  prepareEpisodeStart(start:EpisodeStart):void{
    const probe=this.probeEpisodeStart(start);if(!probe.isValid)throw new Error('TRAINING_START_BLOCKED');
    this.clearInput();const config=start.training;
    if(config?.vehicleInstanceId){
      const {candidate,index}=this.episodeCandidate({...start,positionWorldMetersXYZ:probe.resolvedPositionWorldMetersXYZ});Object.assign(this.simulation.vehicles[index]!,candidate);
      if(config.mounted===false){if(!this.approach(config.vehicleInstanceId))throw new Error('TRAINING_START_EXIT_BLOCKED');}
      else{if(!this.simulation.humanoid?.setMounted(true))throw new Error('TRAINING_START_MOUNT_BLOCKED');this.simulation.active=index;this.simulation.transition=0;this.simulation.transitionKind='';this.simulation.player.position.copy(candidate.position);this.simulation.player.yaw=candidate.yaw;}
    }else if(!this.prepareCharacter(probe.resolvedPositionWorldMetersXYZ,start.facingYawRadians+Math.PI))throw new Error('TRAINING_START_BLOCKED');
    this.simulation.teleportRevision++;this.setCameraMode(config?.cameraMode??0);this.followCamera.reset(this.simulation);this.sync(0);
  }
  advance(input:WorldInput,dt:number,pointer:CameraRigInput={}):void{
    if(this.disposed)throw new Error('TRAINING_DISPOSED');
    const controls=this.input??input.training??{...emptyInput(),forward:-(input.moveZRatio??0),steer:input.moveXRatio??0,lift:input.moveYRatio??0,boost:!!input.run,jump:input.jumpPressed??!!(input.jump&&!this.previousJump)};
    if(!this.input&&(input.interactPressed??!!(input.interact&&!this.previousInteract)))this.interact();
    // WorldKeyboard already expresses yaw as a signed angle. Convert back to
    // source orbit units once so drag limits and manual-recenter grace agree.
    if(pointer.yawDeltaRadians||pointer.pitchDeltaRadians)this.followCamera.orbit(-(pointer.yawDeltaRadians??0)/.004,(pointer.pitchDeltaRadians??0)/.004,this.simulation.time,this.simulation);
    if(pointer.distanceDeltaMeters)this.followCamera.scroll(pointer.distanceDeltaMeters/.007,this.simulation);
    if(input.cameraYawRatio||input.cameraPitchRatio){
      const pitchScale=this.simulation.vehicle?.003:.004;
      this.followCamera.orbit(-(input.cameraYawRatio??0)*dt*1.2/.004,(input.cameraPitchRatio??0)*dt/pitchScale,this.simulation.time,this.simulation);
    }
    this.simulation.step(controls,dt,this.followCamera.yaw);this.sync(dt);
    if(!this.authored)this.followCamera.update(this.simulation,dt);
    this.previousJump=!!input.jump;this.previousInteract=!!input.interact;
    // One-shot commands are consumed exactly once even during multi-tick frames.
    if(this.input)this.input={...this.input,jump:false,humanoid:{}};
  }
  private sync(dt:number):void {
    for(const v of this.simulation.vehicles){const object=this.objects.get(v.spec.id)!;object.position.copy(v.position);object.quaternion.copy(v.rotation);object.visible=this.simulation.available(v);}
    const p=this.simulation.player,object=this.options.character.object;
    object.position.copy(p.position);object.rotation.set(0,p.yaw,0);
    const mounted=this.simulation.vehicle;
    if(mounted){object.position.copy(mounted.position).add(new THREE.Vector3(...mounted.spec.seat).applyQuaternion(mounted.rotation));object.quaternion.copy(mounted.rotation);}
    const pose=readHumanoid(this.simulation.humanoid);
    if(pose)pose.mounted=mounted?(mounted.spec.characterPose==='stand'?'stand':mounted.spec.characterPose==='ride'?'ride':'drive'):null;
    this.options.character.animation?.update(dt,p.animation,p.velocity.length(),!!mounted,mounted?.spec.characterPose==='ride',pose);
    for(const object of this.objects.values())object.updateWorldMatrix(true,true);
    for(const update of this.visualUpdates)update(dt);
  }
  state(id:string):PhysicsEntityState|undefined{
    if(id===this.options.character.instanceId){const p=this.simulation.player,h=this.simulation.humanoid,contacts:string[]=[];if(h&&!this.simulation.vehicle)for(let i=0;i<h.controller.numComputedCollisions();i++){const collision=h.controller.computedCollision(i);if(collision?.collider)contacts.push(this.environment.colliderId(collision.collider.handle));}return {id,positionMetersXYZ:tuple(this.options.character.object.position),velocityMetersPerSecondXYZ:tuple(this.simulation.vehicle?.velocity??p.velocity),isGrounded:this.simulation.vehicle?.grounded??p.grounded,collisionEntityIds:[...new Set(contacts)]};}
    const v=this.simulation.vehicles.find(v=>v.spec.id===id);return v?{id,positionMetersXYZ:tuple(v.position),velocityMetersPerSecondXYZ:tuple(v.velocity),isGrounded:v.grounded,collisionEntityIds:[]}:undefined;
  }
  addCharacter(id:string,object:THREE.Object3D,_options?:CharacterOptions):void{if(!this.objects.has(id)||this.objects.get(id)!==object)throw new Error('TRAINING_CONTENT_REGISTER_IN_OPTIONS');}
  addRigid(id:string,object:THREE.Object3D,_options:RigidPhysics):void{this.addCharacter(id,object);}
  remove(_id:string):void{}
  validateBatch(candidates:readonly PhysicsCandidate[],removed:readonly string[]=[]):void{if(candidates.length||removed.length)throw new Error('TRAINING_USE_RUNTIME_COMMANDS');}
  refresh(_id:string):void{throw new Error('TRAINING_USE_RUNTIME_COMMANDS');}
  refreshMany(ids:readonly string[]):void{if(ids.length)throw new Error('TRAINING_USE_RUNTIME_COMMANDS');}
  setEnabled(_id:string,_enabled:boolean):void{throw new Error('TRAINING_USE_RUNTIME_COMMANDS');}
  teleport(id:string,position:Vec3):void{if(id!==this.options.character.instanceId||!this.prepareCharacter(position,this.simulation.player.yaw))throw new Error('TRAINING_START_BLOCKED');}
  applyImpulse(_id:string,_impulse:Vec3):void{throw new Error('TRAINING_IMPULSE_UNSUPPORTED');}
  step():void{throw new Error('TRAINING_REQUIRES_ENGINE_INPUT');}
  characterSettings(_id:string):Required<CharacterOptions>{const c=this.simulation.characterControl;return {...DEFAULT_CHARACTER_OPTIONS,heightMeters:1.68,radiusMeters:.28,walkSpeedMetersPerSecond:3.1*c.speed/3.8,runSpeedMetersPerSecond:c.maxSpeed,jumpSpeedMetersPerSecond:c.jumpSpeed,maximumStepHeightMeters:.27};}
  probeCharacterStart(id:string,position:Vec3):EpisodeStartProbe{
    if(id!==this.options.character.instanceId)throw new Error('TRAINING_CHARACTER_REQUIRED');
    const safe=this.environment.safeSpawn(new THREE.Vector3(...position),PLAYER_BODY);const valid=!!safe&&safe.distanceTo(new THREE.Vector3(...position))<=.35;
    return {isValid:valid,requestedPositionWorldMetersXYZ:position,resolvedPositionWorldMetersXYZ:safe?tuple(safe):position,diagnostics:valid?[]:[{code:'TRAINING_START_BLOCKED',message:'No safe character start within alignment tolerance.'}]};
  }
  castCameraArm(target:Vec3,eye:Vec3,radius:number){const t=new THREE.Vector3(...target);return {distanceMeters:t.distanceTo(this.environment.cameraCast(t,new THREE.Vector3(...eye),radius))};}
  probe(origin:Vec3,direction:Vec3,distance:number){const result=this.environment.raycast(new THREE.Vector3(...origin),new THREE.Vector3(...direction),distance);return result?{entityId:result.id,distanceMeters:result.distance,normalWorldXYZ:tuple(result.normal)}:null;}
  audit():PhysicsAudit{return {engine:'rapier',entityCount:this.objects.size,colliderCount:this.environment.colliderCount,triangleCount:0,entities:[...this.objects.keys()].map(id=>({id,kind:id===this.options.character.instanceId?'character':'training-vehicle',colliderCount:this.simulation.vehicles.find(v=>v.spec.id===id)?.spec.mode==='carriage'?2:1,triangleCount:0})),diagnostics:[]};}
  reset():void{
    const profile=this.prepareProfile(this.baselineProfile);validateTrainingMap(this.currentMap);
    const replacement=new EnvironmentQueries(this.instanceMap(this.currentMap)),previous=this.environment;
    let staged:Simulation;try{staged=this.simulation.prepareEnvironment(replacement);this.configureSimulation(staged,profile);}catch(error){replacement.dispose();throw error;}
    this.simulation.adoptEnvironment(staged);this.environment=replacement;this.followCamera.environment=replacement;this.commitProfile(profile);previous.dispose();this.clearInput();
    for(const notify of this.simulationReplacements)notify();
    this.camera.copy(this.initialCamera);this.camera.fov=this.followCamera.tuning.baseFovDegrees;this.camera.updateProjectionMatrix();this.followCamera.mode=0;this.followCamera.reset(this.simulation);this.sync(0);if(!this.authored)this.followCamera.update(this.simulation,0);
  }
  dispose():void{if(this.disposed)return;this.disposed=true;this.clearInput();this.visualUpdates.clear();this.simulation.dispose();this.environment.dispose();this.options.character.animation?.dispose();}
}
