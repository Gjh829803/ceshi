import { evaluateCompiledWorldResourceBudgetV1 } from "@whitebox-world/compiler";

/**
 * Test-only oracle for pinned old Block Compiler source accounting.
 * This is not Native render/physics usage or a production admission rule.
 * Callers supply explicit old runtime-cluster counts, never palette-inferred
 * physics or source Block counts substituted for actual clusters.
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
  // Old 2x2 foundation accounting only, never a Native foundation producer.
  const usage = Object.freeze({
    vertices: 4 + input.runtimeClusterCount * 24 + input.subjectResourceCost.vertices,
    triangles: 2 + input.runtimeClusterCount * 12 + input.subjectResourceCost.triangles,
    colliders: 1 + input.solidRuntimeClusterCount + input.subjectResourceCost.colliders,
  });
  return Object.freeze({ budget, usage,
    diagnostics: evaluateCompiledWorldResourceBudgetV1({ usage, budget }),
  });
}
