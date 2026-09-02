import type {
  RuntimeMotionKernelDefinitionV1,
} from "@whitebox-world/runtime-contracts";

export const GROUND_SAFETY_BOUNDARY_MEMBERSHIP_MASK_V1 = 0x20000000;

export function groundSafetyBoundaryEnabledForMotionKernelV1(
  implementationId: RuntimeMotionKernelDefinitionV1["implementationId"],
): boolean {
  return implementationId === "free-ground" ||
    implementationId === "forward-steer" ||
    implementationId === "wheeled-arcade" ||
    implementationId === "surface-slide";
}

export function groundSafetyBoundaryCollideMaskV1(
  currentMask: number,
  implementationId: RuntimeMotionKernelDefinitionV1["implementationId"],
): number {
  const unsigned = currentMask >>> 0;
  return groundSafetyBoundaryEnabledForMotionKernelV1(implementationId)
    ? (unsigned | GROUND_SAFETY_BOUNDARY_MEMBERSHIP_MASK_V1) >>> 0
    : (unsigned & ~GROUND_SAFETY_BOUNDARY_MEMBERSHIP_MASK_V1) >>> 0;
}
