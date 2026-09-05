import { describe, expect, it } from "vitest";

import {
  parseWorldAgentArgumentsV1,
  resolveWorldAgentInvocationV1,
} from "./run-world-agent.js";

describe("the single public world-generation entry", () => {
  it.each(["--plan-only", "--build-only"])("preserves Native %s staging without selecting another pipeline", (flag) => {
    const request = parseWorldAgentArgumentsV1([
      "--scene-id", "native-staged", flag,
      ...(flag === "--plan-only" ? ["reconstruct the palace"] : []),
    ]);
    expect(request.mode).toBe(flag === "--plan-only" ? "plan" : "build");
    expect(resolveWorldAgentInvocationV1(request).arguments).toContain(flag);
    expect(resolveWorldAgentInvocationV1(request).arguments).toContain("scripts/reconstruction/run-native-world-agent.ts");
  });

  it("does not accept new images or conflicting modes while building a frozen plan", () => {
    for (const args of [
      ["--build-only", "--image", "new-reference.png"],
      ["--plan-only", "--build-only", "reconstruct"],
      ["--plan-only"],
    ]) expect(() => parseWorldAgentArgumentsV1(["--scene-id", "native-staged", ...args]))
      .toThrow("WORLD_AGENT_ARGUMENTS_INVALID");
  });

  it("defaults omitted Scene Source to Babylon Native", () => {
    const request = parseWorldAgentArgumentsV1([
      "--scene-id", "forest-world",
      "reconstruct the forest",
    ]);
    expect(request).toMatchObject({
      sceneId: "forest-world",
      sceneSourceKind: "babylon-native",
      prompt: "reconstruct the forest",
    });
    const invocation = resolveWorldAgentInvocationV1(request);
    expect(invocation.command).toBe("pnpm");
    expect(invocation.arguments.slice(0, 3)).toEqual([
      "exec", "tsx", "scripts/reconstruction/run-native-world-agent.ts",
    ]);
  });

  it("retains Canonical only through an explicit current Source selection", () => {
    const request = parseWorldAgentArgumentsV1([
      "--scene-source", "canonical",
      "--scene-id", "plain-world",
      "make an open plain",
    ]);
    expect(request.sceneSourceKind).toBe("canonical");
    const invocation = resolveWorldAgentInvocationV1(request);
    expect(invocation.command).toBe("bash");
    expect(invocation.arguments[0]).toBe(
      "scripts/agents/run-canonical-world-agent.sh",
    );
    expect(invocation.arguments.slice(1, 3)).toEqual([
      "--scene-source", "canonical",
    ]);
  });

  it("preserves image inputs and rejects aliases or unknown Sources", () => {
    const request = parseWorldAgentArgumentsV1([
      "--scene-id", "image-world",
      "--image", "/tmp/reference.png",
      "reconstruct it",
    ]);
    expect(request.imagePaths).toEqual(["/tmp/reference.png"]);

    for (const arguments_ of [
      ["--source", "canonical", "--scene-id", "bad", "bad"],
      ["--scene-source", "native", "--scene-id", "bad", "bad"],
    ]) {
      expect(() => parseWorldAgentArgumentsV1(arguments_)).toThrow(
        "WORLD_AGENT_ARGUMENTS_INVALID",
      );
    }
  });
});
