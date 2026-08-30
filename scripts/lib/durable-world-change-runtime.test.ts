import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createInMemoryWorldPackageStoreV1 } from "@whitebox-world/world-package/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDurableWorldChangeRuntimeOwnerV1 } from "./durable-world-change-runtime";
import { readWorldPackageDirectoryV1 } from "./file-world-package";
import {
  buildWorldPackageDirectoryV1,
  loadRuntimeWorldConfigurationFromPackageDirectoryV1,
} from "./world-package-cli";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const BASIC_WORLD_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/basic-world.json",
);
const G_BOT_WORLD_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/g-bot-subject-world.json",
);

let temporaryRoot: string;
let basicPackagePath: string;
let gBotPackagePath: string;

async function loadPackage(packageDirectoryPath: string) {
  const loaded = await loadRuntimeWorldConfigurationFromPackageDirectoryV1({
    packageDirectoryPath,
  });
  if (!("runtimeWorldConfiguration" in loaded)) {
    throw new Error(JSON.stringify(loaded.result));
  }
  if (loaded.runtimeWorldConfiguration.sceneSource.kind !==
      "canonical-execution-plan") {
    throw new Error("Expected a Canonical Scene Source package.");
  }
  if (loaded.verifiedDirectory.kind !== "canonical-execution-plan") {
    throw new Error("Expected a Canonical WorldPackage directory.");
  }
  return Object.freeze({
    ...loaded,
    verifiedDirectory: loaded.verifiedDirectory,
    runtimeWorldConfiguration: Object.freeze({
      worldBuildIdentity: loaded.runtimeWorldConfiguration.worldBuildIdentity,
      gameplayBootstrap: loaded.runtimeWorldConfiguration.gameplayBootstrap,
      worldRuntimeBootstrap:
        loaded.runtimeWorldConfiguration.worldRuntimeBootstrap,
      sceneSource: loaded.runtimeWorldConfiguration.sceneSource,
    }),
  });
}

beforeAll(async () => {
  temporaryRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), "durable-world-change-runtime-")),
  );
  basicPackagePath = path.join(temporaryRoot, "basic.package");
  gBotPackagePath = path.join(temporaryRoot, "g-bot.package");
  const [basic, gBot] = await Promise.all([
    buildWorldPackageDirectoryV1({
      inputPath: BASIC_WORLD_PATH,
      outputDirectoryPath: basicPackagePath,
    }),
    buildWorldPackageDirectoryV1({
      inputPath: G_BOT_WORLD_PATH,
      outputDirectoryPath: gBotPackagePath,
    }),
  ]);
  if (!basic.ok || !gBot.ok) throw new Error("failed to build test packages");
}, 30_000);

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("durable World Change Runtime owner", () => {
  it("publishes a second verified real Package through RuntimeHost at tick zero", async () => {
    const store = createInMemoryWorldPackageStoreV1();
    const initial = await loadPackage(basicPackagePath);
    const candidate = await loadPackage(gBotPackagePath);
    await store.put(await readWorldPackageDirectoryV1({
      packageDirectoryPath: basicPackagePath,
      maximumTotalBytes: 100_000_000,
      maximumFileCount: 1_000,
    }));
    await store.put(await readWorldPackageDirectoryV1({
      packageDirectoryPath: gBotPackagePath,
      maximumTotalBytes: 100_000_000,
      maximumFileCount: 1_000,
    }));
    const owner = await createDurableWorldChangeRuntimeOwnerV1({
      runtimeSessionId: "runtime-session.durable-publish",
      initialWorldSessionId: "world-session.durable-initial",
      initialWorldConfiguration: initial.runtimeWorldConfiguration,
      initialVerifiedDirectory: initial.verifiedDirectory,
      worldPackageStore: store,
    });
    try {
      const previous = owner.snapshot();
      const result = await owner.publish({
        worldConfiguration: candidate.runtimeWorldConfiguration,
        publication: {
          requestId: "request.durable.publish",
          requestHash: `sha256:${"a".repeat(64)}` as Sha256HashV1,
          fencingToken: "fence.durable.publish",
          runtimeExpectation: {
            runtimeSessionId: owner.runtimeSessionId,
            expectedWorldSessionId: previous.worldSessionId,
            expectedWorldPackageRootHash:
              initial.runtimeWorldConfiguration.worldBuildIdentity
                .worldPackageRootHash,
            targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
          },
        },
        persistDurableCommit: () => () => undefined,
      });
      expect(result).toMatchObject({
        status: "published",
        current: {
          runtimeSessionId: owner.runtimeSessionId,
          simulationTick: 0,
          worldPackageRootHash:
            candidate.runtimeWorldConfiguration.worldBuildIdentity
              .worldPackageRootHash,
        },
        cleanupStatus: "released",
      });
      expect(owner.snapshot()).toMatchObject({
        runtimeSessionId: owner.runtimeSessionId,
        world: { simulationTick: 0 },
      });
      expect(owner.snapshot().world.subjectStatesByEntityId).toHaveProperty(
        "g-bot-primary",
      );
    } finally {
      await owner.dispose();
    }
  }, 30_000);

  it("rebuilds the exact committed RuntimeSession and WorldSession identity", async () => {
    const store = createInMemoryWorldPackageStoreV1();
    const initial = await loadPackage(basicPackagePath);
    const committed = await loadPackage(gBotPackagePath);
    await store.put(await readWorldPackageDirectoryV1({
      packageDirectoryPath: gBotPackagePath,
      maximumTotalBytes: 100_000_000,
      maximumFileCount: 1_000,
    }));
    const owner = await createDurableWorldChangeRuntimeOwnerV1({
      runtimeSessionId: "runtime-session.durable-recovery",
      initialWorldSessionId: "world-session.bootstrap",
      initialWorldConfiguration: initial.runtimeWorldConfiguration,
      initialVerifiedDirectory: initial.verifiedDirectory,
      worldPackageStore: store,
    });
    try {
      const committedIdentity = {
        runtimeSessionId: owner.runtimeSessionId,
        worldSessionId: "world-session.committed-exact",
        worldPackageRootHash:
          committed.runtimeWorldConfiguration.worldBuildIdentity
            .worldPackageRootHash,
        simulationTick: 0,
      } as const;
      const recovered = await owner.recoverRuntimePublication.recover({
        worldId: "g-bot-subject-world",
        requestId: "request.durable.recover",
        requestHash: `sha256:${"b".repeat(64)}` as Sha256HashV1,
        worldConfiguration: committed.runtimeWorldConfiguration,
        committedIdentity,
      });
      expect(recovered).toEqual({
        status: "recovered",
        identity: committedIdentity,
      });
      expect(owner.snapshot()).toMatchObject({
        runtimeSessionId: committedIdentity.runtimeSessionId,
        worldSessionId: committedIdentity.worldSessionId,
        world: { simulationTick: 0 },
      });
    } finally {
      await owner.dispose();
    }
  }, 30_000);

  it("keeps a divergent or non-zero committed identity fenced", async () => {
    const store = createInMemoryWorldPackageStoreV1();
    const initial = await loadPackage(basicPackagePath);
    const owner = await createDurableWorldChangeRuntimeOwnerV1({
      runtimeSessionId: "runtime-session.durable-divergence",
      initialWorldSessionId: "world-session.durable-divergence",
      initialWorldConfiguration: initial.runtimeWorldConfiguration,
      initialVerifiedDirectory: initial.verifiedDirectory,
      worldPackageStore: store,
    });
    try {
      const result = await owner.recoverRuntimePublication.recover({
        worldId: "basic-world",
        requestId: "request.durable.divergence",
        requestHash: `sha256:${"c".repeat(64)}` as Sha256HashV1,
        worldConfiguration: initial.runtimeWorldConfiguration,
        committedIdentity: {
          runtimeSessionId: owner.runtimeSessionId,
          worldSessionId: "world-session.invalid-tick",
          worldPackageRootHash:
            initial.runtimeWorldConfiguration.worldBuildIdentity
              .worldPackageRootHash,
          simulationTick: 1,
        },
      });
      expect(result).toMatchObject({ status: "quarantined" });
      expect(owner.snapshot().worldSessionId).toBe(
        "world-session.durable-divergence",
      );
    } finally {
      await owner.dispose();
    }
  }, 30_000);
});
