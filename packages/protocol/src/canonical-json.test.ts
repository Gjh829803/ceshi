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

  it.each([
    ["Map", new Map([["key", "value"]])],
    ["Set", new Set(["value"])],
    ["Date", new Date("2026-08-21T00:00:00.000Z")],
    ["typed array", new Uint16Array([1, 2])],
    ["class instance", new (class CanonicalJsonFixture {
      readonly value = 1;
    })()],
    ["null-prototype object", Object.assign(Object.create(null), { value: 1 })],
  ])("rejects a %s at its canonical path", (_label, unsupportedValue) => {
    const input = { nested: { unsupportedValue } };
    const expectedMessage =
      "Non-plain object at /nested/unsupportedValue is unsupported canonical JSON.";

    expect(() => stringifyCanonicalJson(input)).toThrow(expectedMessage);
    expect(() => sha256CanonicalJson(input)).toThrow(expectedMessage);
  });

  it("rejects own symbol keys at the containing canonical path", () => {
    const nested = { value: 1, [Symbol("hidden")]: 2 };
    const input = { nested };
    const expectedMessage =
      "Symbol-keyed property at /nested is unsupported canonical JSON.";

    expect(() => stringifyCanonicalJson(input)).toThrow(expectedMessage);
    expect(() => sha256CanonicalJson(input)).toThrow(expectedMessage);
  });

  it("continues to accept arrays and plain objects with canonical omissions", () => {
    expect(stringifyCanonicalJson({
      omitted: undefined,
      values: [-0, { z: 2, a: 1 }],
    })).toBe('{"values":[0,{"a":1,"z":2}]}');
  });
});
