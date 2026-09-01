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
  parseHostedFormalCapturePayloadV1,
  parseHostedFormalCaptureRequestV1,
  type HostedFormalCaptureProtocolBudgetV1,
} from "@whitebox-world/runtime-babylon";

export interface FormalCaptureOnlyRuntimeEntryPortV1 {
  executeFormalCapture(
    request: FormalWorldCaptureRequestV1,
  ): Promise<FormalHostedWorldCapturePayloadV1>;
  dispose(): Promise<void>;
}

export interface StartHostedFormalCaptureFrameInputV1 {
  readonly entry: FormalCaptureOnlyRuntimeEntryPortV1;
  readonly shellOrigin: string;
  readonly runtimeSessionId: string;
  readonly sessionNonce: string;
  readonly formalRequestId: string;
  readonly formalRequestHash: `sha256:${string}`;
  readonly protocolBudget: HostedFormalCaptureProtocolBudgetV1;
}

export interface HostedFormalCaptureFrameV1 {
  isDisposed(): boolean;
  dispose(): Promise<void>;
}

export function startHostedFormalCaptureFrameV1(
  input: StartHostedFormalCaptureFrameInputV1,
): HostedFormalCaptureFrameV1 {
  if (window.parent === window) {
    throw hostedFormalCaptureErrorV1("FRAME_PARENT_REQUIRED");
  }
  const shellUrl = new URL(input.shellOrigin);
  if (
    shellUrl.origin !== input.shellOrigin ||
    (shellUrl.protocol !== "http:" && shellUrl.protocol !== "https:")
  ) throw hostedFormalCaptureErrorV1("SHELL_ORIGIN_INVALID");

  let port: MessagePort | undefined;
  let isDisposed = false;
  let hasReceivedRequest = false;
  let phase: "bootstrapping" | "ready" | "capturing" | "completed" =
    "bootstrapping";
  let disposePromise: Promise<void> | undefined;

  const terminate = (): Promise<void> => {
    if (!isNil(disposePromise)) return disposePromise;
    isDisposed = true;
    window.removeEventListener("message", onTransfer);
    port?.removeEventListener("message", onPortMessage);
    port?.close();
    disposePromise = input.entry.dispose();
    void disposePromise.catch(() => undefined);
    return disposePromise;
  };

  const identityMatches = (record: Readonly<Record<string, unknown>>) =>
    record.schemaVersion === 1 &&
    record.runtimeSessionId === input.runtimeSessionId &&
    record.sessionNonce === input.sessionNonce &&
    record.formalRequestId === input.formalRequestId &&
    record.formalRequestHash === input.formalRequestHash;

  const onPortMessage = (event: MessageEvent): void => {
    if (isDisposed || isNil(port)) return;
    try {
      assertHostedFormalCaptureWireBudgetV1(
        event.data,
        input.protocolBudget.maximumInboundMessageBytes,
        "INBOUND_BUDGET_EXCEEDED",
      );
      const envelope = exactPlainRecordV1(
        event.data,
        [...HOSTED_FORMAL_CAPTURE_BOOTSTRAP_FIELDS_V1, "payload"],
        "REQUEST_SHAPE_INVALID",
      );
      if (
        phase !== "ready" ||
        hasReceivedRequest ||
        envelope.kind !== "worldkit-hosted-formal-capture-request" ||
        envelope.messageSequence !== 1 ||
        !identityMatches(envelope)
      ) throw hostedFormalCaptureErrorV1("REQUEST_DIRECTION_INVALID");
      const request = parseHostedFormalCaptureRequestV1({
        value: envelope.payload,
        formalRequestId: input.formalRequestId,
        formalRequestHash: input.formalRequestHash,
      });
      hasReceivedRequest = true;
      phase = "capturing";
      void input.entry.executeFormalCapture(request).then((value) => {
        if (isDisposed || isNil(port) || phase !== "capturing") return;
        try {
          const payload = parseHostedFormalCapturePayloadV1({
            value,
            runtimeSessionId: input.runtimeSessionId,
            request,
            formalRequestHash: input.formalRequestHash,
            protocolBudget: input.protocolBudget,
          });
          const result = Object.freeze({
            kind: "worldkit-hosted-formal-capture-result" as const,
            schemaVersion: 1 as const,
            runtimeSessionId: input.runtimeSessionId,
            sessionNonce: input.sessionNonce,
            formalRequestId: input.formalRequestId,
            formalRequestHash: input.formalRequestHash,
            messageSequence: 2 as const,
            payload,
          });
          assertHostedFormalCaptureWireBudgetV1(
            result,
            input.protocolBudget.maximumOutboundMessageBytes,
            "OUTBOUND_BUDGET_EXCEEDED",
          );
          phase = "completed";
          port.postMessage(result);
        } catch {
          void terminate();
        }
      }, () => {
        if (isDisposed || isNil(port) || phase !== "capturing") return;
        const failure = Object.freeze({
          kind: "worldkit-hosted-formal-capture-failure" as const,
          schemaVersion: 1 as const,
          runtimeSessionId: input.runtimeSessionId,
          sessionNonce: input.sessionNonce,
          formalRequestId: input.formalRequestId,
          formalRequestHash: input.formalRequestHash,
          messageSequence: 2 as const,
          diagnosticCode:
            "WORLDKIT_HOSTED_FORMAL_CAPTURE_PROVIDER_REJECTED" as const,
        });
        phase = "completed";
        port.postMessage(failure);
      });
    } catch {
      void terminate();
    }
  };

  const onTransfer = (event: MessageEvent): void => {
    if (isDisposed) return;
    try {
      if (
        !isNil(port) ||
        event.origin !== input.shellOrigin ||
        event.source !== window.parent ||
        event.ports.length !== 1
      ) throw hostedFormalCaptureErrorV1("PORT_TRANSFER_IDENTITY_INVALID");
      const transfer = exactPlainRecordV1(
        event.data,
        HOSTED_FORMAL_CAPTURE_BOOTSTRAP_FIELDS_V1,
        "PORT_TRANSFER_SHAPE_INVALID",
      );
      if (
        transfer.kind !== "worldkit-hosted-formal-capture-port-transfer" ||
        transfer.messageSequence !== 1 ||
        !identityMatches(transfer)
      ) throw hostedFormalCaptureErrorV1("PORT_TRANSFER_IDENTITY_INVALID");
      const transferredPort = event.ports[0];
      if (isNil(transferredPort)) {
        throw hostedFormalCaptureErrorV1("PORT_TRANSFER_MISSING");
      }
      port = transferredPort;
      window.removeEventListener("message", onTransfer);
      transferredPort.addEventListener("message", onPortMessage);
      transferredPort.start();
      const ready = Object.freeze({
        kind: "worldkit-hosted-formal-capture-port-ready" as const,
        schemaVersion: 1 as const,
        runtimeSessionId: input.runtimeSessionId,
        sessionNonce: input.sessionNonce,
        formalRequestId: input.formalRequestId,
        formalRequestHash: input.formalRequestHash,
        messageSequence: 1 as const,
      });
      assertHostedFormalCaptureWireBudgetV1(
        ready,
        input.protocolBudget.maximumOutboundMessageBytes,
        "OUTBOUND_BUDGET_EXCEEDED",
      );
      phase = "ready";
      transferredPort.postMessage(ready);
    } catch {
      void terminate();
    }
  };

  window.addEventListener("message", onTransfer);
  window.parent.postMessage(Object.freeze({
    kind: "worldkit-hosted-formal-capture-frame-ready" as const,
    schemaVersion: 1 as const,
    runtimeSessionId: input.runtimeSessionId,
    sessionNonce: input.sessionNonce,
    formalRequestId: input.formalRequestId,
    formalRequestHash: input.formalRequestHash,
    messageSequence: 1 as const,
  }), input.shellOrigin);

  return Object.freeze({
    isDisposed: () => isDisposed,
    dispose: terminate,
  });
}
