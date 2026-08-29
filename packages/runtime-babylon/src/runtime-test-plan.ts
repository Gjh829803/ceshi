import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileCanonicalWorldV1, type CompileCanonicalWorldInputV1 } from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import type { GameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import type {
  CanonicalSceneExecutionPlanV1,
  WorldRuntimeBootstrapBodyV1,
  WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import { createWorldRuntimeBootstrapV1 } from "@whitebox-world/runtime-contracts";
import {
  resolveBabylonRuntimeSubjectsV1,
  type BabylonRuntimeSubjectV1,
} from "./runtime-subject";

export interface RuntimeTestWorldArtifactsV1 {
  readonly executionPlan: CanonicalSceneExecutionPlanV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
}

const artifactsByWorldId = new Map<string, RuntimeTestWorldArtifactsV1>();
const artifactsByExecutionPlan = new WeakMap<
  CanonicalSceneExecutionPlanV1,
  RuntimeTestWorldArtifactsV1
>();

export function registerRuntimeTestWorldArtifactsV1(
  artifacts: RuntimeTestWorldArtifactsV1,
): void {
  const frozen = Object.freeze({ ...artifacts });
  artifactsByExecutionPlan.set(artifacts.executionPlan, frozen);
  artifactsByWorldId.set(artifacts.executionPlan.id, frozen);
}

export function runtimeTestWorldArtifactsForPlanV1(
  executionPlan: CanonicalSceneExecutionPlanV1,
): RuntimeTestWorldArtifactsV1 {
  const artifacts = artifactsByExecutionPlan.get(executionPlan) ??
    artifactsByWorldId.get(executionPlan.id);
  if (artifacts === undefined) {
    throw new Error(`Runtime test artifacts are not registered for '${executionPlan.id}'.`);
  }
  return Object.freeze({ ...artifacts, executionPlan });
}

export function runtimeTestWorldInputForPlanV1(
  executionPlan: CanonicalSceneExecutionPlanV1,
) {
  const artifacts = runtimeTestWorldArtifactsForPlanV1(executionPlan);
  return Object.freeze({
    sceneSource: Object.freeze({
      kind: "canonical-execution-plan" as const,
      executionPlan,
    }),
    worldRuntimeBootstrap: artifacts.worldRuntimeBootstrap,
    gameplayBootstrap: artifacts.gameplayBootstrap,
  });
}

export function runtimeTestSubjectsForPlanV1(
  executionPlan: CanonicalSceneExecutionPlanV1,
): readonly BabylonRuntimeSubjectV1[] {
  const artifacts = runtimeTestWorldArtifactsForPlanV1(executionPlan);
  return resolveBabylonRuntimeSubjectsV1(
    executionPlan,
    artifacts.worldRuntimeBootstrap,
  );
}

export function createRuntimeTestWorldVariantV1(
  executionPlan: CanonicalSceneExecutionPlanV1,
  input: Readonly<{
    scenePlanPatch?: Partial<CanonicalSceneExecutionPlanV1>;
    worldRuntimeBootstrapPatch?: Partial<WorldRuntimeBootstrapBodyV1>;
    runtimeSubjects?: readonly BabylonRuntimeSubjectV1[];
    gameplayBootstrap?: GameplayBootstrapV1;
  }>,
): CanonicalSceneExecutionPlanV1 {
  const artifacts = runtimeTestWorldArtifactsForPlanV1(executionPlan);
  const { contentHash: _contentHash, ...worldRuntimeBootstrapBody } =
    artifacts.worldRuntimeBootstrap;
  const runtimeSubjects = input.runtimeSubjects;
  const worldRuntimeBootstrap = createWorldRuntimeBootstrapV1({
    ...worldRuntimeBootstrapBody,
    ...input.worldRuntimeBootstrapPatch,
    ...(runtimeSubjects === undefined
      ? {}
      : {
          subjectRuntimeDescriptors: runtimeSubjects.map((subject) => {
            const {
              spawnAnchorEntityId: _spawnAnchorEntityId,
              spawnSubjectOriginPositionMetersXYZ:
                _spawnSubjectOriginPositionMetersXYZ,
              spawnSubjectFacingRadians: _spawnSubjectFacingRadians,
              ...descriptor
            } = subject;
            return descriptor;
          }),
        }),
  });
  const nextPlan: CanonicalSceneExecutionPlanV1 = {
    ...executionPlan,
    ...input.scenePlanPatch,
    worldRuntimeBootstrapHash: worldRuntimeBootstrap.contentHash,
    ...(runtimeSubjects === undefined
      ? {}
      : {
          subjectInstances: runtimeSubjects.map((subject) => ({
            entityId: subject.entityId,
            spawnAnchorEntityId: subject.spawnAnchorEntityId,
            subjectOriginPositionMetersXYZ:
              subject.spawnSubjectOriginPositionMetersXYZ,
            subjectFacingRadians: subject.spawnSubjectFacingRadians,
          })),
        }),
  };
  registerRuntimeTestWorldArtifactsV1({
    ...artifacts,
    executionPlan: nextPlan,
    worldRuntimeBootstrap,
    gameplayBootstrap: input.gameplayBootstrap ?? artifacts.gameplayBootstrap,
  });
  return nextPlan;
}

export function compileRuntimeTestScenePlanV1(
  spec: AuthoringSpecV4,
  normalizeOptions: Parameters<typeof normalizeAuthoringSpecV4>[1] = {},
): CanonicalSceneExecutionPlanV1 {
  const normalized = normalizeAuthoringSpecV4(spec, normalizeOptions);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error(
      `Fixture normalize failed: ${JSON.stringify(normalized.diagnostics)}`,
    );
  }
  const gameplayBootstrap = createRuntimeTestGameplayBootstrapV1(normalized.value);
  const input: CompileCanonicalWorldInputV1 = {
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrap,
    worldRuntimeBootstrapRef:
      `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
  };
  const compiled = compileCanonicalWorldV1(input);
  if (!compiled.ok || compiled.canonicalSceneExecutionPlan === undefined) {
    throw new Error(
      `Fixture compile failed: ${JSON.stringify(compiled.diagnostics)}`,
    );
  }
  registerRuntimeTestWorldArtifactsV1(Object.freeze({
    executionPlan: compiled.canonicalSceneExecutionPlan,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
    gameplayBootstrap,
  }));
  return compiled.canonicalSceneExecutionPlan;
}

export function createRuntimeTestGameplayBootstrapV1(
  normalizedWorldIr: NormalizedWorldIRV4,
): GameplayBootstrapV1 {
  const entityDescriptors = normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => {
      const definition = normalizedWorldIr.resources.subjectDefinitions.find(
        (candidate) =>
          candidate.subjectDefinitionRef === node.subjectDefinitionRef,
      );
      if (definition === undefined) {
        throw new Error(
          `Fixture Subject Definition missing: ${node.subjectDefinitionRef}`,
        );
      }
      return {
        id: node.id,
        entityDefinitionRef: node.subjectDefinitionRef,
        capabilityRefs: definition.capabilityRefs,
      };
    });
  const gameplayBootstrap = createCoreGameplayBootstrapV1({
    worldId: normalizedWorldIr.id,
    worldSeed: normalizedWorldIr.seed,
    entityDescriptors,
    initialRelationshipStates: normalizedWorldIr.relationships.map(
      (relationship) => ({ ...relationship, establishedSimulationTick: 0 }),
    ),
  });
  return gameplayBootstrap;
}
