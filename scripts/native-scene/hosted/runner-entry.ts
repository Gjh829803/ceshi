import { readFile, lstat, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import type { BabylonNativeSceneModuleV1 } from
  "@whitebox-world/native-babylon";
import { sha256Bytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  createBabylonNativeIsolatedRuntimeEntryV1,
  type BabylonNativeIsolatedRuntimeEntryV1,
  type BabylonNativeSceneModuleLoadRequestV1,
  type SubjectAssetResolverV1,
} from "@whitebox-world/runtime-babylon";
import {
  parseNativeIsolatedExecutionRequestV1,
  parseNativeIsolationTransportEnvelopeV1,
  parseRuntimeSessionRequestV1,
  type NativeIsolatedExecutionRequestV1,
  type NativeIsolationDiagnosticStageV1,
  type NativeIsolationTransportEnvelopeV1,
} from "@whitebox-world/runtime-contracts";
import {
  assembleBabylonNativeWorldPackageDirectoryV1,
  assertWorldPackageBuildReceiptV1,
  verifyBabylonNativeWorldPackageDirectoryV1,
  type VerifiedBabylonNativeWorldPackageDirectoryV1,
} from "@whitebox-world/world-package/native-runtime";
import { isNil } from "lodash-es";

const PACKAGE_ROOT = "/world-package";
const RUNNER_ROOT = "/runner";
const SUBJECT_ASSET_PATH = "/runner/assets/g-bot.glb";
const SUBJECT_ASSET_REF = "worldkit://subject-asset/actor.humanoid.g-bot@2";

Logger.LogLevels = Logger.NoneLogLevel;

function lineBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

async function readVerifiedPackage():
Promise<VerifiedBabylonNativeWorldPackageDirectoryV1> {
  const receipt = assertWorldPackageBuildReceiptV1(JSON.parse(
    await readFile(
      path.join(PACKAGE_ROOT, "world-package-build-receipt.json"),
      "utf8",
    ),
  ));
  const packageRootPrefix = `${path.resolve(PACKAGE_ROOT)}${path.sep}`;
  const files = await Promise.all(receipt.fileIntegrityEntries.map(
    async ({ path: relativePath, mediaType }) => {
      const absolutePath = path.resolve(PACKAGE_ROOT, relativePath);
      if (!absolutePath.startsWith(packageRootPrefix)) {
        throw new Error("WORLDKIT_NATIVE_RUNNER_PACKAGE_PATH_INVALID");
      }
      const metadata = await lstat(absolutePath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error("WORLDKIT_NATIVE_RUNNER_PACKAGE_PATH_INVALID");
      }
      return Object.freeze({
        path: relativePath,
        mediaType,
        bytes: new Uint8Array(await readFile(absolutePath)),
      });
    },
  ));
  const verified = verifyBabylonNativeWorldPackageDirectoryV1(
    assembleBabylonNativeWorldPackageDirectoryV1({ receipt, files }),
  );
  return verified;
}

async function materializeExactModule(
  request: BabylonNativeSceneModuleLoadRequestV1,
  temporaryRoots: string[],
): Promise<BabylonNativeSceneModuleV1> {
  if (
    sha256Bytes(request.sceneModuleBundleBytes) !==
      request.sceneModuleBundleManifest.bundleContentHash
  ) throw new Error("WORLDKIT_NATIVE_RUNNER_MODULE_HASH_INVALID");
  const root = path.join(
    "/tmp",
    `worldkit-native-module-${
      request.sceneModuleBundleManifest.bundleContentHash.slice(7, 31)
    }`,
  );
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: false, mode: 0o700 });
  temporaryRoots.push(root);
  await symlink(path.join(RUNNER_ROOT, "node_modules"), path.join(root, "node_modules"));
  const modulePath = path.join(root, "scene.mjs");
  await writeFile(modulePath, request.sceneModuleBundleBytes, {
    flag: "wx",
    mode: 0o400,
  });
  const imported: { readonly default?: BabylonNativeSceneModuleV1 } =
    await import(
      `${pathToFileURL(modulePath).href}?bundle=${
        request.sceneModuleBundleManifest.bundleContentHash.slice(7)
      }`
    );
  if (isNil(imported.default)) {
    throw new Error("WORLDKIT_NATIVE_RUNNER_MODULE_EXPORT_INVALID");
  }
  return imported.default;
}

function subjectAssetResolver(bytes: Uint8Array): SubjectAssetResolverV1 {
  return Object.freeze({
    async resolveSubjectAsset(
      request: Parameters<SubjectAssetResolverV1["resolveSubjectAsset"]>[0],
    ) {
      if (request.subjectAssetRef !== SUBJECT_ASSET_REF) {
        throw new Error("WORLDKIT_NATIVE_RUNNER_SUBJECT_ASSET_UNAVAILABLE");
      }
      return Object.freeze({
        bytes: new Uint8Array(bytes),
        sourceLabel: "runner://subject-asset/g-bot.glb",
      });
    },
  });
}

function readyResult(
  request: NativeIsolatedExecutionRequestV1,
  entry: BabylonNativeIsolatedRuntimeEntryV1,
) {
  return Object.freeze({
    kind: "native-isolated-execution-result" as const,
    schemaVersion: 1 as const,
    id: `native-isolated-execution-result.${request.id}.ready`,
    requestId: request.id,
    runtimeSessionId: request.runtimeSessionId,
    status: "ready" as const,
    runtimeSessionUri:
      `worldkit://runtime-session/${request.runtimeSessionId}` as const,
    initialSnapshotHash: sha256CanonicalJson(entry.initialSnapshot()),
  });
}

function rejectedResult(
  request: NativeIsolatedExecutionRequestV1,
  stage: NativeIsolationDiagnosticStageV1,
) {
  return Object.freeze({
    kind: "native-isolated-execution-result" as const,
    schemaVersion: 1 as const,
    id: `native-isolated-execution-result.${request.id}.rejected`,
    requestId: request.id,
    runtimeSessionId: request.runtimeSessionId,
    status: "rejected" as const,
    stage,
    diagnostics: Object.freeze([Object.freeze({
      code: "WORLDKIT_NATIVE_RUNNER_REJECTED",
      message: "The isolated Native runner rejected the request.",
    })]),
  });
}

function writeBoundedLine(value: unknown, maximumBytes: number): void {
  const line = JSON.stringify(value);
  if (lineBytes(line) > maximumBytes) {
    throw new Error("WORLDKIT_NATIVE_RUNNER_OUTPUT_LIMIT_EXCEEDED");
  }
  process.stdout.write(`${line}\n`);
}

async function main(): Promise<void> {
  const input = createInterface({
    input: process.stdin,
    crlfDelay: Number.POSITIVE_INFINITY,
    terminal: false,
  });
  const lines = input[Symbol.asyncIterator]();
  const first = await lines.next();
  if (first.done) return;
  let request: NativeIsolatedExecutionRequestV1;
  try {
    request = parseNativeIsolatedExecutionRequestV1(JSON.parse(first.value));
  } catch {
    return;
  }
  if (
    lineBytes(first.value) >
      request.effectiveBudget.protocol.maximumInboundMessageBytes
  ) return;
  const temporaryRoots: string[] = [];
  let entry: BabylonNativeIsolatedRuntimeEntryV1 | undefined;
  let stage: NativeIsolationDiagnosticStageV1 = "package-verification";
  try {
    const verifiedWorldPackage = await readVerifiedPackage();
    stage = "runtime";
    const havokWasmBytes = await readFile(createRequire(import.meta.url).resolve(
      "@babylonjs/havok/lib/esm/HavokPhysics.wasm",
    ));
    const subjectBytes = new Uint8Array(await readFile(SUBJECT_ASSET_PATH));
    entry = await createBabylonNativeIsolatedRuntimeEntryV1({
      request,
      verifiedWorldPackage,
      moduleLoader: {
        load: (moduleRequest) =>
          materializeExactModule(moduleRequest, temporaryRoots),
      },
      havokWasmBinary: havokWasmBytes.buffer.slice(
        havokWasmBytes.byteOffset,
        havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
      ) as ArrayBuffer,
      engineFactory: () => new NullEngine({
        renderWidth: 640,
        renderHeight: 360,
        textureSize: 512,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      }),
      subjectAssetResolver: subjectAssetResolver(subjectBytes),
    });
    writeBoundedLine(
      readyResult(request, entry),
      request.effectiveBudget.protocol.maximumOutboundMessageBytes,
    );
    let expectedSequence = 1;
    for await (const line of { [Symbol.asyncIterator]: () => lines }) {
      if (
        lineBytes(line) >
          request.effectiveBudget.protocol.maximumInboundMessageBytes
      ) throw new Error("WORLDKIT_NATIVE_RUNNER_INPUT_LIMIT_EXCEEDED");
      const envelope = parseNativeIsolationTransportEnvelopeV1(
        JSON.parse(line),
      );
      if (
        envelope.runtimeSessionId !== request.runtimeSessionId ||
        envelope.sessionNonce !== request.sessionNonce ||
        envelope.messageSequence !== expectedSequence
      ) throw new Error("WORLDKIT_NATIVE_RUNNER_PROTOCOL_INVALID");
      expectedSequence += 1;
      const receipt = await entry.submit(
        parseRuntimeSessionRequestV1(envelope.payload),
      );
      const response: NativeIsolationTransportEnvelopeV1 = Object.freeze({
        kind: "native-isolation-transport-envelope",
        schemaVersion: 1,
        runtimeSessionId: request.runtimeSessionId,
        sessionNonce: request.sessionNonce,
        messageSequence: envelope.messageSequence,
        payload: receipt,
      });
      writeBoundedLine(
        response,
        request.effectiveBudget.protocol.maximumOutboundMessageBytes,
      );
    }
  } catch {
    if (isNil(entry)) {
      writeBoundedLine(
        rejectedResult(request, stage),
        request.effectiveBudget.protocol.maximumOutboundMessageBytes,
      );
    }
  } finally {
    await entry?.dispose().catch(() => undefined);
    await Promise.all(temporaryRoots.map((root) =>
      rm(root, { recursive: true, force: true }).catch(() => undefined)
    ));
  }
}

await main();
