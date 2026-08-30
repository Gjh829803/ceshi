import { worldPackageRefFromRootHashV1 } from "@whitebox-world/world-identity";

import {
  parseWorldChangeDiagnosticV1,
  type RuntimePublicationIdentityV1,
  type WorldChangeDiagnosticV1,
} from "@whitebox-world/authoring-edit";
import type {
  PublishRuntimeReplacementV1,
  RecoverCommittedRuntimePublicationPortV1,
  TrustedRuntimeWorldConfigurationV1,
} from "@whitebox-world/authoring-host";
import type { WorldRuntimeSnapshotV4 } from "@whitebox-world/runtime-contracts";
import type { PublishWorldReplacementResultV1 } from "@whitebox-world/runtime-host";
import {
  type VerifiedCanonicalWorldPackageDirectoryV1,
  type WorldPackageStoreV1,
} from "@whitebox-world/world-package";
import { isEqual, isNil } from "lodash-es";

import {
  createHeadlessRuntimeSessionV1,
  type HeadlessRuntimePublicationSessionV1,
} from "./headless-runtime-session";

export interface DurableWorldChangeRuntimeOwnerV1 {
  readonly runtimeSessionId: string;
  readonly publish: PublishRuntimeReplacementV1;
  readonly recoverRuntimePublication: RecoverCommittedRuntimePublicationPortV1;
  snapshot(): WorldRuntimeSnapshotV4;
  dispose(): Promise<void>;
}

function diagnostic(
  code: "WORLD_CHANGE_RUNTIME_PREPARE_FAILED" | "WORLD_CHANGE_CLEANUP_QUARANTINED",
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

function identityFor(
  session: HeadlessRuntimePublicationSessionV1,
): RuntimePublicationIdentityV1 {
  const snapshot = session.snapshot();
  return Object.freeze({
    runtimeSessionId: session.runtimeSessionId,
    worldSessionId: snapshot.worldSessionId,
    worldPackageRootHash: session.worldPackageRootHash,
    simulationTick: snapshot.world.simulationTick,
  });
}

function verifiedConfigurationMatches(
  configuration: TrustedRuntimeWorldConfigurationV1,
  directory: VerifiedCanonicalWorldPackageDirectoryV1,
): boolean {
  const rootHash = directory.receipt.worldPackageRootHash;
  return configuration.worldBuildIdentity.worldPackageRef ===
      worldPackageRefFromRootHashV1(rootHash) &&
    configuration.worldBuildIdentity.worldPackageRootHash === rootHash &&
    isEqual(configuration.worldBuildIdentity, directory.receipt.worldBuildIdentity) &&
    configuration.sceneSource.executionPlanHash ===
      directory.receipt.manifest.sceneSource.executionPlanHash &&
    isEqual(configuration.sceneSource.executionPlan, directory.executionPlan) &&
    isEqual(configuration.gameplayBootstrap, directory.gameplayBootstrap) &&
    isEqual(configuration.worldRuntimeBootstrap, directory.worldRuntimeBootstrap);
}

function mapPublishedResult(
  result: PublishWorldReplacementResultV1,
): Awaited<ReturnType<PublishRuntimeReplacementV1>> {
  if (result.status === "rejected") {
    return Object.freeze({
      status: "rejected" as const,
      failureKind: result.failureKind,
      message: result.message,
    });
  }
  const cleanupDiagnostics = result.cleanup.status === "quarantined"
    ? Object.freeze([diagnostic(
      "WORLD_CHANGE_CLEANUP_QUARANTINED",
      "/runtimeCleanup",
      "The replaced Runtime could not be released cleanly.",
    )])
    : Object.freeze([]);
  return Object.freeze({
    status: "published" as const,
    previous: result.previous,
    current: result.current,
    cleanupStatus: result.cleanup.status,
    cleanupDiagnostics,
  });
}

class DurableWorldChangeRuntimeOwner implements DurableWorldChangeRuntimeOwnerV1 {
  #session: HeadlessRuntimePublicationSessionV1;
  #recoveryInProgress = false;
  #disposePromise: Promise<void> | undefined;

  constructor(
    readonly runtimeSessionId: string,
    initialSession: HeadlessRuntimePublicationSessionV1,
    private readonly worldPackageStore: WorldPackageStoreV1,
  ) {
    this.#session = initialSession;
  }

  readonly publish: PublishRuntimeReplacementV1 = async (input) => {
    if (this.#recoveryInProgress || !isNil(this.#disposePromise)) {
      return Object.freeze({
        status: "rejected" as const,
        failureKind: "publication-conflict" as const,
        message: "Runtime publication is unavailable during recovery or disposal.",
      });
    }
    const directory = await this.worldPackageStore.get(
      input.worldConfiguration.worldBuildIdentity.worldPackageRef,
    );
    if (
      isNil(directory) ||
      directory.kind !== "canonical-execution-plan" ||
      !verifiedConfigurationMatches(input.worldConfiguration, directory)
    ) {
      return Object.freeze({
        status: "rejected" as const,
        failureKind: "prepare-failed" as const,
        message: "The verified WorldPackage is unavailable or divergent.",
      });
    }
    const releaseStage = this.#session.stageVerifiedWorldPackageV1({
      worldConfiguration: input.worldConfiguration,
      verifiedDirectory: directory,
    });
    try {
      return mapPublishedResult(await this.#session.publishWorldReplacementV1({
        worldConfiguration: input.worldConfiguration,
        publication: input.publication,
        persistDurableCommit: input.persistDurableCommit,
      }));
    } finally {
      releaseStage();
    }
  };

  readonly recoverRuntimePublication: RecoverCommittedRuntimePublicationPortV1 =
    Object.freeze({
      recover: async (
        input: Parameters<RecoverCommittedRuntimePublicationPortV1["recover"]>[0],
      ) => {
        if (
          input.committedIdentity.runtimeSessionId !== this.runtimeSessionId ||
          input.committedIdentity.simulationTick !== 0 ||
          input.committedIdentity.worldPackageRootHash !==
            input.worldConfiguration.worldBuildIdentity.worldPackageRootHash
        ) {
          return Object.freeze({
            status: "quarantined" as const,
            diagnostics: Object.freeze([diagnostic(
              "WORLD_CHANGE_RUNTIME_PREPARE_FAILED",
              "/currentRuntimeIdentity",
              "The committed Runtime identity diverges from the recovery input.",
            )]),
          });
        }
        const currentIdentity = identityFor(this.#session);
        if (isEqual(currentIdentity, input.committedIdentity)) {
          return Object.freeze({
            status: "recovered" as const,
            identity: currentIdentity,
          });
        }
        this.#recoveryInProgress = true;
        try {
          const directory = await this.worldPackageStore.get(
            input.worldConfiguration.worldBuildIdentity.worldPackageRef,
          );
          if (
            isNil(directory) ||
            directory.kind !== "canonical-execution-plan" ||
            !verifiedConfigurationMatches(input.worldConfiguration, directory)
          ) {
            return Object.freeze({
              status: "retryable" as const,
              diagnostics: Object.freeze([diagnostic(
                "WORLD_CHANGE_RUNTIME_PREPARE_FAILED",
                "/worldPackageRef",
                "The committed verified WorldPackage is unavailable.",
              )]),
            });
          }
          const recovered = await createHeadlessRuntimeSessionV1({
            runtimeSessionId: input.committedIdentity.runtimeSessionId,
            initialWorldSessionId: input.committedIdentity.worldSessionId,
            runtimeWorldConfiguration: input.worldConfiguration,
            verifiedDirectory: directory,
          });
          const recoveredIdentity = identityFor(recovered);
          if (!isEqual(recoveredIdentity, input.committedIdentity)) {
            await recovered.dispose().catch(() => undefined);
            return Object.freeze({
              status: "quarantined" as const,
              diagnostics: Object.freeze([diagnostic(
                "WORLD_CHANGE_RUNTIME_PREPARE_FAILED",
                "/currentRuntimeIdentity",
                "The rebuilt Runtime did not reproduce the committed identity.",
              )]),
            });
          }
          const previous = this.#session;
          this.#session = recovered;
          await previous.dispose().catch(() => undefined);
          return Object.freeze({
            status: "recovered" as const,
            identity: recoveredIdentity,
          });
        } catch {
          return Object.freeze({
            status: "retryable" as const,
            diagnostics: Object.freeze([diagnostic(
              "WORLD_CHANGE_RUNTIME_PREPARE_FAILED",
              "/currentRuntimeIdentity",
              "The committed Runtime could not be rebuilt.",
            )]),
          });
        } finally {
          this.#recoveryInProgress = false;
        }
      },
      retryCleanup: async (
        input: Parameters<
          RecoverCommittedRuntimePublicationPortV1["retryCleanup"]
        >[0],
      ) => {
        const status = await this.#session.retryWorldSessionCleanupV1(
          input.previousWorldSessionId,
        );
        return status === "released"
          ? Object.freeze({ status: "released" as const })
          : Object.freeze({
            status: "quarantined" as const,
            diagnostics: Object.freeze([diagnostic(
              "WORLD_CHANGE_CLEANUP_QUARANTINED",
              "/runtimeCleanup",
              `Cleanup '${input.cleanupOperationId}' could not release the replaced Runtime.`,
            )]),
          });
      },
    });

  snapshot(): WorldRuntimeSnapshotV4 {
    if (this.#recoveryInProgress || !isNil(this.#disposePromise)) {
      throw new Error("WORLD_CHANGE_RUNTIME_FENCED");
    }
    return this.#session.snapshot();
  }

  dispose(): Promise<void> {
    if (isNil(this.#disposePromise)) {
      this.#disposePromise = this.#session.dispose();
    }
    return this.#disposePromise;
  }
}

export async function createDurableWorldChangeRuntimeOwnerV1(input: {
  readonly runtimeSessionId: string;
  readonly initialWorldSessionId: string;
  readonly initialWorldConfiguration: TrustedRuntimeWorldConfigurationV1;
  readonly initialVerifiedDirectory: VerifiedCanonicalWorldPackageDirectoryV1;
  readonly worldPackageStore: WorldPackageStoreV1;
}): Promise<DurableWorldChangeRuntimeOwnerV1> {
  if (
    !verifiedConfigurationMatches(
      input.initialWorldConfiguration,
      input.initialVerifiedDirectory,
    )
  ) {
    throw new Error("WORLD_CHANGE_RUNTIME_INITIAL_PACKAGE_MISMATCH");
  }
  const session = await createHeadlessRuntimeSessionV1({
    runtimeSessionId: input.runtimeSessionId,
    initialWorldSessionId: input.initialWorldSessionId,
    runtimeWorldConfiguration: input.initialWorldConfiguration,
    verifiedDirectory: input.initialVerifiedDirectory,
  });
  return new DurableWorldChangeRuntimeOwner(
    input.runtimeSessionId,
    session,
    input.worldPackageStore,
  );
}
