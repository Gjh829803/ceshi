import {
  verifyWorldPackageDirectoryV1,
  type WorldPackageBuildReceiptV1,
  type WorldPackageFileIntegrityEntryV1,
} from "@whitebox-world/world-package";
import { canonicalJsonBytes } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import { readWorldPackageDirectoryV1 } from "./file-world-package.js";

const DEFAULT_MAXIMUM_TOTAL_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAXIMUM_FILE_COUNT = 1_024;

export interface CreateWorldPackageBrowserTransportV1Input {
  readonly packageDirectoryPath: string;
  readonly maximumTotalBytes?: number;
  readonly maximumFileCount?: number;
}

export interface WorldPackageBrowserTransportPortsV1 {
  readonly readDirectory?: typeof readWorldPackageDirectoryV1;
}

export interface WorldPackageBrowserTransportV1 {
  readonly worldPackageRootHash: `sha256:${string}`;
  readonly sceneSourceKind:
    | "canonical-execution-plan"
    | "babylon-native-scene";
  readonly fileIntegrityEntries: readonly WorldPackageFileIntegrityEntryV1[];
  readonly receipt: WorldPackageBuildReceiptV1;
  readReceipt(): Promise<Uint8Array>;
  read(packagePath: string): Promise<Uint8Array>;
  dispose(): void;
}

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function requireAdmittedPackagePath(
  value: string,
  admittedPaths: ReadonlySet<string>,
): string {
  const segments = value.split("/");
  if (
    value.length === 0 ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    value.startsWith("/") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    segments.some((segment) =>
      segment.length === 0 ||
      segment === "." ||
      segment === ".." ||
      segment.includes(":")) ||
    !admittedPaths.has(value)
  ) {
    fail(
      "WORLD_PACKAGE_BROWSER_PATH_UNADMITTED",
      "the requested path is not present in the verified Package Root inventory",
    );
  }
  return value;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index]);
}

export async function createWorldPackageBrowserTransportV1(
  input: CreateWorldPackageBrowserTransportV1Input,
  ports: WorldPackageBrowserTransportPortsV1 = {},
): Promise<WorldPackageBrowserTransportV1> {
  const readDirectory = ports.readDirectory ?? readWorldPackageDirectoryV1;
  const readLimits = Object.freeze({
    maximumTotalBytes:
      input.maximumTotalBytes ?? DEFAULT_MAXIMUM_TOTAL_BYTES,
    maximumFileCount:
      input.maximumFileCount ?? DEFAULT_MAXIMUM_FILE_COUNT,
  });
  const initialDirectory = await readDirectory({
    packageDirectoryPath: input.packageDirectoryPath,
    ...readLimits,
  });
  const initialVerified = verifyWorldPackageDirectoryV1(initialDirectory);
  const worldPackageRootHash = initialVerified.receipt.worldPackageRootHash;
  const receipt = initialVerified.receipt;
  const receiptBytes = canonicalJsonBytes(receipt);
  const fileIntegrityEntries = Object.freeze(
    initialVerified.receipt.fileIntegrityEntries.map((entry) =>
      Object.freeze({ ...entry })),
  );
  const admittedPaths = new Set(fileIntegrityEntries.map((entry) => entry.path));
  const initialBytesByPath = new Map(
    initialDirectory.files
      .filter((file) => admittedPaths.has(file.path))
      .map((file) => [file.path, new Uint8Array(file.bytes)] as const),
  );
  let isDisposed = false;
  let freshnessVerification: Promise<typeof initialDirectory> | undefined;

  const requireActive = (): void => {
    if (isDisposed) {
      fail(
        "WORLD_PACKAGE_BROWSER_TRANSPORT_DISPOSED",
        "the Package transport has been disposed",
      );
    }
  };

  const verifyStillAdmittedOnce = async () => {
    let currentDirectory;
    try {
      currentDirectory = await readDirectory({
        packageDirectoryPath: input.packageDirectoryPath,
        ...readLimits,
      });
      const currentVerified = verifyWorldPackageDirectoryV1(currentDirectory);
      if (currentVerified.receipt.worldPackageRootHash !== worldPackageRootHash) {
        fail(
          "WORLD_PACKAGE_BROWSER_PACKAGE_DRIFTED",
          "the Package Root changed after transport admission",
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("WORLD_PACKAGE_BROWSER_PACKAGE_DRIFTED")
      ) {
        throw error;
      }
      fail(
        "WORLD_PACKAGE_BROWSER_PACKAGE_DRIFTED",
        "the Package directory no longer verifies as the admitted Root",
      );
    }
    requireActive();
    return currentDirectory;
  };

  const verifyStillAdmitted = async () => {
    requireActive();
    const verification = freshnessVerification ??=
      verifyStillAdmittedOnce();
    try {
      return await verification;
    } finally {
      if (freshnessVerification === verification) {
        freshnessVerification = undefined;
      }
    }
  };

  return Object.freeze({
    worldPackageRootHash,
    sceneSourceKind: initialVerified.kind,
    fileIntegrityEntries,
    receipt,
    async readReceipt(): Promise<Uint8Array> {
      requireActive();
      await verifyStillAdmitted();
      return new Uint8Array(receiptBytes);
    },
    async read(packagePath: string): Promise<Uint8Array> {
      requireActive();
      const admittedPath = requireAdmittedPackagePath(
        packagePath,
        admittedPaths,
      );
      const currentDirectory = await verifyStillAdmitted();
      const currentFile = currentDirectory.files.find(
        (file) => file.path === admittedPath,
      );
      const initialBytes = initialBytesByPath.get(admittedPath);
      if (
        isNil(currentFile) ||
        isNil(initialBytes) ||
        !equalBytes(currentFile.bytes, initialBytes)
      ) {
        fail(
          "WORLD_PACKAGE_BROWSER_PACKAGE_DRIFTED",
          "the admitted Package file bytes changed after transport admission",
        );
      }
      return new Uint8Array(initialBytes);
    },
    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;
      initialBytesByPath.clear();
      admittedPaths.clear();
    },
  });
}
