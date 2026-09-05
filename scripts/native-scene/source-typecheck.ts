import ts from "typescript";

export interface NativeSourceTypecheckDiagnostic {
  readonly code: "WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED";
  readonly typescriptCode: number;
  readonly sourcePath: "scene.ts" | null;
  readonly lineNumber: number | null;
  readonly columnNumber: number | null;
  readonly message: string;
}

export function parseNativeSourceTypecheckDiagnostics(value: unknown): readonly NativeSourceTypecheckDiagnostic[] {
  if (!Array.isArray(value) || value.length > 100) throw new TypeError("Invalid typecheck diagnostics");
  return value.map((row: unknown) => {
    if (row === null || typeof row !== "object") throw new TypeError("Invalid typecheck diagnostic");
    const item = row as Record<string, unknown>;
    if (item.code !== "WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED" ||
        typeof item.typescriptCode !== "number" || !Number.isSafeInteger(item.typescriptCode) || item.typescriptCode < 1 ||
        (item.sourcePath !== "scene.ts" && item.sourcePath !== null) ||
        typeof item.message !== "string" || item.message.length > 1230 ||
        ![item.lineNumber, item.columnNumber].every((n) => item.sourcePath === null ? n === null : typeof n === "number" && Number.isSafeInteger(n) && n > 0)) {
      throw new TypeError("Invalid typecheck diagnostic");
    }
    return Object.freeze({
      code: "WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED" as const,
      typescriptCode: item.typescriptCode,
      sourcePath: item.sourcePath,
      lineNumber: item.lineNumber as number | null,
      columnNumber: item.columnNumber as number | null,
      message: nativeSourceTypecheckMessage({ category: ts.DiagnosticCategory.Error, code: item.typescriptCode,
        file: undefined, start: undefined, length: undefined,
        messageText: item.message.replace(/^TS\d+: /, ""),
      }),
    });
  });
}

// One policy for trusted admission and the frozen, advisory Builder compiler.
export const BABYLON_NATIVE_SOURCE_COMPILER_OPTIONS_V1 = Object.freeze({
  allowImportingTsExtensions: false,
  exactOptionalPropertyTypes: true,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  noUncheckedIndexedAccess: true,
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
  useDefineForClassFields: true,
} satisfies ts.CompilerOptions);

export function nativeSourceTypecheckMessage(entry: ts.Diagnostic): string {
  // Compiler text is untrusted source-derived content, not a provider log.
  // Keep actionable type information, but never publish absolute paths, URLs,
  // credential-like literals or an unbounded expanded structural type.
  const detail = ts.flattenDiagnosticMessageText(entry.messageText, " ")
    .replace(/(?:https?:\/\/|file:\/\/)[^\s'"<>]+/g, "[redacted-uri]")
    .replace(/(?:[A-Za-z]:[\\/]|\/)[^\s'"<>]+/g, "[redacted-path]")
    .replace(/(?:Bearer\s+\S+|(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]+)/gi, "[redacted-secret]")
    .replace(/\b(token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/[\u0000-\u001f\u007f]/g, " ");
  return `TS${entry.code}: ${detail.slice(0, 1200)}`;
}
