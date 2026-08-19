import { describe, expect, it } from "vitest";

import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "./index";

describe("canonical JSON protocol", () => {
  it("sorts object keys while preserving array order", () => {
    expect(stringifyCanonicalJson({ z: 1, a: [3, 2, 1] })).toBe(
      '{"a":[3,2,1],"z":1}',
    );
  });

  it("returns stable UTF-8 bytes and a domain-formatted SHA-256", () => {
    expect(new TextDecoder().decode(canonicalJsonBytes({ value: "世界" }))).toBe(
      '{"value":"世界"}',
    );
    expect(sha256CanonicalJson({ a: 1 })).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("hashes raw bytes without canonical JSON conversion", () => {
    expect(sha256Bytes(new Uint8Array([0, 1, 2]))).toBe(
      "sha256:ae4b3280e56e2faf83f414a6e3dabe9d5fbe18976544c05fed121accb85b53fc",
    );
  });

  it("rejects non-finite numbers", () => {
    expect(() => stringifyCanonicalJson({ bad: Number.NaN })).toThrow(/finite/i);
  });
});
