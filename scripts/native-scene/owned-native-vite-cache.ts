import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface OwnedNativeViteCacheV1 {
  readonly rootDirectoryPath: string;
  readonly serverInstanceId: string;
  dispose(): Promise<void>;
}

export async function createOwnedNativeViteCacheV1(): Promise<
  OwnedNativeViteCacheV1
> {
  const rootDirectoryPath = await mkdtemp(path.join(
    tmpdir(),
    "worldkit-native-vite-cache-",
  ));
  try {
    await chmod(rootDirectoryPath, 0o700);
    const serverInstanceId = randomUUID();
    let disposePromise: Promise<void> | undefined;
    return Object.freeze({
      rootDirectoryPath,
      serverInstanceId,
      dispose() {
        disposePromise ??= rm(rootDirectoryPath, {
          recursive: true,
          force: true,
        });
        return disposePromise;
      },
    });
  } catch (error) {
    await rm(rootDirectoryPath, { recursive: true, force: true });
    throw error;
  }
}
