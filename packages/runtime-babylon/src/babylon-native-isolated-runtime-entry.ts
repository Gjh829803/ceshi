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
  deriveRuntimeSessionReceiptIdV1,
  hashRuntimeSessionRequestV1,
  parseNativeIsolatedExecutionRequestV1,
  parseRuntimeSessionReceiptV1,
  parseRuntimeSessionRequestV1,
  type NativeEffectiveExecutionBudgetV1,
  type NativeIsolatedExecutionRequestV1,
  type RuntimeSessionDiagnosticV1,
  type RuntimeSessionReceiptV1,
  type RuntimeSessionRequestV1,
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
} from "@whitebox-world/world-package";
import { isNil } from "lodash-es";

import {
  BabylonWorldRuntime,
  type BabylonWorldRuntimeInitializationStageV1,
} from "./babylon-world-runtime";
import {
  prepareBabylonNativeRuntimePackageV1,
  type BabylonNativeSceneModuleLoaderV1,
} from "./babylon-native-package-runtime";
import { createBabylonGameplayWorldPortV1 } from
  "./gameplay-world-adapter";
import { projectBabylonWorldRuntimeSnapshotV4 } from
  "./world-runtime-snapshot";
import type { SubjectAssetResolverV1 } from "./subject-asset-cache";

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
  readonly havokWasmBinary: ArrayBuffer;
  readonly engineFactory: () => AbstractEngine;
  readonly subjectAssetResolver?: SubjectAssetResolverV1;
  readonly onInitializationStage?: (
    stage: BabylonWorldRuntimeInitializationStageV1,
  ) => void;
}

export interface BabylonNativeIsolatedRuntimeEntryV1 {
  readonly runtimeSessionId: string;
  initialSnapshot(): WorldRuntimeSnapshotV4;
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
    message: "The isolated Native Runtime admits exactly one WorldSession.",
  });
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

function assertRuntimeBudget(
  snapshot: ReturnType<BabylonWorldRuntime["snapshot"]>,
  budget: NativeEffectiveExecutionBudgetV1,
): void {
  if (
    snapshot.resources.meshes > budget.runtime.maximumSceneNodeCount ||
    snapshot.resources.bodies > budget.runtime.maximumPhysicsBodyCount
  ) {
    throw entryError(
      "WORLDKIT_NATIVE_ISOLATION_EFFECTIVE_BUDGET_EXCEEDED",
    );
  }
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
    private readonly runtime: BabylonWorldRuntime,
  ) {
    this.runtimeSessionId = host.runtimeSessionId;
  }

  initialSnapshot(): WorldRuntimeSnapshotV4 {
    return projectBabylonWorldRuntimeSnapshotV4({
      runtimeSessionId: this.runtimeSessionId,
      fixedInputControllerEntityId: CONTROLLER_ENTITY_ID,
      publication: this.host.snapshot(),
      runtimeProjection: this.runtime.snapshot(),
      hostPhase: this.host.phase,
      isPaused: false,
    });
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
    this.#disposePromise = this.host.dispose();
    return this.#disposePromise;
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
      receipt = await this.invoke(request, worldSessionId);
    } catch {
      this.#isActive = false;
      await this.host.dispose().catch(() => undefined);
      receipt = rejectedReceipt(request, worldSessionId, {
        code: "RUNTIME_SESSION_INTERNAL_FAILURE",
        message: "Runtime Session operation failed and the Session was closed.",
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
    worldSessionId: string,
  ): Promise<RuntimeSessionReceiptV1> {
    if (request.type === "gameplay-command.execute") {
      const gameplayCommandReceipt = await this.host.executeGameplayCommand(
        request.command,
      );
      return succeededReceipt(request, worldSessionId, {
        gameplayCommandReceipt,
      });
    }
    if (request.type === "fixed-input.run") {
      await this.host.runFixedInput(request.input);
      return succeededReceipt(request, worldSessionId, {
        snapshot: this.initialSnapshot(),
      });
    }
    if (request.type === "snapshot.get") {
      return succeededReceipt(request, worldSessionId, {
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
      return succeededReceipt(request, worldSessionId, {
        gameplayEvents: Object.freeze({
          events,
          nextAfterEventSequence: isNil(last)
            ? request.query.afterEventSequence
            : last.sequence,
          hasMore: candidates.length > requestedCount,
        }),
      });
    }

    this.#isActive = false;
    await this.host.dispose();
    return succeededReceipt(request, worldSessionId, {
      closeResult: Object.freeze({ mode: "closed" as const }),
    });
  }
}

export async function createBabylonNativeIsolatedRuntimeEntryV1(
  input: CreateBabylonNativeIsolatedRuntimeEntryInputV1,
): Promise<BabylonNativeIsolatedRuntimeEntryV1> {
  const verified = input.verifiedWorldPackage;
  const request = assertRequestIdentity(input.request, verified);
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
  let runtime: BabylonWorldRuntime | undefined;
  const adapterFactory: GameplayWorldAdapterFactoryV1 = Object.freeze({
    preflightConcurrentResidency() {
      return Object.freeze({
        status: "rejected" as const,
        diagnostic: replacementRejectedDiagnostic(),
      });
    },
    async create(candidate: RuntimeWorldAdapterDescriptorV1) {
      if (!isNil(runtime)) {
        throw new Error("WORLDKIT_NATIVE_ISOLATION_RUNTIME_ALREADY_CREATED");
      }
      let created: BabylonWorldRuntime | undefined;
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
          engineFactory: input.engineFactory,
          havokWasmBinary: input.havokWasmBinary,
          autoStartRenderLoop: false,
          ...(isNil(input.subjectAssetResolver)
            ? {}
            : { subjectAssetResolver: input.subjectAssetResolver }),
          ...(isNil(input.onInitializationStage)
            ? {}
            : { onInitializationStage: input.onInitializationStage }),
        });
        assertRuntimeBudget(created.snapshot(), request.effectiveBudget);
        const port = createBabylonGameplayWorldPortV1(
          created,
          CONTROLLER_ENTITY_ID,
        );
        runtime = created;
        return port;
      } catch (error) {
        await created?.dispose().catch(() => undefined);
        throw error;
      }
    },
    async awaitCandidatePublicationReady(
      gate: RuntimeCandidatePublicationGateInputV1,
    ) {
      if (
        gate.runtimeSessionId !== request.runtimeSessionId ||
        gate.worldSessionId !== initialWorldSessionId ||
        isNil(runtime)
      ) {
        throw new Error("WORLDKIT_NATIVE_ISOLATION_RUNTIME_HANDLE_MISSING");
      }
      await runtime.renderFrameWhenReady();
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
        maximumWorldSessionCount: 1,
        maximumRuntimeActivityRecordCount: 1,
      },
      initialControlBinding: {
        controllerEntityId: CONTROLLER_ENTITY_ID,
        controlledEntityId:
          initialWorld.worldRuntimeBootstrap.initialControlledEntityId,
      },
      adapterFactory,
      worldSessionIdFactory: () => initialWorldSessionId,
    });
  } catch (error) {
    await runtime?.dispose().catch(() => undefined);
    throw error;
  }
  if (isNil(runtime)) {
    await host.dispose().catch(() => undefined);
    throw new Error("WORLDKIT_NATIVE_ISOLATION_RUNTIME_HANDLE_MISSING");
  }
  return Object.freeze(new BabylonNativeIsolatedRuntimeEntry(host, runtime));
}
