import { describe, expect, it } from "vitest";
import { isNativeRecordingRequest, parseNativeRecordingBinding } from "./native-recording-binding.js";
import { createNativeWorldkitServerChildEnvironmentV1 } from "./worldkit-server.js";

const binding = { sceneId: "palace", studioOrigin: "http://127.0.0.1:3000",
  worldPackageRootHash: `sha256:${"a".repeat(64)}` as const, capability: "b".repeat(64) };
describe("Native recording binding", () => {
  it("accepts only exact local Studio configuration without credential-bearing URLs", () => {
    expect(parseNativeRecordingBinding(binding)).toEqual(binding);
    for (const studioOrigin of ["https://example.com", "http://127.0.0.1:3000/path", "http://user:password@127.0.0.1:3000", "http://127.0.0.1:3000/?secret=1"]) {
      expect(() => parseNativeRecordingBinding({ ...binding, studioOrigin })).toThrow();
    }
    for (const extra of [{ sceneId: "../other" }, { capability: "short" }, { password: "not-a-field" }]) {
      expect(() => parseNativeRecordingBinding({ ...binding, ...extra })).toThrow();
    }
  });
  it("scopes methods, recording ids and media paths to one scene", () => {
    const id = "recording-20260906t010203-abcdef";
    expect(isNativeRecordingRequest("palace", "POST", "/api/recording-worlds/palace/recordings")).toBe(true);
    expect(isNativeRecordingRequest("palace", "POST", `/api/recording-worlds/palace/recordings/${id}/generate`)).toBe(true);
    expect(isNativeRecordingRequest("palace", "GET", "/api/worlds/palace/styled-triviews/hero")).toBe(true);
    expect(isNativeRecordingRequest("palace", "HEAD", `/api/recording-worlds/palace/recordings/${id}/source`)).toBe(true);
    expect(isNativeRecordingRequest("palace", "HEAD", `/api/recording-worlds/palace/recordings/${id}/bundle`)).toBe(false);
    expect(isNativeRecordingRequest("palace", "HEAD", "/api/worlds/palace/styled-triviews/hero")).toBe(true);
    for (const pathname of ["/api/worlds/palace/recording-preview", "/api/worlds/palace/retry", "/api/recording-worlds/another/recordings", "/api/worlds/palace/deliverables/agent-log", "/api/worlds/palace/styled-triviews/../secret"]) {
      expect(isNativeRecordingRequest("palace", "GET", pathname)).toBe(false);
      expect(isNativeRecordingRequest("palace", "POST", pathname)).toBe(false);
    }
    expect(isNativeRecordingRequest("palace", "DELETE", "/api/recording-worlds/palace/recordings")).toBe(false);
  });
  it("passes the capability to the trusted shell only, never the Runtime environment", () => {
    const input = { ambientEnvironment: { WORLDKIT_STUDIO_RECORDING_BINDING: "ambient-secret" },
      packageDirectoryPath: "/package", nonce: "nonce", serverInstanceId: "server", viteCacheRootPath: "/cache",
      shellOrigin: "http://127.0.0.1:5174", runtimeOrigin: "http://127.0.0.1:5175", recordingBinding: binding };
    const shell = createNativeWorldkitServerChildEnvironmentV1({ ...input, serverRole: "shell" });
    expect(JSON.parse(shell.WORLDKIT_STUDIO_RECORDING_BINDING!)).toEqual(binding);
    const runtime = createNativeWorldkitServerChildEnvironmentV1({ ...input, serverRole: "runtime" });
    expect(runtime.WORLDKIT_STUDIO_RECORDING_BINDING).toBeUndefined();
    expect(JSON.stringify(runtime)).not.toContain(binding.capability);
  });
});
