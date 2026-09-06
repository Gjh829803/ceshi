import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import {
  createCoreControlFeatureFactoryV1,
  createCoreSemanticActionFeatureFactoryV1,
  createMountedRelationshipFeatureFactoryV1,
  type GameplayModeV1,
} from "@whitebox-world/gameplay";
import {
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
  type GameplayDiagnosticV1,
} from "@whitebox-world/gameplay-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  MAXIMUM_FORMAL_SCRIPTED_TRAVERSAL_CHECK_COUNT_V1,
  deriveRuntimeSessionReceiptIdV1,
  hashFormalWorldCaptureRequestV1,
  hashRuntimeSessionRequestV1,
  parseFormalWorldCaptureRequestV1,
  parseNativeIsolatedExecutionRequestV1,
  parseRuntimeSessionReceiptV1,
  parseRuntimeSessionRequestV1,
  type NativeEffectiveExecutionBudgetV1,
  type NativeExecutionUsageV1,
  type NativeIsolatedExecutionRequestV1,
  type FormalWorldCaptureRequestV1,
  type FormalWorldCaptureSdkOwnerIdentityV1,
  type RuntimeSessionDiagnosticV1,
  type RuntimeSessionReceiptV1,
  type RuntimeSessionRequestV1,
  type RenderReadyReceiptV1,
  type WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import {
  RuntimeHost,
  runtimeWorldConfigurationFromVerifiedWorldPackageV1,
  type GameplayWorldAdapterFactoryV1,
  type GameplayWorldPortV1,
  type RuntimeCandidatePublicationGateInputV1,
  type RuntimeWorldAdapterDescriptorV1,
} from "@whitebox-world/runtime-host";
import type {
  VerifiedBabylonNativeWorldPackageDirectoryV1,
} from "@whitebox-world/world-package/runtime-contract";
import { isNil } from "lodash-es";

import {
  BabylonWorldRuntime,
  type BabylonWorldRuntimeInitializationStageV1,
} from "./babylon-world-runtime";
import {
  BabylonRuntimeResidencyV1,
  wrapBabylonRuntimeOwnedGameplayWorldPortV1,
} from "./babylon-runtime-residency.js";
import {
  prepareBabylonNativeRuntimePackageV1,
  type BabylonNativeSceneModuleLoaderV1,
} from "./babylon-native-package-runtime";
import { createBabylonGameplayWorldPortV1 } from
  "./gameplay-world-adapter";
import { projectBabylonWorldRuntimeSnapshotV4 } from
  "./world-runtime-snapshot";
import type { SubjectAssetResolverV1 } from "./subject-asset-cache";
import {
  executeFormalWorldCaptureProviderV1,
  freezeFormalWorldCaptureSdkOwnerIdentitiesV1,
  type FormalHostedWorldCapturePayloadV1,
} from "./formal-world-capture-provider.js";
import {
  CommittedSupportSelectionErrorV1,
  projectRuntimeSessionSubjectSupportV1,
} from "./runtime-session-subject-support.js";

const PARTICIPANT_ID = "native-isolation-participant";
const CONTROLLER_ENTITY_ID = "native-isolation-controller";
const CONTROLLER_DEFINITION_REF =
  "worldkit://controller-definition/native-isolation.runtime@1";
const CONTROLLER_DEFINITION_HASH = sha256CanonicalJson({
  kind: "controller-definition",
  id: "native-isolation.runtime",
  version: 1,
  inputMode: "agent",
  controlModel: "single-possessed-entity",
});
const GAMEPLAY_MODE_REF =
  "worldkit://gameplay-mode/native-isolation.exploration@1";
const MAXIMUM_CAPTURE_WORLD_SESSION_COUNT =
  MAXIMUM_FORMAL_SCRIPTED_TRAVERSAL_CHECK_COUNT_V1 + 2;
const MAXIMUM_INTERACTIVE_PLAYABILITY_WORLD_SESSION_COUNT = 25;

export type BabylonNativeIsolatedRuntimeEntryErrorCodeV1 =
  | "WORLDKIT_NATIVE_ISOLATION_IDENTITY_MISMATCH"
  | "WORLDKIT_NATIVE_ISOLATION_EFFECTIVE_BUDGET_EXCEEDED";

export class BabylonNativeIsolatedRuntimeEntryErrorV1 extends Error {
  readonly name = "BabylonNativeIsolatedRuntimeEntryErrorV1";

  constructor(readonly code: BabylonNativeIsolatedRuntimeEntryErrorCodeV1) {
    super(`${code}: Babylon Native isolated Runtime entry rejected the request.`);
    Object.freeze(this);
  }
}

export interface CreateBabylonNativeIsolatedRuntimeEntryInputV1 {
  readonly request: NativeIsolatedExecutionRequestV1;
  readonly verifiedWorldPackage:
    VerifiedBabylonNativeWorldPackageDirectoryV1;
  readonly moduleLoader: BabylonNativeSceneModuleLoaderV1;
  /** Required by headless Node hosts; browser hosts use Babylon's same-origin loader. */
  readonly havokWasmBinary?: ArrayBuffer;
  readonly engineFactory: (worldSessionId: string) => AbstractEngine;
  readonly subjectAssetResolver?: SubjectAssetResolverV1;
  readonly onInitializationStage?: (
    stage: BabylonWorldRuntimeInitializationStageV1,
  ) => void;
  /** Trusted Host-resolved identities, required only for capture operation entries. */
  readonly sdkOwnerIdentities?: readonly FormalWorldCaptureSdkOwnerIdentityV1[];
}

export interface BabylonNativeIsolatedRuntimeEntryV1 {
  readonly runtimeSessionId: string;
  initialSnapshot(): WorldRuntimeSnapshotV4;
  runtimeUsage(): NativeExecutionUsageV1["runtime"];
  renderFrame(interpolationAlphaRatio?: number): RenderReadyReceiptV1;
  resize(): void;
  executeFormalCapture(
    request: FormalWorldCaptureRequestV1,
  ): Promise<FormalHostedWorldCapturePayloadV1>;
  submit(payload: RuntimeSessionRequestV1):
    Promise<RuntimeSessionReceiptV1>;
  dispose(): Promise<void>;
}

function entryError(
  code: BabylonNativeIsolatedRuntimeEntryErrorCodeV1,
): BabylonNativeIsolatedRuntimeEntryErrorV1 {
  return new BabylonNativeIsolatedRuntimeEntryErrorV1(code);
}

function gameplayModeFactory(): GameplayModeV1 {
  return Object.freeze({
    gameplayModeRef: GAMEPLAY_MODE_REF,
    evaluateCommand: () => Object.freeze({ status: "accepted" as const }),
  });
}

function replacementRejectedDiagnostic(): GameplayDiagnosticV1 {
  return Object.freeze({
    code: "WORLD_REPLACEMENT_CAPACITY_EXCEEDED",
    message: "The isolated Native Runtime cannot retain another Candidate.",
  });
}

interface BabylonNativeIsolatedRuntimeHandleV1 {
  readonly runtime: BabylonWorldRuntime;
  readonly engine: AbstractEngine;
}

function assertRequestIdentity(
  requestInput: unknown,
  verified: VerifiedBabylonNativeWorldPackageDirectoryV1,
): NativeIsolatedExecutionRequestV1 {
  let request: NativeIsolatedExecutionRequestV1;
  try {
    request = parseNativeIsolatedExecutionRequestV1(requestInput);
  } catch {
    throw entryError("WORLDKIT_NATIVE_ISOLATION_IDENTITY_MISMATCH");
  }
  const source = verified.manifest.sceneSource;
  if (
    source.kind !== "babylon-native-scene" ||
    request.worldPackageRef !== verified.receipt.worldPackageRef ||
    request.worldPackageRootHash !== verified.receipt.worldPackageRootHash ||
    request.worldBuildIdentityHash !== verified.receipt.worldBuildIdentityHash ||
    request.sceneModuleBundleHash !== verified.sceneModuleBundleHash ||
    request.nativeSceneContributionHash !==
      source.nativeSceneContributionHash
  ) {
    throw entryError("WORLDKIT_NATIVE_ISOLATION_IDENTITY_MISMATCH");
  }

  const packageBudget = verified.manifest.resourceBudget;
  const effectiveScene = request.effectiveBudget.scene;
  if (
    effectiveScene.maximumVertices > packageBudget.maximumVertices ||
    effectiveScene.maximumTriangles > packageBudget.maximumTriangles ||
    effectiveScene.maximumColliders > packageBudget.maximumColliders
  ) {
    throw entryError("WORLDKIT_NATIVE_ISOLATION_IDENTITY_MISMATCH");
  }

  const contribution = verified.nativeSceneContribution;
  const actualVertices = contribution.staticColliders.reduce(
    (total, collider) => total + collider.vertexCount,
    0,
  );
  const actualTriangles = contribution.staticColliders.reduce(
    (total, collider) => total + collider.triangleCount,
    0,
  );
  const actualAssetBytes = verified.assetLock.entries.reduce(
    (total, entry) => total + entry.artifactSizeBytes,
    0,
  );
  if (
    actualVertices > effectiveScene.maximumVertices ||
    actualTriangles > effectiveScene.maximumTriangles ||
    contribution.staticColliders.length > effectiveScene.maximumColliders ||
    verified.assetLock.entries.length >
      request.effectiveBudget.assets.maximumAssetCount ||
    actualAssetBytes > request.effectiveBudget.assets.maximumAssetBytes
  ) {
    throw entryError(
      "WORLDKIT_NATIVE_ISOLATION_EFFECTIVE_BUDGET_EXCEEDED",
    );
  }
  return request;
}

function observeRuntimeUsage(
  snapshot: ReturnType<BabylonWorldRuntime["snapshot"]>,
  engine: AbstractEngine,
): NativeExecutionUsageV1["runtime"] {
  const actualMaterialCount = engine.scenes.reduce(
    (total, scene) => total + scene.materials.length,
    0,
  );
  // Native V1 admits Material/StandardMaterial creation but no ShaderMaterial
  // authority. Counting each material as one possible shader variant is a
  // conservative public-API upper bound that cannot under-report shader use.
  const actualShaderCountUpperBound = actualMaterialCount;
  return Object.freeze({
    actualSceneNodeCount: snapshot.resources.meshes,
    actualMaterialCount,
    actualShaderCount: actualShaderCountUpperBound,
    actualPhysicsBodyCount: snapshot.resources.bodies,
  });
}

function assertRuntimeBudget(
  snapshot: ReturnType<BabylonWorldRuntime["snapshot"]>,
  engine: AbstractEngine,
  budget: NativeEffectiveExecutionBudgetV1,
): NativeExecutionUsageV1["runtime"] {
  const usage = observeRuntimeUsage(snapshot, engine);
  if (
    usage.actualSceneNodeCount > budget.runtime.maximumSceneNodeCount ||
    usage.actualPhysicsBodyCount > budget.runtime.maximumPhysicsBodyCount ||
    usage.actualMaterialCount > budget.runtime.maximumMaterialCount ||
    usage.actualShaderCount > budget.runtime.maximumShaderCount
  ) {
    throw entryError(
      "WORLDKIT_NATIVE_ISOLATION_EFFECTIVE_BUDGET_EXCEEDED",
    );
  }
  return usage;
}

function receiptBase(
  request: RuntimeSessionRequestV1,
  worldSessionId: string,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    kind: "worldkit-runtime-session-receipt" as const,
    schemaVersion: 1 as const,
    requestId: request.id,
    requestHash: hashRuntimeSessionRequestV1(request),
    runtimeSessionId: request.runtimeSessionId,
    worldSessionId,
    requestType: request.type,
  });
}

function finalizeReceipt(
  body: Readonly<Record<string, unknown>>,
): RuntimeSessionReceiptV1 {
  return parseRuntimeSessionReceiptV1({
    id: deriveRuntimeSessionReceiptIdV1(body),
    ...body,
  });
}

function rejectedReceipt(
  request: RuntimeSessionRequestV1,
  worldSessionId: string,
  diagnostic: RuntimeSessionDiagnosticV1,
): RuntimeSessionReceiptV1 {
  return finalizeReceipt({
    ...receiptBase(request, worldSessionId),
    status: "rejected",
    diagnostic,
  });
}

function succeededReceipt(
  request: RuntimeSessionRequestV1,
  worldSessionId: string,
  result: Readonly<Record<string, unknown>>,
): RuntimeSessionReceiptV1 {
  return finalizeReceipt({
    ...receiptBase(request, worldSessionId),
    status: "succeeded",
    ...result,
  });
}

class BabylonNativeIsolatedRuntimeEntry
implements BabylonNativeIsolatedRuntimeEntryV1 {
  readonly runtimeSessionId: string;
  #tail: Promise<void> = Promise.resolve();
  #isActive = true;
  #disposePromise: Promise<void> | undefined;
  readonly #receiptsByRequestId = new Map<
    string,
    Readonly<{
      requestHash: string;
      receipt: RuntimeSessionReceiptV1;
    }>
  >();

  constructor(
    private readonly host: RuntimeHost,
    private readonly residency:
      BabylonRuntimeResidencyV1<BabylonNativeIsolatedRuntimeHandleV1>,
    private readonly initialControlledEntityId: string,
    private readonly verifiedWorldPackage:
      VerifiedBabylonNativeWorldPackageDirectoryV1,
    private readonly isolationRequest: NativeIsolatedExecutionRequestV1,
    private readonly sdkOwnerIdentities:
      readonly FormalWorldCaptureSdkOwnerIdentityV1[] | undefined,
  ) {
    this.runtimeSessionId = host.runtimeSessionId;
  }

  initialSnapshot(): WorldRuntimeSnapshotV4 {
    return projectBabylonWorldRuntimeSnapshotV4({
      runtimeSessionId: this.runtimeSessionId,
      fixedInputControllerEntityId: CONTROLLER_ENTITY_ID,
      publication: this.host.snapshot(),
      runtimeProjection: this.activeHandle().runtime.snapshot(),
      hostPhase: this.host.phase,
      isPaused: false,
    });
  }

  runtimeUsage(): NativeExecutionUsageV1["runtime"] {
    const handle = this.activeHandle();
    return observeRuntimeUsage(handle.runtime.snapshot(), handle.engine);
  }

  renderFrame(interpolationAlphaRatio = 1): RenderReadyReceiptV1 {
    return this.activeHandle().runtime.renderFrame(interpolationAlphaRatio);
  }

  resize(): void {
    this.activeHandle().runtime.resize();
  }

  executeFormalCapture(
    request: FormalWorldCaptureRequestV1,
  ): Promise<FormalHostedWorldCapturePayloadV1> {
    const operation = this.#tail.then(() =>
      this.executeFormalCaptureSerialized(request));
    this.#tail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  submit(payload: RuntimeSessionRequestV1):
    Promise<RuntimeSessionReceiptV1> {
    const operation = this.#tail.then(() => this.submitSerialized(payload));
    this.#tail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  dispose(): Promise<void> {
    if (!isNil(this.#disposePromise)) return this.#disposePromise;
    this.#isActive = false;
    this.#disposePromise = this.#tail
      .catch(() => undefined)
      .then(() => this.host.dispose())
      .finally(() => {
        this.residency.clear();
      });
    return this.#disposePromise;
  }

  private activeHandle(): BabylonNativeIsolatedRuntimeHandleV1 {
    return this.residency.active(this.host.currentWorldSessionId);
  }

  private async resetSerialized(): Promise<WorldRuntimeSnapshotV4> {
    if (!this.#isActive) {
      throw new Error("WORLDKIT_NATIVE_ISOLATION_RUNTIME_NOT_ACTIVE");
    }
    await this.host.resetWithInitialControlBinding({
      controllerEntityId: CONTROLLER_ENTITY_ID,
      controlledEntityId: this.initialControlledEntityId,
    });
    return this.initialSnapshot();
  }

  private async executeFormalCaptureSerialized(
    requestInput: FormalWorldCaptureRequestV1,
  ): Promise<FormalHostedWorldCapturePayloadV1> {
    if (!this.#isActive) {
      throw new Error("WORLDKIT_NATIVE_ISOLATION_RUNTIME_NOT_ACTIVE");
    }
    if (this.isolationRequest.requestedOperation.mode !== "capture") {
      throw new Error("WORLDKIT_NATIVE_FORMAL_CAPTURE_OPERATION_NOT_AUTHORIZED");
    }
    let request: FormalWorldCaptureRequestV1;
    try {
      request = parseFormalWorldCaptureRequestV1(requestInput);
    } catch {
      throw new Error("WORLDKIT_NATIVE_FORMAL_CAPTURE_REQUEST_INVALID");
    }
    if (
      hashFormalWorldCaptureRequestV1(request) !==
        this.isolationRequest.requestedOperation.captureRequestHash
    ) {
      throw new Error("WORLDKIT_NATIVE_FORMAL_CAPTURE_REQUEST_HASH_MISMATCH");
    }
    return executeFormalWorldCaptureProviderV1({
      request,
      sdkOwnerIdentities: this.sdkOwnerIdentities ?? (() => {
        throw new Error(
          "WORLDKIT_NATIVE_FORMAL_CAPTURE_SDK_OWNER_IDENTITIES_MISSING",
        );
      })(),
      verifiedWorldPackage: this.verifiedWorldPackage,
      runtimeSessionId: this.runtimeSessionId,
      ports: {
        resetWithInitialControlBinding: () => this.resetSerialized(),
        awaitRenderReady: async () => {
          await this.activeHandle().runtime.renderFrameWhenReady();
        },
        runFixedInput: async (input) => {
          await this.host.runFixedInput(input);
          return this.initialSnapshot();
        },
        snapshot: () => this.initialSnapshot(),
        captureArtifactView: (artifactRequest) =>
          this.activeHandle().runtime.captureArtifactView(artifactRequest),
        readCommittedSupportEvidence: (subjectEntityId) =>
          this.activeHandle().runtime.readCommittedSupportEvidence(
            subjectEntityId,
          ),
      },
    });
  }

  private async submitSerialized(
    payload: RuntimeSessionRequestV1,
  ): Promise<RuntimeSessionReceiptV1> {
    const request = parseRuntimeSessionRequestV1(payload);
    const worldSessionId = this.host.currentWorldSessionId;
    if (request.runtimeSessionId !== this.runtimeSessionId) {
      return rejectedReceipt(request, worldSessionId, {
        code: "RUNTIME_SESSION_NOT_ACTIVE",
        message: "The Request belongs to another Runtime Session.",
      });
    }

    const requestHash = hashRuntimeSessionRequestV1(request);
    const retained = this.#receiptsByRequestId.get(request.id);
    if (!isNil(retained)) {
      if (retained.requestHash === requestHash) return retained.receipt;
      return rejectedReceipt(request, worldSessionId, {
        code: "RUNTIME_SESSION_REQUEST_ID_CONFLICT",
        message: "The Request ID is already committed with different content.",
      });
    }
    if (!this.#isActive) {
      return rejectedReceipt(request, worldSessionId, {
        code: "RUNTIME_SESSION_NOT_ACTIVE",
        message: "The Runtime Session is not active.",
      });
    }

    let receipt: RuntimeSessionReceiptV1;
    try {
      receipt = await this.invoke(request);
    } catch {
      const failureWorldSessionId = this.host.currentWorldSessionId;
      this.#isActive = false;
      await this.host.dispose().catch(() => undefined);
      receipt = rejectedReceipt(request, failureWorldSessionId, {
        ...(request.type === "session.reset" &&
            failureWorldSessionId !== worldSessionId
          ? {
              code:
                "RUNTIME_SESSION_RESET_COMMITTED_CLEANUP_FAILURE" as const,
              message:
                "The new World was committed before old World cleanup failed and the Session was closed.",
            }
          : {
              code: "RUNTIME_SESSION_INTERNAL_FAILURE" as const,
              message:
                "Runtime Session operation failed and the Session was closed.",
            }),
      });
    }
    this.#receiptsByRequestId.set(request.id, Object.freeze({
      requestHash,
      receipt,
    }));
    return receipt;
  }

  private async invoke(
    request: RuntimeSessionRequestV1,
  ): Promise<RuntimeSessionReceiptV1> {
    const currentWorldSessionId = () => this.host.currentWorldSessionId;
    if (request.type === "gameplay-command.execute") {
      const gameplayCommandReceipt = await this.host.executeGameplayCommand(
        request.command,
      );
      return succeededReceipt(request, currentWorldSessionId(), {
        gameplayCommandReceipt,
      });
    }
    if (request.type === "fixed-input.run") {
      await this.host.runFixedInput(request.input);
      return succeededReceipt(request, currentWorldSessionId(), {
        snapshot: this.initialSnapshot(),
      });
    }
    if (request.type === "snapshot.get") {
      return succeededReceipt(request, currentWorldSessionId(), {
        snapshot: this.initialSnapshot(),
      });
    }
    if (request.type === "events.get") {
      const requestedCount = request.query.maximumEventCount;
      const candidates = this.host.eventsAfter(
        request.query.afterEventSequence,
        requestedCount + 1,
      ).filter((event) => "kind" in event);
      const events = Object.freeze(candidates.slice(0, requestedCount));
      const last = events.at(-1);
      return succeededReceipt(request, currentWorldSessionId(), {
        gameplayEvents: Object.freeze({
          events,
          nextAfterEventSequence: isNil(last)
            ? request.query.afterEventSequence
            : last.sequence,
          hasMore: candidates.length > requestedCount,
        }),
      });
    }
    if (request.type === "session.reset") {
      const snapshot = await this.resetSerialized();
      return succeededReceipt(request, snapshot.worldSessionId, { snapshot });
    }
    if (request.type === "subject-support.get") {
      const snapshot = this.initialSnapshot();
      try {
        if (!Object.hasOwn(
          snapshot.world.subjectStatesByEntityId,
          request.subjectEntityId,
        )) {
          throw new CommittedSupportSelectionErrorV1(
            "WORLDKIT_RUNTIME_COMMITTED_SUPPORT_UNJOINABLE",
          );
        }
        if (snapshot.world.simulationTick !== request.expectedSimulationTick) {
          throw new CommittedSupportSelectionErrorV1(
            "WORLDKIT_RUNTIME_COMMITTED_SUPPORT_STALE",
          );
        }
        const evidence = this.activeHandle().runtime
          .readCommittedSupportEvidence(request.subjectEntityId);
        if (isNil(evidence)) {
          throw new CommittedSupportSelectionErrorV1(
            "WORLDKIT_RUNTIME_COMMITTED_SUPPORT_UNJOINABLE",
          );
        }
        const subjectSupport = projectRuntimeSessionSubjectSupportV1({
          evidence,
          runtimeSessionId: this.runtimeSessionId,
          worldSessionId: snapshot.worldSessionId,
          subjectEntityId: request.subjectEntityId,
          expectedSimulationTick: request.expectedSimulationTick,
          registeredColliderIds: new Set(
            this.verifiedWorldPackage.nativeSceneContribution.staticColliders
              .map(({ id }) => id),
          ),
        });
        return succeededReceipt(request, snapshot.worldSessionId, {
          subjectSupport,
        });
      } catch (error) {
        if (error instanceof CommittedSupportSelectionErrorV1) {
          return rejectedReceipt(request, snapshot.worldSessionId, {
            code: "RUNTIME_SESSION_REQUEST_REJECTED",
            message: "Committed Subject support is stale, missing, ambiguous, or unregistered.",
          });
        }
        throw error;
      }
    }

    if (request.type === "session.close") {
      this.#isActive = false;
      const closingWorldSessionId = currentWorldSessionId();
      await this.host.dispose();
      return succeededReceipt(request, closingWorldSessionId, {
        closeResult: Object.freeze({ mode: "closed" as const }),
      });
    }

    const exhaustive: never = request;
    throw new Error(`RUNTIME_SESSION_REQUEST_UNHANDLED: ${String(exhaustive)}`);
  }
}

export async function createBabylonNativeIsolatedRuntimeEntryV1(
  input: CreateBabylonNativeIsolatedRuntimeEntryInputV1,
): Promise<BabylonNativeIsolatedRuntimeEntryV1> {
  const verified = input.verifiedWorldPackage;
  const request = assertRequestIdentity(input.request, verified);
  const sdkOwnerIdentities = request.requestedOperation.mode === "capture"
    ? freezeFormalWorldCaptureSdkOwnerIdentitiesV1(
        input.sdkOwnerIdentities ?? [],
      )
    : undefined;
  const initialWorld = runtimeWorldConfigurationFromVerifiedWorldPackageV1(
    verified,
  );
  const initialWorldSessionId = `${request.runtimeSessionId}.world.1`;
  const descriptor: RuntimeWorldAdapterDescriptorV1 = Object.freeze({
    runtimeSessionId: request.runtimeSessionId,
    worldSessionId: initialWorldSessionId,
    worldBuildIdentity: initialWorld.worldBuildIdentity,
    gameplayBootstrap: initialWorld.gameplayBootstrap,
    worldRuntimeBootstrap: initialWorld.worldRuntimeBootstrap,
    sceneSource: initialWorld.sceneSource,
  });
  const prepared = await prepareBabylonNativeRuntimePackageV1({
    descriptor,
    verifiedWorldPackage: verified,
    moduleLoader: input.moduleLoader,
  });
  const preparedModuleLoader: BabylonNativeSceneModuleLoaderV1 =
    Object.freeze({ load: async () => prepared.module });
  const residency =
    new BabylonRuntimeResidencyV1<BabylonNativeIsolatedRuntimeHandleV1>();
  const adapterFactory: GameplayWorldAdapterFactoryV1 = Object.freeze({
    preflightConcurrentResidency(
      current: RuntimeWorldAdapterDescriptorV1,
      candidate: RuntimeWorldAdapterDescriptorV1,
    ) {
      if (
        !residency.canRetainCandidate(
          current.worldSessionId,
          candidate.worldSessionId,
        )
      ) {
        return Object.freeze({
          status: "rejected" as const,
          diagnostic: replacementRejectedDiagnostic(),
        });
      }
      return Object.freeze({ status: "accepted" as const });
    },
    async create(candidate: RuntimeWorldAdapterDescriptorV1) {
      if (residency.has(candidate.worldSessionId)) {
        throw new Error("WORLDKIT_NATIVE_ISOLATION_RUNTIME_ALREADY_CREATED");
      }
      let created: BabylonWorldRuntime | undefined;
      let createdEngine: AbstractEngine | undefined;
      try {
        created = await BabylonWorldRuntime.create({
          worldRuntimeBootstrap: candidate.worldRuntimeBootstrap,
          gameplayBootstrap: candidate.gameplayBootstrap,
          sceneSource: {
            kind: "babylon-native-scene",
            descriptor: candidate,
            verifiedWorldPackage: verified,
            moduleLoader: preparedModuleLoader,
          },
          runtimeSessionId: request.runtimeSessionId,
          engineFactory: () => {
            if (!isNil(createdEngine)) {
              throw new Error(
                "WORLDKIT_NATIVE_ISOLATION_ENGINE_ALREADY_CREATED",
              );
            }
            createdEngine = input.engineFactory(candidate.worldSessionId);
            return createdEngine;
          },
          ...(isNil(input.havokWasmBinary)
            ? {}
            : { havokWasmBinary: input.havokWasmBinary }),
          autoStartRenderLoop: false,
          ...(isNil(input.subjectAssetResolver)
            ? {}
            : { subjectAssetResolver: input.subjectAssetResolver }),
          ...(isNil(input.onInitializationStage)
            ? {}
            : { onInitializationStage: input.onInitializationStage }),
        });
        if (isNil(createdEngine)) {
          throw new Error("WORLDKIT_NATIVE_ISOLATION_ENGINE_HANDLE_MISSING");
        }
        assertRuntimeBudget(
          created.snapshot(),
          createdEngine,
          request.effectiveBudget,
        );
        const port = createBabylonGameplayWorldPortV1(
          created,
          CONTROLLER_ENTITY_ID,
        );
        const handle = Object.freeze({
          runtime: created,
          engine: createdEngine,
        });
        const ownedPort = wrapBabylonRuntimeOwnedGameplayWorldPortV1(
          port,
          () => {
            residency.release(candidate.worldSessionId, handle);
          },
        );
        residency.retain(candidate.worldSessionId, handle);
        return ownedPort;
      } catch (error) {
        await created?.dispose().catch(() => undefined);
        throw error;
      }
    },
    async awaitCandidatePublicationReady(
      gate: RuntimeCandidatePublicationGateInputV1,
    ) {
      if (gate.runtimeSessionId !== request.runtimeSessionId) {
        throw new Error("WORLDKIT_NATIVE_ISOLATION_RUNTIME_HANDLE_MISSING");
      }
      const handle = residency.active(gate.worldSessionId);
      handle.runtime.publishInitialBoundCameraView(
        gate.publication.viewState.viewStateRevision,
      );
      await handle.runtime.renderFrameWhenReady();
    },
  });
  const featureFactories = [
    createCoreControlFeatureFactoryV1(),
    createCoreSemanticActionFeatureFactoryV1(),
    createMountedRelationshipFeatureFactoryV1(),
  ].filter(({ manifest }) =>
    initialWorld.gameplayBootstrap.featureResourceLocks.some(
      ({ resourceRef }) => resourceRef === manifest.resourceRef,
    )
  );

  let worldSessionIndex = 0;
  let host: RuntimeHost;
  try {
    host = await RuntimeHost.create({
      runtimeSessionId: request.runtimeSessionId,
      initialWorld,
      participantStates: [{ id: PARTICIPANT_ID, mode: "active" }],
      controllerStates: [{
        id: CONTROLLER_ENTITY_ID,
        kind: "controller-entity-state",
        controllerDefinitionRef: CONTROLLER_DEFINITION_REF,
        controllerDefinitionHash: CONTROLLER_DEFINITION_HASH,
        participantId: PARTICIPANT_ID,
        lifecycleMode: "active",
        inputMode: "agent",
      }],
      fixedInputControllerEntityId: CONTROLLER_ENTITY_ID,
      gameplayModeFactory,
      gameplayFeatureFactories: featureFactories,
      gameplayCapacityBudget: {
        ...DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
        maximumRelationshipStateCount: Math.max(
          DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1.maximumRelationshipStateCount,
          initialWorld.gameplayBootstrap.entityDescriptors.length + 1,
        ),
      },
      runtimeHostCapacityBudget: {
        maximumWorldSessionCount: request.requestedOperation.mode === "capture"
          ? MAXIMUM_CAPTURE_WORLD_SESSION_COUNT
          : MAXIMUM_INTERACTIVE_PLAYABILITY_WORLD_SESSION_COUNT,
        maximumRuntimeActivityRecordCount:
          request.requestedOperation.mode === "capture"
            ? MAXIMUM_CAPTURE_WORLD_SESSION_COUNT
            : MAXIMUM_INTERACTIVE_PLAYABILITY_WORLD_SESSION_COUNT,
      },
      initialControlBinding: {
        controllerEntityId: CONTROLLER_ENTITY_ID,
        controlledEntityId:
          initialWorld.worldRuntimeBootstrap.initialControlledEntityId,
      },
      adapterFactory,
      worldSessionIdFactory: () =>
        `${request.runtimeSessionId}.world.${worldSessionIndex += 1}`,
    });
  } catch (error) {
    await Promise.allSettled(
      [...residency.values()].map(({ runtime }) =>
        runtime.dispose()
      ),
    );
    throw error;
  }
  const initialHandle = residency.get(initialWorldSessionId);
  if (isNil(initialHandle)) {
    await host.dispose().catch(() => undefined);
    throw new Error("WORLDKIT_NATIVE_ISOLATION_RUNTIME_HANDLE_MISSING");
  }
  return Object.freeze(new BabylonNativeIsolatedRuntimeEntry(
    host,
    residency,
    initialWorld.worldRuntimeBootstrap.initialControlledEntityId,
    verified,
    request,
    sdkOwnerIdentities,
  ));
}
