import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import {
  createCoreControlFeatureFactoryV1,
  createCoreSemanticActionFeatureFactoryV1,
  createMountedRelationshipFeatureFactoryV1,
  type GameplayModeV1,
} from "@whitebox-world/gameplay";
import {
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
  type GameplayCommandReceiptV1,
  type GameplayCommandV1,
  type GameplayEventV1,
} from "@whitebox-world/gameplay-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  BabylonWorldRuntime,
  createBabylonGameplayWorldPortV1,
  projectBabylonWorldRuntimeSnapshotV4,
  type BabylonWorldRuntimeInitializationStageV1,
  type BabylonWorldRuntimeOptions,
  type SubjectAssetResolveRequestV1,
  type SubjectAssetResolverV1,
} from "@whitebox-world/runtime-babylon";
import type {
  FixedInputV1,
  WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import {
  RuntimeHost,
  type GameplayWorldAdapterFactoryV1,
  type GameplayWorldPortV1,
  type PublishWorldReplacementResultV1,
  type RuntimeCandidatePublicationGateInputV1,
  type RuntimeHostCreateOptionsV1,
  type RuntimeWorldAdapterDescriptorV1,
  type RuntimeWorldConfigurationV1,
} from "@whitebox-world/runtime-host";
import {
  worldPackageRefFromRootHashV1,
  type VerifiedWorldPackageDirectoryV2,
  type WorldPackageRefV1,
} from "@whitebox-world/world-package";
import { isEmpty, isEqual, isNil, sortBy } from "lodash-es";

import {
  loadRuntimeWorldConfigurationFromPackageDirectoryV1,
} from "./world-package-cli";

export const HEADLESS_RUNTIME_PARTICIPANT_ID_V1 =
  "participant-runtime-session" as const;
export const HEADLESS_FIXED_INPUT_CONTROLLER_ENTITY_ID_V1 =
  "controller-runtime-session" as const;

const HEADLESS_CONTROLLER_DEFINITION_REF_V1 =
  "worldkit://controller-definition/runtime-session.headless@1";
const HEADLESS_CONTROLLER_DEFINITION_V1 = Object.freeze({
  kind: "controller-definition" as const,
  id: "runtime-session.headless",
  version: 1 as const,
  inputMode: "agent" as const,
  controlModel: "single-possessed-entity" as const,
});
const HEADLESS_CONTROLLER_DEFINITION_HASH_V1 = sha256CanonicalJson(
  HEADLESS_CONTROLLER_DEFINITION_V1,
) as `sha256:${string}`;
const HEADLESS_GAMEPLAY_MODE_REF_V1 =
  "worldkit://gameplay-mode/outdoor.exploration@1";
const MAXIMUM_WORLD_SESSION_COUNT_V1 = 1_024;
const MAXIMUM_RUNTIME_ACTIVITY_RECORD_COUNT_V1 = 256;

export type HeadlessRuntimeOwnedResourceIdV1 =
  | "package-asset-resolver"
  | "babylon-engine"
  | "babylon-scene-runtime"
  | "gameplay-world-port"
  | "runtime-host";

export type HeadlessRuntimeOwnershipPhaseV1 =
  | "constructing"
  | "ready"
  | "disposing"
  | "disposed"
  | "failed";

export interface HeadlessRuntimeOwnershipSnapshotV1 {
  readonly kind: "worldkit-headless-runtime-ownership-snapshot";
  readonly schemaVersion: 1;
  readonly phase: HeadlessRuntimeOwnershipPhaseV1;
  readonly activeResourceIds: readonly HeadlessRuntimeOwnedResourceIdV1[];
  readonly releaseOrder: readonly HeadlessRuntimeOwnedResourceIdV1[];
}

export interface HeadlessRuntimeCleanupDiagnosticV1 {
  readonly code:
    | "HEADLESS_RUNTIME_HOST_DISPOSE_FAILED"
    | "HEADLESS_RUNTIME_PORT_DISPOSE_FAILED"
    | "HEADLESS_RUNTIME_DISPOSE_FAILED"
    | "HEADLESS_RUNTIME_ENGINE_DISPOSE_FAILED"
    | "HEADLESS_RUNTIME_ASSET_RESOLVER_DISPOSE_FAILED";
  readonly message: string;
}

export type HeadlessRuntimeSessionCreateErrorCodeV1 =
  | "HEADLESS_WORLD_PACKAGE_LOAD_FAILED"
  | "HEADLESS_RUNTIME_INPUT_INVALID"
  | "HEADLESS_RUNTIME_HAVOK_LOAD_FAILED"
  | "HEADLESS_RUNTIME_ENGINE_CREATE_FAILED"
  | "HEADLESS_RUNTIME_HAVOK_INITIALIZATION_FAILED"
  | "HEADLESS_RUNTIME_CREATE_FAILED"
  | "HEADLESS_RUNTIME_GAMEPLAY_PORT_CREATE_FAILED"
  | "HEADLESS_RUNTIME_WORLD_SESSION_CREATE_FAILED"
  | "HEADLESS_RUNTIME_INITIAL_CONTROL_BIND_FAILED"
  | "HEADLESS_RUNTIME_READY_GATE_FAILED";

export class HeadlessRuntimeSessionCreateErrorV1 extends Error {
  readonly name = "HeadlessRuntimeSessionCreateErrorV1";

  constructor(
    readonly code: HeadlessRuntimeSessionCreateErrorCodeV1,
    readonly cleanupDiagnostics: readonly HeadlessRuntimeCleanupDiagnosticV1[],
  ) {
    super(`${code}: Headless Runtime Session construction failed.`);
  }
}

export class HeadlessRuntimeSessionCleanupErrorV1 extends Error {
  readonly name = "HeadlessRuntimeSessionCleanupErrorV1";
  readonly code = "HEADLESS_RUNTIME_SESSION_CLEANUP_FAILED" as const;

  constructor(
    readonly diagnostics: readonly HeadlessRuntimeCleanupDiagnosticV1[],
  ) {
    super("HEADLESS_RUNTIME_SESSION_CLEANUP_FAILED: Runtime cleanup failed.");
  }
}

export interface CreateHeadlessRuntimeSessionInputV1 {
  readonly runtimeSessionId: string;
  readonly initialWorldSessionId: string;
  readonly runtimeWorldConfiguration: RuntimeWorldConfigurationV1;
  readonly verifiedDirectory: VerifiedWorldPackageDirectoryV2;
}

export interface LoadHeadlessWorldPackageInputV1 {
  readonly packageDirectoryPath: string;
  readonly runtimeSessionId: string;
  readonly initialWorldSessionId: string;
}

export interface HeadlessRuntimeSessionFactoriesV1 {
  readonly loadHavokWasmBinary?: () => Promise<ArrayBuffer>;
  readonly createEngine?: () => AbstractEngine;
  readonly createBabylonRuntime?: (
    options: BabylonWorldRuntimeOptions,
  ) => Promise<BabylonWorldRuntime>;
  readonly createGameplayWorldPort?: (
    runtime: BabylonWorldRuntime,
    fixedInputControllerEntityId: string,
  ) => GameplayWorldPortV1;
  readonly createRuntimeHost?: (
    input: RuntimeHostCreateOptionsV1,
  ) => Promise<RuntimeHost>;
  readonly awaitReady?: (runtime: BabylonWorldRuntime) => Promise<void>;
  readonly onRuntimeInitializationStage?: (
    stage: BabylonWorldRuntimeInitializationStageV1,
  ) => void;
  readonly onOwnershipSnapshot?: (
    snapshot: HeadlessRuntimeOwnershipSnapshotV1,
  ) => void;
}

export interface HeadlessRuntimeSessionV1 {
  readonly runtimeSessionId: string;
  readonly initialWorldSessionId: string;
  readonly worldPackageRef: WorldPackageRefV1;
  readonly worldPackageRootHash: `sha256:${string}`;
  readonly fixedInputControllerEntityId:
    typeof HEADLESS_FIXED_INPUT_CONTROLLER_ENTITY_ID_V1;
  snapshot(): WorldRuntimeSnapshotV4;
  executeGameplayCommand(
    command: GameplayCommandV1,
  ): Promise<GameplayCommandReceiptV1>;
  runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV4>;
  eventsAfter(
    afterEventSequence: number,
    maximumEventCount: number,
  ): readonly GameplayEventV1[];
  resolvedSubjectAssetRefs(): readonly string[];
  ownershipSnapshot(): HeadlessRuntimeOwnershipSnapshotV1;
  dispose(): Promise<void>;
}

export interface HeadlessRuntimePublicationSessionV1
  extends HeadlessRuntimeSessionV1 {
  stageVerifiedWorldPackageV1(input: {
    readonly worldConfiguration: RuntimeWorldConfigurationV1;
    readonly verifiedDirectory: VerifiedWorldPackageDirectoryV2;
  }): () => void;
  publishWorldReplacementV1(
    input: unknown,
  ): Promise<PublishWorldReplacementResultV1>;
  retryWorldSessionCleanupV1(
    worldSessionId: string,
  ): Promise<"released" | "quarantined">;
}

interface HeadlessRuntimeHandleV1 {
  readonly runtime: BabylonWorldRuntime;
  readonly port: GameplayWorldPortV1;
  readonly assetResolver: PackageSubjectAssetResolverV1;
}

interface StagedVerifiedWorldPackageV1 {
  readonly worldConfiguration: RuntimeWorldConfigurationV1;
  readonly verifiedDirectory: VerifiedWorldPackageDirectoryV2;
}

function cleanupDiagnostic(
  code: HeadlessRuntimeCleanupDiagnosticV1["code"],
  message: string,
): HeadlessRuntimeCleanupDiagnosticV1 {
  return Object.freeze({ code, message });
}

class HeadlessRuntimeOwnershipLedgerV1 {
  readonly #activeResourceIds = new Set<HeadlessRuntimeOwnedResourceIdV1>();
  readonly #releaseOrder: HeadlessRuntimeOwnedResourceIdV1[] = [];
  #phase: HeadlessRuntimeOwnershipPhaseV1 = "constructing";

  constructor(
    private readonly onSnapshot?: (
      snapshot: HeadlessRuntimeOwnershipSnapshotV1,
    ) => void,
  ) {}

  acquire(resourceId: HeadlessRuntimeOwnedResourceIdV1): void {
    if (this.#activeResourceIds.has(resourceId)) {
      throw new Error("HEADLESS_RUNTIME_OWNERSHIP_DUPLICATE");
    }
    this.#activeResourceIds.add(resourceId);
    this.emit();
  }

  release(resourceId: HeadlessRuntimeOwnedResourceIdV1): void {
    if (!this.#activeResourceIds.delete(resourceId)) return;
    this.#releaseOrder.push(resourceId);
    this.emit();
  }

  has(resourceId: HeadlessRuntimeOwnedResourceIdV1): boolean {
    return this.#activeResourceIds.has(resourceId);
  }

  setPhase(phase: HeadlessRuntimeOwnershipPhaseV1): void {
    this.#phase = phase;
    this.emit();
  }

  assertEmpty(): void {
    if (!isEmpty(this.#activeResourceIds)) {
      throw new Error("HEADLESS_RUNTIME_OWNERSHIP_NOT_EMPTY");
    }
  }

  snapshot(): HeadlessRuntimeOwnershipSnapshotV1 {
    return Object.freeze({
      kind: "worldkit-headless-runtime-ownership-snapshot",
      schemaVersion: 1,
      phase: this.#phase,
      activeResourceIds: Object.freeze(sortBy([
        ...this.#activeResourceIds,
      ])),
      releaseOrder: Object.freeze([...this.#releaseOrder]),
    });
  }

  private emit(): void {
    this.onSnapshot?.(this.snapshot());
  }
}

class PackageSubjectAssetResolverV1 implements SubjectAssetResolverV1 {
  readonly #resolvedSubjectAssetRefs = new Set<string>();
  #disposed = false;

  constructor(
    private readonly verifiedDirectory: VerifiedWorldPackageDirectoryV2,
    private readonly worldPackageRef: string,
  ) {}

  async resolveSubjectAsset(
    request: SubjectAssetResolveRequestV1,
  ): Promise<Readonly<{ bytes: Uint8Array; sourceLabel: string }>> {
    if (this.#disposed) {
      throw new Error("HEADLESS_RUNTIME_ASSET_RESOLVER_DISPOSED");
    }
    const resource = this.verifiedDirectory.receipt.manifest.resources.find(
      (candidate) => candidate.resourceRef === request.subjectAssetRef,
    );
    const bytes = this.verifiedDirectory.resourceBytesByRef.get(
      request.subjectAssetRef,
    );
    if (
      isNil(resource) ||
      isNil(bytes) ||
      resource.mediaType !== request.mediaType ||
      resource.contentHash !== request.artifactContentHash ||
      resource.sizeBytes !== request.byteLength ||
      bytes.byteLength !== request.byteLength
    ) {
      throw new Error("HEADLESS_RUNTIME_PACKAGE_ASSET_MISMATCH");
    }
    this.#resolvedSubjectAssetRefs.add(request.subjectAssetRef);
    return Object.freeze({
      bytes: new Uint8Array(bytes),
      sourceLabel: `${this.worldPackageRef}#${request.subjectAssetRef}`,
    });
  }

  resolvedSubjectAssetRefs(): readonly string[] {
    return Object.freeze(sortBy([...this.#resolvedSubjectAssetRefs]));
  }

  dispose(): void {
    this.#disposed = true;
  }
}

let havokWasmBinaryPromise: Promise<ArrayBuffer> | undefined;

async function loadInstalledHavokWasmBinary(): Promise<ArrayBuffer> {
  if (isNil(havokWasmBinaryPromise)) {
    havokWasmBinaryPromise = readFile(
      createRequire(import.meta.url).resolve(
        "@babylonjs/havok/lib/esm/HavokPhysics.wasm",
      ),
    ).then((bytes) => bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer);
  }
  try {
    const bytes = await havokWasmBinaryPromise;
    return bytes.slice(0);
  } catch (error) {
    havokWasmBinaryPromise = undefined;
    throw error;
  }
}

function createDeterministicNullEngine(): AbstractEngine {
  return new NullEngine({
    renderWidth: 640,
    renderHeight: 360,
    textureSize: 512,
    deterministicLockstep: true,
    lockstepMaxSteps: 4,
  });
}

function gameplayModeFactory(): GameplayModeV1 {
  return Object.freeze({
    gameplayModeRef: HEADLESS_GAMEPLAY_MODE_REF_V1,
    evaluateCommand: () => Object.freeze({ status: "accepted" as const }),
  });
}

function selectedFactories(
  input: HeadlessRuntimeSessionFactoriesV1,
): Required<Omit<
  HeadlessRuntimeSessionFactoriesV1,
  "onRuntimeInitializationStage" | "onOwnershipSnapshot"
>> {
  return Object.freeze({
    loadHavokWasmBinary: isNil(input.loadHavokWasmBinary)
      ? loadInstalledHavokWasmBinary
      : input.loadHavokWasmBinary,
    createEngine: isNil(input.createEngine)
      ? createDeterministicNullEngine
      : input.createEngine,
    createBabylonRuntime: isNil(input.createBabylonRuntime)
      ? (options) => BabylonWorldRuntime.create(options)
      : input.createBabylonRuntime,
    createGameplayWorldPort: isNil(input.createGameplayWorldPort)
      ? createBabylonGameplayWorldPortV1
      : input.createGameplayWorldPort,
    createRuntimeHost: isNil(input.createRuntimeHost)
      ? (options) => RuntimeHost.create(options)
      : input.createRuntimeHost,
    awaitReady: isNil(input.awaitReady)
      ? (runtime) => runtime.renderFrameWhenReady().then(() => undefined)
      : input.awaitReady,
  });
}

function cleanupCreationError(
  code: HeadlessRuntimeSessionCreateErrorCodeV1,
  diagnostics: readonly HeadlessRuntimeCleanupDiagnosticV1[],
): HeadlessRuntimeSessionCreateErrorV1 {
  return new HeadlessRuntimeSessionCreateErrorV1(
    code,
    Object.freeze([...diagnostics]),
  );
}

function wrapGameplayWorldPort(
  port: GameplayWorldPortV1,
  ledger: HeadlessRuntimeOwnershipLedgerV1,
  onDisposed: () => void,
): GameplayWorldPortV1 {
  let disposePromise: Promise<void> | undefined;
  return Object.freeze({
    initialize: () => port.initialize(),
    hasEntity: (entityId: string) => port.hasEntity(entityId),
    isEntityControllable: (entityId: string) =>
      port.isEntityControllable(entityId),
    isActionAvailable: (
      actorEntityId: string,
      semanticActionRef: string,
      transition: Parameters<GameplayWorldPortV1["isActionAvailable"]>[2],
    ) => port.isActionAvailable(
      actorEntityId,
      semanticActionRef,
      transition,
    ),
    prepareGameplayTransition: (
      transition: Parameters<
        GameplayWorldPortV1["prepareGameplayTransition"]
      >[0],
    ) => port.prepareGameplayTransition(transition),
    estimateFixedInputTickCapacity: (
      fixedInput: Parameters<
        GameplayWorldPortV1["estimateFixedInputTickCapacity"]
      >[0],
    ) => port.estimateFixedInputTickCapacity(fixedInput),
    runFixedInputTick: (
      fixedInput: Parameters<GameplayWorldPortV1["runFixedInputTick"]>[0],
      actionProjection: Parameters<
        GameplayWorldPortV1["runFixedInputTick"]
      >[1],
    ) => port.runFixedInputTick(fixedInput, actionProjection),
    snapshot: () => port.snapshot(),
    dispose: () => {
      if (!isNil(disposePromise)) return disposePromise;
      disposePromise = Promise.resolve().then(() => port.dispose()).finally(
        () => {
          ledger.release("babylon-engine");
          ledger.release("babylon-scene-runtime");
          ledger.release("gameplay-world-port");
          onDisposed();
        },
      );
      return disposePromise;
    },
  });
}

function wrapCandidateGameplayWorldPort(
  port: GameplayWorldPortV1,
  assetResolver: PackageSubjectAssetResolverV1,
  onDisposed: () => void,
): GameplayWorldPortV1 {
  let disposeAttempt: Promise<void> | undefined;
  let disposed = false;
  return Object.freeze({
    initialize: () => port.initialize(),
    hasEntity: (entityId: string) => port.hasEntity(entityId),
    isEntityControllable: (entityId: string) =>
      port.isEntityControllable(entityId),
    isActionAvailable: (
      ...args: Parameters<GameplayWorldPortV1["isActionAvailable"]>
    ) => port.isActionAvailable(...args),
    prepareGameplayTransition: (
      ...args: Parameters<GameplayWorldPortV1["prepareGameplayTransition"]>
    ) => port.prepareGameplayTransition(...args),
    estimateFixedInputTickCapacity: (
      ...args: Parameters<
        GameplayWorldPortV1["estimateFixedInputTickCapacity"]
      >
    ) => port.estimateFixedInputTickCapacity(...args),
    runFixedInputTick: (
      ...args: Parameters<GameplayWorldPortV1["runFixedInputTick"]>
    ) => port.runFixedInputTick(...args),
    snapshot: () => port.snapshot(),
    dispose: () => {
      if (disposed) return Promise.resolve();
      if (!isNil(disposeAttempt)) return disposeAttempt;
      const attempt = Promise.resolve()
        .then(() => port.dispose())
        .then(() => {
          assetResolver.dispose();
          disposed = true;
          onDisposed();
        })
        .finally(() => {
          if (!disposed) disposeAttempt = undefined;
        });
      disposeAttempt = attempt;
      return attempt;
    },
  });
}

async function createCandidateRuntimeHandleV1(input: {
  readonly runtimeSessionId: string;
  readonly staged: StagedVerifiedWorldPackageV1;
  readonly factories: ReturnType<typeof selectedFactories>;
  readonly onRuntimeInitializationStage?: (
    stage: BabylonWorldRuntimeInitializationStageV1,
  ) => void;
  readonly onDisposed: () => void;
}): Promise<HeadlessRuntimeHandleV1> {
  const assetResolver = new PackageSubjectAssetResolverV1(
    input.staged.verifiedDirectory,
    input.staged.worldConfiguration.worldPackageRef,
  );
  let engine: AbstractEngine | undefined;
  let engineTransferred = false;
  let runtime: BabylonWorldRuntime | undefined;
  let rawPort: GameplayWorldPortV1 | undefined;
  try {
    const havokWasmBinary = await input.factories.loadHavokWasmBinary();
    const createdEngine = input.factories.createEngine();
    engine = createdEngine;
    runtime = await input.factories.createBabylonRuntime({
      executionPlan: input.staged.worldConfiguration.executionPlan,
      runtimeSessionId: input.runtimeSessionId,
      autoStartRenderLoop: false,
      havokWasmBinary,
      engineFactory: () => {
        engineTransferred = true;
        return createdEngine;
      },
      subjectAssetResolver: assetResolver,
      ...(isNil(input.onRuntimeInitializationStage)
        ? {}
        : { onInitializationStage: input.onRuntimeInitializationStage }),
    });
    rawPort = input.factories.createGameplayWorldPort(
      runtime,
      HEADLESS_FIXED_INPUT_CONTROLLER_ENTITY_ID_V1,
    );
    const port = wrapCandidateGameplayWorldPort(
      rawPort,
      assetResolver,
      input.onDisposed,
    );
    return Object.freeze({ runtime, port, assetResolver });
  } catch (error) {
    if (!isNil(rawPort)) {
      await rawPort.dispose().catch(() => undefined);
    } else if (!isNil(runtime)) {
      await runtime.dispose().catch(() => undefined);
    } else if (!isNil(engine) && !engineTransferred) {
      try {
        engine.dispose();
      } catch {
        // The original construction error remains authoritative.
      }
    }
    assetResolver.dispose();
    throw error;
  }
}

function releaseRuntimeOwnership(
  ledger: HeadlessRuntimeOwnershipLedgerV1,
): void {
  ledger.release("babylon-engine");
  ledger.release("babylon-scene-runtime");
}

async function cleanupConstruction(
  input: Readonly<{
    ledger: HeadlessRuntimeOwnershipLedgerV1;
    runtimeHost?: RuntimeHost;
    gameplayWorldPort?: GameplayWorldPortV1;
    runtime?: BabylonWorldRuntime;
    engine?: AbstractEngine;
    engineTransferred: boolean;
    assetResolver: PackageSubjectAssetResolverV1;
  }>,
): Promise<readonly HeadlessRuntimeCleanupDiagnosticV1[]> {
  const diagnostics: HeadlessRuntimeCleanupDiagnosticV1[] = [];
  let hostDisposalFailed = false;
  if (!isNil(input.runtimeHost)) {
    try {
      await input.runtimeHost.dispose();
    } catch {
      hostDisposalFailed = true;
      diagnostics.push(cleanupDiagnostic(
        "HEADLESS_RUNTIME_HOST_DISPOSE_FAILED",
        "RuntimeHost cleanup failed.",
      ));
    } finally {
      input.ledger.release("runtime-host");
    }
  }
  if (
    input.ledger.has("gameplay-world-port") &&
    !isNil(input.gameplayWorldPort)
  ) {
    try {
      await input.gameplayWorldPort.dispose();
    } catch {
      if (!hostDisposalFailed) {
        diagnostics.push(cleanupDiagnostic(
          "HEADLESS_RUNTIME_PORT_DISPOSE_FAILED",
          "Gameplay World Port cleanup failed.",
        ));
      }
    }
  }
  if (input.ledger.has("babylon-scene-runtime") && !isNil(input.runtime)) {
    try {
      await input.runtime.dispose();
    } catch {
      diagnostics.push(cleanupDiagnostic(
        "HEADLESS_RUNTIME_DISPOSE_FAILED",
        "Babylon Runtime cleanup failed.",
      ));
    } finally {
      releaseRuntimeOwnership(input.ledger);
    }
  }
  if (
    input.ledger.has("babylon-engine") &&
    !input.engineTransferred &&
    !isNil(input.engine)
  ) {
    try {
      input.engine.dispose();
    } catch {
      diagnostics.push(cleanupDiagnostic(
        "HEADLESS_RUNTIME_ENGINE_DISPOSE_FAILED",
        "Babylon Engine cleanup failed.",
      ));
    } finally {
      input.ledger.release("babylon-engine");
    }
  } else if (input.ledger.has("babylon-engine")) {
    input.ledger.release("babylon-engine");
  }
  try {
    input.assetResolver.dispose();
  } catch {
    diagnostics.push(cleanupDiagnostic(
      "HEADLESS_RUNTIME_ASSET_RESOLVER_DISPOSE_FAILED",
      "Package asset resolver cleanup failed.",
    ));
  } finally {
    input.ledger.release("package-asset-resolver");
  }
  return Object.freeze(diagnostics);
}

class HeadlessRuntimeSession implements HeadlessRuntimePublicationSessionV1 {
  readonly fixedInputControllerEntityId =
    HEADLESS_FIXED_INPUT_CONTROLLER_ENTITY_ID_V1;
  #disposePromise: Promise<void> | undefined;

  constructor(
    readonly runtimeSessionId: string,
    readonly initialWorldSessionId: string,
    private readonly runtimeHost: RuntimeHost,
    private readonly handles: Map<string, HeadlessRuntimeHandleV1>,
    private readonly stagedPackagesByExecutionPlanHash: Map<
      string,
      StagedVerifiedWorldPackageV1
    >,
    private readonly runtime: BabylonWorldRuntime,
    private readonly gameplayWorldPort: GameplayWorldPortV1,
    private readonly assetResolver: PackageSubjectAssetResolverV1,
    private readonly ledger: HeadlessRuntimeOwnershipLedgerV1,
  ) {}

  get worldPackageRef(): WorldPackageRefV1 {
    return this.runtimeHost.snapshot().worldState.worldPackageRef as WorldPackageRefV1;
  }

  get worldPackageRootHash(): `sha256:${string}` {
    return this.runtimeHost.snapshot().worldState.worldPackageRootHash;
  }

  stageVerifiedWorldPackageV1(
    input: StagedVerifiedWorldPackageV1,
  ): () => void {
    const expectedRootHash =
      input.worldConfiguration.worldPackageBuildReceipt.worldPackageRootHash;
    if (
      input.verifiedDirectory.receipt.worldPackageRootHash !== expectedRootHash ||
      input.worldConfiguration.worldPackageRef !==
        worldPackageRefFromRootHashV1(expectedRootHash) ||
      input.worldConfiguration.executionPlanHash !==
        input.verifiedDirectory.receipt.manifest.executionPlanHash ||
      !isEqual(
        input.worldConfiguration.executionPlan,
        input.verifiedDirectory.executionPlan,
      ) ||
      !isEqual(
        input.worldConfiguration.gameplayBootstrap,
        input.verifiedDirectory.gameplayBootstrap,
      )
    ) {
      throw new Error("HEADLESS_RUNTIME_STAGED_PACKAGE_MISMATCH");
    }
    const key = input.worldConfiguration.executionPlanHash;
    const existing = this.stagedPackagesByExecutionPlanHash.get(key);
    if (!isNil(existing) && !isEqual(existing, input)) {
      throw new Error("HEADLESS_RUNTIME_STAGED_PACKAGE_CONFLICT");
    }
    const staged = Object.freeze({ ...input });
    this.stagedPackagesByExecutionPlanHash.set(key, staged);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this.stagedPackagesByExecutionPlanHash.get(key) === staged) {
        this.stagedPackagesByExecutionPlanHash.delete(key);
      }
    };
  }

  publishWorldReplacementV1(
    input: unknown,
  ): Promise<PublishWorldReplacementResultV1> {
    return this.runtimeHost.publishWorldReplacementV1(input);
  }

  async retryWorldSessionCleanupV1(
    worldSessionId: string,
  ): Promise<"released" | "quarantined"> {
    if (worldSessionId === this.runtimeHost.currentWorldSessionId) {
      return "quarantined";
    }
    const handle = this.handles.get(worldSessionId);
    if (isNil(handle)) return "released";
    try {
      await handle.port.dispose();
      return "released";
    } catch {
      return "quarantined";
    }
  }

  snapshot(): WorldRuntimeSnapshotV4 {
    const handle = this.handles.get(this.runtimeHost.currentWorldSessionId);
    if (isNil(handle)) {
      throw new Error("HEADLESS_RUNTIME_CURRENT_HANDLE_MISSING");
    }
    return projectBabylonWorldRuntimeSnapshotV4({
      runtimeSessionId: this.runtimeSessionId,
      fixedInputControllerEntityId: this.fixedInputControllerEntityId,
      publication: this.runtimeHost.snapshot(),
      runtimeProjection: handle.runtime.snapshot(),
      hostPhase: this.runtimeHost.phase,
      isPaused: false,
    });
  }

  executeGameplayCommand(
    command: GameplayCommandV1,
  ): Promise<GameplayCommandReceiptV1> {
    return this.runtimeHost.executeGameplayCommand(command);
  }

  async runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV4> {
    await this.runtimeHost.runFixedInput(input);
    return this.snapshot();
  }

  eventsAfter(
    afterEventSequence: number,
    maximumEventCount: number,
  ): readonly GameplayEventV1[] {
    return this.runtimeHost.eventsAfter(
      afterEventSequence,
      maximumEventCount,
    ).filter((event): event is GameplayEventV1 => "kind" in event);
  }

  resolvedSubjectAssetRefs(): readonly string[] {
    const handle = this.handles.get(this.runtimeHost.currentWorldSessionId);
    if (isNil(handle)) {
      throw new Error("HEADLESS_RUNTIME_CURRENT_HANDLE_MISSING");
    }
    return handle.assetResolver.resolvedSubjectAssetRefs();
  }

  ownershipSnapshot(): HeadlessRuntimeOwnershipSnapshotV1 {
    return this.ledger.snapshot();
  }

  dispose(): Promise<void> {
    if (!isNil(this.#disposePromise)) return this.#disposePromise;
    this.ledger.setPhase("disposing");
    this.#disposePromise = (async () => {
      const diagnostics = await cleanupConstruction({
        ledger: this.ledger,
        runtimeHost: this.runtimeHost,
        gameplayWorldPort: this.gameplayWorldPort,
        runtime: this.runtime,
        engineTransferred: true,
        assetResolver: this.assetResolver,
      });
      this.ledger.assertEmpty();
      this.ledger.setPhase("disposed");
      if (!isEmpty(diagnostics)) {
        throw new HeadlessRuntimeSessionCleanupErrorV1(diagnostics);
      }
    })();
    return this.#disposePromise;
  }
}

async function createHeadlessRuntimeSessionInternalV1(
  input: CreateHeadlessRuntimeSessionInputV1,
  factoryInput: HeadlessRuntimeSessionFactoriesV1,
): Promise<HeadlessRuntimePublicationSessionV1> {
  if (
    typeof input.runtimeSessionId !== "string" ||
    isEmpty(input.runtimeSessionId) ||
    typeof input.initialWorldSessionId !== "string" ||
    isEmpty(input.initialWorldSessionId)
  ) {
    throw cleanupCreationError("HEADLESS_RUNTIME_INPUT_INVALID", []);
  }
  const expectedRootHash =
    input.runtimeWorldConfiguration.worldPackageBuildReceipt
      .worldPackageRootHash;
  if (
    input.verifiedDirectory.receipt.worldPackageRootHash !== expectedRootHash ||
    input.runtimeWorldConfiguration.worldPackageRef !==
      worldPackageRefFromRootHashV1(expectedRootHash)
  ) {
    throw cleanupCreationError("HEADLESS_RUNTIME_INPUT_INVALID", []);
  }

  const factories = selectedFactories(factoryInput);
  const ledger = new HeadlessRuntimeOwnershipLedgerV1(
    factoryInput.onOwnershipSnapshot,
  );
  const assetResolver = new PackageSubjectAssetResolverV1(
    input.verifiedDirectory,
    input.runtimeWorldConfiguration.worldPackageRef,
  );
  ledger.acquire("package-asset-resolver");
  let failureCode: HeadlessRuntimeSessionCreateErrorCodeV1 =
    "HEADLESS_RUNTIME_HAVOK_LOAD_FAILED";
  let runtimeInitializationStage:
    BabylonWorldRuntimeInitializationStageV1 | undefined;
  let engine: AbstractEngine | undefined;
  let engineTransferred = false;
  let runtime: BabylonWorldRuntime | undefined;
  let gameplayWorldPort: GameplayWorldPortV1 | undefined;
  let runtimeHost: RuntimeHost | undefined;

  try {
    const havokWasmBinary = await factories.loadHavokWasmBinary();
    failureCode = "HEADLESS_RUNTIME_ENGINE_CREATE_FAILED";
    const createdEngine = factories.createEngine();
    engine = createdEngine;
    ledger.acquire("babylon-engine");
    failureCode = "HEADLESS_RUNTIME_CREATE_FAILED";
    runtime = await factories.createBabylonRuntime({
      executionPlan: input.runtimeWorldConfiguration.executionPlan,
      runtimeSessionId: input.runtimeSessionId,
      autoStartRenderLoop: false,
      havokWasmBinary,
      engineFactory: () => {
        engineTransferred = true;
        return createdEngine;
      },
      subjectAssetResolver: assetResolver,
      onInitializationStage: (stage) => {
        runtimeInitializationStage = stage;
        factoryInput.onRuntimeInitializationStage?.(stage);
      },
    });
    ledger.acquire("babylon-scene-runtime");
    failureCode = "HEADLESS_RUNTIME_GAMEPLAY_PORT_CREATE_FAILED";
    const handles = new Map<string, HeadlessRuntimeHandleV1>();
    const stagedPackagesByExecutionPlanHash = new Map<
      string,
      StagedVerifiedWorldPackageV1
    >();
    const port = factories.createGameplayWorldPort(
      runtime,
      HEADLESS_FIXED_INPUT_CONTROLLER_ENTITY_ID_V1,
    );
    gameplayWorldPort = wrapGameplayWorldPort(
      port,
      ledger,
      () => handles.delete(input.initialWorldSessionId),
    );
    ledger.acquire("gameplay-world-port");

    handles.set(input.initialWorldSessionId, Object.freeze({
      runtime,
      port: gameplayWorldPort,
      assetResolver,
    }));
    const adapterFactory: GameplayWorldAdapterFactoryV1 = Object.freeze({
      preflightConcurrentResidency: (
        current: RuntimeWorldAdapterDescriptorV1,
        candidate: RuntimeWorldAdapterDescriptorV1,
      ) => {
        const staged = stagedPackagesByExecutionPlanHash.get(
          candidate.executionPlanHash,
        );
        if (
          current.runtimeSessionId !== input.runtimeSessionId ||
          candidate.runtimeSessionId !== input.runtimeSessionId ||
          !handles.has(current.worldSessionId) ||
          isNil(staged) ||
          !isEqual(candidate.executionPlan, staged.worldConfiguration.executionPlan)
        ) {
          return Object.freeze({
            status: "rejected" as const,
            diagnostic: Object.freeze({
              code: "WORLD_REPLACEMENT_CAPACITY_EXCEEDED" as const,
              message: "The verified candidate Package is not staged for residency.",
            }),
          });
        }
        return Object.freeze({ status: "accepted" as const });
      },
      create: async (descriptor: RuntimeWorldAdapterDescriptorV1) => {
        const handle = handles.get(descriptor.worldSessionId);
        if (!isNil(handle)) {
          if (
            descriptor.runtimeSessionId !== input.runtimeSessionId ||
            descriptor.executionPlanHash !==
              input.runtimeWorldConfiguration.executionPlanHash
          ) {
            throw new Error("HEADLESS_RUNTIME_ADAPTER_DESCRIPTOR_MISMATCH");
          }
          return handle.port;
        }
        const staged = stagedPackagesByExecutionPlanHash.get(
          descriptor.executionPlanHash,
        );
        if (
          descriptor.runtimeSessionId !== input.runtimeSessionId ||
          isNil(staged) ||
          !isEqual(descriptor.executionPlan, staged.worldConfiguration.executionPlan)
        ) {
          throw new Error("HEADLESS_RUNTIME_ADAPTER_DESCRIPTOR_MISMATCH");
        }
        const candidateHandle = await createCandidateRuntimeHandleV1({
          runtimeSessionId: descriptor.runtimeSessionId,
          staged,
          factories,
          ...(isNil(factoryInput.onRuntimeInitializationStage)
            ? {}
            : {
              onRuntimeInitializationStage:
                factoryInput.onRuntimeInitializationStage,
            }),
          onDisposed: () => handles.delete(descriptor.worldSessionId),
        });
        handles.set(descriptor.worldSessionId, candidateHandle);
        return candidateHandle.port;
      },
      awaitCandidatePublicationReady: async (
        gate: RuntimeCandidatePublicationGateInputV1,
      ) => {
        const handle = handles.get(gate.worldSessionId);
        if (isNil(handle)) {
          throw new Error("HEADLESS_RUNTIME_READY_HANDLE_MISSING");
        }
        await factories.awaitReady(handle.runtime);
      },
    });
    const builtInFeatureFactories = [
      createCoreControlFeatureFactoryV1(),
      createCoreSemanticActionFeatureFactoryV1(),
      createMountedRelationshipFeatureFactoryV1(),
    ];
    const lockedFeatureRefs = new Set(
      input.runtimeWorldConfiguration.gameplayBootstrap.featureResourceLocks
        .map(({ resourceRef }) => resourceRef),
    );
    const gameplayFeatureFactories = builtInFeatureFactories.filter(
      ({ manifest }) => lockedFeatureRefs.has(manifest.resourceRef),
    );
    const gameplayCapacityBudget = Object.freeze({
      ...DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
      maximumRelationshipStateCount: Math.max(
        DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1.maximumRelationshipStateCount,
        input.runtimeWorldConfiguration.gameplayBootstrap.entityDescriptors
          .length + 1,
      ),
    });
    failureCode = "HEADLESS_RUNTIME_WORLD_SESSION_CREATE_FAILED";
    let worldSessionSequence = 0;
    runtimeHost = await factories.createRuntimeHost({
      runtimeSessionId: input.runtimeSessionId,
      initialWorld: input.runtimeWorldConfiguration,
      participantStates: [Object.freeze({
        id: HEADLESS_RUNTIME_PARTICIPANT_ID_V1,
        mode: "active" as const,
      })],
      controllerStates: [Object.freeze({
        id: HEADLESS_FIXED_INPUT_CONTROLLER_ENTITY_ID_V1,
        kind: "controller-entity-state" as const,
        controllerDefinitionRef: HEADLESS_CONTROLLER_DEFINITION_REF_V1,
        controllerDefinitionHash: HEADLESS_CONTROLLER_DEFINITION_HASH_V1,
        participantId: HEADLESS_RUNTIME_PARTICIPANT_ID_V1,
        lifecycleMode: "active" as const,
        inputMode: "agent" as const,
      })],
      fixedInputControllerEntityId:
        HEADLESS_FIXED_INPUT_CONTROLLER_ENTITY_ID_V1,
      gameplayModeFactory,
      gameplayFeatureFactories,
      gameplayCapacityBudget,
      runtimeHostCapacityBudget: Object.freeze({
        maximumWorldSessionCount: MAXIMUM_WORLD_SESSION_COUNT_V1,
        maximumRuntimeActivityRecordCount:
          MAXIMUM_RUNTIME_ACTIVITY_RECORD_COUNT_V1,
      }),
      adapterFactory,
      worldSessionIdFactory: () => {
        worldSessionSequence += 1;
        return worldSessionSequence === 1
          ? input.initialWorldSessionId
          : `${input.initialWorldSessionId}.replacement.${worldSessionSequence - 1}`;
      },
    });
    ledger.acquire("runtime-host");

    failureCode = "HEADLESS_RUNTIME_INITIAL_CONTROL_BIND_FAILED";
    const bindReceipt = await runtimeHost.executeGameplayCommand({
      schemaVersion: 1,
      id: `command.runtime-session.initial-bind.${input.initialWorldSessionId}`,
      type: "control.bind",
      runtimeSessionId: input.runtimeSessionId,
      worldSessionId: input.initialWorldSessionId,
      controllerEntityId: HEADLESS_FIXED_INPUT_CONTROLLER_ENTITY_ID_V1,
      controlledEntityId:
        input.runtimeWorldConfiguration.executionPlan.initialControlledEntityId,
      expectedPossession: Object.freeze({ mode: "unbound" as const }),
    });
    if (bindReceipt.status !== "committed") {
      throw new Error("HEADLESS_RUNTIME_INITIAL_CONTROL_BIND_REJECTED");
    }

    failureCode = "HEADLESS_RUNTIME_READY_GATE_FAILED";
    await factories.awaitReady(runtime);
    const publication = runtimeHost.snapshot();
    const runtimeProjection = runtime.snapshot();
    const readySnapshot = projectBabylonWorldRuntimeSnapshotV4({
      runtimeSessionId: input.runtimeSessionId,
      fixedInputControllerEntityId:
        HEADLESS_FIXED_INPUT_CONTROLLER_ENTITY_ID_V1,
      publication,
      runtimeProjection,
      hostPhase: runtimeHost.phase,
      isPaused: false,
    });
    if (
      runtimeHost.phase !== "ready" ||
      runtimeHost.currentWorldSessionId !== input.initialWorldSessionId ||
      publication.worldState.worldPackageRef !==
        input.runtimeWorldConfiguration.worldPackageRef ||
      publication.worldState.worldPackageRootHash !== expectedRootHash ||
      publication.worldState.simulationTick !== runtimeProjection.tick ||
      !runtimeProjection.ready ||
      !runtimeProjection.physics.ready ||
      runtimeProjection.possessionTarget.mode !== "possessed" ||
      runtimeProjection.possessionTarget.controlledEntityId !==
        input.runtimeWorldConfiguration.executionPlan.initialControlledEntityId ||
      readySnapshot.runtime.phase !== "ready" ||
      readySnapshot.resources.phase !== "ready" ||
      readySnapshot.view.camera.mode !== "tracking"
    ) {
      throw new Error("HEADLESS_RUNTIME_READY_IDENTITY_MISMATCH");
    }
    ledger.setPhase("ready");
    return new HeadlessRuntimeSession(
      input.runtimeSessionId,
      input.initialWorldSessionId,
      runtimeHost,
      handles,
      stagedPackagesByExecutionPlanHash,
      runtime,
      gameplayWorldPort,
      assetResolver,
      ledger,
    );
  } catch {
    if (
      failureCode === "HEADLESS_RUNTIME_CREATE_FAILED" &&
      runtimeInitializationStage === "engine"
    ) {
      failureCode = "HEADLESS_RUNTIME_ENGINE_CREATE_FAILED";
    } else if (
      failureCode === "HEADLESS_RUNTIME_CREATE_FAILED" &&
      runtimeInitializationStage === "havok"
    ) {
      failureCode = "HEADLESS_RUNTIME_HAVOK_INITIALIZATION_FAILED";
    }
    const cleanupDiagnostics = await cleanupConstruction({
      ledger,
      ...(isNil(runtimeHost) ? {} : { runtimeHost }),
      ...(isNil(gameplayWorldPort) ? {} : { gameplayWorldPort }),
      ...(isNil(runtime) ? {} : { runtime }),
      ...(isNil(engine) ? {} : { engine }),
      engineTransferred,
      assetResolver,
    });
    ledger.assertEmpty();
    ledger.setPhase("failed");
    throw cleanupCreationError(failureCode, cleanupDiagnostics);
  }
}

export function createHeadlessRuntimeSessionV1(
  input: CreateHeadlessRuntimeSessionInputV1,
): Promise<HeadlessRuntimePublicationSessionV1> {
  return createHeadlessRuntimeSessionInternalV1(input, {});
}

export function createHeadlessRuntimeSessionForTestV1(
  input: CreateHeadlessRuntimeSessionInputV1,
  factories: HeadlessRuntimeSessionFactoriesV1,
): Promise<HeadlessRuntimePublicationSessionV1> {
  return createHeadlessRuntimeSessionInternalV1(input, factories);
}

export async function loadHeadlessWorldPackageV1(
  input: LoadHeadlessWorldPackageInputV1,
): Promise<HeadlessRuntimePublicationSessionV1> {
  const loaded = await loadRuntimeWorldConfigurationFromPackageDirectoryV1({
    packageDirectoryPath: input.packageDirectoryPath,
  });
  if (!("runtimeWorldConfiguration" in loaded)) {
    throw cleanupCreationError("HEADLESS_WORLD_PACKAGE_LOAD_FAILED", []);
  }
  return createHeadlessRuntimeSessionV1({
    runtimeSessionId: input.runtimeSessionId,
    initialWorldSessionId: input.initialWorldSessionId,
    runtimeWorldConfiguration: loaded.runtimeWorldConfiguration,
    verifiedDirectory: loaded.verifiedDirectory,
  });
}
