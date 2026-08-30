import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import {
  hashNativeIsolatedExecutionRequestV1,
  parseNativeIsolatedExecutionRequestV1,
  parseNativeIsolatedExecutionResultV1,
  parseNativeIsolationTransportEnvelopeV1,
  type NativeIsolatedExecutionRequestV1,
  type NativeIsolatedExecutionResultV1,
  type NativeIsolationTerminationReasonV1,
  type NativeIsolationTransportEnvelopeV1,
} from "@whitebox-world/runtime-contracts";
import {
  NativeIsolationProviderTerminationErrorV1,
  type NativeIsolationProviderV1,
  type NativeIsolationReceiptEvidenceV1,
  type PreparedNativeIsolationV1,
} from "@whitebox-world/runtime-host";
import { isNil } from "lodash-es";

const CONTAINER_PACKAGE_PATH = "/world-package";
const CONTAINER_TEMPORARY_PATH = "/tmp";
const RUNNER_USER = "10001:10001";
const DIGEST_ONLY_IMAGE_PATTERN = /^(?:(?:[a-z0-9]+(?:[._-][a-z0-9]+)*\/)*[a-z0-9]+(?:[._-][a-z0-9]+)*@)?sha256:[0-9a-f]{64}$/;

export type DockerNativeIsolationProviderErrorCodeV1 =
  | "DOCKER_NATIVE_ISOLATION_IMAGE_INVALID"
  | "DOCKER_NATIVE_ISOLATION_PACKAGE_PATH_INVALID"
  | "DOCKER_NATIVE_ISOLATION_IDENTITY_MISMATCH"
  | "DOCKER_NATIVE_ISOLATION_LIFECYCLE_INVALID"
  | "DOCKER_NATIVE_ISOLATION_PROVIDER_FAILED";

export class DockerNativeIsolationProviderErrorV1 extends Error {
  readonly name = "DockerNativeIsolationProviderErrorV1";

  constructor(readonly code: DockerNativeIsolationProviderErrorCodeV1) {
    super(`${code}: Docker Native isolation provider rejected the operation.`);
    Object.freeze(this);
  }
}

export interface NativeContainerInvocationV1 {
  readonly command: "docker";
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<{ LC_ALL: "C"; LANG: "C" }>;
  readonly maximumStdoutBytes: number;
  readonly maximumStderrBytes: number;
  readonly timeoutMilliseconds: number;
}

export interface NativeContainerCommandProcessV1 {
  exchangeLine(inputLine: string, maximumOutputBytes: number): Promise<string>;
  terminate(reason: NativeIsolationTerminationReasonV1): Promise<void>;
  dispose(): Promise<void>;
  collectControlPlaneReceipt(): Promise<NativeIsolationReceiptEvidenceV1>;
}

export interface NativeContainerCommandRunnerV1 {
  start(
    invocation: NativeContainerInvocationV1,
    cancellationSignal: AbortSignal,
  ): Promise<NativeContainerCommandProcessV1>;
}

export interface CreateDockerNativeIsolationProviderOptionsV1 {
  readonly runnerIdentityRef: string;
  readonly runnerImageRef: string;
  readonly runnerImageDigest: `sha256:${string}`;
  readonly sandboxPolicyHash: `sha256:${string}`;
  readonly packageHostPath: string;
  readonly commandRunner: NativeContainerCommandRunnerV1;
}

function providerError(
  code: DockerNativeIsolationProviderErrorCodeV1,
): DockerNativeIsolationProviderErrorV1 {
  return new DockerNativeIsolationProviderErrorV1(code);
}

function assertProviderOptions(
  input: CreateDockerNativeIsolationProviderOptionsV1,
): void {
  if (!DIGEST_ONLY_IMAGE_PATTERN.test(input.runnerImageRef)) {
    throw providerError("DOCKER_NATIVE_ISOLATION_IMAGE_INVALID");
  }
  if (
    !/^sha256:[0-9a-f]{64}$/.test(input.runnerImageDigest) ||
    !/^sha256:[0-9a-f]{64}$/.test(input.sandboxPolicyHash)
  ) throw providerError("DOCKER_NATIVE_ISOLATION_IMAGE_INVALID");
  if (!path.isAbsolute(input.packageHostPath)) {
    throw providerError("DOCKER_NATIVE_ISOLATION_PACKAGE_PATH_INVALID");
  }
}

async function resolveExactPackageDirectory(input: string): Promise<string> {
  try {
    const metadata = await lstat(input);
    const resolved = await realpath(input);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      path.resolve(input) !== resolved
    ) {
      throw providerError("DOCKER_NATIVE_ISOLATION_PACKAGE_PATH_INVALID");
    }
    return resolved;
  } catch (error) {
    if (error instanceof DockerNativeIsolationProviderErrorV1) throw error;
    throw providerError("DOCKER_NATIVE_ISOLATION_PACKAGE_PATH_INVALID");
  }
}

function containerName(request: NativeIsolatedExecutionRequestV1): string {
  return `worldkit-native-${
    hashNativeIsolatedExecutionRequestV1(request).slice("sha256:".length, 29)
  }`;
}

function invocationFor(
  request: NativeIsolatedExecutionRequestV1,
  packageHostPath: string,
  runnerImageRef: string,
): NativeContainerInvocationV1 {
  const budget = request.effectiveBudget;
  const tmpfsBytes = Math.max(
    1,
    Math.min(67_108_864, Math.floor(budget.process.maximumMemoryBytes / 8)),
  );
  const cpuPeriodMicroseconds = 100_000;
  const cpuQuotaMicroseconds = Math.max(
    1_000,
    Math.min(
      cpuPeriodMicroseconds,
      Math.floor(
        cpuPeriodMicroseconds *
          budget.process.maximumCpuTimeMilliseconds /
          budget.process.maximumWallTimeMilliseconds,
      ),
    ),
  );
  return Object.freeze({
    command: "docker" as const,
    args: Object.freeze([
      "run",
      "--interactive",
      "--rm",
      "--pull",
      "never",
      "--name",
      containerName(request),
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      String(budget.process.maximumProcessCount),
      "--cpu-period",
      String(cpuPeriodMicroseconds),
      "--cpu-quota",
      String(cpuQuotaMicroseconds),
      "--memory",
      String(budget.process.maximumMemoryBytes),
      "--memory-swap",
      String(budget.process.maximumMemoryBytes),
      "--init",
      "--stop-timeout",
      "1",
      "--user",
      RUNNER_USER,
      "--workdir",
      "/runner",
      "--env",
      "LC_ALL=C",
      "--env",
      "LANG=C",
      "--ipc",
      "none",
      "--ulimit",
      "nofile=1024:1024",
      "--tmpfs",
      `${CONTAINER_TEMPORARY_PATH}:rw,noexec,nosuid,nodev,size=${tmpfsBytes}`,
      "--mount",
      `type=bind,src=.,dst=${CONTAINER_PACKAGE_PATH},readonly,bind-propagation=rprivate`,
      runnerImageRef,
    ]),
    cwd: packageHostPath,
    env: Object.freeze({ LC_ALL: "C" as const, LANG: "C" as const }),
    maximumStdoutBytes: budget.protocol.maximumOutboundMessageBytes,
    maximumStderrBytes: budget.protocol.maximumLogBytes,
    timeoutMilliseconds: budget.process.maximumWallTimeMilliseconds,
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

class PreparedDockerNativeIsolation implements PreparedNativeIsolationV1 {
  #process: NativeContainerCommandProcessV1 | undefined;
  #result: NativeIsolatedExecutionResultV1 | undefined;
  #isDisposed = false;
  #disposePromise: Promise<void> | undefined;

  constructor(
    private readonly request: NativeIsolatedExecutionRequestV1,
    private readonly invocation: NativeContainerInvocationV1,
    private readonly runner: NativeContainerCommandRunnerV1,
    private readonly cancellationSignal: AbortSignal,
  ) {}

  async start(): Promise<NativeIsolatedExecutionResultV1> {
    if (!isNil(this.#process) || this.#isDisposed) {
      throw providerError("DOCKER_NATIVE_ISOLATION_LIFECYCLE_INVALID");
    }
    try {
      const process = await this.runner.start(
        this.invocation,
        this.cancellationSignal,
      );
      this.#process = process;
      const result = parseNativeIsolatedExecutionResultV1(JSON.parse(
        await process.exchangeLine(
          JSON.stringify(this.request),
          this.request.effectiveBudget.protocol.maximumOutboundMessageBytes,
        ),
      ));
      if (
        result.requestId !== this.request.id ||
        result.runtimeSessionId !== this.request.runtimeSessionId
      ) throw providerError("DOCKER_NATIVE_ISOLATION_IDENTITY_MISMATCH");
      this.#result = result;
      return result;
    } catch (error) {
      if (error instanceof NativeIsolationProviderTerminationErrorV1) {
        const result = terminationResult(this.request, error.reason);
        this.#result = result;
        return result;
      }
      if (error instanceof DockerNativeIsolationProviderErrorV1) throw error;
      throw providerError("DOCKER_NATIVE_ISOLATION_PROVIDER_FAILED");
    }
  }

  async submit(
    envelopeInput: NativeIsolationTransportEnvelopeV1,
  ): Promise<NativeIsolationTransportEnvelopeV1> {
    const process = this.#process;
    if (
      isNil(process) ||
      this.#result?.status !== "ready" ||
      this.#isDisposed
    ) throw providerError("DOCKER_NATIVE_ISOLATION_LIFECYCLE_INVALID");
    try {
      const envelope = parseNativeIsolationTransportEnvelopeV1(envelopeInput);
      return parseNativeIsolationTransportEnvelopeV1(JSON.parse(
        await process.exchangeLine(
          JSON.stringify(envelope),
          this.request.effectiveBudget.protocol.maximumOutboundMessageBytes,
        ),
      ));
    } catch (error) {
      if (error instanceof NativeIsolationProviderTerminationErrorV1) {
        throw error;
      }
      throw providerError("DOCKER_NATIVE_ISOLATION_PROVIDER_FAILED");
    }
  }

  async terminate(
    reason: NativeIsolationTerminationReasonV1,
  ): Promise<NativeIsolatedExecutionResultV1> {
    if (!isNil(this.#process) && !this.#isDisposed) {
      try {
        await this.#process.terminate(reason);
      } catch {
        throw providerError("DOCKER_NATIVE_ISOLATION_PROVIDER_FAILED");
      }
    }
    const result = terminationResult(this.request, reason);
    this.#result = result;
    return result;
  }

  dispose(): Promise<void> {
    if (!isNil(this.#disposePromise)) return this.#disposePromise;
    this.#isDisposed = true;
    this.#disposePromise = this.#process?.dispose() ?? Promise.resolve();
    return this.#disposePromise;
  }

  async collectReceipt(): Promise<NativeIsolationReceiptEvidenceV1> {
    if (isNil(this.#process) || this.#result?.status === "ready") {
      throw providerError("DOCKER_NATIVE_ISOLATION_LIFECYCLE_INVALID");
    }
    try {
      return await this.#process.collectControlPlaneReceipt();
    } catch {
      throw providerError("DOCKER_NATIVE_ISOLATION_PROVIDER_FAILED");
    }
  }
}

export function createDockerNativeIsolationProviderV1(
  input: CreateDockerNativeIsolationProviderOptionsV1,
): NativeIsolationProviderV1 {
  assertProviderOptions(input);
  return Object.freeze({
    runnerIdentityRef: input.runnerIdentityRef,
    async prepare(
      requestInput: NativeIsolatedExecutionRequestV1,
      cancellationSignal: AbortSignal,
    ) {
      const request = parseNativeIsolatedExecutionRequestV1(requestInput);
      if (
        request.runnerIdentityRef !== input.runnerIdentityRef ||
        request.runnerImageDigest !== input.runnerImageDigest ||
        request.sandboxPolicyHash !== input.sandboxPolicyHash ||
        !input.runnerImageRef.endsWith(request.runnerImageDigest)
      ) {
        throw providerError("DOCKER_NATIVE_ISOLATION_IDENTITY_MISMATCH");
      }
      const packageHostPath = await resolveExactPackageDirectory(
        input.packageHostPath,
      );
      return new PreparedDockerNativeIsolation(
        request,
        invocationFor(
          request,
          packageHostPath,
          input.runnerImageRef,
        ),
        input.commandRunner,
        cancellationSignal,
      );
    },
  });
}
