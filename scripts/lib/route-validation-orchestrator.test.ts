import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import {
  compileResolvedTraversalLockV1,
  compileWorldV5,
} from "@whitebox-world/compiler";
import {
  canonicalJsonBytes,
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import type { ExecutionPlanV5 } from "@whitebox-world/runtime-contracts";
import {
  BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
} from "@whitebox-world/runtime-babylon";
import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
  canonicalRouteConnectivityResultV2,
  canonicalRouteConnectivityFailureV2,
  canonicalTraversalRuntimeTickEvidenceV1,
  createTraversalCapabilityEnvelopeV1,
  resolveTraversalDriverProfileV1,
  resolveTraversalGraphBuilderProfileV2,
  hashRouteConnectivityFailureV2,
  type RouteBuildInputReceiptV2,
  type ResolvedTraversalLockReceiptV1,
  type RoutePathReceiptV2,
  type TraversalRuntimePortV1,
} from "@whitebox-world/traversal";
import {
  createRouteBuildInputFromPlanV2,
  evaluateRequiredRouteV2,
} from "@whitebox-world/traversal-recast";
import {
  createRouteValidationReportV2,
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  runRouteRuntimeProbeV2,
  type WorldPackageValidationSubjectV1,
} from "@whitebox-world/validation";
import { isNil } from "lodash-es";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createValidAuthoringSpec } from "../../packages/authoring/src/test-fixture.js";
import {
  orchestrateRouteValidationV1,
  type RouteValidationOrchestratorOperationsV1,
  type RouteValidationRuntimeLeaseV1,
} from "./route-validation-orchestrator.js";

type Hash = `sha256:${string}`;

interface PreparedFixture {
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly executionPlan: ExecutionPlanV5;
  readonly subject: WorldPackageValidationSubjectV1;
}

function createRouteAuthoringSpec(input: Readonly<{
  blocked?: boolean;
  multipleRows?: boolean;
}> = {}): AuthoringSpecV4 {
  const source = createValidAuthoringSpec();
  const nodes = source.nodes
    .filter((node) => node.kind !== "water" && node.kind !== "object")
    .map((node): AuthoringSpecV4["nodes"][number] => {
      if (node.kind === "terrain") {
        return {
          ...node,
          components: {
            terrain: {
              ...node.components.terrain,
              source: {
                kind: "procedural",
                relief: "flat",
                baseHeightMeters: 0,
                amplitudeMeters: 0,
              },
              grid: {
                centerMetersXZ: [0, 0],
                sizeMetersXZ: [20, 20],
                resolutionCellsXZ: [17, 17],
              },
            },
          },
        };
      }
      if (node.id === "spawn-main" && node.kind === "anchor") {
        return {
          ...node,
          placement: {
            kind: "fixed",
            transform: { positionMetersXYZ: [0, 0, 4] },
          },
        };
      }
      return node;
    });
  const extraNodes: AuthoringSpecV4["nodes"] = input.multipleRows === true
    ? [
        {
          id: "spawn-secondary",
          kind: "anchor",
          placement: {
            kind: "fixed",
            transform: { positionMetersXYZ: [1, 0, 4] },
          },
          semantic: { classId: "spawn.secondary" },
        },
        {
          id: "player-secondary",
          kind: "subject",
          subjectDefinitionRef:
            "worldkit://subject-definition/humanoid.third-person@1",
          spawnAnchorEntityId: "spawn-secondary",
        },
        {
          id: "goal-secondary",
          kind: "anchor",
          placement: {
            kind: "fixed",
            transform: { positionMetersXYZ: [1, 0, -4] },
          },
          semantic: { classId: "route.destination.secondary" },
        },
      ]
    : [];
  return {
    ...source,
    schemaVersion: 4,
    resources: {
      ...source.resources,
      prototypes: [
        ...source.resources.prototypes,
        {
          id: "ceiling",
          version: 1,
          kind: "primitive",
          primitive: "box",
          sizeMetersXYZ: [14, 0.2, 2],
          collisionEnabled: true,
          semantic: { classId: "obstacle.ceiling" },
        },
      ],
    },
    world: {
      ...source.world,
      bounds: {
        centerMetersXZ: [0, 0],
        sizeMetersXZ: [20, 20],
        heightRangeMeters: [-5, 10],
      },
    },
    spatial: {
      ...source.spatial,
      traversalAreas: [],
      routes: [{
        id: "main-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[0, 4], [0, -4]],
        widthMeters: input.multipleRows === true ? 5 : 4,
        locomotionProfileRef:
          "worldkit://locomotion-profile/ground.standard@1",
      }],
    },
    nodes: [
      ...nodes,
      {
        id: "goal",
        kind: "anchor",
        placement: {
          kind: "fixed",
          transform: {
            positionMetersXYZ: [0, 0, -4],
          },
        },
        semantic: { classId: "route.destination" },
      },
      ...(input.blocked === true
        ? [
            {
              id: "route-wall",
              kind: "object" as const,
              prototypeRef: "package://prototype/wall@1",
              placement: {
                kind: "fixed" as const,
                transform: {
                  positionMetersXYZ: [0, 2, 1.5] as const,
                  rotationEulerRadiansXYZ: [0, Math.PI / 2, 0] as const,
                },
              },
            },
            {
              id: "route-ceiling",
              kind: "object" as const,
              prototypeRef: "package://prototype/ceiling@1",
              placement: {
                kind: "fixed" as const,
                transform: {
                  positionMetersXYZ: [0, 1.3, -1.5] as const,
                },
              },
            },
          ]
        : []),
      ...extraNodes,
    ],
    constraints: {
      placements: source.constraints.placements,
      connectivity: [
        ...(input.multipleRows === true
          ? [{
              id: "z-secondary-route",
              kind: "connected-by-route" as const,
              requirement: "required" as const,
              traversingEntityId: "player-secondary",
              startAnchorEntityId: "spawn-secondary",
              destinationAnchorEntityId: "goal-secondary",
              routeId: "main-route",
            }]
          : []),
        {
          id: input.multipleRows === true ? "a-primary-route" : "hero-to-goal",
          kind: "connected-by-route",
          requirement: "required",
          traversingEntityId: "player",
          startAnchorEntityId: "spawn-main",
          destinationAnchorEntityId: "goal",
          routeId: "main-route",
        },
      ],
    },
  };
}

function subjectForPlan(executionPlan: ExecutionPlanV5): WorldPackageValidationSubjectV1 {
  return Object.freeze({
    kind: "world-package",
    worldPackageRootHash: `sha256:${"f".repeat(64)}` as Hash,
    authoringSpecHash: executionPlan.authoringSpecHash,
    normalizedWorldIrHash: executionPlan.normalizedWorldIrHash as Hash,
    executionPlanHash: sha256CanonicalJson(executionPlan) as Hash,
    resourceLockHash: executionPlan.resourceLockHash as Hash,
    layoutSolveReportHash: executionPlan.layout.layoutSolveReportHash as Hash,
  });
}

function prepareFixture(spec: AuthoringSpecV4): PreparedFixture {
  const normalized = normalizeAuthoringSpecV4(spec);
  if (
    !normalized.ok ||
    isNil(normalized.value) ||
    isNil(normalized.normalizedWorldIrHash)
  ) {
    throw new Error(`normalization failed: ${JSON.stringify(normalized.diagnostics)}`);
  }
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok || isNil(compiled.executionPlan)) {
    throw new Error(`compilation failed: ${JSON.stringify(compiled.diagnostics)}`);
  }
  return {
    normalizedWorldIr: normalized.value,
    executionPlan: compiled.executionPlan,
    subject: subjectForPlan(compiled.executionPlan),
  };
}

function fakeRuntimePort(input: Readonly<{
  executionPlan: ExecutionPlanV5;
  lockReceipt: ResolvedTraversalLockReceiptV1;
  routePathReceipt: RoutePathReceiptV2;
  stalled?: boolean;
}>): TraversalRuntimePortV1 {
  const path = input.routePathReceipt;
  const lock = input.lockReceipt;
  const world = {
    authoringSpecHash: input.executionPlan.authoringSpecHash,
    layoutSolveReportHash: input.executionPlan.layout.layoutSolveReportHash as Hash,
    resourceLockHash: input.executionPlan.resourceLockHash as Hash,
    executionPlanHash: sha256CanonicalJson(input.executionPlan) as Hash,
  };
  const runtimeImplementationIdentity = {
    runtimeBackendRef: lock.lock.runtimeBackendRef,
    runtimeBackendResolvedVersion: lock.lock.runtimeBackendResolvedVersion,
    runtimeBackendHash: lock.lock.runtimeBackendHash,
    runtimeAdapterRef: lock.lock.runtimeAdapterRef,
    runtimeAdapterResolvedVersion: lock.lock.runtimeAdapterResolvedVersion,
    runtimeAdapterHash: lock.lock.runtimeAdapterHash,
  };
  let tick = 0;
  let position = [...path.orderedPathPositionsMetersXYZ[0]!] as [number, number, number];
  const evidence = (velocity: readonly [number, number, number]) =>
    canonicalTraversalRuntimeTickEvidenceV1({
      kind: "traversal-runtime-tick-evidence",
      schemaVersion: 1,
      tick,
      traversingEntityId: path.traversingEntityId,
      ...world,
      resolvedTraversalLockHash: lock.resolvedTraversalLockHash,
      runtimeImplementationIdentity,
      fixedTimeStepSeconds: 1 / 60,
      subjectPositionMetersXYZ: position,
      velocityMetersPerSecondXYZ: velocity,
      movementMedium: "ground",
      locomotionMode: tick === 0 ? "idle" : "walk",
      characterSupport: {
        kind: "character-support-evidence",
        schemaVersion: 1,
        supportState: "supported",
        supportNormalWorldXYZ: [0, 1, 0],
        sampledFootPositionMetersXYZ: position,
        isSupportSurfaceDynamic: false,
        surfaceResolution: {
          mode: "resolved",
          ...path.orderedTraversalSurfaceIdentities[0],
        },
      },
    });
  return {
    kind: "traversal-runtime-port",
    schemaVersion: 1,
    traversingEntityId: path.traversingEntityId,
    ...world,
    resolvedTraversalLockHash: lock.resolvedTraversalLockHash,
    runtimeImplementationIdentity,
    readLatestTickEvidence: () => evidence([0, 0, 0]),
    resetToStartAnchor: () => {
      tick = 0;
      position = [...path.orderedPathPositionsMetersXYZ[0]!] as [number, number, number];
      return evidence([0, 0, 0]);
    },
    runFixedTick: async ({ walkDirectionWorldXZ }) => {
      tick += 1;
      if (input.stalled !== true) {
        position = [
          position[0] + walkDirectionWorldXZ[0] * 0.1,
          position[1],
          position[2] + walkDirectionWorldXZ[1] * 0.1,
        ];
      }
      return evidence([
        input.stalled === true ? 0 : walkDirectionWorldXZ[0] * 6,
        0,
        input.stalled === true ? 0 : walkDirectionWorldXZ[1] * 6,
      ]);
    },
  };
}

function incompleteResultForBuildInput(
  receipt: RouteBuildInputReceiptV2,
) {
  const input = receipt.input;
  const requirement = input.connectivityRequirement;
  const envelope = input.capabilityEnvelope;
  const failure = canonicalRouteConnectivityFailureV2({
    kind: "route-connectivity-failure",
    schemaVersion: 2,
    constraintId: requirement.constraintId,
    routeId: requirement.routeId,
    traversingEntityId: requirement.traversingEntityId,
    startAnchorEntityId: input.startAnchor.entityId,
    destinationAnchorEntityId: input.destinationAnchor.entityId,
    startAnchorPositionMetersXYZ: input.startAnchor.positionMetersXYZ,
    destinationAnchorPositionMetersXYZ: input.destinationAnchor.positionMetersXYZ,
    traversalSurfaceId: input.traversalSurfaces[0]!.traversalSurfaceId,
    surfaceEntityId: input.traversalSurfaces[0]!.surfaceEntityId,
    colliderSubshapeId: input.traversalSurfaces[0]!.colliderSubshapeId,
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: envelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: envelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: envelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: envelope.graphBuilderProfileHash,
    status: "incomplete",
    graphStatus: "unavailable",
    reason: {
      kind: "node-budget-exceeded",
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
      maximumAllowedCount: envelope.maximumNodes,
      minimumRequiredCount: envelope.maximumNodes + 1,
    },
  });
  return canonicalRouteConnectivityResultV2({
    kind: "heightfield-route-connectivity-result",
    schemaVersion: 1,
    status: "incomplete",
    graphStatus: "unavailable",
    connectivityFailure: failure,
    connectivityFailureHash: hashRouteConnectivityFailureV2(failure),
  });
}

function operationsForFixture(
  fixture: PreparedFixture,
  overrides: Partial<RouteValidationOrchestratorOperationsV1> = {},
): RouteValidationOrchestratorOperationsV1 {
  const operations: RouteValidationOrchestratorOperationsV1 = {
    compileTraversalLock: ({ executionPlan, traversingEntityId }) =>
      compileResolvedTraversalLockV1({
        normalizedWorldIr: fixture.normalizedWorldIr,
        executionPlan,
        traversingEntityId,
        runtimeImplementationIdentity:
          BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
      }),
    resolveGraphBuilderProfile: () =>
      resolveTraversalGraphBuilderProfileV2(
        BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
      ),
    createCapabilityEnvelope: (input) =>
      createTraversalCapabilityEnvelopeV1(input),
    createBuildInput: (input) => createRouteBuildInputFromPlanV2(input),
    evaluateRoute: (input) => evaluateRequiredRouteV2(input),
    createRuntimeLease: async ({ executionPlan, traversalLockReceipt, routePathReceipt }) => ({
      runtimePort: fakeRuntimePort({
        executionPlan,
        lockReceipt: traversalLockReceipt,
        routePathReceipt,
      }),
      dispose: async () => undefined,
    }),
    resolveDriverProfile: () =>
      resolveTraversalDriverProfileV1(BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF),
    runRuntimeProbe: (input) => runRouteRuntimeProbeV2(input),
    createReport: (input) => createRouteValidationReportV2(input),
    ...overrides,
  };
  return operations;
}

describe("orchestrateRouteValidationV1", () => {
  let complete: PreparedFixture;
  let unreachable: PreparedFixture;
  let multiple: PreparedFixture;

  beforeAll(() => {
    complete = prepareFixture(createRouteAuthoringSpec());
    unreachable = prepareFixture(createRouteAuthoringSpec({ blocked: true }));
    multiple = prepareFixture(createRouteAuthoringSpec({ multipleRows: true }));
  });

  it("runs the real compile, Recast, probe, overlay, and report contracts for a passing Route", async () => {
    const result = await orchestrateRouteValidationV1({
      executionPlan: complete.executionPlan,
      subject: complete.subject,
      reportId: "route-real-pass",
    }, operationsForFixture(complete));

    expect(result.report.status).toBe("passed");
    expect(result.report.routeValidationSetReceipt.rows).toMatchObject([{
      constraintId: "hero-to-goal",
      connectivityStatus: "complete",
      runtimeStatus: "complete",
    }]);
    expect(result.evidenceFiles.map(({ kind }) => kind)).toEqual([
      "route-validation-set-receipt",
      "traversal-graph",
      "route-path-receipt",
      "route-runtime-probe-receipt",
      "route-overlay",
    ]);
    expect(result.evidenceFiles.map(({ relativePath }) => relativePath).sort())
      .toEqual(result.evidenceFiles.map(({ relativePath }) => relativePath));
    expect(JSON.stringify(result)).not.toMatch(
      /providerHandle|providerPolygonRef|nativeHandle|havokBodyHandle/,
    );
  }, 60_000);

  it("executes every complete-row stage exactly once in the frozen order", async () => {
    const events: string[] = [];
    const base = operationsForFixture(complete);
    const operations: RouteValidationOrchestratorOperationsV1 = {
      compileTraversalLock: (input) => {
        events.push("lock");
        return base.compileTraversalLock(input);
      },
      resolveGraphBuilderProfile: () => {
        events.push("profile");
        return base.resolveGraphBuilderProfile();
      },
      createCapabilityEnvelope: (input) => {
        events.push("envelope");
        return base.createCapabilityEnvelope(input);
      },
      createBuildInput: (input) => {
        events.push("build-input");
        return base.createBuildInput(input);
      },
      evaluateRoute: (input) => {
        events.push("recast-evaluation");
        return base.evaluateRoute(input);
      },
      createRuntimeLease: async (input) => {
        events.push("runtime-create");
        const lease = await base.createRuntimeLease(input);
        return {
          ...lease,
          dispose: async () => {
            events.push("runtime-dispose");
            await lease.dispose();
          },
        };
      },
      resolveDriverProfile: () => {
        events.push("driver-profile");
        return base.resolveDriverProfile();
      },
      runRuntimeProbe: (input) => {
        events.push("runtime-probe");
        return base.runRuntimeProbe(input);
      },
      createReport: (input) => {
        events.push("report");
        return base.createReport(input);
      },
    };

    await orchestrateRouteValidationV1({
      executionPlan: complete.executionPlan,
      subject: complete.subject,
      reportId: "route-stage-order",
    }, operations);

    expect(events).toEqual([
      "lock",
      "profile",
      "envelope",
      "build-input",
      "recast-evaluation",
      "runtime-create",
      "driver-profile",
      "runtime-probe",
      "runtime-dispose",
      "report",
    ]);
  }, 60_000);

  it("produces the canonical zero-row failed report without compiling a lock or creating a Runtime", async () => {
    const executionPlan: ExecutionPlanV5 = {
      ...complete.executionPlan,
      traversal: {
        ...complete.executionPlan.traversal,
        connectivityRequirements: [],
      },
    };
    const compileTraversalLock = vi.fn();
    const createRuntimeLease = vi.fn();
    const operations = operationsForFixture(complete, {
      compileTraversalLock,
      createRuntimeLease,
    });
    const result = await orchestrateRouteValidationV1({
      executionPlan,
      subject: subjectForPlan(executionPlan),
      reportId: "route-zero",
    }, operations);

    expect(result.report.status).toBe("failed");
    expect(result.report.routeValidationSetReceipt.rows).toEqual([]);
    expect(compileTraversalLock).not.toHaveBeenCalled();
    expect(createRuntimeLease).not.toHaveBeenCalled();
    expect(result.evidenceFiles).toHaveLength(1);
    expect(result.publicationRows).toEqual([]);
  });

  it("rejects non-canonical input before invoking any trusted operation", async () => {
    const compileTraversalLock = vi.fn();
    const operations = operationsForFixture(complete, { compileTraversalLock });
    const input = {
      executionPlan: complete.executionPlan,
      subject: complete.subject,
      reportId: " route-invalid ",
      providerHandle: 42,
    } as unknown as Parameters<typeof orchestrateRouteValidationV1>[0];

    await expect(orchestrateRouteValidationV1(input, operations)).rejects.toThrow(
      "ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID",
    );
    expect(compileTraversalLock).not.toHaveBeenCalled();
  });

  it.each([
    "input",
    "subject",
    "dependency-array",
  ] as const)("rejects a hidden unknown own field on %s before trusted work", async (target) => {
    const compileTraversalLock = vi.fn();
    const operations = operationsForFixture(complete, { compileTraversalLock });
    const subject = { ...complete.subject };
    const dependencyReportRefs = ["report://dependency/one"];
    const input = {
      executionPlan: complete.executionPlan,
      subject,
      reportId: `route-hidden-${target}`,
      dependencyReportRefs,
    };
    Object.defineProperty(
      target === "input"
        ? input
        : target === "subject"
        ? subject
        : dependencyReportRefs,
      "providerHandle",
      { value: 42, enumerable: false },
    );

    await expect(orchestrateRouteValidationV1(input, operations)).rejects.toThrow(
      "ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID",
    );
    expect(compileTraversalLock).not.toHaveBeenCalled();
  });

  it("rejects a hidden nested Execution Plan field before trusted work", async () => {
    const compileTraversalLock = vi.fn();
    const operations = operationsForFixture(complete, { compileTraversalLock });
    const executionPlan = structuredClone(complete.executionPlan);
    Object.defineProperty(executionPlan.traversal, "providerHandle", {
      value: 42,
      enumerable: false,
    });

    await expect(orchestrateRouteValidationV1({
      executionPlan,
      subject: subjectForPlan(executionPlan),
      reportId: "route-hidden-plan-field",
    }, operations)).rejects.toThrow(
      "ROUTE_VALIDATION_ORCHESTRATION_INPUT_INVALID",
    );
    expect(compileTraversalLock).not.toHaveBeenCalled();
  });

  it("does not create a Runtime for a canonical unreachable result", async () => {
    const createRuntimeLease = vi.fn();
    const result = await orchestrateRouteValidationV1({
      executionPlan: unreachable.executionPlan,
      subject: unreachable.subject,
      reportId: "route-unreachable",
    }, operationsForFixture(unreachable, { createRuntimeLease }));

    expect(result.report.status).toBe("failed");
    expect(result.report.routeValidationSetReceipt.rows[0]).toMatchObject({
      connectivityStatus: "unreachable",
      runtimeStatus: "not-run",
    });
    expect(createRuntimeLease).not.toHaveBeenCalled();
    expect(result.evidenceFiles.some(({ kind }) =>
      kind === "route-runtime-probe-receipt"
    )).toBe(false);
  }, 60_000);

  it("keeps an incomplete row 1:1 without a Runtime or overlay", async () => {
    const createRuntimeLease = vi.fn();
    const result = await orchestrateRouteValidationV1({
      executionPlan: complete.executionPlan,
      subject: complete.subject,
      reportId: "route-incomplete",
    }, operationsForFixture(complete, {
      evaluateRoute: async ({ buildInputReceipt }) =>
        incompleteResultForBuildInput(buildInputReceipt),
      createRuntimeLease,
    }));

    expect(result.report.status).toBe("incomplete");
    expect(result.report.routeValidationSetReceipt.rows).toMatchObject([{
      constraintId: "hero-to-goal",
      connectivityStatus: "incomplete",
      runtimeStatus: "not-run",
    }]);
    expect(createRuntimeLease).not.toHaveBeenCalled();
    expect(result.evidenceFiles.map(({ kind }) => kind)).toEqual([
      "route-validation-set-receipt",
      "route-connectivity-failure",
    ]);
    expect(result.publicationRows).toHaveLength(1);
    expect(result.publicationRows[0]).not.toHaveProperty("routeOverlay");
  }, 60_000);

  it("does not convert a Route provider exception into gameplay evidence", async () => {
    const createRuntimeLease = vi.fn();
    const createReport = vi.fn(createRouteValidationReportV2);
    await expect(orchestrateRouteValidationV1({
      executionPlan: complete.executionPlan,
      subject: complete.subject,
      reportId: "route-provider-error",
    }, operationsForFixture(complete, {
      evaluateRoute: async () => { throw new Error("recast-provider-error"); },
      createRuntimeLease,
      createReport,
    }))).rejects.toThrow("recast-provider-error");

    expect(createRuntimeLease).not.toHaveBeenCalled();
    expect(createReport).not.toHaveBeenCalled();
  });

  it("keeps a closed failed Probe receipt as gameplay evidence", async () => {
    const result = await orchestrateRouteValidationV1({
      executionPlan: complete.executionPlan,
      subject: complete.subject,
      reportId: "route-probe-failure",
    }, operationsForFixture(complete, {
      createRuntimeLease: async ({ executionPlan, traversalLockReceipt, routePathReceipt }) => ({
        runtimePort: fakeRuntimePort({
          executionPlan,
          lockReceipt: traversalLockReceipt,
          routePathReceipt,
          stalled: true,
        }),
        dispose: async () => undefined,
      }),
    }));

    expect(result.report.status).toBe("failed");
    expect(result.report.routeValidationSetReceipt.rows[0]?.runtimeStatus).toBe("failed");
    expect(result.evidenceFiles.some(({ kind }) =>
      kind === "route-runtime-probe-receipt"
    )).toBe(true);
  }, 60_000);

  it.each([
    ["world", "executionPlanHash"],
    ["implementation", "runtimeAdapterHash"],
  ] as const)("rejects a mismatched Runtime %s identity before probing", async (
    identityKind,
    field,
  ) => {
    const base = operationsForFixture(complete);
    const dispose = vi.fn(async () => undefined);
    const runRuntimeProbe = vi.fn(base.runRuntimeProbe);
    const createReport = vi.fn(base.createReport);
    const operations = operationsForFixture(complete, {
      createRuntimeLease: async (input) => {
        const lease = await base.createRuntimeLease(input);
        const runtimePort = identityKind === "world"
          ? {
              ...lease.runtimePort,
              [field]: `sha256:${"e".repeat(64)}`,
            }
          : {
              ...lease.runtimePort,
              runtimeImplementationIdentity: {
                ...lease.runtimePort.runtimeImplementationIdentity,
                [field]: `sha256:${"e".repeat(64)}`,
              },
            };
        return { runtimePort, dispose } as RouteValidationRuntimeLeaseV1;
      },
      runRuntimeProbe,
      createReport,
    });

    await expect(orchestrateRouteValidationV1({
      executionPlan: complete.executionPlan,
      subject: complete.subject,
      reportId: `route-runtime-${identityKind}-mismatch`,
    }, operations)).rejects.toThrow(
      identityKind === "world"
        ? "ROUTE_VALIDATION_RUNTIME_WORLD_IDENTITY_MISMATCH"
        : "ROUTE_VALIDATION_RUNTIME_IMPLEMENTATION_IDENTITY_MISMATCH",
    );
    expect(runRuntimeProbe).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
    expect(createReport).not.toHaveBeenCalled();
  }, 60_000);

  it.each([
    ["create", "create"],
    ["probe", "probe"],
    ["dispose", "dispose"],
  ] as const)("propagates a Runtime %s exception without creating a Report", async (phase, message) => {
    const createReport = vi.fn(createRouteValidationReportV2);
    const base = operationsForFixture(complete, { createReport });
    const operations: RouteValidationOrchestratorOperationsV1 = {
      ...base,
      ...(phase === "create"
        ? { createRuntimeLease: async () => { throw new Error(message); } }
        : {
            createRuntimeLease: async (input) => {
              const lease = await base.createRuntimeLease(input);
              return {
                ...lease,
                dispose: phase === "dispose"
                  ? async () => { throw new Error(message); }
                  : lease.dispose,
              } satisfies RouteValidationRuntimeLeaseV1;
            },
          }),
      ...(phase === "probe"
        ? { runRuntimeProbe: async () => { throw new Error(message); } }
        : {}),
    };

    await expect(orchestrateRouteValidationV1({
      executionPlan: complete.executionPlan,
      subject: complete.subject,
      reportId: `route-${phase}-error`,
    }, operations)).rejects.toThrow(message);
    expect(createReport).not.toHaveBeenCalled();
  }, 60_000);

  it("aggregates Probe and dispose exceptions while preserving both errors", async () => {
    const operations = operationsForFixture(complete, {
      runRuntimeProbe: async () => { throw new Error("probe-primary"); },
      createRuntimeLease: async (input) => {
        const base = await operationsForFixture(complete).createRuntimeLease(input);
        return {
          ...base,
          dispose: async () => { throw new Error("dispose-cleanup"); },
        };
      },
    });

    const rejection = await orchestrateRouteValidationV1({
      executionPlan: complete.executionPlan,
      subject: complete.subject,
      reportId: "route-aggregate-error",
    }, operations).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(rejection).toBeInstanceOf(AggregateError);
    expect((rejection as AggregateError).errors.map(String)).toEqual([
      "Error: probe-primary",
      "Error: dispose-cleanup",
    ]);
  }, 60_000);

  it("sorts two rows, keeps different locks isolated, and is deterministic", async () => {
    const lockCalls: string[] = [];
    const base = operationsForFixture(multiple);
    const operations = operationsForFixture(multiple, {
      compileTraversalLock: (input) => {
        lockCalls.push(input.traversingEntityId);
        return base.compileTraversalLock(input);
      },
    });
    const first = await orchestrateRouteValidationV1({
      executionPlan: multiple.executionPlan,
      subject: multiple.subject,
      reportId: "route-multiple",
    }, operations);
    const second = await orchestrateRouteValidationV1({
      executionPlan: multiple.executionPlan,
      subject: multiple.subject,
      reportId: "route-multiple",
    }, operationsForFixture(multiple));

    expect(first.report.routeValidationSetReceipt.rows.map(({ constraintId }) =>
      constraintId
    )).toEqual(["a-primary-route", "z-secondary-route"]);
    expect(lockCalls).toEqual(["player", "player-secondary"]);
    expect(new Set(first.report.routeValidationSetReceipt.rows.map(
      ({ resolvedTraversalLockHash }) => resolvedTraversalLockHash,
    )).size).toBe(2);
    expect(canonicalJsonBytes(first.report)).toEqual(canonicalJsonBytes(second.report));
    expect(first.evidenceFiles.map(({ relativePath }) => relativePath)).toEqual(
      second.evidenceFiles.map(({ relativePath }) => relativePath),
    );
  }, 60_000);

  it("passes the exact canonical byte objects to Report validation and output inventory", async () => {
    const createReport = vi.fn(createRouteValidationReportV2);
    const result = await orchestrateRouteValidationV1({
      executionPlan: complete.executionPlan,
      subject: complete.subject,
      reportId: "route-byte-identity",
    }, operationsForFixture(complete, { createReport }));
    const row = createReport.mock.calls[0]?.[0].rows[0];
    expect(row).toBeDefined();
    expect(result.publicationRows).toHaveLength(1);
    expect(result.publicationRows[0]?.validationRow).toBe(row);
    expect(result.publicationRows[0]?.routeOverlay).toBeDefined();
    for (const kind of [
      "traversalGraph",
      "routePathReceipt",
      "routeRuntimeProbeReceipt",
      "routeOverlay",
    ] as const) {
      const bytes = row!.evidenceBytes[kind];
      expect(bytes).toBeDefined();
      expect(result.evidenceFiles.some((file) => file.bytes === bytes)).toBe(true);
      expect(result.publicationRows[0]?.validationRow.evidenceBytes[kind]).toBe(bytes);
    }
    const overlayFile = result.evidenceFiles.find(({ kind }) => kind === "route-overlay");
    expect(JSON.parse(new TextDecoder().decode(overlayFile?.bytes))).toMatchObject({
      kind: "route-overlay",
      constraintId: "hero-to-goal",
      routeId: "main-route",
      traversingEntityId: "player",
      hardRibbon: { routeId: "main-route" },
    });
  }, 60_000);

  it("keeps publication rows 1:1 in canonical order and omits overlays for failed rows", async () => {
    const completeResult = await orchestrateRouteValidationV1({
      executionPlan: multiple.executionPlan,
      subject: multiple.subject,
      reportId: "route-publication-order",
    }, operationsForFixture(multiple));
    const unreachableResult = await orchestrateRouteValidationV1({
      executionPlan: unreachable.executionPlan,
      subject: unreachable.subject,
      reportId: "route-publication-unreachable",
    }, operationsForFixture(unreachable));

    expect(completeResult.publicationRows.map(({ validationRow }) =>
      validationRow.routeBuildInputReceipt.input.connectivityRequirement.constraintId
    )).toEqual(["a-primary-route", "z-secondary-route"]);
    expect(completeResult.publicationRows.every(({ routeOverlay }) =>
      !isNil(routeOverlay)
    )).toBe(true);
    expect(unreachableResult.publicationRows).toHaveLength(1);
    expect(unreachableResult.publicationRows[0]).not.toHaveProperty("routeOverlay");
    expect(JSON.stringify({
      complete: completeResult.publicationRows,
      unreachable: unreachableResult.publicationRows,
    })).not.toMatch(/providerHandle|nativeHandle|havokBodyHandle|runtimeAssetResolver/);
  }, 60_000);

  it.each([
    ["wrong-root", (report: ReturnType<typeof createRouteValidationReportV2>) => ({
      ...report,
      subject: {
        ...report.subject,
        worldPackageRootHash: `sha256:${"e".repeat(64)}` as Hash,
      },
    })],
    ["stale-id", (report: ReturnType<typeof createRouteValidationReportV2>) => ({
      ...report,
      id: "stale-report-id",
    })],
    ["unknown-provider-field", (report: ReturnType<typeof createRouteValidationReportV2>) => ({
      ...report,
      providerHandle: 42,
    })],
    ["hidden-nested-provider-field", (report: ReturnType<typeof createRouteValidationReportV2>) => {
      const forged = structuredClone(report);
      Object.defineProperty(forged.gateResultsById, "providerHandle", {
        value: 42,
        enumerable: false,
      });
      return forged;
    }],
  ] as const)("rejects a trusted Report result with %s", async (_caseName, forge) => {
    const createReport = vi.fn((input: Parameters<typeof createRouteValidationReportV2>[0]) =>
      forge(createRouteValidationReportV2(input)) as ReturnType<
        typeof createRouteValidationReportV2
      >
    );

    await expect(orchestrateRouteValidationV1({
      executionPlan: complete.executionPlan,
      subject: complete.subject,
      reportId: "route-report-binding",
    }, operationsForFixture(complete, { createReport }))).rejects.toThrow(
      /ROUTE_VALIDATION_REPORT_(INVALID|BINDING_MISMATCH)/,
    );
  }, 60_000);

  it("forwards snapshotted Runtime assets without returning them", async () => {
    const resolver = { resolveSubjectAsset: vi.fn() };
    const havokWasmBytes = new Uint8Array([0, 97, 115, 109]);
    const createRuntimeLease = vi.fn(
      operationsForFixture(complete).createRuntimeLease,
    );
    const promise = orchestrateRouteValidationV1({
      executionPlan: complete.executionPlan,
      subject: complete.subject,
      reportId: "route-runtime-assets",
      runtimeAssetResolver: resolver,
      havokWasmBytes,
    }, operationsForFixture(complete, { createRuntimeLease }));
    havokWasmBytes[0] = 255;
    const result = await promise;

    expect(createRuntimeLease).toHaveBeenCalledWith(expect.objectContaining({
      runtimeAssetResolver: resolver,
      havokWasmBytes: new Uint8Array([0, 97, 115, 109]),
    }));
    expect(result).not.toHaveProperty("runtimeAssetResolver");
    expect(result).not.toHaveProperty("havokWasmBytes");
  }, 60_000);
});
