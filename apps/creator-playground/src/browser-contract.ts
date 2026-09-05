import type { BabylonNativeSceneAdmissionBudgetV1 } from "@whitebox-world/native-babylon/host";
import type { BabylonRuntimeProjectionV1 } from "@whitebox-world/runtime-babylon";
import type { FixedInputV1 } from "@whitebox-world/runtime-contracts";

export interface CreatorHarnessConfigV1 {
  readonly sceneId: string;
  readonly inputHash: string;
  readonly worldBounds: Readonly<{
    centerMetersXZ: readonly [number, number];
    sizeMetersXZ: readonly [number, number];
    heightRangeMeters: readonly [number, number];
  }>;
  readonly admissionBudget?: BabylonNativeSceneAdmissionBudgetV1;
}

export interface CreatorCameraAdjustmentV1 {
  readonly yawRadiansDelta?: number;
  readonly pitchRadiansDelta?: number;
  readonly distanceMetersDelta?: number;
}

export interface CreatorCaptureRequestV1 {
  readonly view: "opening" | "top-down" | "entity-triview";
  readonly widthPixels?: number;
  readonly heightPixels?: number;
  readonly entityIds?: readonly string[];
  readonly azimuthRadians?: number;
  readonly identityColor?: string;
}

export interface CreatorCaptureResultV1 {
  readonly dataUrl: string;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly projectedBoundsByEntityId: Readonly<Record<string, Readonly<{
    centerRatioXY: readonly [number, number];
    sizeRatioXY: readonly [number, number];
  }>>>;
}

export interface CreatorAuditV1 {
  readonly kind: "experimental-native-creator-audit";
  readonly schemaVersion: 1;
  readonly sceneId: string;
  readonly inputHash: string;
  readonly contributionHash: string;
  readonly colliderIds: readonly string[];
  readonly spawnMarkerId: string;
  readonly errors: readonly string[];
  readonly isLive: boolean;
  readonly isDisposed: boolean;
}

export interface CreatorBrowserApiV1 {
  readonly ready: true;
  snapshot(): BabylonRuntimeProjectionV1;
  runFixedInput(input: FixedInputV1): Promise<BabylonRuntimeProjectionV1>;
  reset(): Promise<BabylonRuntimeProjectionV1>;
  adjustCamera(input: CreatorCameraAdjustmentV1): Promise<BabylonRuntimeProjectionV1>;
  capture(input: CreatorCaptureRequestV1): Promise<CreatorCaptureResultV1>;
  audit(): CreatorAuditV1;
  startLive(): Promise<void>;
  stopLive(): Promise<void>;
  dispose(): Promise<void>;
}

export function creatorCaptureDimensionsV1(input: CreatorCaptureRequestV1): Readonly<{
  widthPixels: number;
  heightPixels: number;
}> {
  const widthPixels = input.widthPixels ?? 1280;
  const heightPixels = input.heightPixels ?? 720;
  if (![widthPixels, heightPixels].every((value) =>
    Number.isSafeInteger(value) && value >= 64 && value <= 4096
  )) throw new RangeError("CREATOR_CAPTURE_DIMENSIONS_INVALID: use integers from 64 to 4096 pixels.");
  return Object.freeze({ widthPixels, heightPixels });
}

export function creatorTriviewDirectionV1(azimuthRadians = 0): readonly [number, number] {
  if (!Number.isFinite(azimuthRadians)) {
    throw new RangeError("CREATOR_CAPTURE_AZIMUTH_INVALID");
  }
  return Object.freeze([Math.sin(azimuthRadians), -Math.cos(azimuthRadians)] as const);
}

declare global {
  interface Window {
    __WORLDKIT_CREATOR__?: CreatorBrowserApiV1;
    __WORLDKIT_CREATOR_STATUS__?: Readonly<{
      phase: "loading" | "ready" | "failed" | "disposed";
      errors: readonly string[];
    }>;
  }
}
