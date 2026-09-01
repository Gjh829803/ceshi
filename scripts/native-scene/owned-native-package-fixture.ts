import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const OWNER_DIRECTORY_MODE = 0o700;
const OWNER_FILE_MODE = 0o600;

export interface OwnedNativePackageFixtureV1 {
  readonly packageDirectoryPath: string;
  dispose(): Promise<void>;
}

export interface CreateOwnedNativePackageFixtureInputV1 {
  readonly fixtureDirectoryPath: string;
  readonly signal?: AbortSignal;
}

function fixtureInvalid(message: string): never {
  throw new Error(`WORLDKIT_NATIVE_SCENE_BUILD_FIXTURE_INVALID: ${message}`);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted();
}

async function copyOwnerOnlyFixtureNode(
  sourcePath: string,
  destinationPath: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  throwIfAborted(signal);
  const initialSnapshot = await lstat(sourcePath);
  throwIfAborted(signal);
  if (initialSnapshot.isSymbolicLink()) {
    fixtureInvalid(`${sourcePath} must not be a symbolic link`);
  }
  if (await realpath(sourcePath) !== sourcePath) {
    fixtureInvalid(`${sourcePath} must be one canonical path`);
  }
  if (initialSnapshot.isDirectory()) {
    await mkdir(destinationPath, { mode: OWNER_DIRECTORY_MODE });
    await chmod(destinationPath, OWNER_DIRECTORY_MODE);
    const entries = await readdir(sourcePath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      await copyOwnerOnlyFixtureNode(
        path.join(sourcePath, entry.name),
        path.join(destinationPath, entry.name),
        signal,
      );
    }
    await chmod(destinationPath, OWNER_DIRECTORY_MODE);
    throwIfAborted(signal);
    return;
  }
  if (!initialSnapshot.isFile()) {
    fixtureInvalid(`${sourcePath} must be a regular file or directory`);
  }
  await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
  await chmod(destinationPath, OWNER_FILE_MODE);
  const finalSourceSnapshot = await lstat(sourcePath);
  const destinationSnapshot = await lstat(destinationPath);
  if (
    finalSourceSnapshot.isSymbolicLink() ||
    !finalSourceSnapshot.isFile() ||
    !destinationSnapshot.isFile() ||
    await realpath(sourcePath) !== sourcePath ||
    await realpath(destinationPath) !== destinationPath
  ) {
    fixtureInvalid(`${sourcePath} changed while it was copied`);
  }
  throwIfAborted(signal);
}

export async function createOwnedNativePackageFixtureV1(
  input: CreateOwnedNativePackageFixtureInputV1,
): Promise<OwnedNativePackageFixtureV1> {
  const lexicalFixtureDirectoryPath = path.resolve(input.fixtureDirectoryPath);
  throwIfAborted(input.signal);
  const lexicalFixtureSnapshot = await lstat(lexicalFixtureDirectoryPath);
  if (lexicalFixtureSnapshot.isSymbolicLink()) {
    fixtureInvalid(`${lexicalFixtureDirectoryPath} must not be a symbolic link`);
  }
  const fixtureDirectoryPath = await realpath(lexicalFixtureDirectoryPath);
  throwIfAborted(input.signal);
  let temporaryRootPath: string | undefined;
  let isDisposed = false;
  const dispose = async (): Promise<void> => {
    if (isDisposed) return;
    if (temporaryRootPath !== undefined) {
      await rm(temporaryRootPath, { recursive: true, force: true });
    }
    isDisposed = true;
  };
  try {
    temporaryRootPath = await realpath(await mkdtemp(
      path.join(tmpdir(), `worldkit-native-build-${process.pid}-`),
    ));
    await chmod(temporaryRootPath, OWNER_DIRECTORY_MODE);
    throwIfAborted(input.signal);
    const packageDirectoryPath = path.join(
      temporaryRootPath,
      "world-package",
    );
    await copyOwnerOnlyFixtureNode(
      fixtureDirectoryPath,
      packageDirectoryPath,
      input.signal,
    );
    throwIfAborted(input.signal);
    return Object.freeze({ packageDirectoryPath, dispose });
  } catch (error) {
    await dispose();
    throw error;
  }
}
