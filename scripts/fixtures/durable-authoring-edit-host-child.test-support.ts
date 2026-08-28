import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { readFileSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { hashAuthoringDocumentV4 } from "@whitebox-world/authoring";
import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import {
  parseWorldChangeRequestV1,
  parseWorldChangeSetV1,
  type RuntimePublicationIdentityV1,
} from "@whitebox-world/authoring-edit";
import {
  getAuthoringRevisionHeadV1,
  type PublishRuntimeReplacementV1,
} from "@whitebox-world/authoring-host";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { createWorldPackageBuildContextFixtureV2 } from "@whitebox-world/world-package/testing";
import { isNil } from "lodash-es";

import {
  createAuthoringEditHostSessionV1,
} from "../lib/authoring-edit-host-bridge";
import { createDurableAuthoringEditHostV1 } from "../lib/durable-authoring-edit-host";
import type { DurableWorldChangeRuntimeOwnerV1 } from "../lib/durable-world-change-runtime";

const INITIAL_ROOT = `sha256:${"d".repeat(64)}` as Sha256HashV1;
const SESSION_ID = "session.durable-child";
const NOW = 1_700_000_000_000;

type ChildMode =
  | "prepare-only"
  | "publish-after-prepare"
  | "crash-before-commit"
  | "crash-after-commit"
  | "recover-incomplete-cleanup"
  | "recover-release-cleanup";

interface ControlFileV1 {
  readonly dryRunReceipt: unknown;
  readonly applyRequest: unknown;
}

function runtimeOwner(mode: ChildMode): DurableWorldChangeRuntimeOwnerV1 {
  const publish: PublishRuntimeReplacementV1 = async (input) => {
    const previous = Object.freeze({
      runtimeSessionId: "runtime-session.durable-child",
      worldSessionId: "world-session.previous",
      worldPackageRootHash: INITIAL_ROOT,
      simulationTick: 19,
    });
    const current = Object.freeze({
      runtimeSessionId: "runtime-session.durable-child",
      worldSessionId: "world-session.committed",
      worldPackageRootHash:
        input.worldConfiguration.worldPackageBuildReceipt.worldPackageRootHash,
      simulationTick: 0,
    });
    if (mode === "crash-before-commit") process.exit(85);
    const releaseFence = input.persistDurableCommit({ previous, current });
    releaseFence();
    if (mode === "crash-after-commit") process.exit(86);
    return Object.freeze({
      status: "published" as const,
      previous,
      current,
      cleanupStatus: "released" as const,
      cleanupDiagnostics: Object.freeze([]),
    });
  };
  return {
    runtimeSessionId: "runtime-session.durable-child",
    publish,
    recoverRuntimePublication: {
      recover: async ({ committedIdentity }) => Object.freeze({
        status: "recovered" as const,
        identity: committedIdentity,
      }),
      retryCleanup: async () => {
        if (mode === "recover-incomplete-cleanup") {
          throw new Error("simulated cleanup interruption");
        }
        return Object.freeze({ status: "released" as const });
      },
    },
    snapshot: () => {
      throw new Error("Child fixture does not expose Runtime APIs.");
    },
    dispose: async () => undefined,
  };
}

function changeSet(baseAuthoringSpecHash: Sha256HashV1) {
  const raw = JSON.parse(readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../examples/authoring/p16-add-house/change-set.json",
    ),
    "utf8",
  )) as Record<string, unknown>;
  return parseWorldChangeSetV1({ ...raw, baseAuthoringSpecHash });
}

async function openHost(
  stateDirectoryPath: string,
  mode: ChildMode,
) {
  const authoringSpec = createValidAuthoringSpec();
  return createDurableAuthoringEditHostV1({
    stateDirectoryPath,
    authoringSpec,
    worldPackageBuildContext: createWorldPackageBuildContextFixtureV2(),
    resourceArtifacts: [],
    session: createAuthoringEditHostSessionV1({
      worldId: authoringSpec.id,
      nowUnixMilliseconds: NOW,
      authoringEditSessionId: SESSION_ID,
    }),
    runtimeOwner: runtimeOwner(mode),
    maximumWorldPackageBytes: 100_000_000,
    maximumWorldPackageFileCount: 1_000,
    maximumCleanupAttemptCount: 3,
    nowUnixMilliseconds: () => NOW,
  });
}

async function counts(stateDirectoryPath: string) {
  const walText = await readFile(path.join(
    stateDirectoryPath,
    "world-change-journal.wal.ndjson",
  ), "utf8");
  let packageCount = 0;
  try {
    packageCount = (await readdir(path.join(
      stateDirectoryPath,
      "world-packages/sha256",
    ))).filter((name) => !name.startsWith(".")).length;
  } catch {
    packageCount = 0;
  }
  return {
    walTransactionCount: walText.split("\n").filter((row) => row.length > 0).length,
    packageCount,
  };
}

async function main(): Promise<void> {
  const mode = process.argv[2] as ChildMode;
  const stateDirectoryPath = process.argv[3];
  const controlFilePath = process.argv[4];
  if (isNil(stateDirectoryPath) || isNil(controlFilePath)) {
    throw new Error("Child fixture requires state and control paths.");
  }
  const durable = await openHost(stateDirectoryPath, mode);
  if (
    mode === "prepare-only" ||
    mode === "crash-before-commit" ||
    mode === "crash-after-commit"
  ) {
    const spec = createValidAuthoringSpec();
    const baseHash = hashAuthoringDocumentV4(spec) as Sha256HashV1;
    const nextChangeSet = changeSet(baseHash);
    const dryRunReceipt = await durable.bridge.host.dryRunWorldChange(
      parseWorldChangeRequestV1({
        kind: "worldkit-world-change-request",
        schemaVersion: 1,
        id: "request.child.dry-run",
        authoringEditSessionId: SESSION_ID,
        worldId: spec.id,
        changeSet: nextChangeSet,
        mode: "dry-run",
      }) as never,
    );
    if (dryRunReceipt.status !== "succeeded" || dryRunReceipt.mode !== "dry-run") {
      throw new Error("Child fixture expected a successful Dry Run.");
    }
    const applyRequest = parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.child.apply",
      authoringEditSessionId: SESSION_ID,
      worldId: spec.id,
      changeSet: nextChangeSet,
      mode: "apply",
      requestedOutcome: "publish-runtime",
      preparedCandidateRef: dryRunReceipt.preparedCandidateRef,
      runtimeExpectation: {
        runtimeSessionId: "runtime-session.durable-child",
        expectedWorldSessionId: "world-session.previous",
        expectedWorldPackageRootHash: INITIAL_ROOT,
        targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
      },
    });
    await writeFile(
      controlFilePath,
      JSON.stringify({ dryRunReceipt, applyRequest } satisfies ControlFileV1),
      { mode: 0o600 },
    );
    if (mode === "prepare-only") {
      process.stdout.write(`${JSON.stringify({
        phase: "prepared",
        revisionRef: "revision://basic-world/1",
        ...(await counts(stateDirectoryPath)),
      })}\n`);
      return;
    }
    await durable.bridge.host.applyWorldChange(applyRequest as never);
    throw new Error("Crash boundary was not reached.");
  }

  const control = JSON.parse(
    await readFile(controlFilePath, "utf8"),
  ) as ControlFileV1;
  const receipt = await durable.bridge.host.applyWorldChange(
    parseWorldChangeRequestV1(control.applyRequest) as never,
  );
  const head = getAuthoringRevisionHeadV1(
    durable.bridge.journal,
    "basic-world",
  );
  process.stdout.write(`${JSON.stringify({
    phase: mode,
    receipt,
    receiptBytes: stringifyCanonicalJson(receipt),
    dryRunReceiptBytes: stringifyCanonicalJson(control.dryRunReceipt),
    revisionRef: isNil(head) ? undefined : head.revisionRef,
    startupCleanupReports: durable.startupCleanupReports,
    ...(await counts(stateDirectoryPath)),
  })}\n`);
}

await main();
