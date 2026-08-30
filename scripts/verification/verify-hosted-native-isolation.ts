import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  hashNativeEffectiveExecutionBudgetV1,
  hashNativeIsolatedExecutionRequestV1,
  hashNativeIsolatedExecutionResultV1,
  parseNativeIsolatedExecutionReceiptV1,
  parseNativeIsolatedExecutionRequestV1,
  parseNativeIsolationTransportEnvelopeV1,
  type NativeEffectiveExecutionBudgetV1,
  type NativeExecutionUsageV1,
  type NativeIsolatedExecutionRequestV1,
  type NativeIsolatedExecutionResultV1,
  type NativeIsolationTerminationReasonV1,
  type NativeIsolationTransportEnvelopeV1,
} from "@whitebox-world/runtime-contracts";
import { sha256Bytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  assembleWorldPackageDirectoryV1,
  assertWorldPackageBuildReceiptV1,
  verifyWorldPackageDirectoryV1,
  type VerifiedBabylonNativeWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import {
  NativeIsolationProviderTerminationErrorV1,
  NativeIsolationSupervisorV1,
} from "@whitebox-world/runtime-host";
import { isNil } from "lodash-es";

import {
  createDockerNativeIsolationProviderV1,
  type NativeContainerCommandProcessV1,
  type NativeContainerCommandRunnerV1,
  type NativeContainerInvocationV1,
} from "../native-scene/hosted/container-provider";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const PACKAGE_ROOT = path.join(
  REPOSITORY_ROOT,
  "apps/playground/public/world-packages/cloud-ridge",
);
const DOCKERFILE_PATH = path.join(
  REPOSITORY_ROOT,
  "scripts/native-scene/hosted/runner/Dockerfile",
);
const RUNNER_IDENTITY_REF =
  "worldkit://native-isolation-runner/docker-linux@1";
const SANDBOX_POLICY = Object.freeze({
  schemaVersion: 1,
  network: "none",
  rootFilesystem: "read-only",
  capabilities: "none",
  noNewPrivileges: true,
  user: "10001:10001",
  packageMount: "read-only-rprivate",
  temporaryFilesystem: "bounded-tmpfs",
});
const SANDBOX_POLICY_HASH = sha256CanonicalJson(SANDBOX_POLICY) as
  `sha256:${string}`;

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function resolveDockerCommand(): Promise<string> {
  const result = await runCommand("/usr/bin/env", ["which", "docker"], {
    maximumOutputBytes: 8_192,
    timeoutMilliseconds: 10_000,
  });
  if (result.exitCode !== 0 || result.stdout.trim().length === 0) {
    throw new Error("HOSTED_NATIVE_DOCKER_CLI_UNAVAILABLE");
  }
  return result.stdout.trim();
}

function runCommand(
  command: string,
  args: readonly string[],
  options: Readonly<{
    cwd?: string;
    env?: Readonly<Record<string, string>>;
    stdin?: string;
    maximumOutputBytes: number;
    timeoutMilliseconds: number;
  }>,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      ...(isNil(options.cwd) ? {} : { cwd: options.cwd }),
      env: {
        LC_ALL: "C",
        LANG: "C",
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        ...(options.env ?? {}),
      },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, options.timeoutMilliseconds);
    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next) > options.maximumOutputBytes) {
        child.kill("SIGKILL");
        return next.slice(0, options.maximumOutputBytes);
      }
      return next;
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
    child.stdin.end(options.stdin ?? "");
  });
}

async function verifiedPackage():
Promise<VerifiedBabylonNativeWorldPackageDirectoryV1> {
  const receipt = assertWorldPackageBuildReceiptV1(JSON.parse(
    await readFile(
      path.join(PACKAGE_ROOT, "world-package-build-receipt.json"),
      "utf8",
    ),
  ));
  const files = await Promise.all(receipt.fileIntegrityEntries.map(
    async ({ path: relativePath, mediaType }) => ({
      path: relativePath,
      mediaType,
      bytes: new Uint8Array(await readFile(path.join(PACKAGE_ROOT, relativePath))),
    }),
  ));
  const verified = verifyWorldPackageDirectoryV1(
    assembleWorldPackageDirectoryV1({ receipt, files }),
  );
  if (verified.kind !== "babylon-native-scene") {
    throw new Error("HOSTED_NATIVE_CLOUD_RIDGE_PACKAGE_INVALID");
  }
  return verified;
}

function effectiveBudget(
  verified: VerifiedBabylonNativeWorldPackageDirectoryV1,
): NativeEffectiveExecutionBudgetV1 {
  return {
    scene: verified.manifest.resourceBudget,
    assets: {
      maximumAssetCount: 64,
      maximumAssetBytes: 128_000_000,
      maximumTextureCount: 64,
      maximumTextureBytes: 96_000_000,
    },
    runtime: {
      maximumSceneNodeCount: 4_096,
      maximumMaterialCount: 512,
      maximumShaderCount: 512,
      maximumPhysicsBodyCount: 256,
    },
    process: {
      maximumWallTimeMilliseconds: 90_000,
      maximumCpuTimeMilliseconds: 60_000,
      maximumMemoryBytes: 1_073_741_824,
      maximumProcessCount: 32,
    },
    protocol: {
      maximumInboundMessageBytes: 2_000_000,
      maximumOutboundMessageBytes: 2_000_000,
      maximumReceiptBytes: 2_000_000,
      maximumDiagnosticCount: 100,
      maximumLogBytes: 262_144,
    },
  };
}

function isolatedRequest(
  verified: VerifiedBabylonNativeWorldPackageDirectoryV1,
  runnerImageDigest: `sha256:${string}`,
  suffix: string,
): NativeIsolatedExecutionRequestV1 {
  const budget = effectiveBudget(verified);
  return parseNativeIsolatedExecutionRequestV1({
    kind: "native-isolated-execution-request",
    schemaVersion: 1,
    id: `native-isolated-execution-request.hosted-verifier.${suffix}`,
    runtimeSessionId: `runtime.hosted-verifier.${suffix}`,
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
    sceneModuleBundleHash: verified.sceneModuleBundleHash,
    nativeSceneContributionHash:
      verified.manifest.sceneSource.nativeSceneContributionHash,
    nativeExecutionTrustProfileRef:
      "worldkit://native-execution-trust-profile/hosted-isolated@1",
    nativeExecutionTrustProfileHash: `sha256:${"a".repeat(64)}`,
    runnerIdentityRef: RUNNER_IDENTITY_REF,
    runnerImageDigest,
    sandboxPolicyHash: SANDBOX_POLICY_HASH,
    effectiveBudget: budget,
    effectiveBudgetHash: hashNativeEffectiveExecutionBudgetV1(budget),
    requestedOperation: { mode: "interactive-session" },
    sessionNonce: `nonce.hosted-verifier.${suffix}`,
  });
}

function terminationResult(
  request: NativeIsolatedExecutionRequestV1,
  reason: NativeIsolationTerminationReasonV1,
): NativeIsolatedExecutionResultV1 {
  return {
    kind: "native-isolated-execution-result",
    schemaVersion: 1,
    id: `native-isolated-execution-result.${request.id}.${reason}`,
    requestId: request.id,
    runtimeSessionId: request.runtimeSessionId,
    status: "terminated",
    reason,
  };
}

class DockerJsonLineProcess implements NativeContainerCommandProcessV1 {
  readonly #child;
  readonly #startedAt = Date.now();
  readonly #lines: string[] = [];
  readonly #lineWaiters: Array<{
    resolve: (line: string) => void;
    reject: (error: Error) => void;
  }> = [];
  #stdoutRemainder = "";
  #stdoutBytes = 0;
  #stderrBytes = 0;
  #inboundBytes = 0;
  #request: NativeIsolatedExecutionRequestV1 | undefined;
  #terminationReason: NativeIsolationTerminationReasonV1 | undefined;
  #runtimeUsage = {
    actualSceneNodeCount: 0,
    actualMaterialCount: 0,
    actualShaderCount: 0,
    actualPhysicsBodyCount: 0,
  };
  #processUsage = {
    actualCpuTimeMilliseconds: 0,
    peakMemoryBytes: 0,
    peakProcessCount: 1,
  };
  #killPromise: Promise<void> | undefined;
  #disposePromise: Promise<void> | undefined;
  #evidencePromise: ReturnType<DockerJsonLineProcess["buildControlPlaneReceipt"]> |
    undefined;
  readonly #exitPromise: Promise<void>;

  constructor(
    private readonly dockerCommand: string,
    private readonly invocation: NativeContainerInvocationV1,
    private readonly verified: VerifiedBabylonNativeWorldPackageDirectoryV1,
    cancellationSignal: AbortSignal,
  ) {
    this.#child = spawn(dockerCommand, [...invocation.args], {
      cwd: invocation.cwd,
      env: invocation.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#exitPromise = new Promise((resolve) => {
      this.#child.once("close", () => {
        const error = new NativeIsolationProviderTerminationErrorV1(
          this.#terminationReason ?? "provider-lost",
        );
        while (this.#lineWaiters.length > 0) this.#lineWaiters.shift()!.reject(error);
        resolve();
      });
    });
    this.#child.stdout.on("data", (chunk: Buffer) => {
      this.#stdoutBytes += chunk.byteLength;
      if (this.#stdoutBytes > invocation.maximumStdoutBytes) {
        this.#terminationReason = "output-limit";
        void this.killContainerDomain();
        return;
      }
      this.#stdoutRemainder += chunk.toString("utf8");
      for (;;) {
        const newline = this.#stdoutRemainder.indexOf("\n");
        if (newline < 0) break;
        const line = this.#stdoutRemainder.slice(0, newline);
        this.#stdoutRemainder = this.#stdoutRemainder.slice(newline + 1);
        const waiter = this.#lineWaiters.shift();
        if (isNil(waiter)) this.#lines.push(line);
        else waiter.resolve(line);
      }
    });
    this.#child.stderr.on("data", (chunk: Buffer) => {
      this.#stderrBytes += chunk.byteLength;
      if (this.#stderrBytes > invocation.maximumStderrBytes) {
        this.#terminationReason = "output-limit";
        void this.killContainerDomain();
      }
    });
    const timer = setTimeout(() => {
      this.#terminationReason = "timeout";
      void this.killContainerDomain();
    }, invocation.timeoutMilliseconds);
    this.#exitPromise.finally(() => clearTimeout(timer));
    cancellationSignal.addEventListener("abort", () => {
      void this.killContainerDomain();
    }, { once: true });
  }

  async exchangeLine(inputLine: string, maximumOutputBytes: number): Promise<string> {
    this.#inboundBytes += Buffer.byteLength(inputLine);
    if (isNil(this.#request)) {
      this.#request = parseNativeIsolatedExecutionRequestV1(JSON.parse(inputLine));
    }
    const linePromise = this.nextLine();
    this.#child.stdin.write(`${inputLine}\n`);
    const line = await linePromise;
    if (Buffer.byteLength(line) > maximumOutputBytes) {
      this.#terminationReason = "output-limit";
      await this.killContainerDomain();
      throw new NativeIsolationProviderTerminationErrorV1("output-limit");
    }
    try {
      const envelope = parseNativeIsolationTransportEnvelopeV1(JSON.parse(line));
      if (
        "status" in envelope.payload &&
        envelope.payload.status === "succeeded" &&
        "snapshot" in envelope.payload
      ) {
        this.#runtimeUsage = {
          ...this.#runtimeUsage,
          actualSceneNodeCount: envelope.payload.snapshot.resources.meshCount,
          actualPhysicsBodyCount:
            envelope.payload.snapshot.resources.physicsBodyCount,
        };
      }
    } catch {
      // The first response is an Execution Result rather than a transport envelope.
    }
    return line;
  }

  private nextLine(): Promise<string> {
    const retained = this.#lines.shift();
    if (!isNil(retained)) return Promise.resolve(retained);
    return new Promise((resolve, reject) => {
      this.#lineWaiters.push({ resolve, reject });
    });
  }

  async terminate(reason: NativeIsolationTerminationReasonV1): Promise<void> {
    this.#terminationReason ??= reason;
    await this.killContainerDomain();
  }

  dispose(): Promise<void> {
    if (!isNil(this.#disposePromise)) return this.#disposePromise;
    this.#disposePromise = this.killContainerDomain();
    return this.#disposePromise;
  }

  collectControlPlaneReceipt() {
    if (!isNil(this.#evidencePromise)) return this.#evidencePromise;
    this.#evidencePromise = this.buildControlPlaneReceipt();
    return this.#evidencePromise;
  }

  private containerName(): string {
    const value = this.invocation.args[
      this.invocation.args.indexOf("--name") + 1
    ];
    assert.ok(value !== undefined);
    return value;
  }

  private async sampleKernelUsage(): Promise<void> {
    const result = await runCommand(this.dockerCommand, [
      "exec",
      this.containerName(),
      "node",
      "-e",
      [
        "const f=require('node:fs')",
        "const read=p=>f.readFileSync(p,'utf8')",
        "const cpu=Number(/usage_usec (\\d+)/.exec(read('/sys/fs/cgroup/cpu.stat'))?.[1]||0)",
        "const memory=Number(read('/sys/fs/cgroup/memory.peak').trim())",
        "const pids=Number(read('/sys/fs/cgroup/pids.peak').trim())",
        "process.stdout.write(JSON.stringify({cpu,memory,pids}))",
      ].join(";"),
    ], { maximumOutputBytes: 8_192, timeoutMilliseconds: 5_000 });
    if (result.exitCode !== 0) return;
    try {
      const parsed = JSON.parse(result.stdout) as Readonly<{
        cpu: unknown;
        memory: unknown;
        pids: unknown;
      }>;
      if (
        Number.isSafeInteger(parsed.cpu) && Number(parsed.cpu) >= 0 &&
        Number.isSafeInteger(parsed.memory) && Number(parsed.memory) >= 0 &&
        Number.isSafeInteger(parsed.pids) && Number(parsed.pids) >= 1
      ) {
        this.#processUsage = {
          actualCpuTimeMilliseconds: Math.ceil(Number(parsed.cpu) / 1_000),
          peakMemoryBytes: Number(parsed.memory),
          peakProcessCount: Number(parsed.pids),
        };
      }
    } catch {
      // A failed sample is represented conservatively in the terminal receipt.
    }
  }

  private killContainerDomain(): Promise<void> {
    if (!isNil(this.#killPromise)) return this.#killPromise;
    this.#killPromise = (async () => {
      await this.sampleKernelUsage();
      await runCommand(this.dockerCommand, ["kill", this.containerName()], {
        maximumOutputBytes: 8_192,
        timeoutMilliseconds: 10_000,
      }).catch(() => ({ exitCode: 1, stdout: "", stderr: "" }));
      this.#child.kill("SIGKILL");
      await this.#exitPromise;
    })();
    return this.#killPromise;
  }

  private async buildControlPlaneReceipt() {
    const request = this.#request;
    if (isNil(request) || isNil(this.#terminationReason)) {
      throw new Error("HOSTED_NATIVE_CONTAINER_RECEIPT_NOT_TERMINAL");
    }
    const containerName = this.containerName();
    const cleanupCensus = await runCommand(this.dockerCommand, [
      "ps",
      "-a",
      "--filter",
      `name=^/${containerName}$`,
      "--format",
      "{{.ID}}",
    ], { maximumOutputBytes: 8_192, timeoutMilliseconds: 10_000 });
    assert.equal(cleanupCensus.exitCode, 0);
    const cleanupComplete = cleanupCensus.stdout.trim().length === 0;
    const result = cleanupComplete
      ? terminationResult(request, this.#terminationReason)
      : {
          kind: "native-isolated-execution-result" as const,
          schemaVersion: 1 as const,
          id: `native-isolated-execution-result.${request.id}.cleanup-failed`,
          requestId: request.id,
          runtimeSessionId: request.runtimeSessionId,
          status: "cleanup-failed" as const,
          quarantineId: `native-isolation-quarantine.${request.id}`,
        };
    const contribution = this.verified.nativeSceneContribution;
    const assets = this.verified.assetLock.entries;
    const attestationBytes = new TextEncoder().encode(JSON.stringify({
      kind: "worldkit-native-isolation-attestation",
      schemaVersion: 1,
      requestHash: hashNativeIsolatedExecutionRequestV1(request),
      runnerImageDigest: request.runnerImageDigest,
      sandboxPolicyHash: request.sandboxPolicyHash,
      containerName,
      cleanupComplete,
      policyArgs: this.invocation.args.filter((value) =>
        !value.startsWith("worldkit/native") && !value.startsWith("sha256:")
      ),
    }));
    const usageWithoutReceiptBytes: NativeExecutionUsageV1 = {
      scene: {
        actualVertices: contribution.staticColliders.reduce(
          (sum, collider) => sum + collider.vertexCount,
          0,
        ),
        actualTriangles: contribution.staticColliders.reduce(
          (sum, collider) => sum + collider.triangleCount,
          0,
        ),
        actualColliders: contribution.staticColliders.length,
      },
      assets: {
        actualAssetCount: assets.length,
        actualAssetBytes: assets.reduce(
          (sum, asset) => sum + asset.artifactSizeBytes,
          0,
        ),
        actualTextureCount: 0,
        actualTextureBytes: 0,
      },
      runtime: {
        ...this.#runtimeUsage,
        // Material/shader creation is already fail-closed inside the trusted
        // runner. The external control plane records the admitted upper bound
        // because Babylon handles never cross the enclave boundary.
        actualMaterialCount: request.effectiveBudget.runtime.maximumMaterialCount,
        actualShaderCount: request.effectiveBudget.runtime.maximumShaderCount,
      },
      process: this.#processUsage.peakMemoryBytes === 0
        ? {
            actualWallTimeMilliseconds: Math.min(
              Date.now() - this.#startedAt,
              request.effectiveBudget.process.maximumWallTimeMilliseconds,
            ),
            actualCpuTimeMilliseconds:
              request.effectiveBudget.process.maximumCpuTimeMilliseconds,
            peakMemoryBytes: request.effectiveBudget.process.maximumMemoryBytes,
            peakProcessCount: request.effectiveBudget.process.maximumProcessCount,
          }
        : {
            actualWallTimeMilliseconds: Math.min(
              Date.now() - this.#startedAt,
              request.effectiveBudget.process.maximumWallTimeMilliseconds,
            ),
            actualCpuTimeMilliseconds: Math.min(
              this.#processUsage.actualCpuTimeMilliseconds,
              request.effectiveBudget.process.maximumCpuTimeMilliseconds,
            ),
            peakMemoryBytes: Math.min(
              this.#processUsage.peakMemoryBytes,
              request.effectiveBudget.process.maximumMemoryBytes,
            ),
            peakProcessCount: Math.min(
              this.#processUsage.peakProcessCount,
              request.effectiveBudget.process.maximumProcessCount,
            ),
          },
      protocol: {
        actualInboundMessageBytes: Math.min(
          this.#inboundBytes,
          request.effectiveBudget.protocol.maximumInboundMessageBytes,
        ),
        actualOutboundMessageBytes: Math.min(
          this.#stdoutBytes,
          request.effectiveBudget.protocol.maximumOutboundMessageBytes,
        ),
        actualReceiptBytes: 0,
        actualDiagnosticCount: 0,
        actualLogBytes: Math.min(
          this.#stderrBytes,
          request.effectiveBudget.protocol.maximumLogBytes,
        ),
      },
    };
    const receiptBody = (actualReceiptBytes: number) => ({
      kind: "native-isolated-execution-receipt" as const,
      schemaVersion: 1 as const,
      id: `native-isolated-execution-receipt.${request.id}`,
      requestId: request.id,
      requestHash: hashNativeIsolatedExecutionRequestV1(request),
      runtimeSessionId: request.runtimeSessionId,
      worldPackageRootHash: request.worldPackageRootHash,
      nativeExecutionTrustProfileRef:
        request.nativeExecutionTrustProfileRef,
      nativeExecutionTrustProfileHash:
        request.nativeExecutionTrustProfileHash,
      runnerIdentityRef: request.runnerIdentityRef,
      runnerImageDigest: request.runnerImageDigest,
      sandboxPolicyHash: request.sandboxPolicyHash,
      effectiveBudgetHash: request.effectiveBudgetHash,
      usage: {
        ...usageWithoutReceiptBytes,
        protocol: {
          ...usageWithoutReceiptBytes.protocol,
          actualReceiptBytes,
        },
      },
      requestedOperation: request.requestedOperation,
      outcome: result.status,
      resultHash: hashNativeIsolatedExecutionResultV1(result),
      durationMilliseconds: Date.now() - this.#startedAt,
      cleanup: cleanupComplete
        ? { status: "complete" as const }
        : {
            status: "quarantined" as const,
            quarantineId: result.status === "cleanup-failed"
              ? result.quarantineId
              : `native-isolation-quarantine.${request.id}`,
          },
      isolationAttestationRef:
        `worldkit://native-isolation-attestation/${request.id}@1`,
      isolationAttestationHash: sha256Bytes(attestationBytes),
    });
    let receiptBytes = 0;
    let receipt = receiptBody(receiptBytes);
    for (let iteration = 0; iteration < 8; iteration += 1) {
      receiptBytes = Buffer.byteLength(JSON.stringify(receipt));
      receipt = receiptBody(receiptBytes);
    }
    const parsedReceipt = parseNativeIsolatedExecutionReceiptV1(receipt);
    return Object.freeze({ result, receipt: parsedReceipt, attestationBytes });
  }
}

class DockerCommandRunner implements NativeContainerCommandRunnerV1 {
  readonly invocations: NativeContainerInvocationV1[] = [];
  readonly processes: DockerJsonLineProcess[] = [];

  constructor(
    private readonly dockerCommand: string,
    private readonly verified: VerifiedBabylonNativeWorldPackageDirectoryV1,
  ) {}

  async start(invocation: NativeContainerInvocationV1, signal: AbortSignal) {
    this.invocations.push(invocation);
    const process = new DockerJsonLineProcess(
      this.dockerCommand,
      invocation,
      this.verified,
      signal,
    );
    this.processes.push(process);
    return process;
  }
}

function createAttestationVerifier(
  request: NativeIsolatedExecutionRequestV1,
) {
  return Object.freeze({
    async verify(input: Readonly<{
      receipt: Readonly<{ isolationAttestationHash: string }>;
      attestationBytes: Uint8Array;
    }>) {
      if (sha256Bytes(input.attestationBytes) !== input.receipt.isolationAttestationHash) {
        return Object.freeze({
          status: "rejected" as const,
          diagnosticCode: "HOSTED_NATIVE_ATTESTATION_HASH_MISMATCH",
        });
      }
      try {
        const parsed = JSON.parse(new TextDecoder().decode(
          input.attestationBytes,
        )) as Readonly<Record<string, unknown>>;
        const exactKeys = [
          "cleanupComplete",
          "containerName",
          "kind",
          "policyArgs",
          "requestHash",
          "runnerImageDigest",
          "sandboxPolicyHash",
          "schemaVersion",
        ];
        if (
          JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify(exactKeys) ||
          parsed.kind !== "worldkit-native-isolation-attestation" ||
          parsed.schemaVersion !== 1 ||
          parsed.requestHash !== hashNativeIsolatedExecutionRequestV1(request) ||
          parsed.runnerImageDigest !== request.runnerImageDigest ||
          parsed.sandboxPolicyHash !== request.sandboxPolicyHash ||
          parsed.cleanupComplete !== true
        ) throw new Error("invalid attestation");
        return Object.freeze({ status: "verified" as const });
      } catch {
        return Object.freeze({
          status: "rejected" as const,
          diagnosticCode: "HOSTED_NATIVE_ATTESTATION_INVALID",
        });
      }
    },
  });
}

async function runCanary(
  dockerCommand: string,
  verified: VerifiedBabylonNativeWorldPackageDirectoryV1,
  imageDigest: `sha256:${string}`,
  suffix: string,
) {
  const request = isolatedRequest(verified, imageDigest, suffix);
  const runner = new DockerCommandRunner(dockerCommand, verified);
  const provider = createDockerNativeIsolationProviderV1({
    runnerIdentityRef: RUNNER_IDENTITY_REF,
    runnerImageRef: imageDigest,
    runnerImageDigest: imageDigest,
    sandboxPolicyHash: SANDBOX_POLICY_HASH,
    packageHostPath: PACKAGE_ROOT,
    commandRunner: runner,
  });
  const supervisor = NativeIsolationSupervisorV1.create({
    request,
    provider,
    attestationVerifier: createAttestationVerifier(request),
  });
  const ready = await supervisor.start();
  assert.equal(ready.status, "ready");
  const snapshotRequest = {
    kind: "worldkit-runtime-session-request" as const,
    schemaVersion: 1 as const,
    id: `request.snapshot.${suffix}`,
    runtimeSessionId: request.runtimeSessionId,
    type: "snapshot.get" as const,
  };
  const envelope: NativeIsolationTransportEnvelopeV1 = {
    kind: "native-isolation-transport-envelope",
    schemaVersion: 1,
    runtimeSessionId: request.runtimeSessionId,
    sessionNonce: request.sessionNonce,
    messageSequence: 1,
    payload: snapshotRequest,
  };
  const response = await supervisor.submit(envelope);
  assert.equal(response.messageSequence, 1);
  await supervisor.terminate("host-cancelled");
  const evidence = await runner.processes[0]!.collectControlPlaneReceipt();
  assert.equal(evidence.result.status, "terminated");
  assert.equal(
    evidence.receipt.isolationAttestationHash,
    sha256Bytes(evidence.attestationBytes),
  );
  return Object.freeze({
    invocation: runner.invocations[0]!,
    summary: Object.freeze({
      requestId: request.id,
      worldPackageRootHash: request.worldPackageRootHash,
      receiptId: evidence.receipt.id,
      cleanup: evidence.receipt.cleanup,
    }),
  });
}

async function runHostileCases(
  dockerCommand: string,
  baseline: NativeContainerInvocationV1,
  imageDigest: `sha256:${string}`,
) {
  const cases = [
    { id: "network", timeoutMilliseconds: 10_000, expectedExitMode: "clean" },
    { id: "environment", timeoutMilliseconds: 10_000, expectedExitMode: "clean" },
    { id: "filesystem", timeoutMilliseconds: 10_000, expectedExitMode: "clean" },
    { id: "process", timeoutMilliseconds: 10_000, expectedExitMode: "clean" },
    { id: "cross-run-write", timeoutMilliseconds: 10_000, expectedExitMode: "clean" },
    { id: "cross-run-read", timeoutMilliseconds: 10_000, expectedExitMode: "clean" },
    { id: "cpu", timeoutMilliseconds: 1_500, expectedExitMode: "terminated" },
    { id: "memory", timeoutMilliseconds: 20_000, expectedExitMode: "terminated" },
    { id: "output", timeoutMilliseconds: 10_000, expectedExitMode: "bounded" },
    { id: "protocol", timeoutMilliseconds: 10_000, expectedExitMode: "protocol" },
  ] as const;
  const imageIndex = baseline.args.lastIndexOf(imageDigest);
  assert.ok(imageIndex > 0);
  const baselineNameIndex = baseline.args.indexOf("--name") + 1;
  const pidsLimitIndex = baseline.args.indexOf("--pids-limit") + 1;
  const memoryLimitIndex = baseline.args.indexOf("--memory") + 1;
  const results = [];
  for (const hostile of cases) {
    const args = [...baseline.args];
    const containerName = `worldkit-native-hostile-${hostile.id}`;
    args[baselineNameIndex] = containerName;
    if (hostile.id === "process") args[pidsLimitIndex] = "2";
    if (hostile.id === "memory") args[memoryLimitIndex] = "67108864";
    args.splice(imageIndex, 0, "--entrypoint", "node");
    args.push(`/runner/hostile-fixtures/${hostile.id}.mjs`);
    const result = await runCommand(dockerCommand, args, {
      cwd: baseline.cwd,
      env: baseline.env,
      maximumOutputBytes: hostile.id === "output" ? 65_536 : 262_144,
      timeoutMilliseconds: hostile.timeoutMilliseconds,
    });
    const unexpectedMarker = /UNEXPECTED_[A-Z_]+/.exec(result.stdout)?.[0];
    assert.equal(
      unexpectedMarker,
      undefined,
      `Hostile ${hostile.id} escaped: ${unexpectedMarker}`,
    );
    if (hostile.expectedExitMode === "clean") assert.equal(result.exitCode, 0);
    if (
      hostile.expectedExitMode === "terminated" ||
      hostile.expectedExitMode === "bounded"
    ) assert.notEqual(result.exitCode, 0);
    if (hostile.expectedExitMode === "protocol") {
      assert.match(result.stdout, /not-a-runtime-envelope/);
    }
    await runCommand(dockerCommand, ["rm", "--force", containerName], {
      maximumOutputBytes: 8_192,
      timeoutMilliseconds: 10_000,
    }).catch(() => ({ exitCode: 1, stdout: "", stderr: "" }));
    results.push(Object.freeze({
      id: hostile.id,
      expectedExitMode: hostile.expectedExitMode,
      exitCode: result.exitCode,
      outputWasBounded: Buffer.byteLength(result.stdout) <=
        (hostile.id === "output" ? 65_536 : 262_144),
      unexpectedSuccessMarker: false,
    }));
  }
  return Object.freeze(results);
}

async function main(): Promise<void> {
  const dockerCommand = await resolveDockerCommand();
  const dockerVersion = await runCommand(dockerCommand, [
    "version",
    "--format",
    "{{.Server.Version}}",
  ], { maximumOutputBytes: 8_192, timeoutMilliseconds: 20_000 });
  if (dockerVersion.exitCode !== 0 || dockerVersion.stdout.trim().length === 0) {
    throw new Error("HOSTED_NATIVE_DOCKER_DAEMON_UNAVAILABLE");
  }
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "worldkit-bna5-"));
  try {
    const iidFile = path.join(temporaryRoot, "runner-image-id.txt");
    const build = await runCommand(dockerCommand, [
      "build",
      "--file",
      DOCKERFILE_PATH,
      "--iidfile",
      iidFile,
      REPOSITORY_ROOT,
    ], {
      maximumOutputBytes: 8_000_000,
      timeoutMilliseconds: 900_000,
    });
    assert.equal(build.exitCode, 0, "Hosted runner image build failed.");
    const imageDigest = (await readFile(iidFile, "utf8")).trim() as
      `sha256:${string}`;
    assert.match(imageDigest, /^sha256:[0-9a-f]{64}$/);
    const imageUser = await runCommand(dockerCommand, [
      "image",
      "inspect",
      "--format",
      "{{.Config.User}}",
      imageDigest,
    ], { maximumOutputBytes: 8_192, timeoutMilliseconds: 20_000 });
    assert.equal(imageUser.exitCode, 0);
    assert.equal(imageUser.stdout.trim(), "10001:10001");
    const verified = await verifiedPackage();
    const hostCanaryPath = path.join(temporaryRoot, "host-canary.txt");
    const hostCanaryBytes = new TextEncoder().encode("host-owned-canary");
    await writeFile(hostCanaryPath, hostCanaryBytes, { flag: "wx", mode: 0o600 });
    const simultaneousRuns = await Promise.all([
      runCanary(dockerCommand, verified, imageDigest, "tenant-a"),
      runCanary(dockerCommand, verified, imageDigest, "tenant-b"),
    ]);
    const hostileCases = await runHostileCases(
      dockerCommand,
      simultaneousRuns[0]!.invocation,
      imageDigest,
    );
    const sequentialRuns = [
      await runCanary(dockerCommand, verified, imageDigest, "reuse-a"),
      await runCanary(dockerCommand, verified, imageDigest, "reuse-b"),
    ];
    const retained = await runCommand(dockerCommand, [
      "ps",
      "-a",
      "--filter",
      "name=worldkit-native-",
      "--format",
      "{{.ID}}",
    ], { maximumOutputBytes: 65_536, timeoutMilliseconds: 20_000 });
    assert.equal(retained.exitCode, 0);
    assert.equal(retained.stdout.trim(), "");
    assert.equal(
      sha256Bytes(new Uint8Array(await readFile(hostCanaryPath))),
      sha256Bytes(hostCanaryBytes),
    );
    const dockerInfo = await runCommand(dockerCommand, [
      "info",
      "--format",
      "{{json .SecurityOptions}}",
    ], { maximumOutputBytes: 65_536, timeoutMilliseconds: 20_000 });
    assert.equal(dockerInfo.exitCode, 0);
    const securityOptions = dockerInfo.stdout.trim();
    const hasSeccomp = securityOptions.includes("seccomp");
    const hasRootlessOrUserNamespace =
      securityOptions.includes("rootless") ||
      securityOptions.includes("userns");
    assert.equal(hasSeccomp, true);
    const report = Object.freeze({
      ok: true,
      runnerImageDigest: imageDigest,
      sandboxPolicyHash: SANDBOX_POLICY_HASH,
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      dockerServerVersion: dockerVersion.stdout.trim(),
      imageUser: imageUser.stdout.trim(),
      securityOptions,
      hasSeccomp,
      hasRootlessOrUserNamespace,
      hostedProductionDisposition:
        hasRootlessOrUserNamespace ? "eligible" : "no-go",
      hostileCases,
      simultaneousTenantCanaries: simultaneousRuns.map(({ summary }) => summary),
      sequentialReuseCanaries: sequentialRuns.map(({ summary }) => summary),
      cleanupCensus: Object.freeze({ retainedContainerCount: 0 }),
      hostCanaryUnchanged: true,
    });
    await writeFile(
      path.join(temporaryRoot, "hosted-native-isolation-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
