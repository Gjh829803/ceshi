import { describe, expect, it } from "vitest";

import {
  hashNativeExecutionTrustProfileBodyV1,
  type NativeEffectiveExecutionBudgetV1,
  type NativeExecutionTrustProfileV1,
} from "@whitebox-world/runtime-contracts";

import {
  REQUIRED_NATIVE_EXECUTION_BUDGET_CAPABILITY_IDS_V1,
  resolveNativeEffectiveExecutionBudgetV1,
} from "./native-execution-budget";

function trustProfile(
  capabilityIds: readonly string[] =
    REQUIRED_NATIVE_EXECUTION_BUDGET_CAPABILITY_IDS_V1,
): NativeExecutionTrustProfileV1 {
  const body = {
    kind: "native-execution-trust-profile",
    schemaVersion: 1,
    id: "native-execution-trust-profile.hosted-isolated",
    resourceRef:
      "worldkit://native-execution-trust-profile/hosted-isolated@1",
    trustMode: "hosted-isolated",
    requiredIsolationCapabilityIds: capabilityIds,
  } as const;
  return {
    ...body,
    contentHash: hashNativeExecutionTrustProfileBodyV1(body),
  };
}

function budget(seed: number): NativeEffectiveExecutionBudgetV1 {
  return {
    scene: {
      maximumVertices: seed + 1,
      maximumTriangles: seed + 2,
      maximumColliders: seed + 3,
    },
    assets: {
      maximumAssetCount: seed + 4,
      maximumAssetBytes: seed + 5,
      maximumTextureCount: seed + 6,
      maximumTextureBytes: seed + 7,
    },
    runtime: {
      maximumSceneNodeCount: seed + 8,
      maximumMaterialCount: seed + 9,
      maximumShaderCount: seed + 10,
      maximumPhysicsBodyCount: seed + 11,
    },
    process: {
      maximumWallTimeMilliseconds: seed + 12,
      maximumCpuTimeMilliseconds: seed + 13,
      maximumMemoryBytes: seed + 14,
      maximumProcessCount: seed + 15,
    },
    protocol: {
      maximumInboundMessageBytes: seed + 16,
      maximumOutboundMessageBytes: seed + 17,
      maximumReceiptBytes: seed + 18,
      maximumDiagnosticCount: seed + 19,
      maximumLogBytes: seed + 20,
    },
  };
}

function asymmetricInput() {
  const hostHardCap = budget(10_000);
  const tenantCap = budget(20_000);
  return {
    trustProfile: trustProfile(),
    sceneProfileBudget: {
      maximumVertices: 101,
      maximumTriangles: 900,
      maximumColliders: 9,
    },
    worldPackageResourceBudget: {
      maximumVertices: 1_000,
      maximumTriangles: 202,
      maximumColliders: 3,
    },
    hostHardCap: {
      ...hostHardCap,
      process: {
        ...hostHardCap.process,
        maximumMemoryBytes: 4_194_304,
      },
      protocol: {
        ...hostHardCap.protocol,
        maximumLogBytes: 20_000,
      },
    },
    tenantCap: {
      ...tenantCap,
      process: {
        ...tenantCap.process,
        maximumMemoryBytes: 8_388_608,
      },
      protocol: {
        ...tenantCap.protocol,
        maximumLogBytes: 8_192,
      },
    },
  } as const;
}

describe("native effective execution budget", () => {
  it("takes the field-by-field minimum and projects exact Package scene fields", () => {
    const actual = resolveNativeEffectiveExecutionBudgetV1(asymmetricInput());

    expect(actual.scene).toEqual({
      maximumVertices: 101,
      maximumTriangles: 202,
      maximumColliders: 3,
    });
    expect(actual.process.maximumMemoryBytes).toBe(4_194_304);
    expect(actual.protocol.maximumLogBytes).toBe(8_192);
    expect(Object.isFrozen(actual)).toBe(true);
    expect(Object.isFrozen(actual.protocol)).toBe(true);
  });

  it("never allows tenant policy to raise a Host or Package limit", () => {
    const input = asymmetricInput();
    const actual = resolveNativeEffectiveExecutionBudgetV1({
      ...input,
      tenantCap: budget(9_000_000),
    });

    expect(actual.scene).toEqual({
      maximumVertices: 101,
      maximumTriangles: 202,
      maximumColliders: 3,
    });
    expect(actual.assets).toEqual(input.hostHardCap.assets);
    expect(actual.runtime).toEqual(input.hostHardCap.runtime);
    expect(actual.process).toEqual(input.hostHardCap.process);
    expect(actual.protocol).toEqual(input.hostHardCap.protocol);
  });

  it("rejects a profile that cannot enforce every budget group", () => {
    const input = asymmetricInput();
    expect(() => resolveNativeEffectiveExecutionBudgetV1({
      ...input,
      trustProfile: trustProfile(
        REQUIRED_NATIVE_EXECUTION_BUDGET_CAPABILITY_IDS_V1.slice(0, -1),
      ),
    })).toThrow(expect.objectContaining({
      code: "NATIVE_EXECUTION_BUDGET_CAPABILITY_MISSING",
    }));
  });

  it.each([
    ["missing group", (input: ReturnType<typeof asymmetricInput>) => {
      const invalid = { ...input.hostHardCap } as Record<string, unknown>;
      delete invalid.protocol;
      return { ...input, hostHardCap: invalid };
    }],
    ["zero", (input: ReturnType<typeof asymmetricInput>) => ({
      ...input,
      tenantCap: {
        ...input.tenantCap,
        process: { ...input.tenantCap.process, maximumProcessCount: 0 },
      },
    })],
    ["negative", (input: ReturnType<typeof asymmetricInput>) => ({
      ...input,
      sceneProfileBudget: {
        ...input.sceneProfileBudget,
        maximumColliders: -1,
      },
    })],
    ["unsafe integer", (input: ReturnType<typeof asymmetricInput>) => ({
      ...input,
      worldPackageResourceBudget: {
        ...input.worldPackageResourceBudget,
        maximumVertices: Number.MAX_SAFE_INTEGER + 1,
      },
    })],
    ["extra key", (input: ReturnType<typeof asymmetricInput>) => ({
      ...input,
      sceneProfileBudget: {
        ...input.sceneProfileBudget,
        maxVertices: 100,
      },
    })],
    ["unknown trust profile", (input: ReturnType<typeof asymmetricInput>) => ({
      ...input,
      trustProfile: { ...input.trustProfile, trustMode: "remote" },
    })],
  ] as const)("fails closed for %s before returning a budget", (_label, mutate) => {
    expect(() => resolveNativeEffectiveExecutionBudgetV1(
      mutate(asymmetricInput()) as never,
    )).toThrow(expect.objectContaining({
      code: "NATIVE_EXECUTION_BUDGET_POLICY_INVALID",
    }));
  });
});
