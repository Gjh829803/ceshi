import {
  parseNativeIsolationTransportEnvelopeV1,
  parseRuntimeSessionEventV1,
  type NativeEffectiveExecutionBudgetV1,
  type RuntimeSessionEventV1,
} from "@whitebox-world/runtime-contracts";
import type {
  BabylonNativeIsolatedRuntimeEntryV1,
} from "@whitebox-world/runtime-babylon";
import { isNil } from "lodash-es";
import { attachHostedRecordingServer } from "./hosted-recording.js";

const PORT_TRANSFER_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "runtimeSessionId",
  "sessionNonce",
  "messageSequence",
] as const);

export interface StartHostedRuntimeFrameInputV1 {
  readonly entry: BabylonNativeIsolatedRuntimeEntryV1;
  readonly readyEvent: RuntimeSessionEventV1;
  readonly shellOrigin: string;
  readonly runtimeSessionId: string;
  readonly sessionNonce: string;
  readonly protocolBudget: NativeEffectiveExecutionBudgetV1["protocol"];
  readonly createRecorder?: Parameters<typeof attachHostedRecordingServer>[1];
  readonly onBeforeReset?: () => void;
}

export interface HostedRuntimeFrameV1 {
  isDisposed(): boolean;
  dispose(): Promise<void>;
}

export function prepareHostedRuntimeFrameDocumentV1(
  frameDocument: Document,
): void {
  frameDocument.documentElement.classList.add("hosted-runtime-surface");
  for (const element of frameDocument.querySelectorAll(
    "[data-worldkit-shell-chrome]",
  )) {
    element.remove();
  }
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function hasExactTransferShape(value: unknown): boolean {
  if (typeof value !== "object" || isNil(value) || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(record);
  return keys.length === PORT_TRANSFER_FIELDS.length && keys.every((key) =>
    typeof key === "string" && PORT_TRANSFER_FIELDS.includes(
      key as typeof PORT_TRANSFER_FIELDS[number],
    )
  );
}

export function startHostedRuntimeFrameV1(
  input: StartHostedRuntimeFrameInputV1,
): HostedRuntimeFrameV1 {
  if (window.parent === window) {
    throw new Error("WORLDKIT_HOSTED_RUNTIME_FRAME_PARENT_REQUIRED");
  }
  if (new URL(input.shellOrigin).origin !== input.shellOrigin) {
    throw new Error("WORLDKIT_HOSTED_RUNTIME_SHELL_ORIGIN_INVALID");
  }
  if (
    input.entry.runtimeSessionId !== input.runtimeSessionId ||
    input.readyEvent.runtimeSessionId !== input.runtimeSessionId ||
    input.readyEvent.type !== "ready"
  ) throw new Error("WORLDKIT_HOSTED_RUNTIME_FRAME_IDENTITY_MISMATCH");

  let port: MessagePort | undefined;
  let recording: ReturnType<typeof attachHostedRecordingServer> | undefined;
  let disposed = false;
  let nextInboundSequence = 1;
  let nextOutboundSequence = 2;
  let tail = Promise.resolve();

  const terminate = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("message", onTransfer);
    port?.close();
    recording?.dispose();
    await input.entry.dispose().catch(() => undefined);
  };

  const onPortMessage = (event: MessageEvent): void => {
    if (disposed || isNil(port)) return;
    if (byteLength(event.data) > input.protocolBudget.maximumInboundMessageBytes) {
      void terminate();
      return;
    }
    let envelope;
    try {
      envelope = parseNativeIsolationTransportEnvelopeV1(event.data);
    } catch {
      void terminate();
      return;
    }
    if (
      envelope.runtimeSessionId !== input.runtimeSessionId ||
      envelope.sessionNonce !== input.sessionNonce ||
      envelope.messageSequence !== nextInboundSequence ||
      envelope.payload.kind !== "worldkit-runtime-session-request"
    ) {
      void terminate();
      return;
    }
    const request = envelope.payload;
    nextInboundSequence += 1;
    tail = tail.then(async () => {
      if (disposed || isNil(port)) return;
      if (request.type === "session.reset") input.onBeforeReset?.();
      const receipt = await input.entry.submit(request);
      const outgoing = parseNativeIsolationTransportEnvelopeV1({
        kind: "native-isolation-transport-envelope",
        schemaVersion: 1,
        runtimeSessionId: input.runtimeSessionId,
        sessionNonce: input.sessionNonce,
        messageSequence: nextOutboundSequence,
        payload: receipt,
      });
      if (
        byteLength(receipt) > input.protocolBudget.maximumReceiptBytes ||
        byteLength(outgoing) > input.protocolBudget.maximumOutboundMessageBytes
      ) {
        await terminate();
        return;
      }
      nextOutboundSequence += 1;
      port.postMessage(outgoing);
      if (receipt.requestType === "session.close") await terminate();
    }).catch(() => terminate());
  };

  const onTransfer = (event: MessageEvent): void => {
    if (
      !isNil(port) ||
      event.origin !== input.shellOrigin ||
      event.source !== window.parent ||
      event.ports.length !== (input.createRecorder === undefined ? 1 : 2) ||
      !hasExactTransferShape(event.data)
    ) {
      void terminate();
      return;
    }
    const transfer = event.data as Record<string, unknown>;
    if (
      transfer.kind !== "worldkit-hosted-runtime-port-transfer" ||
      transfer.schemaVersion !== 1 ||
      transfer.runtimeSessionId !== input.runtimeSessionId ||
      transfer.sessionNonce !== input.sessionNonce ||
      transfer.messageSequence !== 1
    ) {
      void terminate();
      return;
    }
    const transferredPort = event.ports[0];
    if (isNil(transferredPort)) {
      void terminate();
      return;
    }
    port = transferredPort;
    if (input.createRecorder !== undefined) {
      recording = attachHostedRecordingServer(event.ports[1]!, input.createRecorder);
    }
    window.removeEventListener("message", onTransfer);
    transferredPort.addEventListener("message", onPortMessage);
    transferredPort.start();
    const ready = parseRuntimeSessionEventV1(input.readyEvent);
    transferredPort.postMessage(parseNativeIsolationTransportEnvelopeV1({
      kind: "native-isolation-transport-envelope",
      schemaVersion: 1,
      runtimeSessionId: input.runtimeSessionId,
      sessionNonce: input.sessionNonce,
      messageSequence: nextOutboundSequence,
      payload: ready,
    }));
    nextOutboundSequence += 1;
  };

  window.addEventListener("message", onTransfer);
  window.parent.postMessage(Object.freeze({
    kind: "worldkit-hosted-runtime-frame-ready" as const,
    schemaVersion: 1 as const,
    runtimeSessionId: input.runtimeSessionId,
    sessionNonce: input.sessionNonce,
    messageSequence: 1 as const,
  }), input.shellOrigin);

  return Object.freeze({
    isDisposed: () => disposed,
    dispose: terminate,
  });
}
