import type { CommandReceipt, OperationStatus, Vec3, WorldInput, WorldSnapshot } from './contracts.js';

/** Host-only production protocol, installed automatically on the live observer. */
export interface EpisodeStart {
 /** Optional segment view; takes precedence over humanoid.cameraMode. */
 readonly cameraPerspective?:import('./contracts.js').CameraPerspective;
 readonly humanoid?: {
  readonly vehicleInstanceId?:string; readonly mounted?:boolean; readonly cameraMode?:0|1|2;
  readonly velocityWorldMetersPerSecondXYZ?:Vec3; readonly pitchRadians?:number;readonly rollRadians?:number;
  readonly throttle?:number;readonly launched?:boolean;
 };
 readonly positionWorldMetersXYZ: Vec3;
 /** Semantic forward: -Z rotated around world +Y. */
 readonly facingYawRadians: number;
}
export interface EpisodeStartProbe {
 readonly isValid: boolean;
 readonly requestedPositionWorldMetersXYZ: Vec3;
 readonly resolvedPositionWorldMetersXYZ: Vec3;
 readonly diagnostics: readonly { readonly code: string; readonly message: string; readonly entityIds?: readonly string[] }[];
}
export interface EpisodeCapabilities {
 readonly humanoid?:{
  readonly mapId:string;readonly characterInstanceId:string;
  readonly vehicles:readonly {readonly instanceId:string;readonly assetId:string;readonly mode:import('./humanoid-runtime/config').Mode;readonly available:boolean}[];
  readonly cameraModes:readonly (0|1|2)[];readonly inputAxes:readonly string[];
 };
 readonly schemaVersion: 1;
 readonly controlledEntityId: string;
 readonly fixedTimeStepSeconds: number;
 readonly movement: {
  readonly kind: 'ground' | 'custom'; readonly movementId: string;
  readonly episodeInput?:'ground'|'humanoid'|'custom'|'unsupported';readonly startSupport?:'ground'|'free';
  readonly walkSpeedMetersPerSecond: number; readonly runSpeedMetersPerSecond: number; readonly jumpSpeedMetersPerSecond: number;
  readonly heightMeters: number; readonly radiusMeters: number;
  readonly maximumStepHeightMeters: number; readonly maximumSlopeRadians: number;
 };
 readonly camera: { readonly mode: 'authored' | 'follow-pending' | 'follow'; readonly segmentInitialization: 'relative-authored-pose' };
 readonly maximumStartAlignmentMeters: number;
 readonly worldBounds: { readonly minimumWorldMetersXYZ: Vec3; readonly maximumWorldMetersXYZ: Vec3 };
}
export interface EpisodeFrame {
 readonly captureSurface: 'world-renderer-canvas';
 readonly imageDataUrl: string;
 readonly snapshot: WorldSnapshot;
 readonly camera: {
  readonly projectionMatrix: readonly number[]; readonly viewMatrix: readonly number[]; readonly cameraToWorldMatrix: readonly number[];
  /** Actual input basis, which can differ from the rendered obstruction-corrected view. */
  readonly controlForwardWorldXYZ: Vec3;
 };
}
export type EpisodeCommand=Extract<import('./humanoid-runtime/runtime').HumanoidCommand,{readonly type:'humanoid.perform-action'|'humanoid.set-input'|'vehicle.exit'}>|{readonly type:'vehicle.enter';readonly instanceId:string}|{readonly type:'camera.set-perspective';readonly perspective:import('./contracts').CameraPerspective};
export interface EpisodeRouteInputRequest {readonly targetPositionWorldMetersXYZ:Vec3;readonly gait:'walk'|'run';readonly mode?:'travel'|'stop'}
export interface EpisodeRuntimePort {
 readonly schemaVersion: 1;
 capabilities(): EpisodeCapabilities;
 boarding?(instanceId:string):import('./humanoid-runtime/runtime').BoardingObservation;
 routeInput?(request:EpisodeRouteInputRequest):WorldInput;
 probeStart(start: EpisodeStart): EpisodeStartProbe;
 prepareSegment(start: EpisodeStart, viewport: { readonly widthPixels: number; readonly heightPixels: number }): Promise<WorldSnapshot>;
 /** Commands share the live dispatcher and are admitted only while this segment owns the clock. */
 execute(command:EpisodeCommand):Promise<CommandReceipt>;
 operation(operationId:string):OperationStatus;
 advance(input: WorldInput, ticks: number): WorldSnapshot;
 frame(mimeType: 'image/jpeg' | 'image/png'): EpisodeFrame;
 release(): void;
}
