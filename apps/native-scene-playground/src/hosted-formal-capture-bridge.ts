import type {
  FormalWorldCaptureRequestV1,
} from "@whitebox-world/runtime-contracts";
import type {
  FormalHostedWorldCapturePayloadV1,
} from "@whitebox-world/runtime-babylon";
import { isNil } from "lodash-es";
import {
  assertHostedFormalCaptureWireBudgetV1,
  exactPlainRecordV1,
  hostedFormalCaptureErrorV1,
  HOSTED_FORMAL_CAPTURE_BOOTSTRAP_FIELDS_V1,
  HOSTED_FORMAL_CAPTURE_FAILURE_FIELDS_V1,
  HOSTED_FORMAL_CAPTURE_RESULT_FIELDS_V1,
  parseHostedFormalCapturePayloadV1,
  parseHostedFormalCaptureRequestV1,
  type HostedFormalCaptureProtocolBudgetV1,
} from "./hosted-formal-capture-protocol.js";

type BridgePhaseV1 =
  | "bootstrapping"
  | "ready"
  | "capturing"
  | "completed"
  | "terminated"
  | "disposed";

type CredentiallessIframeV1 = HTMLIFrameElement & {
  credentialless: boolean;
};

export interface CreateHostedFormalCaptureBridgeInputV1 {
  readonly frame: HTMLIFrameElement;
  readonly runtimeOrigin: string;
  readonly runtimeSessionId: string;
  readonly sessionNonce: string;
  readonly formalRequestId: string;
  readonly formalRequestHash: `sha256:${string}`;
  readonly protocolBudget: HostedFormalCaptureProtocolBudgetV1;
}

export interface HostedFormalCaptureBridgeV1 {
  phase(): BridgePhaseV1;
  waitUntilReady(): Promise<void>;
  executeFormalCapture(
    request: FormalWorldCaptureRequestV1,
  ): Promise<FormalHostedWorldCapturePayloadV1>;
  dispose(): void;
}

class HostedFormalCaptureBridge implements HostedFormalCaptureBridgeV1 {
  #phase: BridgePhaseV1 = "bootstrapping";
  #port: MessagePort | undefined;
  #hasObservedInitialLoad = false;
  #hasSubmittedRequest = false;
  #terminalReason: string | undefined;
  #submittedRequest: FormalWorldCaptureRequestV1 | undefined;
  #readyPromise: Promise<void>;
  #resolveReady!: () => void;
  #rejectReady!: (error: Error) => void;
  #capturePromise: Promise<FormalHostedWorldCapturePayloadV1> | undefined;
  #resolveCapture!: (payload: FormalHostedWorldCapturePayloadV1) => void;
  #rejectCapture!: (error: Error) => void;
  readonly #frameConnectionTimer: ReturnType<typeof setInterval>;

  constructor(readonly input: CreateHostedFormalCaptureBridgeInputV1) {
    if (!("credentialless" in input.frame)) {
      throw hostedFormalCaptureErrorV1("CREDENTIALLESS_UNSUPPORTED");
    }
    const frame = input.frame as CredentiallessIframeV1;
    frame.credentialless = true;
    if (frame.credentialless !== true) {
      throw hostedFormalCaptureErrorV1("CREDENTIALLESS_UNSUPPORTED");
    }
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    this.#readyPromise = new Promise((resolve, reject) => {
      this.#resolveReady = resolve;
      this.#rejectReady = reject;
    });
    void this.#readyPromise.catch(() => undefined);
    window.addEventListener("message", this.onBootstrapMessage);
    frame.addEventListener("load", this.onFrameNavigation);
    this.#frameConnectionTimer = setInterval(() => {
      if (!this.input.frame.isConnected) this.terminate("FRAME_REMOVED");
    }, 10);
  }

  phase(): BridgePhaseV1 {
    return this.#phase;
  }

  waitUntilReady(): Promise<void> {
    if (!this.input.frame.isConnected) this.terminate("FRAME_REMOVED");
    if (this.#phase === "ready") return Promise.resolve();
    if (this.#phase === "terminated" || this.#phase === "disposed") {
      return Promise.reject(this.error(
        this.#terminalReason ?? this.#phase.toUpperCase(),
      ));
    }
    return this.#readyPromise;
  }

  executeFormalCapture(
    value: FormalWorldCaptureRequestV1,
  ): Promise<FormalHostedWorldCapturePayloadV1> {
    if (this.#phase === "disposed") {
      return Promise.reject(this.error("DISPOSED"));
    }
    if (this.#hasSubmittedRequest) {
      return Promise.reject(this.error("DUPLICATE_REQUEST"));
    }
    if (this.#phase !== "ready" || isNil(this.#port)) {
      return Promise.reject(this.error("NOT_READY"));
    }
    if (!this.input.frame.isConnected) {
      this.terminate("FRAME_REMOVED");
      return Promise.reject(this.error("FRAME_REMOVED"));
    }
    const request = parseHostedFormalCaptureRequestV1({
      value,
      formalRequestId: this.input.formalRequestId,
      formalRequestHash: this.input.formalRequestHash,
    });
    const envelope = Object.freeze({
      kind: "worldkit-hosted-formal-capture-request" as const,
      schemaVersion: 1 as const,
      runtimeSessionId: this.input.runtimeSessionId,
      sessionNonce: this.input.sessionNonce,
      formalRequestId: this.input.formalRequestId,
      formalRequestHash: this.input.formalRequestHash,
      messageSequence: 1 as const,
      payload: request,
    });
    try {
      assertHostedFormalCaptureWireBudgetV1(
        envelope,
        this.input.protocolBudget.maximumInboundMessageBytes,
        "INBOUND_BUDGET_EXCEEDED",
      );
    } catch (error) {
      this.terminate("INBOUND_BUDGET_EXCEEDED");
      return Promise.reject(error);
    }
    this.#hasSubmittedRequest = true;
    this.#submittedRequest = request;
    this.#phase = "capturing";
    this.#capturePromise = new Promise((resolve, reject) => {
      this.#resolveCapture = resolve;
      this.#rejectCapture = reject;
    });
    this.#port.postMessage(envelope);
    return this.#capturePromise;
  }

  dispose(): void {
    if (this.#phase === "disposed") return;
    this.close("DISPOSED", false);
    this.#phase = "disposed";
  }

  private readonly onBootstrapMessage = (event: MessageEvent): void => {
    if (this.#phase !== "bootstrapping") {
      this.terminate("DUPLICATE_BOOTSTRAP");
      return;
    }
    if (
      event.origin !== this.input.runtimeOrigin ||
      event.source !== this.input.frame.contentWindow
    ) {
      this.terminate("BOOTSTRAP_IDENTITY_MISMATCH");
      return;
    }
    try {
      const ready = exactPlainRecordV1(
        event.data,
        HOSTED_FORMAL_CAPTURE_BOOTSTRAP_FIELDS_V1,
        "BOOTSTRAP_SHAPE_INVALID",
      );
      if (
        ready.kind !== "worldkit-hosted-formal-capture-frame-ready" ||
        ready.schemaVersion !== 1 ||
        ready.runtimeSessionId !== this.input.runtimeSessionId ||
        ready.sessionNonce !== this.input.sessionNonce ||
        ready.formalRequestId !== this.input.formalRequestId ||
        ready.formalRequestHash !== this.input.formalRequestHash ||
        ready.messageSequence !== 1
      ) throw hostedFormalCaptureErrorV1("BOOTSTRAP_IDENTITY_MISMATCH");
    } catch {
      this.terminate("BOOTSTRAP_SCHEMA_INVALID");
      return;
    }
    const channel = new MessageChannel();
    this.#port = channel.port1;
    channel.port1.addEventListener("message", this.onPortMessage);
    channel.port1.start();
    window.removeEventListener("message", this.onBootstrapMessage);
    this.input.frame.contentWindow?.postMessage(Object.freeze({
      kind: "worldkit-hosted-formal-capture-port-transfer" as const,
      schemaVersion: 1 as const,
      runtimeSessionId: this.input.runtimeSessionId,
      sessionNonce: this.input.sessionNonce,
      formalRequestId: this.input.formalRequestId,
      formalRequestHash: this.input.formalRequestHash,
      messageSequence: 1 as const,
    }), this.input.runtimeOrigin, [channel.port2]);
  };

  private readonly onFrameNavigation = (): void => {
    if (!this.#hasObservedInitialLoad) {
      this.#hasObservedInitialLoad = true;
      return;
    }
    this.terminate("FRAME_NAVIGATED");
  };

  private readonly onPortMessage = (event: MessageEvent): void => {
    if (this.#phase === "terminated" || this.#phase === "disposed") return;
    try {
      assertHostedFormalCaptureWireBudgetV1(
        event.data,
        this.input.protocolBudget.maximumOutboundMessageBytes,
        "OUTBOUND_BUDGET_EXCEEDED",
      );
      if (this.#phase === "bootstrapping") {
        const ready = exactPlainRecordV1(
          event.data,
          HOSTED_FORMAL_CAPTURE_BOOTSTRAP_FIELDS_V1,
          "PORT_READY_SHAPE_INVALID",
        );
        if (
          ready.kind !== "worldkit-hosted-formal-capture-port-ready" ||
          ready.schemaVersion !== 1 ||
          ready.runtimeSessionId !== this.input.runtimeSessionId ||
          ready.sessionNonce !== this.input.sessionNonce ||
          ready.formalRequestId !== this.input.formalRequestId ||
          ready.formalRequestHash !== this.input.formalRequestHash ||
          ready.messageSequence !== 1
        ) throw hostedFormalCaptureErrorV1("PORT_READY_IDENTITY_INVALID");
        this.#phase = "ready";
        this.#resolveReady();
        return;
      }
      if (this.#phase !== "capturing") {
        throw hostedFormalCaptureErrorV1("DUPLICATE_RESULT");
      }
      const record = event.data as Readonly<Record<string, unknown>>;
      const fields = record.kind === "worldkit-hosted-formal-capture-result"
        ? HOSTED_FORMAL_CAPTURE_RESULT_FIELDS_V1
        : record.kind === "worldkit-hosted-formal-capture-failure"
          ? HOSTED_FORMAL_CAPTURE_FAILURE_FIELDS_V1
          : HOSTED_FORMAL_CAPTURE_BOOTSTRAP_FIELDS_V1;
      const result = exactPlainRecordV1(
        event.data,
        fields,
        "RESULT_SHAPE_INVALID",
      );
      if (
        result.schemaVersion !== 1 ||
        result.runtimeSessionId !== this.input.runtimeSessionId ||
        result.sessionNonce !== this.input.sessionNonce ||
        result.formalRequestId !== this.input.formalRequestId ||
        result.formalRequestHash !== this.input.formalRequestHash ||
        result.messageSequence !== 2
      ) throw hostedFormalCaptureErrorV1("RESULT_IDENTITY_INVALID");
      if (result.kind === "worldkit-hosted-formal-capture-failure") {
        if (
          result.diagnosticCode !==
            "WORLDKIT_HOSTED_FORMAL_CAPTURE_PROVIDER_REJECTED"
        ) throw hostedFormalCaptureErrorV1("RESULT_DIAGNOSTIC_INVALID");
        this.#phase = "completed";
        this.#rejectCapture(this.error("PROVIDER_REJECTED"));
        return;
      }
      if (result.kind !== "worldkit-hosted-formal-capture-result") {
        throw hostedFormalCaptureErrorV1("RESULT_DIRECTION_INVALID");
      }
      const payload = parseHostedFormalCapturePayloadV1({
        value: result.payload,
        runtimeSessionId: this.input.runtimeSessionId,
        request: this.#submittedRequest!,
        formalRequestHash: this.input.formalRequestHash,
        protocolBudget: this.input.protocolBudget,
      });
      this.#phase = "completed";
      this.#resolveCapture(payload);
    } catch (error) {
      const reason = error instanceof Error &&
          error.message.includes("PNG_BUDGET_EXCEEDED")
        ? "PNG_BUDGET_EXCEEDED"
        : "PORT_MESSAGE_INVALID";
      this.terminate(reason);
    }
  };

  private terminate(reason: string): void {
    if (this.#phase === "terminated" || this.#phase === "disposed") return;
    this.#terminalReason = reason;
    this.close(reason, true);
    this.#phase = "terminated";
  }

  private close(reason: string, removeFrame: boolean): void {
    clearInterval(this.#frameConnectionTimer);
    window.removeEventListener("message", this.onBootstrapMessage);
    this.input.frame.removeEventListener("load", this.onFrameNavigation);
    this.#port?.removeEventListener("message", this.onPortMessage);
    this.#port?.close();
    const error = this.error(reason);
    this.#rejectReady(error);
    this.#rejectCapture?.(error);
    if (removeFrame) this.input.frame.remove();
  }

  private error(reason: string): Error {
    return hostedFormalCaptureErrorV1(`BRIDGE_${reason}`);
  }
}

export function createHostedFormalCaptureBridgeV1(
  input: CreateHostedFormalCaptureBridgeInputV1,
): HostedFormalCaptureBridgeV1 {
  const runtimeUrl = new URL(input.runtimeOrigin);
  if (
    runtimeUrl.origin !== input.runtimeOrigin ||
    (runtimeUrl.protocol !== "http:" && runtimeUrl.protocol !== "https:")
  ) throw hostedFormalCaptureErrorV1("ORIGIN_MUST_BE_EXACT");
  if (
    typeof globalThis.location === "object" &&
    globalThis.location.origin === runtimeUrl.origin
  ) throw hostedFormalCaptureErrorV1("ORIGIN_MUST_BE_CROSS_ORIGIN");
  return Object.freeze(new HostedFormalCaptureBridge(input));
}
