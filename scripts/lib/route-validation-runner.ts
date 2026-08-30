import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
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
  createCanonicalWorldPackageV1,
  verifyWorldPackageDirectoryV1,
  type ResolvedCanonicalWorldPackageResourceArtifactV1,
  type WorldPackageBuildReceiptV1,
} from "@whitebox-world/world-package";
import { isNil } from "lodash-es";

import {
  evaluateUnavailableTraversalGraphProjectionV2,
} from "../../packages/traversal-recast/src/evaluate-route.js";
import {
  orchestrateRouteValidationV1,
  type RouteValidationEvidenceFileV1,
} from "./route-validation-orchestrator";
import {
  createRouteSurfaceCorrelationMissingProjectionV2,
} from "./route-r1b-fixture-proofs.js";
import { loadWorldkitRoutePipeline } from "./worldkit-pipeline";
import {
  createTrustedCanonicalWorldPackageBuildContextV1,
  resolveTrustedWorldPackageResourceArtifactsV1,
} from "./trusted-world-package";

type Hash = `sha256:${string}`;

const ROUTE_VALIDATION_CONTROLLER_ENTITY_ID =
  "route-validation-controller" as const;

function routeValidationPossessionTransitionV1(input: Readonly<{
  runtimeSessionId: string;
  controlledEntityId: string;
}>) {
  const commandId = `route-validation-bind:${input.runtimeSessionId}`;
  return Object.freeze({
    kind: "gameplay-transition-plan",
    schemaVersion: 1,
    type: "control.bind",
    commandId,
    expectedStateRevision: 0,
    relationshipChanges: Object.freeze([Object.freeze({
      operation: "add" as const,
      after: Object.freeze({
        id: `possession:${commandId}`,
        type: "possessedBy" as const,
        schemaVersion: 1 as const,
        controlledEntityId: input.controlledEntityId,
        controllerEntityId: ROUTE_VALIDATION_CONTROLLER_ENTITY_ID,
        establishedSimulationTick: 0,
      }),
    })]),
    actionChanges: Object.freeze([]),
    newlyCommittedActionExecutionIds: Object.freeze([]),
    capacityDelta: Object.freeze({
      relationshipStateCountDelta: 1,
      activeActionStateCountDelta: 0,
      usedActionExecutionIdCountDelta: 0,
      immediateEventCount: 1,
      terminalEventReservationCountDelta: 0,
    }),
  });
}

export const TRUSTED_ROUTE_RENDER_CADENCES_V1 = Object.freeze([
  "30-like",
  "60-like",
  "120-like",
] as const);

export type TrustedRouteRenderCadenceV1 =
  (typeof TRUSTED_ROUTE_RENDER_CADENCES_V1)[number];

export type TrustedRouteFixtureFaultInjectionV1 =
  | {
    readonly kind: "withdraw-static-support-after-reset";
    readonly supportEntityId: string;
  }
  | {
    readonly kind: "inject-surface-correlation-miss";
  };

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
  /**
   * Verifier-only fault injection. It is intentionally absent from Authoring,
   * CLI, Browser, Report, Snapshot, and Runtime public contracts.
   */
  readonly fixtureFaultInjection?: TrustedRouteFixtureFaultInjectionV1;
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

/** @internal Verifier-only closed-union validator. */
export function canonicalFixtureFaultInjectionV1(
  value: unknown,
): TrustedRouteFixtureFaultInjectionV1 | undefined {
  if (isNil(value)) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw infrastructureFailure("WORLDKIT_ROUTE_FIXTURE_FAULT_INVALID");
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  if (candidate.kind === "inject-surface-correlation-miss") {
    if (Object.keys(candidate).length !== 1) {
      throw infrastructureFailure("WORLDKIT_ROUTE_FIXTURE_FAULT_INVALID");
    }
    return Object.freeze({ kind: candidate.kind });
  }
  if (
    candidate.kind === "withdraw-static-support-after-reset" &&
    typeof candidate.supportEntityId === "string" &&
    candidate.supportEntityId.length > 0 &&
    Object.keys(candidate).length === 2
  ) {
    return Object.freeze({
      kind: candidate.kind,
      supportEntityId: candidate.supportEntityId,
    });
  }
  throw infrastructureFailure("WORLDKIT_ROUTE_FIXTURE_FAULT_INVALID");
}

/** @internal Verifier-only wrapper; not part of a public Runtime protocol. */
export function wrapRuntimePortWithSupportWithdrawalV1(
  runtimePort: TraversalRuntimePortV1,
  withdrawSupport: () => void,
): TraversalRuntimePortV1 {
  let supportWithdrawalState: "pending" | "withdrawn" | "failed" = "pending";
  let supportWithdrawalError: unknown;
  return Object.freeze({
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
    resetToStartAnchor: (
      request: Parameters<TraversalRuntimePortV1["resetToStartAnchor"]>[0],
    ) => {
      if (supportWithdrawalState === "failed") {
        throw supportWithdrawalError;
      }
      const evidence = runtimePort.resetToStartAnchor(request);
      if (supportWithdrawalState === "pending") {
        // A callback can throw after changing engine state. Poison the wrapper
        // before the call so no reset can retry or emit evidence afterward.
        supportWithdrawalState = "failed";
        try {
          withdrawSupport();
          supportWithdrawalState = "withdrawn";
        } catch (error) {
          supportWithdrawalError = error;
          throw error;
        }
      }
      return evidence;
    },
    runFixedTick: (
      request: Parameters<TraversalRuntimePortV1["runFixedTick"]>[0],
    ) => runtimePort.runFixedTick(request),
  });
}

interface FixtureSupportAggregateV1 {
  readonly transformNode: {
    readonly metadata?: {
      readonly worldkitEntityId?: unknown;
    } | null;
  };
  readonly body: {
    readonly isDisposed: boolean;
  };
  dispose(): void;
}

/** @internal Verifier-only ownership guard. */
export function selectUniqueFixtureSupportAggregateV1(
  aggregates: readonly FixtureSupportAggregateV1[],
  supportEntityId: string,
): FixtureSupportAggregateV1 {
  const matchingAggregates = aggregates.filter(
    (aggregate) =>
      aggregate.transformNode.metadata?.worldkitEntityId === supportEntityId,
  );
  const aggregate = matchingAggregates[0];
  if (
    matchingAggregates.length !== 1 ||
    isNil(aggregate) ||
    aggregate.body.isDisposed
  ) {
    throw infrastructureFailure(
      "WORLDKIT_ROUTE_FIXTURE_SUPPORT_ENTITY_INVALID",
      {
        supportEntityId,
        matchingAggregateCount: matchingAggregates.length,
        matchingAggregateIsDisposed: aggregate?.body.isDisposed ?? null,
      },
    );
  }
  return aggregate;
}

function requireRuntimePhysicsAggregatesV1(runtime: unknown):
  readonly PhysicsAggregate[] {
  const aggregates = (runtime as { readonly aggregates?: unknown }).aggregates;
  if (
    !Array.isArray(aggregates) ||
    !aggregates.every((aggregate) => aggregate instanceof PhysicsAggregate)
  ) {
    throw infrastructureFailure(
      "WORLDKIT_ROUTE_FIXTURE_SUPPORT_ENTITY_INVALID",
      { reason: "RUNTIME_PHYSICS_AGGREGATE_OWNERSHIP_UNAVAILABLE" },
    );
  }
  return aggregates;
}

/**
 * Converts already-verified WorldPackage resource artifacts into the only
 * Subject Asset resolver used by the headless validation Runtime. The bytes
 * are snapshotted at construction and detached for every resolution.
 */
export function createWorldPackageSubjectAssetResolverV1(
  artifacts: readonly Pick<
    ResolvedCanonicalWorldPackageResourceArtifactV1,
    "resourceRef" | "packagePath" | "mediaType" | "bytes"
  >[],
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
  const fixtureFaultInjection = canonicalFixtureFaultInjectionV1(
    options.fixtureFaultInjection,
  );
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
  let resourceArtifacts: readonly ResolvedCanonicalWorldPackageResourceArtifactV1[];
  try {
    resourceArtifacts = await resolveTrustedWorldPackageResourceArtifactsV1(
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
  const directory = createCanonicalWorldPackageV1({
    packageId: `${pipeline.authoringSpec.id}.world-package`,
    ...createTrustedCanonicalWorldPackageBuildContextV1({
      title: `${pipeline.authoringSpec.id} trusted route validation package`,
      resourceArtifacts,
    }),
    authoringSpec: pipeline.authoringSpec,
    normalizedWorldIr: pipeline.normalizedWorldIr,
    layoutSolveResult,
    executionPlan: pipeline.executionPlan,
    gameplayBootstrap: pipeline.gameplayBootstrap,
    worldRuntimeBootstrap: pipeline.worldRuntimeBootstrap,
    resourceArtifacts,
  });
  const verifiedDirectory = verifyWorldPackageDirectoryV1(directory);
  const worldPackageBuildReceipt = verifiedDirectory.receipt;
  const subject = createWorldPackageValidationSubjectV1(verifiedDirectory);
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
    worldRuntimeBootstrap: pipeline.worldRuntimeBootstrap,
    subject,
    reportId: `${pipeline.authoringSpec.id}.route-validation`,
    runtimeAssetResolver,
  }, {
    compileTraversalLock: ({ executionPlan, traversingEntityId }) =>
      compileResolvedTraversalLockV1({
        normalizedWorldIr: pipeline.normalizedWorldIr,
        canonicalSceneExecutionPlan: executionPlan,
        worldRuntimeBootstrap: pipeline.worldRuntimeBootstrap,
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
    evaluateRoute: async (input) =>
      fixtureFaultInjection?.kind === "inject-surface-correlation-miss"
        ? evaluateUnavailableTraversalGraphProjectionV2(
          input.buildInputReceipt,
          createRouteSurfaceCorrelationMissingProjectionV2(
            input.buildInputReceipt,
          ),
        )
        : evaluateRequiredRouteV2(input),
    createRuntimeLease: async (input) => {
      const havokWasmBytes = input.havokWasmBytes ??
        await loadHavokWasmBytesOnce();
      const runtime = await runtimeBabylon.BabylonWorldRuntime.create({
        sceneSource: {
          kind: "canonical-execution-plan",
          executionPlan: input.executionPlan,
        },
        worldRuntimeBootstrap: pipeline.worldRuntimeBootstrap,
        gameplayBootstrap: pipeline.gameplayBootstrap,
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
        const gameplayWorldPort =
          runtimeBabylon.createBabylonGameplayWorldPortV1(
            runtime,
            ROUTE_VALIDATION_CONTROLLER_ENTITY_ID,
          );
        const possession = await gameplayWorldPort.prepareGameplayTransition(
          routeValidationPossessionTransitionV1({
            runtimeSessionId: input.runtimeSessionId,
            controlledEntityId: input.traversalLockReceipt.lock.subjectEntityId,
          }),
        );
        possession.commitPrepared();
        const providerRuntimePort =
          runtimeBabylon.createBabylonTraversalRuntimePortV1({
            runtime,
            traversalLockReceipt: input.traversalLockReceipt,
          });
        const faultInjectedRuntimePort =
          fixtureFaultInjection?.kind !==
              "withdraw-static-support-after-reset"
          ? providerRuntimePort
          : (() => {
            const supportAggregate = selectUniqueFixtureSupportAggregateV1(
              requireRuntimePhysicsAggregatesV1(runtime),
              fixtureFaultInjection.supportEntityId,
            );
            return wrapRuntimePortWithSupportWithdrawalV1(
              providerRuntimePort,
              () => supportAggregate.dispose(),
            );
          })();
        const runtimePort = isNil(options.renderCadence)
          ? faultInjectedRuntimePort
          : wrapRuntimePortWithRenderCadenceV1(
            faultInjectedRuntimePort,
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
