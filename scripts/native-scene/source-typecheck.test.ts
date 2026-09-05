import { describe, expect, it } from "vitest";
import ts from "typescript";
import { nativeSourceTypecheckMessage, parseNativeSourceTypecheckDiagnostics } from "./source-typecheck.js";

describe("Native source type feedback", () => {
  it("keeps concrete compiler codes while bounding and redacting source-derived details", () => {
    const message = nativeSourceTypecheckMessage({
      category: ts.DiagnosticCategory.Error, code: 2322, file: undefined,
      start: undefined, length: undefined,
      messageText: "Type at /Users/private/secret.ts https://provider.invalid/key?token=hidden sk-testsecret123 token=hidden is not assignable. " + "x".repeat(2000),
    });
    expect(message).toContain("TS2322:");
    expect(message).toContain("not assignable");
    expect(message).not.toMatch(/Users|provider\.invalid|sk-testsecret|=hidden/);
    expect(message.length).toBeLessThanOrEqual(1230);
  });
  it("validates bounded, relative compiler feedback before persisting it", () => {
    const row = { code: "WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED", typescriptCode: 18048,
      sourcePath: "scene.ts", lineNumber: 324, columnNumber: 32,
      message: "TS18048: 'xOffset' is possibly 'undefined'." };
    expect(parseNativeSourceTypecheckDiagnostics([row])).toEqual([row]);
    expect(() => parseNativeSourceTypecheckDiagnostics([{ ...row, sourcePath: "/private/leak.ts" }])).toThrow();
    expect(() => parseNativeSourceTypecheckDiagnostics([{ ...row, lineNumber: 0 }])).toThrow();
    expect(() => parseNativeSourceTypecheckDiagnostics(Array(101).fill(row))).toThrow();
  });
});
