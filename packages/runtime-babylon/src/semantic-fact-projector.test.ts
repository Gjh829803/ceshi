import {
  RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
} from "@whitebox-world/gameplay-contracts";
import { describe, expect, it } from "vitest";

import { createValidAuthoringSpecV4 } from "../../authoring/src/test-fixture";
import type {
  MotionKernelLiveLockStateV1,
  RetainedCharacterSupportSampleV1,
} from "./motion-kernel-runtime";
import { compileRuntimeTestScenePlanV1 } from "./runtime-test-plan";
import { projectSemanticFactsV1 } from "./semantic-fact-projector";

const LIVE_LOCK = Object.freeze({
  capsuleRadiusMeters: 0.35,
  capsuleHeightMeters: 1.8,
  footOffsetMeters: 0.9,
  keepDistanceMeters: 0.05,
  keepContactToleranceMeters: 0.1,
  maxSlopeCosine: Math.cos(42 * Math.PI / 180),
  maxStepHeightMeters: 0.4,
  colliderCenterOffsetMetersXYZ: [0, 0.9, 0],
  activeControlFeelProfileRef: "feel",
  activeControlFeelProfileHash: `sha256:${"a".repeat(64)}`,
  requestedControlFeelProfileRef: "feel",
  activeMotionProfileRef: "motion",
  activeMotionProfileHash: `sha256:${"b".repeat(64)}`,
  requestedMotionProfileRef: "motion",
  activeMotionKernelRef: "kernel",
  physicsBodyProfileRef: "physics",
  locomotionProfileRef: "locomotion",
  controlProfileRef: "control",
  controlProfileHash: `sha256:${"c".repeat(64)}`,
  mediumProfileRef: "medium",
}) satisfies MotionKernelLiveLockStateV1;

function flatPlan() {
  const source = createValidAuthoringSpecV4();
  return compileRuntimeTestScenePlanV1({
    ...source,
    spatial: {
      ...source.spatial,
      traversalAreas: [],
      routes: [],
    },
    nodes: source.nodes.map((node) =>
      node.kind === "terrain" &&
        node.components.terrain.source.kind === "procedural"
        ? {
            ...node,
            components: {
              terrain: {
                ...node.components.terrain,
                source: {
                  ...node.components.terrain.source,
                  relief: "flat" as const,
                  baseHeightMeters: 0,
                  amplitudeMeters: 0,
                },
              },
            },
          }
        : node
    ),
  });
}

const DEFAULT_FLAT_SURFACE = flatPlan().traversal.surfaces.find(
  (surface) => surface.kind === "heightfield",
)!;

function supportSample(
  supportState: "supported" | "sliding" | "unsupported",
  pointMetersXYZ: readonly [number, number, number] = [0, 0, 0],
  options: Readonly<{
    normalXYZ?: readonly [number, number, number];
    aggregateSupportNormalXYZ?: readonly [number, number, number];
    exactSurfaceIdentity?: Readonly<{
      colliderSubshapeId: string;
      traversalSurfaceId: string;
      surfaceEntityId: string;
    }> | null;
    additionalContacts?: readonly Readonly<{
      pointMetersXYZ: readonly [number, number, number];
      normalXYZ: readonly [number, number, number];
      colliderSubshapeId?: string;
      traversalSurfaceId?: string;
      surfaceEntityId?: string;
    }>[];
  }> = {},
): RetainedCharacterSupportSampleV1 {
  const normalXYZ = options.normalXYZ ?? [0, 1, 0];
  return Object.freeze({
    supportState,
    supportNormalWorldXYZ: options.aggregateSupportNormalXYZ ?? normalXYZ,
    sampledControllerCenterMetersXYZ: [0, 0.9, 0],
    sampledFootPositionMetersXYZ: [0, 0, 0],
    supportContacts: supportState === "unsupported"
      ? []
      : [Object.freeze({
          pointMetersXYZ,
          normalXYZ,
          ...(options.exactSurfaceIdentity === null
            ? {}
            : options.exactSurfaceIdentity ?? {
                colliderSubshapeId: DEFAULT_FLAT_SURFACE.colliderSubshapeId,
                traversalSurfaceId: DEFAULT_FLAT_SURFACE.traversalSurfaceId,
                surfaceEntityId: DEFAULT_FLAT_SURFACE.surfaceEntityId,
              }),
        }), ...(options.additionalContacts ?? [])],
    isSupportSurfaceDynamic: false,
  });
}

describe("Semantic Fact Projector", () => {
  it.each(["supported", "sliding"] as const)(
    "projects %s retained support without a second grounding query",
    (supportState) => {
      const facts = projectSemanticFactsV1({
        previousSemanticFactsById: {},
        simulationTick: 3,
        profileResource:
          RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
        executionPlan: flatPlan(),
        subjects: [{
          entityId: "board",
          sample: supportSample(supportState),
          live: LIVE_LOCK,
        }],
      });
      const fact = Object.values(facts)[0];
      expect(fact?.type).toBe("supportedBy");
      expect(fact?.startedSimulationTick).toBe(3);
      expect(fact?.semanticFactProjectorProfileHash).toBe(
        RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1
          .contentHash,
      );
    },
  );

  it("uses the exact retained Babylon surface identity without reading terrain geometry", () => {
    const plan = flatPlan();
    const surface = plan.traversal.surfaces.find(
      (candidate) => candidate.kind === "heightfield",
    )!;
    const terrain = {
      ...plan.terrain,
      get heightSamplesMeters(): readonly number[] {
        throw new Error("terrain geometry must not be read for an exact support contact");
      },
    };

    const facts = projectSemanticFactsV1({
      previousSemanticFactsById: {},
      simulationTick: 4,
      profileResource:
        RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
      executionPlan: { ...plan, terrain },
      subjects: [{
        entityId: "board",
        sample: supportSample("supported", [0, 0, 0], {
          exactSurfaceIdentity: {
            colliderSubshapeId: surface.colliderSubshapeId,
            traversalSurfaceId: surface.traversalSurfaceId,
            surfaceEntityId: surface.surfaceEntityId,
          },
        }),
        live: LIVE_LOCK,
      }],
    });

    expect(Object.values(facts)[0]).toMatchObject({
      type: "supportedBy",
      supportColliderSubshapeId: surface.colliderSubshapeId,
      supportTraversalSurfaceId: surface.traversalSurfaceId,
      supportSurfaceEntityId: surface.surfaceEntityId,
    });
  });

  it("projects steep sliding support while excluding a simultaneous side-wall contact", () => {
    const plan = flatPlan();
    const surface = plan.traversal.surfaces.find(
      (candidate) => candidate.kind === "heightfield",
    )!;
    const facts = projectSemanticFactsV1({
      previousSemanticFactsById: {},
      simulationTick: 5,
      profileResource:
        RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
      executionPlan: plan,
      subjects: [{
        entityId: "board",
        sample: supportSample("sliding", [0, 0, 0], {
          normalXYZ: [0.8, 0.6, 0],
          exactSurfaceIdentity: {
            colliderSubshapeId: surface.colliderSubshapeId,
            traversalSurfaceId: surface.traversalSurfaceId,
            surfaceEntityId: surface.surfaceEntityId,
          },
          additionalContacts: [{
            pointMetersXYZ: [0, 0, 0],
            normalXYZ: [1, 0, 0],
          }],
        }),
        live: LIVE_LOCK,
      }],
    });

    expect(Object.values(facts)).toHaveLength(1);
    expect(Object.values(facts)[0]).toMatchObject({
      type: "supportedBy",
      supportTraversalSurfaceId: surface.traversalSurfaceId,
      supportNormalXYZ: [0.8, 0.6, 0],
    });
  });

  it("trusts the Body-retained supporting contact without assuming world Y is up", () => {
    const plan = flatPlan();
    const surface = plan.traversal.surfaces.find(
      (candidate) => candidate.kind === "heightfield",
    )!;
    const facts = projectSemanticFactsV1({
      previousSemanticFactsById: {},
      simulationTick: 5,
      profileResource:
        RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
      executionPlan: plan,
      subjects: [{
        entityId: "board",
        sample: supportSample("sliding", [0, 0, 0], {
          normalXYZ: [1, 0, 0],
          exactSurfaceIdentity: {
            colliderSubshapeId: surface.colliderSubshapeId,
            traversalSurfaceId: surface.traversalSurfaceId,
            surfaceEntityId: surface.surfaceEntityId,
          },
        }),
        live: LIVE_LOCK,
      }],
    });

    expect(Object.values(facts)[0]).toMatchObject({
      type: "supportedBy",
      supportTraversalSurfaceId: surface.traversalSurfaceId,
      supportNormalXYZ: [1, 0, 0],
    });
  });

  it.each([
    ["exact", 0.95, true],
    ["just below", 0.95 - 1e-6, false],
    ["just above", 0.95 + 1e-6, true],
  ] as const)(
    "applies the normalized contact-to-aggregate cosine %s the 0.95 boundary",
    (_position, cosine, expectedFact) => {
      const plan = flatPlan();
      const surface = plan.traversal.surfaces.find(
        (candidate) => candidate.kind === "heightfield",
      )!;
      const normalizedContact = [
        Math.sqrt(1 - cosine ** 2),
        0,
        cosine,
      ] as const;
      expect(Math.hypot(...normalizedContact)).toBeCloseTo(1, 12);

      const facts = projectSemanticFactsV1({
        previousSemanticFactsById: {},
        simulationTick: 5,
        profileResource:
          RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
        executionPlan: plan,
        subjects: [{
          entityId: "board",
          sample: supportSample("sliding", [0, 0, 0], {
            normalXYZ: normalizedContact,
            aggregateSupportNormalXYZ: [0, 0, 1],
            exactSurfaceIdentity: {
              colliderSubshapeId: surface.colliderSubshapeId,
              traversalSurfaceId: surface.traversalSurfaceId,
              surfaceEntityId: surface.surfaceEntityId,
            },
          }),
          live: LIVE_LOCK,
        }],
      });

      expect(Object.values(facts).some((fact) => fact.type === "supportedBy"))
        .toBe(expectedFact);
    },
  );

  it("publishes the contact point from the profile-admitted support contact", () => {
    const plan = flatPlan();
    const surface = plan.traversal.surfaces.find(
      (candidate) => candidate.kind === "heightfield",
    )!;
    const exactSurfaceIdentity = {
      colliderSubshapeId: surface.colliderSubshapeId,
      traversalSurfaceId: surface.traversalSurfaceId,
      surfaceEntityId: surface.surfaceEntityId,
    };
    const facts = projectSemanticFactsV1({
      previousSemanticFactsById: {},
      simulationTick: 6,
      profileResource:
        RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
      executionPlan: plan,
      subjects: [{
        entityId: "board",
        sample: supportSample("sliding", [1, 0, 0], {
          normalXYZ: [0.8, 0.6, 0],
          exactSurfaceIdentity,
          additionalContacts: [{
            pointMetersXYZ: [-1, 0, 0],
            normalXYZ: [0, 0.1, 0.995],
            ...exactSurfaceIdentity,
          }],
        }),
        live: LIVE_LOCK,
      }],
    });

    expect(Object.values(facts)[0]).toMatchObject({
      type: "supportedBy",
      supportPointMetersXYZ: [1, 0, 0],
    });
  });

  it("keeps identity across contact updates and starts a new fact after departure", () => {
    const plan = flatPlan();
    const first = projectSemanticFactsV1({
      previousSemanticFactsById: {},
      simulationTick: 0,
      profileResource:
        RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
      executionPlan: plan,
      subjects: [{
        entityId: "board",
        sample: supportSample("supported"),
        live: LIVE_LOCK,
      }],
    });
    const updated = projectSemanticFactsV1({
      previousSemanticFactsById: first,
      simulationTick: 1,
      profileResource:
        RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
      executionPlan: plan,
      subjects: [{
        entityId: "board",
        sample: supportSample("supported", [0.01, 0, 0]),
        live: LIVE_LOCK,
      }],
    });
    const unsupported = projectSemanticFactsV1({
      previousSemanticFactsById: updated,
      simulationTick: 2,
      profileResource:
        RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
      executionPlan: plan,
      subjects: [{
        entityId: "board",
        sample: supportSample("unsupported"),
        live: LIVE_LOCK,
      }],
    });
    const landed = projectSemanticFactsV1({
      previousSemanticFactsById: unsupported,
      simulationTick: 3,
      profileResource:
        RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
      executionPlan: plan,
      subjects: [{
        entityId: "board",
        sample: supportSample("supported"),
        live: LIVE_LOCK,
      }],
    });

    expect(Object.keys(updated)).toEqual(Object.keys(first));
    expect(Object.values(updated)[0]?.startedSimulationTick).toBe(0);
    expect(unsupported).toEqual({});
    expect(Object.keys(landed)).not.toEqual(Object.keys(first));
    expect(Object.values(landed)[0]?.startedSimulationTick).toBe(3);
  });

  it("omits dynamic, unmatched, and suspended subjects", () => {
    const plan = flatPlan();
    const dynamic = {
      ...supportSample("supported"),
      isSupportSurfaceDynamic: true,
    };
    const partialSource = supportSample("supported", [0, 0, 0], {
      exactSurfaceIdentity: null,
    });
    const partial = {
      ...partialSource,
      supportContacts: partialSource.supportContacts.map((contact) => ({
        ...contact,
        surfaceEntityId: plan.terrain.entityId,
      })),
    };
    expect(projectSemanticFactsV1({
      previousSemanticFactsById: {},
      simulationTick: 0,
      profileResource:
        RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
      executionPlan: plan,
      subjects: [
        { entityId: "dynamic", sample: dynamic, live: LIVE_LOCK },
        { entityId: "suspended", sample: undefined, live: LIVE_LOCK },
        { entityId: "partial-identity", sample: partial, live: LIVE_LOCK },
        {
          entityId: "unmatched",
          sample: supportSample("supported", [1000, 0, 1000], {
            exactSurfaceIdentity: null,
          }),
          live: LIVE_LOCK,
        },
      ],
    })).toEqual({});
  });
});
