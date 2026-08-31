import {
  deriveGameplaySemanticFactIdV1,
  type GameplaySemanticFactV1,
  type SemanticFactProjectorProfileResourceV1,
  type SupportedByFactV1,
} from "@whitebox-world/gameplay-contracts";
import type { CanonicalSceneExecutionPlanV1 } from "@whitebox-world/runtime-contracts";
import { orderBy } from "lodash-es";

import type {
  MotionKernelLiveLockStateV1,
  RetainedCharacterSupportSampleV1,
} from "./motion-kernel-runtime";
import {
  resolveRetainedSupportSurfaceV1,
  retainedContactsAdmittedByPolicyV1,
} from "./retained-support-surface-resolver";

export interface SemanticFactProjectorSubjectInputV1 {
  readonly entityId: string;
  readonly sample: RetainedCharacterSupportSampleV1 | undefined;
  readonly live: MotionKernelLiveLockStateV1;
}

function canonicalNumber(value: number): number {
  return value === 0 ? 0 : value;
}

function previousSupportedByFact(
  facts: Readonly<Record<string, GameplaySemanticFactV1>>,
  input: Readonly<{
    supportedEntityId: string;
    supportSurfaceEntityId: string;
    supportColliderSubshapeId: string;
    supportTraversalSurfaceId: string;
    profile: SemanticFactProjectorProfileResourceV1;
  }>,
): SupportedByFactV1 | undefined {
  return Object.values(facts).find((fact): fact is SupportedByFactV1 =>
    fact.type === "supportedBy" &&
    fact.supportedEntityId === input.supportedEntityId &&
    fact.supportSurfaceEntityId === input.supportSurfaceEntityId &&
    fact.supportColliderSubshapeId === input.supportColliderSubshapeId &&
    fact.supportTraversalSurfaceId === input.supportTraversalSurfaceId &&
    fact.semanticFactProjectorProfileRef === input.profile.resourceRef &&
    fact.semanticFactProjectorProfileHash === input.profile.contentHash
  );
}

export function projectSemanticFactsV1(input: Readonly<{
  previousSemanticFactsById: Readonly<Record<string, GameplaySemanticFactV1>>;
  simulationTick: number;
  profileResource: SemanticFactProjectorProfileResourceV1;
  executionPlan: CanonicalSceneExecutionPlanV1 | undefined;
  subjects: readonly SemanticFactProjectorSubjectInputV1[];
}>): Readonly<Record<string, GameplaySemanticFactV1>> {
  const retainedNonSupportedByFacts = Object.values(
    input.previousSemanticFactsById,
  ).filter((fact) => fact.type !== "supportedBy");
  const projectedFacts: GameplaySemanticFactV1[] = [
    ...retainedNonSupportedByFacts,
  ];
  if (input.executionPlan !== undefined) {
    for (const subject of orderBy(input.subjects, ["entityId"], ["asc"])) {
      const sample = subject.sample;
      if (
        sample === undefined ||
        !input.profileResource.supportedByProjection.acceptedSupportStates
          .includes(sample.supportState as "sliding" | "supported")
      ) continue;
      const policy = {
        mode: "semantic-support" as const,
        minimumContactToAggregateSupportNormalCosine:
          input.profileResource.supportedByProjection
            .minimumContactToAggregateSupportNormalCosine,
      };
      const surface = resolveRetainedSupportSurfaceV1({
        plan: input.executionPlan,
        sample,
        live: subject.live,
        policy,
      });
      if (surface.mode !== "resolved") continue;
      const contact = orderBy(
        retainedContactsAdmittedByPolicyV1({
          sample,
          live: subject.live,
          policy,
        }),
        [
          (candidate) => candidate.pointMetersXYZ[0],
          (candidate) => candidate.pointMetersXYZ[1],
          (candidate) => candidate.pointMetersXYZ[2],
          (candidate) => candidate.normalXYZ[0],
          (candidate) => candidate.normalXYZ[1],
          (candidate) => candidate.normalXYZ[2],
        ],
        ["asc", "asc", "asc", "asc", "asc", "asc"],
      )[0];
      if (contact === undefined) continue;
      const previous = previousSupportedByFact(
        input.previousSemanticFactsById,
        {
          supportedEntityId: subject.entityId,
          supportSurfaceEntityId: surface.surfaceEntityId,
          supportColliderSubshapeId: surface.colliderSubshapeId,
          supportTraversalSurfaceId: surface.traversalSurfaceId,
          profile: input.profileResource,
        },
      );
      const body = Object.freeze({
        type: "supportedBy" as const,
        schemaVersion: 1 as const,
        supportedEntityId: subject.entityId,
        supportSurfaceEntityId: surface.surfaceEntityId,
        supportColliderSubshapeId: surface.colliderSubshapeId,
        supportTraversalSurfaceId: surface.traversalSurfaceId,
        supportPointMetersXYZ: Object.freeze(contact.pointMetersXYZ.map(
          canonicalNumber,
        )) as readonly [number, number, number],
        supportNormalXYZ: Object.freeze(sample.supportNormalWorldXYZ.map(
          canonicalNumber,
        )) as readonly [number, number, number],
        startedSimulationTick:
          previous?.startedSimulationTick ?? input.simulationTick,
        semanticFactProjectorProfileRef: input.profileResource.resourceRef,
        semanticFactProjectorProfileHash: input.profileResource.contentHash,
      });
      projectedFacts.push(Object.freeze({
        ...body,
        id: deriveGameplaySemanticFactIdV1(body),
      }));
    }
  }
  return Object.freeze(Object.fromEntries(
    orderBy(projectedFacts, ["id"], ["asc"]).map((fact) => [fact.id, fact]),
  ));
}
