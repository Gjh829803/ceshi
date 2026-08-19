import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createValidPackageSubjectWorldV2 } from "../packages/authoring/src/test-fixture";

import { explainSubjectFile } from "./lib/subject-explain";
import {
  buildFile,
  describeRegistryResource,
  listRegistryResources,
  parseWorldkitArgs,
  validateFile,
  validateSubjectDefinitionFile,
  WorldkitUsageError,
} from "./worldkit";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "worldkit-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writePackageWorld(directory: string): Promise<string> {
  const inputPath = path.join(directory, "package-world.json");
  await writeFile(
    inputPath,
    JSON.stringify(createValidPackageSubjectWorldV2()),
    "utf8",
  );
  return inputPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("worldkit CLI", () => {
  it("parses discovery and explain commands without positional guessing", () => {
    expect(
      parseWorldkitArgs([
        "registry",
        "list",
        "--kind",
        "subject-definition",
        "--json",
      ]),
    ).toEqual({
      command: "registry-list",
      resourceKind: "subject-definition",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "registry",
        "describe",
        "--resource-ref",
        "worldkit://subject-definition/humanoid.third-person@1",
        "--json",
      ]),
    ).toEqual({
      command: "registry-describe",
      resourceRef: "worldkit://subject-definition/humanoid.third-person@1",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "subject-definition",
        "validate",
        "definition.json",
        "--json",
      ]),
    ).toEqual({
      command: "subject-definition-validate",
      inputPath: "definition.json",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "subject",
        "explain",
        "world.json",
        "--entity-id",
        "pack-animal-a",
        "--json",
      ]),
    ).toEqual({
      command: "subject-explain",
      inputPath: "world.json",
      entityId: "pack-animal-a",
      json: true,
    });
  });

  it("rejects unknown, incomplete, or ambiguous command options", () => {
    expect(() => parseWorldkitArgs(["build", "world.json"])).toThrow(
      WorldkitUsageError,
    );
    expect(() =>
      parseWorldkitArgs(["registry", "list", "--json"]),
    ).toThrow(WorldkitUsageError);
    expect(() =>
      parseWorldkitArgs([
        "registry",
        "describe",
        "worldkit://subject-definition/humanoid.third-person@1",
      ]),
    ).toThrow(WorldkitUsageError);
    expect(() =>
      parseWorldkitArgs(["subject", "explain", "world.json"]),
    ).toThrow(WorldkitUsageError);
  });

  it("lists and describes immutable Registry resources in stable order", () => {
    const first = listRegistryResources("subject-definition");
    const second = listRegistryResources("subject-definition");

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      ok: true,
      kind: "worldkit-registry-list",
      schemaVersion: 1,
      resourceKind: "subject-definition",
    });
    expect(first.resources.map((resource) => resource.resourceRef)).toEqual([
      "worldkit://subject-definition/humanoid.third-person@1",
      "worldkit://subject-definition/quadruped.ground-proxy@1",
    ]);
    expect(first.resources[0]).toMatchObject({
      kind: "subject-definition",
      version: 1,
      contentHash: expect.stringMatching(/^sha256:/),
      aiMetadata: {
        displayName: expect.any(String),
        description: expect.any(String),
      },
      coordinateConvention: { pivot: "support-center" },
    });

    expect(
      describeRegistryResource(
        "worldkit://subject-definition/humanoid.third-person@1",
      ),
    ).toMatchObject({
      ok: true,
      kind: "worldkit-registry-description",
      schemaVersion: 1,
      resource: {
        resourceRef:
          "worldkit://subject-definition/humanoid.third-person@1",
        contentHash: expect.stringMatching(/^sha256:/),
      },
    });
  });

  it("returns discovery guidance for a missing exact Registry Ref", () => {
    expect(
      describeRegistryResource(
        "worldkit://subject-definition/humanoid.third-person@2",
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "SUBJECT_DEFINITION_NOT_FOUND",
          details: {
            resourceRef:
              "worldkit://subject-definition/humanoid.third-person@2",
            availableResourceRefs: expect.arrayContaining([
              "worldkit://subject-definition/humanoid.third-person@1",
            ]),
          },
        },
      ],
    });
  });

  it("validates a standalone Definition through canonical derivation", async () => {
    const directory = await createTemporaryDirectory();
    const definitionPath = path.join(directory, "definition.json");
    const definition = createValidPackageSubjectWorldV2().resources
      .subjectDefinitions[0]!;
    await writeFile(definitionPath, JSON.stringify(definition), "utf8");

    const result = await validateSubjectDefinitionFile(definitionPath);

    expect(result).toMatchObject({
      ok: true,
      kind: "worldkit-subject-definition-validation",
      schemaVersion: 1,
      subjectDefinition: {
        subjectDefinitionRef:
          "package://subject-definition/coastal-pack-animal@1",
        subjectDefinitionHash: expect.stringMatching(/^sha256:/),
        collider: {
          derivationProfileRef:
            "worldkit://collider-derivation-profile/vertical-character-capsule@1",
          radiusMeters: 0.7,
          heightMeters: 1.4,
          centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
        },
        resourceCost: { vertices: 304, triangles: 524, colliders: 1 },
        resourceLockHash: expect.stringMatching(/^sha256:/),
        resourceLockEntries: expect.any(Array),
      },
    });
  });

  it("rejects duplicate keys and invalid standalone Definition fields", async () => {
    const directory = await createTemporaryDirectory();
    const duplicatePath = path.join(directory, "duplicate.json");
    const invalidPath = path.join(directory, "invalid.json");
    await writeFile(
      duplicatePath,
      '{"id":"a","id":"b","kind":"subject-definition"}',
      "utf8",
    );
    await writeFile(
      invalidPath,
      JSON.stringify({
        ...createValidPackageSubjectWorldV2().resources.subjectDefinitions[0],
        unexpectedField: true,
      }),
      "utf8",
    );

    expect(await validateSubjectDefinitionFile(duplicatePath)).toMatchObject({
      ok: false,
      diagnostics: [
        { code: "AUTHORING_JSON_DUPLICATE_KEY", instancePath: "/id" },
      ],
    });
    expect(await validateSubjectDefinitionFile(invalidPath)).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "AUTHORING_SCHEMA_INVALID" })],
    });
  });

  it("explains Definition, collider, Profiles, lock entries, and cost", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writePackageWorld(directory);

    const result = await explainSubjectFile(inputPath, "pack-animal-a");

    expect(result).toMatchObject({
      ok: true,
      kind: "worldkit-subject-explanation",
      schemaVersion: 1,
      subject: {
        entityId: "pack-animal-a",
        subjectDefinitionRef:
          "package://subject-definition/coastal-pack-animal@1",
        subjectDefinitionHash: expect.stringMatching(/^sha256:/),
        source: "package",
        collider: {
          derivationProfileRef:
            "worldkit://collider-derivation-profile/vertical-character-capsule@1",
          centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
        },
        profiles: {
          physicsBodyProfileRef:
            "worldkit://physics-body-profile/character.medium@1",
          locomotionProfileRef:
            "worldkit://locomotion-profile/ground.standard@1",
        },
        capabilityRefs: ["worldkit://capability/locomotion.ground@1"],
        resourceLockEntries: expect.any(Array),
        resourceLockHash: expect.stringMatching(/^sha256:/),
        resourceCost: { colliders: 1 },
      },
    });
  });

  it("returns a stable diagnostic for a missing Subject Entity", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writePackageWorld(directory);

    expect(await explainSubjectFile(inputPath, "missing")).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "SUBJECT_ENTITY_NOT_FOUND",
          details: {
            entityId: "missing",
            availableEntityIds: ["pack-animal-a", "pack-animal-b", "player"],
          },
        },
      ],
    });
  });

  it("validates V2 files and builds deterministic V3 artifacts", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writePackageWorld(directory);
    const outputPath = path.join(directory, "dist", "world.build.json");

    const validation = await validateFile(inputPath);
    const first = await buildFile(inputPath, outputPath);
    const firstBytes = await readFile(outputPath, "utf8");
    const second = await buildFile(inputPath, outputPath);
    const secondBytes = await readFile(outputPath, "utf8");
    const artifact = JSON.parse(firstBytes) as Record<string, unknown>;

    expect(validation).toMatchObject({ ok: true, exitCode: 0, diagnostics: [] });
    expect(first).toMatchObject({ ok: true, exitCode: 0, outputPath });
    expect(second.ok).toBe(true);
    expect(firstBytes).toBe(secondBytes);
    expect(artifact).toMatchObject({
      kind: "worldkit-build-artifact",
      schemaVersion: 3,
      normalizedWorldIr: { schemaVersion: 2 },
      executionPlan: {
        schemaVersion: 3,
        runtimeBackend: "babylon-havok",
        controlledEntityId: "player",
      },
    });
    expect(firstBytes).not.toContain(["kit", "Ref"].join(""));
  });
});
