import {
  chmod,
  lstat,
  mkdtemp,
  realpath,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import type { PublishRuntimeReplacementV1 } from "@whitebox-world/authoring-host";
import { createCanonicalWorldPackageBuildContextFixtureV1 } from "@whitebox-world/world-package/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAuthoringEditHostSessionV1 } from "./authoring-edit-host-bridge";
import { createDurableAuthoringEditHostV1 } from "./durable-authoring-edit-host";
import type { DurableWorldChangeRuntimeOwnerV1 } from "./durable-world-change-runtime";

const temporaryRoots: string[] = [];

async function temporaryRoot(prefix: string): Promise<string> {
  const created = await realpath(await mkdtemp(path.join(tmpdir(), prefix)));
  temporaryRoots.push(created);
  return created;
}

function runtimeOwner(): DurableWorldChangeRuntimeOwnerV1 {
  const publish: PublishRuntimeReplacementV1 = vi.fn(async () => ({
    status: "rejected" as const,
    failureKind: "prepare-failed" as const,
    message: "not used by composition tests",
  }));
  return {
    runtimeSessionId: "runtime-session.durable-host",
    publish,
    recoverRuntimePublication: {
      recover: vi.fn(async ({ committedIdentity }) => ({
        status: "recovered" as const,
        identity: committedIdentity,
      })),
      retryCleanup: vi.fn(async () => ({ status: "released" as const })),
    },
    snapshot: () => {
      throw new Error("snapshot is not used by composition tests");
    },
    dispose: vi.fn(async () => undefined),
  };
}

function inputFor(
  stateDirectoryPath: string,
  authoringSpec = createValidAuthoringSpec(),
) {
  const nowUnixMilliseconds = 1_700_000_000_000;
  return {
    stateDirectoryPath,
    authoringSpec,
    worldPackageBuildContext: createCanonicalWorldPackageBuildContextFixtureV1(),
    resourceArtifacts: [],
    session: createAuthoringEditHostSessionV1({
      worldId: authoringSpec.id,
      nowUnixMilliseconds,
    }),
    runtimeOwner: runtimeOwner(),
    maximumWorldPackageBytes: 100_000_000,
    maximumWorldPackageFileCount: 1_000,
    maximumCleanupAttemptCount: 3,
    nowUnixMilliseconds: () => nowUnixMilliseconds,
  } as const;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("durable Authoring Edit Host composition", () => {
  it("rejects relative, non-canonical, symlinked, and unsafe state directories", async () => {
    await expect(createDurableAuthoringEditHostV1(
      inputFor("relative-state"),
    )).rejects.toThrow(/STATE_DIRECTORY_INVALID/);

    const root = await temporaryRoot("durable-authoring-host-unsafe-");
    await expect(createDurableAuthoringEditHostV1(
      inputFor(`${root}/a/../state`),
    )).rejects.toThrow(/STATE_DIRECTORY_INVALID/);

    const target = path.join(root, "target");
    const linked = path.join(root, "linked");
    await createDurableAuthoringEditHostV1(inputFor(target));
    await symlink(target, linked, "dir");
    await expect(createDurableAuthoringEditHostV1(
      inputFor(linked),
    )).rejects.toThrow(/STATE_DIRECTORY_UNSAFE/);

    const unsafe = path.join(root, "unsafe");
    await createDurableAuthoringEditHostV1(inputFor(unsafe));
    await chmod(unsafe, 0o755);
    await expect(createDurableAuthoringEditHostV1(
      inputFor(unsafe),
    )).rejects.toThrow(/STATE_DIRECTORY_UNSAFE/);
  });

  it("creates the fixed owner-only state layout and never falls back to an in-memory journal", async () => {
    const root = await temporaryRoot("durable-authoring-host-layout-");
    const stateDirectoryPath = path.join(root, "state");
    const durable = await createDurableAuthoringEditHostV1(
      inputFor(stateDirectoryPath),
    );
    expect(durable.stateDirectoryPath).toBe(stateDirectoryPath);
    expect(durable.startupCleanupReports).toEqual([]);
    const state = await stat(stateDirectoryPath);
    const wal = await stat(path.join(
      stateDirectoryPath,
      "world-change-journal.wal.ndjson",
    ));
    const packages = await stat(path.join(stateDirectoryPath, "world-packages"));
    expect(state.mode & 0o777).toBe(0o700);
    expect(packages.mode & 0o777).toBe(0o700);
    expect(wal.mode & 0o777).toBe(0o600);
    expect(wal.size).toBeGreaterThan(0);
  });

  it("reopens byte-identical journal state and rejects a mismatched initial AuthoringSpec", async () => {
    const root = await temporaryRoot("durable-authoring-host-reopen-");
    const stateDirectoryPath = path.join(root, "state");
    const spec = createValidAuthoringSpec();
    const first = await createDurableAuthoringEditHostV1(
      inputFor(stateDirectoryPath, spec),
    );
    const walPath = path.join(
      stateDirectoryPath,
      "world-change-journal.wal.ndjson",
    );
    const firstWal = await lstat(walPath);
    const second = await createDurableAuthoringEditHostV1(
      inputFor(stateDirectoryPath, spec),
    );
    expect(second.bridge.journal).not.toBe(first.bridge.journal);
    expect((await lstat(walPath)).size).toBe(firstWal.size);

    await expect(createDurableAuthoringEditHostV1(inputFor(
      stateDirectoryPath,
      { ...spec, seed: spec.seed + 1 },
    ))).rejects.toThrow(/JOURNAL_HEAD_MISMATCH/);
  });
});
