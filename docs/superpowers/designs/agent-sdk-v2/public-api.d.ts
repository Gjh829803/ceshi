/** DESIGN ONLY: proposed v2 public contract. No runtime implementation or SDK export. */
import type * as THREE from 'three';
export type Vec3 = readonly [number, number, number];
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | {readonly [key:string]:JsonValue};
export type DeepReadonly<T> = T extends readonly (infer U)[] ? readonly DeepReadonly<U>[] : T extends object ? {readonly [K in keyof T]:DeepReadonly<T[K]>} : T;
export type Scalar = boolean | number | string;
export type ScalarSchema =
 | {readonly type:'boolean'}
 | {readonly type:'number'; readonly minimum?:number; readonly maximum?:number; readonly unit?:string}
 | {readonly type:'string'; readonly enum?:readonly string[]; readonly maxLength?:number};
export interface ObjectSchema {readonly type:'object'; readonly properties:Readonly<Record<string,ScalarSchema>>; readonly required:readonly string[]; readonly additionalProperties:false}
export type ScalarValue<S extends ScalarSchema> = S extends {readonly type:'boolean'} ? boolean : S extends {readonly type:'number'} ? number : S extends {readonly enum:readonly (infer T extends string)[]} ? T : S extends {readonly type:'string'} ? string : never;
export type ActionArguments<S extends ObjectSchema> = {
 readonly [K in keyof S['properties'] & S['required'][number]]:ScalarValue<S['properties'][K]>
} & {
 readonly [K in Exclude<keyof S['properties'],S['required'][number]>]?:ScalarValue<S['properties'][K]>
};
export interface AssetInstance {
 readonly object:THREE.Group;
 readonly assetId:string;
 readonly actionIds:readonly string[];
 readonly recommendedBody:CharacterBody | null;
}
export interface Assets {
 load(assetId:string):Promise<AssetInstance>;
 search(query:string):readonly {assetId:string;name:string;description:string;limitations:readonly string[];actionIds:readonly string[];recommendedBody:CharacterBody|null;locomotionBindingIds:readonly string[]}[];
}
export interface EntityMetadata {
 readonly id:string;
 readonly name?:string;
 readonly tags?:readonly string[];
 readonly appearancePrompt?:string;
 readonly frontYawRadians?:number;
}
export type SolidPhysics =
 | {readonly kind:'fixed'|'kinematic';readonly shape?:'mesh'|'box'|'convex-hull'}
 | {readonly kind:'dynamic';readonly shape:'box'|'convex-hull';readonly massKilograms:number};
export type EntityOptions = EntityMetadata & {readonly object:THREE.Object3D} & (
 | {readonly role:'terrain'|'obstacle';readonly physics?:SolidPhysics}
 | {readonly role:'decoration';readonly physics?:never}
);
export interface CharacterBody {readonly heightMeters:number;readonly radiusMeters:number}
export interface GroundMovement {
 readonly kind:'ground';
 readonly walkSpeedMetersPerSecond?:number;
 readonly runSpeedMetersPerSecond?:number;
 readonly jumpSpeedMetersPerSecond?:number;
 readonly maximumStepHeightMeters?:number;
 readonly maximumSlopeRadians?:number;
}
export type CharacterOptions = EntityMetadata & {readonly movement?:GroundMovement;readonly locomotionBindingId?:string} & (
 | {readonly asset:AssetInstance;readonly object?:never;readonly body?:CharacterBody}
 | {readonly object:THREE.Object3D;readonly asset?:never;readonly body:CharacterBody}
);
export interface CameraFollowOptions {
 readonly targetEntityId?:string;
 readonly distanceMeters?:number;
 readonly targetHeightMeters?:number;
 readonly pitchRadians?:number;
 readonly activateOnInput?:boolean;
 readonly transitionSeconds?:number;
 readonly rotationSpeedRadiansPerSecond?:number;
 readonly collisionRadiusMeters?:number;
 readonly recoveryHalfLifeSeconds?:number;
}
type WithoutId<T> = T extends unknown ? Omit<T,'id'> : never;
export type SpawnTemplate =
 | {readonly kind:'entity';readonly options:WithoutId<EntityOptions>}
 | {readonly kind:'character';readonly options:WithoutId<CharacterOptions>};
export interface PrototypeDefinition {readonly id:string;readonly description:string;readonly template:SpawnTemplate}
export type PrimitiveCommand =
 | {readonly type:'entity.set-visible';readonly entityId:string;readonly isVisible:boolean}
 | {readonly type:'entity.set-scale';readonly entityId:string;readonly scaleLocalXYZ:Vec3;readonly durationSeconds?:number}
 | {readonly type:'entity.set-position';readonly entityId:string;readonly positionWorldMetersXYZ:Vec3;readonly durationSeconds?:number}
 | {readonly type:'entity.set-rotation';readonly entityId:string;readonly rotationLocalRadiansXYZ:Vec3;readonly durationSeconds?:number}
 | {readonly type:'entity.spawn';readonly prototypeId:string;readonly entityId:string;readonly positionWorldMetersXYZ:Vec3}
 | {readonly type:'entity.despawn';readonly entityId:string}
 | {readonly type:'entity.attach';readonly childEntityId:string;readonly parentEntityId:string;readonly positionLocalMetersXYZ:Vec3}
 | {readonly type:'entity.play-action';readonly entityId:string;readonly actionId:string;readonly playback?:'once'|'loop'}
 | {readonly type:'entity.stop-action';readonly entityId:string}
 | {readonly type:'entity.apply-impulse';readonly entityId:string;readonly impulseNewtonSecondsXYZ:Vec3}
 | {readonly type:'actor.move-to';readonly entityId:string;readonly targetPositionWorldMetersXYZ:Vec3;readonly run?:boolean}
 | {readonly type:'actor.follow';readonly entityId:string;readonly targetEntityId:string;readonly distanceMeters?:number}
 | {readonly type:'actor.stop';readonly entityId:string}
 | {readonly type:'actor.resume-autonomy';readonly entityId:string};
export type PropertyCommand = Extract<PrimitiveCommand,{type:'entity.set-visible'|'entity.set-scale'|'entity.set-position'|'entity.set-rotation'}>;
export type PropertyChannel = 'position'|'rotation'|'scale'|'visibility';
export type EntityWriteChannel = PropertyChannel|'locomotion'|'animation'|'parentage'|'lifecycle'|'impulse';
export interface PropertyWriteClaim {readonly kind:'entity';readonly entityId:string;readonly channels:readonly PropertyChannel[]}
export type WriteClaim =
 | {readonly kind:'entity';readonly entityId:string;readonly channels:readonly EntityWriteChannel[]}
 | {readonly kind:'parameter';readonly parameterId:string}
 | {readonly kind:'prototype';readonly prototypeId:string};
export type ParameterCommand = {readonly type:'parameter.set';readonly parameterId:string;readonly value:Scalar};
export type WorldCommand = PrimitiveCommand | ParameterCommand
 | {readonly type:'action.invoke';readonly actionId:string;readonly arguments:Readonly<Record<string,Scalar>>};
export interface ExecutionOptions {
 /** Host adds this; repeated command IDs return the original receipt, never spawn twice. */
 readonly commandId?:string;
 /** Control/registry revision, not the continuously advancing simulation tick. */
 readonly expectedWorldRevision?:number;
}
export interface RuntimeError {
 readonly code:string;
 readonly phase:string;
 readonly cause?:{readonly code?:string;readonly message:string};
 readonly category:'invalid-input'|'unsupported-capability'|'content'|'runtime'|'stale-context';
 readonly message:string;
 readonly entityIds:readonly string[];
 readonly suggestedAction?:string;
}
export type CommandReceipt =
 | {readonly status:'applied';readonly commandId:string;readonly worldRevision:number}
 | {readonly status:'accepted';readonly commandId:string;readonly worldRevision:number;readonly operationId:string}
 | {readonly status:'rejected';readonly commandId:string;readonly worldRevision:number;readonly error:RuntimeError};
export interface OperationStatus {
 readonly id:string;
 readonly status:'queued'|'running'|'succeeded'|'failed'|'cancelled';
 readonly phase:string;
 readonly outcome?:'reached'|'completed';
 readonly error?:RuntimeError;
 readonly steps?:readonly {readonly commandIndex:number;readonly status:'queued'|'running'|'succeeded'|'failed'|'cancelled';readonly error?:RuntimeError}[];
}
export interface TerminalOperationStatus extends OperationStatus {readonly status:'succeeded'|'failed'|'cancelled'}
export interface Operations {
 get(operationId:string):OperationStatus;
 cancel(operationId:string):void;
 /** Observes terminal state without stepping/starting the world. Abort only cancels this wait. */
 wait(operationId:string,options?:{readonly signal?:AbortSignal}):Promise<TerminalOperationStatus>;
}
export interface ParameterHandle<T extends Scalar> {readonly id:string;readonly value:T;readonly status:'settled'|'transitioning'|'interrupted'|'failed';readonly operationId?:string;readonly error?:RuntimeError}
export interface ParameterDefinition<S extends ScalarSchema> {
 readonly id:string;
 readonly description:string;
 readonly schema:S;
 readonly initialValue:ScalarValue<S>;
 readonly writes:readonly PropertyWriteClaim[];
 /** Pure command projection; no scene writes, IO, promises or nested custom actions. */
 readonly plan:(value:ScalarValue<S>)=>readonly PropertyCommand[];
}
export interface ActionDefinition<S extends ObjectSchema> {
 readonly id:string;
 readonly description:string;
 readonly writes:readonly WriteClaim[];
 readonly inputSchema:S;
 /** Pure plan. Only the returned built-in commands and parameters are committed by SDK. */
 readonly plan:(args:ActionArguments<S>)=>readonly (PrimitiveCommand|ParameterCommand)[];
}
export interface StateHandle<T extends JsonValue> {readonly id:string;readonly value:DeepReadonly<T>;set(value:DeepReadonly<T>):void}
export interface StateStore {
 define(id:string,initialValue:number):StateHandle<number>;
 define(id:string,initialValue:boolean):StateHandle<boolean>;
 define(id:string,initialValue:string):StateHandle<string>;
 define<T extends JsonValue>(id:string,initialValue:T):StateHandle<T>;
}
export type Autonomy = {readonly kind:'patrol';readonly waypointPositionsWorldMetersXYZ:readonly Vec3[];readonly pauseSeconds?:number;readonly run?:boolean};
export interface EntityState {
 readonly id:string;
 readonly generation:number;
 readonly name:string;
 readonly tags:readonly string[];
 readonly appearancePrompt:string;
 readonly role:'terrain'|'obstacle'|'decoration'|'actor';
 readonly positionWorldMetersXYZ:Vec3;
 readonly rotationLocalRadiansXYZ:Vec3;
 readonly scaleLocalXYZ:Vec3;
 readonly isVisibleLocal:boolean;
 readonly isVisibleEffective:boolean;
 readonly parentEntityId?:string;
 readonly motion?:{readonly phase:'grounded'|'jumping'|'falling';readonly velocityWorldMetersPerSecondXYZ:Vec3;readonly isGrounded:boolean;readonly collisionEntityIds:readonly string[]};
 readonly animation?:{readonly actionId:string;readonly clipName:string;readonly timeSeconds:number};
 readonly controlOwners:readonly {readonly channel:string;readonly ownerKind:'player-input'|'user-command'|'autonomy'|'parameter'|'physics';readonly ownerId?:string}[];
}
export interface CommandDescriptor {
 readonly type:WorldCommand['type'];
 readonly schema:Readonly<Record<string,JsonValue>>;
 readonly isAvailable:boolean;
 readonly unavailableReason?:RuntimeError;
}
export interface WorldDescription {
 readonly schemaVersion:2;
 readonly worldRevision:number;
 readonly simulationTick:number;
 readonly supportedMovementKinds:readonly string[];
 readonly entities:readonly {readonly state:EntityState;readonly commands:readonly CommandDescriptor[];readonly actionIds:readonly string[]}[];
 readonly prototypes:readonly {readonly id:string;readonly description:string;readonly status:'preparing'|'ready'|'failed';readonly error?:RuntimeError}[];
 readonly parameters:readonly {readonly id:string;readonly description:string;readonly value:Scalar;readonly schema:ScalarSchema;readonly writes:readonly WriteClaim[];readonly status:'settled'|'transitioning'|'interrupted'|'failed';readonly operationId?:string;readonly error?:RuntimeError}[];
 readonly actions:readonly {readonly id:string;readonly description:string;readonly inputSchema:ObjectSchema;readonly writes:readonly WriteClaim[];readonly isAvailable:boolean;readonly unavailableReason?:RuntimeError}[];
}
export interface CameraState {
 readonly mode:'authored'|'follow-pending'|'follow';
 readonly positionWorldMetersXYZ:Vec3;
 readonly desiredPositionWorldMetersXYZ:Vec3;
 readonly desiredYawRadians:number;
 readonly desiredPitchRadians:number;
 readonly desiredArmDistanceMeters?:number;
 readonly safeArmDistanceMeters?:number;
 readonly actualArmDistanceMeters?:number;
 readonly obstructionEntityId?:string;
}
export interface WorldSnapshot {
 readonly schemaVersion:2;
 readonly worldRevision:number;
 readonly simulationTick:number;
 readonly simulationSeconds:number;
 readonly isRunning:boolean;
 readonly camera:CameraState;
 readonly entities:readonly EntityState[];
 readonly errors:readonly RuntimeError[];
}
export interface TaskScope {
 readonly signal:AbortSignal;
 setState<T extends JsonValue>(state:StateHandle<T>,value:DeepReadonly<T>):void;
 registerPrototype(definition:PrototypeDefinition):Promise<void>;
 readonly assets:Assets;
 addEntity(options:EntityOptions):THREE.Object3D;
 addCharacter(options:CharacterOptions):THREE.Object3D;
 execute(command:WorldCommand):Promise<CommandReceipt>;
}
export interface UpdateContext {readonly deltaSeconds:number;readonly simulationTick:number;readonly simulationSeconds:number}
export interface World {
 readonly scene:THREE.Scene;
 readonly camera:THREE.Camera;
 readonly cameraMode:'authored'|'follow-pending'|'follow';
 readonly assets:Assets;
 readonly state:StateStore;
 readonly operations:Operations;
 addEntity(options:EntityOptions):THREE.Object3D;
 addCharacter(options:CharacterOptions):THREE.Object3D;
 setControlledEntity(entityId:string):void;
 setCameraFollow(options?:CameraFollowOptions):void;
 /** Releases SDK following without disposing/replacing the camera. */
 useAuthoredCamera():THREE.Camera;
 setCaptureTargets(entityIds:readonly string[]):void;
 registerPrototype(definition:PrototypeDefinition):Promise<void>;
 setAutonomy(entityId:string,behavior:Autonomy):void;
 defineParameter<const S extends ScalarSchema>(definition:ParameterDefinition<S>):ParameterHandle<ScalarValue<S>>;
 registerAction<const S extends ObjectSchema>(definition:ActionDefinition<S>):void;
 onInteract(entityId:string,plan:()=>WorldCommand|readonly WorldCommand[]):()=>void;
 /** Direct Three writes are for visual descendants; managed root channels use execute(). */
 onUpdate(callback:(context:UpdateContext)=>void):()=>void;
 onReset(callback:()=>void):()=>void;
 onDispose(callback:()=>void):()=>void;
 execute(command:WorldCommand,options?:ExecutionOptions):Promise<CommandReceipt>;
 runTask<T>(task:(scope:TaskScope)=>Promise<T>):Promise<T>;
 describe(query?:{readonly query?:string;readonly entityIds?:readonly string[]}):WorldDescription;
 snapshot():WorldSnapshot;
 getEntityState(entityId:string):EntityState;
 /** Awaits asset/prototype preparation, seals initial state and exposes Host observation once ready. */
 start():Promise<void>;
 stop():void;
 reset():Promise<void>;
 dispose():void;
}
export declare function createWorld(options:{scene:THREE.Scene;camera:THREE.Camera;canvas?:HTMLCanvasElement;renderer?:THREE.WebGLRenderer}):Promise<World>;
