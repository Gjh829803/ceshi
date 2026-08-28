import { worldPackageRefFromRootHashV1 } from "@whitebox-world/world-identity";

import {
  parseWorldChangeCleanupReportV1,
  parseWorldChangeDiagnosticV1,
  type WorldChangeCleanupReportV1,
  type WorldChangeDiagnosticV1,
} from "@whitebox-world/authoring-edit";
import {
  advanceWorldChangeCleanupReportV1,
  listWorldPublicationRecoveryRecordsV1,
  markWorldPublicationRecoveredV1,
  type RecoverCommittedRuntimePublicationPortV1,
  type TrustedRuntimeWorldConfigurationV1,
  type WorldChangeJournalV1,
} from "@whitebox-world/authoring-host";
import {
  type WorldPackageStoreV1,
} from "@whitebox-world/world-package";
import { isEmpty, isEqual, isNil } from "lodash-es";

export interface WorldPublicationRecoveryFailureV1 {
  readonly worldId: string;
  readonly requestId: string;
  readonly diagnostics: readonly WorldChangeDiagnosticV1[];
}

export class WorldPublicationRecoveryCoordinatorErrorV1 extends Error {
  readonly name = "WorldPublicationRecoveryCoordinatorErrorV1";
  readonly code = "WORLD_CHANGE_PUBLICATION_RECOVERY_INCOMPLETE" as const;

  constructor(
    readonly failures: readonly WorldPublicationRecoveryFailureV1[],
    readonly cleanupReports: readonly WorldChangeCleanupReportV1[],
  ) {
    super("WORLD_CHANGE_PUBLICATION_RECOVERY_INCOMPLETE: One or more Worlds remain fenced.");
  }
}

function diagnostic(
  code:
    | "WORLD_CHANGE_RUNTIME_PREPARE_FAILED"
    | "WORLD_CHANGE_CLEANUP_INCOMPLETE"
    | "WORLD_CHANGE_CLEANUP_QUARANTINED",
  instancePath: string,
  message: string,
): WorldChangeDiagnosticV1 {
  return parseWorldChangeDiagnosticV1({
    severity: "error",
    code,
    instancePath,
    message,
  });
}

function runtimeConfiguration(
  directory: NonNullable<Awaited<ReturnType<WorldPackageStoreV1["get"]>>>,
): TrustedRuntimeWorldConfigurationV1 {
  return Object.freeze({
    executionPlan: directory.executionPlan,
    executionPlanHash: directory.receipt.manifest.executionPlanHash,
    worldPackageRef: worldPackageRefFromRootHashV1(
      directory.receipt.worldPackageRootHash,
    ),
    worldPackageBuildReceipt: directory.receipt,
    gameplayBootstrap: directory.gameplayBootstrap,
  });
}

function cleanupReportWith(
  current: WorldChangeCleanupReportV1,
  status: "retrying" | "released" | "quarantined",
  diagnostics: readonly WorldChangeDiagnosticV1[],
): WorldChangeCleanupReportV1 {
  return parseWorldChangeCleanupReportV1({
    ...current,
    status,
    attemptCount: current.attemptCount + 1,
    diagnostics,
  });
}

export async function recoverCommittedWorldPublicationsV1(input: {
  readonly journal: WorldChangeJournalV1;
  readonly worldPackageStore: WorldPackageStoreV1;
  readonly runtimePort: RecoverCommittedRuntimePublicationPortV1;
  readonly maximumCleanupAttemptCount: number;
}): Promise<readonly WorldChangeCleanupReportV1[]> {
  if (
    !Number.isSafeInteger(input.maximumCleanupAttemptCount) ||
    input.maximumCleanupAttemptCount <= 0
  ) {
    throw new RangeError(
      "WORLD_CHANGE_CLEANUP_POLICY_INVALID: maximumCleanupAttemptCount must be positive.",
    );
  }
  const failures: WorldPublicationRecoveryFailureV1[] = [];
  const cleanupReports: WorldChangeCleanupReportV1[] = [];

  for (const record of listWorldPublicationRecoveryRecordsV1(input.journal)) {
    let isRuntimeRecovered = record.publicationRecoveryStatus === "recovered";
    if (!isRuntimeRecovered) {
      let directory;
      try {
        directory = await input.worldPackageStore.get(record.worldPackageRef);
      } catch {
        directory = undefined;
      }
      if (isNil(directory)) {
        failures.push(Object.freeze({
          worldId: record.worldId,
          requestId: record.requestId,
          diagnostics: Object.freeze([diagnostic(
            "WORLD_CHANGE_RUNTIME_PREPARE_FAILED",
            "/worldPackageRef",
            "The committed verified WorldPackage is missing or corrupt.",
          )]),
        }));
        continue;
      }
      const worldConfiguration = runtimeConfiguration(directory);
      if (worldConfiguration.worldPackageRef !== record.worldPackageRef) {
        failures.push(Object.freeze({
          worldId: record.worldId,
          requestId: record.requestId,
          diagnostics: Object.freeze([diagnostic(
            "WORLD_CHANGE_RUNTIME_PREPARE_FAILED",
            "/worldPackageRef",
            "The stored Package identity diverges from the committed Receipt.",
          )]),
        }));
        continue;
      }
      let recovered: Awaited<
        ReturnType<RecoverCommittedRuntimePublicationPortV1["recover"]>
      >;
      try {
        recovered = await input.runtimePort.recover({
          worldId: record.worldId,
          requestId: record.requestId,
          requestHash: record.requestHash,
          worldConfiguration,
          committedIdentity: record.committedReceipt.currentRuntimeIdentity,
        });
      } catch {
        failures.push(Object.freeze({
          worldId: record.worldId,
          requestId: record.requestId,
          diagnostics: Object.freeze([diagnostic(
            "WORLD_CHANGE_RUNTIME_PREPARE_FAILED",
            "/currentRuntimeIdentity",
            "The trusted Runtime recovery provider failed.",
          )]),
        }));
        continue;
      }
      if (
        recovered.status !== "recovered" ||
        !isEqual(
          recovered.identity,
          record.committedReceipt.currentRuntimeIdentity,
        )
      ) {
        failures.push(Object.freeze({
          worldId: record.worldId,
          requestId: record.requestId,
          diagnostics: recovered.status === "recovered"
            ? Object.freeze([diagnostic(
              "WORLD_CHANGE_RUNTIME_PREPARE_FAILED",
              "/currentRuntimeIdentity",
              "Runtime recovery returned a divergent committed identity.",
            )])
            : recovered.diagnostics,
        }));
        continue;
      }
      markWorldPublicationRecoveredV1(
        input.journal,
        record.worldId,
        record.requestId,
      );
      isRuntimeRecovered = true;
    }

    if (!isRuntimeRecovered) continue;
    let cleanup = record.cleanupReport;
    if (cleanup.status === "released" || cleanup.status === "quarantined") {
      cleanupReports.push(cleanup);
      continue;
    }
    const retrying = advanceWorldChangeCleanupReportV1({
      journal: input.journal,
      authoringEditSessionId: record.authoringEditSessionId,
      report: cleanupReportWith(
        cleanup,
        "retrying",
        Object.freeze([diagnostic(
          "WORLD_CHANGE_CLEANUP_INCOMPLETE",
          "/runtimeCleanup",
          "Runtime cleanup attempt is in progress.",
        )]),
      ),
    });
    let attempted: Awaited<
      ReturnType<RecoverCommittedRuntimePublicationPortV1["retryCleanup"]>
    >;
    try {
      attempted = await input.runtimePort.retryCleanup({
        cleanupOperationId: retrying.cleanupOperationId,
        previousWorldSessionId: retrying.previousWorldSessionId,
        attemptCount: retrying.attemptCount,
      });
    } catch {
      cleanupReports.push(retrying);
      continue;
    }
    if (attempted.status === "released") {
      cleanup = advanceWorldChangeCleanupReportV1({
        journal: input.journal,
        authoringEditSessionId: record.authoringEditSessionId,
        report: cleanupReportWith(retrying, "released", Object.freeze([])),
      });
    } else if (
      attempted.status === "quarantined" ||
      retrying.attemptCount >= input.maximumCleanupAttemptCount
    ) {
      cleanup = advanceWorldChangeCleanupReportV1({
        journal: input.journal,
        authoringEditSessionId: record.authoringEditSessionId,
        report: cleanupReportWith(
          retrying,
          "quarantined",
          attempted.status === "retryable" ||
              isEmpty(attempted.diagnostics) ||
              !attempted.diagnostics.some(({ code }) =>
                code === "WORLD_CHANGE_CLEANUP_QUARANTINED"
              )
            ? Object.freeze([
              ...attempted.diagnostics,
              diagnostic(
              "WORLD_CHANGE_CLEANUP_QUARANTINED",
              "/runtimeCleanup",
              "Runtime cleanup reached its retry limit.",
              ),
            ])
            : attempted.diagnostics,
        ),
      });
    } else {
      cleanup = retrying;
    }
    cleanupReports.push(cleanup);
  }

  const frozenReports = Object.freeze([...cleanupReports]);
  if (!isEmpty(failures)) {
    throw new WorldPublicationRecoveryCoordinatorErrorV1(
      Object.freeze([...failures]),
      frozenReports,
    );
  }
  return frozenReports;
}
