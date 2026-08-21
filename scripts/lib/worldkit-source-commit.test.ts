import { describe, expect, it } from "vitest";

import {
  FORGED_ZERO_SOURCE_COMMIT,
  parseTrustedSourceCommit,
  resolveTrustedSourceCommit,
} from "./worldkit-source-commit";

describe("trusted source commit", () => {
  it("rejects missing, malformed, and forged all-zero commits", () => {
    expect(parseTrustedSourceCommit(undefined)).toBeUndefined();
    expect(parseTrustedSourceCommit("")).toBeUndefined();
    expect(parseTrustedSourceCommit("main")).toBeUndefined();
    expect(parseTrustedSourceCommit(FORGED_ZERO_SOURCE_COMMIT)).toBeUndefined();
    expect(parseTrustedSourceCommit("0".repeat(40))).toBeUndefined();
    expect(parseTrustedSourceCommit("0123456789abcdef0123456789abcdef01234567"))
      .toBe("0123456789abcdef0123456789abcdef01234567");
  });

  it("prefers a host-injected commit over git and never emits all zeros", async () => {
    await expect(resolveTrustedSourceCommit({
      envCommit: FORGED_ZERO_SOURCE_COMMIT,
      gitCommit: async () => "0123456789abcdef0123456789abcdef01234567",
    })).resolves.toBe("0123456789abcdef0123456789abcdef01234567");

    await expect(resolveTrustedSourceCommit({
      envCommit: "0123456789abcdef0123456789abcdef01234567",
      gitCommit: async () => FORGED_ZERO_SOURCE_COMMIT,
    })).resolves.toBe("0123456789abcdef0123456789abcdef01234567");

    await expect(resolveTrustedSourceCommit({
      gitCommit: async () => FORGED_ZERO_SOURCE_COMMIT,
    })).rejects.toThrow("WORLDKIT_SOURCE_COMMIT_UNTRUSTED");
  });
});
