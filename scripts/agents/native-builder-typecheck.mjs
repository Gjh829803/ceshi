import ts from "typescript";
import { gunzipSync } from "node:zlib";
import contextBytes from "virtual:native-typecheck-context";
import { BABYLON_NATIVE_SOURCE_COMPILER_OPTIONS_V1, nativeSourceTypecheckMessage } from "../native-scene/source-typecheck.ts";

let frozenContext;
export function typecheckNativeBuilderSource(source) {
  frozenContext ??= JSON.parse(gunzipSync(Buffer.from(contextBytes, "base64")).toString("utf8"));
  const context = frozenContext;
  if (context.typescriptVersion !== ts.version) throw new Error("Native typecheck compiler identity mismatch");
  const scenePath = "/native-typecheck/scene.ts";
  const options = { ...BABYLON_NATIVE_SOURCE_COMPILER_OPTIONS_V1 };
  const readFile = (name) => name === scenePath ? source : context.files[name];
  const host = {
    getSourceFile: (name, languageVersion) => {
      const text = readFile(name);
      return text === undefined ? undefined : ts.createSourceFile(name, text, languageVersion, true);
    },
    getDefaultLibFileName: () => context.defaultLibFileName,
    writeFile: () => { throw new Error("Native preflight cannot emit files"); },
    getCurrentDirectory: () => "/native-typecheck",
    getDirectories: () => [],
    fileExists: (name) => readFile(name) !== undefined,
    readFile,
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    resolveModuleNames: (names, containingFile) => names.map((name) => {
      if (containingFile === scenePath) {
        const file = context.imports[name];
        return file === undefined ? undefined : { resolvedFileName: file, extension: ts.Extension.Ts, isExternalLibraryImport: true };
      }
      return context.resolutions[containingFile]?.[name];
    }),
  };
  const program = ts.createProgram([scenePath, ...context.declarations], options, host);
  const sourceFile = program.getSourceFile(scenePath);
  const errors = [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics(),
    ...program.getSyntacticDiagnostics(sourceFile), ...program.getSemanticDiagnostics(sourceFile)]
    .filter((entry) => entry.category === ts.DiagnosticCategory.Error);
  return errors.slice(0, 100).map((entry) => {
    const position = entry.file === sourceFile && entry.start !== undefined
      ? sourceFile.getLineAndCharacterOfPosition(entry.start) : undefined;
    return {
      code: "WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED",
      typescriptCode: entry.code,
      sourcePath: position === undefined ? null : "scene.ts",
      lineNumber: position === undefined ? null : position.line + 1,
      columnNumber: position === undefined ? null : position.character + 1,
      message: nativeSourceTypecheckMessage(entry),
    };
  });
}
