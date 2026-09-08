import { trainingHost } from './training/host-access';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { WorldEngine, type WorldOptions as EngineOptions } from './engine.js';
import { ThreePresentation } from './presentation.js';
import { normalizeCaptureSelection, observeCaptureSelection, type SelectedCaptureTarget } from './capture-selection.js';
import { WorldAssets } from './assets-library.js';
import { OperationLedger, StateRegistry, actionArguments, cloneJson, failure, objectSchema, requireId, runtimeError, scalarSchema, scalarValue, synchronous } from './control-support.js';
import { geometrySignature, isWorldVisible, setEntityBoundary, worldPose } from './geometry.js';
import type * as API from './contracts.js';
import type { AssetDefinition, EntityOptions as EngineEntityOptions, CharacterOptions as EngineBody, WorldCommand as EngineCommand } from './engine-contracts.js';
import type { EpisodeRuntimePort, EpisodeStart } from './episode-contracts.js';
import { MAXIMUM_EPISODE_START_ALIGNMENT_METERS } from './physics.js';
import { isTrainingCommand, type TrainingCommand } from './training/runtime.js';

type Registration = {
 id:string;object:THREE.Object3D;options:API.EntityOptions|API.CharacterOptions;role:API.EntityState['role'];
 generation:number;geometryVersion:number;asset?:API.AssetInstance;body?:API.CharacterBody;
 movementId:string;movementState:API.JsonValue;physicsKind:'none'|'fixed'|'kinematic'|'dynamic'|'character';
};
type Parameter = {definition:API.ParameterDefinition<API.ScalarSchema>;value:API.Scalar;status:API.ParameterHandle<API.Scalar>['status'];operationId?:string;error?:API.RuntimeError};
type Prototype = {definition:API.PrototypeDefinition;template:API.SpawnTemplate;asset?:API.AssetInstance;status:'preparing'|'ready'|'failed';error?:API.RuntimeError};
type Geometry = {id:string;description:string;geometry:THREE.BufferGeometry};
type Plan = {commands:API.PrimitiveCommand[];parameters:Map<string,API.Scalar>;effects:Parameter[];parameterOwners:Map<API.PrimitiveCommand,string>;declarations:Map<API.PrimitiveCommand,Set<string>>};
type Prepared = {plan:Plan;spawned:Map<string,API.EntityOptions|API.CharacterOptions>;epoch:number;revision:number;generations:Map<string,number>;expectedRevision?:number};
type Tween = {command:API.PropertyCommand;from:API.Vec3;to:API.Vec3;elapsed:number;duration:number;operationId:string;step:number};
type Activity = {operationId:string;steps:{commandIndex:number;status:'queued'|'running'|'succeeded'|'failed'|'cancelled';error?:API.RuntimeError}[];parameters:string[];actorSteps:Map<string,number>;followTargets:Map<string,string>};
type Queued = {prepared:Prepared;commandId:string;operationId:string;resolve:(receipt:API.CommandReceipt)=>void};
export type WorldOptions = EngineOptions & {assetDefinitions?:Readonly<Record<string,AssetDefinition>>};
const vec=(value:unknown):API.Vec3=>{if(!Array.isArray(value)||value.length!==3||!value.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000))throw failure('COMMAND_VECTOR_INVALID');return value as unknown as API.Vec3;};
const tuple=(value:THREE.Vector3):API.Vec3=>[value.x,value.y,value.z];
const commandFields:Record<API.PrimitiveCommand['type'],readonly string[]>={
 'entity.set-visible':['entityId','isVisible'],'entity.set-scale':['entityId','scaleLocalXYZ','durationSeconds'],
 'entity.set-position':['entityId','positionWorldMetersXYZ','durationSeconds'],'entity.set-rotation':['entityId','rotationLocalRadiansXYZ','durationSeconds'],
 'entity.spawn':['prototypeId','entityId','positionWorldMetersXYZ'],'entity.despawn':['entityId'],
 'entity.attach':['childEntityId','parentEntityId','positionLocalMetersXYZ'],'entity.play-action':['entityId','actionId','playback'],
 'entity.stop-action':['entityId'],'entity.apply-impulse':['entityId','impulseNewtonSecondsXYZ'],
 'actor.move-to':['entityId','targetPositionWorldMetersXYZ','run'],'actor.follow':['entityId','targetEntityId','distanceMeters'],
 'actor.stop':['entityId'],'actor.resume-autonomy':['entityId'],'actor.set-movement':['entityId','movementId'],
 'entity.set-geometry':['entityId','geometryId'],
};
const propertyChannel=(command:API.PrimitiveCommand):API.PropertyChannel|undefined=>({
 'entity.set-position':'position','entity.set-rotation':'rotation','entity.set-scale':'scale','entity.set-visible':'visibility',
 } as Partial<Record<API.PrimitiveCommand['type'],API.PropertyChannel>>)[command.type];

/** Public authoring facade over one private engine. It never owns a second simulation loop. */
export class ThreeWorld implements API.World {
 readonly scene:THREE.Scene;readonly camera:THREE.Camera;readonly renderer:THREE.WebGLRenderer|undefined;
 readonly assets:WorldAssets;readonly operations=new OperationLedger();readonly state:StateRegistry;
 private readonly entries=new Map<string,Registration>();
 private readonly prototypes=new Map<string,Prototype>();private readonly geometries=new Map<string,Geometry>();
 private readonly movements=new Map<string,API.MovementDefinition<API.JsonValue>>();
 private readonly parameters=new Map<string,Parameter>();private readonly actions=new Map<string,API.ActionDefinition<API.ObjectSchema>>();
 private readonly disabled=new Map<string,API.RuntimeError>();private readonly owners=new Map<string,string>();private readonly errors:API.RuntimeError[]=[];
 private readonly updating=new Set<(context:API.UpdateContext)=>void>();private readonly resets=new Set<()=>void>();private readonly disposals=new Set<()=>void>();
 private readonly autonomies=new Map<string,{behavior:API.Autonomy;index:number;paused:boolean;delay:number}>();
 private readonly pending=new Set<Promise<unknown>>();private readonly scopes=new Set<AbortController>();
 private readonly activities=new Map<string,Activity>();private readonly tweens:Tween[]=[];private readonly queued:Queued[]=[];
 private readonly requests=new Map<string,{body:string;promise:Promise<API.CommandReceipt>}>();
 private readonly ownedResources=new Set<THREE.BufferGeometry|THREE.Material>();
 private readonly trainingActivities=new Map<string,string>();
 private baseline: {entries:Map<string,Registration>;prototypes:Map<string,Prototype>;geometries:Map<string,Geometry>;parameters:Map<string,Parameter>;actions:Map<string,API.ActionDefinition<API.ObjectSchema>>;movements:Map<string,API.MovementDefinition<API.JsonValue>>;autonomies:Map<string,{behavior:API.Autonomy;index:number;paused:boolean;delay:number}>;geometryById:Map<string,THREE.BufferGeometry>;captureTargets:readonly SelectedCaptureTarget[]}|undefined;
 private presentation:ThreePresentation|undefined;private readonly changes=new Set<()=>void>();private changeQueued=false;
 private captureTargets:readonly SelectedCaptureTarget[]=[];private revision=0;private epoch=0;private nextGeneration=0;private nextCommand=0;private disposed=false;private starting:Promise<void>|undefined;
 private activeWriter:string|undefined;private observer:API.WorldObservation|undefined;
 private episodeLease:{state:'preparing'|'prepared';restoreViewport:()=>void}|undefined;
 private constructor(private readonly engine:WorldEngine,assets:WorldAssets){
  this.scene=engine.scene;this.camera=engine.camera;this.renderer=engine.renderer;this.assets=assets;
  this.state=new StateRegistry(id=>{const owner=this.owners.get(`state:${id}`);if(owner&&owner!==this.activeWriter)throw failure('STATE_OWNED_BY_PARAMETER',`Set parameter ${owner} instead.`);this.notifyChange();});
  engine.onUpdate(({deltaSeconds,simulationTick})=>this.beforeTick(deltaSeconds,simulationTick));
  engine.onAfterUpdate(()=>this.afterTick());
  engine.training?.onSimulationReplaced(()=>this.retireTrainingActivities());
  engine.setResetHandler(()=>{void this.reset().catch(error=>this.fault(error,'reset'));});
  engine.setDriveProvider((id,input,direction,dt)=>this.movementDrive(id,input,direction,dt));
 }
 static async create(options:WorldOptions={}):Promise<ThreeWorld>{
  const engine=await WorldEngine.create(options);
  try{
   let definitions=options.assetDefinitions??{};
   if(options.assetDefinitions===undefined&&typeof document!=='undefined'){
    const response=await fetch(new URL('./asset-definitions.json',document.baseURI));
    if(response.ok){const catalog=await response.json() as {schemaVersion:number;assets:AssetDefinition[]};if(catalog.schemaVersion!==1||!Array.isArray(catalog.assets))throw failure('ASSET_CATALOG_INVALID');definitions=Object.fromEntries(catalog.assets.map(asset=>[asset.id,asset]));}
    else if(response.status!==404)throw failure('ASSET_CATALOG_FAILED',`HTTP ${response.status}`);
   }
   const assets=new WorldAssets({definitions,...(typeof document!=='undefined'?{baseUri:document.baseURI}:{})});
   const world=new ThreeWorld(engine,assets);
   if(options.training){
    for(const v of options.training.vehicles)world.addCharacter({id:v.instanceId,name:v.spec.name,object:v.object,body:{heightMeters:Math.max(.1,v.spec.envelope.halfExtents[1]*2),radiusMeters:v.spec.radius},tags:['training-vehicle',v.assetId],frontYawRadians:Math.PI});
    const c=options.training.character;world.addCharacter({id:c.instanceId,object:c.object,body:{heightMeters:1.68,radiusMeters:.28},tags:['training-character'],frontYawRadians:Math.PI});world.setControlledEntity(c.instanceId);
   }
   return world;
  }catch(error){engine.dispose();throw error;}
 }
 get training(){return this.engine.training;}
 getKeyBindings(){return this.engine.keyboard.getKeyBindings();}
 setKeyBindings(overrides:Partial<import('./training/input').KeyBindings>):void{this.alive();this.engine.keyboard.setKeyBindings(overrides);}
 get cameraMode():API.CameraState['mode']{return this.engine.training?.cameraMode??this.engine.cameraRig.mode;}
 get isRunning():boolean{return this.engine.isRunning;}
 get simulationTick():number{return this.engine.simulationTick;}
 private alive():void{if(this.disposed)throw failure('WORLD_DISPOSED');}
 private entity(id:string):Registration{const entry=this.entries.get(id);if(!entry)throw failure('ENTITY_NOT_FOUND',`Unknown entity ${id}`,'content',[id]);return entry;}
 private touch():void{this.revision++;this.notifyChange();}
 private notifyChange():void {
  if(this.changeQueued||this.disposed||!this.changes.size)return;this.changeQueued=true;
  queueMicrotask(()=>{this.changeQueued=false;if(this.disposed)return;for(const callback of this.changes)callback();});
 }
 createPresentation(options:API.PresentationOptions={}):API.WorldPresentation {
  this.alive();if(this.presentation)throw failure('PRESENTATION_ALREADY_EXISTS');if(!this.renderer)throw failure('PRESENTATION_REQUIRES_RENDERER');
  const presentation=new ThreePresentation({canvas:this.renderer.domElement,camera:this.camera,
   render:()=>this.engine.render(),stamp:()=>({simulationTick:this.simulationTick,worldRevision:this.revision}),object:id=>this.entries.get(id)?.object,
   onRender:callback=>this.engine.onRender(callback),onChange:callback=>{this.changes.add(callback);return()=>{this.changes.delete(callback);};},
   bindInput:(surface,uiRoot)=>this.engine.bindInput(surface,uiRoot),focus:()=>this.engine.focusInput(),released:()=>{this.presentation=undefined;},
  },options);this.presentation=presentation;return presentation;
 }
 private cloneObject(object:THREE.Object3D,cloneGeometry=false):THREE.Object3D{
  const clone=cloneSkeleton(object);const materials=new Map<THREE.Material,THREE.Material>();
  clone.traverse(node=>{const mesh=node as THREE.Mesh;if(!mesh.isMesh)return;
   if(cloneGeometry){mesh.geometry=mesh.geometry.clone();this.ownedResources.add(mesh.geometry);}
   const copy=(material:THREE.Material)=>{let found=materials.get(material);if(!found){found=material.clone();materials.set(material,found);this.ownedResources.add(found);}return found;};
   mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);
  });return clone;
 }
 addEntity(options:API.EntityOptions):THREE.Object3D{
  this.alive();requireId(options.id);if(!['terrain','obstacle','decoration'].includes(options.role))throw failure('ENTITY_ROLE_REQUIRED');
  if(options.role==='decoration'&&options.physics)throw failure('DECORATION_CANNOT_HAVE_PHYSICS');
  const physics=options.role==='decoration'?{kind:'none' as const}:options.physics?{...options.physics,shape:options.physics.shape==='mesh'?'trimesh' as const:options.physics.shape??'trimesh' as const}:{kind:'fixed' as const};
  if(physics.kind==='dynamic'&&(!('massKilograms' in physics)||!Number.isFinite(physics.massKilograms)||physics.massKilograms<=0))throw failure('DYNAMIC_MASS_REQUIRED');
  this.engine.addEntity({...options,physics});
  this.entries.set(options.id,{id:options.id,object:options.object,options,role:options.role,generation:++this.nextGeneration,geometryVersion:0,movementId:'ground',movementState:null,physicsKind:physics.kind});this.touch();return options.object;
 }
 addCharacter(options:API.CharacterOptions):THREE.Object3D{
  this.alive();requireId(options.id);
  const asset=options.asset;const object=asset?.object??options.object;
  if(!object||(asset&&options.object))throw failure('CHARACTER_SOURCE_INVALID');
  if(asset&&!this.assets.owns(asset))throw failure('ASSET_WORLD_MISMATCH');
  const body=options.body??asset?.recommendedBody;if(!body)throw failure('CHARACTER_BODY_REQUIRED','Supply body dimensions or use an asset with a verified recommended body.');
  const movement=options.movement;const movementId=movement?.kind==='custom'?movement.movementId:'ground';
  if(movementId!=='ground'&&!this.movements.has(movementId))throw failure('MOVEMENT_NOT_REGISTERED');
  if(options.locomotionBindingId){const info=this.assets.search('').find(item=>item.assetId===asset?.assetId);if(!info?.locomotionBindingIds.includes(options.locomotionBindingId))throw failure('LOCOMOTION_BINDING_UNAVAILABLE');}
  const character=this.engineCharacter(options,body);
  const {asset:_asset,...metadata}=options;this.engine.addCharacter({...metadata,object,character,...(asset?{asset:this.assets.internal(asset)}:{})});
  this.entries.set(options.id,{id:options.id,object,options,role:'actor',body,...(asset?{asset}:{}),generation:++this.nextGeneration,geometryVersion:0,movementId,movementState:movementId==='ground'?null:cloneJson(this.movements.get(movementId)!.initialState),physicsKind:'character'});this.touch();return object;
 }
 setControlledEntity(id:string):void{this.entity(id);this.engine.setControlledEntity(id);this.captureTargets=Object.freeze(this.captureTargets.map(selection=>selection.entityId===id?Object.freeze({entityId:id}):selection));this.cancelActor(id);this.touch();}
 setCameraFollow(options:API.CameraFollowOptions={}):void{this.engine.setCameraFollow(options);}
 setCameraPerspective(perspective:API.CameraPerspective):void{this.alive();if(this.episodeLease)throw failure('EPISODE_CAPTURE_OWNS_CLOCK');this.engine.setCameraPerspective(perspective);}
 useAuthoredCamera():THREE.Camera{this.training?.useAuthoredCamera();return this.engine.cameraRig.useAuthoredCamera();}
 setCaptureTargets(targets:readonly API.CaptureTargetSelection[]):void{this.alive();this.captureTargets=normalizeCaptureSelection(targets,id=>this.entries.get(id)?.object,this.engine.controlledEntityId);}
 private captureObservation(){this.alive();return observeCaptureSelection(this.captureTargets,id=>this.entries.get(id)?.object,this.engine.controlledEntityId);}
 onUpdate(callback:(context:API.UpdateContext)=>void):()=>void{this.updating.add(callback);return()=>{this.updating.delete(callback);};}
 onReset(callback:()=>void):()=>void{this.resets.add(callback);return()=>{this.resets.delete(callback);};}
 onDispose(callback:()=>void):()=>void{this.disposals.add(callback);return()=>{this.disposals.delete(callback);};}
 onInteract(id:string,plan:()=>API.WorldCommand|readonly API.WorldCommand[]):()=>void{
  this.entity(id);return this.engine.onInteract(id,()=>{
   try{const result=this.guarded(()=>synchronous(plan));const commands=Array.isArray(result)?result:[result];void this.executePlan(commands).catch(error=>this.fault(error,'interaction'));}
   catch(error){this.fault(error,'interaction');throw error;}
  });
 }
 private guarded<T>(callback:()=>T):T{
  const before=[...this.entries.values()].map(entry=>({entry,position:entry.object.position.clone(),quaternion:entry.object.quaternion.clone(),scale:entry.object.scale.clone(),visible:entry.object.visible,parent:entry.object.parent,matrix:entry.object.matrix.clone(),geometry:entry.physicsKind==='fixed'||entry.physicsKind==='kinematic'||entry.physicsKind==='dynamic'?geometrySignature(entry.object):undefined}));
  const camera=this.camera.matrix.clone();const cameraPosition=this.camera.position.clone();const cameraQuaternion=this.camera.quaternion.clone();
  let value:T|undefined;let thrown:unknown;
  try{value=callback();}catch(error){thrown=error;}
  const changed=before.find(({entry,position,quaternion,scale,visible,parent,matrix,geometry})=>!entry.object.position.equals(position)||!entry.object.quaternion.equals(quaternion)||!entry.object.scale.equals(scale)||entry.object.visible!==visible||entry.object.parent!==parent||(!entry.object.matrixAutoUpdate&&!entry.object.matrix.equals(matrix))||(geometry!==undefined&&geometrySignature(entry.object)!==geometry));
  if(changed)throw failure('MANAGED_CHANNEL_WRITE',`Use SDK commands to change ${changed.entry.id}; authored callbacks may animate pure visual descendants.`,'content',[changed.entry.id]);
  if(this.cameraMode!=='authored'&&(!this.camera.position.equals(cameraPosition)||!this.camera.quaternion.equals(cameraQuaternion)||!this.camera.matrix.equals(camera)))throw failure('CAMERA_CHANNEL_OWNED');
  if(thrown)throw thrown;return value as T;
 }
 private authorCallback<T>(id:string,callback:()=>T):T{if(this.disabled.has(id))throw this.disabled.get(id)!;try{return this.guarded(()=>synchronous(callback));}catch(error){const diagnostic=runtimeError(error,'authoring');this.disabled.set(id,diagnostic);const parameter=this.parameters.get(id);if(parameter){parameter.status='failed';parameter.error=diagnostic;}this.touch();this.fault(error,'authoring');throw error;}}
 private fault(error:unknown,phase:string):void{this.errors.push(runtimeError(error,phase));if(this.errors.length>128)this.errors.shift();this.engine.stop();}
 private track<T>(promise:Promise<T>):Promise<T>{this.pending.add(promise);void promise.then(()=>this.pending.delete(promise),()=>this.pending.delete(promise));return promise;}
 async registerPrototype(definition:API.PrototypeDefinition):Promise<void>{
  this.alive();requireId(definition.id);if(this.prototypes.has(definition.id))throw failure('PROTOTYPE_DUPLICATE');
  const epoch=this.epoch;const record:Prototype={definition,template:definition.template,status:'preparing'};this.prototypes.set(definition.id,record);this.touch();
  return this.track((async()=>{try{
   const template=definition.template;let copy:API.SpawnTemplate;
   if(template.kind==='character'&&template.options.asset){const asset=await this.assets.clone(template.options.asset);if(epoch!==this.epoch||this.disposed){this.assets.release(asset);throw failure('STALE_TASK');}record.asset=asset;copy={kind:'character',options:{...template.options,asset}};}
   else{const object=this.cloneObject(template.options.object!,true);copy=template.kind==='character'?{kind:'character',options:{...template.options,object} as Extract<API.SpawnTemplate,{kind:'character'}>['options']}:{kind:'entity',options:{...template.options,object}};}
   if(epoch!==this.epoch||this.disposed)throw failure('STALE_TASK');record.template=copy;record.status='ready';this.touch();
  }catch(error){record.status='failed';record.error=runtimeError(error,'prototype');throw error;}})());
 }
 async registerGeometry(definition:API.GeometryDefinition):Promise<void>{
  this.alive();requireId(definition.id);if(this.geometries.has(definition.id))throw failure('GEOMETRY_DUPLICATE');
  const geometry=definition.geometry.clone();const attribute=geometry.getAttribute('position');
  if(!attribute||attribute.itemSize!==3||attribute.count<3||attribute.count>750000)throw failure('GEOMETRY_INVALID');
  for(let i=0;i<attribute.count;i++)if(![attribute.getX(i),attribute.getY(i),attribute.getZ(i)].every(Number.isFinite))throw failure('GEOMETRY_INVALID');
  this.ownedResources.add(geometry);this.geometries.set(definition.id,{...definition,geometry});this.touch();
 }
 async replaceGeometry(entityId:string,geometry:THREE.BufferGeometry):Promise<API.CommandReceipt>{const epoch=this.epoch,generation=this.entity(entityId).generation;const geometryId=`prepared-geometry-${++this.nextCommand}`;await this.registerGeometry({id:geometryId,description:`Replacement for ${entityId}`,geometry});if(epoch!==this.epoch||this.entity(entityId).generation!==generation)throw failure('STALE_TASK');return this.execute({type:'entity.set-geometry',entityId,geometryId});}
 registerMovement(definition:API.MovementDefinition<number>):void;
 registerMovement(definition:API.MovementDefinition<boolean>):void;
 registerMovement(definition:API.MovementDefinition<string>):void;
 registerMovement<T extends API.JsonValue>(definition:API.MovementDefinition<T>):void;
 registerMovement<T extends API.JsonValue>(definition:API.MovementDefinition<T>):void{
  this.alive();requireId(definition.id);if(definition.id==='ground'||this.movements.has(definition.id)||!Number.isSafeInteger(definition.version)||definition.version<1||typeof definition.update!=='function')throw failure('MOVEMENT_DEFINITION_INVALID');
  cloneJson(definition.initialState);this.movements.set(definition.id,definition as unknown as API.MovementDefinition<API.JsonValue>);this.touch();
 }
 private movementDrive(id:string,input:API.WorldInput,direction:API.Vec3,deltaSeconds:number){
  const entry=this.entity(id);if(entry.movementId==='ground')return undefined;const definition=this.movements.get(entry.movementId);if(!definition)throw failure('MOVEMENT_NOT_REGISTERED');
  const result=this.guarded(()=>synchronous(()=>definition.update({entityId:id,deltaSeconds,simulationTick:this.simulationTick+1,input,desiredDirectionWorldXYZ:direction,state:cloneJson(entry.movementState),body:this.getEntityState(id),probe:(origin,heading,distance)=>this.engine.physics.probe(origin,heading,distance,id)})));
  vec(result.velocityWorldMetersPerSecondXYZ);if(typeof result.applyGravity!=='boolean')throw failure('MOVEMENT_INTENT_INVALID');if(result.facingDirectionWorldXYZ)vec(result.facingDirectionWorldXYZ);
  if(result.actionId&&!entry.asset?.actionIds.includes(result.actionId))throw failure('ANIMATION_UNAVAILABLE');entry.movementState=cloneJson(result.state);
  return {drive:{velocityWorldMetersPerSecondXYZ:result.velocityWorldMetersPerSecondXYZ,applyGravity:result.applyGravity},...(result.facingDirectionWorldXYZ?{facing:result.facingDirectionWorldXYZ}:{}),...(result.actionId?{actionId:result.actionId}:{})};
 }
 setAutonomy(id:string,behavior:API.Autonomy):void{const entry=this.entity(id);if(!entry.body||id===this.engine.controlledEntityId)throw failure('AUTONOMY_REQUIRES_NPC');if(!behavior.waypointPositionsWorldMetersXYZ.length)throw failure('PATROL_EMPTY');for(const point of behavior.waypointPositionsWorldMetersXYZ)vec(point);this.autonomies.set(id,{behavior:cloneJson(behavior),index:0,paused:false,delay:0});this.touch();}
 private claimKey(claim:API.WriteClaim):string[]{
  if(claim.kind==='entity')return claim.channels.map(channel=>`${claim.entityId}:${channel}`);
  if(claim.kind==='parameter')return [`parameter:${claim.parameterId}`];if(claim.kind==='prototype')return [`prototype:${claim.prototypeId}`];
  if(claim.kind==='geometry')return [`geometry:${claim.geometryId}`];if(claim.kind==='visual')return [`visual:${claim.channelId}`];return [`state:${claim.stateId}`];
 }
 defineParameter<const S extends API.ScalarSchema>(definition:API.ParameterDefinition<S>):API.ParameterHandle<API.ScalarValue<S>>{
  this.alive();requireId(definition.id);if(this.parameters.has(definition.id))throw failure('PARAMETER_DUPLICATE');scalarSchema(definition.schema);scalarValue(definition.schema,definition.initialValue);
  if(!definition.writes.length||('plan' in definition)===('effect' in definition))throw failure('PARAMETER_DEFINITION_INVALID');
  for(const claim of definition.writes){
   if(claim.kind==='entity'){this.entity(claim.entityId);if(claim.channels.some(channel=>!['position','rotation','scale','visibility'].includes(channel)))throw failure('PARAMETER_CHANNEL_INVALID');}
   else if(claim.kind==='state'){if(!this.state.has(claim.stateId))throw failure('STATE_NOT_FOUND');}
   else requireId(claim.channelId);
   for(const key of this.claimKey(claim))if(this.owners.has(key))throw failure('PARAMETER_CHANNEL_CONFLICT',`Channel ${key} already belongs to ${this.owners.get(key)}`);
  }
  const parameter:Parameter={definition:definition as API.ParameterDefinition<API.ScalarSchema>,value:definition.initialValue,status:'settled'};
  this.parameters.set(definition.id,parameter);for(const claim of definition.writes)for(const key of this.claimKey(claim))this.owners.set(key,definition.id);this.touch();
  return {id:definition.id,get value(){return parameter.value as API.ScalarValue<S>;},get status(){return parameter.status;},get operationId(){return parameter.operationId;},get error(){return parameter.error;}} as API.ParameterHandle<API.ScalarValue<S>>;
 }
 registerAction<const S extends API.ObjectSchema>(definition:API.ActionDefinition<S>):void{
  this.alive();requireId(definition.id);if(this.actions.has(definition.id))throw failure('ACTION_DUPLICATE');objectSchema(definition.inputSchema);
  for(const claim of definition.writes){if(claim.kind==='entity')this.entity(claim.entityId);if(claim.kind==='parameter'&&!this.parameters.has(claim.parameterId))throw failure('PARAMETER_NOT_FOUND');if(claim.kind==='prototype'&&!this.prototypes.has(claim.prototypeId))throw failure('PROTOTYPE_NOT_FOUND');}
  this.actions.set(definition.id,definition as unknown as API.ActionDefinition<API.ObjectSchema>);this.touch();
 }
 private primitiveKeys(command:API.PrimitiveCommand):string[]{
  if(command.type==='entity.spawn')return [`prototype:${command.prototypeId}`];
  if(command.type==='entity.attach')return [`${command.childEntityId}:parentage`,`${command.childEntityId}:position`];
  const channel=propertyChannel(command);if(channel)return [`${command.entityId}:${channel}`];
  if(command.type==='entity.despawn')return [`${command.entityId}:lifecycle`];
  if(command.type==='entity.apply-impulse')return [`${command.entityId}:impulse`];
  if(command.type==='entity.set-geometry')return [`${command.entityId}:geometry`];
  if(command.type==='entity.play-action'||command.type==='entity.stop-action')return [`${command.entityId}:animation`];
  return [`${command.entityId}:locomotion`];
 }
 private primitive(command:API.PrimitiveCommand):API.PrimitiveCommand{
  if(!command||typeof command!=='object'||!Object.hasOwn(commandFields,command.type)||Object.keys(command).some(key=>key!=='type'&&!commandFields[command.type].includes(key)))throw failure('COMMAND_FIELDS_INVALID');
  const copy=cloneJson(command);
  if(this.training&&'entityId' in copy&&this.training.state(copy.entityId))throw failure('TRAINING_USE_RUNTIME_COMMANDS','Use world.training for physical training actor commands.');
  if('entityId' in copy)requireId(copy.entityId);
  if('durationSeconds' in copy&&copy.durationSeconds!==undefined&&(!Number.isFinite(copy.durationSeconds)||copy.durationSeconds<0||copy.durationSeconds>300))throw failure('DURATION_INVALID');
  switch(copy.type){
   case 'entity.set-position':vec(copy.positionWorldMetersXYZ);break;
   case 'entity.set-rotation':vec(copy.rotationLocalRadiansXYZ);break;
   case 'entity.set-scale':if(vec(copy.scaleLocalXYZ).some(v=>v<=0||v>100))throw failure('SCALE_INVALID');break;
   case 'entity.set-visible':if(typeof copy.isVisible!=='boolean')throw failure('VISIBILITY_INVALID');break;
   case 'entity.spawn':requireId(copy.prototypeId);vec(copy.positionWorldMetersXYZ);break;
   case 'entity.attach':requireId(copy.childEntityId);requireId(copy.parentEntityId);vec(copy.positionLocalMetersXYZ);break;
   case 'entity.apply-impulse':vec(copy.impulseNewtonSecondsXYZ);break;
   case 'actor.move-to':vec(copy.targetPositionWorldMetersXYZ);if(copy.run!==undefined&&typeof copy.run!=='boolean')throw failure('RUN_INVALID');break;
   case 'actor.follow':requireId(copy.targetEntityId);if(copy.distanceMeters!==undefined&&(!Number.isFinite(copy.distanceMeters)||copy.distanceMeters<=0))throw failure('DISTANCE_INVALID');break;
   case 'actor.set-movement':requireId(copy.movementId);break;
   case 'entity.set-geometry':requireId(copy.geometryId);break;
   case 'entity.play-action':requireId(copy.actionId);if(copy.playback!==undefined&&!['once','loop'].includes(copy.playback))throw failure('PLAYBACK_INVALID');break;
  }return copy;
 }
 private expand(commands:readonly API.WorldCommand[]):Plan{
  const plan:Plan={commands:[],parameters:new Map(),effects:[],parameterOwners:new Map(),declarations:new Map()};
  const expand=(command:API.WorldCommand,allowed?:Set<string>,newIds=new Set<string>()):void=>{
   if(isTrainingCommand(command))throw failure('TRAINING_COMMAND_REQUIRES_DIRECT_EXECUTE');
   if(command.type==='action.invoke'){
    if(allowed)throw failure('ACTION_RECURSION_FORBIDDEN');const action=this.actions.get(command.actionId);if(!action)throw failure('ACTION_NOT_FOUND');actionArguments(action.inputSchema,command.arguments);
    const declared=new Set(action.writes.flatMap(claim=>this.claimKey(claim)));const items=this.authorCallback(command.actionId,()=>action.plan(cloneJson(command.arguments)));
    if(!Array.isArray(items)||items.length>256)throw failure('ACTION_PLAN_INVALID');const created=new Set<string>();for(const item of items)expand(item,declared,created);return;
   }
   if(command.type==='parameter.set'){
    if(allowed&&!allowed.has(`parameter:${command.parameterId}`))throw failure('ACTION_WRITE_UNDECLARED');const parameter=this.parameters.get(command.parameterId);if(!parameter)throw failure('PARAMETER_NOT_FOUND');
    scalarValue(parameter.definition.schema,command.value);if(plan.parameters.has(command.parameterId))throw failure('PLAN_DUPLICATE_PARAMETER');plan.parameters.set(command.parameterId,command.value);
    if('effect' in parameter.definition){plan.effects.push(parameter);return;}
    const declared=new Set(parameter.definition.writes.flatMap(claim=>this.claimKey(claim)));
    const project=parameter.definition.plan;const projected=this.authorCallback(command.parameterId,()=>project(command.value));
    for(const item of projected){const normalized=this.primitive(item);if(!propertyChannel(normalized)||this.primitiveKeys(normalized).some(key=>!declared.has(key)))throw failure('PARAMETER_WRITE_UNDECLARED');plan.commands.push(normalized);plan.parameterOwners.set(normalized,command.parameterId);}return;
   }
   const normalized=this.primitive(command);const keys=this.primitiveKeys(normalized);
   const id=normalized.type==='entity.attach'?normalized.childEntityId:normalized.entityId;
   if(allowed&&keys.some(key=>!allowed.has(key)&&!newIds.has(id)))throw failure('ACTION_WRITE_UNDECLARED');
   if(normalized.type==='entity.spawn'){if(this.entries.has(id)||newIds.has(id))throw failure('ENTITY_DUPLICATE');newIds.add(id);}
   if(allowed)plan.declarations.set(normalized,allowed);plan.commands.push(normalized);
  };
  for(const command of commands)expand(command);
  if(plan.commands.length>256)throw failure('PLAN_BUDGET_EXCEEDED');
  const written=new Set<string>();
  for(const command of plan.commands){if(command.type==='entity.spawn')continue;
   const keys=this.primitiveKeys(command).flatMap(key=>key.endsWith(':locomotion')?[key,`${key.slice(0,-11)}:position`,`${key.slice(0,-11)}:rotation`]:[key]);
   if(keys.some(key=>written.has(key)||written.has(`${key.slice(0,key.lastIndexOf(':'))}:lifecycle`)||(key.endsWith(':lifecycle')&&[...written].some(previous=>previous.startsWith(`${key.slice(0,-10)}:`)))))throw failure('PLAN_DUPLICATE_WRITE');
   for(const key of keys){const owner=this.owners.get(key);if(owner&&owner!==plan.parameterOwners.get(command))throw failure('CHANNEL_OWNED_BY_PARAMETER',`Use parameter ${owner} to control ${key}.`);written.add(key);}
  }
  return plan;
 }
 private async prepare(plan:Plan):Promise<Prepared>{
  const epoch=this.epoch,revision=this.revision;const generations=new Map<string,number>();for(const command of plan.commands)for(const field of ['entityId','childEntityId','parentEntityId','targetEntityId'] as const){const id=(command as unknown as Record<string,unknown>)[field];if(typeof id==='string'&&this.entries.has(id))generations.set(id,this.entries.get(id)!.generation);}const spawned=new Map<string,API.EntityOptions|API.CharacterOptions>();
  try{for(const command of plan.commands)if(command.type==='entity.spawn'){
   if(this.entries.has(command.entityId)||spawned.has(command.entityId))throw failure('ENTITY_DUPLICATE');const prototype=this.prototypes.get(command.prototypeId);if(prototype?.status!=='ready')throw failure('PROTOTYPE_NOT_READY','Prepare a registered prototype before spawning.','unsupported-capability');
   const template=prototype.template;let options:API.EntityOptions|API.CharacterOptions;
   if(template.kind==='character'&&template.options.asset){const asset=await this.assets.clone(template.options.asset);options={...template.options,id:command.entityId,asset};}
   else options={...template.options,id:command.entityId,object:this.cloneObject(template.options.object!)} as API.EntityOptions|API.CharacterOptions;
   const object='asset' in options&&options.asset?options.asset.object:options.object!;this.scene.updateWorldMatrix(true,true,true);object.position.copy(this.scene.worldToLocal(new THREE.Vector3().fromArray(command.positionWorldMetersXYZ)));spawned.set(command.entityId,options);
  }
  if(epoch!==this.epoch||this.disposed)throw failure('STALE_TASK');
  const prepared={plan,spawned,epoch,revision,generations};this.validatePrepared(prepared);return prepared;
  }catch(error){for(const options of spawned.values())if('asset' in options&&options.asset)this.assets.release(options.asset);throw error;}
 }
 private validatePrepared(prepared:Prepared):void{
  const candidates=new Map(this.entries);const physical=new Set<string>();const removed=new Set<string>();
  for(const [id,options] of prepared.spawned){
   const isCharacter=!('role' in options);const asset='asset' in options?options.asset:undefined;const object=asset?.object??options.object!;
   const body=isCharacter?(options as API.CharacterOptions).body??asset?.recommendedBody:undefined;if(isCharacter&&!body)throw failure('CHARACTER_BODY_REQUIRED');
   candidates.set(id,{id,options,object,role:isCharacter?'actor':(options as API.EntityOptions).role,generation:0,geometryVersion:0,movementId:'ground',movementState:null,physicsKind:isCharacter?'character':(options as API.EntityOptions).physics?.kind??((options as API.EntityOptions).role==='decoration'?'none':'fixed'),...(body?{body}:{}),...(asset?{asset}:{})});physical.add(id);
  }
  const stored=[...candidates.values()].map(entry=>({entry,parent:entry.object.parent,position:entry.object.position.clone(),quaternion:entry.object.quaternion.clone(),scale:entry.object.scale.clone(),matrix:entry.object.matrix.clone(),visible:entry.object.visible,geometry:(entry.object as THREE.Mesh).isMesh?(entry.object as THREE.Mesh).geometry:undefined}));
  const entity=(id:string)=>{const entry=candidates.get(id);if(!entry||removed.has(id))throw failure('ENTITY_NOT_FOUND',id,'content',[id]);return entry;};
  for(const id of prepared.spawned.keys())setEntityBoundary(candidates.get(id)!.object,true);
  try{
   for(const command of prepared.plan.commands){
    if(command.type==='entity.spawn'){const entry=entity(command.entityId);if(!entry.object.parent)this.scene.add(entry.object);this.scene.updateWorldMatrix(true,true,true);entry.object.position.copy(this.scene.worldToLocal(new THREE.Vector3().fromArray(command.positionWorldMetersXYZ)));continue;}
    if(command.type==='entity.attach'){
     const child=entity(command.childEntityId),parent=entity(command.parentEntityId);if(child.physicsKind!=='none'||[...candidates.values()].some(entry=>entry.physicsKind!=='none'&&this.within(entry.object,child.object)))throw failure('ATTACHMENT_REQUIRES_NONPHYSICAL_CHILD');
     if(this.within(parent.object,child.object))throw failure('ATTACHMENT_CYCLE');parent.object.add(child.object);child.object.position.fromArray(command.positionLocalMetersXYZ);continue;
    }
    const entry=entity(command.entityId);const duration='durationSeconds' in command?command.durationSeconds??0:0;
    if((command.type==='entity.set-position'||command.type==='entity.set-rotation')&&duration>0&&entry.physicsKind!=='kinematic'&&entry.physicsKind!=='none')throw failure('KINEMATIC_REQUIRED');
    if(command.type==='entity.set-rotation'&&entry.body)throw failure('ACTOR_ROTATION_OWNED_BY_MOVEMENT');
    if(command.type==='entity.set-scale'&&entry.body&&!(command.scaleLocalXYZ[0]===command.scaleLocalXYZ[1]&&command.scaleLocalXYZ[1]===command.scaleLocalXYZ[2]))throw failure('CHARACTER_UNIFORM_SCALE_REQUIRED');
    if(command.type==='entity.set-visible'){if(command.isVisible&&entry.object.parent&&!isWorldVisible(entry.object.parent))throw failure('ANCESTOR_HIDDEN','Show the parent before showing this child.');entry.object.visible=command.isVisible;}
    if(command.type==='entity.set-position'){this.scene.updateWorldMatrix(true,true,true);const point=new THREE.Vector3().fromArray(command.positionWorldMetersXYZ);entry.object.position.copy(entry.object.parent?entry.object.parent.worldToLocal(point):point);physical.add(entry.id);}
    if(command.type==='entity.set-rotation'){entry.object.rotation.set(...command.rotationLocalRadiansXYZ);physical.add(entry.id);}
    if(command.type==='entity.set-scale'){entry.object.scale.fromArray(command.scaleLocalXYZ);physical.add(entry.id);}
    if(command.type==='entity.set-geometry'){
     if(!this.geometries.has(command.geometryId))throw failure('GEOMETRY_NOT_PREPARED');const mesh=entry.object as THREE.Mesh;
     if(!mesh.isMesh||(mesh as THREE.SkinnedMesh).isSkinnedMesh||(mesh as THREE.InstancedMesh).isInstancedMesh||entry.body)throw failure('GEOMETRY_REQUIRES_RIGID_MESH');mesh.geometry=this.geometries.get(command.geometryId)!.geometry;physical.add(entry.id);
    }
    if(command.type==='entity.despawn'){
     if(this.engine.controlledEntityId&&this.within(entity(this.engine.controlledEntityId).object,entry.object))throw failure('CONTROLLED_ENTITY_CANNOT_DESPAWN');
     for(const child of candidates.values())if(this.within(child.object,entry.object)){const declared=prepared.plan.declarations.get(command);if(declared&&!prepared.spawned.has(child.id)&&!declared.has(`${child.id}:lifecycle`))throw failure('ACTION_WRITE_UNDECLARED',`Deletion also requires lifecycle of ${child.id}`);removed.add(child.id);}
    }
    if(command.type==='entity.play-action'&&!entry.asset?.actionIds.includes(command.actionId))throw failure('ANIMATION_UNAVAILABLE',`Available actions: ${entry.asset?.actionIds.join(', ')??'none'}`,'unsupported-capability');
    if(command.type==='entity.apply-impulse'&&entry.physicsKind!=='dynamic')throw failure('IMPULSE_REQUIRES_DYNAMIC');
    if(command.type.startsWith('actor.')&&!entry.body)throw failure('ACTOR_REQUIRED');
    if(['actor.move-to','actor.follow','actor.stop','actor.resume-autonomy'].includes(command.type)&&entry.id===this.engine.controlledEntityId)throw failure('PLAYER_INPUT_OWNS_ACTOR');
    if(['actor.move-to','actor.follow','actor.resume-autonomy'].includes(command.type)&&entry.movementId!=='ground')throw failure('GROUND_NAVIGATION_REQUIRED','Custom movement can compute intent; built-in navigation currently supports ground.','unsupported-capability');
    if(command.type==='actor.follow'){entity(command.targetEntityId);if(command.targetEntityId===command.entityId)throw failure('FOLLOW_SELF');}
    if(command.type==='actor.resume-autonomy'&&!this.autonomies.has(entry.id))throw failure('AUTONOMY_NOT_REGISTERED');
    if(command.type==='actor.set-movement'&&command.movementId!=='ground'&&!this.movements.has(command.movementId))throw failure('MOVEMENT_NOT_REGISTERED');
    if(!entry.object.matrixAutoUpdate)entry.object.matrix.compose(entry.object.position,entry.object.quaternion,entry.object.scale);
   }
   this.scene.updateWorldMatrix(true,true,true);
   const affected=[...candidates.values()].filter(entry=>!removed.has(entry.id)&&entry.physicsKind!=='none'&&[...physical].some(id=>this.within(entry.object,entity(id).object)||this.within(entity(id).object,entry.object)));
   this.engine.physics.validateBatch(affected.map(entry=>entry.body?{kind:'character' as const,id:entry.id,object:entry.object,options:this.engineCharacter(entry.options as API.CharacterOptions,entry.body)}:{kind:'rigid' as const,id:entry.id,object:entry.object,options:this.enginePhysics(entry.options as API.EntityOptions)}),[...removed].filter(id=>Boolean(this.engine.physics.state(id))));
  }finally{
   for(const prior of stored){if(prior.parent)prior.parent.add(prior.entry.object);else prior.entry.object.removeFromParent();prior.entry.object.position.copy(prior.position);prior.entry.object.quaternion.copy(prior.quaternion);prior.entry.object.scale.copy(prior.scale);prior.entry.object.matrix.copy(prior.matrix);prior.entry.object.visible=prior.visible;if(prior.geometry)(prior.entry.object as THREE.Mesh).geometry=prior.geometry;}
   for(const id of prepared.spawned.keys())setEntityBoundary(candidates.get(id)!.object,false);this.scene.updateWorldMatrix(true,true,true);
  }
 }
 private engineCharacter(options:API.CharacterOptions,body:API.CharacterBody):EngineBody{if(options.movement?.kind==='ground'){const {kind:_kind,...settings}=options.movement;return {...body,...settings};}return {...body};}
 private enginePhysics(options:API.EntityOptions){return options.physics?{...options.physics,shape:options.physics.shape==='mesh'?'trimesh' as const:options.physics.shape??'trimesh' as const}:{kind:'fixed' as const};}
 private within(object:THREE.Object3D,root:THREE.Object3D):boolean{for(let current:THREE.Object3D|null=object;current;current=current.parent)if(current===root)return true;return false;}
 execute(command:API.WorldCommand,options:API.ExecutionOptions={}):Promise<API.CommandReceipt>{if(this.episodeLease)return Promise.resolve({status:'rejected',commandId:options.commandId??`world-command-${++this.nextCommand}`,worldRevision:this.revision,error:failure('EPISODE_CAPTURE_OWNS_CLOCK')});return isTrainingCommand(command)?this.executeTraining(command,options):this.executePlan([command],options);}
 private executeTraining(command:TrainingCommand,options:API.ExecutionOptions,lease?:{state:'preparing'|'prepared';restoreViewport:()=>void}):Promise<API.CommandReceipt>{
  const commandId=options.commandId??`world-command-${++this.nextCommand}`,body=JSON.stringify(command),previous=this.requests.get(commandId);
  if((this.episodeLease&&this.episodeLease!==lease)||(lease&&this.episodeLease!==lease))return Promise.resolve({status:'rejected',commandId,worldRevision:this.revision,error:failure('EPISODE_CAPTURE_OWNS_CLOCK')});
  if(previous)return previous.body===body?previous.promise:Promise.resolve({status:'rejected',commandId,worldRevision:this.revision,error:failure('COMMAND_ID_CONFLICT')});
  const promise=Promise.resolve().then(():API.CommandReceipt=>{try{
   this.alive();if((this.episodeLease&&this.episodeLease!==lease)||(lease&&this.episodeLease!==lease))throw failure('EPISODE_CAPTURE_OWNS_CLOCK');if(!this.training)throw failure('TRAINING_RUNTIME_REQUIRED');
   if(options.expectedWorldRevision!==undefined&&options.expectedWorldRevision!==this.revision)throw failure('STALE_CONTEXT');
   const result=lease?trainingHost(this.training).command(cloneJson(command)):this.training.command(cloneJson(command));
   if(result?.status==='rejected')throw failure(result.code,result.message);this.touch();
   if(result?.status==='running'){const requestId=result.requestId;const operationId=this.operations.create('training-action',()=>{const cancelled=this.training?.simulation.humanoid?.skills.cancel(requestId);if(cancelled?.status==='running')throw failure(cancelled.code,cancelled.message);this.trainingActivities.delete(operationId);});this.trainingActivities.set(operationId,requestId);this.operations.update(operationId,{status:'running'});return {status:'accepted',commandId,worldRevision:this.revision,operationId};}
   return {status:'applied',commandId,worldRevision:this.revision};
  }catch(error){return {status:'rejected',commandId,worldRevision:this.revision,error:runtimeError(error)};}});
  this.requests.set(commandId,{body,promise});return promise;
 }
 private executePlan(commands:readonly API.WorldCommand[],options:API.ExecutionOptions={}):Promise<API.CommandReceipt>{
  const commandId=options.commandId??`world-command-${++this.nextCommand}`;
  let body:string;try{body=JSON.stringify(commands.map(command=>Object.fromEntries(Object.entries(command).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,key==='arguments'&&value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value]))));}
  catch(error){return Promise.resolve({status:'rejected',commandId,worldRevision:this.revision,error:runtimeError(error)});}
  const prior=this.requests.get(commandId);if(prior)return prior.body===body?prior.promise:Promise.resolve({status:'rejected',commandId,worldRevision:this.revision,error:failure('COMMAND_ID_CONFLICT')});
  const promise=(async():Promise<API.CommandReceipt>=>{try{
   this.alive();requireId(commandId);if(options.expectedWorldRevision!==undefined&&options.expectedWorldRevision!==this.revision)throw failure('STALE_CONTEXT','Read describe() again before issuing this command.','stale-context');
   const prepared=await this.prepare(this.expand(commands));if(options.expectedWorldRevision!==undefined)prepared.expectedRevision=options.expectedWorldRevision;
   const operationId=this.operations.create('queued',()=>this.cancelActivity(operationId));
   return await new Promise(resolve=>{const queued={prepared,operationId,commandId,resolve};if(this.engine.isRunning)this.queued.push(queued);else this.commit(queued);});
  }catch(error){return {status:'rejected',commandId,worldRevision:this.revision,error:runtimeError(error)};}})();
  this.requests.set(commandId,{body,promise});return promise;
 }
 private engineCommand(command:EngineCommand):void{const result=this.engine.execute(command);if(result.status==='rejected')throw failure(result.error?.message.split(':')[0]??'ENGINE_COMMAND_FAILED',result.error?.message??'Engine rejected command','content');}
 private cancelActor(id:string):void{
  for(const activity of this.activities.values())if(activity.actorSteps.has(id))this.operations.cancel(activity.operationId);
  if(this.entries.get(id)?.body)this.engineCommand({type:'actor.stop',entityId:id});
 }
 private cancelActivity(id:string):void{
  for(let i=this.tweens.length-1;i>=0;i--)if(this.tweens[i]!.operationId===id)this.tweens.splice(i,1);
  const activity=this.activities.get(id);if(activity){for(const step of activity.steps)if(step.status==='running'||step.status==='queued')step.status='cancelled';this.operations.update(id,{steps:activity.steps});for(const actor of activity.actorSteps.keys())if(this.entries.has(actor))this.engineCommand({type:'actor.stop',entityId:actor});
   for(const parameterId of activity.parameters){const parameter=this.parameters.get(parameterId);if(parameter?.operationId===id&&parameter.status!=='failed')parameter.status='interrupted';}this.activities.delete(id);}
 }
 private applyProperty(command:API.PropertyCommand):void{
  if(command.type==='entity.set-visible')this.engineCommand({type:command.type,entityId:command.entityId,visible:command.isVisible});
  if(command.type==='entity.set-position')this.engineCommand({type:command.type,entityId:command.entityId,positionMetersXYZ:command.positionWorldMetersXYZ});
  if(command.type==='entity.set-scale')this.engineCommand({type:command.type,entityId:command.entityId,scaleXYZ:command.scaleLocalXYZ});
  if(command.type==='entity.set-rotation')this.engine.setRotation(command.entityId,command.rotationLocalRadiansXYZ);
 }
 private commit(item:Queued,initial=false):void{
  const {prepared,commandId,operationId,resolve}=item;let published=false;
  try{
   if(prepared.epoch!==this.epoch||this.disposed)throw failure('STALE_TASK');if(prepared.expectedRevision!==undefined&&prepared.expectedRevision!==this.revision)throw failure('STALE_CONTEXT','World changed while preparing the command.','stale-context');for(const [id,generation] of prepared.generations)if(this.entries.get(id)?.generation!==generation)throw failure('STALE_ENTITY','An entity was replaced during preparation.','stale-context',[id]);
   // The fixed boundary may have moved since preparation; revalidate candidates against actual poses.
   this.validatePrepared(prepared);
   const activity:Activity={operationId,steps:[],parameters:[...prepared.plan.parameters.keys()],actorSteps:new Map(),followTargets:new Map()};this.activities.set(operationId,activity);
   for(const [parameterId,value] of prepared.plan.parameters){published=true;const parameter=this.parameters.get(parameterId)!;
    if(parameter.operationId)this.operations.cancel(parameter.operationId);parameter.value=value;parameter.status='settled';delete parameter.error;parameter.operationId=operationId;
   }
   for(const parameter of prepared.plan.effects){this.activeWriter=parameter.definition.id;try{if('effect' in parameter.definition){const effect=parameter.definition.effect;this.authorCallback(parameter.definition.id,()=>effect(parameter.value));}}finally{this.activeWriter=undefined;}}
   for(const [index,command] of prepared.plan.commands.entries()){
    const step:Activity['steps'][number]={commandIndex:index,status:'succeeded'};activity.steps.push(step);
    const channel=propertyChannel(command);
    if(channel){
     const property=command as API.PropertyCommand;const id=property.entityId;
     for(const tween of [...this.tweens])if(tween.command.entityId===id&&propertyChannel(tween.command)===channel)this.operations.cancel(tween.operationId);
     const duration=!initial&&'durationSeconds' in property?property.durationSeconds??0:0;
     if(duration>0&&property.type!=='entity.set-visible'){
      const entry=this.entity(id);const from=property.type==='entity.set-position'?tuple(worldPose(entry.object).position):property.type==='entity.set-scale'?tuple(entry.object.scale):[entry.object.rotation.x,entry.object.rotation.y,entry.object.rotation.z] as API.Vec3;
      const to=property.type==='entity.set-position'?property.positionWorldMetersXYZ:property.type==='entity.set-scale'?property.scaleLocalXYZ:property.rotationLocalRadiansXYZ;
      this.tweens.push({command:property,from,to,elapsed:0,duration,operationId,step:index});step.status='running';
     }else this.applyProperty(property);
     if(property.type==='entity.set-position'&&this.entity(id).body)this.cancelActor(id);
     published=true;continue;
    }
    switch(command.type){
     case 'entity.spawn':{const options=prepared.spawned.get(command.entityId)!;if('role' in options)this.addEntity(options);else this.addCharacter(options);break;}
     case 'entity.despawn':{const root=this.entity(command.entityId);const removed=[...this.entries.values()].filter(entry=>this.within(entry.object,root.object));
      const remainingCaptureTargets=this.captureTargets.filter(selection=>!removed.some(entry=>entry.id===selection.entityId||selection.representative&&this.within(selection.representative.object,entry.object)));
      // A deleted follow target explicitly releases the same camera instead of keeping a stale callback.
      if(removed.some(entry=>entry.id===this.engine.cameraRig.targetEntityId))this.engine.cameraRig.useAuthoredCamera();
      for(const task of [...this.activities.values()])if([...task.followTargets.values()].some(targetId=>removed.some(entry=>entry.id===targetId))){this.cancelActivity(task.operationId);this.operations.update(task.operationId,{status:'failed',phase:'target-removed',error:failure('FOLLOW_TARGET_REMOVED','The followed entity was removed.','content')});}
      for(const entry of removed)this.cancelActor(entry.id);this.engineCommand({type:command.type,entityId:command.entityId});this.captureTargets=remainingCaptureTargets;for(const entry of removed){this.entries.delete(entry.id);this.autonomies.delete(entry.id);}break;}
     case 'entity.attach':this.engineCommand({type:command.type,childEntityId:command.childEntityId,parentEntityId:command.parentEntityId,positionMetersXYZ:command.positionLocalMetersXYZ});break;
     case 'entity.play-action':this.engine.playAction(command.entityId,command.actionId,command.playback);break;
     case 'entity.stop-action':this.engine.stopAction(command.entityId);break;
     case 'entity.apply-impulse':this.engineCommand(command);break;
     case 'entity.set-geometry':{this.engine.replaceGeometry(command.entityId,this.geometries.get(command.geometryId)!.geometry);this.entity(command.entityId).geometryVersion++;break;}
     case 'actor.set-movement':{const entry=this.entity(command.entityId);this.cancelActor(entry.id);entry.movementId=command.movementId;entry.movementState=command.movementId==='ground'?null:cloneJson(this.movements.get(command.movementId)!.initialState);break;}
     case 'actor.stop':this.cancelActor(command.entityId);if(this.autonomies.has(command.entityId))this.autonomies.get(command.entityId)!.paused=true;break;
     case 'actor.resume-autonomy':this.cancelActor(command.entityId);this.autonomies.get(command.entityId)!.paused=false;break;
     case 'actor.move-to':case 'actor.follow':{
      this.cancelActor(command.entityId);if(this.autonomies.has(command.entityId))this.autonomies.get(command.entityId)!.paused=true;
      const result=this.engine.execute(command.type==='actor.move-to'?{type:command.type,entityId:command.entityId,targetPositionMetersXYZ:command.targetPositionWorldMetersXYZ,...(command.run===undefined?{}:{run:command.run})}:command);
      if(result.status==='rejected'){step.status='failed';step.error=failure('NO_PATH',result.error?.message??'No path','content',[command.entityId]);}
      else{activity.actorSteps.set(command.entityId,index);if(command.type==='actor.follow')activity.followTargets.set(command.entityId,command.targetEntityId);step.status='running';}break;
     }
    }published=true;
   }
   this.touch();const pending=activity.steps.some(step=>step.status==='running');const failed=activity.steps.find(step=>step.status==='failed');
   if(failed){this.operations.update(operationId,{status:'failed',phase:'execution',steps:activity.steps,error:failed.error!});this.cancelActivity(operationId);resolve({status:'accepted',commandId,worldRevision:this.revision,operationId});}
   else if(pending){for(const id of activity.parameters)this.parameters.get(id)!.status='transitioning';this.operations.update(operationId,{status:'running',phase:'execution',steps:activity.steps});resolve({status:'accepted',commandId,worldRevision:this.revision,operationId});}
   else{this.operations.update(operationId,{status:'succeeded',phase:'completed',outcome:'completed',steps:activity.steps});this.activities.delete(operationId);resolve({status:'applied',commandId,worldRevision:this.revision});}
   this.engine.render();
  }catch(error){const diagnostic=runtimeError(error,'commit');this.operations.update(operationId,{status:'failed',phase:'commit',error:diagnostic});this.cancelActivity(operationId);
   if(published||prepared.plan.effects.length)this.fault(error,'commit');
   if(published||prepared.plan.effects.length)resolve({status:'accepted',commandId,worldRevision:this.revision,operationId});else resolve({status:'rejected',commandId,worldRevision:this.revision,error:diagnostic});
  }
 }
 private beforeTick(deltaSeconds:number,simulationTick:number):void{
  for(const item of this.queued.splice(0))this.commit(item);
  for(const tween of [...this.tweens]){
   if(!this.tweens.includes(tween))continue;tween.elapsed=Math.min(tween.duration,tween.elapsed+deltaSeconds);const ratio=tween.elapsed/tween.duration;
   const next=tween.from.map((value,index)=>value+(tween.to[index]!-value)*ratio) as unknown as API.Vec3;
   const property=tween.command.type==='entity.set-position'?{...tween.command,positionWorldMetersXYZ:next}:tween.command.type==='entity.set-scale'?{...tween.command,scaleLocalXYZ:next}:{...tween.command,rotationLocalRadiansXYZ:next};
   try{this.applyProperty(property as API.PropertyCommand);
    if(ratio>=1){this.tweens.splice(this.tweens.indexOf(tween),1);const activity=this.activities.get(tween.operationId);if(activity?.steps[tween.step])activity.steps[tween.step]!.status='succeeded';}
   }catch(error){const diagnostic=runtimeError(error,'transition',[tween.command.entityId]);this.operations.update(tween.operationId,{status:'failed',phase:'transition',error:diagnostic});for(const parameter of this.parameters.values())if(parameter.operationId===tween.operationId){parameter.status='failed';parameter.error=diagnostic;}this.cancelActivity(tween.operationId);}
  }
  for(const [id,autonomy] of this.autonomies){
   if(autonomy.paused||!this.entries.has(id)||this.entity(id).movementId!=='ground'||id===this.engine.controlledEntityId)continue;
   const current=this.engine.actorTaskState(id);if(current?.status==='running')continue;
   autonomy.delay-=deltaSeconds;if(autonomy.delay>0)continue;
   if(current?.status==='succeeded'){autonomy.index=(autonomy.index+1)%autonomy.behavior.waypointPositionsWorldMetersXYZ.length;autonomy.delay=autonomy.behavior.pauseSeconds??0;this.engineCommand({type:'actor.stop',entityId:id});if(autonomy.delay>0)continue;}
   const target=autonomy.behavior.waypointPositionsWorldMetersXYZ[autonomy.index]!;
   const receipt=this.engine.execute({type:'actor.move-to',entityId:id,targetPositionMetersXYZ:target,...(autonomy.behavior.run===undefined?{}:{run:autonomy.behavior.run})});
   if(receipt.status==='rejected'){autonomy.paused=true;this.errors.push(failure('AUTONOMY_NO_PATH',receipt.error?.message??'No patrol path','content',[id]));}
  }
  for(const update of this.updating)this.guarded(()=>synchronous(()=>update({deltaSeconds,simulationTick,simulationSeconds:simulationTick*this.engine.fixedTimeStepSeconds})));
 }
 private afterTick():void{
  this.notifyChange();
  for(const [operationId,requestId] of this.trainingActivities){const result=this.training?.simulation.humanoid?.skills.status(requestId);if(result?.status==='running')this.operations.update(operationId,{status:'running',phase:result.phase??'running'});if(result&&result.status!=='running'){this.operations.update(operationId,{status:result.status==='completed'?'succeeded':result.status==='cancelled'?'cancelled':'failed',phase:result.phase??result.code,...(result.status==='rejected'?{error:failure(result.code,result.message)}:{})});this.trainingActivities.delete(operationId);}}
  for(const [operationId,activity] of [...this.activities]){
   for(const [id,index] of activity.actorSteps){const state=this.engine.actorTaskState(id);if(state?.status==='succeeded')activity.steps[index]!.status='succeeded';if(state?.status==='failed'){activity.steps[index]!.status='failed';activity.steps[index]!.error=failure('ACTOR_TASK_FAILED',state.error??'Actor task failed','content',[id]);}}
   const failed=activity.steps.find(step=>step.status==='failed');
   if(failed){this.operations.update(operationId,{status:'failed',phase:'execution',error:failed.error!,steps:activity.steps});this.cancelActivity(operationId);}
   else if(activity.steps.every(step=>step.status==='succeeded')){
    this.operations.update(operationId,{status:'succeeded',phase:'completed',outcome:activity.actorSteps.size?'reached':'completed',steps:activity.steps});
    for(const id of activity.parameters){const parameter=this.parameters.get(id);if(parameter?.operationId===operationId)parameter.status='settled';}this.activities.delete(operationId);
   }else this.operations.update(operationId,{status:'running',steps:activity.steps});
  }
 }
 private retireTrainingActivities():void{for(const id of this.trainingActivities.keys())this.operations.update(id,{status:'cancelled',phase:'simulation-replaced'});this.trainingActivities.clear();}
 private copyEntry(entry:Registration):Registration{return {...entry,movementState:cloneJson(entry.movementState)};}
 private async initialise():Promise<void>{
  if(this.baseline)return;
  while(this.pending.size)await Promise.all([...this.pending]);
  for(const prototype of this.prototypes.values())if(prototype.status!=='ready')throw prototype.error??failure('PROTOTYPE_NOT_READY');
  const epoch=this.epoch;
  if(this.parameters.size){
   const prepared=await this.prepare(this.expand([...this.parameters].map(([id,parameter])=>({type:'parameter.set' as const,parameterId:id,value:parameter.definition.initialValue}))));
   let receipt:API.CommandReceipt|undefined;const operationId=this.operations.create('initial');this.commit({prepared,operationId,commandId:'initial-parameters',resolve:value=>{receipt=value;}},true);if(receipt?.status==='rejected')throw receipt.error;if(receipt?.status==='accepted'){const result=this.operations.get(receipt.operationId);if(result.status!=='succeeded')throw result.error??failure('INITIAL_PREPARATION_FAILED');}
  }
  if(epoch!==this.epoch||this.disposed)throw failure('STALE_TASK');
  this.captureObservation();
  this.state.seal();
  this.baseline={entries:new Map([...this.entries].map(([id,entry])=>[id,this.copyEntry(entry)])),prototypes:new Map(this.prototypes),geometries:new Map(this.geometries),parameters:new Map(this.parameters),actions:new Map(this.actions),movements:new Map(this.movements),autonomies:new Map([...this.autonomies].map(([id,value])=>[id,cloneJson(value)])),geometryById:new Map([...this.entries].filter(([,entry])=>(entry.object as THREE.Mesh).isMesh).map(([id,entry])=>[id,(entry.object as THREE.Mesh).geometry])),captureTargets:this.captureTargets};
 }
 async start():Promise<void>{
  this.alive();if(this.episodeLease)throw failure('EPISODE_CAPTURE_OWNS_CLOCK');if(this.engine.isRunning)return;if(this.starting)return this.starting;
  const epoch=this.epoch;const start=(async()=>{await this.initialise();if(epoch!==this.epoch||this.disposed)throw failure('STALE_TASK');if(this.episodeLease)throw failure('EPISODE_CAPTURE_OWNS_CLOCK');this.installObserver();this.engine.start();this.engine.render();})();
  this.starting=start;try{await start;}finally{if(this.starting===start)this.starting=undefined;}
 }
 stop():void{if(this.episodeLease)throw failure('EPISODE_CAPTURE_OWNS_CLOCK');this.engine.stop();}
 async reset():Promise<void>{
  if(this.episodeLease)throw failure('EPISODE_CAPTURE_OWNS_CLOCK');return this.resetState();
 }
 private async resetState():Promise<void>{
  this.alive();this.epoch++;this.presentation?.reset();for(const scope of this.scopes)scope.abort();this.scopes.clear();this.retireTrainingActivities();this.operations.cancelAll();
  for(const queued of this.queued.splice(0))queued.resolve({status:'rejected',commandId:queued.commandId,worldRevision:this.revision,error:failure('STALE_TASK')});
  const wasRunning=this.engine.isRunning;this.engine.stop();if(!this.baseline)await this.initialise();
  const baseline=this.baseline!;
  this.captureTargets=baseline.captureTargets;
  for(const [id,geometry] of baseline.geometryById){const original=baseline.entries.get(id)!;(original.object as THREE.Mesh).geometry=geometry;}
  this.entries.clear();for(const [id,entry] of baseline.entries)this.entries.set(id,{...this.copyEntry(entry),generation:++this.nextGeneration});
  this.prototypes.clear();for(const [id,value] of baseline.prototypes)this.prototypes.set(id,value);
  this.geometries.clear();for(const [id,value] of baseline.geometries)this.geometries.set(id,value);
  this.movements.clear();for(const [id,value] of baseline.movements)this.movements.set(id,value);
  this.parameters.clear();this.owners.clear();for(const [id,value] of baseline.parameters){value.value=value.definition.initialValue;value.status='settled';delete value.operationId;delete value.error;this.parameters.set(id,value);for(const claim of value.definition.writes)for(const key of this.claimKey(claim))this.owners.set(key,id);}
  this.actions.clear();for(const [id,value] of baseline.actions)this.actions.set(id,value);
  this.autonomies.clear();for(const [id,value] of baseline.autonomies)this.autonomies.set(id,cloneJson(value));
  this.state.reset();this.engine.reset();this.errors.length=0;this.touch();
  for(const parameter of this.parameters.values())if('effect' in parameter.definition){this.activeWriter=parameter.definition.id;try{const effect=parameter.definition.effect;this.authorCallback(parameter.definition.id,()=>effect(parameter.value));}finally{this.activeWriter=undefined;}}
  for(const callback of this.resets)this.guarded(()=>synchronous(callback));this.captureObservation();this.engine.render();if(wasRunning)await this.start();
 }
 async runTask<T>(task:(scope:API.TaskScope)=>Promise<T>):Promise<T>{
  this.alive();const epoch=this.epoch;const abort=new AbortController();this.scopes.add(abort);
  const check=()=>{if(abort.signal.aborted||epoch!==this.epoch||this.disposed)throw failure('STALE_TASK');};
  const created=new Set<API.AssetInstance>();
  const scope:API.TaskScope={signal:abort.signal,
   assets:{search:query=>{check();return this.assets.search(query);},load:async id=>{check();const asset=await this.assets.load(id);try{check();}catch(error){this.assets.release(asset);throw error;}created.add(asset);return asset;}},
   setState:(state,value)=>{check();state.set(value);},
   addEntity:options=>{check();return this.addEntity(options);},
   addCharacter:options=>{check();const object=this.addCharacter(options);if(options.asset)created.delete(options.asset);return object;},
   registerPrototype:async definition=>{check();await this.registerPrototype(definition);check();},
   replaceGeometry:async (id,geometry)=>{check();const receipt=await this.replaceGeometry(id,geometry);check();return receipt;},
   execute:async command=>{check();const receipt=await this.execute(command);check();return receipt;},
  };
  try{const result=await task(scope);check();return result;}
  finally{this.scopes.delete(abort);for(const asset of created)this.assets.release(asset);}
 }
 getEntityState(id:string):API.EntityState{
  const entry=this.entity(id);const physics=this.engine.physics.state(id);let parentEntityId:string|undefined;for(let parent=entry.object.parent;parent;parent=parent.parent){const found=[...this.entries].find(([,candidate])=>candidate.object===parent);if(found){parentEntityId=found[0];break;}}
  const logical=this.training?.logicalPose(id);
  const position=tuple(logical?.position??worldPose(entry.object).position);
  const rotation=logical?new THREE.Euler().setFromQuaternion(logical.rotation):entry.object.rotation;
  const owners:API.EntityState['controlOwners'][number][]=[];
  for(const channel of ['position','rotation','scale','visibility'] as const){const parameter=this.owners.get(`${id}:${channel}`);if(parameter)owners.push({channel,ownerKind:'parameter',ownerId:parameter});}
  if(entry.body)owners.push({channel:'locomotion',ownerKind:id===this.engine.controlledEntityId?'player-input':this.autonomies.get(id)?.paused===false?'autonomy':'user-command'});
  else if(entry.physicsKind==='dynamic')owners.push({channel:'position',ownerKind:'physics'});
  const internal=entry.asset?this.assets.internal(entry.asset):undefined;
  const trainingAnimation=this.training?.animationState(id);
  return {id,generation:entry.generation,geometryVersion:entry.geometryVersion,...(entry.body?{movementId:entry.movementId}:{}),name:entry.options.name??id,tags:entry.options.tags??[],appearancePrompt:entry.options.appearancePrompt??'',role:entry.role,
   positionWorldMetersXYZ:position,rotationLocalRadiansXYZ:[rotation.x,rotation.y,rotation.z],scaleLocalXYZ:tuple(entry.object.scale),isVisibleLocal:entry.object.visible,isVisibleEffective:isWorldVisible(entry.object),...(parentEntityId?{parentEntityId}:{}),
   ...(physics&&entry.body?{motion:{phase:physics.isGrounded?'grounded' as const:physics.velocityMetersPerSecondXYZ[1]>0?'jumping' as const:'falling' as const,velocityWorldMetersPerSecondXYZ:physics.velocityMetersPerSecondXYZ,isGrounded:physics.isGrounded,collisionEntityIds:physics.collisionEntityIds}}:{}),
   ...(trainingAnimation?{animation:trainingAnimation}:internal?.currentActionId&&internal.currentClipName?{animation:{actionId:internal.currentActionId,clipName:internal.currentClipName,timeSeconds:internal.timeSeconds}}:{}),controlOwners:owners};
 }
 private commandDescriptor(type:API.PrimitiveCommand['type'],entry:Registration):API.CommandDescriptor{
  const fields=commandFields[type];const properties:Record<string,API.JsonValue>={type:{const:type}};
  for(const field of fields)properties[field]=field.endsWith('XYZ')?{type:'array',items:{type:'number'},minItems:3,maxItems:3}:field==='isVisible'||field==='run'?{type:'boolean'}:field.endsWith('Seconds')||field.endsWith('Meters')?{type:'number',minimum:0}:{type:'string'};
  properties.entityId={const:entry.id};if(type==='entity.attach')properties.childEntityId={const:entry.id};
  const optional=new Set(['durationSeconds','run','distanceMeters','playback']);
  let reason:API.RuntimeError|undefined;const key=propertyChannel({type} as API.PrimitiveCommand);const parameter=key?this.owners.get(`${entry.id}:${key}`):undefined;
  if(this.training?.state(entry.id))reason=failure('TRAINING_USE_RUNTIME_COMMANDS','Use world.training for physical training actor commands.');
  if(parameter)reason=failure('CHANNEL_OWNED_BY_PARAMETER',`Use parameter ${parameter}.`);
  if(type==='entity.set-rotation'&&entry.body)reason=failure('ACTOR_ROTATION_OWNED_BY_MOVEMENT');
  if(['actor.move-to','actor.follow','actor.stop','actor.resume-autonomy'].includes(type)&&entry.id===this.engine.controlledEntityId)reason=failure('PLAYER_INPUT_OWNS_ACTOR');
  if(['actor.move-to','actor.follow','actor.resume-autonomy'].includes(type)&&entry.movementId!=='ground')reason=failure('GROUND_NAVIGATION_REQUIRED');
  if(type==='actor.resume-autonomy'&&!this.autonomies.has(entry.id))reason=failure('AUTONOMY_NOT_REGISTERED');
  return {type,schema:{type:'object',properties,required:['type',...fields.filter(field=>!optional.has(field))],additionalProperties:false},isAvailable:!reason,...(reason?{unavailableReason:reason}:{})};
 }
 describe(query:{readonly query?:string;readonly entityIds?:readonly string[]}={}):API.WorldDescription{
  const text=query.query?.toLowerCase();const selected=[...this.entries.values()].filter(entry=>(!query.entityIds||query.entityIds.includes(entry.id))&&(!text||[entry.id,entry.options.name??'',...(entry.options.tags??[])].join(' ').toLowerCase().includes(text)));
  return {...(this.training?{training:{characterCapabilities:this.training.characterCapabilities(),keyBindings:this.getKeyBindings()}}:{}),schemaVersion:2,worldRevision:this.revision,simulationTick:this.simulationTick,supportedMovementKinds:['ground',...this.movements.keys()],movements:[{id:'ground',version:1,description:'SDK ground movement and navigation'},...[...this.movements.values()].map(({id,version,description})=>({id,version,description}))],geometries:[...this.geometries.values()].map(({id,description})=>({id,description,status:'ready'})),
   entities:selected.map(entry=>{const commands:API.PrimitiveCommand['type'][]=['entity.set-visible','entity.set-position','entity.set-scale','entity.set-rotation'];
    if(entry.id!==this.engine.controlledEntityId)commands.push('entity.despawn');if(entry.physicsKind==='none')commands.push('entity.attach');if(entry.body)commands.push('actor.move-to','actor.follow','actor.stop','actor.resume-autonomy','actor.set-movement');
    if(entry.asset)commands.push('entity.play-action','entity.stop-action');if(entry.physicsKind==='dynamic')commands.push('entity.apply-impulse');
    if((entry.object as THREE.Mesh).isMesh&&!entry.body&&!(entry.object as THREE.SkinnedMesh).isSkinnedMesh&&!(entry.object as THREE.InstancedMesh).isInstancedMesh)commands.push('entity.set-geometry');
    return {state:this.getEntityState(entry.id),commands:[...commands.map(type=>this.commandDescriptor(type,entry)),...this.training?.commandDescriptors(entry.id)??[]],actionIds:entry.asset?.actionIds??this.training?.actionIds(entry.id)??[]};}),
   prototypes:[...this.prototypes].map(([id,p])=>({id,description:p.definition.description,status:p.status,...(p.error?{error:p.error}:{})})),
   parameters:[...this.parameters].filter(([,p])=>!query.entityIds||p.definition.writes.some(claim=>claim.kind==='entity'&&query.entityIds!.includes(claim.entityId))).map(([id,p])=>({id,description:p.definition.description,value:p.value,schema:p.definition.schema,writes:p.definition.writes,status:p.status,...(p.operationId?{operationId:p.operationId}:{}),...(p.error?{error:p.error}:{})})),
   actions:[...this.actions].map(([id,action])=>({id,description:action.description,inputSchema:action.inputSchema,writes:action.writes,isAvailable:!this.disabled.has(id),...(this.disabled.has(id)?{unavailableReason:this.disabled.get(id)!}:{})})),
  };
 }
 snapshot():API.WorldSnapshot{
  const engine=this.engine.snapshot();return {...(this.training?{training:this.training.snapshot()}:{}),schemaVersion:2,worldRevision:this.revision,simulationTick:engine.simulationTick,simulationSeconds:engine.simulationSeconds,isRunning:engine.isRunning,...(engine.controlledEntityId?{controlledEntityId:engine.controlledEntityId}:{}),camera:this.training?.cameraSnapshot()??this.engine.cameraRig.snapshot(),entities:[...this.entries.keys()].map(id=>this.getEntityState(id)),errors:[...this.errors,...engine.errors.map(error=>runtimeError(error.message,error.code,error.entityId?[error.entityId]:[]))]};
 }
 private installObserver():void{
  if(!this.renderer||!this.engine.controlledEntityId||typeof window==='undefined')return;const world=this;
  const observer:API.WorldObservation={withPresentation:(work,options)=>world.engine.withPresentation(work,1,options?.view),ready:true,scene:this.scene,camera:this.camera,renderer:this.renderer,episode:this.episodePort(),
   get presentation(){return world.presentation;},
   get player(){return world.entity(world.engine.controlledEntityId!).object;},get targets(){return world.captureObservation().targets;},
   get captureTargetIds(){return world.captureObservation().captureTargetIds;},get targetRepresentativesById(){return world.captureObservation().targetRepresentativesById;},
   get targetFrontYawRadiansById(){return Object.fromEntries([...world.entries].map(([id,entry])=>[id,entry.options.frontYawRadians??0]));},
   startLive:()=>world.start(),stopLive:()=>world.stop(),reset:()=>world.reset(),snapshot:()=>world.snapshot(),inspect:()=>({snapshot:world.snapshot(),physics:world.engine.physics.audit(),inputTranscript:[...world.engine.keyboard.transcript]}),capabilities:()=>world.describe(),execute:(command,options)=>world.execute(command,options),operation:id=>world.operations.get(id)};
  const target=window as unknown as Record<string,unknown>;target.__WORLDKIT_EVAL__=observer;target.__WORLDKIT_CREATOR__=observer;this.observer=observer;
 }
 private episodePort():EpisodeRuntimePort{
  const world=this;
  const controlled=()=>{world.alive();const id=world.engine.controlledEntityId;if(!id)throw failure('EPISODE_CONTROL_REQUIRED');return world.entity(id);};
  const validateStart=(start:EpisodeStart)=>{if(!start||typeof start!=='object')throw failure('EPISODE_START_INVALID');vec(start.positionWorldMetersXYZ);if(!Number.isFinite(start.facingYawRadians))throw failure('EPISODE_START_FACING_INVALID');if(start.cameraPerspective!==undefined&&!['first-person','third-person'].includes(start.cameraPerspective))throw failure('EPISODE_START_CAMERA_INVALID');};
  const requirePrepared=()=>{world.alive();if(world.engine.isRunning)throw failure('EPISODE_LIVE_CLOCK_ACTIVE');if(world.episodeLease?.state!=='prepared')throw failure('EPISODE_SEGMENT_NOT_PREPARED');};
  const release=()=>{const lease=world.episodeLease;if(!lease)return;
   const host=world.training?trainingHost(world.training):undefined;
   if(host&&!host.isDisposed())host.clearInput();
   for(const operationId of world.trainingActivities.keys()){try{world.operations.cancel(operationId);}catch{/* Atomic or clearance-constrained actions retain their truthful state until completion/reset. */}}
   world.episodeLease=undefined;if(host&&!host.isDisposed())host.setEpisodeOwned(false);world.engine.stop();lease.restoreViewport();};
  return {schemaVersion:1,
   capabilities(){const entry=controlled(),settings=world.engine.physics.characterSettings(entry.id),bounds=new THREE.Box3();
    for(const candidate of world.entries.values())if(candidate.role!=='decoration'){
     bounds.union(new THREE.Box3().setFromObject(candidate.object));
     if(candidate.body){const body=world.engine.physics.characterSettings(candidate.id),position=worldPose(candidate.object).position;bounds.expandByPoint(position.clone().add(new THREE.Vector3(-body.radiusMeters,0,-body.radiusMeters)));bounds.expandByPoint(position.clone().add(new THREE.Vector3(body.radiusMeters,body.heightMeters,body.radiusMeters)));}
    }
    if(bounds.isEmpty())bounds.expandByPoint(worldPose(entry.object).position);
    if(world.training){bounds.min.set(...world.training.environment.map.bounds.min);bounds.max.set(...world.training.environment.map.bounds.max);}
    return {...(world.training?{training:world.training.episodeCapabilities()}:{}),schemaVersion:1,controlledEntityId:entry.id,fixedTimeStepSeconds:world.engine.fixedTimeStepSeconds,worldBounds:{minimumWorldMetersXYZ:tuple(bounds.min),maximumWorldMetersXYZ:tuple(bounds.max)},
    movement:{kind:entry.movementId==='ground'?'ground':'custom',movementId:entry.movementId,walkSpeedMetersPerSecond:settings.walkSpeedMetersPerSecond,runSpeedMetersPerSecond:settings.runSpeedMetersPerSecond,jumpSpeedMetersPerSecond:settings.jumpSpeedMetersPerSecond,heightMeters:settings.heightMeters,radiusMeters:settings.radiusMeters,maximumStepHeightMeters:settings.maximumStepHeightMeters,maximumSlopeRadians:settings.maximumSlopeRadians},
    camera:{mode:world.cameraMode,segmentInitialization:'relative-authored-pose'},maximumStartAlignmentMeters:MAXIMUM_EPISODE_START_ALIGNMENT_METERS};},
   probeStart(start){validateStart(start);return world.training?world.training.probeEpisodeStart(start):world.engine.physics.probeCharacterStart(controlled().id,start.positionWorldMetersXYZ);},
   async prepareSegment(start,viewport){
    world.alive();validateStart(start);
    if(!viewport||![viewport.widthPixels,viewport.heightPixels].every(n=>Number.isSafeInteger(n)&&n>0&&n<=8192))throw failure('EPISODE_VIEWPORT_INVALID');
    if(world.episodeLease?.state==='preparing')throw failure('EPISODE_PREPARATION_IN_PROGRESS');
    release();const renderer=world.renderer;if(!renderer)throw failure('EPISODE_RENDERER_REQUIRED');
    const size=renderer.getSize(new THREE.Vector2()),pixelRatio=renderer.getPixelRatio(),camera=world.camera.clone();
    const lease:{state:'preparing'|'prepared';restoreViewport:()=>void}={state:'preparing',restoreViewport:()=>{
     renderer.setPixelRatio(pixelRatio);renderer.setSize(size.x,size.y,false);
     if(world.camera instanceof THREE.PerspectiveCamera&&camera instanceof THREE.PerspectiveCamera){world.camera.aspect=camera.aspect;world.camera.updateProjectionMatrix();}
     else if(world.camera instanceof THREE.OrthographicCamera&&camera instanceof THREE.OrthographicCamera){world.camera.left=camera.left;world.camera.right=camera.right;world.camera.top=camera.top;world.camera.bottom=camera.bottom;world.camera.updateProjectionMatrix();}
    }};
    world.episodeLease=lease;if(world.training)trainingHost(world.training).setEpisodeOwned(true);world.engine.stop();
    try{
     await world.resetState();if(world.disposed||world.episodeLease!==lease)throw failure('EPISODE_PREPARATION_CANCELLED');
     const entry=controlled(),probe=world.training?world.training.probeEpisodeStart(start):world.engine.physics.probeCharacterStart(entry.id,start.positionWorldMetersXYZ);
     if(!probe.isValid)throw failure(probe.diagnostics[0]!.code,probe.diagnostics[0]!.message,'content',probe.diagnostics[0]!.entityIds);
     renderer.setPixelRatio(1);world.engine.resize(viewport.widthPixels,viewport.heightPixels);
     if(world.training)trainingHost(world.training).prepareEpisodeStart({...start,positionWorldMetersXYZ:probe.resolvedPositionWorldMetersXYZ});else world.engine.prepareEpisodeStart(probe.resolvedPositionWorldMetersXYZ,start.facingYawRadians);
     if(start.cameraPerspective!==undefined){
      if(world.training)trainingHost(world.training).command({type:'training.camera',mode:start.cameraPerspective==='first-person'?1:0});
      else world.engine.cameraRig.setPerspective(start.cameraPerspective);
     }
     world.engine.step({},1);world.engine.render();
     if(world.snapshot().errors.length)throw failure('EPISODE_PREPARATION_RUNTIME_ERROR');
     lease.state='prepared';return world.snapshot();
    }catch(error){if(world.episodeLease===lease)release();throw error;}
   },
   execute(command){requirePrepared();if(!command||!['training.action','training.input','training.enter','training.exit'].includes(command.type))return Promise.resolve({status:'rejected',commandId:`episode-command-${++world.nextCommand}`,worldRevision:world.revision,error:failure('EPISODE_COMMAND_UNSUPPORTED')});return world.executeTraining(command,{},world.episodeLease);},
   operation(operationId){requirePrepared();return world.operations.get(operationId);},
   advance(input,ticks){requirePrepared();world.engine.step(input,ticks);return world.snapshot();},
   frame(mimeType){requirePrepared();if(mimeType!=='image/jpeg'&&mimeType!=='image/png')throw failure('EPISODE_FRAME_TYPE_INVALID');
    world.engine.render();world.camera.updateWorldMatrix(true,false);const renderer=world.renderer!;
    // Formal Episode pixels come only from the original world renderer, regardless of UI or model output.
    return {captureSurface:'world-renderer-canvas',imageDataUrl:renderer.domElement.toDataURL(mimeType),snapshot:world.snapshot(),camera:{projectionMatrix:[...world.camera.projectionMatrix.elements],viewMatrix:[...world.camera.matrixWorldInverse.elements],cameraToWorldMatrix:[...world.camera.matrixWorld.elements],controlForwardWorldXYZ:world.engine.controlForwardWorldXYZ()}};
   },release,
  };
 }
 /** Headless/Host verification uses the same fixed engine; no synthetic position updates. */
 step(input:API.WorldInput={},ticks=1):API.WorldSnapshot{if(this.episodeLease)throw failure('EPISODE_CAPTURE_OWNS_CLOCK');this.engine.step(input,ticks);return this.snapshot();}
 render():void{this.engine.render();}
 resize(width:number,height:number):void{this.engine.resize(width,height);}
 dispose():void{
  if(this.disposed)return;const lease=this.episodeLease;this.episodeLease=undefined;if(this.training&&!trainingHost(this.training).isDisposed())trainingHost(this.training).setEpisodeOwned(false);lease?.restoreViewport();this.epoch++;this.disposed=true;for(const scope of this.scopes)scope.abort();this.retireTrainingActivities();this.operations.cancelAll();
  for(const queued of this.queued.splice(0))queued.resolve({status:'rejected',commandId:queued.commandId,worldRevision:this.revision,error:failure('WORLD_DISPOSED')});
  this.presentation?.dispose();this.changes.clear();this.engine.dispose();this.assets.dispose();for(const resource of this.ownedResources)try{resource.dispose();}catch(error){this.errors.push(runtimeError(error,'dispose'));}
  for(const callback of this.disposals)try{callback();}catch(error){this.errors.push(runtimeError(error,'dispose'));}
  if(typeof window!=='undefined'){const target=window as unknown as Record<string,unknown>;if(target.__WORLDKIT_EVAL__===this.observer)delete target.__WORLDKIT_EVAL__;if(target.__WORLDKIT_CREATOR__===this.observer)delete target.__WORLDKIT_CREATOR__;}
 }
}
export async function createWorld(options:WorldOptions={}):Promise<ThreeWorld>{return ThreeWorld.create(options);}
