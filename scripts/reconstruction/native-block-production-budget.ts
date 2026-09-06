import {
  BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_XYZ_V1,
  BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1,
} from "@whitebox-world/native-babylon-block-profile";
import type { NativeBlockGenerationBudgetV1 } from "@whitebox-world/scene-authoring-contracts";
import { evaluateCompiledWorldResourceBudgetV1 } from "@whitebox-world/compiler";
import { BNA2_WHITEBOX_ADMISSION_BUDGET_V1 } from "../native-scene/admission-budget.js";

export const NATIVE_BLOCK_RECONSTRUCTION_FORMAL_TIMEOUT_SECONDS_V1 = 1_800;
// Pinned old source accounting has no fixed Block-count admission gate.
// Keep Native contribution, output and process limits in their own domains.
export const NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1 = Object.freeze({
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

/**
 * Pinned old Block Compiler source accounting, not Native render/physics usage.
 * The caller must supply proven runtime-cluster counts, never guess them from
 * Block count, Collider triangles or a palette-to-physics inference. B2 owns
 * that producer and activation; this helper does not add a production gate.
 */
export function evaluateBlockSourceResourceBudgetV1(input: Readonly<{
  sourceBlockCount: number;
  runtimeClusterCount: number;
  solidRuntimeClusterCount: number;
  subjectResourceCost: Readonly<{ vertices: number; triangles: number; colliders: number }>;
}>) {
  const budget = Object.freeze({
    maxVertices: Math.max(200_000, input.sourceBlockCount * 24 + 150_000),
    maxTriangles: Math.max(300_000, input.sourceBlockCount * 12 + 200_000),
    maxColliders: input.solidRuntimeClusterCount + 32,
  });
  // These constants reproduce the old 2x2 foundation accounting only. They do
  // not create a foundation, invisible geometry, another Collider or Runtime.
  const usage = Object.freeze({
    vertices: 4 + input.runtimeClusterCount * 24 + input.subjectResourceCost.vertices,
    triangles: 2 + input.runtimeClusterCount * 12 + input.subjectResourceCost.triangles,
    colliders: 1 + input.solidRuntimeClusterCount + input.subjectResourceCost.colliders,
  });
  return Object.freeze({ budget, usage,
    diagnostics: evaluateCompiledWorldResourceBudgetV1({ usage, budget }),
  });
}
