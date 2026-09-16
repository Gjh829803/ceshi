import type {RuntimeSample} from "./contracts";
import { CameraSubjectVisibility } from "./camera/subject-visibility";
import { cameraControlForward } from "./camera/control-basis";
import { cameraPositionAnchor } from "./camera/subject";
import {createHumanoidCameraDocument} from './config/camera/index';
import {createCameraEditSession,type CameraEditSession} from './camera/editing';
import {readCameraWorldPose} from './camera-observation';
import {compileBoundaryBoxes,type BoundaryDefinition,type BoundaryBox} from './boundaries';
import {ActorResources,actorResources} from './actor-resources';
import * as THREE from 'three';
import { playLocomotion } from './assets.js';
import type { CameraPointerInput } from './input.js';
import {CameraController} from './camera/controller';
import {relocateCameraProposal} from './camera/lifecycle';
import {WorldCameraSubjects} from './camera/world-subject';
import {WorldPresentationContext} from './camera/presentation-context';
import {authoredCameraProposal,immediateOpeningNeedsAdoption} from './camera/world-adapters';
import {applyCameraPresentation,validateCameraParent} from './camera/presentation';
import {parseCameraDocument,type CameraDocument} from './config/camera/index';
import type {CameraControlBasis} from './camera/state';
import { DEFAULT_CHARACTER_OPTIONS } from './config/physics';
import { runtimeError } from './control-support';
import type { AssetInstance,CharacterDrive,CharacterEntityOptions,CharacterOptions,EntityOptions,EntityState,PhysicsOptions,Vec3,WorldCommand,WorldInput,WorldObservation,WorldSnapshot } from './engine-contracts.js';
import { geometrySignature,setEntityBoundary,worldPose } from './geometry.js';
import { humanoidHost } from './humanoid-runtime/host-access';
import { HumanoidRuntime,type HumanoidRuntimeOptions } from './humanoid-runtime/runtime.js';
import { emptyInput } from './humanoid-runtime/simulation';
import { WorldInputRouter,WorldKeyboard } from './input.js';
import { LocomotionAnimation } from './locomotion-animation.js';
import { ThreeNavigation,type NavigationSteering } from './navigation.js';
import { ThreePhysics } from './physics.js';
import { ownViewport } from './viewport.js';

type Entity = {
  releaseHumanoid?:()=>void;
  options: EntityOptions; object: THREE.Object3D; character?: CharacterOptions; asset?: AssetInstance;
  initialParent: THREE.Object3D | null; initialPosition: THREE.Vector3; initialQuaternion: THREE.Quaternion; initialScale: THREE.Vector3; initialVisible: boolean;
  initialMatrix: THREE.Matrix4; initialMatrixAutoUpdate: boolean;
};
type ActorGoal = { resourceOwner:object; kind: 'move' | 'follow'; points: Vec3[]; index: number; run: boolean; targetEntityId?: string; distanceMeters: number; lastPosition: THREE.Vector3; stagnantSeconds: number; repathSeconds: number; navigationSignature: string };
export type CameraFollow = import('./contracts').CameraFollowOptions;
export type WorldOptions = {
  scene?: THREE.Scene; camera?: THREE.Camera; canvas?: HTMLCanvasElement; renderer?: THREE.WebGLRenderer;
  physics?: PhysicsOptions; fixedTimeStepSeconds?: number; navigation?: boolean;
  boundaries?: readonly BoundaryDefinition[];
  humanoid?:HumanoidRuntimeOptions;
};
export type CommandResult = { status: 'applied' | 'rejected'; revision: number; error?: { code: string; message: string } };
/** CPU wall time spent advancing one realtime frame, including all fixed steps.
 * Excludes presentation, rendering, GPU execution and observer callbacks. */
export type WorldFrameTiming = Readonly<{source:'realtime';simulationTick:number;sampledAtMilliseconds:number;cpuUpdateMilliseconds:number}>;
const position = (object: THREE.Object3D): THREE.Vector3 => worldPose(object).position;
const tuple = (value: THREE.Vector3): Vec3 => [value.x, value.y, value.z];
const finiteVec = (value: unknown, label: string): Vec3 => {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100_000)) throw new Error(`WORLD_VALUE_INVALID: ${label} requires three finite coordinates`);
  return value as unknown as Vec3;
};
function requireId(id: string): void { if (typeof id !== 'string' || !id.trim() || id !== id.trim() || id.length > 256 || /[\u0000-\u001f]/.test(id)) throw new Error('WORLD_ENTITY_ID_INVALID'); }

/** Normal Three objects plus one physics/input/lifecycle owner. */
export class WorldEngine {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly renderer: THREE.WebGLRenderer | undefined;
  readonly physics: Pick<ThreePhysics,keyof ThreePhysics>;
  readonly humanoid:HumanoidRuntime|undefined;
  readonly keyboard: WorldKeyboard;
  readonly fixedTimeStepSeconds: number;
  private readonly navigation: ThreeNavigation | undefined;
  get navigationEnabled(): boolean { return this.navigation !== undefined; }
  private readonly entities = new Map<string, Entity>();
  private readonly boundaryIds: ReadonlySet<string>;
  private readonly prototypes = new Map<string, () => EntityOptions | CharacterEntityOptions>();
  private readonly goals = new Map<string, ActorGoal>();
  private readonly updates = new Set<(context: { world: WorldEngine; deltaSeconds: number; simulationTick: number }) => void>();
  private readonly resets = new Set<() => void>();
  private readonly disposals = new Set<() => void>();
  private readonly interactions = new Map<string, Set<(context: { world: WorldEngine; entityId: string; actorEntityId?: string }) => void>>();
  private readonly failures: WorldSnapshot['errors'][number][] = [];
  private readonly retired = new Set<Entity>();
  private baseline: Map<string, Entity> | undefined;
  private controlledInitial: string | undefined;
  readonly cameraController:CameraController;
  readonly cameraSubjects:WorldCameraSubjects;
  private readonly presentationContext=new WorldPresentationContext();
  private readonly cameraSubjectVisibility = new CameraSubjectVisibility();
  private cameraBasis:CameraControlBasis|undefined;
  private fixedTransaction=false;
  private displayTransaction=false;
  private authorCallbackDepth=0;
  private resetting=false;
  readonly resources:ActorResources;
  private nextResourceOwner=0;
  private readonly afterUpdates = new Set<() => void>();
  private readonly runtimeObservers = new Set<(sample:RuntimeSample)=>void>();
  private observedFrameId=0;
  onRuntimeSample(callback:(sample:RuntimeSample)=>void):()=>void {this.alive();this.runtimeObservers.add(callback);return()=>{this.runtimeObservers.delete(callback);};}
  private emitRuntimeSample(sample:RuntimeSample):void {
    for(const callback of this.runtimeObservers)try{callback(structuredClone(sample));}catch(error){
      this.runtimeObservers.delete(callback);console.warn('WORLD_RUNTIME_OBSERVER_DETACHED',error);
    }
  }
  private driveProvider: ((id:string,input:WorldInput,direction:Vec3,dt:number)=>{drive:CharacterDrive;facing?:Vec3;actionId?:string}|undefined)|undefined;
  private pointerInput: CameraPointerInput = {};
  private readonly jumped = new Set<string>();
  private readonly locomotionAnimations = new Map<string, LocomotionAnimation>();
  private readonly taskResults = new Map<string,{status:'running'|'succeeded'|'failed';error?:string}>();
  private readonly inputRouter: WorldInputRouter;
  private readonly renders = new Set<(interpolationAlpha:number) => void>();
  private readonly frameTimings = new Set<(sample:WorldFrameTiming)=>void>();
  private controlled: string | undefined;
  private tick = 0;
  private revision = 0;
  private running = false;
  private disposed = false;
  private accumulatorSeconds = 0;
  private lastFrameTime = 0;
  private frameId = 0;
  private frameGeneration = 0;
  private renderPreparation: Promise<unknown> | undefined;
  private pendingInputEdges={interact:false,jump:false,cameraToggle:false,humanoidJump:false,actions:{} as Record<string,boolean>};
  private previousJump = false;
  private previousInteract = false;
  private navigationDirty = true;
  private navigationSignature = '';
  private readonly ownsRenderer: boolean;
  private observer: WorldObservation | undefined;
  private resetHandler:(()=>void)|undefined;
  private releaseViewport:(()=>void)|undefined;

  private constructor(options: WorldOptions, physics: Pick<ThreePhysics,keyof ThreePhysics>, navigation: ThreeNavigation | undefined, private readonly boundaryBoxes: readonly BoundaryBox[]) {
    this.boundaryIds = new Set(boundaryBoxes.map(boundary => boundary.id));
    this.scene = options.scene ?? new THREE.Scene();
    this.camera = options.camera ?? new THREE.PerspectiveCamera(55, 16 / 9, 0.05, 3000);
    this.renderer = options.renderer ?? (options.canvas ? new THREE.WebGLRenderer({ canvas: options.canvas, antialias: true, preserveDrawingBuffer: true }) : undefined);
    this.ownsRenderer = options.renderer === undefined;
    this.physics = physics; this.navigation = navigation;
    this.humanoid=physics instanceof HumanoidRuntime?physics:undefined;
    this.resources=this.humanoid?humanoidHost(this.humanoid).resources:new ActorResources();
    this.cameraSubjects=new WorldCameraSubjects(id=>this.entities.get(id),id=>this.physics.state(id)?.velocityMetersPerSecondXYZ,this.humanoid?{
      sampleCamera:(binding,generation,display)=>humanoidHost(this.humanoid!).sampleCamera(binding,generation,display),
      cameraOperation:binding=>humanoidHost(this.humanoid!).cameraOperation(binding),
    }:undefined);
    this.cameraController=new CameraController({entityGeneration:id=>this.cameraSubjects.generation(id),sampleSubject:binding=>this.cameraSubjects.sample(binding),geometry:({subject})=>this.humanoid?humanoidHost(this.humanoid).cameraGeometry(subject):{probe:(from,to,radius)=>this.physics.castCameraArm(from,to,radius,subject.id)}});
    if(this.humanoid)humanoidHost(this.humanoid).bindCamera({assertExternalMutation:()=>this.assertLifecycleMutationAllowed(),follow:options=>this.setCameraFollow(options),view:(id,cut)=>this.setCameraView(id,cut),authored:()=>this.useAuthoredCamera(),inspect:()=>this.cameraController.inspect(),snapshot:()=>this.cameraSnapshot(),forward:()=>this.controlForwardWorldXYZ(),changed:()=>{if(!this.fixedTransaction&&!this.resetting)this.syncCameraLifecycle();}});
    this.fixedTimeStepSeconds = options.fixedTimeStepSeconds ?? 1 / 60;
    if (!Number.isFinite(this.fixedTimeStepSeconds) || this.fixedTimeStepSeconds < 1 / 240 || this.fixedTimeStepSeconds > 1 / 20) throw new Error('WORLD_TIMESTEP_INVALID');
    this.keyboard = new WorldKeyboard(() => this.tick, () => {if(this.resetHandler)this.resetHandler();else this.reset();});
    this.inputRouter = new WorldInputRouter(this.keyboard, {
      isRunning: () => this.running,
      canZoom:()=>this.cameraMode!=='authored'&&this.cameraController.inspect().resolved?.kind!=='first-person',
      wantsPointerLock:()=>this.cameraMode==='follow'&&this.cameraController.inspect().resolved?.kind==='first-person',
      onPointer: input => { this.pointerInput = { activate: true,
        yawDeltaRadians: (this.pointerInput.yawDeltaRadians ?? 0) + (input.yawDeltaRadians ?? 0),
        pitchDeltaRadians: (this.pointerInput.pitchDeltaRadians ?? 0) + (input.pitchDeltaRadians ?? 0),
        distanceDeltaMeters: (this.pointerInput.distanceDeltaMeters ?? 0) + (input.distanceDeltaMeters ?? 0) }; },
      onRelease: () => { this.pointerInput = {};if(this.humanoid&&!humanoidHost(this.humanoid).isDisposed())humanoidHost(this.humanoid).clearInput(); },
    });
    if (typeof window !== 'undefined' && this.renderer) { this.keyboard.attach(window); this.inputRouter.bind(this.renderer.domElement);if(this.ownsRenderer)this.releaseViewport=ownViewport(this.renderer,this.camera,this.renderer.domElement); }
  }
  static async create(options: WorldOptions = {}): Promise<WorldEngine> {
    if (options.humanoid && options.boundaries !== undefined) throw new Error('WORLD_HUMANOID_BOUNDARIES_LOCATION: Use humanoid.map.boundaries (createHumanoidWorld: map.boundaries), not top-level boundaries.');
    const boundaries = compileBoundaryBoxes(options.boundaries === undefined ? [] : options.boundaries);
    if(options.humanoid&&options.fixedTimeStepSeconds!==undefined&&options.fixedTimeStepSeconds!==1/60)throw new Error('HUMANOID_REQUIRES_60HZ');
    if(options.humanoid&&!options.camera)options={...options,camera:new THREE.PerspectiveCamera(55,16/9,.05,3000)};
    const physics = options.humanoid?await HumanoidRuntime.create(options.humanoid,options.camera!):await ThreePhysics.create(options.physics, boundaries);
    let navigation: ThreeNavigation | undefined;
    try { navigation = options.navigation === false ? undefined : await ThreeNavigation.create(); return new WorldEngine(options, physics, navigation, boundaries); }
    catch (error) { navigation?.dispose(); physics.dispose(); throw error; }
  }
  get simulationTick(): number { return this.tick; }
  get isRunning(): boolean { return this.running; }
  get controlledEntityId(): string | undefined { return this.controlled; }
  get controlledHumanoid():HumanoidRuntime|undefined{return this.controlled&&this.humanoid?.hasActor(this.controlled)?this.humanoid:undefined;}
  get cameraMode(){return this.cameraController.inspect().mode;}
  setCameraPerformanceDiagnosticsEnabled(enabled:boolean):void{this.assertLifecycleMutationAllowed();this.cameraController.setPerformanceDiagnosticsEnabled(enabled);}
  setCameraCollisionDiagnosticsEnabled(enabled:boolean):void{this.assertLifecycleMutationAllowed();this.cameraController.setCollisionDiagnosticsEnabled(enabled);}
  inspectCamera(){return this.cameraController.inspect();}
  beginCameraEdit(check:(mutation:boolean)=>void):CameraEditSession {
    check(false);
    this.cameraMutation();
    return createCameraEditSession(this.cameraController,{
      check:mutation=>{
        check(mutation);
        this.cameraMutation();
        if(mutation&&this.camera instanceof THREE.PerspectiveCamera)validateCameraParent(this.camera);
      },
      apply:document=>this.setCameraFollow({configuration:document}),
      resume:()=>this.resumeCameraViewSelection(),
      undo:document=>{
        this.cameraController.restoreConfiguration(document,this.cameraFrame());
        this.cameraSubjects.adopt(document.binding);
        this.cameraBasis=undefined;
        this.writeCamera();
      },
      commit:()=>{
        this.cameraController.validateBaselineReference(this.cameraFrame());
        this.cameraController.commitBaseline(this.cameraMode==='authored'?{authoredPose:authoredCameraProposal(this.camera),frame:this.cameraFrame()}:undefined);
      },
      changed:()=>{
        const binding=this.inspectCamera().document?.binding;
        if(binding&&this.cameraMode!=='authored')this.cameraSubjects.adopt(binding);
        else this.cameraSubjects.clear();
        this.cameraBasis=undefined;
        this.writeCamera();
      },
      opening:(document,options)=>this.cameraController.createOpeningDraft(document,options,this.cameraFrame()),
    });
  }
  cameraSnapshot():import('./contracts').CameraState {
    const value=this.inspectCamera(),{source:_source,sourceSubject:_subject,...transition}=value.transition.kind==='blend'?value.transition:{...value.transition,source:undefined,sourceSubject:undefined},pose=value.mode==='authored'?undefined:value.current;
    const actual=pose?{position:new THREE.Vector3(...pose.positionWorldMetersXYZ),rotation:new THREE.Quaternion(...pose.quaternionWorldXYZW)}:readCameraWorldPose(this.camera);
    return {...(value.viewSelection?{viewSelection:value.viewSelection}:{}),viewId:value.resolved?.viewId??null,viewKind:value.resolved?.kind??null,documentHash:value.documentHash??null,configurationRevision:value.configurationRevision,cameraCommitRevision:value.cameraCommitRevision,lifecycleGeneration:value.current?.lifecycleGeneration??null,logicalTargetId:value.resolved?value.document!.binding.targetEntityId:null,resolvedSubjectId:value.resolved?.subjectId??null,subjectGeneration:value.resolved?.subjectGeneration??null,transition,mode:value.mode,desiredYawRadians:value.intent?.yawRadians??null,desiredPitchRadians:value.intent?.pitchRadians??null,desiredPositionWorldMetersXYZ:value.desired?[...value.desired.positionWorldMetersXYZ]:null,positionWorldMetersXYZ:tuple(actual.position),orientationWorldQuaternionXYZW:actual.rotation.toArray(),...(value.diagnostics?.status==='measured'?{actualArmDistanceMeters:value.diagnostics.effectiveDistanceMeters,safeArmDistanceMeters:value.diagnostics.safeDistanceMeters,collisionPhase:value.diagnostics.phase,...(value.diagnostics.colliderEntityId?{obstructionEntityId:value.diagnostics.colliderEntityId}:{})}:{}),...(value.resolved?{subjectEntityId:value.resolved.subjectId,targetPositionWorldMetersXYZ:pose!.pivotWorldMetersXYZ,desiredArmDistanceMeters:value.intent!.distanceMeters,desiredYawRadians:value.intent!.yawRadians,desiredPitchRadians:value.intent!.pitchRadians}:{})};
  }
  private cameraFrame(){return {lifecycleGeneration:this.cameraSubjects.lifecycle(),simulationTick:this.tick,aspect:this.camera instanceof THREE.PerspectiveCamera?this.camera.aspect:1};}
  runAuthorCallback<T>(callback:()=>T):T{this.authorCallbackDepth++;try{return callback();}finally{this.authorCallbackDepth--;}}
  assertLifecycleMutationAllowed():void{this.alive();if(this.fixedTransaction||this.displayTransaction||this.authorCallbackDepth)throw new Error('WORLD_TRANSACTION_REENTRY');}
  private cameraMutation():void {this.alive();if(this.fixedTransaction||this.displayTransaction||this.authorCallbackDepth)throw new Error('CAMERA_TRANSACTION_REENTRY');}
  private writeCamera():void{const value=this.inspectCamera().current;if(value&&this.camera instanceof THREE.PerspectiveCamera)applyCameraPresentation(this.camera,value,this.cameraFrame().aspect);}
  private episodeCameraPreparing=false;
  private syncCameraLifecycle():void {
    if(this.episodeCameraPreparing)return;
    const document=this.inspectCamera().document;if(!document||this.cameraMode==='authored')return;
    const event=this.cameraSubjects.event(document.binding);if(!event)return;
    try{this.cameraController.applyLifecycle(event,this.cameraFrame());this.cameraSubjects.adopt(document.binding);if(!this.fixedTransaction)this.cameraBasis=undefined;this.writeCamera();}catch(error){this.recordError('WORLD_CAMERA_LIFECYCLE_FAILED',error);this.stop();throw error;}
  }
  cameraTargetRemoved(id:string,generation:number):void{const current=this.inspectCamera().current;const identity=current?.logicalTargetId===id?{id:current.resolvedSubjectId,generation:current.subjectGeneration}:{id,generation};this.cameraController.targetRemoved(identity,this.cameraFrame());if(this.cameraMode==='authored')this.cameraSubjects.clear();}
  useAuthoredCamera():THREE.Camera{this.cameraMutation();this.cameraController.useAuthored();this.cameraSubjects.clear();this.cameraBasis=undefined;this.inputRouter.releasePointerLock();return this.camera;}
  private alive(): void { if (this.disposed) throw new Error('WORLD_DISPOSED'); }
  private entity(id: string): Entity { const entity = this.entities.get(id); if (!entity) throw new Error(`WORLD_ENTITY_NOT_FOUND: ${id}`); return entity; }
  getObject(id: string): THREE.Object3D { return this.entity(id).object; }
  addEntity(options: EntityOptions): THREE.Object3D { return this.register(options); }
  addCharacter(options: CharacterEntityOptions,prevalidatedHumanoid=false): THREE.Object3D { return this.register({ ...options, role: 'actor' }, { ...DEFAULT_CHARACTER_OPTIONS, ...options.character }, options.asset,prevalidatedHumanoid); }
  private register(options: EntityOptions, character?: CharacterOptions, asset?: AssetInstance,prevalidatedHumanoid=false): THREE.Object3D {
    this.alive(); requireId(options.id);
    if (this.entities.has(options.id) || this.boundaryIds.has(options.id)) throw new Error(`WORLD_ENTITY_DUPLICATE: ${options.id}`);
    if (!(options.object instanceof THREE.Object3D) || [...this.entities.values()].some(e => e.object === options.object)) throw new Error('WORLD_OBJECT_INVALID_OR_REGISTERED');
    if (options.frontYawRadians !== undefined && !Number.isFinite(options.frontYawRadians)) throw new Error('WORLD_FRONT_YAW_INVALID');
    if (options.role === 'terrain' && options.physics?.kind === 'none') throw new Error('WORLD_TERRAIN_REQUIRES_COLLISION');
    const binding=(options as CharacterEntityOptions).runtimeActor;
    if(binding&&!this.humanoid)throw new Error('HUMANOID_RUNTIME_REQUIRED');
    const releaseHumanoid=binding?.animation?humanoidHost(this.humanoid!).claimCharacter(options.id,binding.animation):undefined;
    const previousParent = options.object.parent;
    if (!previousParent) this.scene.add(options.object);
    const physics = options.physics ?? (options.role === 'terrain' || options.role === 'obstacle' ? { kind: 'fixed' as const } : { kind: 'none' as const });
    setEntityBoundary(options.object, true);
    try {
      if (character !== undefined) {
        if(binding)humanoidHost(this.humanoid!).bindCharacter(options.id,binding,(options as CharacterEntityOptions).character,prevalidatedHumanoid);
        this.physics.addCharacter(options.id, options.object, character);
      }
      else if (physics.kind !== 'none') this.physics.addRigid(options.id, options.object, physics);
      this.physics.refreshMany(this.physicalAncestors(options.object));
    } catch (error) { this.physics.remove(options.id);releaseHumanoid?.(); setEntityBoundary(options.object, false); if (!previousParent) options.object.removeFromParent(); throw error; }
    const entity: Entity = { ...(releaseHumanoid?{releaseHumanoid}:{}),options: { ...options, physics }, object: options.object,
      initialParent: options.object.parent, initialPosition: options.object.position.clone(), initialQuaternion: options.object.quaternion.clone(), initialScale: options.object.scale.clone(), initialVisible: options.object.visible,
      initialMatrix: options.object.matrix.clone(), initialMatrixAutoUpdate: options.object.matrixAutoUpdate,
      ...(character === undefined ? {} : { character }), ...(asset === undefined ? {} : { asset }) };
    this.entities.set(options.id, entity); if(binding)humanoidHost(this.humanoid!).commitCharacterOwnership(options.id); this.navigationDirty = true; this.revision += 1;
    return options.object;
  }
  setControlledEntity(id: string): void { if (this.entity(id).character === undefined) throw new Error('WORLD_CONTROL_REQUIRES_CHARACTER'); if(this.humanoid)humanoidHost(this.humanoid).setControlledActor(this.humanoid.hasActor(id)?id:undefined);this.controlled = id;this.updateKeyboardOwner();this.keyboard.clear();this.clearPendingInput(); }
  clearInput():void{this.inputRouter.clear();this.clearPendingInput();}
  private clearPendingInput():void{this.pendingInputEdges={interact:false,jump:false,cameraToggle:false,humanoidJump:false,actions:{}};this.previousJump=false;this.previousInteract=false;this.pointerInput={};}
  private updateKeyboardOwner():void{this.keyboard.setHumanoidMode(this.controlledHumanoid?()=>this.controlledHumanoid?.simulation.controlledActor.vehicle?.spec.mode:undefined);}
  registerPrototype(id: string, factory: () => EntityOptions | CharacterEntityOptions): void { requireId(id); if (this.prototypes.has(id)) throw new Error('WORLD_PROTOTYPE_DUPLICATE'); this.prototypes.set(id, factory); }
  onUpdate(callback: (context: { world: WorldEngine; deltaSeconds: number; simulationTick: number }) => void): () => void { this.updates.add(callback); return () => { this.updates.delete(callback); }; }
  onReset(callback: () => void): () => void { this.resets.add(callback); return () => { this.resets.delete(callback); }; }
  onDispose(callback: () => void): () => void { this.disposals.add(callback); return () => { this.disposals.delete(callback); }; }
  onInteract(id: string, callback: (context: { world: WorldEngine; entityId: string; actorEntityId?: string }) => void): () => void {
    this.entity(id); const handlers = this.interactions.get(id) ?? new Set(); handlers.add(callback); this.interactions.set(id, handlers); return () => { handlers.delete(callback); };
  }
  interact(id: string, actorEntityId = this.controlled): void { this.entity(id); for (const handler of this.interactions.get(id) ?? []) handler({ world: this, entityId: id, ...(actorEntityId ? { actorEntityId } : {}) }); }
  setCameraFollow(options:CameraFollow):void {
    this.cameraMutation();if(Object.keys(options).some(key=>key!=='configuration'))throw new Error('CAMERA_CONFIGURATION_ARGUMENTS_CONFLICT');if(!(this.camera instanceof THREE.PerspectiveCamera))throw new Error('CAMERA_PERSPECTIVE_REQUIRED');validateCameraParent(this.camera);
    const previous=this.inspectCamera();
    const document=parseCameraDocument(options.configuration);
    const selected=document.views[document.defaultViewId];
    const adopt=!previous.document&&selected?.kind==='third-person'&&!selected.opening&&(document.activation!=='immediate'||immediateOpeningNeedsAdoption(document,this.cameraSubjects.sample(document.binding),this.camera));
    this.cameraController.install(document,this.cameraFrame(),{initialVerticalFovDegrees:this.camera.fov,...(adopt?{authoredPose:authoredCameraProposal(this.camera)}:{})});
    this.cameraSubjects.adopt(this.inspectCamera().document!.binding);this.cameraBasis=undefined;this.writeCamera();this.inputRouter.releasePointerLock();
  }
  resumeCameraViewSelection(cut=false):void{this.cameraMutation();this.cameraController.resumeViewSelection(this.cameraFrame(),cut);this.cameraBasis=undefined;this.writeCamera();}
  setCameraView(viewId:string,cut=false):void{this.cameraMutation();if(this.camera instanceof THREE.PerspectiveCamera)validateCameraParent(this.camera);this.cameraController.setView(viewId,this.cameraFrame(),{cut});this.cameraBasis=undefined;this.writeCamera();this.inputRouter.releasePointerLock();}
  setCameraOrbit(options:import('./contracts').CameraOrbitOptions):void {
    this.cameraMutation();
    if(this.camera instanceof THREE.PerspectiveCamera)validateCameraParent(this.camera);
    this.cameraController.setOrbit(options,this.cameraFrame());
    this.cameraBasis=undefined;this.writeCamera();
  }
  bindInput(surface:HTMLElement,uiRoot:HTMLElement):()=>void {return this.inputRouter.bind(surface,uiRoot);}
  focusInput():void {this.inputRouter.focus();}
  onRender(callback:(interpolationAlpha:number)=>void):()=>void {this.renders.add(callback);return()=>{this.renders.delete(callback);};}
  onFrameTiming(callback:(sample:WorldFrameTiming)=>void):()=>void {this.frameTimings.add(callback);return()=>{this.frameTimings.delete(callback);};}
  setResetHandler(callback:()=>void):void{this.resetHandler=callback;}
  onAfterUpdate(callback:()=>void):()=>void {this.afterUpdates.add(callback);return()=>{this.afterUpdates.delete(callback);};}
  setDriveProvider(provider:NonNullable<WorldEngine['driveProvider']>):void {this.driveProvider=provider;}
  entityOptions(id:string):EntityOptions {return this.entity(id).options;}
  actorTaskState(id:string):{status:'running'|'succeeded'|'failed';error?:string}|undefined {return this.taskResults.get(id);}
  private clearGoal(id:string):void{const goal=this.goals.get(id);if(goal)this.resources.release(goal.resourceOwner);this.goals.delete(id);}
  navigationConflict(id:string){return this.resources.conflict(this.goals.get(id)?.resourceOwner,actorResources(id,['locomotion','animation']));}
  animationConflict(id:string){return this.resources.conflict(this.manualActions.get(id),actorResources(id,['animation']));}
  /** Validate sequential release/acquire intents against a disposable candidate table. */
  resourcePlanValidator():(type:string,id:string)=>void{
    const resources=this.resources.fork(),navigation=new Map([...this.goals].map(([id,goal])=>[id,goal.resourceOwner])),animations=new Map(this.manualActions);
    return(type,id)=>{
      if(type==='actor.stop'||type==='actor.set-movement'){const owner=navigation.get(id);if(owner)resources.release(owner);navigation.delete(id);return;}
      if(type==='entity.stop-action'){const owner=animations.get(id);if(owner)resources.release(owner);animations.delete(id);return;}
      if(type==='entity.play-action'){
        const owner=animations.get(id)??{};if(!resources.acquire(owner,actorResources(id,['animation']),{kind:'animation',id}))throw new Error('ACTOR_RESOURCE_BUSY');animations.set(id,owner);
      }
      if(type==='actor.move-to'||type==='actor.follow'||type==='actor.resume-autonomy'){
        const owner=navigation.get(id)??{};if(!resources.acquire(owner,actorResources(id,['locomotion','animation']),{kind:'navigation',id}))throw new Error('ACTOR_RESOURCE_BUSY');navigation.set(id,owner);
      }
    };
  }
  stopAction(id:string):void {const owner=this.manualActions.get(id);if(owner)this.resources.release(owner);this.manualActions.delete(id);}
  playAction(id:string,actionId:string,playback:'once'|'loop'='once'):void {
    const e=this.entity(id);if(!e.asset)throw new Error('WORLD_ENTITY_HAS_NO_ANIMATIONS');
    if(!e.asset.actionIds.includes(actionId)||!['once','loop'].includes(playback))throw new Error('WORLD_ANIMATION_INVALID');
    const previous=this.manualActions.get(id),owner=previous??{};
    if(!this.resources.acquire(owner,actorResources(id,['animation']),{kind:'animation',id:actionId}))throw new Error('ACTOR_RESOURCE_BUSY');
    try{e.asset.play(actionId,{playback});this.manualActions.set(id,owner);}catch(error){if(!previous)this.resources.release(owner);throw error;}
  }
  setRotation(id:string,rotation:Vec3):void {
    const entity=this.entity(id);const prior=entity.object.quaternion.clone();const matrix=entity.object.matrix.clone();
    entity.object.rotation.set(...rotation);if(!entity.object.matrixAutoUpdate)entity.object.matrix.compose(entity.object.position,entity.object.quaternion,entity.object.scale);
    entity.object.updateWorldMatrix(true,true,true);
    try{this.physics.refreshMany(this.physicalDescendants(entity.object));}catch(error){entity.object.quaternion.copy(prior);entity.object.matrix.copy(matrix);entity.object.updateWorldMatrix(true,true,true);throw error;}
    this.navigationDirty=true;
  }
  replaceGeometry(id:string,geometry:THREE.BufferGeometry):void {
    const entity=this.entity(id);const mesh=entity.object as THREE.Mesh;
    if(!mesh.isMesh||(mesh as THREE.SkinnedMesh).isSkinnedMesh||(mesh as THREE.InstancedMesh).isInstancedMesh)throw new Error('WORLD_GEOMETRY_REQUIRES_RIGID_MESH');
    const previous=mesh.geometry;mesh.geometry=geometry;
    try{this.physics.refreshMany(this.physicalDescendants(mesh));}catch(error){mesh.geometry=previous;throw error;}
    this.navigationDirty=true;
  }
  private sealInitialState(): void {
    if (this.baseline) return;
    if(this.humanoid&&this.inspectCamera().cameraCommitRevision===0)this.setCameraFollow({configuration:createHumanoidCameraDocument(this.humanoid.inputActorId)});
    this.humanoid?.validateInitialState();
    const authoredBaseline=this.cameraMode==='authored'?authoredCameraProposal(this.camera):undefined;
    this.baseline = new Map(this.entities);
    for (const entity of this.entities.values()) { entity.initialParent = entity.object.parent; if(!(entity.options as CharacterEntityOptions).runtimeActor){entity.initialPosition.copy(entity.object.position); entity.initialQuaternion.copy(entity.object.quaternion);} entity.initialScale.copy(entity.object.scale); entity.initialVisible = entity.object.visible; entity.initialMatrix.copy(entity.object.matrix); entity.initialMatrixAutoUpdate = entity.object.matrixAutoUpdate; }
    this.scene.updateMatrixWorld(true); this.camera.updateWorldMatrix(true, false);
    this.controlledInitial=this.controlled;this.humanoid?.sealInitialState();
    this.cameraController.commitBaseline(authoredBaseline?{authoredPose:authoredBaseline,frame:this.cameraFrame()}:undefined);
  }
  step(input: WorldInput = {}, ticks = 1): WorldSnapshot {
    this.validateStep(input,ticks);
    this.sealInitialState();
    for (let i = 0; i < ticks; i++) this.fixedStep(i === 0 ? input : { ...input, ...(input.cameraYawDeltaRadians===undefined?{}:{cameraYawDeltaRadians:0}),...(input.cameraPitchDeltaRadians===undefined?{}:{cameraPitchDeltaRadians:0}),...(input.cameraDistanceDeltaMeters===undefined?{}:{cameraDistanceDeltaMeters:0}), ...(input.humanoid?{humanoid:{...input.humanoid,jump:false,actions:{}}}:{}),...(input.jumpPressed === undefined ? {} : { jumpPressed: false }), ...(input.interactPressed === undefined ? {} : { interactPressed: false }), ...(input.cameraTogglePressed === undefined ? {} : { cameraTogglePressed: false }) });
    return this.snapshot();
  }
  validateStep(input:WorldInput,ticks:number):void{
    this.alive();if(!Number.isInteger(ticks)||ticks<0||ticks>36_000)throw new Error('WORLD_TICKS_INVALID');
    this.validateInput(input);
  }
  validateInput(input: WorldInput): void {
    if (!input || typeof input !== 'object') throw new Error('WORLD_INPUT_INVALID');
    if(input.humanoid){if(!this.controlledHumanoid)throw new Error('HUMANOID_INPUT_REQUIRES_CONTROLLED_ACTOR');this.controlledHumanoid.validateInput(input.humanoid);}
    for (const key of ['moveXRatio', 'moveZRatio', 'moveYRatio', 'cameraYawRatio', 'cameraPitchRatio'] as const) if (input[key] !== undefined && (!Number.isFinite(input[key]) || Math.abs(input[key]) > 1)) throw new Error('WORLD_INPUT_INVALID');
    for(const key of ['cameraYawDeltaRadians','cameraPitchDeltaRadians','cameraDistanceDeltaMeters'] as const)if(input[key]!==undefined&&!Number.isFinite(input[key]))throw new Error('WORLD_INPUT_INVALID');
    for (const key of ['run', 'jump', 'jumpPressed', 'interact', 'interactPressed', 'cameraTogglePressed'] as const) if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new Error('WORLD_INPUT_INVALID');
  }
  private faceDirection(entity: Entity, direction: THREE.Vector3): void {
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-direction.x, -direction.z) - (entity.options.frontYawRadians ?? 0));
    if (entity.object.parent) rotation.premultiply(worldPose(entity.object.parent).rotation.invert());
    if (!entity.object.matrixAutoUpdate) entity.object.matrix.decompose(entity.object.position, entity.object.quaternion, entity.object.scale);
    entity.object.quaternion.copy(rotation);
    if (!entity.object.matrixAutoUpdate) entity.object.matrix.compose(entity.object.position, entity.object.quaternion, entity.object.scale);
    entity.object.matrixWorldNeedsUpdate = true;
  }
  /** Shared input basis for both the fixed-step controller and Host route conversion. */
  controlForwardWorldXYZ(): Vec3 {
    const prepared = this.cameraBasis?.quaternionWorldXYZW;
    const committed = this.inspectCamera().current?.quaternionWorldXYZW;
    const quaternion = this.cameraMode === 'authored' || !committed
      ? this.camera.getWorldQuaternion(new THREE.Quaternion()).toArray()
      : prepared ?? committed;
    return cameraControlForward(quaternion);
  }
  episodeCameraBaseline(){return this.cameraController.episodeBaseline();}
  prepareEpisodeCamera(viewId:string|undefined,place:()=>void):void {
    this.cameraMutation();
    if(this.camera instanceof THREE.PerspectiveCamera)validateCameraParent(this.camera);
    const binding={targetEntityId:this.controlled!,mountTarget:'actor' as const};
    const before=viewId===undefined&&this.cameraMode==='authored'
      ?{pose:authoredCameraProposal(this.camera),subject:this.cameraSubjects.sample(binding)}:undefined;
    if(before&&!before.subject)throw new Error('EPISODE_CONTROL_REQUIRED');
    this.episodeCameraPreparing=true;
    try{
      place();
      if(viewId!==undefined){
        this.cameraController.prepareEpisodeView(viewId,this.cameraFrame());
        this.cameraSubjects.adopt(this.inspectCamera().document!.binding);
      }else if(before){
        const subject=this.cameraSubjects.sample(binding);
        if(!subject)throw new Error('EPISODE_CONTROL_REQUIRED');
        this.cameraController.commitAuthoredPose(relocateCameraProposal(before.pose,before.subject!,subject,'subject-up'),this.cameraFrame());
      }
      this.cameraBasis=undefined;this.writeCamera();
    }finally{this.episodeCameraPreparing=false;}
  }
  prepareEpisodeStart(positionWorldMetersXYZ: Vec3, facingYawRadians: number): void {
    if(this.controlledHumanoid){if(!this.controlledHumanoid.prepareCharacter(positionWorldMetersXYZ,facingYawRadians+Math.PI))throw new Error('HUMANOID_START_BLOCKED');this.keyboard.clear();this.pointerInput={};return;}
    this.alive(); if (this.running) throw new Error('EPISODE_LIVE_CLOCK_ACTIVE');
    if (!this.controlled) throw new Error('EPISODE_CONTROL_REQUIRED');
    finiteVec(positionWorldMetersXYZ, 'episode start'); if (!Number.isFinite(facingYawRadians)) throw new Error('EPISODE_START_FACING_INVALID');
    if (this.inspectCamera().document?.binding.targetEntityId && this.inspectCamera().document?.binding.targetEntityId !== this.controlled) throw new Error('EPISODE_CAMERA_TARGET_UNSUPPORTED');
    const actor = this.entity(this.controlled);
    if(this.humanoid)humanoidHost(this.humanoid).teleportCharacter(this.controlled,positionWorldMetersXYZ);else this.physics.teleport(this.controlled,positionWorldMetersXYZ);
    this.locomotionAnimations.delete(this.controlled); this.jumped.delete(this.controlled);
    this.faceDirection(actor, new THREE.Vector3(-Math.sin(facingYawRadians), 0, -Math.cos(facingYawRadians)));
    actor.object.updateWorldMatrix(true, true);
    this.cameraSubjects.relocated([this.controlled]);this.syncCameraLifecycle();
    this.keyboard.clear(); this.previousJump = false; this.previousInteract = false; this.pointerInput = {};
  }
  private fixedStep(input: WorldInput): void {
    const dt = this.fixedTimeStepSeconds;
    if(this.fixedTransaction||this.displayTransaction)throw new Error('WORLD_TRANSACTION_REENTRY');
    this.fixedTransaction=true;
    try {
      for (const update of this.updates) { const result: unknown = update({ world: this, deltaSeconds: dt, simulationTick: this.tick + 1 }); if (result && typeof (result as Promise<unknown>).then === 'function') throw new Error('WORLD_ASYNC_UPDATE_UNSUPPORTED: prepare async content before a fixed update'); }
      const jumpPressed = input.jumpPressed ?? Boolean(input.jump && !this.previousJump);
      const orbitDelta={cameraYawDeltaRadians:(input.cameraYawDeltaRadians??0)+(this.pointerInput.yawDeltaRadians??0),cameraPitchDeltaRadians:(input.cameraPitchDeltaRadians??0)+(this.pointerInput.pitchDeltaRadians??0),cameraDistanceDeltaMeters:(input.cameraDistanceDeltaMeters??0)+(this.pointerInput.distanceDeltaMeters??0)};
      this.syncCameraLifecycle();
      if(this.cameraMode!=='authored'){
        const inspected=this.inspectCamera(),cycle=inspected.resolved!.input.cycleViewIds;
        if(input.cameraTogglePressed&&cycle.length){const next=cycle[(cycle.indexOf(inspected.resolved!.viewId)+1)%cycle.length]!;this.cameraController.setView(next,this.cameraFrame());}
        this.cameraBasis=this.cameraController.prepareInput({orbitDeltaRadiansXY:[orbitDelta.cameraYawDeltaRadians,orbitDelta.cameraPitchDeltaRadians],orbitRatioXY:[input.cameraYawRatio??0,input.cameraPitchRatio??0],zoomDeltaMeters:orbitDelta.cameraDistanceDeltaMeters,movement:Boolean(input.moveXRatio||input.moveZRatio||input.moveYRatio||input.humanoid?.forward||input.humanoid?.steer||input.humanoid?.lift||input.humanoid?.strafe||input.humanoid?.pitch||input.humanoid?.roll||input.humanoid?.jump||jumpPressed||(this.humanoid&&humanoidHost(this.humanoid).hasMovementIntent()))},dt,{...this.cameraFrame(),simulationTick:this.tick+1});
      }
      this.pointerInput={};
      const drives: Record<string, CharacterDrive> = {};
      const customActions=new Map<string,string>();
      let desiredDirection:Vec3=[0,0,0];
      if (!this.controlledHumanoid&&this.controlled) {
        const actor = this.entity(this.controlled); const forward = new THREE.Vector3(...this.controlForwardWorldXYZ());
        const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)); const move = right.multiplyScalar(input.moveXRatio ?? 0).addScaledVector(forward, -(input.moveZRatio ?? 0)); if (move.lengthSq() > 1) move.normalize();
        const speed = input.run ? actor.character?.runSpeedMetersPerSecond ?? 4.8 : actor.character?.walkSpeedMetersPerSecond ?? 2.4;
        drives[this.controlled] = { velocityMetersPerSecondXZ: [move.x * speed, move.z * speed], jumpPressed };
        desiredDirection=tuple(move); if (move.lengthSq() > 0.0001) this.faceDirection(actor, move);
        const controlledDrive=drives[this.controlled];if(controlledDrive && "jumpPressed" in controlledDrive && controlledDrive.jumpPressed && this.physics.state(this.controlled)?.isGrounded)this.jumped.add(this.controlled);
        if (input.interactPressed ?? Boolean(input.interact && !this.previousInteract)) this.interactNearest();
      }
      for (const [id, goal] of this.goals) if (id !== this.controlled && this.entities.has(id)) drives[id] = this.goalDrive(id, goal, dt);
      for(const [id,e] of this.entities)if(e.character){const custom=this.driveProvider?.(id,id===this.controlled?input:{},id===this.controlled?desiredDirection:[0,0,0],dt);if(custom){drives[id]=custom.drive;if(custom.facing)this.faceDirection(e,new THREE.Vector3().fromArray(custom.facing));if(custom.actionId)customActions.set(id,custom.actionId);}}
      this.steerNavigation(drives,dt);
      if(this.humanoid)humanoidHost(this.humanoid).advance(input,dt,{},drives,Math.atan2(this.controlForwardWorldXYZ()[0],this.controlForwardWorldXYZ()[2]));
      else this.physics.step(dt, drives);
      this.tick += 1;
      this.previousJump = Boolean(input.jump); this.previousInteract = Boolean(input.interact);
      this.updateAssetAnimations(input,drives,customActions,dt);
      if(this.cameraMode!=='authored'){const document=this.inspectCamera().document!;this.cameraController.evaluateAndCommit(this.cameraFrame(),this.cameraSubjects.event(document.binding));this.cameraSubjects.adopt(document.binding);this.writeCamera();}
      // Prepared input is scoped to this simulation step. Post-tick consumers
      // (including Episode route decisions) must see the newly committed view.
      this.cameraBasis=undefined;
      if(this.runtimeObservers.size){
        const native=this.controlledHumanoid?.inspectControls().lastApplied?.input;
        this.emitRuntimeSample({kind:'fixed-input',simulationTick:this.tick,deltaSeconds:dt,controlledEntityId:this.controlled??null,input:{...input,...orbitDelta,...(native?{humanoid:native}:{})}});
      }
      for(const callback of this.afterUpdates)callback();
    } catch (error) { this.cameraController.abortPreparedInput();this.cameraBasis=undefined;this.recordError('WORLD_FIXED_STEP_FAILED', error); this.stop(); throw error; } finally{this.fixedTransaction=false;}
  }
  private updateAssetAnimations(input:WorldInput,drives:Readonly<Record<string,CharacterDrive>>,customActions:ReadonlyMap<string,string>,dt:number):void{
    for (const [id, entity] of this.entities) if (entity.asset) {
      const state = this.physics.state(id); const speed = state ? Math.hypot(state.velocityMetersPerSecondXYZ[0], state.velocityMetersPerSecondXYZ[2]) : 0;
      if(state?.isGrounded)this.jumped.delete(id);
      const runningIntent = id === this.controlled ? Boolean(input.run) : Boolean(this.goals.get(id)?.run);
      const drive = drives[id];
      let automatic = !state?.isGrounded ? (this.jumped.has(id) ? 'jump' : 'fall') : speed > 0.1 ? (runningIntent ? 'run' : 'walk') : 'idle';
      if (state && entity.character && (!drive || 'velocityMetersPerSecondXZ' in drive)) {
        let animation = this.locomotionAnimations.get(id);
        if (!animation) { animation = new LocomotionAnimation(); this.locomotionAnimations.set(id, animation); }
        automatic = animation.update(state, {
          deltaSeconds: dt,
          desiredSpeedMetersPerSecond: drive ? Math.hypot(...drive.velocityMetersPerSecondXZ) : 0,
          heightMeters: (entity.character.heightMeters ?? DEFAULT_CHARACTER_OPTIONS.heightMeters) * Math.abs(entity.object.getWorldScale(new THREE.Vector3()).y),
          run: runningIntent,
          jumped: this.jumped.has(id),
        });
      } else this.locomotionAnimations.delete(id);
      const requested = customActions.get(id) ?? automatic;
      if(entity.asset.isActionComplete)this.stopAction(id);
      if (entity.character && !this.manualActions.has(id) && entity.asset.actionIds.includes(requested)) {
        if (!customActions.has(id) && (requested === 'walk' || requested === 'run')) playLocomotion(entity.asset, requested);
        else entity.asset.play(requested);
      }
      entity.asset.update(dt);
    }
  }
  private readonly manualActions = new Map<string,object>();
  private interactNearest(): void {
    if (!this.controlled) return; const origin = position(this.entity(this.controlled).object);
    let nearest: string | undefined; let distance = 3;
    for (const id of this.interactions.keys()) if (this.entities.has(id)) { const d = origin.distanceTo(position(this.entity(id).object)); if (d < distance) { nearest = id; distance = d; } }
    if (nearest) this.interact(nearest);
  }
  private ensureNavigation(actor: Entity): ThreeNavigation {
    if (!this.navigation) throw new Error('WORLD_NAVIGATION_DISABLED');
    const objects = [...this.entities.values()].filter(e => e.character === undefined && ['fixed', 'kinematic'].includes(e.options.physics?.kind ?? 'none')).map(e => e.object);
    this.scene.updateMatrixWorld(true);
    // Navigation uses the installed collider dimensions. Decomposing the visual
    // matrix again makes heading-only rounding trigger unnecessary rebuilds.
    const body = this.physics.characterSettings(actor.options.id);
    const settings = { radiusMeters: body.radiusMeters, heightMeters: body.heightMeters,
      maximumStepHeightMeters: body.maximumStepHeightMeters, maximumSlopeDegrees: THREE.MathUtils.radToDeg(body.maximumSlopeRadians) };
    const native=this.humanoid?.environment.navigationGeometry();
    const geometryState = native?[Array.from(native.positions),Array.from(native.indices)]:objects.map(root => { const signature = geometrySignature(root); return [root.uuid, root.matrixWorld.elements, signature]; });
    const signature = JSON.stringify({ settings, geometryState });
    if (this.navigationDirty || signature !== this.navigationSignature) {
      const boundaries:THREE.Mesh[]=[];const material=!native&&this.boundaryBoxes.length?new THREE.MeshBasicMaterial():undefined;
      try{if(!native)for(const box of this.boundaryBoxes){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...box.size),material!);boundaries.push(mesh);mesh.position.fromArray(box.position);mesh.rotation.set(...box.rotation);}
        this.navigation.rebuild(native??[...objects,...boundaries],settings);
      }finally{for(const mesh of boundaries)mesh.geometry.dispose();material?.dispose();}
      this.navigationDirty = false; this.navigationSignature = signature;
    }
    return this.navigation;
  }
  private pathFor(id: string, target: Vec3): Vec3[] {
    const actor = this.entity(id); if (!actor.character) throw new Error('WORLD_ACTOR_REQUIRED');
    const path = this.ensureNavigation(actor).findPath(tuple(position(actor.object)), target);
    if (path.status !== 'success' || !path.points.length) throw new Error(`WORLD_PATH_UNREACHABLE: ${path.reason ?? id}`); return path.points;
  }
  private steerNavigation(drives:Record<string,CharacterDrive>,dt:number):void{
    if(!this.navigation||!Object.keys(drives).length)return;
    const vehicles=new Set(this.humanoid?.options.vehicles.map(vehicle=>vehicle.instanceId));
    const actors=[...this.entities.values()].filter(entity=>entity.character&&!vehicles.has(entity.options.id)&&!(this.humanoid?.hasActor(entity.options.id)&&this.humanoid.actorController(entity.options.id).isMounted));
    let steered:Map<string,NavigationSteering>;
    try{steered=this.navigation.steer(actors.map(entity=>{
      const id=entity.options.id,body=this.physics.characterSettings(id),state=this.physics.state(id),drive=drives[id];
      return {id,positionWorldMetersXYZ:tuple(position(entity.object)),velocityWorldMetersPerSecondXYZ:state?.velocityMetersPerSecondXYZ??[0,0,0],radiusMeters:body.radiusMeters,heightMeters:body.heightMeters,...(id!==this.controlled&&this.goals.has(id)&&drive&&'velocityMetersPerSecondXZ' in drive?{desiredVelocityMetersPerSecondXZ:drive.velocityMetersPerSecondXZ}:{})};
    }),dt);}catch(error){
      steered=new Map(Object.entries(drives).filter(([id,drive])=>id!==this.controlled&&this.goals.has(id)&&'velocityMetersPerSecondXZ' in drive).map(([id])=>[id,{velocityMetersPerSecondXZ:[0,0] as const,error:`NAVIGATION_AVOIDANCE_FAILED: ${String(error)}`} ]));
    }
    for(const [id,result] of steered){const drive=drives[id];if(drive&&'velocityMetersPerSecondXZ' in drive)drives[id]={...drive,velocityMetersPerSecondXZ:result.velocityMetersPerSecondXZ};if(result.error){this.taskResults.set(id,{status:'failed',error:result.error});this.clearGoal(id);}}
  }
  private goalDrive(id: string, goal: ActorGoal, dt: number): CharacterDrive {
    const actor = this.entity(id); const current = position(actor.object); goal.repathSeconds += dt;
    if (goal.kind === 'move' && (this.navigationDirty || goal.repathSeconds >= 0.5)) {
      const target = goal.points.at(-1);
      if (target) try {
        this.ensureNavigation(actor); goal.repathSeconds = 0;
        if (goal.navigationSignature !== this.navigationSignature) { goal.points = this.pathFor(id, target); goal.index = 0; goal.navigationSignature = this.navigationSignature; }
      }
      catch (error) { this.recordError('WORLD_ACTOR_PATH_FAILED', error, id); this.taskResults.set(id,{status:'failed',error:String(error)}); this.clearGoal(id); return { velocityMetersPerSecondXZ: [0, 0] }; }
    }
    if (goal.kind === 'follow' && goal.targetEntityId) {
      if (!this.entities.has(goal.targetEntityId)) { this.clearGoal(id);this.taskResults.set(id,{status:'failed',error:'WORLD_FOLLOW_TARGET_REMOVED'}); return { velocityMetersPerSecondXZ: [0, 0] }; }
      const target = position(this.entity(goal.targetEntityId).object);
      if (current.distanceTo(target) <= goal.distanceMeters) return { velocityMetersPerSecondXZ: [0, 0] };
      if (goal.repathSeconds >= 0.5) {
        try { goal.points = this.pathFor(id, tuple(target)); goal.index = 0; goal.repathSeconds = 0; goal.navigationSignature = this.navigationSignature; }
        catch (error) {
          goal.repathSeconds = 0;
          // A moving actor can briefly touch an eroded navmesh boundary. Keep its
          // already verified route until a new route is available; never teleport.
          if (this.navigationDirty || goal.navigationSignature !== this.navigationSignature || goal.index >= goal.points.length) { this.recordError('WORLD_FOLLOW_PATH_FAILED', error, id); this.taskResults.set(id,{status:'failed',error:String(error)}); this.clearGoal(id); return { velocityMetersPerSecondXZ: [0, 0] }; }
        }
      }
    }
    let next = goal.points[goal.index];
    while (next && Math.hypot(next[0] - current.x, next[2] - current.z) < 0.04 && Math.abs(next[1] - current.y) < 1) next = goal.points[++goal.index];
    if (!next) { if (goal.kind === 'move') {this.clearGoal(id);this.taskResults.set(id,{status:'succeeded'});} return { velocityMetersPerSecondXZ: [0, 0] }; }
    if (current.distanceTo(goal.lastPosition) < 0.001) goal.stagnantSeconds += dt; else goal.stagnantSeconds = 0;
    goal.lastPosition.copy(current);
    // No progress is a task outcome; its operation retains the failure reason.
    if (goal.stagnantSeconds > 4) { this.taskResults.set(id,{status:'failed',error:'WORLD_ACTOR_BLOCKED'}); this.clearGoal(id); return { velocityMetersPerSecondXZ: [0, 0] }; }
    const delta = new THREE.Vector3(next[0] - current.x, 0, next[2] - current.z); const distance = delta.length(); delta.normalize(); if(!this.humanoid?.hasActor(id))this.faceDirection(actor, delta);
    const speed = Math.min(distance / dt, goal.run ? actor.character?.runSpeedMetersPerSecond ?? 4.8 : actor.character?.walkSpeedMetersPerSecond ?? 2.4);
    return { velocityMetersPerSecondXZ: [delta.x * speed, delta.z * speed] };
  }
  execute(command: WorldCommand): CommandResult {
    const revision = this.revision;
    try { this.alive(); this.applyCommand(command); this.revision = revision + 1; return { status: 'applied', revision: this.revision }; }
    catch (error) { return { status: 'rejected', revision, error: { code: 'WORLD_COMMAND_REJECTED', message: error instanceof Error ? error.message : 'Invalid command' } }; }
  }
  private applyCommand(command: WorldCommand): void {
    if (!command || typeof command !== 'object') throw new Error('WORLD_COMMAND_INVALID');
    const fields: Record<WorldCommand['type'], readonly string[]> = {
      'entity.set-visible': ['entityId', 'visible'], 'entity.set-scale': ['entityId', 'scaleXYZ'], 'entity.set-position': ['entityId', 'positionMetersXYZ'],
      'entity.despawn': ['entityId'], 'entity.spawn': ['prototypeId', 'entityId', 'positionMetersXYZ'], 'entity.attach': ['childEntityId', 'parentEntityId', 'positionMetersXYZ'],
      'entity.play-action': ['entityId', 'actionId'], 'entity.apply-impulse': ['entityId', 'impulseNewtonSecondsXYZ'],
      'actor.move-to': ['entityId', 'targetPositionMetersXYZ', 'run'], 'actor.follow': ['entityId', 'targetEntityId', 'distanceMeters'], 'actor.stop': ['entityId'],
    };
    if (!Object.hasOwn(fields, command.type) || Object.keys(command).some(key => key !== 'type' && !fields[command.type].includes(key))) throw new Error('WORLD_COMMAND_FIELDS_INVALID');
    if (command.type === 'entity.spawn') {
      requireId(command.entityId); const at = finiteVec(command.positionMetersXYZ, 'positionMetersXYZ'); if (this.entities.has(command.entityId)) throw new Error('WORLD_ENTITY_DUPLICATE');
      const factory = this.prototypes.get(command.prototypeId); if (!factory) throw new Error('WORLD_PROTOTYPE_NOT_FOUND');
      const options = factory();
      if (!(options.object instanceof THREE.Object3D) || [...this.entities.values()].some(e => e.object === options.object)) throw new Error('WORLD_PROTOTYPE_MUST_CREATE_NEW_OBJECT');
      const oldPosition = options.object.position.clone();
      this.scene.updateMatrixWorld(true);
      options.object.position.copy((options.object.parent ?? this.scene).worldToLocal(new THREE.Vector3().fromArray(at)));
      const resolved = { ...options, id: command.entityId };
      try { if ('character' in options) this.addCharacter(resolved); else this.addEntity(resolved); }
      catch (error) { options.object.position.copy(oldPosition); throw error; } return;
    }
    if (command.type === 'entity.attach') {
      const child = this.entity(command.childEntityId); const parent = this.entity(command.parentEntityId);
      if (this.physicalDescendants(child.object).length) throw new Error('WORLD_ATTACHMENT_REQUIRES_NONPHYSICAL_CHILD');
      for (let p: THREE.Object3D | null = parent.object; p; p = p.parent) if (p === child.object) throw new Error('WORLD_ATTACHMENT_CYCLE');
      const at = command.positionMetersXYZ === undefined ? undefined : finiteVec(command.positionMetersXYZ, 'positionMetersXYZ');
      const previousParent = child.object.parent; const oldPosition = child.object.position.clone(); const oldQuaternion = child.object.quaternion.clone(); const oldScale = child.object.scale.clone(); const oldMatrix = child.object.matrix.clone();
      const affected = this.physicalAncestors(child.object);
      try {
        parent.object.add(child.object); if (at) child.object.position.fromArray(at);
        if (!child.object.matrixAutoUpdate) child.object.matrix.compose(child.object.position, child.object.quaternion, child.object.scale);
        this.physics.refreshMany([...new Set([...affected, ...this.physicalAncestors(child.object)])]);
      } catch (error) {
        if (previousParent) previousParent.add(child.object); else child.object.removeFromParent();
        child.object.position.copy(oldPosition); child.object.quaternion.copy(oldQuaternion); child.object.scale.copy(oldScale); child.object.matrix.copy(oldMatrix); child.object.matrixWorldNeedsUpdate = true;
        throw error;
      }
      this.navigationDirty = true; return;
    }
    const entity = this.entity(command.entityId);
    switch (command.type) {
      case 'entity.set-visible': {
        if (typeof command.visible !== 'boolean') throw new Error('WORLD_VISIBLE_INVALID');
        entity.object.visible = command.visible;
        return;
      }
      case 'entity.set-position': {
        const at = finiteVec(command.positionMetersXYZ, 'positionMetersXYZ');
        const affected = this.physicalDescendants(entity.object);
        if (affected.length === 1 && affected[0] === command.entityId){if(this.humanoid)humanoidHost(this.humanoid).teleportCharacter(command.entityId,at);else this.physics.teleport(command.entityId,at);}
        else {
          const old = entity.object.position.clone(); const oldMatrix = entity.object.matrix.clone();
          const worldPosition = new THREE.Vector3().fromArray(at); this.scene.updateMatrixWorld(true);
          entity.object.position.copy(entity.object.parent ? entity.object.parent.worldToLocal(worldPosition) : worldPosition);
          if (!entity.object.matrixAutoUpdate) entity.object.matrix.setPosition(entity.object.position);
          entity.object.matrixWorldNeedsUpdate = true; entity.object.updateWorldMatrix(true, true);
          try { this.physics.refreshMany(affected); }
          catch (error) { entity.object.position.copy(old); entity.object.matrix.copy(oldMatrix); entity.object.matrixWorldNeedsUpdate = true; entity.object.updateWorldMatrix(true, true); throw error; }
        }
        for (const id of affected) { this.locomotionAnimations.delete(id); this.jumped.delete(id); }
        this.cameraSubjects.relocated(affected);this.syncCameraLifecycle();
        this.navigationDirty = true; return;
      }
      case 'entity.set-scale': {
        const scale = finiteVec(command.scaleXYZ, 'scaleXYZ'); if (scale.some(v => v <= 0 || v > 100)) throw new Error('WORLD_SCALE_INVALID');
        const old = entity.object.scale.clone(); const oldPosition = entity.object.position.clone(); const oldQuaternion = entity.object.quaternion.clone(); const oldMatrix = entity.object.matrix.clone();
        if (!entity.object.matrixAutoUpdate) entity.object.matrix.decompose(entity.object.position, entity.object.quaternion, entity.object.scale);
        entity.object.scale.fromArray(scale);
        if (!entity.object.matrixAutoUpdate) entity.object.matrix.compose(entity.object.position, entity.object.quaternion, entity.object.scale);
        entity.object.matrixWorldNeedsUpdate = true; entity.object.updateWorldMatrix(true, true);
        try { this.physics.refreshMany(this.physicalDescendants(entity.object)); }
        catch (error) { entity.object.scale.copy(old); entity.object.position.copy(oldPosition); entity.object.quaternion.copy(oldQuaternion); entity.object.matrix.copy(oldMatrix); entity.object.matrixWorldNeedsUpdate = true; entity.object.updateWorldMatrix(true, true); throw error; }
        this.navigationDirty = true; return;
      }
      case 'entity.despawn': {
        for (let parent: THREE.Object3D | null = this.controlled ? this.entity(this.controlled).object : null; parent; parent = parent.parent) if (parent === entity.object) throw new Error('WORLD_CONTROLLED_ENTITY_CANNOT_DESPAWN');
        this.removeTree(command.entityId); return;
      }
      case 'entity.play-action': this.playAction(command.entityId,command.actionId); return;
      case 'entity.apply-impulse': {const impulse=finiteVec(command.impulseNewtonSecondsXYZ,'impulseNewtonSecondsXYZ');if(this.humanoid)humanoidHost(this.humanoid).applyImpulse(command.entityId,impulse);else this.physics.applyImpulse(command.entityId,impulse);return;}
      case 'actor.move-to': case 'actor.follow': {
        if (command.type === 'actor.move-to' && command.run !== undefined && typeof command.run !== 'boolean') throw new Error('WORLD_RUN_INVALID');
        if (command.entityId === this.controlled) throw new Error('WORLD_PLAYER_INPUT_OWNS_CONTROLLED_ACTOR');
        const target = command.type === 'actor.move-to' ? finiteVec(command.targetPositionMetersXYZ, 'targetPositionMetersXYZ') : tuple(position(this.entity(command.targetEntityId).object));
        if (command.type === 'actor.follow' && command.targetEntityId === command.entityId) throw new Error('WORLD_FOLLOW_SELF');
        if(this.navigationConflict(command.entityId))throw new Error('ACTOR_RESOURCE_BUSY');
        const points = this.pathFor(command.entityId, target);
        const distance = command.type === 'actor.follow' ? command.distanceMeters ?? 2 : 0.5;
        if (!Number.isFinite(distance) || distance <= 0) throw new Error('WORLD_FOLLOW_DISTANCE_INVALID');
        const resourceOwner=this.goals.get(command.entityId)?.resourceOwner??{};
        if(!this.resources.acquire(resourceOwner,actorResources(command.entityId,['locomotion','animation']),{kind:'navigation',id:`navigation-${++this.nextResourceOwner}`}))throw new Error('ACTOR_RESOURCE_BUSY');
        this.taskResults.set(command.entityId,{status:'running'});this.goals.set(command.entityId, { resourceOwner, kind: command.type === 'actor.follow' ? 'follow' : 'move', points, index: 0, run: command.type === 'actor.move-to' ? command.run ?? false : false, distanceMeters: distance, lastPosition: position(entity.object), stagnantSeconds: 0, repathSeconds: 0, navigationSignature: this.navigationSignature, ...(command.type === 'actor.follow' ? { targetEntityId: command.targetEntityId } : {}) }); return;
      }
      case 'actor.stop': this.clearGoal(command.entityId);this.taskResults.delete(command.entityId); return;
      default: throw new Error('WORLD_COMMAND_UNKNOWN');
    }
  }
  private retireEntity(entity:Entity):void{
    const binding=(entity.options as CharacterEntityOptions).runtimeActor;
    if(binding?.animation&&this.baseline?.get(entity.options.id)!==entity){
      try{binding.animation.dispose();}catch(error){this.recordError('WORLD_DISPOSE_FAILED',error,entity.options.id);}finally{entity.releaseHumanoid?.();}
      this.retired.delete(entity);
    }else this.retired.add(entity);
  }
  private removeTree(id: string): void {
    const entity = this.entity(id);
    for (const [childId, child] of [...this.entities]) if (childId !== id) { let parent = child.object.parent; while (parent && parent !== entity.object) parent = parent.parent; if (parent === entity.object) this.removeTree(childId); }
    this.physics.remove(id); entity.object.removeFromParent(); setEntityBoundary(entity.object, false); this.entities.delete(id); this.clearGoal(id); this.stopAction(id); this.locomotionAnimations.delete(id); this.jumped.delete(id); this.retireEntity(entity); this.navigationDirty = true;
  }
  private physicalAncestors(object: THREE.Object3D): string[] {
    const ancestors = new Set<THREE.Object3D>(); for (let parent = object.parent; parent; parent = parent.parent) ancestors.add(parent);
    return [...this.entities].filter(([id, entity]) => ancestors.has(entity.object) && this.physics.state(id)).map(([id]) => id);
  }
  private physicalDescendants(root: THREE.Object3D): string[] {
    const result: string[] = [];
    for (const [id, entity] of this.entities) if (this.physics.state(id)) { for (let parent: THREE.Object3D | null = entity.object; parent; parent = parent.parent) if (parent === root) { result.push(id); break; } }
    return result;
  }
  advance(deltaSeconds: number, input?: WorldInput): void {
    this.alive(); if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('WORLD_DELTA_INVALID');
    if (input !== undefined) this.validateInput(input);
    this.sealInitialState(); this.accumulatorSeconds += Math.min(deltaSeconds, 0.25);
    // Explicit input can arrive between fixed ticks (for example at 120 Hz).
    // Preserve only one-shot edges; analog axes always use the latest sample.
    if(input){
      this.pendingInputEdges.cameraToggle ||= !!input.cameraTogglePressed;
    }
    if(this.humanoid&&input){
      const pending=this.pendingInputEdges;
      pending.interact ||= !!input.interactPressed;pending.jump ||= !!input.jumpPressed;
      pending.humanoidJump ||= !!input.humanoid?.jump;
      for(const [key,value] of Object.entries(input.humanoid?.actions??{}))if(value)pending.actions[key]=true;
    }
    let steps = 0;
    while (this.accumulatorSeconds + 1e-10 >= this.fixedTimeStepSeconds && steps++ < 15) {
      let sampled = input === undefined ? this.keyboard.sample() : steps === 1 ? input : { ...input, ...(input.humanoid?{humanoid:{...input.humanoid,jump:false,actions:{}}}:{}),...(input.jumpPressed === undefined ? {} : { jumpPressed: false }), ...(input.interactPressed === undefined ? {} : { interactPressed: false }), ...(input.cameraTogglePressed === undefined ? {} : { cameraTogglePressed: false }) };
      if(steps===1){
        const pending=this.pendingInputEdges;
        sampled={...sampled,...(pending.interact?{interactPressed:true}:{}),...(pending.jump?{jumpPressed:true}:{}),...(pending.cameraToggle?{cameraTogglePressed:true}:{}),
          ...(pending.humanoidJump||Object.keys(pending.actions).length?{humanoid:{...emptyInput(),...sampled.humanoid,jump:pending.humanoidJump||!!sampled.humanoid?.jump,actions:{...sampled.humanoid?.actions,...pending.actions}}}:{})};
        this.pendingInputEdges={interact:false,jump:false,cameraToggle:false,humanoidJump:false,actions:{}};
      }
      this.accumulatorSeconds -= this.fixedTimeStepSeconds; this.fixedStep(sampled);
    }
  }
  /** Seal the opening and compile its materials without starting or stepping the clock. */
  prepareRendering(): Promise<unknown> {
    this.alive(); this.sealInitialState();
    if (!this.renderPreparation) {
      const preparation = this.renderer?.compileAsync?.(this.scene, this.camera) ?? Promise.resolve();
      this.renderPreparation = preparation;
      void preparation.catch(() => { if (this.renderPreparation === preparation) this.renderPreparation = undefined; });
    }
    return this.renderPreparation;
  }
  start(): void {
    this.alive(); if (this.running) return; this.sealInitialState(); this.running = true; this.keyboard.enabled = true;
    const generation = ++this.frameGeneration;
    if (typeof requestAnimationFrame === 'undefined') return;
    // rAF timestamps belong to the browser's frame clock. Its first timestamp
    // can precede performance.now() sampled while that frame is being prepared.
    this.lastFrameTime = 0;
    const frame = (time: number) => { if (!this.running || this.disposed || generation !== this.frameGeneration) return; const elapsed = this.lastFrameTime ? Math.max(0, (time - this.lastFrameTime) / 1000) : 0; this.lastFrameTime = time;
      const measured = this.frameTimings.size > 0;
      const started = measured ? performance.now() : 0;
      let updateFinished = 0;
      try { this.advance(elapsed); updateFinished = measured ? performance.now() : 0; this.render(Math.min(1,Math.max(0,this.accumulatorSeconds/this.fixedTimeStepSeconds))); } catch (error) { this.recordError('WORLD_FRAME_FAILED', error); this.stop(); return; }
      if(measured){
        const sample:WorldFrameTiming=Object.freeze({source:'realtime',simulationTick:this.tick,sampledAtMilliseconds:updateFinished,cpuUpdateMilliseconds:updateFinished-started});
        // Optional diagnostics cannot stop the simulation or prevent other observers.
        for(const callback of this.frameTimings)try{callback(sample);}catch{/* observer failure stays local */}
      }
      if (this.running && generation === this.frameGeneration) this.frameId = requestAnimationFrame(frame);
    };
    this.frameId = requestAnimationFrame(frame);
  }
  stop(): void { this.running = false; this.clearInput(); this.frameGeneration += 1; this.keyboard.enabled = false; this.accumulatorSeconds = 0; if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.frameId); this.frameId = 0; }
  render(alpha=1): void {
    if(this.disposed)return;
    if(!Number.isFinite(alpha)||alpha<0||alpha>1)throw new Error('WORLD_PRESENTATION_ALPHA_INVALID');
    let sample:RuntimeSample|undefined;
    this.withPresentation(()=>{
      if(this.runtimeObservers.size&&this.renderer){
        const object=this.controlled?this.entities.get(this.controlled)?.object:undefined;
        sample={kind:'rendered-frame',frameId:++this.observedFrameId,simulationTick:this.tick,interpolationAlpha:Math.min(1,Math.max(0,alpha)),sampledAtMilliseconds:performance.now(),
          widthPixels:this.renderer?.domElement.width??0,heightPixels:this.renderer?.domElement.height??0,controlledEntityId:this.controlled??null,
          controlledPositionWorldMetersXYZ:object?tuple(object.getWorldPosition(new THREE.Vector3())):null,
          camera:{positionWorldMetersXYZ:tuple(this.camera.getWorldPosition(new THREE.Vector3())),quaternionWorldXYZW:this.camera.getWorldQuaternion(new THREE.Quaternion()).toArray(),projectionMatrix:[...this.camera.projectionMatrix.elements]}};
      }
      this.renderer?.render(this.scene,this.camera);
    },alpha);
    if(sample)this.emitRuntimeSample(sample);
    try { for(const callback of this.renders)callback(alpha); }
    catch(error){this.recordError('WORLD_FRAME_FAILED',error);this.stop();throw error;}
  }
  withPresentation<T>(callback:()=>T,alpha=1,view:'world'|'object'='world'):T {
    if(!Number.isFinite(alpha)||alpha<0||alpha>1)throw new Error('WORLD_PRESENTATION_ALPHA_INVALID');
    this.alive();if(this.fixedTransaction||this.displayTransaction)throw new Error('WORLD_TRANSACTION_REENTRY');this.displayTransaction=true;
    let restore:(()=>void)|undefined;
    let restoreSubjectVisibility:(()=>void)|undefined;
    const layers:Array<[THREE.Object3D,number]>=[];
    try {
      const context=this.presentationContext.sample(this.tick,alpha,this.humanoid?humanoidHost(this.humanoid).presentationDiscontinuity():false);
      restore=this.humanoid?humanoidHost(this.humanoid).present(context,view):undefined;
      const inspected=this.inspectCamera();
      if(inspected.current&&inspected.mode!=='authored'){const frameContext={...context,previousTick:inspected.previous!.simulationTick,currentTick:inspected.current.simulationTick};const proposal=this.cameraController.sampleProjection(frameContext,this.cameraFrame().aspect,inspected.document?this.cameraSubjects.sample(inspected.document.binding,true):undefined);if(proposal&&this.camera instanceof THREE.PerspectiveCamera)applyCameraPresentation(this.camera,proposal,this.cameraFrame().aspect);}
      const fade = inspected.resolved && "subjectFade" in inspected.resolved.values ? inspected.resolved.values.subjectFade : undefined;
      if (view === 'world' && inspected.mode !== 'authored' && fade?.enabled && inspected.current) {
        const displaySubject = inspected.document ? this.cameraSubjects.sample(inspected.document.binding, true) : undefined;
        const focus = displaySubject && inspected.resolved
          ? cameraPositionAnchor(displaySubject, inspected.resolved.values.position)
          : new THREE.Vector3(...inspected.current.pivotWorldMetersXYZ);
        const distance = this.camera.getWorldPosition(new THREE.Vector3()).distanceTo(focus);
        const opacity = THREE.MathUtils.smoothstep(distance, fade.endDistanceMeters, fade.startDistanceMeters);
        const ids = new Set([inspected.current.logicalTargetId, inspected.current.resolvedSubjectId]);
        if (this.humanoid) for (const actor of this.humanoid.simulation.actors.values())
          if (actor.vehicle?.spec.id === inspected.current.resolvedSubjectId) ids.add(actor.id);
        const roots = [...ids].flatMap(id => { const object = this.entities.get(id)?.object; return object ? [object] : []; });
        restoreSubjectVisibility = this.cameraSubjectVisibility.present(roots, opacity);
      } else restoreSubjectVisibility = this.cameraSubjectVisibility.present([], 1);
      if(view==='world'&&inspected.mode==='follow'&&inspected.resolved?.kind==='first-person'&&!this.humanoid?.hasActor(inspected.document!.binding.targetEntityId)){
        const target=this.entities.get(inspected.document!.binding.targetEntityId)?.object;
        target?.traverse(object=>{const renderable=object as THREE.Mesh & THREE.Line & THREE.Points & THREE.Sprite;
          if(renderable.isMesh||renderable.isLine||renderable.isPoints||renderable.isSprite){layers.push([object,object.layers.mask]);object.layers.mask&=~this.camera.layers.mask;}
        });
      }
      this.scene.updateMatrixWorld(true);
      const result=callback();
      if(result&&typeof (result as unknown as PromiseLike<unknown>).then==='function'){
        throw new Error('WORLD_ASYNC_PRESENTATION_UNSUPPORTED');
      }
      return result;
    }catch(error){
      this.recordError('WORLD_FRAME_FAILED',error);
      this.stop();
      throw error;
    }finally{try{for(const [object,mask]of layers)object.layers.mask=mask;try{restoreSubjectVisibility?.();}finally{restore?.();}}finally{this.displayTransaction=false;}}
  }
  resize(width: number, height: number): void { if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('WORLD_VIEWPORT_INVALID'); this.renderer?.setSize(width, height, false); if (this.camera instanceof THREE.PerspectiveCamera) { this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); } }
  snapshot(): WorldSnapshot {
    const states: EntityState[] = [...this.entities].map(([id, entity]) => {
      let parent = entity.object.parent; let parentEntityId: string | undefined;
      while (parent && !parentEntityId) { parentEntityId = [...this.entities].find(([, e]) => e.object === parent)?.[0]; parent = parent.parent; }
      const logical=this.humanoid?.logicalPose(id);
      const rotation = new THREE.Euler().setFromQuaternion(logical?.rotation??entity.object.getWorldQuaternion(new THREE.Quaternion())); const physics = this.physics.state(id);
      return { id, name: entity.options.name ?? id, role: entity.options.role ?? 'decoration', tags: entity.options.tags ?? [], positionMetersXYZ: tuple(logical?.position??position(entity.object)), rotationEulerRadiansXYZ: [rotation.x, rotation.y, rotation.z], scaleXYZ: tuple(entity.object.getWorldScale(new THREE.Vector3())), visible: entity.object.visible,
        ...(parentEntityId ? { parentEntityId } : {}), ...(physics ? { physics } : {}), ...(entity.asset?.currentActionId ? { actionId: entity.asset.currentActionId } : {}), ...(entity.asset?.currentClipName ? { clipName: entity.asset.currentClipName } : {}) };
    });
    return { schemaVersion: 1, simulationTick: this.tick, simulationSeconds: this.tick * this.fixedTimeStepSeconds, revision: this.revision, isRunning: this.running, ...(this.controlled ? { controlledEntityId: this.controlled } : {}), entities: states, errors: structuredClone(this.failures) };
  }
  inspect(): unknown { return { snapshot: this.snapshot(), physics: this.physics.audit(), inputTranscript: [...this.keyboard.transcript], prototypes: [...this.prototypes.keys()], capabilities: this.capabilities() }; }
  capabilities(): unknown { return [...this.entities].map(([id, e]) => ({ entityId: id, name: e.options.name ?? id, tags: e.options.tags ?? [], commands: ['entity.set-visible', 'entity.set-position', 'entity.set-scale', ...(id === this.controlled ? [] : ['entity.despawn']), ...(this.navigation && e.character && id !== this.controlled ? ['actor.move-to', 'actor.follow', 'actor.stop'] : []), ...(e.asset?.clips.length ? ['entity.play-action'] : []), ...(e.options.physics?.kind === 'dynamic' ? ['entity.apply-impulse'] : [])], actions: e.asset?.clips.map(c => c.name) ?? [] })); }
  reset(): void {
    this.assertLifecycleMutationAllowed(); this.sealInitialState(); this.resetting=true; try{const wasRunning = this.running; this.stop(); for(const id of [...this.goals.keys()])this.clearGoal(id); this.taskResults.clear();this.jumped.clear();for(const id of [...this.manualActions.keys()])this.stopAction(id);this.locomotionAnimations.clear();
    for (const [id, entity] of this.entities) { this.physics.remove(id); setEntityBoundary(entity.object, false); if (this.baseline!.get(id) !== entity) { entity.object.removeFromParent(); this.retireEntity(entity); } }
    this.entities.clear();
    for (const [id, entity] of this.baseline!) {
      entity.initialParent?.add(entity.object); entity.object.position.copy(entity.initialPosition); entity.object.quaternion.copy(entity.initialQuaternion); entity.object.scale.copy(entity.initialScale); entity.object.visible = entity.initialVisible;
      entity.object.matrixAutoUpdate = entity.initialMatrixAutoUpdate; entity.object.matrix.copy(entity.initialMatrix); entity.object.matrixWorldNeedsUpdate = true;
      setEntityBoundary(entity.object, true); this.entities.set(id, entity); this.retired.delete(entity);
    }
    this.scene.updateWorldMatrix(true, true, true);
    this.controlled = this.controlledInitial;
    if(this.humanoid)humanoidHost(this.humanoid).reset();
    for (const [id, entity] of this.baseline!) {
      if (entity.character) {const binding=(entity.options as CharacterEntityOptions).runtimeActor;if(binding)humanoidHost(this.humanoid!).bindCharacter(id,binding,(entity.options as CharacterEntityOptions).character);this.physics.addCharacter(id, entity.object, entity.character);} else if (entity.options.physics?.kind !== 'none' && entity.options.physics) this.physics.addRigid(id, entity.object, entity.options.physics);
      entity.asset?.mixer.stopAllAction(); if (entity.asset?.actionIds.includes('idle')) entity.asset.play('idle');
      // A paused opening capture must contain the selected pose at tick zero,
      // not the bind pose restored by AnimationMixer.stopAllAction().
      entity.asset?.update(0);
    }
    if(this.humanoid&&this.controlled){humanoidHost(this.humanoid).setControlledActor(this.humanoid.hasActor(this.controlled)?this.controlled:undefined);humanoidHost(this.humanoid).finishReset();}
    this.updateKeyboardOwner();
    this.tick = 0; this.revision += 1; this.failures.length = 0; this.keyboard.transcript.length = 0; this.navigationDirty = true;
    this.cameraController.reset(this.cameraFrame());this.cameraSubjects.adopt(this.inspectCamera().document?.binding??{targetEntityId:''});this.cameraBasis=undefined;this.presentationContext.reset();this.resetting=false;this.writeCamera();
    for (const callback of this.resets) callback(); this.render(); if (wasRunning) this.start();
    }finally{this.resetting=false;}
  }
  expose(options: { targetEntityIds?: readonly string[] } = {}): WorldObservation {
    if (!this.renderer || !this.controlled) throw new Error('WORLD_OBSERVER_REQUIRES_RENDERER_AND_PLAYER'); const world = this;
    const selected = options.targetEntityIds === undefined ? undefined : new Set(options.targetEntityIds);
    if (selected) for (const id of selected) this.entity(id);
    const observer: WorldObservation = { withPresentation:(work,options)=>world.withPresentation(work,1,options?.view),ready: true, scene: this.scene, camera: this.camera, renderer: this.renderer, get controlledObject() { return world.entity(world.controlled!).object; }, get targets() { return Object.fromEntries([...world.entities].filter(([id]) => !selected || selected.has(id) || id === world.controlled).map(([id, e]) => [id, e.object])); }, get targetFrontYawRadiansById() { return Object.fromEntries([...world.entities].map(([id, e]) => [id, e.options.frontYawRadians ?? 0])); }, startLive: () => this.start(), stopLive: () => this.stop(), reset: () => this.reset(), snapshot: () => this.snapshot(), inspect: () => this.inspect(), capabilities: () => this.capabilities(), execute: command => this.execute(command) };
    this.observer = observer;
    if (typeof window !== 'undefined') { const target = window as unknown as Record<string, unknown>; target.__WORLDKIT_EVAL__ = observer; target.__WORLDKIT_CREATOR__ = observer; }
    return observer;
  }
  private recordError(code: string, error: unknown, entityId?: string): void {
    if(this.failures.length>=128)return;
    let diagnostic:import('./contracts').RuntimeError;
    try {
      const detail=runtimeError(error,code,entityId?[entityId]:[]);
      diagnostic={code:detail.code,message:detail.message.slice(0,2000),category:detail.category,phase:code,entityIds:[...detail.entityIds],
        ...(detail.suggestedAction?{suggestedAction:detail.suggestedAction}:{}),...(detail.cause?{cause:{...detail.cause}}:{})};
    } catch { diagnostic=runtimeError('Unserializable runtime failure',code,entityId?[entityId]:[]); }
    this.failures.push({code,message:diagnostic.message,simulationTick:this.tick,...(entityId?{entityId}:{}),diagnostic});
  }
  dispose(): void {
    if (this.disposed) return; this.stop(); this.disposed = true; this.inputRouter.dispose(); this.cameraSubjectVisibility.dispose(); this.keyboard.detach(); this.renders.clear();this.frameTimings.clear();this.releaseViewport?.();
    const assets = new Set([...this.entities.values(), ...this.retired].flatMap(e => e.asset ? [e.asset] : []));
    for (const entity of [...this.entities.values(), ...this.retired]) setEntityBoundary(entity.object, false);
    const humanoids=new Set([...this.entities.values(),...this.retired].flatMap(e=>{const binding=(e.options as CharacterEntityOptions).runtimeActor?.animation;return binding?[binding]:[];}));
    for(const character of humanoids)try{character.dispose();}catch(error){this.recordError('WORLD_DISPOSE_FAILED',error);}
    for (const asset of assets) try { asset.dispose(); } catch (error) { this.recordError('WORLD_DISPOSE_FAILED', error); }
    for (const callback of this.disposals) try { callback(); } catch (error) { this.recordError('WORLD_DISPOSE_FAILED', error); }
    for(const entity of [...this.entities.values(),...this.retired])entity.releaseHumanoid?.();
    this.cameraController.dispose();this.cameraSubjects.clear();this.navigation?.dispose(); this.physics.dispose();this.manualActions.clear();this.resources.clear(); if (this.ownsRenderer) this.renderer?.dispose();
    this.entities.clear(); this.retired.clear(); this.baseline?.clear(); this.prototypes.clear(); for(const id of [...this.goals.keys()])this.clearGoal(id); this.updates.clear(); this.resets.clear(); this.disposals.clear(); this.interactions.clear();this.afterUpdates.clear();this.runtimeObservers.clear();this.locomotionAnimations.clear();this.jumped.clear();
    if (typeof window !== 'undefined') { const target = window as unknown as Record<string, unknown>; if (target.__WORLDKIT_EVAL__ === this.observer) delete target.__WORLDKIT_EVAL__; if (target.__WORLDKIT_CREATOR__ === this.observer) delete target.__WORLDKIT_CREATOR__; }
  }
}
export async function createWorld(options: WorldOptions = {}): Promise<WorldEngine> { return WorldEngine.create(options); }
