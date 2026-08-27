import { chmod, lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";

import type { AuthoringSpecV4 } from "@whitebox-world/authoring";
import type { WorldChangeCleanupReportV1 } from "@whitebox-world/authoring-edit";
import {
  createPreparedCandidateLeaseStoreV1,
  getAuthoringRevisionHeadForStartupRecoveryV1,
  listWorldPublicationRecoveryRecordsV1,
  type AuthoringEditSessionV1,
  type EvaluateRequiredGatesV1,
} from "@whitebox-world/authoring-host";
import type {
  ResolvedWorldPackageResourceArtifactV2,
  WorldPackageBuildContextV2,
} from "@whitebox-world/world-package";
import { isEmpty, isNil } from "lodash-es";

import {
  createAuthoringEditHostBridgeV1,
  type AuthoringEditHostBridgeV1,
} from "./authoring-edit-host-bridge";
import type { DurableWorldChangeRuntimeOwnerV1 } from "./durable-world-change-runtime";
import { createFileWorldPackageStoreV1 } from "./file-world-package";
import { createFileBackedWorldChangeJournalV1 } from "./file-world-change-journal";
import { recoverCommittedWorldPublicationsV1 } from "./world-change-publication-recovery";

const STATE_DIRECTORY_MODE = 0o700;
const WAL_FILE_NAME = "world-change-journal.wal.ndjson";
const WORLD_PACKAGES_DIRECTORY_NAME = "world-packages";

export interface DurableAuthoringEditHostV1 {
  readonly bridge: AuthoringEditHostBridgeV1;
  readonly stateDirectoryPath: string;
  readonly runtimeOwner: DurableWorldChangeRuntimeOwnerV1;
  readonly startupCleanupReports: readonly WorldChangeCleanupReportV1[];
}

function statePathFail(message: string): never {
  throw new Error(`WORLD_CHANGE_STATE_DIRECTORY_UNSAFE: ${message}`);
}

async function ensureOwnerOnlyDirectory(
  directoryPath: string,
  allowCreate: boolean,
): Promise<void> {
  let snapshot;
  try {
    snapshot = await lstat(directoryPath);
  } catch {
    if (!allowCreate) statePathFail("Required state directory is missing.");
    await mkdir(directoryPath, { recursive: true, mode: STATE_DIRECTORY_MODE });
    await chmod(directoryPath, STATE_DIRECTORY_MODE);
    snapshot = await lstat(directoryPath);
  }
  if (
    snapshot.isSymbolicLink() ||
    !snapshot.isDirectory() ||
    (snapshot.mode & 0o777) !== STATE_DIRECTORY_MODE ||
    await realpath(directoryPath) !== directoryPath
  ) {
    statePathFail("State directories must be canonical, non-symlinked, and mode 0700.");
  }
}

export async function createDurableAuthoringEditHostV1(input: {
  readonly stateDirectoryPath: string;
  readonly authoringSpec: AuthoringSpecV4;
  readonly worldPackageBuildContext: WorldPackageBuildContextV2;
  readonly resourceArtifacts: readonly ResolvedWorldPackageResourceArtifactV2[];
  readonly session: AuthoringEditSessionV1;
  readonly runtimeOwner: DurableWorldChangeRuntimeOwnerV1;
  readonly evaluateRequiredGates?: EvaluateRequiredGatesV1;
  readonly maximumWorldPackageBytes: number;
  readonly maximumWorldPackageFileCount: number;
  readonly maximumCleanupAttemptCount: number;
  readonly nowUnixMilliseconds?: () => number;
}): Promise<DurableAuthoringEditHostV1> {
  if (
    isEmpty(input.stateDirectoryPath) ||
    !path.isAbsolute(input.stateDirectoryPath) ||
    path.normalize(input.stateDirectoryPath) !== input.stateDirectoryPath
  ) {
    throw new TypeError(
      "WORLD_CHANGE_STATE_DIRECTORY_INVALID: stateDirectoryPath must be canonical and absolute.",
    );
  }
  await ensureOwnerOnlyDirectory(input.stateDirectoryPath, true);
  const worldPackagesDirectoryPath = path.join(
    input.stateDirectoryPath,
    WORLD_PACKAGES_DIRECTORY_NAME,
  );
  await ensureOwnerOnlyDirectory(worldPackagesDirectoryPath, true);
  const journal = createFileBackedWorldChangeJournalV1({
    walFilePath: path.join(input.stateDirectoryPath, WAL_FILE_NAME),
  });
  const worldPackageStore = createFileWorldPackageStoreV1({
    storeRootPath: worldPackagesDirectoryPath,
    maximumTotalBytes: input.maximumWorldPackageBytes,
    maximumFileCount: input.maximumWorldPackageFileCount,
  });
  const leaseStore = createPreparedCandidateLeaseStoreV1();
  const createBridge = (authoringSpec: AuthoringSpecV4) =>
    createAuthoringEditHostBridgeV1({
      authoringSpec,
      worldPackageStore,
      worldPackageBuildContext: input.worldPackageBuildContext,
      resourceArtifacts: input.resourceArtifacts,
      session: input.session,
      journal,
      leaseStore,
      publishRuntimeReplacement: input.runtimeOwner.publish,
      ...(isNil(input.evaluateRequiredGates)
        ? {}
        : { evaluateRequiredGates: input.evaluateRequiredGates }),
      ...(isNil(input.nowUnixMilliseconds)
        ? {}
        : { nowUnixMilliseconds: input.nowUnixMilliseconds }),
    });
  const publicationRecords = listWorldPublicationRecoveryRecordsV1(journal);
  let bridge: AuthoringEditHostBridgeV1;
  let startupCleanupReports: readonly WorldChangeCleanupReportV1[];
  if (isEmpty(publicationRecords)) {
    bridge = createBridge(input.authoringSpec);
    startupCleanupReports = await recoverCommittedWorldPublicationsV1({
      journal,
      worldPackageStore,
      runtimePort: input.runtimeOwner.recoverRuntimePublication,
      maximumCleanupAttemptCount: input.maximumCleanupAttemptCount,
    });
  } else {
    const recoveryHead = getAuthoringRevisionHeadForStartupRecoveryV1(
      journal,
      input.authoringSpec.id,
    );
    if (isNil(recoveryHead)) {
      throw new Error(
        "WORLD_CHANGE_JOURNAL_HEAD_MISMATCH: Publication recovery has no committed Authoring head.",
      );
    }
    startupCleanupReports = await recoverCommittedWorldPublicationsV1({
      journal,
      worldPackageStore,
      runtimePort: input.runtimeOwner.recoverRuntimePublication,
      maximumCleanupAttemptCount: input.maximumCleanupAttemptCount,
    });
    bridge = createBridge(recoveryHead.authoringSpec);
  }
  return Object.freeze({
    bridge,
    stateDirectoryPath: input.stateDirectoryPath,
    runtimeOwner: input.runtimeOwner,
    startupCleanupReports,
  });
}
