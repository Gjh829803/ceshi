import { describe, expect, it } from "vitest";
import { evaluateCompiledWorldResourceBudgetV1 } from "@whitebox-world/compiler";
import * as productionBudget from "./native-block-production-budget.js";
import {
  NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1,
} from "./native-block-production-budget.js";
import { evaluateBlockSourceResourceBudgetV1 } from "./native-block-source-budget.test-support.js";

describe("pinned Block source resource accounting", () => {
  it("keeps the unconnected legacy source oracle out of the production budget API", () => {
    expect(productionBudget).not.toHaveProperty("evaluateBlockSourceResourceBudgetV1");
  });
  it("does not publish a fixed source-count gate absent from the old compiler", () => {
    expect(NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1).not.toHaveProperty("maximumBlockCount");
  });
  it("preserves the old inclusive world budget and diagnostic ordering", () => {
    const budget = { maxVertices: 24, maxTriangles: 12, maxColliders: 1 };
    expect(evaluateCompiledWorldResourceBudgetV1({
      usage: { vertices: 24, triangles: 12, colliders: 1 }, budget,
    })).toEqual([]);
    expect(evaluateCompiledWorldResourceBudgetV1({
      usage: { vertices: 25, triangles: 13, colliders: 2 }, budget,
    })).toEqual([
      { severity: "error", code: "COMPILER_RESOURCE_BUDGET_EXCEEDED",
        instancePath: "/world/resourceBudget/maxVertices",
        message: "maxVertices budget is 24, but the compiled world requires 25.",
        details: { actual: 25, maximum: 24 } },
      { severity: "error", code: "COMPILER_RESOURCE_BUDGET_EXCEEDED",
        instancePath: "/world/resourceBudget/maxTriangles",
        message: "maxTriangles budget is 12, but the compiled world requires 13.",
        details: { actual: 13, maximum: 12 } },
      { severity: "error", code: "COMPILER_RESOURCE_BUDGET_EXCEEDED",
        instancePath: "/world/resourceBudget/maxColliders",
        message: "maxColliders budget is 1, but the compiled world requires 2.",
        details: { actual: 2, maximum: 1 } },
    ]);
  });

  it.each([
    [1, 200_000, 300_000],
    [2_083, 200_000, 300_000],
    [2_084, 200_016, 300_000],
    [8_333, 349_992, 300_000],
    [8_334, 350_016, 300_008],
    [102_400, 2_607_600, 1_428_800],
  ])("derives the old limits for %s Blocks without changing Native admission", (sourceBlockCount, maxVertices, maxTriangles) => {
    const result = evaluateBlockSourceResourceBudgetV1({
      sourceBlockCount, runtimeClusterCount: 1, solidRuntimeClusterCount: 1,
      subjectResourceCost: { vertices: 24, triangles: 12, colliders: 1 },
    });
    expect(result.budget).toEqual({ maxVertices, maxTriangles, maxColliders: 33 });
    expect(result.usage).toEqual({ vertices: 52, triangles: 26, colliders: 3 });
    expect(result.diagnostics).toEqual([]);
    expect(NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1).toMatchObject({
      maximumStaticColliderCount: 256,
      maximumStaticColliderVertexCount: 65_536, maximumStaticColliderTriangleCount: 131_072,
    });
  });

  it("does not charge every source Block as a cluster or omit the Subject", () => {
    const input = {
      sourceBlockCount: 8_000, runtimeClusterCount: 2, solidRuntimeClusterCount: 1,
      subjectResourceCost: { vertices: 200_000, triangles: 200_000, colliders: 1 },
    };
    const snapshot = structuredClone(input);
    const merged = evaluateBlockSourceResourceBudgetV1(input);
    expect(merged.budget).toEqual({ maxVertices: 342_000, maxTriangles: 300_000, maxColliders: 33 });
    expect(merged.usage).toEqual({ vertices: 200_052, triangles: 200_026, colliders: 3 });
    expect(merged.diagnostics).toEqual([]);
    const unmerged = evaluateBlockSourceResourceBudgetV1({ ...input, runtimeClusterCount: 8_000 });
    expect(unmerged.diagnostics).toMatchObject([{
      code: "COMPILER_RESOURCE_BUDGET_EXCEEDED", instancePath: "/world/resourceBudget/maxVertices",
      details: { actual: 392_004, maximum: 342_000 },
    }]);
    expect(input).toEqual(snapshot);
  });

  it("retains the exact old foundation overhead and Subject boundary on all three axes", () => {
    const input = {
      sourceBlockCount: 1, runtimeClusterCount: 1, solidRuntimeClusterCount: 1,
      subjectResourceCost: { vertices: 199_972, triangles: 299_986, colliders: 31 },
    };
    expect(evaluateBlockSourceResourceBudgetV1(input).diagnostics).toEqual([]);
    const over = evaluateBlockSourceResourceBudgetV1({ ...input,
      subjectResourceCost: { vertices: 199_973, triangles: 299_987, colliders: 32 },
    });
    expect(over.diagnostics.map(({ instancePath }) => instancePath)).toEqual([
      "/world/resourceBudget/maxVertices", "/world/resourceBudget/maxTriangles", "/world/resourceBudget/maxColliders",
    ]);
  });
});
