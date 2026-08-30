import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { parseNativeIsolatedExecutionResultV1 } from
  "@whitebox-world/runtime-contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  createHostedNativeRuntimeUsageChallengeV1,
  parseHostedNativeRuntimeUsageFrameV1,
  verifyHostedNativeRuntimeUsageFrameV1,
} from "../runtime-usage-frame";

const children: ReturnType<typeof spawn>[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill("SIGKILL");
});

function nextLine(lines: ReturnType<typeof createInterface>): Promise<string> {
  return new Promise((resolve) => lines.once("line", resolve));
}

describe("Hosted Native CPU hostile fixture", () => {
  it("completes the fresh runtime-usage challenge before consuming CPU", async () => {
    const child = spawn(process.execPath, [
      new URL("./cpu.mjs", import.meta.url).pathname,
    ], { stdio: ["pipe", "pipe", "pipe"] });
    children.push(child);
    const lines = createInterface({ input: child.stdout });
    const request = {
      id: "native-isolated-execution-request.cpu-fixture",
      runtimeSessionId: "runtime.cpu-fixture",
      sessionNonce: "session-nonce.cpu-fixture",
    };
    child.stdin.write(`${JSON.stringify(request)}\n`);
    expect(parseNativeIsolatedExecutionResultV1(
      JSON.parse(await nextLine(lines)),
    )).toMatchObject({
      requestId: request.id,
      runtimeSessionId: request.runtimeSessionId,
      status: "ready",
    });

    const challenge = createHostedNativeRuntimeUsageChallengeV1({
      requestHash: sha256CanonicalJson(request),
      runtimeSessionId: request.runtimeSessionId,
      sessionNonce: request.sessionNonce,
      challengeNonce: "challenge-nonce.cpu-fixture",
    });
    child.stdin.write(`${JSON.stringify(challenge)}\n`);
    const frame = parseHostedNativeRuntimeUsageFrameV1(
      JSON.parse(await nextLine(lines)),
    );

    expect(verifyHostedNativeRuntimeUsageFrameV1({ challenge, frame })).toEqual({
      actualSceneNodeCount: 0,
      actualMaterialCount: 0,
      actualShaderCount: 0,
      actualPhysicsBodyCount: 0,
    });
  }, 10_000);
});
