import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createValidPackageSubjectWorld,
  createValidRiggedPackageDefinition,
} from "../packages/authoring/src/test-fixture";

import { explainSubjectFile } from "./lib/subject-explain";
import {
  buildFile,
  captureVisibleWorldWithRetries,
  describeRegistryResource,
  listRegistryResources,
  main,
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
    JSON.stringify(createValidPackageSubjectWorld()),
    "utf8",
  );
  return inputPath;
}

const RIGGED_SUBJECT_WORLD_PATH = path.resolve(
  fileURLToPath(new URL("../examples/authoring/rigged-subject-world.json", import.meta.url)),
);
const G_BOT_SUBJECT_WORLD_PATH = path.resolve(
  fileURLToPath(new URL("../examples/authoring/g-bot-subject-world.json", import.meta.url)),
);
const G_BOT_ACTION_IDS = [
  "dance.rumba", "emote.angry", "emote.salute", "fall", "fight.enter",
  "float", "fly", "idle", "idle.gaming", "jump", "land.hard",
  "land.hard.alt", "lay.idle", "roll.toRun", "run", "sit",
  "sit.ground.idle", "sit.idle", "sit.toStand", "stand", "swim.exit",
  "swim.surface", "swim.tread", "walk", "walk.step",
] as const;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("worldkit CLI", () => {
  it("parses an explicit dependency refresh for local Runtime startup", () => {
    expect(
      parseWorldkitArgs([
        "run",
        "world.json",
        "--refresh-dependencies",
        "--json",
      ]),
    ).toEqual({
      command: "run",
      inputPath: "world.json",
      refreshDependencies: true,
      json: true,
    });
  });

  it("retries background-only browser captures and stops at the first visible world", async () => {
    const sampledRgbColorCounts = [1, 2, 4];
    let attempts = 0;

    await expect(
      captureVisibleWorldWithRetries(async () => ({
        sampledRgbColorCount: sampledRgbColorCounts[attempts++]!,
        screenshotDataUrl: `capture-${attempts}`,
      }), 4),
    ).resolves.toEqual({
      sampledRgbColorCount: 4,
      screenshotDataUrl: "capture-3",
    });
    expect(attempts).toBe(3);
  });

  it("fails after the bounded visible-world capture attempts", async () => {
    let attempts = 0;
    await expect(
      captureVisibleWorldWithRetries(async () => {
        attempts += 1;
        return { sampledRgbColorCount: 1 };
      }, 3),
    ).rejects.toThrow("WORLDKIT_CAPTURE_VISIBLE_WORLD_MISSING");
    expect(attempts).toBe(3);
  });

  it("parses discovery and explain commands without positional guessing", () => {
    expect(
      parseWorldkitArgs(["take", "validate", "opening.take.json", "--json"]),
    ).toEqual({
      command: "take-validate",
      inputPath: "opening.take.json",
      json: true,
    });
    expect(
      parseWorldkitArgs(["take", "inspect", "opening.take.json", "--json"]),
    ).toEqual({
      command: "take-inspect",
      inputPath: "opening.take.json",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "take",
        "run",
        "opening.take.json",
        "--world",
        "world.json",
        "--output",
        "capture-bundle",
        "--width-pixels",
        "320",
        "--height-pixels",
        "180",
        "--port",
        "5180",
        "--json",
      ]),
    ).toEqual({
      command: "take-run",
      inputPath: "opening.take.json",
      worldPath: "world.json",
      outputPath: "capture-bundle",
      widthPixels: 320,
      heightPixels: 180,
      port: 5180,
      json: true,
    });
    expect(
      parseWorldkitArgs(["capture", "validate", "capture-bundle", "--json"]),
    ).toEqual({ command: "capture-validate", inputPath: "capture-bundle", json: true });
    expect(
      parseWorldkitArgs(["capture", "inspect", "capture-bundle", "--json"]),
    ).toEqual({ command: "capture-inspect", inputPath: "capture-bundle", json: true });
    expect(
      parseWorldkitArgs([
        "verify",
        "capture",
        "capture-bundle",
        "--output",
        "validation-report.json",
        "--json",
      ]),
    ).toEqual({
      command: "verify-capture",
      inputPath: "capture-bundle",
      outputPath: "validation-report.json",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "verify",
        "explain",
        "validation-report.json",
        "--gate-id",
        "capture-completeness",
        "--json",
      ]),
    ).toEqual({
      command: "verify-explain",
      inputPath: "validation-report.json",
      gateId: "capture-completeness",
      json: true,
    });
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
      parseWorldkitArgs(["layout", "validate", "world.json", "--json"]),
    ).toEqual({
      command: "layout-validate",
      inputPath: "world.json",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "layout",
        "solve",
        "world.json",
        "--output",
        "layout-output",
        "--json",
      ]),
    ).toEqual({
      command: "layout-solve",
      inputPath: "world.json",
      outputPath: "layout-output",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "layout",
        "explain",
        "layout-report.json",
        "--constraint-id",
        "tower-clearance",
        "--json",
      ]),
    ).toEqual({
      command: "layout-explain",
      inputPath: "layout-report.json",
      constraintId: "tower-clearance",
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
    expect(() =>
      parseWorldkitArgs(["verify", "capture", "capture-bundle"]),
    ).toThrow(WorldkitUsageError);
    expect(() =>
      parseWorldkitArgs([
        "verify",
        "explain",
        "validation-report.json",
        "--gate-id",
        "capture-completeness",
        "--gate-id",
        "capture-ownership",
      ]),
    ).toThrow(WorldkitUsageError);
    expect(() =>
      parseWorldkitArgs([
        "layout",
        "explain",
        "report.json",
        "--entity-id",
        "tower",
        "--constraint-id",
        "tower-clearance",
      ]),
    ).toThrow("exactly one of --entity-id or --constraint-id");
    expect(() =>
      parseWorldkitArgs(["layout", "solve", "world.json"]),
    ).toThrow("layout solve requires --output <directory>");
    expect(() =>
      parseWorldkitArgs(["take", "run", "opening.take.json", "--world", "world.json"]),
    ).toThrow("take run requires --output <directory>");
    expect(() =>
      parseWorldkitArgs([
        "take", "run", "opening.take.json", "--world", "world.json",
        "--output", "bundle", "--width-pixels", "320",
      ]),
    ).toThrow("take run requires --height-pixels <integer>");
  });

  it("prints one canonical JSON result and keeps stderr empty for layout commands", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writePackageWorld(directory);
    const outputPath = path.join(directory, "layout");
    let stdout = "";
    let stderr = "";
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => {
        stdout += String(chunk);
        return true;
      });
    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk) => {
        stderr += String(chunk);
        return true;
      });
    try {
      await expect(
        main([
          "layout",
          "solve",
          inputPath,
          "--output",
          outputPath,
          "--json",
        ]),
      ).resolves.toBe(0);
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
    }

    expect(stderr).toBe("");
    expect(stdout.endsWith("\n")).toBe(true);
    expect(stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      exitCode: 0,
      kind: "worldkit-layout-solve",
      status: "solved",
      outputPath,
    });
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
      "worldkit://subject-definition/humanoid.g-bot@1",
      "worldkit://subject-definition/humanoid.third-person@1",
      "worldkit://subject-definition/quadruped.ground-proxy@1",
    ]);
    expect(first.resources[0]).toMatchObject({
      kind: "subject-definition",
      schemaVersion: 3,
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
        "worldkit://subject-definition/humanoid.g-bot@1",
      ),
    ).toMatchObject({
      ok: true,
      kind: "worldkit-registry-description",
      schemaVersion: 1,
      resource: {
        resourceRef: "worldkit://subject-definition/humanoid.g-bot@1",
        schemaVersion: 3,
        contentHash: first.resources[0]?.contentHash,
      },
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

  it("describes every Registry resource kind selected by the rigged Subject", () => {
    const resourceRefByKind = {
      "subject-asset": "worldkit://subject-asset/humanoid.golden@1",
      "rig-profile": "worldkit://rig-profile/biped.golden@1",
      "animation-set": "worldkit://animation-set/humanoid.ground.golden@1",
      "collider-profile": "worldkit://collider-profile/humanoid.medium-capsule@1",
      "physics-body-profile": "worldkit://physics-body-profile/character.medium@1",
      "locomotion-profile": "worldkit://locomotion-profile/ground.standard@1",
      capability: "worldkit://capability/locomotion.ground@1",
      "subject-definition": "worldkit://subject-definition/humanoid.rigged-golden@1",
    } as const;

    for (const [kind, resourceRef] of Object.entries(resourceRefByKind)) {
      expect(describeRegistryResource(resourceRef)).toMatchObject({
        ok: true,
        resource: { kind, resourceRef },
      });
    }
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
    const definition = createValidPackageSubjectWorld().resources
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
          colliderDerivationProfileRef:
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

  it("validates a profile Collider without inventing a derivation alias", async () => {
    const directory = await createTemporaryDirectory();
    const definitionPath = path.join(directory, "rigged-definition.json");
    await writeFile(
      definitionPath,
      JSON.stringify(createValidRiggedPackageDefinition()),
      "utf8",
    );

    const result = await validateSubjectDefinitionFile(definitionPath);

    expect(result).toMatchObject({
      ok: true,
      subjectDefinition: {
        collider: {
          colliderProfileRef:
            "worldkit://collider-profile/humanoid.medium-capsule@1",
          radiusMeters: 0.32,
          heightMeters: 1.92,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("derivationProfileRef");
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
        ...createValidPackageSubjectWorld().resources.subjectDefinitions[0],
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
          colliderDerivationProfileRef:
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

  it("explains the rigged Subject with canonical refs and exactly eight selected lock kinds", async () => {
    const result = await explainSubjectFile(
      RIGGED_SUBJECT_WORLD_PATH,
      "rigged-primary",
    );

    expect(result).toMatchObject({
      ok: true,
      subject: {
        entityId: "rigged-primary",
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.rigged-golden@1",
        visualParts: [
          {
            id: "body.asset",
            kind: "asset",
            subjectAssetRef: "worldkit://subject-asset/humanoid.golden@1",
          },
        ],
        visualBinding: {
          mode: "rigged",
          rigProfileRef: "worldkit://rig-profile/biped.golden@1",
          animationSetRef:
            "worldkit://animation-set/humanoid.ground.golden@1",
        },
        collider: {
          colliderProfileRef:
            "worldkit://collider-profile/humanoid.medium-capsule@1",
        },
      },
    });
    if (!result.ok) throw new Error("Rigged Subject explanation failed.");
    expect(
      result.subject.resourceLockEntries.map((entry) => entry.resourceKind),
    ).toEqual([
      "animation-set",
      "capability",
      "collider-profile",
      "locomotion-profile",
      "physics-body-profile",
      "rig-profile",
      "subject-asset",
      "subject-definition",
    ]);
    const explanationJson = JSON.stringify(result.subject);
    for (const forbiddenField of [
      "artifact",
      "bytes",
      "provenance",
      "sourceUri",
      "engineHandle",
    ]) {
      expect(explanationJson).not.toContain(forbiddenField);
    }
  });

  it("validates, builds, and explains the G Bot world without leaking asset locations", async () => {
    const directory = await createTemporaryDirectory();
    const outputPath = path.join(directory, "g-bot.build.json");

    const validation = await validateFile(G_BOT_SUBJECT_WORLD_PATH);
    const build = await buildFile(G_BOT_SUBJECT_WORLD_PATH, outputPath);
    const explanation = await explainSubjectFile(
      G_BOT_SUBJECT_WORLD_PATH,
      "g-bot-primary",
    );
    expect(validation).toMatchObject({ ok: true, diagnostics: [] });
    expect(build).toMatchObject({ ok: true, outputPath });
    expect(explanation).toMatchObject({
      ok: true,
      subject: {
        entityId: "g-bot-primary",
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@1",
        visualBinding: {
          rigProfileRef: "worldkit://rig-profile/biped.mixamo-g-bot@1",
          animationSetRef:
            "worldkit://animation-set/humanoid.ground.g-bot@1",
        },
      },
    });
    const artifactText = await readFile(outputPath, "utf8");
    const artifact = JSON.parse(artifactText) as {
      executionPlan: {
        subjectAssets: Array<{ subjectAssetRef: string }>;
        rigProfiles: Array<{ skeletonRootBoneName: string }>;
        animationSets: Array<{ animationBindings: Array<{ actionId: string }> }>;
        colliderProfiles: Array<{ colliderProfileRef: string }>;
      };
    };

    expect(artifact.executionPlan.subjectAssets).toEqual([
      {
        subjectAssetRef: "worldkit://subject-asset/actor.humanoid.g-bot@1",
        artifactContentHash:
          "sha256:41833210e735788da0777fc37badcec03f90ccf17ab5a7d89103f0727abeeb1b",
        byteLength: 5_302_160,
        format: "glb",
        inventory: expect.any(Object),
        mediaType: "model/gltf-binary",
      },
    ]);
    expect(artifact.executionPlan.rigProfiles).toEqual([
      expect.objectContaining({ skeletonRootBoneName: "mixamorig:Hips" }),
    ]);
    expect(
      artifact.executionPlan.animationSets[0]?.animationBindings.map(
        (binding) => binding.actionId,
      ),
    ).toEqual(G_BOT_ACTION_IDS);
    expect(artifact.executionPlan.colliderProfiles).toEqual([
      expect.objectContaining({
        colliderProfileRef:
          "worldkit://collider-profile/humanoid.g-bot-capsule@1",
      }),
    ]);
    expect(artifactText).not.toMatch(
      /subject-assets\/humanoid|sourceUri|licenseUri|providerHandle/i,
    );
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

  it("validates V3 files and builds deterministic V3/V4 artifacts", async () => {
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
      normalizedWorldIr: { schemaVersion: 3 },
      executionPlan: {
        schemaVersion: 4,
        runtimeBackend: "babylon-havok",
        controlledEntityId: "player",
      },
    });
    expect(firstBytes).not.toContain(["kit", "Ref"].join(""));
  });
});
