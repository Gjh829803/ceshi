import type { Vec3, WorldInput, WorldSnapshot } from './contracts.js';

/** Host-only production protocol, installed automatically on the live observer. */
export interface EpisodeStart {
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
 readonly schemaVersion: 1;
 readonly controlledEntityId: string;
 readonly fixedTimeStepSeconds: number;
 readonly movement: {
  readonly kind: 'ground' | 'custom'; readonly movementId: string;
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
export interface EpisodeRuntimePort {
 readonly schemaVersion: 1;
 capabilities(): EpisodeCapabilities;
 probeStart(start: EpisodeStart): EpisodeStartProbe;
 prepareSegment(start: EpisodeStart, viewport: { readonly widthPixels: number; readonly heightPixels: number }): Promise<WorldSnapshot>;
 advance(input: WorldInput, ticks: number): WorldSnapshot;
 frame(mimeType: 'image/jpeg' | 'image/png'): EpisodeFrame;
 release(): void;
}
