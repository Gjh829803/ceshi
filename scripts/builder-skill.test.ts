import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileWorldV5 } from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import { createGameplayBootstrapResourceLockEntryV1 } from "@whitebox-world/gameplay-contracts";
import { describe, expect, it } from "vitest";

function controlledSubjectTemplate(
  markdown: string,
  heading = "## Valid bound ground proxy",
): AuthoringSpecV4["resources"]["subjectDefinitions"][number] {
  const section = markdown.split(heading)[1];
  const json = section?.match(/```json\n([\s\S]*?)\n```/)?.[1];
  if (json === undefined) throw new Error(`Controlled Subject template is missing: ${heading}.`);
  return JSON.parse(json);
}

function gameplayBootstrapResourceLock(normalizedWorldIr: NormalizedWorldIRV4) {
  const entityDescriptors = normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => {
      const definition = normalizedWorldIr.resources.subjectDefinitions.find(
        (candidate) =>
          candidate.subjectDefinitionRef === node.subjectDefinitionRef,
      );
      if (definition === undefined) {
        throw new Error(`Missing Subject Definition '${node.subjectDefinitionRef}'.`);
      }
      return {
        id: node.id,
        entityDefinitionRef: node.subjectDefinitionRef,
        capabilityRefs: definition.capabilityRefs,
      };
    });
  return createGameplayBootstrapResourceLockEntryV1(
    createCoreGameplayBootstrapV1({
      worldId: normalizedWorldIr.id,
      worldSeed: normalizedWorldIr.seed,
      entityDescriptors,
    }),
  );
}

function compileCurrentWorld(world: AuthoringSpecV4) {
  const normalized = normalizeAuthoringSpecV4(world);
  expect(normalized.ok, JSON.stringify(normalized.diagnostics)).toBe(true);
  expect(normalized.value).toBeDefined();
  expect(normalized.normalizedWorldIrHash).toBeDefined();
  return compileWorldV5({
    normalizedWorldIr: normalized.value!,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash!,
    gameplayBootstrapResourceLock:
      gameplayBootstrapResourceLock(normalized.value!),
  });
}

describe("Canonical Builder skill", () => {
  it("provides a compilable one-Subject human plus equipment binding", async () => {
    const [worldSource, reference] = await Promise.all([
      readFile(path.resolve("examples/authoring/basic-world.json"), "utf8"),
      readFile(path.resolve(
        ".codex/skills/worldkit-canonical-builder/references/controlled-subjects.md",
      ), "utf8"),
    ]);
    const world = JSON.parse(worldSource) as AuthoringSpecV4;
    world.world.resourceBudget = {
      maxVertices: 120_000,
      maxTriangles: 180_000,
      maxColliders: 128,
    };
    world.resources.subjectDefinitions = [controlledSubjectTemplate(reference)];
    expect(world.resources.subjectDefinitions[0]?.profiles.controlFeelProfileRef).toBe(
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
    );
    const subject = world.nodes.find((node) => node.kind === "subject");
    if (subject?.kind !== "subject") throw new Error("Fixture Subject is missing.");
    subject.subjectDefinitionRef =
      "package://subject-definition/humanoid-board-ground@1";

    const compiled = compileCurrentWorld(world);
    expect(compiled.ok).toBe(true);
    expect(compiled.executionPlan?.subjects).toHaveLength(1);
    expect(compiled.executionPlan?.subjects[0]).toMatchObject({
      entityId: subject.id,
      subjectDefinitionRef:
        "package://subject-definition/humanoid-board-ground@1",
      visualParts: [
        expect.objectContaining({ id: "board", kind: "primitive" }),
        expect.objectContaining({ id: "body.asset", kind: "asset" }),
      ],
    });
    expect(compiled.executionPlan?.initialControlledEntityId).toBe(subject.id);
    expect(compiled.executionPlan?.camera.targetEntityId).toBe(subject.id);
  });

  it("consumes the lightweight movement brief and maps only complete visual targets", async () => {
    const [skill, template, terrainAndStructures] = await Promise.all([
      readFile(path.resolve(".codex/skills/worldkit-canonical-builder/SKILL.md"), "utf8"),
      readFile(path.resolve(
        ".codex/skills/worldkit-canonical-builder/references/canonical-template.md",
      ), "utf8"),
      readFile(path.resolve(
        ".codex/skills/worldkit-canonical-builder/references/terrain-and-structures.md",
      ), "utf8"),
    ]);
    expect(skill).toContain("brief's explicit movement mode");
    expect(skill).toContain("capability-gap diagnostic");
    expect(skill).toContain("Never emit `worldkit://capability/relationship.mount@1`");
    expect(skill).toContain("`maxVertices`, `maxTriangles`, and `maxColliders` are required hard budgets");
    expect(skill).toContain("current compiler rejects every overrun");
    expect(skill).not.toContain("actual compiled use at or below `150000` triangles");
    expect(skill).toContain("Do not infer quality from perimeter length or a fixed play-time estimate");
    expect(skill).toContain("standalone validator bundled with this Skill");
    expect(skill).toContain("worldkit-canonical-builder/scripts/self-check.mjs");
    expect(skill).toContain("at most three self-repair cycles");
    expect(skill).toContain("does not start a separate Builder Repair Agent");
    expect(skill).toContain("strict centered rear view");
    expect(skill).toContain("spawn at yaw `0`");
    expect(skill).toContain("validate-entry-third-person.py");
    expect(skill).toContain("Map exactly the 1-5 palette targets and nothing else");
    expect(skill).toContain("Emit AuthoringSpec V4");
    expect(skill).toContain("ExecutionPlan V5");
    expect(skill).toContain("connected-by-route");
    expect(skill).toContain("Route R1/R1B");
    expect(skill).toContain("traversalSurfaceBindings");
    expect(skill).toContain("worldkit://traversal-surface-profile/ground.static@1");
    expect(skill).toContain("Gameplay Bootstrap Resource Lock");
    expect(skill).toContain("repeated-landmark");
    expect(skill).toContain('world.environment.preset: "clear-day"');
    expect(skill).toContain("SPAWN_BELOW_GROUND");
    expect(skill).toContain("SPAWN_ABOVE_GROUND");
    expect(skill).toContain("requiredSubjectOriginYMeters");
    expect(template).toContain('"schemaVersion": 4');
    expect(template).toContain('"preset": "clear-day"');
    expect(template).toContain('"kind": "supported-by"');
    expect(template).toContain('"kind": "within-slope-limit"');
    expect(template).toContain('"kind": "solved"');
    expect(template).toContain('"traversalAreas": []');
    expect(template).toContain('"connectivity": []');
    expect(template).toContain('"kind": "worldkit-scene-brief-implementation-map"');
    expect(template).toContain('"visualTargetId": "visual-target-1"');
    expect(template).not.toContain('"planId"');
    expect(terrainAndStructures).toContain(
      "`maxVertices`, `maxTriangles`, and `maxColliders` are required hard budgets",
    );
    expect(terrainAndStructures).toContain(
      "the current compiler rejects every overrun",
    );
    expect(terrainAndStructures).not.toContain(
      "`maxTriangles` is a required resource-budget field but no longer blocks validation or compilation",
    );
    expect(terrainAndStructures).toContain(
      "Flight, underwater, vehicles, caves, interiors, and other unsupported production movement or topology requests are capability gaps",
    );
    expect(terrainAndStructures).not.toContain(
      "Flight also needs at least 120 m of usable vertical range",
    );
    expect(terrainAndStructures).not.toContain(
      "Flight or underwater: world bounds are the free movement domain",
    );
  });
});
