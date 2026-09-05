import {
  BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_XYZ_V1,
  BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1,
} from "@whitebox-world/native-babylon-block-profile";
import type { NativeBlockGenerationBudgetV1 } from "@whitebox-world/scene-authoring-contracts";
import { BNA2_WHITEBOX_ADMISSION_BUDGET_V1 } from "../native-scene/admission-budget.js";

export const NATIVE_BLOCK_RECONSTRUCTION_FORMAL_TIMEOUT_SECONDS_V1 = 1_800;
// CF-20/R1: 8k was measured with the real Babylon Runtime/Host batching/Havok.
// 16k crashed the software-browser workload and is deliberately not selected.
// This ceiling is not a target count or a guarantee for every layout/Collider mix.
export const NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1 = Object.freeze({
  maximumBlockCount: 8_000,
  ...BNA2_WHITEBOX_ADMISSION_BUDGET_V1,
  maximumOutputBytes: 4_000_000,
  timeoutSeconds: NATIVE_BLOCK_RECONSTRUCTION_FORMAL_TIMEOUT_SECONDS_V1,
} satisfies NativeBlockGenerationBudgetV1);

export const NATIVE_BLOCK_PLANNER_BUDGET_CONTEXT_REF_V1 = "context/native-block-production-budget.json";
export const NATIVE_BLOCK_PLANNER_BUDGET_CONTEXT_V1 = Object.freeze({
  kind: "native-block-production-budget", schemaVersion: 1,
  budgets: NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1,
  blockSizeMetersXYZByShape: BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1,
  centerLatticeMetersXYZ: BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_XYZ_V1,
});
