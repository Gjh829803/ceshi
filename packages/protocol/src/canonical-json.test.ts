import { describe, expect, it } from "vitest";

import {
  canonicalJsonBytes,
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

  it("rejects non-finite numbers", () => {
    expect(() => stringifyCanonicalJson({ bad: Number.NaN })).toThrow(/finite/i);
  });
});
