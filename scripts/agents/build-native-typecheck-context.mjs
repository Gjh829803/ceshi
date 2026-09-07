import path from "node:path";
import ts from "typescript";
import { gzipSync } from "fflate";
import { BABYLON_NATIVE_SOURCE_COMPILER_OPTIONS_V1 } from "../native-scene/source-typecheck.ts";

// Build-time only. Freeze the installed SDK/compiler input graph, never evaluate
// it. The isolated task needs no checkout, node_modules, network or package install.
export function buildNativeTypecheckContext(projectRoot) {
  const options = { ...BABYLON_NATIVE_SOURCE_COMPILER_OPTIONS_V1 };
  const imports = {
    "@whitebox-world/native-babylon": path.join(projectRoot, "packages/native-babylon/src/index.ts"),
    "@whitebox-world/native-babylon-block-profile": path.join(projectRoot, "packages/native-babylon-block-profile/src/index.ts"),
  };
  const host = ts.createCompilerHost(options, true);
  const program = ts.createProgram(Object.values(imports), options, host);
  const virtualPath = (fileName) => {
    const normalized = fileName.split(path.sep).join("/");
    const dependencyIndex = normalized.indexOf("/node_modules/");
    if (dependencyIndex >= 0) return `/native-typecheck${normalized.slice(dependencyIndex)}`;
    const relative = path.relative(projectRoot, fileName).split(path.sep).join("/");
    if (relative.startsWith("../") || path.isAbsolute(relative)) throw new Error("Typecheck input escaped repository dependencies");
    return `/native-typecheck/${relative}`;
  };
  const files = Object.create(null);
  const resolutions = Object.create(null);
  const declarations = [];
  for (const source of [...program.getSourceFiles()].sort((a, b) => a.fileName.localeCompare(b.fileName, "en-US"))) {
    const name = virtualPath(source.fileName);
    if (files[name] !== undefined && files[name] !== source.text) throw new Error("Conflicting frozen typecheck input");
    files[name] = source.text;
    if (source.isDeclarationFile) declarations.push(name);
    const importsForSource = Object.create(null);
    for (const imported of ts.preProcessFile(source.text, true, true).importedFiles) {
      const resolved = ts.resolveModuleName(imported.fileName, source.fileName, options, ts.sys).resolvedModule;
      if (resolved !== undefined) importsForSource[imported.fileName] = {
        resolvedFileName: virtualPath(resolved.resolvedFileName), extension: resolved.extension,
        isExternalLibraryImport: resolved.isExternalLibraryImport === true,
      };
    }
    resolutions[name] = importsForSource;
  }
  const snapshot = {
    typescriptVersion: ts.version, files, resolutions, declarations,
    defaultLibFileName: virtualPath(ts.getDefaultLibFilePath(options)),
    imports: Object.fromEntries(Object.entries(imports).map(([name, file]) => [name, virtualPath(file)])),
  };
  // Native zlib versions produce different valid DEFLATE streams for the same
  // SDK bytes. Pin the encoder and timestamp so macOS and CI rebuild identically.
  return Buffer.from(gzipSync(new TextEncoder().encode(JSON.stringify(snapshot)), {
    level: 9, mtime: 0,
  })).toString("base64");
}
