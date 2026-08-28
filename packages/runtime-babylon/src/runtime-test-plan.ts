import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileWorldV5, type CompileWorldInputV5 } from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import {
  createGameplayBootstrapResourceLockEntryV1,
} from "@whitebox-world/gameplay-contracts";
import type {
  ExecutionPlanV5,
  GameplayBootstrapExecutionResourceLockV1,
} from "@whitebox-world/runtime-contracts";

export function compileRuntimeTestPlanV5(
  spec: AuthoringSpecV4,
  normalizeOptions: Parameters<typeof normalizeAuthoringSpecV4>[1] = {},
): ExecutionPlanV5 {
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
  const gameplayBootstrapResourceLock =
    createRuntimeTestGameplayBootstrapLockV1(normalized.value);
  const input: CompileWorldInputV5 = {
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrapResourceLock,
  };
  const compiled = compileWorldV5(input);
  if (!compiled.ok || compiled.executionPlan === undefined) {
    throw new Error(
      `Fixture compile failed: ${JSON.stringify(compiled.diagnostics)}`,
    );
  }
  return compiled.executionPlan;
}

export function createRuntimeTestGameplayBootstrapLockV1(
  normalizedWorldIr: NormalizedWorldIRV4,
): GameplayBootstrapExecutionResourceLockV1 {
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
  return createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap);
}
