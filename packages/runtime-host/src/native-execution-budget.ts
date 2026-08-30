import {
  parseNativeEffectiveExecutionBudgetV1,
  parseNativeExecutionTrustProfileV1,
  type NativeEffectiveExecutionBudgetV1,
  type NativeExecutionTrustProfileV1,
} from "@whitebox-world/runtime-contracts";
import type {
  WorldPackageResourceBudgetV1,
} from "@whitebox-world/world-package/runtime-contract";
import { isNil } from "lodash-es";

export const REQUIRED_NATIVE_EXECUTION_BUDGET_CAPABILITY_IDS_V1 =
  Object.freeze([
    "scene-budget-enforcement",
    "asset-budget-enforcement",
    "runtime-budget-enforcement",
    "process-budget-enforcement",
    "protocol-budget-enforcement",
  ] as const);

export type NativeExecutionBudgetPolicyErrorCodeV1 =
  | "NATIVE_EXECUTION_BUDGET_POLICY_INVALID"
  | "NATIVE_EXECUTION_BUDGET_CAPABILITY_MISSING";

export class NativeExecutionBudgetPolicyErrorV1 extends Error {
  readonly code: NativeExecutionBudgetPolicyErrorCodeV1;
  readonly missingCapabilityIds: readonly string[];

  constructor(
    code: NativeExecutionBudgetPolicyErrorCodeV1,
    message: string,
    missingCapabilityIds: readonly string[] = [],
  ) {
    super(message);
    this.name = "NativeExecutionBudgetPolicyErrorV1";
    this.code = code;
    this.missingCapabilityIds = Object.freeze([...missingCapabilityIds]);
  }
}

export interface ResolveNativeEffectiveExecutionBudgetInputV1 {
  readonly trustProfile: NativeExecutionTrustProfileV1;
  readonly sceneProfileBudget: WorldPackageResourceBudgetV1;
  readonly worldPackageResourceBudget: WorldPackageResourceBudgetV1;
  readonly hostHardCap: NativeEffectiveExecutionBudgetV1;
  readonly tenantCap: NativeEffectiveExecutionBudgetV1;
}

const SCENE_BUDGET_FIELDS = Object.freeze([
  "maximumVertices",
  "maximumTriangles",
  "maximumColliders",
] as const);

function invalidPolicy(): never {
  throw new NativeExecutionBudgetPolicyErrorV1(
    "NATIVE_EXECUTION_BUDGET_POLICY_INVALID",
    "Native execution budget policy must match the closed Hosted V1 contract.",
  );
}

function parseSceneBudget(
  input: unknown,
): Readonly<WorldPackageResourceBudgetV1> {
  if (
    typeof input !== "object" ||
    isNil(input) ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) return invalidPolicy();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(descriptors).some((key) => typeof key !== "string") ||
    Object.keys(descriptors).length !== SCENE_BUDGET_FIELDS.length ||
    SCENE_BUDGET_FIELDS.some((field) => {
      const descriptor = descriptors[field];
      return isNil(descriptor) ||
        !Object.hasOwn(descriptor, "value") ||
        !Number.isSafeInteger(descriptor.value) ||
        (descriptor.value as number) < 1;
    }) ||
    Object.keys(descriptors).some((field) =>
      !SCENE_BUDGET_FIELDS.includes(
        field as (typeof SCENE_BUDGET_FIELDS)[number],
      )
    )
  ) return invalidPolicy();
  return Object.freeze({
    maximumVertices: descriptors.maximumVertices!.value as number,
    maximumTriangles: descriptors.maximumTriangles!.value as number,
    maximumColliders: descriptors.maximumColliders!.value as number,
  });
}

function parsePolicyInput(
  input: ResolveNativeEffectiveExecutionBudgetInputV1,
): Readonly<{
  trustProfile: NativeExecutionTrustProfileV1;
  sceneProfileBudget: Readonly<WorldPackageResourceBudgetV1>;
  worldPackageResourceBudget: Readonly<WorldPackageResourceBudgetV1>;
  hostHardCap: NativeEffectiveExecutionBudgetV1;
  tenantCap: NativeEffectiveExecutionBudgetV1;
}> {
  try {
    const trustProfile = parseNativeExecutionTrustProfileV1(
      input.trustProfile,
    );
    if (trustProfile.trustMode !== "hosted-isolated") return invalidPolicy();
    return Object.freeze({
      trustProfile,
      sceneProfileBudget: parseSceneBudget(input.sceneProfileBudget),
      worldPackageResourceBudget: parseSceneBudget(
        input.worldPackageResourceBudget,
      ),
      hostHardCap: parseNativeEffectiveExecutionBudgetV1(input.hostHardCap),
      tenantCap: parseNativeEffectiveExecutionBudgetV1(input.tenantCap),
    });
  } catch (error) {
    if (error instanceof NativeExecutionBudgetPolicyErrorV1) throw error;
    return invalidPolicy();
  }
}

function minimumGroup<Fields extends string>(
  fields: readonly Fields[],
  left: Readonly<Record<Fields, number>>,
  right: Readonly<Record<Fields, number>>,
): Readonly<Record<Fields, number>> {
  return Object.freeze(Object.fromEntries(fields.map((field) => [
    field,
    Math.min(left[field], right[field]),
  ]))) as Readonly<Record<Fields, number>>;
}

export function resolveNativeEffectiveExecutionBudgetV1(
  input: ResolveNativeEffectiveExecutionBudgetInputV1,
): NativeEffectiveExecutionBudgetV1 {
  const parsed = parsePolicyInput(input);
  const declaredCapabilities = new Set(
    parsed.trustProfile.requiredIsolationCapabilityIds,
  );
  const missingCapabilityIds =
    REQUIRED_NATIVE_EXECUTION_BUDGET_CAPABILITY_IDS_V1.filter(
      (capabilityId) => !declaredCapabilities.has(capabilityId),
    );
  if (missingCapabilityIds.length > 0) {
    throw new NativeExecutionBudgetPolicyErrorV1(
      "NATIVE_EXECUTION_BUDGET_CAPABILITY_MISSING",
      "Hosted Native execution Trust Profile does not require every budget enforcement capability.",
      missingCapabilityIds,
    );
  }

  const scene = Object.freeze({
    maximumVertices: Math.min(
      parsed.sceneProfileBudget.maximumVertices,
      parsed.worldPackageResourceBudget.maximumVertices,
      parsed.hostHardCap.scene.maximumVertices,
      parsed.tenantCap.scene.maximumVertices,
    ),
    maximumTriangles: Math.min(
      parsed.sceneProfileBudget.maximumTriangles,
      parsed.worldPackageResourceBudget.maximumTriangles,
      parsed.hostHardCap.scene.maximumTriangles,
      parsed.tenantCap.scene.maximumTriangles,
    ),
    maximumColliders: Math.min(
      parsed.sceneProfileBudget.maximumColliders,
      parsed.worldPackageResourceBudget.maximumColliders,
      parsed.hostHardCap.scene.maximumColliders,
      parsed.tenantCap.scene.maximumColliders,
    ),
  });
  return parseNativeEffectiveExecutionBudgetV1(Object.freeze({
    scene,
    assets: minimumGroup(
      [
        "maximumAssetCount",
        "maximumAssetBytes",
        "maximumTextureCount",
        "maximumTextureBytes",
      ] as const,
      parsed.hostHardCap.assets,
      parsed.tenantCap.assets,
    ),
    runtime: minimumGroup(
      [
        "maximumSceneNodeCount",
        "maximumMaterialCount",
        "maximumShaderCount",
        "maximumPhysicsBodyCount",
      ] as const,
      parsed.hostHardCap.runtime,
      parsed.tenantCap.runtime,
    ),
    process: minimumGroup(
      [
        "maximumWallTimeMilliseconds",
        "maximumCpuTimeMilliseconds",
        "maximumMemoryBytes",
        "maximumProcessCount",
      ] as const,
      parsed.hostHardCap.process,
      parsed.tenantCap.process,
    ),
    protocol: minimumGroup(
      [
        "maximumInboundMessageBytes",
        "maximumOutboundMessageBytes",
        "maximumReceiptBytes",
        "maximumDiagnosticCount",
        "maximumLogBytes",
      ] as const,
      parsed.hostHardCap.protocol,
      parsed.tenantCap.protocol,
    ),
  }));
}
