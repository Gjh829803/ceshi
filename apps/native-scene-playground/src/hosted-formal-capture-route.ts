import { Engine } from "@babylonjs/core/Engines/engine.js";
import {
  createBabylonNativeIsolatedRuntimeEntryV1,
} from "@whitebox-world/runtime-babylon";
import type {
  NativeEffectiveExecutionBudgetV1,
  FormalWorldCaptureRequestV1,
} from "@whitebox-world/runtime-contracts";
import { admitHostedNativeExecutionRequestV1 } from
  "@whitebox-world/runtime-host";

import type {
  FormalHostedWorldCapturePayloadV1,
} from "../../../scripts/reconstruction/formal-capture.js";
import {
  createHostedFormalCaptureBridgeV1,
  type HostedFormalCaptureBridgeV1,
} from "./hosted-formal-capture-bridge.js";
import {
  startHostedFormalCaptureFrameV1,
  type FormalCaptureOnlyRuntimeEntryPortV1,
} from "./hosted-formal-capture-frame.js";
import {
  HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1,
  hostedFormalCaptureErrorV1,
} from "./hosted-formal-capture-protocol.js";
import { nativeSceneSubjectAssetResolver } from
  "./subject-asset-resolver.js";
import { loadVerifiedNativeWorldPackageV1 } from
  "./world-package-loader.js";

interface HostedFormalCaptureRouteIdentityV1 {
  readonly runtimeSessionId: string;
  readonly sessionNonce: string;
  readonly formalRequestId: string;
  readonly formalRequestHash: `sha256:${string}`;
}

export interface HostedFormalCaptureRouteConstantsV1 {
  readonly hostedBrowserRunnerDigest: `sha256:${string}`;
  readonly hostedBrowserPolicyHash: `sha256:${string}`;
  readonly runtimeOrigin: string;
  readonly shellOrigin: string;
}

declare global {
  interface Window {
    __WORLDKIT_HOSTED_FORMAL_CAPTURE__?: Readonly<{
      phase(): string;
      executeFormalCapture(
        request: import("@whitebox-world/runtime-contracts")
          .FormalWorldCaptureRequestV1,
      ): Promise<FormalHostedWorldCapturePayloadV1>;
    }>;
  }
}

function exactOrigin(value: string, role: string): string {
  const url = new URL(value);
  if (
    url.origin !== value ||
    (url.protocol !== "http:" && url.protocol !== "https:")
  ) throw hostedFormalCaptureErrorV1(`${role}_ORIGIN_INVALID`);
  return value;
}

export function readHostedFormalCaptureRouteIdentityV1(
  search: string,
  expectedMode?: "shell" | "frame",
): HostedFormalCaptureRouteIdentityV1 {
  const query = new URLSearchParams(search);
  const allowed = new Set([
    "hosted-formal-capture",
    "hosted-formal-capture-frame",
    "runtimeSessionId",
    "sessionNonce",
    "formalRequestId",
    "formalRequestHash",
  ]);
  if ([...query.keys()].some((key) => !allowed.has(key))) {
    throw hostedFormalCaptureErrorV1("ROUTE_PARAMETERS_INVALID");
  }
  const hasShellMode = query.getAll("hosted-formal-capture").length === 1 &&
    query.get("hosted-formal-capture") === "1";
  const hasFrameMode =
    query.getAll("hosted-formal-capture-frame").length === 1 &&
    query.get("hosted-formal-capture-frame") === "1";
  if (
    hasShellMode === hasFrameMode ||
    (expectedMode === "shell" && !hasShellMode) ||
    (expectedMode === "frame" && !hasFrameMode) ||
    [
      "runtimeSessionId",
      "sessionNonce",
      "formalRequestId",
      "formalRequestHash",
    ].some((key) => query.getAll(key).length !== 1)
  ) throw hostedFormalCaptureErrorV1("ROUTE_PARAMETERS_INVALID");
  const runtimeSessionId = query.get("runtimeSessionId");
  const sessionNonce = query.get("sessionNonce");
  const formalRequestId = query.get("formalRequestId");
  const formalRequestHash = query.get("formalRequestHash");
  if (
    runtimeSessionId === null ||
    sessionNonce === null ||
    formalRequestId === null ||
    formalRequestHash === null ||
    !/^sha256:[a-f0-9]{64}$/.test(formalRequestHash) ||
    [runtimeSessionId, sessionNonce, formalRequestId].some((value) =>
      value.length === 0 || value.trim() !== value)
  ) throw hostedFormalCaptureErrorV1("ROUTE_PARAMETERS_INVALID");
  return Object.freeze({
    runtimeSessionId,
    sessionNonce,
    formalRequestId,
    formalRequestHash: formalRequestHash as `sha256:${string}`,
  });
}

function captureExecutionBudget(
  scene: NativeEffectiveExecutionBudgetV1["scene"],
): NativeEffectiveExecutionBudgetV1 {
  return Object.freeze({
    scene,
    assets: {
      maximumAssetCount: 64,
      maximumAssetBytes: 64_000_000,
      maximumTextureCount: 32,
      maximumTextureBytes: 64_000_000,
    },
    runtime: {
      maximumSceneNodeCount: 2_000,
      maximumMaterialCount: 256,
      maximumShaderCount: 256,
      maximumPhysicsBodyCount: 256,
    },
    process: {
      maximumWallTimeMilliseconds: 120_000,
      maximumCpuTimeMilliseconds: 120_000,
      maximumMemoryBytes: 1_000_000_000,
      maximumProcessCount: 1,
    },
    protocol: {
      maximumInboundMessageBytes:
        HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1.maximumInboundMessageBytes,
      maximumOutboundMessageBytes:
        HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1.maximumOutboundMessageBytes,
      maximumReceiptBytes: 16_000_000,
      maximumDiagnosticCount: 1,
      maximumLogBytes: 100_000,
    },
  });
}

export async function startHostedFormalCaptureShellRouteV1(input: Readonly<{
  constants: HostedFormalCaptureRouteConstantsV1;
  viewport: HTMLElement;
  search: string;
}>): Promise<HostedFormalCaptureBridgeV1> {
  const shellOrigin = exactOrigin(input.constants.shellOrigin, "SHELL");
  const runtimeOrigin = exactOrigin(input.constants.runtimeOrigin, "RUNTIME");
  if (shellOrigin === runtimeOrigin || location.origin !== shellOrigin) {
    throw hostedFormalCaptureErrorV1("SHELL_ORIGIN_MISMATCH");
  }
  const identity = readHostedFormalCaptureRouteIdentityV1(
    input.search,
    "shell",
  );
  const frame = document.createElement("iframe");
  frame.className = "hosted-runtime-frame";
  const frameUrl = new URL("/", runtimeOrigin);
  frameUrl.searchParams.set("hosted-formal-capture-frame", "1");
  for (const [name, value] of Object.entries(identity)) {
    frameUrl.searchParams.set(name, value);
  }
  frame.src = frameUrl.href;
  const bridge = createHostedFormalCaptureBridgeV1({
    frame,
    runtimeOrigin,
    ...identity,
    protocolBudget: HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1,
  });
  input.viewport.replaceChildren(frame);
  window.__WORLDKIT_HOSTED_FORMAL_CAPTURE__ = Object.freeze({
    phase: () => bridge.phase(),
    executeFormalCapture: (request) => bridge.executeFormalCapture(request),
  });
  window.addEventListener("beforeunload", () => bridge.dispose(), {
    once: true,
  });
  await bridge.waitUntilReady();
  return bridge;
}

function requireCaptureOnlyEntry(
  value: Awaited<ReturnType<typeof createBabylonNativeIsolatedRuntimeEntryV1>>,
): FormalCaptureOnlyRuntimeEntryPortV1 {
  const candidate = value as unknown as Readonly<{
    executeFormalCapture?: FormalCaptureOnlyRuntimeEntryPortV1[
      "executeFormalCapture"
    ];
    dispose(): Promise<void>;
  }>;
  if (typeof candidate.executeFormalCapture !== "function") {
    void candidate.dispose().catch(() => undefined);
    throw hostedFormalCaptureErrorV1("RUNTIME_PROVIDER_UNAVAILABLE");
  }
  return Object.freeze({
    executeFormalCapture: (request: FormalWorldCaptureRequestV1) =>
      candidate.executeFormalCapture!.call(value, request),
    dispose: () => candidate.dispose.call(value),
  });
}

export async function startHostedFormalCaptureFrameRouteV1(input: Readonly<{
  constants: HostedFormalCaptureRouteConstantsV1;
  viewport: HTMLElement;
  search: string;
}>): Promise<void> {
  const runtimeOrigin = exactOrigin(input.constants.runtimeOrigin, "RUNTIME");
  const shellOrigin = exactOrigin(input.constants.shellOrigin, "SHELL");
  if (runtimeOrigin === shellOrigin || location.origin !== runtimeOrigin) {
    throw hostedFormalCaptureErrorV1("RUNTIME_ORIGIN_MISMATCH");
  }
  const identity = readHostedFormalCaptureRouteIdentityV1(
    input.search,
    "frame",
  );
  const canvas = document.createElement("canvas");
  input.viewport.replaceChildren(canvas);
  const verified = await loadVerifiedNativeWorldPackageV1(
    new URL("/__worldkit/native-package/", location.origin),
  );
  const moduleImport = await import("virtual:worldkit-native-scene");
  const executionBudgetCap = captureExecutionBudget(
    verified.manifest.resourceBudget,
  );
  const requestBody = admitHostedNativeExecutionRequestV1({
    id: `native-formal-capture-request.${identity.runtimeSessionId}`,
    runtimeSessionId: identity.runtimeSessionId,
    verifiedWorldPackage: verified,
    sceneProfileBudget: verified.manifest.resourceBudget,
    hostHardCap: executionBudgetCap,
    tenantCap: executionBudgetCap,
    runnerIdentityRef: "worldkit://native-isolation-runner/browser-origin@1",
    runnerImageDigest: input.constants.hostedBrowserRunnerDigest,
    sandboxPolicyHash: input.constants.hostedBrowserPolicyHash,
    requestedOperation: {
      mode: "capture",
      captureRequestHash: identity.formalRequestHash,
    },
    sessionNonce: identity.sessionNonce,
  });
  const entry = await createBabylonNativeIsolatedRuntimeEntryV1({
    request: requestBody,
    verifiedWorldPackage: verified,
    moduleLoader: { load: async () => moduleImport.default },
    engineFactory: () => new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    }),
    subjectAssetResolver: nativeSceneSubjectAssetResolver,
  });
  const captureEntry = requireCaptureOnlyEntry(entry);
  const hostedFrame = startHostedFormalCaptureFrameV1({
    entry: captureEntry,
    shellOrigin,
    ...identity,
    protocolBudget: HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1,
  });
  window.addEventListener("beforeunload", () => {
    void hostedFrame.dispose();
  }, { once: true });
}
