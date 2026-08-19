import type {
  NormalizedSubjectDefinitionV2,
  ResolvedResourceLockEntryV1,
} from "@whitebox-world/authoring";
import type {
  ExecutionSubjectV3,
} from "@whitebox-world/runtime-contracts";

import {
  cliFailure,
  loadWorldkitPipeline,
  type WorldkitFailure,
} from "./worldkit-pipeline";

export interface SubjectExplanationV1 {
  entityId: string;
  subjectDefinitionRef: string;
  subjectDefinitionHash: string;
  source: "package" | "registry";
  bodyTopology: string;
  semanticClassId: string;
  capabilityRefs: readonly string[];
  profiles: NormalizedSubjectDefinitionV2["profiles"];
  visualParts: NormalizedSubjectDefinitionV2["visualParts"];
  sockets: NormalizedSubjectDefinitionV2["sockets"];
  collider: ExecutionSubjectV3["collider"] & {
    derivationProfileRef: string;
  };
  locomotion: ExecutionSubjectV3["locomotion"];
  resourceCost: NormalizedSubjectDefinitionV2["resourceCost"];
  resourceLockHash: string;
  resourceLockEntries: readonly ResolvedResourceLockEntryV1[];
}

export interface SubjectExplanationSuccessV1 {
  ok: true;
  exitCode: 0;
  kind: "worldkit-subject-explanation";
  schemaVersion: 1;
  diagnostics: readonly [];
  normalizedWorldIrHash: string;
  executionPlanHash: string;
  subject: SubjectExplanationV1;
}

export type SubjectExplanationResultV1 =
  | SubjectExplanationSuccessV1
  | WorldkitFailure;

function lockEntriesForDefinition(
  definition: NormalizedSubjectDefinitionV2,
  resourceLock: readonly ResolvedResourceLockEntryV1[],
): readonly ResolvedResourceLockEntryV1[] {
  const relevantRefs = new Set([
    definition.subjectDefinitionRef,
    ...definition.capabilityRefs,
    definition.profiles.physicsBodyProfileRef,
    definition.profiles.locomotionProfileRef,
    definition.colliderPolicy.colliderDerivationProfileRef,
  ]);
  return resourceLock.filter((entry) => relevantRefs.has(entry.resourceRef));
}

export async function explainSubjectFile(
  inputPath: string,
  entityId: string,
): Promise<SubjectExplanationResultV1> {
  const pipeline = await loadWorldkitPipeline(inputPath);
  if (!pipeline.ok) return pipeline;

  const executionSubject = pipeline.executionPlan.subjects.find(
    (subject) => subject.entityId === entityId,
  );
  if (executionSubject === undefined) {
    return cliFailure(
      "SUBJECT_ENTITY_NOT_FOUND",
      `Subject Entity '${entityId}' does not exist in the compiled world.`,
      {
        entityId,
        availableEntityIds: pipeline.executionPlan.subjects.map(
          (subject) => subject.entityId,
        ),
      },
    );
  }

  const definition = pipeline.normalizedWorldIr.resources.subjectDefinitions.find(
    (candidate) =>
      candidate.subjectDefinitionRef === executionSubject.subjectDefinitionRef,
  );
  if (definition === undefined) {
    return cliFailure(
      "SUBJECT_DEFINITION_NOT_FOUND",
      `Resolved Subject Definition '${executionSubject.subjectDefinitionRef}' is missing from NormalizedWorldIRV2.`,
      {
        entityId,
        subjectDefinitionRef: executionSubject.subjectDefinitionRef,
      },
    );
  }

  return {
    ok: true,
    exitCode: 0,
    kind: "worldkit-subject-explanation",
    schemaVersion: 1,
    diagnostics: [],
    normalizedWorldIrHash: pipeline.normalizedWorldIrHash,
    executionPlanHash: pipeline.executionPlanHash,
    subject: {
      entityId,
      subjectDefinitionRef: definition.subjectDefinitionRef,
      subjectDefinitionHash: definition.subjectDefinitionHash,
      source: definition.source,
      bodyTopology: definition.bodyTopology,
      semanticClassId: definition.semanticClassId,
      capabilityRefs: definition.capabilityRefs,
      profiles: definition.profiles,
      visualParts: definition.visualParts,
      sockets: definition.sockets,
      collider: {
        derivationProfileRef:
          definition.colliderPolicy.colliderDerivationProfileRef,
        ...executionSubject.collider,
      },
      locomotion: executionSubject.locomotion,
      resourceCost: definition.resourceCost,
      resourceLockHash: pipeline.normalizedWorldIr.resources.resourceLockHash,
      resourceLockEntries: lockEntriesForDefinition(
        definition,
        pipeline.normalizedWorldIr.resources.resourceLock,
      ),
    },
  };
}
