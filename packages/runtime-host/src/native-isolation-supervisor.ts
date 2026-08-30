import {
  parseNativeIsolatedExecutionRequestV1,
  parseNativeIsolatedExecutionResultV1,
  parseNativeIsolationTransportEnvelopeV1,
  verifyNativeIsolatedExecutionReceiptV1,
  type NativeIsolatedExecutionReceiptV1,
  type NativeIsolatedExecutionRequestV1,
  type NativeIsolatedExecutionResultV1,
  type NativeIsolationTerminationReasonV1,
  type NativeIsolationTransportEnvelopeV1,
} from "@whitebox-world/runtime-contracts";

export type NativeIsolationSupervisorErrorCodeV1 =
  | "NATIVE_ISOLATION_PROVIDER_IDENTITY_MISMATCH"
  | "NATIVE_ISOLATION_LIFECYCLE_INVALID"
  | "NATIVE_ISOLATION_PROTOCOL_INVALID"
  | "NATIVE_ISOLATION_PROVIDER_FAILED"
  | "NATIVE_ISOLATION_RECEIPT_INVALID"
  | "NATIVE_ISOLATION_ATTESTATION_REJECTED"
  | "NATIVE_ISOLATION_CLEANUP_FAILED";

export class NativeIsolationSupervisorErrorV1 extends Error {
  readonly code: NativeIsolationSupervisorErrorCodeV1;
  readonly diagnosticCode: string | undefined;

  constructor(
    code: NativeIsolationSupervisorErrorCodeV1,
    message: string,
    diagnosticCode?: string,
  ) {
    super(message);
    this.name = "NativeIsolationSupervisorErrorV1";
    this.code = code;
    this.diagnosticCode = diagnosticCode;
  }
}

export interface NativeIsolationAttestationVerifierV1 {
  verify(input: Readonly<{
    receipt: NativeIsolatedExecutionReceiptV1;
    attestationBytes: Uint8Array;
  }>): Promise<
    | Readonly<{ status: "verified" }>
    | Readonly<{ status: "rejected"; diagnosticCode: string }>
  >;
}

export interface NativeIsolationReceiptEvidenceV1 {
  readonly result: NativeIsolatedExecutionResultV1;
  readonly receipt: NativeIsolatedExecutionReceiptV1;
  readonly attestationBytes: Uint8Array;
}

export interface PreparedNativeIsolationV1 {
  start(): Promise<NativeIsolatedExecutionResultV1>;
  submit(
    envelope: NativeIsolationTransportEnvelopeV1,
  ): Promise<NativeIsolationTransportEnvelopeV1>;
  terminate(
    reason: NativeIsolationTerminationReasonV1,
  ): Promise<NativeIsolatedExecutionResultV1>;
  dispose(): Promise<void>;
  collectReceipt(): Promise<NativeIsolationReceiptEvidenceV1>;
}

export interface NativeIsolationProviderV1 {
  readonly runnerIdentityRef: string;
  prepare(
    request: NativeIsolatedExecutionRequestV1,
    cancellationSignal: AbortSignal,
  ): Promise<PreparedNativeIsolationV1>;
}

export interface NativeIsolationDeadlineSchedulerV1 {
  schedule(delayMilliseconds: number, callback: () => void): () => void;
}

export interface CreateNativeIsolationSupervisorInputV1 {
  readonly request: unknown;
  readonly provider: NativeIsolationProviderV1;
  readonly attestationVerifier: NativeIsolationAttestationVerifierV1;
  readonly deadlineScheduler?: NativeIsolationDeadlineSchedulerV1;
}

type SupervisorPhaseV1 =
  | "requested"
  | "provisioning"
  | "starting"
  | "ready"
  | "terminating"
  | "disposed"
  | "quarantined";

function createDefaultDeadlineScheduler(): NativeIsolationDeadlineSchedulerV1 {
  return Object.freeze({
    schedule(delayMilliseconds: number, callback: () => void): () => void {
      const handle = setTimeout(callback, delayMilliseconds);
      return () => clearTimeout(handle);
    },
  });
}

function terminationResult(
  request: NativeIsolatedExecutionRequestV1,
  reason: NativeIsolationTerminationReasonV1,
): NativeIsolatedExecutionResultV1 {
  return Object.freeze({
    kind: "native-isolated-execution-result" as const,
    schemaVersion: 1 as const,
    id: `native-isolated-execution-result.${request.id}.${reason}`,
    requestId: request.id,
    runtimeSessionId: request.runtimeSessionId,
    status: "terminated" as const,
    reason,
  });
}

function messageBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function lifecycleError(): NativeIsolationSupervisorErrorV1 {
  return new NativeIsolationSupervisorErrorV1(
    "NATIVE_ISOLATION_LIFECYCLE_INVALID",
    "Native isolation operation is not allowed in the current lifecycle phase.",
  );
}

export class NativeIsolationSupervisorV1 {
  static create(input: CreateNativeIsolationSupervisorInputV1):
    NativeIsolationSupervisorV1 {
    const request = parseNativeIsolatedExecutionRequestV1(input.request);
    if (input.provider.runnerIdentityRef !== request.runnerIdentityRef) {
      throw new NativeIsolationSupervisorErrorV1(
        "NATIVE_ISOLATION_PROVIDER_IDENTITY_MISMATCH",
        "Native isolation provider identity does not match the admitted request.",
      );
    }
    return new NativeIsolationSupervisorV1(
      request,
      input.provider,
      input.attestationVerifier,
      input.deadlineScheduler ?? createDefaultDeadlineScheduler(),
    );
  }

  private phase: SupervisorPhaseV1 = "requested";
  private prepared?: PreparedNativeIsolationV1;
  private startPromise?: Promise<NativeIsolatedExecutionResultV1>;
  private terminalPromise?: Promise<NativeIsolatedExecutionResultV1>;
  private terminalResult?: NativeIsolatedExecutionResultV1;
  private terminalReceipt?: NativeIsolatedExecutionReceiptV1;
  private pendingTerminationReason?: NativeIsolationTerminationReasonV1;
  private cancelDeadline?: () => void;
  private inputSequence = 0;
  private isProviderDisposed = false;
  private readonly cancellationController = new AbortController();
  private resolveTerminationSignal?: (
    result: NativeIsolatedExecutionResultV1,
  ) => void;
  private readonly terminationSignal =
    new Promise<NativeIsolatedExecutionResultV1>((resolve) => {
      this.resolveTerminationSignal = resolve;
    });

  private constructor(
    private readonly request: NativeIsolatedExecutionRequestV1,
    private readonly provider: NativeIsolationProviderV1,
    private readonly attestationVerifier: NativeIsolationAttestationVerifierV1,
    private readonly deadlineScheduler: NativeIsolationDeadlineSchedulerV1,
  ) {}

  async start(): Promise<NativeIsolatedExecutionResultV1> {
    if (this.phase !== "requested" || this.startPromise !== undefined) {
      throw lifecycleError();
    }
    this.startPromise = this.startInternal();
    return this.startPromise;
  }

  private async startInternal(): Promise<NativeIsolatedExecutionResultV1> {
    this.phase = "provisioning";
    this.cancelDeadline = this.deadlineScheduler.schedule(
      this.request.effectiveBudget.process.maximumWallTimeMilliseconds,
      () => this.signalTermination("timeout"),
    );
    try {
      this.prepared = await this.provider.prepare(
        this.request,
        this.cancellationController.signal,
      );
    } catch {
      this.cancelDeadline?.();
      this.phase = "quarantined";
      throw new NativeIsolationSupervisorErrorV1(
        "NATIVE_ISOLATION_PROVIDER_FAILED",
        "Native isolation provider failed during provisioning.",
      );
    }
    if (this.pendingTerminationReason !== undefined) {
      return this.finalizeTerminal(terminationResult(
        this.request,
        this.pendingTerminationReason,
      ));
    }
    this.phase = "starting";
    let providerStart: Promise<NativeIsolatedExecutionResultV1>;
    try {
      providerStart = this.prepared.start();
    } catch {
      providerStart = Promise.reject(new Error("provider start failed"));
    }
    let result: NativeIsolatedExecutionResultV1;
    try {
      result = parseNativeIsolatedExecutionResultV1(await Promise.race([
        providerStart,
        this.terminationSignal,
      ]));
    } catch {
      this.signalTermination("provider-lost");
      result = terminationResult(this.request, "provider-lost");
    }
    if (
      result.requestId !== this.request.id ||
      result.runtimeSessionId !== this.request.runtimeSessionId
    ) {
      this.signalTermination("protocol-violation");
      return this.finalizeTerminal(terminationResult(
        this.request,
        "protocol-violation",
      ));
    }
    if (result.status === "ready") {
      if (this.pendingTerminationReason !== undefined) {
        return this.finalizeTerminal(terminationResult(
          this.request,
          this.pendingTerminationReason,
        ));
      }
      this.phase = "ready";
      return result;
    }
    return this.finalizeTerminal(result);
  }

  private signalTermination(reason: NativeIsolationTerminationReasonV1): void {
    if (
      this.phase === "disposed" ||
      this.phase === "quarantined" ||
      this.terminalResult !== undefined ||
      this.pendingTerminationReason !== undefined
    ) return;
    this.pendingTerminationReason = reason;
    this.cancellationController.abort(reason);
    const result = terminationResult(this.request, reason);
    this.resolveTerminationSignal?.(result);
    if (this.phase === "ready") {
      void this.finalizeTerminal(result).catch(() => undefined);
    }
  }

  private finalizeTerminal(
    result: NativeIsolatedExecutionResultV1,
  ): Promise<NativeIsolatedExecutionResultV1> {
    if (this.terminalPromise !== undefined) return this.terminalPromise;
    this.terminalPromise = this.finalizeTerminalInternal(result);
    return this.terminalPromise;
  }

  private async finalizeTerminalInternal(
    resultInput: NativeIsolatedExecutionResultV1,
  ): Promise<NativeIsolatedExecutionResultV1> {
    let result = parseNativeIsolatedExecutionResultV1(resultInput);
    if (result.status === "ready") throw lifecycleError();
    this.phase = "terminating";
    this.cancelDeadline?.();
    const prepared = this.prepared;
    if (prepared === undefined) {
      this.phase = "quarantined";
      throw new NativeIsolationSupervisorErrorV1(
        "NATIVE_ISOLATION_CLEANUP_FAILED",
        "Native isolation terminated without an acquired provider domain.",
      );
    }
    let cleanupFailed = false;
    try {
      if (result.status === "terminated") {
        const providerResult = parseNativeIsolatedExecutionResultV1(
          await prepared.terminate(result.reason),
        );
        if (
          providerResult.status !== "terminated" ||
          providerResult.reason !== result.reason ||
          providerResult.requestId !== this.request.id ||
          providerResult.runtimeSessionId !== this.request.runtimeSessionId
        ) {
          throw new Error("invalid provider termination result");
        }
        result = providerResult;
      }
      if (!this.isProviderDisposed) {
        this.isProviderDisposed = true;
        await prepared.dispose();
      }
    } catch {
      cleanupFailed = true;
    }

    let evidence: NativeIsolationReceiptEvidenceV1;
    try {
      evidence = await prepared.collectReceipt();
      if (
        messageBytes(evidence.receipt) >
          this.request.effectiveBudget.protocol.maximumReceiptBytes
      ) throw new Error("receipt too large");
      const evidenceResult = parseNativeIsolatedExecutionResultV1(
        evidence.result,
      );
      if (
        evidenceResult.status === "ready" ||
        evidenceResult.requestId !== this.request.id ||
        evidenceResult.runtimeSessionId !== this.request.runtimeSessionId ||
        (cleanupFailed && evidenceResult.status !== "cleanup-failed")
      ) throw new Error("invalid terminal evidence result");
      const receipt = verifyNativeIsolatedExecutionReceiptV1({
        request: this.request,
        result: evidenceResult,
        receipt: evidence.receipt,
      });
      const verification = await this.attestationVerifier.verify({
        receipt,
        attestationBytes: new Uint8Array(evidence.attestationBytes),
      });
      if (verification.status === "rejected") {
        this.phase = "quarantined";
        throw new NativeIsolationSupervisorErrorV1(
          "NATIVE_ISOLATION_ATTESTATION_REJECTED",
          "Native isolation control-plane attestation was rejected.",
          verification.diagnosticCode,
        );
      }
      this.terminalReceipt = receipt;
      result = evidenceResult;
    } catch (error) {
      if (error instanceof NativeIsolationSupervisorErrorV1) throw error;
      this.phase = "quarantined";
      throw new NativeIsolationSupervisorErrorV1(
        cleanupFailed
          ? "NATIVE_ISOLATION_CLEANUP_FAILED"
          : "NATIVE_ISOLATION_RECEIPT_INVALID",
        cleanupFailed
          ? "Native isolation provider cleanup failed without valid quarantine evidence."
          : "Native isolation terminal receipt is missing or invalid.",
      );
    }
    this.terminalResult = result;
    this.phase = result.status === "cleanup-failed" ? "quarantined" : "disposed";
    return result;
  }

  async submit(input: unknown): Promise<NativeIsolationTransportEnvelopeV1> {
    if (this.phase !== "ready" || this.prepared === undefined) {
      throw lifecycleError();
    }
    let envelope: NativeIsolationTransportEnvelopeV1;
    try {
      envelope = parseNativeIsolationTransportEnvelopeV1(input);
    } catch {
      return this.rejectProtocol();
    }
    if (
      envelope.runtimeSessionId !== this.request.runtimeSessionId ||
      envelope.sessionNonce !== this.request.sessionNonce ||
      envelope.messageSequence !== this.inputSequence + 1 ||
      messageBytes(envelope) >
        this.request.effectiveBudget.protocol.maximumInboundMessageBytes
    ) return this.rejectProtocol();
    this.inputSequence = envelope.messageSequence;
    let responseInput: unknown;
    try {
      responseInput = await this.prepared.submit(envelope);
    } catch {
      return this.rejectProviderLost();
    }
    let response: NativeIsolationTransportEnvelopeV1;
    try {
      response = parseNativeIsolationTransportEnvelopeV1(responseInput);
    } catch {
      return this.rejectProtocol();
    }
    if (
      response.runtimeSessionId !== this.request.runtimeSessionId ||
      response.sessionNonce !== this.request.sessionNonce ||
      response.messageSequence !== envelope.messageSequence ||
      messageBytes(response) >
        this.request.effectiveBudget.protocol.maximumOutboundMessageBytes
    ) return this.rejectProtocol();
    return response;
  }

  private async rejectProtocol(): Promise<never> {
    this.signalTermination("protocol-violation");
    await this.finalizeTerminal(terminationResult(
      this.request,
      "protocol-violation",
    ));
    throw new NativeIsolationSupervisorErrorV1(
      "NATIVE_ISOLATION_PROTOCOL_INVALID",
      "Native isolation transport message violated the admitted protocol.",
    );
  }

  private async rejectProviderLost(): Promise<never> {
    this.signalTermination("provider-lost");
    await this.finalizeTerminal(terminationResult(
      this.request,
      "provider-lost",
    ));
    throw new NativeIsolationSupervisorErrorV1(
      "NATIVE_ISOLATION_PROVIDER_FAILED",
      "Native isolation provider was lost while processing a protocol message.",
    );
  }

  async terminate(reason: NativeIsolationTerminationReasonV1): Promise<void> {
    if (this.phase === "disposed" || this.phase === "quarantined") return;
    if (this.phase === "requested") throw lifecycleError();
    this.signalTermination(reason);
    if (this.prepared !== undefined) {
      await this.finalizeTerminal(terminationResult(
        this.request,
        this.pendingTerminationReason ?? reason,
      ));
    }
  }

  async dispose(): Promise<void> {
    if (this.phase === "disposed" || this.phase === "quarantined") return;
    if (this.phase === "requested") {
      this.cancelDeadline?.();
      this.phase = "disposed";
      return;
    }
    await this.terminate("host-cancelled");
  }
}
