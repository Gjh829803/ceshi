import { type WorldPackageRefV1 } from "@whitebox-world/world-identity";

import {
  WORLDKIT_RUNTIME_SESSION_PROTOCOL_VERSION,
  WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
  canonicalRuntimeSessionReceiptV1,
  deriveRuntimeSessionEventIdV1,
  deriveRuntimeSessionReceiptIdV1,
  hashRuntimeSessionRequestV1,
  parseRuntimeSessionEventV1,
  parseRuntimeSessionReceiptV1,
  parseRuntimeSessionRequestV1,
  type RuntimeSessionDiagnosticV1,
  type RuntimeSessionEventV1,
  type RuntimeSessionReceiptV1,
  type RuntimeSessionRequestV1,
} from "@whitebox-world/runtime-contracts";

import { isEmpty, isNil } from "lodash-es";

import {
  createHeadlessRuntimeSessionV1,
  type HeadlessRuntimeSessionV1,
} from "./headless-runtime-session";
import {
  createFileRuntimeSessionWalV1,
  openFileRuntimeSessionWalV1,
  receiptCommitsNewWorldSessionV1,
  type FileRuntimeSessionWalV1,
  type RuntimeSessionWalCommittedRequestV1,
} from "./runtime-session-wal";
import {
  loadRuntimeWorldConfigurationFromPackageDirectoryV1,
} from "./world-package-cli";

export type RuntimeSessionReadyEventV1 = Extract<
  RuntimeSessionEventV1,
  { type: "ready" }
>;

export type RuntimeSessionFinalEventV1 = Extract<
  RuntimeSessionEventV1,
  { type: "completed" | "failed" }
>;

export interface AdmittedRuntimeSessionPackageV1 {
  readonly worldPackageRef: WorldPackageRefV1;
  readonly worldPackageRootHash: `sha256:${string}`;
  readonly worldBuildIdentityHash: `sha256:${string}`;
  readonly createSession: (input: Readonly<{
    readonly runtimeSessionId: string;
    readonly initialWorldSessionId: string;
  }>) => Promise<HeadlessRuntimeSessionV1>;
}

export interface RuntimeSessionExecutorHookInputV1 {
  readonly request: RuntimeSessionRequestV1;
  readonly receipt: RuntimeSessionReceiptV1;
}

export interface RuntimeSessionExecutorFactoriesV1 {
  readonly admitPackage: (
    packageDirectoryPath: string,
  ) => Promise<AdmittedRuntimeSessionPackageV1>;
  /** Test-only crash boundary. A thrown value models process death. */
  readonly afterRuntimeResult?: (
    input: RuntimeSessionExecutorHookInputV1,
  ) => void | Promise<void>;
  /** Test-only crash boundary. A thrown value models process death. */
  readonly afterCommittedRequest?: (
    input: RuntimeSessionExecutorHookInputV1,
  ) => void | Promise<void>;
}

export interface CreateRuntimeSessionExecutorInputV1 {
  readonly packageDirectoryPath: string;
  readonly walFilePath: string;
  readonly runtimeSessionId: string;
  readonly initialWorldSessionId: string;
}

export interface ResumeRuntimeSessionExecutorInputV1 {
  readonly packageDirectoryPath: string;
  readonly walFilePath: string;
}

export interface RuntimeSessionExecutorV1 {
  readonly readyEvent: RuntimeSessionReadyEventV1;
  execute(request: unknown): Promise<RuntimeSessionReceiptV1>;
  terminalEvent(): RuntimeSessionFinalEventV1 | undefined;
  terminate(
    diagnostic?: RuntimeSessionDiagnosticV1,
  ): Promise<RuntimeSessionFinalEventV1>;
}

type ExecutorStateV1 = "active" | "closed" | "failed" | "crashed";

const INTERNAL_FAILURE_DIAGNOSTIC = Object.freeze({
  code: "RUNTIME_SESSION_INTERNAL_FAILURE" as const,
  message: "Runtime Session operation failed and the Session was closed.",
});

const RESET_COMMITTED_CLEANUP_FAILURE_DIAGNOSTIC = Object.freeze({
  code: "RUNTIME_SESSION_RESET_COMMITTED_CLEANUP_FAILURE" as const,
  message:
    "The new World was committed before old World cleanup failed and the Session was closed.",
});

const RECOVERY_DIVERGED_DIAGNOSTIC = Object.freeze({
  code: "RUNTIME_SESSION_RECOVERY_DIVERGED" as const,
  message: "Committed Runtime Session replay diverged from its durable Receipt.",
});

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || isEmpty(value)) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function finalizeReceipt(body: Readonly<Record<string, unknown>>): RuntimeSessionReceiptV1 {
  return parseRuntimeSessionReceiptV1({
    id: deriveRuntimeSessionReceiptIdV1(body),
    ...body,
  });
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

function lifecycleEvent(
  body: Readonly<Record<string, unknown>>,
): RuntimeSessionEventV1 {
  return parseRuntimeSessionEventV1({
    id: deriveRuntimeSessionEventIdV1(body),
    ...body,
  });
}

function readyEvent(
  input: Readonly<{
    runtimeSessionId: string;
    worldSessionId: string;
    package: AdmittedRuntimeSessionPackageV1;
    fixedInputControllerEntityId: string;
  }>,
): RuntimeSessionReadyEventV1 {
  return lifecycleEvent({
    kind: "worldkit-runtime-session-event",
    schemaVersion: 1,
    protocolVersion: WORLDKIT_RUNTIME_SESSION_PROTOCOL_VERSION,
    sequence: 1,
    runtimeSessionId: input.runtimeSessionId,
    worldSessionId: input.worldSessionId,
    type: "ready",
    runtimeSessionUri:
      `worldkit://runtime-session/${encodeURIComponent(input.runtimeSessionId)}`,
    worldPackageRef: input.package.worldPackageRef,
    worldPackageRootHash: input.package.worldPackageRootHash,
    worldBuildIdentityHash: input.package.worldBuildIdentityHash,
    fixedInputControllerEntityId: input.fixedInputControllerEntityId,
    supportedRequestTypes: WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
  }) as RuntimeSessionReadyEventV1;
}

function finalEvent(
  ready: RuntimeSessionReadyEventV1,
  worldSessionId: string,
  type: "completed" | "failed",
  diagnostic?: RuntimeSessionDiagnosticV1,
): RuntimeSessionFinalEventV1 {
  return lifecycleEvent({
    kind: "worldkit-runtime-session-event",
    schemaVersion: 1,
    protocolVersion: WORLDKIT_RUNTIME_SESSION_PROTOCOL_VERSION,
    sequence: ready.sequence + 1,
    runtimeSessionId: ready.runtimeSessionId,
    worldSessionId,
    type,
    ...(isNil(diagnostic) ? {} : { diagnostic }),
  }) as RuntimeSessionFinalEventV1;
}

async function defaultAdmitPackage(
  packageDirectoryPath: string,
): Promise<AdmittedRuntimeSessionPackageV1> {
  const loaded = await loadRuntimeWorldConfigurationFromPackageDirectoryV1({
    packageDirectoryPath,
  });
  if (!("runtimeWorldConfiguration" in loaded)) {
    throw new Error(
      `RUNTIME_SESSION_PACKAGE_ADMISSION_FAILED: ${JSON.stringify(loaded.result.diagnostics)}`,
    );
  }
  if (loaded.verifiedDirectory.kind !== "canonical-execution-plan") {
    throw new Error(
      "RUNTIME_SESSION_ADAPTER_SCENE_SOURCE_UNSUPPORTED: The selected headless Runtime adapter cannot run this Scene Source.",
    );
  }
  const { runtimeWorldConfiguration, verifiedDirectory } = loaded;
  return Object.freeze({
    worldPackageRef: runtimeWorldConfiguration.worldBuildIdentity.worldPackageRef,
    worldPackageRootHash:
      runtimeWorldConfiguration.worldBuildIdentity.worldPackageRootHash,
    worldBuildIdentityHash: verifiedDirectory.receipt.worldBuildIdentityHash,
    createSession: ({
      runtimeSessionId,
      initialWorldSessionId,
    }: Readonly<{
      runtimeSessionId: string;
      initialWorldSessionId: string;
    }>) =>
      createHeadlessRuntimeSessionV1({
        runtimeSessionId,
        initialWorldSessionId,
        runtimeWorldConfiguration,
        verifiedDirectory,
      }),
  });
}

const DEFAULT_FACTORIES = Object.freeze({
  admitPackage: defaultAdmitPackage,
}) satisfies RuntimeSessionExecutorFactoriesV1;

function assertSessionBinding(
  session: HeadlessRuntimeSessionV1,
  ready: RuntimeSessionReadyEventV1,
): void {
  if (
    session.runtimeSessionId !== ready.runtimeSessionId ||
    session.initialWorldSessionId !== ready.worldSessionId ||
    session.worldPackageRef !== ready.worldPackageRef ||
    session.worldPackageRootHash !== ready.worldPackageRootHash ||
    session.worldBuildIdentityHash !== ready.worldBuildIdentityHash ||
    session.fixedInputControllerEntityId !== ready.fixedInputControllerEntityId
  ) {
    throw new Error(
      "RUNTIME_SESSION_RUNTIME_IDENTITY_MISMATCH: Runtime does not bind to the durable Session identity.",
    );
  }
}

function assertPackageBinding(
  admitted: AdmittedRuntimeSessionPackageV1,
  ready: RuntimeSessionReadyEventV1,
): void {
  if (
    admitted.worldPackageRef !== ready.worldPackageRef ||
    admitted.worldPackageRootHash !== ready.worldPackageRootHash
    || admitted.worldBuildIdentityHash !== ready.worldBuildIdentityHash
  ) {
    throw new Error(
      "RUNTIME_SESSION_PACKAGE_MISMATCH: Admitted Package Ref/Root differs from the durable Session.",
    );
  }
}

function isReplayMutation(request: RuntimeSessionRequestV1): boolean {
  return request.type === "gameplay-command.execute" ||
    request.type === "fixed-input.run" ||
    request.type === "session.reset" ||
    request.type === "session.close";
}

class RuntimeSessionExecutor implements RuntimeSessionExecutorV1 {
  #tail: Promise<void> = Promise.resolve();

  constructor(
    readonly readyEvent: RuntimeSessionReadyEventV1,
    private readonly wal: FileRuntimeSessionWalV1,
    private readonly session: HeadlessRuntimeSessionV1 | undefined,
    private state: ExecutorStateV1,
    private currentWorldSessionId: string,
    private readonly hooks: Pick<
      RuntimeSessionExecutorFactoriesV1,
      "afterRuntimeResult" | "afterCommittedRequest"
    >,
  ) {}

  execute(value: unknown): Promise<RuntimeSessionReceiptV1> {
    const operation = this.#tail.then(() => this.executeSerialized(value));
    this.#tail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  terminalEvent(): RuntimeSessionFinalEventV1 | undefined {
    return this.wal.snapshot().finalEvent;
  }

  terminate(
    diagnostic?: RuntimeSessionDiagnosticV1,
  ): Promise<RuntimeSessionFinalEventV1> {
    const operation = this.#tail.then(() =>
      this.terminateSerialized(diagnostic)
    );
    this.#tail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async replayCommitted(
    entry: RuntimeSessionWalCommittedRequestV1,
  ): Promise<RuntimeSessionReceiptV1> {
    if (isNil(this.session)) throw new Error("missing recovery Runtime");
    return this.invoke(entry.request, this.session);
  }

  private async executeSerialized(value: unknown): Promise<RuntimeSessionReceiptV1> {
    const request = parseRuntimeSessionRequestV1(value);
    if (request.runtimeSessionId !== this.readyEvent.runtimeSessionId) {
      return rejectedReceipt(request, this.currentWorldSessionId, {
        code: "RUNTIME_SESSION_NOT_ACTIVE",
        message: "The Request belongs to another Runtime Session.",
      });
    }

    const lookup = this.wal.lookupRequest(request);
    if (lookup.status === "replay") return lookup.receipt;
    if (lookup.status === "conflict") {
      return rejectedReceipt(request, this.currentWorldSessionId, {
        code: "RUNTIME_SESSION_REQUEST_ID_CONFLICT",
        message: "The Request ID is already committed with different content.",
      });
    }
    if (this.state !== "active" || isNil(this.session)) {
      return rejectedReceipt(request, this.currentWorldSessionId, {
        code: "RUNTIME_SESSION_NOT_ACTIVE",
        message: "The Runtime Session is not active.",
      });
    }

    let receipt: RuntimeSessionReceiptV1;
    try {
      receipt = await this.invoke(request, this.session);
    } catch {
      return this.failOperation(request);
    }

    try {
      await this.hooks.afterRuntimeResult?.({ request, receipt });
    } catch (error) {
      this.state = "crashed";
      throw error;
    }

    try {
      this.wal.appendCommittedRequest({ request, receipt });
    } catch (error) {
      this.state = "failed";
      await this.disposeIgnoringFailure();
      throw new Error(
        "RUNTIME_SESSION_DURABILITY_FAILURE: Receipt could not be committed.",
        { cause: error },
      );
    }

    try {
      await this.hooks.afterCommittedRequest?.({ request, receipt });
    } catch (error) {
      this.state = "crashed";
      throw error;
    }

    if (request.type === "session.close") {
      this.state = "closed";
      this.wal.appendClosed(finalEvent(
        this.readyEvent,
        this.currentWorldSessionId,
        "completed",
      ));
    }
    return receipt;
  }

  private async terminateSerialized(
    diagnostic?: RuntimeSessionDiagnosticV1,
  ): Promise<RuntimeSessionFinalEventV1> {
    const durableFinalEvent = this.wal.snapshot().finalEvent;
    if (!isNil(durableFinalEvent)) return durableFinalEvent;

    let finalDiagnostic = diagnostic;
    try {
      await this.session?.dispose();
    } catch {
      finalDiagnostic ??= INTERNAL_FAILURE_DIAGNOSTIC;
    }
    const event = isNil(finalDiagnostic)
      ? finalEvent(this.readyEvent, this.currentWorldSessionId, "completed")
      : finalEvent(
        this.readyEvent,
        this.currentWorldSessionId,
        "failed",
        finalDiagnostic,
      );
    this.state = event.type === "completed" ? "closed" : "failed";
    this.wal.appendClosed(event);
    return event;
  }

  private async invoke(
    request: RuntimeSessionRequestV1,
    session: HeadlessRuntimeSessionV1,
  ): Promise<RuntimeSessionReceiptV1> {
    if (request.type === "gameplay-command.execute") {
      const gameplayCommandReceipt = await session.executeGameplayCommand(
        request.command,
      );
      if (gameplayCommandReceipt.status === "committed") {
        const snapshot = session.snapshot();
        if (
          snapshot.world.worldStateRef !==
            gameplayCommandReceipt.worldStateAfterRef ||
          snapshot.world.worldStateHash !==
            gameplayCommandReceipt.worldStateAfterHash ||
          snapshot.world.simulationTick !== gameplayCommandReceipt.simulationTick
        ) {
          throw new Error("RUNTIME_SESSION_PUBLICATION_RECEIPT_MISMATCH");
        }
      }
      return succeededReceipt(request, this.currentWorldSessionId, {
        gameplayCommandReceipt,
      });
    }
    if (request.type === "fixed-input.run") {
      const snapshot = await session.runFixedInput(request.input);
      return succeededReceipt(request, this.currentWorldSessionId, {
        snapshot,
      });
    }
    if (request.type === "snapshot.get") {
      return succeededReceipt(request, this.currentWorldSessionId, {
        snapshot: session.snapshot(),
      });
    }
    if (request.type === "events.get") {
      const requestedCount = request.query.maximumEventCount;
      const candidates = session.eventsAfter(
        request.query.afterEventSequence,
        requestedCount + 1,
      );
      const events = Object.freeze(candidates.slice(0, requestedCount));
      const last = events.at(-1);
      return succeededReceipt(request, this.currentWorldSessionId, {
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
      const previousWorldSessionId = this.currentWorldSessionId;
      const snapshot = await session.resetWithInitialControlBinding();
      if (
        snapshot.runtimeSessionId !== this.readyEvent.runtimeSessionId ||
        snapshot.worldSessionId === previousWorldSessionId ||
        snapshot.world.simulationTick !== 0
      ) throw new Error("RUNTIME_SESSION_RESET_IDENTITY_MISMATCH");
      this.currentWorldSessionId = snapshot.worldSessionId;
      return succeededReceipt(request, this.currentWorldSessionId, {
        snapshot,
      });
    }

    if (request.type === "subject-support.get") {
      const subjectSupport = session.readCommittedSubjectSupport(
        request.subjectEntityId,
        request.expectedSimulationTick,
      );
      if (isNil(subjectSupport)) {
        return rejectedReceipt(request, this.currentWorldSessionId, {
          code: "RUNTIME_SESSION_REQUEST_REJECTED",
          message:
            "Committed Subject support is stale, missing, ambiguous, or unregistered.",
        });
      }
      if (
        subjectSupport.runtimeSessionId !== this.readyEvent.runtimeSessionId ||
        subjectSupport.worldSessionId !== this.currentWorldSessionId ||
        subjectSupport.subjectEntityId !== request.subjectEntityId ||
        subjectSupport.simulationTick !== request.expectedSimulationTick
      ) throw new Error("RUNTIME_SESSION_SUBJECT_SUPPORT_IDENTITY_MISMATCH");
      return succeededReceipt(request, this.currentWorldSessionId, {
        subjectSupport,
      });
    }

    const closingWorldSessionId = this.currentWorldSessionId;
    await session.dispose();
    return succeededReceipt(request, closingWorldSessionId, {
      closeResult: Object.freeze({ mode: "closed" as const }),
    });
  }

  private async failOperation(
    request: RuntimeSessionRequestV1,
  ): Promise<RuntimeSessionReceiptV1> {
    this.state = "failed";
    const previousWorldSessionId = this.currentWorldSessionId;
    if (!isNil(this.session)) {
      this.currentWorldSessionId = this.session.currentWorldSessionId;
    }
    const diagnostic = request.type === "session.reset" &&
        this.currentWorldSessionId !== previousWorldSessionId
      ? RESET_COMMITTED_CLEANUP_FAILURE_DIAGNOSTIC
      : INTERNAL_FAILURE_DIAGNOSTIC;
    await this.disposeIgnoringFailure();
    const receipt = rejectedReceipt(
      request,
      this.currentWorldSessionId,
      diagnostic,
    );
    this.wal.appendCommittedRequest({ request, receipt });
    this.wal.appendClosed(finalEvent(
      this.readyEvent,
      this.currentWorldSessionId,
      "failed",
      diagnostic,
    ));
    return receipt;
  }

  private async disposeIgnoringFailure(): Promise<void> {
    try {
      await this.session?.dispose();
    } catch {
      // The terminal diagnostic intentionally stays provider-neutral and stable.
    }
  }
}

async function createExecutor(
  input: CreateRuntimeSessionExecutorInputV1,
  factories: RuntimeSessionExecutorFactoriesV1,
): Promise<RuntimeSessionExecutorV1> {
  assertNonEmptyString(input.packageDirectoryPath, "packageDirectoryPath");
  assertNonEmptyString(input.walFilePath, "walFilePath");
  assertNonEmptyString(input.runtimeSessionId, "runtimeSessionId");
  assertNonEmptyString(input.initialWorldSessionId, "initialWorldSessionId");
  const admitted = await factories.admitPackage(input.packageDirectoryPath);
  const session = await admitted.createSession({
    runtimeSessionId: input.runtimeSessionId,
    initialWorldSessionId: input.initialWorldSessionId,
  });
  const ready = readyEvent({
    runtimeSessionId: input.runtimeSessionId,
    worldSessionId: input.initialWorldSessionId,
    package: admitted,
    fixedInputControllerEntityId: session.fixedInputControllerEntityId,
  });
  try {
    assertSessionBinding(session, ready);
    const wal = createFileRuntimeSessionWalV1({
      walFilePath: input.walFilePath,
      readyEvent: ready,
    });
    return new RuntimeSessionExecutor(
      ready,
      wal,
      session,
      "active",
      ready.worldSessionId,
      factories,
    );
  } catch (error) {
    try {
      await session.dispose();
    } catch {
      // Preserve the creation failure as the primary diagnostic.
    }
    throw error;
  }
}

async function recoveryDiverged(
  ready: RuntimeSessionReadyEventV1,
  wal: FileRuntimeSessionWalV1,
  session: HeadlessRuntimeSessionV1,
  cause: unknown,
): Promise<never> {
  const currentWorldSessionId = wal.snapshot().committedRequests.reduce(
    (worldSessionId, entry) =>
      receiptCommitsNewWorldSessionV1(entry.request, entry.receipt)
        ? entry.receipt.worldSessionId
        : worldSessionId,
    ready.worldSessionId,
  );
  try {
    await session.dispose();
  } catch {
    // Recovery remains failed closed even when provider cleanup also throws.
  }
  try {
    wal.appendClosed(finalEvent(
      ready,
      currentWorldSessionId,
      "failed",
      RECOVERY_DIVERGED_DIAGNOSTIC,
    ));
  } catch {
    // Preserve the replay divergence as the primary diagnostic.
  }
  throw new Error(
    "RUNTIME_SESSION_RECOVERY_DIVERGED: Durable replay did not reproduce the committed Runtime result.",
    { cause },
  );
}

async function resumeExecutor(
  input: ResumeRuntimeSessionExecutorInputV1,
  factories: RuntimeSessionExecutorFactoriesV1,
): Promise<RuntimeSessionExecutorV1> {
  assertNonEmptyString(input.packageDirectoryPath, "packageDirectoryPath");
  assertNonEmptyString(input.walFilePath, "walFilePath");
  const wal = openFileRuntimeSessionWalV1({ walFilePath: input.walFilePath });
  const durable = wal.snapshot();
  const admitted = await factories.admitPackage(input.packageDirectoryPath);
  assertPackageBinding(admitted, durable.readyEvent);

  if (!isNil(durable.finalEvent)) {
    return new RuntimeSessionExecutor(
      durable.readyEvent,
      wal,
      undefined,
      durable.finalEvent.type === "completed" ? "closed" : "failed",
      durable.finalEvent.worldSessionId,
      factories,
    );
  }

  const session = await admitted.createSession({
    runtimeSessionId: durable.readyEvent.runtimeSessionId,
    initialWorldSessionId: durable.readyEvent.worldSessionId,
  });
  try {
    assertSessionBinding(session, durable.readyEvent);
  } catch (error) {
    await recoveryDiverged(durable.readyEvent, wal, session, error);
  }
  const executor = new RuntimeSessionExecutor(
    durable.readyEvent,
    wal,
    session,
    "active",
    durable.readyEvent.worldSessionId,
    factories,
  );

  for (const [index, entry] of durable.committedRequests.entries()) {
    const isLastCommittedRequest =
      index === durable.committedRequests.length - 1;
    if (
      entry.receipt.status === "rejected" &&
      entry.receipt.diagnostic.code !== "RUNTIME_SESSION_REQUEST_REJECTED"
    ) {
      await session.dispose().catch(() => undefined);
      wal.appendClosed(finalEvent(
        durable.readyEvent,
        entry.receipt.worldSessionId,
        "failed",
        entry.receipt.diagnostic,
      ));
      return new RuntimeSessionExecutor(
        durable.readyEvent,
        wal,
        undefined,
        "failed",
        entry.receipt.worldSessionId,
        factories,
      );
    }
    if (!isReplayMutation(entry.request)) continue;
    if (entry.request.type === "session.close" && !isLastCommittedRequest) {
      return recoveryDiverged(
        durable.readyEvent,
        wal,
        session,
        new Error("session.close is not the final committed Request."),
      );
    }
    let replayed: RuntimeSessionReceiptV1;
    try {
      replayed = await executor.replayCommitted(entry);
    } catch (error) {
      return recoveryDiverged(durable.readyEvent, wal, session, error);
    }
    if (
      canonicalRuntimeSessionReceiptV1(replayed) !==
        canonicalRuntimeSessionReceiptV1(entry.receipt)
    ) {
      return recoveryDiverged(
        durable.readyEvent,
        wal,
        session,
        new Error(`Request ${entry.request.id} replay bytes differ.`),
      );
    }
    if (entry.request.type === "session.close") {
      wal.appendClosed(finalEvent(
        durable.readyEvent,
        entry.receipt.worldSessionId,
        "completed",
      ));
      return new RuntimeSessionExecutor(
        durable.readyEvent,
        wal,
        undefined,
        "closed",
        entry.receipt.worldSessionId,
        factories,
      );
    }
  }
  return executor;
}

export function createRuntimeSessionExecutorV1(
  input: CreateRuntimeSessionExecutorInputV1,
): Promise<RuntimeSessionExecutorV1> {
  return createExecutor(input, DEFAULT_FACTORIES);
}

export function resumeRuntimeSessionExecutorV1(
  input: ResumeRuntimeSessionExecutorInputV1,
): Promise<RuntimeSessionExecutorV1> {
  return resumeExecutor(input, DEFAULT_FACTORIES);
}

export function createRuntimeSessionExecutorForTestV1(
  input: CreateRuntimeSessionExecutorInputV1,
  factories: RuntimeSessionExecutorFactoriesV1,
): Promise<RuntimeSessionExecutorV1> {
  return createExecutor(input, factories);
}

export function resumeRuntimeSessionExecutorForTestV1(
  input: ResumeRuntimeSessionExecutorInputV1,
  factories: RuntimeSessionExecutorFactoriesV1,
): Promise<RuntimeSessionExecutorV1> {
  return resumeExecutor(input, factories);
}
