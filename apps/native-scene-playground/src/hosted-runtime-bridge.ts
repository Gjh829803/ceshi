import {
  parseNativeIsolationTransportEnvelopeV1,
  parseRuntimeSessionRequestV1,
  type NativeEffectiveExecutionBudgetV1,
  type NativeIsolationTransportEnvelopeV1,
  type RuntimeSessionEventV1,
  type RuntimeSessionReceiptV1,
  type RuntimeSessionRequestV1,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

const FRAME_READY_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "runtimeSessionId",
  "sessionNonce",
  "messageSequence",
] as const);

type ProtocolBudgetV1 = NativeEffectiveExecutionBudgetV1["protocol"];
type BridgePhaseV1 = "bootstrapping" | "ready" | "terminated" | "disposed";

interface HostedRuntimeFrameReadyV1 {
  readonly kind: "worldkit-hosted-runtime-frame-ready";
  readonly schemaVersion: 1;
  readonly runtimeSessionId: string;
  readonly sessionNonce: string;
  readonly messageSequence: 1;
}

export interface CreateHostedRuntimeBridgeInputV1 {
  readonly frame: HTMLIFrameElement;
  readonly runtimeOrigin: string;
  readonly runtimeSessionId: string;
  readonly sessionNonce: string;
  readonly protocolBudget: ProtocolBudgetV1;
}

export interface HostedRuntimeBridgeV1 {
  phase(): BridgePhaseV1;
  waitUntilReady(): Promise<RuntimeSessionEventV1>;
  submit(request: RuntimeSessionRequestV1): Promise<RuntimeSessionReceiptV1>;
  dispose(): void;
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function parseFrameReady(
  value: unknown,
  runtimeSessionId: string,
  sessionNonce: string,
): HostedRuntimeFrameReadyV1 {
  if (typeof value !== "object" || isNil(value) || Array.isArray(value)) {
    throw new RangeError("HOSTED_RUNTIME_FRAME_READY_INVALID");
  }
  const record = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(record);
  if (
    keys.length !== FRAME_READY_FIELDS.length ||
    keys.some((key) =>
      typeof key !== "string" || !FRAME_READY_FIELDS.includes(
        key as typeof FRAME_READY_FIELDS[number],
      )
    ) ||
    record.kind !== "worldkit-hosted-runtime-frame-ready" ||
    record.schemaVersion !== 1 ||
    record.runtimeSessionId !== runtimeSessionId ||
    record.sessionNonce !== sessionNonce ||
    record.messageSequence !== 1
  ) throw new RangeError("HOSTED_RUNTIME_FRAME_READY_INVALID");
  return Object.freeze(record as unknown as HostedRuntimeFrameReadyV1);
}

class HostedRuntimeBridge implements HostedRuntimeBridgeV1 {
  #phase: BridgePhaseV1 = "bootstrapping";
  #port: MessagePort | undefined;
  #nextOutboundSequence = 1;
  #nextInboundSequence = 2;
  #readyEvent: RuntimeSessionEventV1 | undefined;
  readonly #readyWaiters: Array<Readonly<{
    resolve: (event: RuntimeSessionEventV1) => void;
    reject: (error: Error) => void;
  }>> = [];
  readonly #pending = new Map<string, Readonly<{
    resolve: (receipt: RuntimeSessionReceiptV1) => void;
    reject: (error: Error) => void;
  }>>();

  constructor(readonly input: CreateHostedRuntimeBridgeInputV1) {
    input.frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    Reflect.set(input.frame, "credentialless", true);
    window.addEventListener("message", this.onBootstrapMessage);
  }

  phase(): BridgePhaseV1 {
    return this.#phase;
  }

  waitUntilReady(): Promise<RuntimeSessionEventV1> {
    if (!isNil(this.#readyEvent)) return Promise.resolve(this.#readyEvent);
    if (this.#phase === "terminated" || this.#phase === "disposed") {
      return Promise.reject(this.error(this.#phase.toUpperCase()));
    }
    return new Promise((resolve, reject) => {
      this.#readyWaiters.push(Object.freeze({ resolve, reject }));
    });
  }

  async submit(
    value: RuntimeSessionRequestV1,
  ): Promise<RuntimeSessionReceiptV1> {
    if (this.#phase === "disposed") throw this.error("DISPOSED");
    if (this.#phase !== "ready" || isNil(this.#port)) {
      throw this.error("NOT_READY");
    }
    if (!this.input.frame.isConnected) {
      this.terminate("FRAME_REMOVED");
      throw this.error("FRAME_REMOVED");
    }
    const request = parseRuntimeSessionRequestV1(value);
    if (request.runtimeSessionId !== this.input.runtimeSessionId) {
      this.terminate("IDENTITY_MISMATCH");
      throw this.error("IDENTITY_MISMATCH");
    }
    const envelope = Object.freeze({
      kind: "native-isolation-transport-envelope" as const,
      schemaVersion: 1 as const,
      runtimeSessionId: this.input.runtimeSessionId,
      sessionNonce: this.input.sessionNonce,
      messageSequence: this.#nextOutboundSequence,
      payload: request,
    });
    const parsed = parseNativeIsolationTransportEnvelopeV1(envelope);
    if (byteLength(parsed) > this.input.protocolBudget.maximumOutboundMessageBytes) {
      this.terminate("OUTBOUND_BUDGET_EXCEEDED");
      throw this.error("OUTBOUND_BUDGET_EXCEEDED");
    }
    this.#nextOutboundSequence += 1;
    const response = new Promise<RuntimeSessionReceiptV1>((resolve, reject) => {
      this.#pending.set(request.id, Object.freeze({ resolve, reject }));
    });
    this.#port.postMessage(parsed);
    return response;
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
      parseFrameReady(
        event.data,
        this.input.runtimeSessionId,
        this.input.sessionNonce,
      );
    } catch {
      this.terminate("BOOTSTRAP_SCHEMA_INVALID");
      return;
    }
    const channel = new MessageChannel();
    this.#port = channel.port1;
    channel.port1.addEventListener("message", this.onPortMessage);
    channel.port1.start();
    window.removeEventListener("message", this.onBootstrapMessage);
    this.input.frame.addEventListener("load", this.onFrameNavigation);
    this.input.frame.contentWindow?.postMessage(Object.freeze({
      kind: "worldkit-hosted-runtime-port-transfer" as const,
      schemaVersion: 1 as const,
      runtimeSessionId: this.input.runtimeSessionId,
      sessionNonce: this.input.sessionNonce,
      messageSequence: 1 as const,
    }), this.input.runtimeOrigin, [channel.port2]);
  };

  private readonly onFrameNavigation = (): void => {
    this.terminate("FRAME_NAVIGATED");
  };

  private readonly onPortMessage = (event: MessageEvent): void => {
    if (this.#phase === "terminated" || this.#phase === "disposed") return;
    if (byteLength(event.data) > this.input.protocolBudget.maximumInboundMessageBytes) {
      this.terminate("INBOUND_BUDGET_EXCEEDED");
      return;
    }
    let envelope: NativeIsolationTransportEnvelopeV1;
    try {
      envelope = parseNativeIsolationTransportEnvelopeV1(event.data);
    } catch {
      this.terminate("ENVELOPE_INVALID");
      return;
    }
    if (
      envelope.runtimeSessionId !== this.input.runtimeSessionId ||
      envelope.sessionNonce !== this.input.sessionNonce ||
      envelope.messageSequence !== this.#nextInboundSequence
    ) {
      this.terminate("ENVELOPE_IDENTITY_OR_SEQUENCE_INVALID");
      return;
    }
    this.#nextInboundSequence += 1;
    if (envelope.payload.kind === "worldkit-runtime-session-event") {
      if (envelope.payload.type !== "ready" || !isNil(this.#readyEvent)) {
        this.terminate("RUNTIME_EVENT_PHASE_INVALID");
        return;
      }
      this.#readyEvent = envelope.payload;
      this.#phase = "ready";
      for (const waiter of this.#readyWaiters.splice(0)) {
        waiter.resolve(envelope.payload);
      }
      return;
    }
    if (envelope.payload.kind !== "worldkit-runtime-session-receipt") {
      this.terminate("RUNTIME_PAYLOAD_DIRECTION_INVALID");
      return;
    }
    if (byteLength(envelope.payload) > this.input.protocolBudget.maximumReceiptBytes) {
      this.terminate("RECEIPT_BUDGET_EXCEEDED");
      return;
    }
    const pending = this.#pending.get(envelope.payload.requestId);
    if (isNil(pending)) {
      this.terminate("RECEIPT_REQUEST_UNKNOWN");
      return;
    }
    this.#pending.delete(envelope.payload.requestId);
    pending.resolve(envelope.payload);
    if (envelope.payload.requestType === "session.close") {
      this.close("SESSION_CLOSED", true);
      this.#phase = "disposed";
    }
  };

  private terminate(reason: string): void {
    if (this.#phase === "terminated" || this.#phase === "disposed") return;
    this.close(reason, true);
    this.#phase = "terminated";
  }

  private close(reason: string, removeFrame: boolean): void {
    window.removeEventListener("message", this.onBootstrapMessage);
    this.input.frame.removeEventListener("load", this.onFrameNavigation);
    this.#port?.removeEventListener("message", this.onPortMessage);
    this.#port?.close();
    const error = this.error(reason);
    for (const waiter of this.#readyWaiters.splice(0)) waiter.reject(error);
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
    if (removeFrame) this.input.frame.remove();
  }

  private error(reason: string): Error {
    return new Error(`WORLDKIT_HOSTED_RUNTIME_BRIDGE_${reason}`);
  }
}

export function createHostedRuntimeBridgeV1(
  input: CreateHostedRuntimeBridgeInputV1,
): HostedRuntimeBridgeV1 {
  const runtimeUrl = new URL(input.runtimeOrigin);
  if (runtimeUrl.origin !== input.runtimeOrigin) {
    throw new RangeError("HOSTED_RUNTIME_ORIGIN_MUST_BE_EXACT");
  }
  if (
    typeof globalThis.location === "object" &&
    globalThis.location.origin === runtimeUrl.origin
  ) throw new RangeError("HOSTED_RUNTIME_ORIGIN_MUST_BE_CROSS_ORIGIN");
  return Object.freeze(new HostedRuntimeBridge(input));
}
