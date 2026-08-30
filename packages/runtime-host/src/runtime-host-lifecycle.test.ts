import { DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1 } from "@whitebox-world/gameplay-contracts";
import {
  createBabylonNativeWorldPackageV1,
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { hashBabylonNativeSceneBootstrapV1 } from
  "@whitebox-world/runtime-contracts";

import { describe, expect, it, vi } from "vitest";

import type { WorldSessionPublicationV1 } from "./world-session";
import { runtimeWorldConfigurationFromVerifiedWorldPackageV1 } from
  "./runtime-host";
import { createBabylonNativeWorldPackageTestInputV1 } from
  "@whitebox-world/world-package/testing";

import {
  HASH_A,
  HASH_B,
  HASH_C,
  INITIAL_WORLD_PACKAGE_REF,
  REPLACEMENT_WORLD_PACKAGE_REF,
  RUNTIME_SESSION_ID,
  controllerState,
  createAdapterFactoryHarness,
  createHost,
  createPortHarness,
  heroState,
  hostOptions,
  mutableWorldConfiguration,
  participantState,
  projection,
  replacementRequest,
  runtimeHostConstructor,
} from "./test/runtime-host-lifecycle-harness";

function verifiedNativeWorldConfiguration() {
  const directory = createBabylonNativeWorldPackageV1(
    createBabylonNativeWorldPackageTestInputV1(),
  );
  const verified = verifyWorldPackageDirectoryV1(directory);
  if (verified.kind !== "babylon-native-scene") throw new Error("unreachable");
  const configuration =
    runtimeWorldConfigurationFromVerifiedWorldPackageV1(verified);
  if (configuration.sceneSource.kind !== "babylon-native-scene") {
    throw new Error("unreachable");
  }
  return configuration as typeof configuration & {
    readonly sceneSource: Extract<
      typeof configuration.sceneSource,
      { readonly kind: "babylon-native-scene" }
    >;
  };
}

function nativeWorldConfiguration(worldPackageRef = INITIAL_WORLD_PACKAGE_REF) {
  const canonical = mutableWorldConfiguration(worldPackageRef);
  const sceneModuleBundleHash = `sha256:${"e".repeat(64)}` as const;
  const bootstrap = Object.freeze({
    kind: "babylon-native-scene-bootstrap" as const,
    schemaVersion: 1 as const,
    id: `native.${canonical.worldBuildIdentity.id}`,
    sceneModuleRef: "worldkit://native-scene/runtime-host-lifecycle@1",
    nativeSceneApiRef: "worldkit://native-scene-api/babylon-native@1",
    nativeSceneProfileRef:
      "worldkit://native-scene-profile/whitebox.standard@1",
    gameplayBootstrapRef: canonical.gameplayBootstrap.resourceRef,
    initialControlledEntityId:
      canonical.worldRuntimeBootstrap.initialControlledEntityId,
    gravityMetersPerSecondSquaredXYZ:
      canonical.worldRuntimeBootstrap.gravityMetersPerSecondSquaredXYZ,
    initialCamera: Object.freeze({
      mode: "third-person" as const,
      pitchRadians:
        canonical.worldRuntimeBootstrap.initialCamera.pitchRadians,
      distanceMeters:
        canonical.worldRuntimeBootstrap.initialCamera.distanceMeters,
      fovDegrees: canonical.worldRuntimeBootstrap.initialCamera.fovDegrees,
      targetHeightMeters:
        canonical.worldRuntimeBootstrap.initialCamera.targetHeightMeters,
    }),
    seed: 20260830,
    spawnMarkerId: "spawn.runtime-host-lifecycle",
  });
  return Object.freeze({
    worldBuildIdentity: Object.freeze({
      ...canonical.worldBuildIdentity,
      sceneSourceIdentity: Object.freeze({
        kind: "babylon-native-scene" as const,
        nativeSceneBootstrapHash:
          hashBabylonNativeSceneBootstrapV1(bootstrap),
        sceneModuleBundleHash,
        nativeSceneContributionHash: HASH_C,
      }),
    }),
    gameplayBootstrap: canonical.gameplayBootstrap,
    worldRuntimeBootstrap: canonical.worldRuntimeBootstrap,
    sceneSource: Object.freeze({
      kind: "babylon-native-scene" as const,
      bootstrap,
      sceneModuleBundleRef:
        `package://native-scene-module/sha256/${sceneModuleBundleHash.slice("sha256:".length)}` as const,
    }),
  });
}

describe("RuntimeHost lifecycle isolation and admission", () => {
  it("passes an exact Native Scene Source to the shared initial Adapter path", async () => {
    const initialWorld = nativeWorldConfiguration();
    const port = createPortHarness();
    const adapter = createAdapterFactoryHarness([port]);

    const host = await runtimeHostConstructor().create(hostOptions(
      adapter.factory,
      ["world-session.native"],
      { initialWorld },
    ));

    expect(adapter.factory.create).toHaveBeenCalledTimes(1);
    expect(adapter.factory.create).toHaveBeenCalledWith(expect.objectContaining({
      runtimeSessionId: RUNTIME_SESSION_ID,
      worldSessionId: "world-session.native",
      worldBuildIdentity: initialWorld.worldBuildIdentity,
      sceneSource: initialWorld.sceneSource,
    }));
    expect(host.snapshot().worldState).toMatchObject({
      worldSessionId: "world-session.native",
      worldPackageRef: initialWorld.worldBuildIdentity.worldPackageRef,
    });
    await host.dispose();
    expect(port.disposeCount).toBe(1);
  });

  it("passes a Native Scene Source through shared replacement preflight and publication", async () => {
    const current = createPortHarness();
    const worldConfiguration = nativeWorldConfiguration();
    const candidate = createPortHarness();
    const { adapter, host } = await createHost(
      [current, candidate],
      ["world-session.initial", "world-session.candidate"],
    );
    await expect(host.replaceWorld({ worldConfiguration })).resolves.toMatchObject({
      worldState: {
        worldSessionId: "world-session.candidate",
        worldPackageRef: worldConfiguration.worldBuildIdentity.worldPackageRef,
      },
    });
    expect(adapter.factory.preflightConcurrentResidency).toHaveBeenCalledTimes(1);
    expect(adapter.factory.preflightConcurrentResidency).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneSource: expect.objectContaining({ kind: "canonical-execution-plan" }),
      }),
      expect.objectContaining({ sceneSource: worldConfiguration.sceneSource }),
    );
    expect(adapter.factory.create).toHaveBeenCalledTimes(2);
    expect(current.disposeCount).toBe(1);
    expect(candidate.disposeCount).toBe(0);
    await host.dispose();
  });

  it("disposes an Adapter-created initial port when WorldSession initialization fails", async () => {
    const port = createPortHarness();
    port.failNextOperation(
      "initialize",
      "reject",
      new Error("private initial adapter initialization failure"),
    );
    const adapter = createAdapterFactoryHarness([port]);

    const error = await runtimeHostConstructor().create(hostOptions(
      adapter.factory,
      ["world-session.initial-failure"],
      { initialWorld: nativeWorldConfiguration() },
    )).catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(String(error)).not.toContain(
      "private initial adapter initialization failure",
    );
    expect(adapter.factory.create).toHaveBeenCalledTimes(1);
    expect(port.disposeCount).toBe(1);
  });

  it("rejects tampered Native Package identity before adapter allocation", async () => {
    const baseline = verifiedNativeWorldConfiguration();
    const cases = [
      {
        ...baseline,
        sceneSource: {
          ...baseline.sceneSource,
          bootstrap: {
            ...baseline.sceneSource.bootstrap,
            seed: baseline.sceneSource.bootstrap.seed + 1,
          },
        },
      },
      {
        ...baseline,
        sceneSource: {
          ...baseline.sceneSource,
          sceneModuleBundleRef:
            `package://native-scene-module/sha256/${"f".repeat(64)}` as const,
        },
      },
    ];
    for (const initialWorld of cases) {
      const port = createPortHarness();
      const adapter = createAdapterFactoryHarness([port]);
      await expect(runtimeHostConstructor().create(hostOptions(
        adapter.factory,
        ["world-session.native-tampered"],
        { initialWorld },
      ))).rejects.toThrow("RuntimeWorldConfigurationV1");
      expect(adapter.factory.create).not.toHaveBeenCalled();
      expect(port.calls).toEqual([]);
    }
  });

  it("rejects a Package Ref that does not match World Build Identity Root", async () => {
    const port = createPortHarness();
    const adapter = createAdapterFactoryHarness([port]);
    const baseline = mutableWorldConfiguration(INITIAL_WORLD_PACKAGE_REF);
    const initialWorld = {
      ...baseline,
      worldBuildIdentity: {
        ...baseline.worldBuildIdentity,
        worldPackageRef: `package://world-package/sha256/${"f".repeat(64)}`,
      },
    };

    await expect(runtimeHostConstructor().create(hostOptions(
      adapter.factory,
      ["world-session.ref-mismatch"],
      { initialWorld },
    ))).rejects.toThrow(/RuntimeWorldConfigurationV1/);
    expect(adapter.factory.create).not.toHaveBeenCalled();
    expect(port.calls).toEqual([]);
  });

  it("publishes immutable provider-neutral Runtime Activity counters without lease authority", async () => {
    const current = createPortHarness();
    const { host } = await createHost([current]);

    const initial = host.runtimeActivitySnapshot();
    expect(initial).toEqual({
      runtimeActivityEpoch: 0,
      activeRuntimeActivityCount: 0,
      retainedRuntimeActivityRecordCount: 0,
    });
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.keys(initial)).toEqual([
      "runtimeActivityEpoch",
      "activeRuntimeActivityCount",
      "retainedRuntimeActivityRecordCount",
    ]);
    expect(initial).not.toHaveProperty("lease");
    expect(initial).not.toHaveProperty("handle");

    const acquired = host.acquireRuntimeActivity({
      kind: "runtime-run",
      requestId: "activity.snapshot",
      payloadHash: HASH_A,
    });
    if (acquired.status !== "active") {
      throw new Error("Expected an active Runtime Activity lease.");
    }
    expect(host.runtimeActivitySnapshot()).toEqual({
      runtimeActivityEpoch: 1,
      activeRuntimeActivityCount: 1,
      retainedRuntimeActivityRecordCount: 1,
    });
    expect(initial).toEqual({
      runtimeActivityEpoch: 0,
      activeRuntimeActivityCount: 0,
      retainedRuntimeActivityRecordCount: 0,
    });

    acquired.lease.release();
    expect(host.runtimeActivitySnapshot()).toEqual({
      runtimeActivityEpoch: 2,
      activeRuntimeActivityCount: 0,
      retainedRuntimeActivityRecordCount: 1,
    });
  });

  it("keeps WorldSession state and ID ledgers isolated between two Hosts", async () => {
    const firstPort = createPortHarness();
    const secondPort = createPortHarness();
    const first = await createHost([firstPort], ["world-session.shared"]);
    const second = await createHost([secondPort], ["world-session.shared"]);

    expect(first.host.snapshot().worldState.worldSessionId).toBe(
      "world-session.shared",
    );
    expect(second.host.snapshot().worldState.worldSessionId).toBe(
      "world-session.shared",
    );
    expect(first.host.snapshot()).not.toBe(second.host.snapshot());

    await first.host.runFixedInput({ actions: [], ticks: 1 });
    expect(first.host.snapshot().worldState.simulationTick).toBe(1);
    expect(second.host.snapshot().worldState.simulationTick).toBe(0);
  });

  it("returns a closed capacity Diagnostic after preserving prior fixed Ticks", async () => {
    const current = createPortHarness();
    current.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput: 0,
        maximumSemanticFactTransitionEventCount: 0,
      },
      worldProjectionAfter: projection(1),
    });
    current.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput:
          DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1.maximumSemanticFactCount + 1,
        maximumSemanticFactTransitionEventCount: 0,
      },
      worldProjectionAfter: projection(2),
    });
    const { host } = await createHost([current]);

    await expect(host.runFixedInput({ actions: [], ticks: 2 })).rejects
      .toMatchObject({
        diagnostic: { code: "GAMEPLAY_CAPACITY_EXCEEDED" },
      });
    expect(host.snapshot().worldState.simulationTick).toBe(1);
    expect(current.calls.filter(({ operation }) =>
      operation === "run-fixed-input-tick"
    )).toHaveLength(1);
  });

  it("rejects exact hostile Host options before ID, preflight, or adapter factories", async () => {
    const port = createPortHarness();
    const adapter = createAdapterFactoryHarness([port]);
    const idFactory = vi.fn(() => "world-session.hostile");
    const options = hostOptions(adapter.factory, ["unused"], {
      worldSessionIdFactory: idFactory,
    }) as Record<string, unknown>;
    let accessorReads = 0;
    Object.defineProperty(options, "runtimeSessionId", {
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return RUNTIME_SESSION_ID;
      },
    });

    await expect(runtimeHostConstructor().create(options)).rejects.toThrow(
      /RuntimeHostCreateOptionsV1/,
    );
    expect(accessorReads).toBe(0);
    expect(idFactory).not.toHaveBeenCalled();
    expect(adapter.factory.preflightConcurrentResidency).not.toHaveBeenCalled();
    expect(adapter.factory.create).not.toHaveBeenCalled();
    expect(port.calls).toEqual([]);
  });

  it("rejects an unknown Canonical Scene Plan field before adapter creation", async () => {
    const port = createPortHarness();
    const adapter = createAdapterFactoryHarness([port]);
    const baseline = mutableWorldConfiguration(INITIAL_WORLD_PACKAGE_REF);
    const executionPlan = {
      ...baseline.sceneSource.executionPlan,
      terrain: {
        ...baseline.sceneSource.executionPlan.terrain,
        providerName: "private-heightfield-provider",
      },
    };
    const initialWorld = {
      ...baseline,
      sceneSource: {
        ...baseline.sceneSource,
        executionPlan,
      },
    };

    await expect(runtimeHostConstructor().create(hostOptions(
      adapter.factory,
      ["world-session.invalid-plan"],
      { initialWorld },
    ))).rejects.toThrow(/RuntimeWorldConfigurationV1/);
    expect(adapter.factory.preflightConcurrentResidency).not.toHaveBeenCalled();
    expect(adapter.factory.create).not.toHaveBeenCalled();
    expect(port.calls).toEqual([]);
  });

  it("rejects a duplicate Runtime Subject before adapter creation", async () => {
    const port = createPortHarness();
    const adapter = createAdapterFactoryHarness([port]);
    const baseline = mutableWorldConfiguration(INITIAL_WORLD_PACKAGE_REF);
    const initialWorld = {
      ...baseline,
      worldRuntimeBootstrap: {
        ...baseline.worldRuntimeBootstrap,
        subjectRuntimeDescriptors: [
          ...baseline.worldRuntimeBootstrap.subjectRuntimeDescriptors,
          ...baseline.worldRuntimeBootstrap.subjectRuntimeDescriptors,
        ],
      },
    };

    await expect(runtimeHostConstructor().create(hostOptions(
      adapter.factory,
      ["world-session.duplicate-runtime-subject"],
      { initialWorld },
    ))).rejects.toThrow(/RuntimeWorldConfigurationV1/);
    expect(adapter.factory.preflightConcurrentResidency).not.toHaveBeenCalled();
    expect(adapter.factory.create).not.toHaveBeenCalled();
    expect(port.calls).toEqual([]);
  });

  it("applies the same closed Scene Plan admission before replacement preflight", async () => {
    const current = createPortHarness();
    const candidate = createPortHarness();
    const { adapter, host } = await createHost(
      [current, candidate],
      ["world-session.initial", "world-session.candidate"],
    );
    const baseline = mutableWorldConfiguration(REPLACEMENT_WORLD_PACKAGE_REF);
    const executionPlan = {
      ...baseline.sceneSource.executionPlan,
      traversal: {
        ...baseline.sceneSource.executionPlan.traversal,
        providerHandle: 7,
      },
    };

    expect(() => host.replaceWorld({
      worldConfiguration: {
        ...baseline,
        sceneSource: {
          ...baseline.sceneSource,
          executionPlan,
        },
      },
    })).toThrow(/RuntimeWorldConfigurationV1/);
    expect(adapter.factory.preflightConcurrentResidency).not.toHaveBeenCalled();
    expect(adapter.factory.create).toHaveBeenCalledTimes(1);
    expect(host.snapshot().worldState.worldSessionId).toBe(
      "world-session.initial",
    );
  });

  it("sanitizes a throwing initial WorldSession ID factory with a closed diagnostic", async () => {
    const port = createPortHarness();
    const adapter = createAdapterFactoryHarness([port]);
    const privateMessage = "private initial WorldSession ID allocation failure";
    const idFactory = vi.fn((): string => {
      throw new Error(privateMessage);
    });
    const error = await runtimeHostConstructor().create(hostOptions(
      adapter.factory,
      ["unused"],
      { worldSessionIdFactory: idFactory },
    )).catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_ID_INVALID" },
    });
    expect(String(error)).not.toContain(privateMessage);
    expect(idFactory).toHaveBeenCalledTimes(1);
    expect(adapter.factory.preflightConcurrentResidency).not.toHaveBeenCalled();
    expect(adapter.factory.create).not.toHaveBeenCalled();
    expect(port.calls).toEqual([]);
  });

  it("rejects invalid identity bootstrap and fixed-input lane before adapter creation", async () => {
    const invalidOverrides = [
      {
        name: "participant",
        overrides: {
          participantStates: [{ ...participantState, mode: "disabled" }],
        },
      },
      {
        name: "controller",
        overrides: {
          controllerStates: [{
            ...controllerState,
            participantId: "participant.missing",
          }],
        },
      },
      {
        name: "fixed-input lane",
        overrides: {
          fixedInputControllerEntityId: "controller.missing",
        },
      },
    ] as const;

    for (const invalid of invalidOverrides) {
      const port = createPortHarness();
      const adapter = createAdapterFactoryHarness([port]);
      const idFactory = vi.fn(() => `world-session.invalid-${invalid.name}`);

      await expect(runtimeHostConstructor().create(hostOptions(
        adapter.factory,
        ["unused"],
        { ...invalid.overrides, worldSessionIdFactory: idFactory },
      ))).rejects.toThrow(/RuntimeHostCreateOptionsV1/);
      expect(idFactory, invalid.name).not.toHaveBeenCalled();
      expect(
        adapter.factory.preflightConcurrentResidency,
        invalid.name,
      ).not.toHaveBeenCalled();
      expect(adapter.factory.create, invalid.name).not.toHaveBeenCalled();
      expect(port.calls, invalid.name).toEqual([]);
    }
  });

  it("retains unique WorldSession IDs through N and closes before N+1 adapter creation", async () => {
    const ports = [createPortHarness(), createPortHarness(), createPortHarness()];
    const { adapter, host } = await createHost(
      ports,
      ["world-session.1", "world-session.2", "world-session.3"],
      {
        runtimeHostCapacityBudget: {
          maximumWorldSessionCount: 2,
          maximumRuntimeActivityRecordCount: 8,
        },
      },
    );

    await expect(host.reset()).resolves.toMatchObject({
      worldState: { worldSessionId: "world-session.2" },
    });
    await expect(host.reset()).rejects.toMatchObject({
      diagnostic: { code: "RUNTIME_HOST_CAPACITY_EXCEEDED" },
    });
    expect(adapter.factory.create).toHaveBeenCalledTimes(2);
    expect(ports[2]!.calls).toEqual([]);
  });

  it("never reuses a retained WorldSession ID and preserves the old route", async () => {
    const initial = createPortHarness();
    const unusedCandidate = createPortHarness();
    const { adapter, host } = await createHost(
      [initial, unusedCandidate],
      ["world-session.same", "world-session.same"],
    );
    const before = host.snapshot();

    await expect(host.reset()).rejects.toMatchObject({
      diagnostic: { code: "WORLD_SESSION_ID_INVALID" },
    });
    expect(host.snapshot()).toBe(before);
    expect(adapter.factory.create).toHaveBeenCalledTimes(1);
    expect(initial.disposeCount).toBe(0);
  });
});

describe("RuntimeHost two-phase replacement", () => {
  it("publishes a tick-zero bound reset only after the candidate publication gate", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const { adapter, host } = await createHost([oldPort, candidatePort]);
    const oldPublication = host.snapshot();
    let enterGate!: () => void;
    const gateEntered = new Promise<void>((resolve) => {
      enterGate = resolve;
    });
    let releaseGate!: () => void;
    const gateReleased = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    adapter.factory.awaitCandidatePublicationReady.mockImplementation(
      async (input: {
        runtimeSessionId: string;
        worldSessionId: string;
        publication: WorldSessionPublicationV1;
      }) => {
        expect(Object.keys(input)).toEqual([
          "runtimeSessionId",
          "worldSessionId",
          "publication",
        ]);
        expect(input.runtimeSessionId).toBe(RUNTIME_SESSION_ID);
        expect(input.worldSessionId).toBe("world-session.next");
        const { publication } = input;
        expect(publication.worldState).toMatchObject({
          worldSessionId: "world-session.next",
          simulationTick: 0,
        });
        expect(Object.values(
          publication.gameplayInspection.relationshipStatesById,
        )).toEqual([
          expect.objectContaining({
            controllerEntityId: controllerState.id,
            controlledEntityId: heroState.id,
          }),
        ]);
        expect(candidatePort.commitCount).toBe(1);
        enterGate();
        await gateReleased;
      },
    );

    const resetting = host.resetWithInitialControlBinding({
      controllerEntityId: controllerState.id,
      controlledEntityId: heroState.id,
    });
    await gateEntered;

    expect(host.phase).toBe("replacing");
    expect(host.snapshot()).toBe(oldPublication);
    expect(oldPort.disposeCount).toBe(0);
    releaseGate();

    await expect(resetting).resolves.toMatchObject({
      worldState: {
        worldSessionId: "world-session.next",
        simulationTick: 0,
      },
      gameplayInspection: {
        relationshipStatesById: expect.objectContaining({}),
      },
    });
    expect(Object.values(
      host.snapshot().gameplayInspection.relationshipStatesById,
    )).toEqual([
      expect.objectContaining({
        controllerEntityId: controllerState.id,
        controlledEntityId: heroState.id,
      }),
    ]);
    expect(host.phase).toBe("ready");
    expect(adapter.factory.awaitCandidatePublicationReady).toHaveBeenCalledTimes(1);
    expect(oldPort.disposeCount).toBe(1);
    expect(candidatePort.disposeCount).toBe(0);
  });

  it("rejects an uncommitted initial bind without gating or swapping and keeps the old Session usable", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const { adapter, host } = await createHost([oldPort, candidatePort]);
    const oldSessionId = host.currentWorldSessionId;

    await expect(host.resetWithInitialControlBinding({
      controllerEntityId: controllerState.id,
      controlledEntityId: "entity.not-controllable",
    })).rejects.toMatchObject({
      diagnostic: expect.objectContaining({ code: expect.any(String) }),
    });

    expect(host.phase).toBe("ready");
    expect(host.currentWorldSessionId).toBe(oldSessionId);
    expect(adapter.factory.awaitCandidatePublicationReady).not.toHaveBeenCalled();
    expect(candidatePort.disposeCount).toBe(1);
    await expect(host.runFixedInput({ actions: [], ticks: 1 })).resolves
      .toMatchObject({
        worldState: { worldSessionId: oldSessionId, simulationTick: 1 },
      });
  });

  it("rejects a non-exact initial binding before starting replacement", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const { adapter, host } = await createHost([oldPort, candidatePort]);
    const before = host.snapshot();

    expect(() => host.resetWithInitialControlBinding({
      controllerEntityId: controllerState.id,
      controlledEntityId: heroState.id,
      legacyControlledSubjectId: heroState.id,
    })).toThrow(/RuntimeHostInitialControlBindingV1/);

    expect(host.snapshot()).toBe(before);
    expect(adapter.factory.create).toHaveBeenCalledTimes(1);
    expect(adapter.factory.awaitCandidatePublicationReady).not.toHaveBeenCalled();
    expect(candidatePort.calls).toEqual([]);
  });

  it("does not publish a bound candidate when its publication gate throws", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const { adapter, host } = await createHost([oldPort, candidatePort]);
    const oldSessionId = host.currentWorldSessionId;
    adapter.factory.awaitCandidatePublicationReady.mockRejectedValueOnce(
      new Error("private first-render failure"),
    );

    const error = await host.resetWithInitialControlBinding({
      controllerEntityId: controllerState.id,
      controlledEntityId: heroState.id,
    }).catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(String(error)).not.toContain("private first-render failure");
    expect(host.phase).toBe("ready");
    expect(host.currentWorldSessionId).toBe(oldSessionId);
    expect(candidatePort.disposeCount).toBe(1);
    await expect(host.runFixedInput({ actions: [], ticks: 1 })).resolves
      .toMatchObject({
        worldState: { worldSessionId: oldSessionId, simulationTick: 1 },
      });
  });

  it("keeps the old Session routable while candidate initialization is deferred", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const initialize = candidatePort.deferNextOperation("initialize");
    const { host } = await createHost([oldPort, candidatePort]);
    const oldSessionId = host.snapshot().worldState.worldSessionId;

    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    await initialize.entered;

    await expect(host.runFixedInput({ actions: [], ticks: 1 })).resolves
      .toMatchObject({
        worldState: {
          worldSessionId: oldSessionId,
          simulationTick: 1,
        },
      });
    expect(host.snapshot().worldState.worldSessionId).toBe(oldSessionId);

    initialize.release();
    await expect(replacement).resolves.toMatchObject({
      worldState: {
        worldSessionId: "world-session.next",
        worldPackageRef: REPLACEMENT_WORLD_PACKAGE_REF,
      },
    });
    expect(oldPort.disposeCount).toBe(1);
  });

  it("does not swap a deferred candidate after the old Session fail-closes", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const initialize = candidatePort.deferNextOperation("initialize");
    oldPort.failNextOperation(
      "run-fixed-input-tick",
      "reject",
      new Error("private old fixed-input failure"),
    );
    const { host } = await createHost([oldPort, candidatePort]);
    const oldSessionId = host.snapshot().worldState.worldSessionId;
    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    await initialize.entered;

    const failedPublication = await host.runFixedInput({ actions: [], ticks: 1 });
    expect(failedPublication).toMatchObject({
      worldState: {
        worldSessionId: oldSessionId,
        worldPackageRef: INITIAL_WORLD_PACKAGE_REF,
        simulationTick: 0,
      },
      gameplayInspection: {
        phase: "failed",
        diagnostic: { code: "ADAPTER_FIXED_INPUT_FAILED" },
      },
    });
    expect(host.snapshot()).toBe(failedPublication);

    initialize.release();
    await expect(replacement).rejects.toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(host.snapshot()).toBe(failedPublication);
    expect(host.snapshot().worldState.worldSessionId).toBe(oldSessionId);
    expect(candidatePort.disposeCount).toBe(1);
  });

  it("sanitizes a throwing replacement WorldSession ID factory", async () => {
    const initialPort = createPortHarness();
    const unusedCandidate = createPortHarness();
    const privateMessage = "private replacement WorldSession ID allocation failure";
    const idFactory = vi.fn()
      .mockReturnValueOnce("world-session.initial")
      .mockImplementation((): string => {
        throw new Error(privateMessage);
      });
    const { adapter, host } = await createHost(
      [initialPort, unusedCandidate],
      ["unused"],
      { worldSessionIdFactory: idFactory },
    );
    const before = host.snapshot();
    const error = await host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    ).catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_ID_INVALID" },
    });
    expect(String(error)).not.toContain(privateMessage);
    expect(host.snapshot()).toBe(before);
    expect(idFactory).toHaveBeenCalledTimes(2);
    expect(adapter.factory.preflightConcurrentResidency).not.toHaveBeenCalled();
    expect(adapter.factory.create).toHaveBeenCalledTimes(1);
    expect(initialPort.disposeCount).toBe(0);
    expect(unusedCandidate.calls).toEqual([]);
  });

  it("cancels a candidate swap when Activity epoch changes during its build", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const initialize = candidatePort.deferNextOperation("initialize");
    const { host } = await createHost([oldPort, candidatePort]);
    const oldPublication = host.snapshot();
    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    await initialize.entered;

    const acquisition = host.acquireRuntimeActivity({
      kind: "simulation-take",
      requestId: "activity.during-candidate",
      payloadHash: HASH_B,
    });
    expect(acquisition.status).toBe("active");
    if (acquisition.status !== "active") {
      throw new Error("Expected an active Runtime Activity lease.");
    }
    acquisition.lease.release();
    initialize.release();

    await expect(replacement).rejects.toMatchObject({
      diagnostic: { code: "WORLD_REPLACEMENT_BLOCKED_BY_ACTIVE_ACTIVITY" },
    });
    expect(host.snapshot()).toBe(oldPublication);
    expect(candidatePort.disposeCount).toBe(1);
    expect(oldPort.disposeCount).toBe(0);
    await expect(host.runFixedInput({ actions: [], ticks: 1 })).resolves
      .toMatchObject({ worldState: { simulationTick: 1 } });
  });

  it("preserves the cancellation diagnostic when candidate cleanup throws", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const initialize = candidatePort.deferNextOperation("initialize");
    const privateMessage = "private cancelled candidate cleanup failure";
    candidatePort.failNextOperation(
      "dispose",
      "throw",
      new Error(privateMessage),
    );
    const { host } = await createHost([oldPort, candidatePort]);
    const oldPublication = host.snapshot();
    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    await initialize.entered;

    const acquisition = host.acquireRuntimeActivity({
      kind: "simulation-take",
      requestId: "activity.cancel-with-throwing-cleanup",
      payloadHash: HASH_B,
    });
    expect(acquisition.status).toBe("active");
    if (acquisition.status !== "active") {
      throw new Error("Expected an active Runtime Activity lease.");
    }
    acquisition.lease.release();
    initialize.release();

    const error = await replacement.catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_REPLACEMENT_BLOCKED_BY_ACTIVE_ACTIVITY" },
    });
    expect(String(error)).not.toContain(privateMessage);
    expect(host.snapshot()).toBe(oldPublication);
    expect(oldPort.disposeCount).toBe(0);
  });

  it("publishes the successful swap before disposing old and never rolls back on cleanup failure", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    oldPort.failNextOperation(
      "dispose",
      "reject",
      new Error("private old cleanup failure"),
    );
    const { host } = await createHost([oldPort, candidatePort]);

    const error = await host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    ).catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(String(error)).not.toContain("private old cleanup failure");
    expect(host.snapshot().worldState).toMatchObject({
      worldSessionId: "world-session.next",
      worldPackageRef: REPLACEMENT_WORLD_PACKAGE_REF,
    });
    expect(candidatePort.disposeCount).toBe(0);
  });

  it("starts old cleanup only after pointer swap and sanitizes deferred cleanup failure", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const retiringDispose = oldPort.deferNextOperation("dispose");
    const { host } = await createHost([oldPort, candidatePort]);
    const privateMessage = "private deferred retiring cleanup failure";
    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );

    await retiringDispose.entered;
    expect(host.snapshot().worldState).toMatchObject({
      worldSessionId: "world-session.next",
      worldPackageRef: REPLACEMENT_WORLD_PACKAGE_REF,
    });
    expect(candidatePort.disposeCount).toBe(0);

    retiringDispose.reject(new Error(privateMessage));
    const error = await replacement.catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(String(error)).not.toContain(privateMessage);
    expect(host.snapshot().worldState).toMatchObject({
      worldSessionId: "world-session.next",
      worldPackageRef: REPLACEMENT_WORLD_PACKAGE_REF,
    });
    expect(candidatePort.disposeCount).toBe(0);
  });

  it("reset reuses the frozen initial configuration and creates an unbound Session", async () => {
    const initialPort = createPortHarness();
    const replacementPort = createPortHarness();
    const resetPort = createPortHarness();
    const created = await createHost(
      [initialPort, replacementPort, resetPort],
      ["world-session.initial", "world-session.replacement", "world-session.reset"],
    );
    const callerOwnedIdentity = (
      created.options as {
        initialWorld: { worldBuildIdentity: { worldPackageRef: string } };
      }
    ).initialWorld.worldBuildIdentity;
    callerOwnedIdentity.worldPackageRef =
      `package://world-package/sha256/${"f".repeat(64)}`;

    await created.host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    const reset = await created.host.reset();

    expect(reset.worldState).toMatchObject({
      worldSessionId: "world-session.reset",
      worldPackageRef: INITIAL_WORLD_PACKAGE_REF,
    });
    expect(reset.gameplayInspection.relationshipStatesById).toEqual({});
    expect(reset.worldState.simulationTick).toBe(0);
    const resetGateInput = created.adapter.factory
      .awaitCandidatePublicationReady.mock.calls.at(-1)?.[0] as
        | { publication: WorldSessionPublicationV1 }
        | undefined;
    expect(resetGateInput?.publication.gameplayInspection
      .relationshipStatesById).toEqual({});
  });
});

describe("RuntimeHost disposal joins", () => {
  it("aborts active Runtime Activity and waits for its registered cleanup", async () => {
    const current = createPortHarness();
    const { host } = await createHost([current]);
    const acquired = host.acquireRuntimeActivity({
      kind: "runtime-run",
      requestId: "activity.dispose-join",
      payloadHash: HASH_A,
    });
    if (acquired.status !== "active") {
      throw new Error("Expected an active Runtime Activity lease.");
    }
    let finishCleanup!: () => void;
    acquired.lease.registerCleanup(new Promise<void>((resolve) => {
      finishCleanup = resolve;
    }));

    const disposing = host.dispose();
    await vi.waitFor(() => {
      expect(acquired.lease.cancellationSignal.aborted).toBe(true);
    });
    let settled = false;
    void disposing.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishCleanup();
    await expect(disposing).resolves.toBeUndefined();
    expect(acquired.lease.release()).toMatchObject({
      status: "terminated-by-host",
    });
    expect(current.disposeCount).toBe(1);
  });

  it("sanitizes a registered Runtime Activity cleanup that failed before disposal", async () => {
    const current = createPortHarness();
    const { host } = await createHost([current]);
    const acquired = host.acquireRuntimeActivity({
      kind: "control-capture",
      requestId: "activity.failed-cleanup",
      payloadHash: HASH_A,
    });
    if (acquired.status !== "active") {
      throw new Error("Expected an active Runtime Activity lease.");
    }
    const privateMessage = "private capture cleanup failure";
    acquired.lease.registerCleanup(Promise.reject(new Error(privateMessage)));
    await Promise.resolve();

    const error = await host.dispose().catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(String(error)).not.toContain(privateMessage);
    expect(acquired.lease.cancellationSignal.aborted).toBe(true);
    expect(current.disposeCount).toBe(1);
  });

  it("joins cleanup registered before a Runtime Activity was released", async () => {
    const current = createPortHarness();
    const { host } = await createHost([current]);
    const acquired = host.acquireRuntimeActivity({
      kind: "runtime-run",
      requestId: "activity.released-cleanup",
      payloadHash: HASH_A,
    });
    if (acquired.status !== "active") {
      throw new Error("Expected an active Runtime Activity lease.");
    }
    let finishCleanup!: () => void;
    acquired.lease.registerCleanup(new Promise<void>((resolve) => {
      finishCleanup = resolve;
    }));
    expect(acquired.lease.release()).toMatchObject({ status: "released" });

    const disposing = host.dispose();
    let settled = false;
    void disposing.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishCleanup();
    await expect(disposing).resolves.toBeUndefined();
    expect(current.disposeCount).toBe(1);
  });

  it("waits for every Activity cleanup before returning a sanitized failure", async () => {
    const current = createPortHarness();
    const { host } = await createHost([current]);
    const first = host.acquireRuntimeActivity({
      kind: "control-capture",
      requestId: "activity.cleanup-fails",
      payloadHash: HASH_A,
    });
    const second = host.acquireRuntimeActivity({
      kind: "simulation-take",
      requestId: "activity.cleanup-pending",
      payloadHash: HASH_B,
    });
    if (first.status !== "active" || second.status !== "active") {
      throw new Error("Expected active Runtime Activity leases.");
    }
    const privateMessage = "private first cleanup failure";
    first.lease.registerCleanup(Promise.reject(new Error(privateMessage)));
    let finishSecondCleanup!: () => void;
    second.lease.registerCleanup(new Promise<void>((resolve) => {
      finishSecondCleanup = resolve;
    }));

    const disposing = host.dispose();
    let settled = false;
    void disposing.catch(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    finishSecondCleanup();
    const error = await disposing.catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(String(error)).not.toContain(privateMessage);
    expect(current.disposeCount).toBe(1);
  });

  it("synchronously closes admission and returns the same dispose Promise", async () => {
    const current = createPortHarness();
    const unused = createPortHarness();
    const currentDispose = current.deferNextOperation("dispose");
    const { adapter, host } = await createHost([current, unused]);

    const first = host.dispose();
    const second = host.dispose();
    expect(second).toBe(first);
    await currentDispose.entered;

    await expect(host.reset()).rejects.toMatchObject({
      diagnostic: { code: "WORLD_SESSION_NOT_READY" },
    });
    expect(adapter.factory.create).toHaveBeenCalledTimes(1);

    currentDispose.release();
    await expect(first).resolves.toBeUndefined();
    expect(current.disposeCount).toBe(1);
  });

  it("joins a pending candidate and disposes candidate and current exactly once", async () => {
    const current = createPortHarness();
    const candidate = createPortHarness();
    const candidateInitialize = candidate.deferNextOperation("initialize");
    const currentDispose = current.deferNextOperation("dispose");
    const { host } = await createHost([current, candidate]);
    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    await candidateInitialize.entered;

    const firstDispose = host.dispose();
    const repeatedDispose = host.dispose();
    expect(repeatedDispose).toBe(firstDispose);
    await currentDispose.entered;
    candidateInitialize.release();
    currentDispose.release();

    await expect(replacement).rejects.toMatchObject({
      diagnostic: { code: "WORLD_SESSION_NOT_READY" },
    });
    await expect(firstDispose).resolves.toBeUndefined();
    expect(current.disposeCount).toBe(1);
    expect(candidate.disposeCount).toBe(1);
  });

  it("joins retiring-old cleanup after a committed swap as well as current cleanup", async () => {
    const oldPort = createPortHarness();
    const currentPort = createPortHarness();
    const retiringDispose = oldPort.deferNextOperation("dispose");
    const currentDispose = currentPort.deferNextOperation("dispose");
    const { host } = await createHost([oldPort, currentPort]);
    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    await retiringDispose.entered;
    expect(host.snapshot().worldState.worldSessionId).toBe("world-session.next");

    const disposing = host.dispose();
    await currentDispose.entered;
    let isSettled = false;
    void disposing.finally(() => {
      isSettled = true;
    });
    await Promise.resolve();
    expect(isSettled).toBe(false);

    currentDispose.release();
    await Promise.resolve();
    expect(isSettled).toBe(false);
    retiringDispose.release();

    await expect(replacement).resolves.toMatchObject({
      worldState: { worldSessionId: "world-session.next" },
    });
    await expect(disposing).resolves.toBeUndefined();
    expect(oldPort.disposeCount).toBe(1);
    expect(currentPort.disposeCount).toBe(1);
  });
});
