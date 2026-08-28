import {
  worldPackageRefFromRootHashV1,
  worldPackageRootHashFromRefV1,
  type WorldPackageRefV1,
} from "@whitebox-world/world-identity";

import {
  assertWorldPackageStoreRefMatchesDirectoryV1,
  canonicalWorldPackageDirectoryForStoreV1,
  equalWorldPackageDirectoryBytesV1,
  verifyWorldPackageDirectoryV2,
  type WorldPackageDirectoryV2,
  type WorldPackageStoreV1,
} from "@whitebox-world/world-package";
import { isNil } from "lodash-es";

const DATABASE_NAME = "worldkit-world-package-store-v1";
const OBJECT_STORE_NAME = "world-package-directories-v1";

function requestResult<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener("error", () => reject(request.error), {
      once: true,
    });
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () => reject(transaction.error ?? new Error("IndexedDB transaction aborted.")),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () => reject(transaction.error ?? new Error("IndexedDB transaction failed.")),
      { once: true },
    );
  });
}

function openDatabase(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OBJECT_STORE_NAME)) {
        database.createObjectStore(OBJECT_STORE_NAME);
      }
    }, { once: true });
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener("error", () => reject(request.error), {
      once: true,
    });
    request.addEventListener("blocked", () => {
      reject(new Error("WORLD_PACKAGE_STORE_BLOCKED: IndexedDB upgrade is blocked"));
    }, { once: true });
  });
}

export function createIndexedDbWorldPackageStoreV1(
  indexedDb: IDBFactory = indexedDB,
): WorldPackageStoreV1 {
  const databasePromise = openDatabase(indexedDb);
  return {
    brand: "WorldPackageStoreV1",

    async put(directoryValue) {
      const directory = canonicalWorldPackageDirectoryForStoreV1(directoryValue);
      const worldPackageRef = worldPackageRefFromRootHashV1(
        directory.receipt.worldPackageRootHash,
      );
      const database = await databasePromise;
      const transaction = database.transaction(OBJECT_STORE_NAME, "readwrite");
      const completion = transactionCompletion(transaction);
      const store = transaction.objectStore(OBJECT_STORE_NAME);
      try {
        const existingValue = await requestResult(store.get(worldPackageRef));
        if (isNil(existingValue)) {
          await requestResult(store.add(directory, worldPackageRef));
        } else {
          const existing = canonicalWorldPackageDirectoryForStoreV1(
            existingValue as WorldPackageDirectoryV2,
          );
          assertWorldPackageStoreRefMatchesDirectoryV1(worldPackageRef, existing);
          if (!equalWorldPackageDirectoryBytesV1(existing, directory)) {
            throw new Error(
              "WORLD_PACKAGE_STORE_CONFLICT: one Package Root maps to different directory bytes",
            );
          }
        }
        await completion;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already be terminal; preserve the first failure.
        }
        await completion.catch(() => undefined);
        throw error;
      }
      return Object.freeze({
        worldPackageRef,
        receipt: directory.receipt,
      });
    },

    async get(worldPackageRef: WorldPackageRefV1) {
      worldPackageRootHashFromRefV1(worldPackageRef);
      const database = await databasePromise;
      const transaction = database.transaction(OBJECT_STORE_NAME, "readonly");
      const completion = transactionCompletion(transaction);
      const value = await requestResult(
        transaction.objectStore(OBJECT_STORE_NAME).get(worldPackageRef),
      );
      await completion;
      if (isNil(value)) return undefined;
      const verified = verifyWorldPackageDirectoryV2(value);
      if (
        verified.receipt.worldPackageRootHash !==
          worldPackageRootHashFromRefV1(worldPackageRef)
      ) {
        throw new Error(
          "WORLD_PACKAGE_STORE_REF_MISMATCH: Ref does not match the verified Package Root",
        );
      }
      return verified;
    },
  };
}
