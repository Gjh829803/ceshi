import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { compileResolvedTraversalLockV1 } from "@whitebox-world/compiler";
import { sha256Bytes } from "@whitebox-world/protocol";
import type {
  SubjectAssetResolveRequestV1,
  SubjectAssetResolverV1,
} from "@whitebox-world/runtime-babylon";
import type {
  WorldkitBrowserRouteEvidencePublicationV2,
} from "@whitebox-world/runtime-contracts";
import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
  createTraversalCapabilityEnvelopeV1,
  resolveTraversalDriverProfileV1,
  resolveTraversalGraphBuilderProfileV2,
  type RouteBuildInputReceiptV2,
  type TraversalRuntimePortV1,
} from "@whitebox-world/traversal";
import {
  createRouteBuildInputFromPlanV2,
  evaluateRequiredRouteV2,
} from "@whitebox-world/traversal-recast";
import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  createRouteValidationReportV2,
  createWorldPackageValidationSubjectV1,
  createWorldkitBrowserRouteEvidencePublicationV2,
  hashValidationReportV2,
  runRouteRuntimeProbeV2,
  type ValidationReportV2,
  type WorldPackageValidationSubjectV1,
} from "@whitebox-world/validation";
import {
  createWorldPackageBuildReceiptV1,
  type ResolvedWorldPackageResourceArtifactV1,
  type WorldPackageBuildReceiptV1,
} from "@whitebox-world/world-package";
import { isNil } from "lodash-es";

import {
  orchestrateRouteValidationV1,
  type RouteValidationEvidenceFileV1,
} from "./route-validation-orchestrator";
import { loadWorldkitRoutePipeline } from "./worldkit-pipeline";
import { resolveWorldPackageResourceArtifactsV1 } from "./world-package-resource-resolver";

type Hash = `sha256:${string}`;

export const TRUSTED_ROUTE_RENDER_CADENCES_V1 = Object.freeze([
  "30-like",
  "60-like",
  "120-like",
] as const);

export type TrustedRouteRenderCadenceV1 =
  (typeof TRUSTED_ROUTE_RENDER_CADENCES_V1)[number];

export interface TrustedRouteValidationOptionsV1 {
  /**
   * Trusted Host-only render scheduling used by deterministic validation.
   * It is intentionally absent from Authoring JSON and Browser/CLI protocols.
   */
  readonly renderCadence?: TrustedRouteRenderCadenceV1;
  /**
   * Trusted Host-only Registry selection. Values are resolved as locked V2
   * Profiles; callers cannot supply a numeric parameter bag.
   */
  readonly graphBuilderProfileRef?: string;
}

export interface TrustedRouteRenderScheduleStatsV1 {
  readonly renderCadence: TrustedRouteRenderCadenceV1;
  readonly fixedTickCount: number;
  readonly renderFrameCount: number;
}

export interface TrustedRouteValidationResultV1 {
  readonly worldPackageBuildReceipt: WorldPackageBuildReceiptV1;
  readonly subject: WorldPackageValidationSubjectV1;
  readonly report: ValidationReportV2;
  readonly validationReportHash: Hash;
  readonly evidenceFiles: readonly RouteValidationEvidenceFileV1[];
  readonly routeEvidencePublication: WorldkitBrowserRouteEvidencePublicationV2;
  readonly routeBuildInputReceipts:
    readonly RouteBuildInputReceiptV2[];
  readonly hostRenderScheduleStats?: TrustedRouteRenderScheduleStatsV1;
}

export class RouteValidationRunnerInfrastructureErrorV1 extends Error {
  public readonly name = "RouteValidationRunnerInfrastructureErrorV1";
  public readonly code = "WORLDKIT_ROUTE_VALIDATION_INFRASTRUCTURE_ERROR";

  public constructor(
    public readonly reason: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
    cause?: unknown,
  ) {
    super(
      `${"WORLDKIT_ROUTE_VALIDATION_INFRASTRUCTURE_ERROR"}: ${reason}`,
      isNil(cause) ? undefined : { cause },
    );
  }
}

function infrastructureFailure(
  reason: string,
  details: Readonly<Record<string, unknown>> = {},
  cause?: unknown,
): RouteValidationRunnerInfrastructureErrorV1 {
  return new RouteValidationRunnerInfrastructureErrorV1(
    reason,
    details,
    cause,
  );
}

function copyArrayBuffer(bytes: Readonly<Uint8Array>): ArrayBuffer {
  const copy = new Uint8Array(bytes);
  return copy.buffer.slice(
    copy.byteOffset,
    copy.byteOffset + copy.byteLength,
  ) as ArrayBuffer;
}

function renderFrameCountAfterTick(
  renderCadence: TrustedRouteRenderCadenceV1,
  fixedTickCount: number,
): number {
  if (renderCadence === "30-like") return fixedTickCount % 2 === 0 ? 1 : 0;
  if (renderCadence === "60-like") return 1;
  if (renderCadence === "120-like") return 2;
  throw infrastructureFailure("WORLDKIT_ROUTE_RENDER_CADENCE_INVALID", {
    renderCadence,
  });
}

function wrapRuntimePortWithRenderCadenceV1(
  runtimePort: TraversalRuntimePortV1,
  renderFrame: () => unknown,
  renderCadence: TrustedRouteRenderCadenceV1,
  recordFixedTick: (renderFrameCount: number) => void,
): TraversalRuntimePortV1 {
  let fixedTickCount = 0;
  const wrappedPort: TraversalRuntimePortV1 = {
    kind: runtimePort.kind,
    schemaVersion: runtimePort.schemaVersion,
    traversingEntityId: runtimePort.traversingEntityId,
    authoringSpecHash: runtimePort.authoringSpecHash,
    layoutSolveReportHash: runtimePort.layoutSolveReportHash,
    resourceLockHash: runtimePort.resourceLockHash,
    executionPlanHash: runtimePort.executionPlanHash,
    resolvedTraversalLockHash: runtimePort.resolvedTraversalLockHash,
    runtimeImplementationIdentity: runtimePort.runtimeImplementationIdentity,
    readLatestTickEvidence: () => runtimePort.readLatestTickEvidence(),
    resetToStartAnchor: (request) =>
      runtimePort.resetToStartAnchor(request),
    runFixedTick: async (request) => {
      const evidence = await runtimePort.runFixedTick(request);
      fixedTickCount += 1;
      const renderFrameCount = renderFrameCountAfterTick(
        renderCadence,
        fixedTickCount,
      );
      for (let index = 0; index < renderFrameCount; index += 1) {
        renderFrame();
      }
      recordFixedTick(renderFrameCount);
      return evidence;
    },
  };
  return Object.freeze(wrappedPort);
}

/**
 * Converts already-verified WorldPackage resource artifacts into the only
 * Subject Asset resolver used by the headless validation Runtime. The bytes
 * are snapshotted at construction and detached for every resolution.
 */
export function createWorldPackageSubjectAssetResolverV1(
  artifacts: readonly ResolvedWorldPackageResourceArtifactV1[],
): SubjectAssetResolverV1 {
  const artifactsByRef = new Map<string, Readonly<{
    packagePath: string;
    mediaType: string;
    byteLength: number;
    contentHash: string;
    bytes: Uint8Array;
  }>>();
  for (const artifact of artifacts) {
    if (artifactsByRef.has(artifact.resourceRef)) {
      throw infrastructureFailure("WORLDKIT_ROUTE_VALIDATION_ASSET_DUPLICATE", {
        resourceRef: artifact.resourceRef,
      });
    }
    if (!(artifact.bytes instanceof Uint8Array)) {
      throw infrastructureFailure("WORLDKIT_ROUTE_VALIDATION_ASSET_INVALID", {
        resourceRef: artifact.resourceRef,
      });
    }
    const bytes = new Uint8Array(artifact.bytes);
    artifactsByRef.set(artifact.resourceRef, Object.freeze({
      packagePath: artifact.packagePath,
      mediaType: artifact.mediaType,
      byteLength: bytes.byteLength,
      contentHash: sha256Bytes(bytes),
      bytes,
    }));
  }
  return Object.freeze({
    async resolveSubjectAsset(request: SubjectAssetResolveRequestV1) {
      const artifact = artifactsByRef.get(request.subjectAssetRef);
      if (isNil(artifact)) {
        throw infrastructureFailure(
          "WORLDKIT_ROUTE_VALIDATION_ASSET_UNAVAILABLE",
          { resourceRef: request.subjectAssetRef },
        );
      }
      if (
        request.mediaType !== artifact.mediaType ||
        request.byteLength !== artifact.byteLength ||
        request.artifactContentHash !== artifact.contentHash
      ) {
        throw infrastructureFailure(
          "WORLDKIT_ROUTE_VALIDATION_ASSET_IDENTITY_MISMATCH",
          { resourceRef: request.subjectAssetRef },
        );
      }
      return {
        bytes: new Uint8Array(artifact.bytes),
        sourceLabel: `world-package:${artifact.packagePath}`,
      };
    },
  });
}

async function loadHavokWasmBytesV1(): Promise<Uint8Array> {
  const filePath = createRequire(import.meta.url).resolve(
    "@babylonjs/havok/lib/esm/HavokPhysics.wasm",
  );
  return new Uint8Array(await readFile(filePath));
}

export async function runTrustedRouteValidationV1(
  inputPath: string,
  options: TrustedRouteValidationOptionsV1 = {},
): Promise<TrustedRouteValidationResultV1> {
  if (
    !isNil(options.renderCadence) &&
    !TRUSTED_ROUTE_RENDER_CADENCES_V1.includes(options.renderCadence)
  ) {
    throw infrastructureFailure("WORLDKIT_ROUTE_RENDER_CADENCE_INVALID", {
      renderCadence: options.renderCadence,
    });
  }
  let hostFixedTickCount = 0;
  let hostRenderFrameCount = 0;
  const routeBuildInputReceipts: RouteBuildInputReceiptV2[] = [];
  let graphBuilderProfile: ReturnType<
    typeof resolveTraversalGraphBuilderProfileV2
  >;
  try {
    graphBuilderProfile = resolveTraversalGraphBuilderProfileV2(
      options.graphBuilderProfileRef ??
        BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    );
  } catch (error) {
    throw infrastructureFailure(
      "WORLDKIT_ROUTE_GRAPH_BUILDER_PROFILE_INVALID",
      { graphBuilderProfileRef: options.graphBuilderProfileRef },
      error,
    );
  }
  const pipeline = await loadWorldkitRoutePipeline(inputPath);
  if (!pipeline.ok) {
    throw infrastructureFailure(
      "WORLDKIT_ROUTE_VALIDATION_INPUT_INVALID",
      { diagnostics: pipeline.diagnostics },
    );
  }
  let resourceArtifacts: readonly ResolvedWorldPackageResourceArtifactV1[];
  try {
    resourceArtifacts = await resolveWorldPackageResourceArtifactsV1(
      pipeline.normalizedWorldIr,
    );
  } catch (error) {
    throw infrastructureFailure(
      "WORLDKIT_ROUTE_VALIDATION_RESOURCE_RESOLUTION_FAILED",
      { inputPath: pipeline.absoluteInputPath },
      error,
    );
  }
  const layoutSolveResult = Object.freeze({
    status: pipeline.layoutSolveReport.status,
    report: pipeline.layoutSolveReport,
    layoutSolveReportHash: pipeline.layoutSolveReportHash,
  });
  const worldPackageBuildReceipt = createWorldPackageBuildReceiptV1({
    packageId: `${pipeline.authoringSpec.id}.world-package`,
    authoringSpec: pipeline.authoringSpec,
    normalizedWorldIr: pipeline.normalizedWorldIr,
    layoutSolveResult,
    executionPlan: pipeline.executionPlan,
    resourceArtifacts,
  });
  const subject = createWorldPackageValidationSubjectV1({
    worldPackageBuildReceipt,
    authoringSpec: pipeline.authoringSpec,
    normalizedWorldIr: pipeline.normalizedWorldIr,
    layoutSolveResult,
    executionPlan: pipeline.executionPlan,
  });
  const runtimeAssetResolver = createWorldPackageSubjectAssetResolverV1(
    resourceArtifacts,
  );
  let havokWasmBytesPromise: Promise<Uint8Array> | undefined;
  const loadHavokWasmBytesOnce = (): Promise<Uint8Array> => {
    havokWasmBytesPromise ??= loadHavokWasmBytesV1();
    return havokWasmBytesPromise;
  };
  const runtimeBabylon = await import("@whitebox-world/runtime-babylon");

  const orchestration = await orchestrateRouteValidationV1({
    executionPlan: pipeline.executionPlan,
    subject,
    reportId: `${pipeline.authoringSpec.id}.route-validation`,
    runtimeAssetResolver,
  }, {
    compileTraversalLock: ({ executionPlan, traversingEntityId }) =>
      compileResolvedTraversalLockV1({
        normalizedWorldIr: pipeline.normalizedWorldIr,
        executionPlan,
        traversingEntityId,
        runtimeImplementationIdentity:
          runtimeBabylon.BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
      }),
    resolveGraphBuilderProfile: () => graphBuilderProfile,
    createCapabilityEnvelope: (input) =>
      createTraversalCapabilityEnvelopeV1(input),
    createBuildInput: (input) => {
      const receipt = createRouteBuildInputFromPlanV2(input);
      routeBuildInputReceipts.push(receipt);
      return receipt;
    },
    evaluateRoute: (input) => evaluateRequiredRouteV2(input),
    createRuntimeLease: async (input) => {
      const havokWasmBytes = input.havokWasmBytes ??
        await loadHavokWasmBytesOnce();
      const runtime = await runtimeBabylon.BabylonWorldRuntime.create({
        executionPlan: input.executionPlan,
        runtimeSessionId: input.runtimeSessionId,
        havokWasmBinary: copyArrayBuffer(
          input.havokWasmBytes ?? havokWasmBytes,
        ),
        subjectAssetResolver:
          input.runtimeAssetResolver ?? runtimeAssetResolver,
        autoStartRenderLoop: false,
        engineFactory: () => new NullEngine({
          renderWidth: 320,
          renderHeight: 180,
          textureSize: 256,
          deterministicLockstep: true,
          lockstepMaxSteps: 4,
        }),
      });
      try {
        const providerRuntimePort =
          runtimeBabylon.createBabylonTraversalRuntimePortV1({
            runtime,
            traversalLockReceipt: input.traversalLockReceipt,
          });
        const runtimePort = isNil(options.renderCadence)
          ? providerRuntimePort
          : wrapRuntimePortWithRenderCadenceV1(
            providerRuntimePort,
            () => runtime.renderFrame(),
            options.renderCadence,
            (renderFrameCount) => {
              hostFixedTickCount += 1;
              hostRenderFrameCount += renderFrameCount;
            },
          );
        return Object.freeze({
          runtimePort,
          dispose: () => runtime.dispose(),
        });
      } catch (error) {
        let cleanupError: unknown;
        try {
          await runtime.dispose();
        } catch (disposeError) {
          cleanupError = disposeError;
        }
        if (!isNil(cleanupError)) {
          throw new AggregateError(
            [error, cleanupError],
            "WORLDKIT_ROUTE_VALIDATION_RUNTIME_ACQUIRE_AND_CLEANUP_FAILED",
          );
        }
        throw error;
      }
    },
    resolveDriverProfile: () => resolveTraversalDriverProfileV1(
      BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
    ),
    runRuntimeProbe: (input) => runRouteRuntimeProbeV2(input),
    createReport: (input) => createRouteValidationReportV2(input),
  });
  const routeEvidencePublication =
    createWorldkitBrowserRouteEvidencePublicationV2({
      subject,
      validationReport: orchestration.report,
      rows: orchestration.publicationRows,
    });

  return Object.freeze({
    worldPackageBuildReceipt,
    subject,
    report: orchestration.report,
    validationReportHash:
      hashValidationReportV2(orchestration.report) as Hash,
    evidenceFiles: orchestration.evidenceFiles,
    routeEvidencePublication,
    routeBuildInputReceipts: Object.freeze([...routeBuildInputReceipts]),
    ...(isNil(options.renderCadence)
      ? {}
      : {
        hostRenderScheduleStats: Object.freeze({
          renderCadence: options.renderCadence,
          fixedTickCount: hostFixedTickCount,
          renderFrameCount: hostRenderFrameCount,
        }),
      }),
  });
}
