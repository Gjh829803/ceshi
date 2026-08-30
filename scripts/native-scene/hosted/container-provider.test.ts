import { mkdtemp, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  hashNativeEffectiveExecutionBudgetV1,
  type NativeEffectiveExecutionBudgetV1,
  type NativeIsolatedExecutionRequestV1,
} from "@whitebox-world/runtime-contracts";
import { NativeIsolationProviderTerminationErrorV1 } from
  "@whitebox-world/runtime-host";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDockerNativeIsolationProviderV1,
  type NativeContainerCommandProcessV1,
  type NativeContainerCommandRunnerV1,
  type NativeContainerInvocationV1,
} from "./container-provider";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await import("node:fs/promises").then(({ rm }) =>
      rm(directory, { recursive: true, force: true })
    );
  }));
});

function budget(): NativeEffectiveExecutionBudgetV1 {
  return {
    scene: {
      maximumVertices: 1_000,
      maximumTriangles: 2_000,
      maximumColliders: 10,
    },
    assets: {
      maximumAssetCount: 20,
      maximumAssetBytes: 30_000_000,
      maximumTextureCount: 10,
      maximumTextureBytes: 20_000_000,
    },
    runtime: {
      maximumSceneNodeCount: 2_000,
      maximumMaterialCount: 200,
      maximumShaderCount: 100,
      maximumPhysicsBodyCount: 100,
    },
    process: {
      maximumWallTimeMilliseconds: 60_000,
      maximumCpuTimeMilliseconds: 30_000,
      maximumMemoryBytes: 536_870_912,
      maximumProcessCount: 32,
    },
    protocol: {
      maximumInboundMessageBytes: 1_048_576,
      maximumOutboundMessageBytes: 1_048_576,
      maximumReceiptBytes: 1_048_576,
      maximumDiagnosticCount: 100,
      maximumLogBytes: 65_536,
    },
  };
}

function request(): NativeIsolatedExecutionRequestV1 {
  const effectiveBudget = budget();
  return {
    kind: "native-isolated-execution-request",
    schemaVersion: 1,
    id: "native-isolated-execution-request.container.001",
    runtimeSessionId: "runtime.container.001",
    worldPackageRef: `package://world-package/sha256/${"a".repeat(64)}`,
    worldPackageRootHash: `sha256:${"a".repeat(64)}`,
    worldBuildIdentityHash: `sha256:${"b".repeat(64)}`,
    sceneModuleBundleHash: `sha256:${"c".repeat(64)}`,
    nativeSceneContributionHash: `sha256:${"d".repeat(64)}`,
    nativeExecutionTrustProfileRef:
      "worldkit://native-execution-trust-profile/hosted-isolated@1",
    nativeExecutionTrustProfileHash: `sha256:${"e".repeat(64)}`,
    runnerIdentityRef: "worldkit://native-isolation-runner/docker-linux@1",
    runnerImageDigest: `sha256:${"f".repeat(64)}`,
    sandboxPolicyHash: `sha256:${"1".repeat(64)}`,
    effectiveBudget,
    effectiveBudgetHash:
      hashNativeEffectiveExecutionBudgetV1(effectiveBudget),
    requestedOperation: { mode: "interactive-session" },
    sessionNonce: "nonce.container.001;--privileged;/var/run/docker.sock",
  };
}

async function packageDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "worldkit-native-package-"));
  temporaryDirectories.push(directory);
  return realpath(directory);
}

function runnerHarness(): Readonly<{
  runner: NativeContainerCommandRunnerV1;
  invocations: NativeContainerInvocationV1[];
  process: NativeContainerCommandProcessV1;
}> {
  const invocations: NativeContainerInvocationV1[] = [];
  const process: NativeContainerCommandProcessV1 = {
    exchangeLine: vi.fn(async () => JSON.stringify({
      kind: "native-isolated-execution-result",
      schemaVersion: 1,
      id: "native-isolated-execution-result.ready.container.001",
      requestId: request().id,
      runtimeSessionId: request().runtimeSessionId,
      status: "ready",
      runtimeSessionUri: "worldkit://runtime-session/runtime.container.001",
      initialSnapshotHash: `sha256:${"2".repeat(64)}`,
    })),
    terminate: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
    collectControlPlaneReceipt: vi.fn(async () => {
      throw new Error("terminal evidence is not requested by this fixture");
    }),
  };
  return {
    runner: {
      async start(invocation) {
        invocations.push(invocation);
        return process;
      },
    },
    invocations,
    process,
  };
}

describe("Docker Native isolation provider", () => {
  it("builds a digest-only, networkless, read-only and non-root invocation from trusted options", async () => {
    const packageHostPath = await packageDirectory();
    const harness = runnerHarness();
    const provider = createDockerNativeIsolationProviderV1({
      runnerIdentityRef: request().runnerIdentityRef,
      runnerImageRef:
        `worldkit/native-isolation-runner@${request().runnerImageDigest}`,
      runnerImageDigest: request().runnerImageDigest,
      sandboxPolicyHash: request().sandboxPolicyHash,
      packageHostPath,
      commandRunner: harness.runner,
    });
    const prepared = await provider.prepare(request(), new AbortController().signal);
    await prepared.start();

    expect(harness.invocations).toHaveLength(1);
    const invocation = harness.invocations[0]!;
    expect(invocation.command).toBe("docker");
    expect(invocation.cwd).toBe(packageHostPath);
    expect(invocation.env).toEqual({ LC_ALL: "C", LANG: "C" });
    expect(invocation.args).toEqual(expect.arrayContaining([
      "run",
      "--interactive",
      "--rm",
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--security-opt",
      "seccomp=builtin",
      "--pids-limit",
      String(budget().process.maximumProcessCount),
      "--cpu-period",
      "100000",
      "--cpu-quota",
      "50000",
      "--memory",
      String(budget().process.maximumMemoryBytes),
      "--memory-swap",
      String(budget().process.maximumMemoryBytes),
      "--init",
      "--stop-timeout",
      "1",
      "--user",
      "10001:10001",
      "worldkit/native-isolation-runner@sha256:" + "f".repeat(64),
    ]));
    expect(invocation.args).toContain(
      "type=bind,src=.,dst=/world-package,readonly,bind-propagation=rprivate",
    );
    expect(invocation.args.join(" ")).not.toContain(packageHostPath);
    expect(invocation.args.join(" ")).not.toContain(request().sessionNonce);
    expect(invocation.args).not.toContain("--privileged");
    expect(invocation.args).not.toContain("--device");
    expect(invocation.args.join(" ")).not.toContain("docker.sock");
    expect(invocation.maximumStdoutBytes).toBe(
      budget().protocol.maximumOutboundMessageBytes,
    );
    expect(invocation.maximumStderrBytes).toBe(
      budget().protocol.maximumLogBytes,
    );
    expect(invocation.timeoutMilliseconds).toBe(
      budget().process.maximumWallTimeMilliseconds,
    );
  });

  it("rejects tag-only images and non-absolute or symlinked Package paths before starting Docker", async () => {
    const packageHostPath = await packageDirectory();
    const harness = runnerHarness();
    expect(() => createDockerNativeIsolationProviderV1({
      runnerIdentityRef: request().runnerIdentityRef,
      runnerImageRef: "worldkit/native-isolation-runner:latest",
      runnerImageDigest: request().runnerImageDigest,
      sandboxPolicyHash: request().sandboxPolicyHash,
      packageHostPath,
      commandRunner: harness.runner,
    })).toThrow(/DOCKER_NATIVE_ISOLATION_IMAGE_INVALID/);
    expect(() => createDockerNativeIsolationProviderV1({
      runnerIdentityRef: request().runnerIdentityRef,
      runnerImageRef:
        `worldkit/native-isolation-runner@${request().runnerImageDigest}`,
      runnerImageDigest: request().runnerImageDigest,
      sandboxPolicyHash: request().sandboxPolicyHash,
      packageHostPath: "relative/package",
      commandRunner: harness.runner,
    })).toThrow(/DOCKER_NATIVE_ISOLATION_PACKAGE_PATH_INVALID/);
    expect(harness.invocations).toEqual([]);
  });

  it("binds the admitted runner digest, policy hash and a non-symlink Package root before allocation", async () => {
    const packageHostPath = await packageDirectory();
    const symlinkRoot = `${packageHostPath}-link`;
    temporaryDirectories.push(symlinkRoot);
    await symlink(packageHostPath, symlinkRoot, "dir");
    const harness = runnerHarness();
    const exactOptions = {
      runnerIdentityRef: request().runnerIdentityRef,
      runnerImageRef:
        `worldkit/native-isolation-runner@${request().runnerImageDigest}`,
      runnerImageDigest: request().runnerImageDigest,
      sandboxPolicyHash: request().sandboxPolicyHash,
      packageHostPath,
      commandRunner: harness.runner,
    } as const;
    const provider = createDockerNativeIsolationProviderV1(exactOptions);
    await expect(provider.prepare({
      ...request(),
      runnerImageDigest: `sha256:${"9".repeat(64)}`,
    }, new AbortController().signal)).rejects.toMatchObject({
      code: "DOCKER_NATIVE_ISOLATION_IDENTITY_MISMATCH",
    });
    const symlinkProvider = createDockerNativeIsolationProviderV1({
      ...exactOptions,
      packageHostPath: symlinkRoot,
    });
    await expect(symlinkProvider.prepare(
      request(),
      new AbortController().signal,
    )).rejects.toMatchObject({
      code: "DOCKER_NATIVE_ISOLATION_PACKAGE_PATH_INVALID",
    });
    expect(harness.invocations).toEqual([]);
  });

  it("preserves a command-runner resource termination for the Host supervisor", async () => {
    const packageHostPath = await packageDirectory();
    const harness = runnerHarness();
    const provider = createDockerNativeIsolationProviderV1({
      runnerIdentityRef: request().runnerIdentityRef,
      runnerImageRef:
        `worldkit/native-isolation-runner@${request().runnerImageDigest}`,
      runnerImageDigest: request().runnerImageDigest,
      sandboxPolicyHash: request().sandboxPolicyHash,
      packageHostPath,
      commandRunner: harness.runner,
    });
    const prepared = await provider.prepare(
      request(),
      new AbortController().signal,
    );
    await prepared.start();
    vi.mocked(harness.process.exchangeLine).mockRejectedValueOnce(
      new NativeIsolationProviderTerminationErrorV1("output-limit"),
    );

    await expect(prepared.submit({
      kind: "native-isolation-transport-envelope",
      schemaVersion: 1,
      runtimeSessionId: request().runtimeSessionId,
      sessionNonce: request().sessionNonce,
      messageSequence: 1,
      payload: {
        kind: "worldkit-runtime-session-request",
        schemaVersion: 1,
        id: "runtime-session-request.container.output-limit.001",
        runtimeSessionId: request().runtimeSessionId,
        type: "snapshot.get",
      },
    })).rejects.toMatchObject({ reason: "output-limit" });
  });
});
