import {
  assembleWorldPackageDirectoryV2,
  assertWorldPackageBuildReceiptV2,
  verifyWorldPackageDirectoryV2,
  type WorldPackageBuildReceiptV2,
  type WorldPackageDirectoryFileV2,
  type WorldPackageDirectoryV2,
} from "@whitebox-world/world-package";
import {
  chmod,
  constants,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { isEmpty, isEqual, isNil } from "lodash-es";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const JSON_MEDIA_TYPE = "application/json";
const INTEGRITY_PATH = "integrity.json";
const RECEIPT_PATH = "world-package-build-receipt.json";
const TRANSPORT_METADATA_PATHS = new Set([INTEGRITY_PATH, RECEIPT_PATH]);

export interface WriteWorldPackageDirectoryV2Input {
  readonly outputDirectoryPath: string;
  readonly directory: WorldPackageDirectoryV2;
}

export interface ReadWorldPackageDirectoryV2Input {
  readonly packageDirectoryPath: string;
  readonly maximumTotalBytes: number;
  readonly maximumFileCount: number;
}

export interface FileWorldPackageTestHooksV2 {
  readonly beforeWriteFile?: (
    absolutePath: string,
    relativePath: string,
  ) => Promise<void>;
  readonly beforeRename?: (
    stagingDirectoryPath: string,
    outputDirectoryPath: string,
  ) => Promise<void>;
  readonly beforeSyncDirectory?: (
    absolutePath: string,
    phase: "lock" | "staging" | "publication" | "lock-removal",
  ) => Promise<void>;
  readonly beforeReadDirectory?: (
    absolutePath: string,
    relativePath: string,
  ) => Promise<void>;
  readonly afterReadFileOpen?: (
    absolutePath: string,
    relativePath: string,
  ) => Promise<void>;
}

export interface FileWorldPackageAdapterV2 {
  readonly writeWorldPackageDirectoryV2: (
    input: WriteWorldPackageDirectoryV2Input,
  ) => Promise<void>;
  readonly readWorldPackageDirectoryV2: (
    input: ReadWorldPackageDirectoryV2Input,
  ) => Promise<WorldPackageDirectoryV2>;
}

interface BigIntFileSnapshot {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

interface ReadFileRow {
  readonly path: string;
  readonly bytes: Uint8Array;
}

const EMPTY_HOOKS: FileWorldPackageTestHooksV2 = Object.freeze({});

function fileIoFail(message: string): never {
  throw new Error(`WORLD_PACKAGE_FILE_IO_V2_INVALID: ${message}`);
}

function requireCanonicalAbsolutePath(value: unknown, role: string): string {
  if (
    typeof value !== "string" ||
    isEmpty(value) ||
    !path.isAbsolute(value) ||
    path.resolve(value) !== value ||
    path.parse(value).root === value
  ) {
    fileIoFail(`${role} must be a normalized absolute non-root path`);
  }
  return value;
}

function requirePositiveSafeInteger(value: unknown, role: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    fileIoFail(`${role} must be a positive safe integer`);
  }
  return value;
}

async function lstatOrMissing(absolutePath: string): Promise<BigIntFileSnapshot | null> {
  try {
    return await lstat(absolutePath, { bigint: true }) as BigIntFileSnapshot;
  } catch (error) {
    if (
      !isNil(error) &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

function assertOwnerDirectoryMode(snapshot: BigIntFileSnapshot, role: string): void {
  if (!snapshot.isDirectory() || (snapshot.mode & 0o7777n) !== 0o700n) {
    fileIoFail(`${role} must be an owner-only 0700 directory`);
  }
}

function assertOwnerFileMode(snapshot: BigIntFileSnapshot, role: string): void {
  if (!snapshot.isFile() || (snapshot.mode & 0o7777n) !== 0o600n) {
    fileIoFail(`${role} must be an owner-only 0600 regular file`);
  }
}

function sameSnapshot(
  left: BigIntFileSnapshot,
  right: BigIntFileSnapshot,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function sameIdentity(
  left: BigIntFileSnapshot,
  right: BigIntFileSnapshot,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode
  );
}

function isInside(rootPath: string, candidatePath: string): boolean {
  return candidatePath.startsWith(`${rootPath}${path.sep}`);
}

async function assertCanonicalDirectoryPath(
  absolutePath: string,
  expectedSnapshot: BigIntFileSnapshot,
  role: string,
): Promise<void> {
  const current = await lstat(absolutePath, { bigint: true }) as BigIntFileSnapshot;
  if (
    current.isSymbolicLink() ||
    !sameSnapshot(current, expectedSnapshot) ||
    await realpath(absolutePath) !== absolutePath
  ) {
    fileIoFail(`${role} changed identity or resolves through a symbolic link`);
  }
}

async function assertCanonicalDirectoryIdentity(
  absolutePath: string,
  expectedSnapshot: BigIntFileSnapshot,
  role: string,
): Promise<void> {
  const current = await lstat(absolutePath, { bigint: true }) as BigIntFileSnapshot;
  if (
    current.isSymbolicLink() ||
    !current.isDirectory() ||
    !sameIdentity(current, expectedSnapshot) ||
    await realpath(absolutePath) !== absolutePath
  ) {
    fileIoFail(`${role} changed identity or resolves through a symbolic link`);
  }
}

async function syncDirectory(
  absolutePath: string,
  phase: "lock" | "staging" | "publication" | "lock-removal",
  hooks: FileWorldPackageTestHooksV2,
): Promise<void> {
  await hooks.beforeSyncDirectory?.(absolutePath, phase);
  const handle = await open(
    absolutePath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function directoryPathsForFiles(
  files: readonly WorldPackageDirectoryFileV2[],
): readonly string[] {
  const directories = new Set<string>();
  for (const file of files) {
    let directory = path.posix.dirname(file.path);
    while (directory !== ".") {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  return [...directories].sort((left, right) => {
    const depth = left.split("/").length - right.split("/").length;
    return depth !== 0 ? depth : left < right ? -1 : left > right ? 1 : 0;
  });
}

async function writeOneFile(
  stagingDirectoryPath: string,
  file: WorldPackageDirectoryFileV2,
  hooks: FileWorldPackageTestHooksV2,
): Promise<void> {
  const absolutePath = path.join(stagingDirectoryPath, ...file.path.split("/"));
  if (!isInside(stagingDirectoryPath, absolutePath)) {
    fileIoFail("package file escaped the staging directory");
  }
  await hooks.beforeWriteFile?.(absolutePath, file.path);
  const handle = await open(
    absolutePath,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    FILE_MODE,
  );
  try {
    await handle.writeFile(file.bytes);
    await handle.chmod(FILE_MODE);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function removeOwnedStagingDirectory(
  stagingDirectoryPath: string | undefined,
  parentDirectoryPath: string,
  stagingPrefix: string,
): Promise<void> {
  if (isNil(stagingDirectoryPath)) return;
  if (
    path.dirname(stagingDirectoryPath) !== parentDirectoryPath ||
    !path.basename(stagingDirectoryPath).startsWith(stagingPrefix)
  ) {
    fileIoFail("refused to remove an unowned staging directory");
  }
  await rm(stagingDirectoryPath, { recursive: true, force: true });
}

async function writeWorldPackageDirectoryV2Internal(
  input: WriteWorldPackageDirectoryV2Input,
  hooks: FileWorldPackageTestHooksV2,
): Promise<void> {
  const outputDirectoryPath = requireCanonicalAbsolutePath(
    input.outputDirectoryPath,
    "outputDirectoryPath",
  );
  verifyWorldPackageDirectoryV2(input.directory);
  const canonicalDirectory = assembleWorldPackageDirectoryV2({
    receipt: input.directory.receipt,
    files: input.directory.files.filter((file) =>
      !TRANSPORT_METADATA_PATHS.has(file.path)
    ),
    signatureFiles: input.directory.signatureFiles,
  });
  const parentDirectoryPath = path.dirname(outputDirectoryPath);
  const parentSnapshot = await lstat(parentDirectoryPath, {
    bigint: true,
  }) as BigIntFileSnapshot;
  if (
    parentSnapshot.isSymbolicLink() ||
    !parentSnapshot.isDirectory() ||
    await realpath(parentDirectoryPath) !== parentDirectoryPath
  ) {
    fileIoFail("output parent must be one canonical non-symlink directory");
  }
  if (!isNil(await lstatOrMissing(outputDirectoryPath))) {
    fileIoFail("output destination already exists");
  }

  const baseName = path.basename(outputDirectoryPath);
  const stagingPrefix = `.${baseName}.tmp-`;
  const lockPath = path.join(parentDirectoryPath, `.${baseName}.publish.lock`);
  let stagingDirectoryPath: string | undefined;
  let ownsLock = false;
  try {
    const lockHandle = await open(
      lockPath,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      FILE_MODE,
    );
    ownsLock = true;
    try {
      await lockHandle.writeFile(`${process.pid}\n`, "utf8");
      await lockHandle.chmod(FILE_MODE);
      await lockHandle.sync();
    } finally {
      await lockHandle.close();
    }
    await syncDirectory(parentDirectoryPath, "lock", hooks);
    await assertCanonicalDirectoryIdentity(
      parentDirectoryPath,
      parentSnapshot,
      "output parent",
    );
    if (!isNil(await lstatOrMissing(outputDirectoryPath))) {
      fileIoFail("output destination appeared while acquiring publication ownership");
    }

    stagingDirectoryPath = await mkdtemp(
      path.join(parentDirectoryPath, stagingPrefix),
    );
    await chmod(stagingDirectoryPath, DIRECTORY_MODE);
    if (
      path.dirname(stagingDirectoryPath) !== parentDirectoryPath ||
      !path.basename(stagingDirectoryPath).startsWith(stagingPrefix) ||
      await realpath(stagingDirectoryPath) !== stagingDirectoryPath
    ) {
      fileIoFail("temporary directory ownership could not be established");
    }

    const allFiles = [
      ...canonicalDirectory.files,
      ...canonicalDirectory.signatureFiles,
    ]
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    const relativeDirectoryPaths = directoryPathsForFiles(allFiles);
    for (const relativePath of relativeDirectoryPaths) {
      const absolutePath = path.join(
        stagingDirectoryPath,
        ...relativePath.split("/"),
      );
      if (!isInside(stagingDirectoryPath, absolutePath)) {
        fileIoFail("package directory escaped the staging directory");
      }
      await mkdir(absolutePath, { mode: DIRECTORY_MODE });
      await chmod(absolutePath, DIRECTORY_MODE);
    }
    for (const file of allFiles) {
      await writeOneFile(stagingDirectoryPath, file, hooks);
    }
    for (const relativePath of [...relativeDirectoryPaths].reverse()) {
      await syncDirectory(
        path.join(stagingDirectoryPath, ...relativePath.split("/")),
        "staging",
        hooks,
      );
    }
    await syncDirectory(stagingDirectoryPath, "staging", hooks);

    const totalBytes = allFiles.reduce(
      (total, file) => total + file.bytes.byteLength,
      0,
    );
    const replayed = await readWorldPackageDirectoryV2Internal({
      packageDirectoryPath: stagingDirectoryPath,
      maximumTotalBytes: Math.max(1, totalBytes),
      maximumFileCount: Math.max(1, allFiles.length),
    }, EMPTY_HOOKS);
    if (!isEqual(replayed, canonicalDirectory)) {
      fileIoFail("staged directory does not replay the exact input directory");
    }

    await assertCanonicalDirectoryIdentity(
      parentDirectoryPath,
      parentSnapshot,
      "output parent",
    );
    if (!isNil(await lstatOrMissing(outputDirectoryPath))) {
      fileIoFail("output destination appeared before atomic rename");
    }
    await hooks.beforeRename?.(stagingDirectoryPath, outputDirectoryPath);
    await rename(stagingDirectoryPath, outputDirectoryPath);
    stagingDirectoryPath = undefined;
    await syncDirectory(parentDirectoryPath, "publication", hooks);

    await unlink(lockPath);
    ownsLock = false;
    await syncDirectory(parentDirectoryPath, "lock-removal", hooks);
  } catch (error) {
    await removeOwnedStagingDirectory(
      stagingDirectoryPath,
      parentDirectoryPath,
      stagingPrefix,
    ).catch(() => undefined);
    if (ownsLock) {
      await unlink(lockPath).catch(() => undefined);
      await syncDirectory(parentDirectoryPath, "lock-removal", EMPTY_HOOKS)
        .catch(() => undefined);
    }
    throw error;
  }
}

function requireReceipt(bytesByPath: ReadonlyMap<string, Uint8Array>): WorldPackageBuildReceiptV2 {
  const bytes = bytesByPath.get(RECEIPT_PATH);
  if (isNil(bytes)) fileIoFail(`${RECEIPT_PATH} is missing`);
  let candidate: unknown;
  try {
    candidate = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return assertWorldPackageBuildReceiptV2(candidate);
  } catch {
    return fileIoFail(`${RECEIPT_PATH} is invalid`);
  }
}

function requiredDirectoryPaths(filePaths: readonly string[]): ReadonlySet<string> {
  const result = new Set<string>();
  for (const filePath of filePaths) {
    let directory = path.posix.dirname(filePath);
    while (directory !== ".") {
      result.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  return result;
}

async function readWorldPackageDirectoryV2Internal(
  input: ReadWorldPackageDirectoryV2Input,
  hooks: FileWorldPackageTestHooksV2,
): Promise<WorldPackageDirectoryV2> {
  const packageDirectoryPath = requireCanonicalAbsolutePath(
    input.packageDirectoryPath,
    "packageDirectoryPath",
  );
  const maximumTotalBytes = requirePositiveSafeInteger(
    input.maximumTotalBytes,
    "maximumTotalBytes",
  );
  const maximumFileCount = requirePositiveSafeInteger(
    input.maximumFileCount,
    "maximumFileCount",
  );
  const rootSnapshot = await lstat(packageDirectoryPath, {
    bigint: true,
  }) as BigIntFileSnapshot;
  if (rootSnapshot.isSymbolicLink()) {
    fileIoFail("package root must not be a symbolic link");
  }
  assertOwnerDirectoryMode(rootSnapshot, "package root");
  if (await realpath(packageDirectoryPath) !== packageDirectoryPath) {
    fileIoFail("package root must not resolve through symbolic links");
  }

  const rows: ReadFileRow[] = [];
  const discoveredDirectories = new Set<string>();
  let totalBytes = 0;

  const readRegularFile = async (
    absolutePath: string,
    relativePath: string,
    pathSnapshot: BigIntFileSnapshot,
  ): Promise<void> => {
    assertOwnerFileMode(pathSnapshot, relativePath);
    if (await realpath(absolutePath) !== absolutePath) {
      fileIoFail(`${relativePath} resolves through a symbolic link`);
    }
    if (rows.length + 1 > maximumFileCount) {
      fileIoFail("package exceeds maximumFileCount");
    }
    if (
      pathSnapshot.size > BigInt(maximumTotalBytes) ||
      BigInt(totalBytes) + pathSnapshot.size > BigInt(maximumTotalBytes)
    ) {
      fileIoFail("package file or total bytes exceed maximumTotalBytes");
    }
    const handle = await open(
      absolutePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    let openSnapshot: BigIntFileSnapshot;
    let finalOpenSnapshot: BigIntFileSnapshot;
    let bytes: Uint8Array;
    try {
      openSnapshot = await handle.stat({ bigint: true }) as BigIntFileSnapshot;
      assertOwnerFileMode(openSnapshot, relativePath);
      if (!sameSnapshot(pathSnapshot, openSnapshot)) {
        fileIoFail(`${relativePath} changed before its descriptor was opened`);
      }
      await hooks.afterReadFileOpen?.(absolutePath, relativePath);
      bytes = new Uint8Array(await handle.readFile());
      finalOpenSnapshot = await handle.stat({ bigint: true }) as BigIntFileSnapshot;
    } finally {
      await handle.close();
    }
    const finalPathSnapshot = await lstat(absolutePath, {
      bigint: true,
    }) as BigIntFileSnapshot;
    if (
      !sameSnapshot(openSnapshot!, finalOpenSnapshot!) ||
      !sameSnapshot(openSnapshot!, finalPathSnapshot) ||
      bytes!.byteLength !== Number(openSnapshot!.size) ||
      await realpath(absolutePath) !== absolutePath
    ) {
      fileIoFail(`${relativePath} changed while it was read`);
    }
    totalBytes += bytes!.byteLength;
    rows.push({ path: relativePath, bytes: bytes! });
  };

  const walk = async (
    absoluteDirectoryPath: string,
    relativeDirectoryPath: string,
    expectedSnapshot: BigIntFileSnapshot,
  ): Promise<void> => {
    assertOwnerDirectoryMode(
      expectedSnapshot,
      isEmpty(relativeDirectoryPath) ? "package root" : relativeDirectoryPath,
    );
    if (!isEmpty(relativeDirectoryPath)) {
      discoveredDirectories.add(relativeDirectoryPath);
    }
    await hooks.beforeReadDirectory?.(
      absoluteDirectoryPath,
      relativeDirectoryPath,
    );
    await assertCanonicalDirectoryPath(
      absoluteDirectoryPath,
      expectedSnapshot,
      isEmpty(relativeDirectoryPath) ? "package root" : relativeDirectoryPath,
    );
    const entries = await readdir(absoluteDirectoryPath, { withFileTypes: true });
    entries.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0
    );
    for (const entry of entries) {
      const relativePath = isEmpty(relativeDirectoryPath)
        ? entry.name
        : `${relativeDirectoryPath}/${entry.name}`;
      const absolutePath = path.join(absoluteDirectoryPath, entry.name);
      if (!isInside(packageDirectoryPath, absolutePath)) {
        fileIoFail(`${relativePath} escaped the package root`);
      }
      const snapshot = await lstat(absolutePath, {
        bigint: true,
      }) as BigIntFileSnapshot;
      if (snapshot.isSymbolicLink()) {
        fileIoFail(`${relativePath} must not be a symbolic link`);
      }
      if (snapshot.isDirectory()) {
        await walk(absolutePath, relativePath, snapshot);
      } else if (snapshot.isFile()) {
        await readRegularFile(absolutePath, relativePath, snapshot);
      } else {
        fileIoFail(`${relativePath} must be a regular file or directory`);
      }
    }
    await assertCanonicalDirectoryPath(
      absoluteDirectoryPath,
      expectedSnapshot,
      isEmpty(relativeDirectoryPath) ? "package root" : relativeDirectoryPath,
    );
  };

  await walk(packageDirectoryPath, "", rootSnapshot);
  const sortedRows = rows.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
  const bytesByPath = new Map(sortedRows.map((row) => [row.path, row.bytes]));
  const receipt = requireReceipt(bytesByPath);
  const requiredDirectories = requiredDirectoryPaths(sortedRows.map((row) => row.path));
  if (
    requiredDirectories.size !== discoveredDirectories.size ||
    [...requiredDirectories].some((directory) => !discoveredDirectories.has(directory))
  ) {
    fileIoFail("package contains an undeclared empty directory");
  }

  const mediaTypeByPath = new Map(
    receipt.fileIntegrityEntries.map((entry) => [entry.path, entry.mediaType]),
  );
  mediaTypeByPath.set(INTEGRITY_PATH, JSON_MEDIA_TYPE);
  mediaTypeByPath.set(RECEIPT_PATH, JSON_MEDIA_TYPE);
  const rootFiles: WorldPackageDirectoryFileV2[] = [];
  const signatureFiles: WorldPackageDirectoryFileV2[] = [];
  for (const row of sortedRows) {
    if (row.path.startsWith("signatures/")) {
      signatureFiles.push({
        path: row.path,
        mediaType: JSON_MEDIA_TYPE,
        bytes: row.bytes,
      });
      continue;
    }
    if (TRANSPORT_METADATA_PATHS.has(row.path)) continue;
    rootFiles.push({
      path: row.path,
      mediaType: mediaTypeByPath.get(row.path) ?? "application/octet-stream",
      bytes: row.bytes,
    });
  }
  return assembleWorldPackageDirectoryV2({
    receipt,
    files: rootFiles,
    signatureFiles,
  });
}

function createAdapter(hooks: FileWorldPackageTestHooksV2): FileWorldPackageAdapterV2 {
  return Object.freeze({
    async writeWorldPackageDirectoryV2(
      input: WriteWorldPackageDirectoryV2Input,
    ) {
      try {
        await writeWorldPackageDirectoryV2Internal(input, hooks);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("WORLD_PACKAGE_FILE_IO_V2_INVALID")
        ) {
          throw error;
        }
        fileIoFail("atomic package publication failed");
      }
    },
    async readWorldPackageDirectoryV2(
      input: ReadWorldPackageDirectoryV2Input,
    ) {
      try {
        return await readWorldPackageDirectoryV2Internal(input, hooks);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("WORLD_PACKAGE_FILE_IO_V2_INVALID")
        ) {
          throw error;
        }
        fileIoFail("symlink-safe package read failed");
      }
    },
  });
}

const PRODUCTION_ADAPTER = createAdapter(EMPTY_HOOKS);

export const writeWorldPackageDirectoryV2 =
  PRODUCTION_ADAPTER.writeWorldPackageDirectoryV2;
export const readWorldPackageDirectoryV2 =
  PRODUCTION_ADAPTER.readWorldPackageDirectoryV2;

export function createFileWorldPackageTestAdapterV2(
  hooks: FileWorldPackageTestHooksV2,
): FileWorldPackageAdapterV2 {
  return createAdapter(hooks);
}
