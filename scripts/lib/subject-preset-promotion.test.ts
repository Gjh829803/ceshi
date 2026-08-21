import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  createSubjectPresetCandidateV1,
  type SubjectPresetCandidateV1,
} from "@whitebox-world/authoring";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  builtInSubjectResourceRegistry,
  resolveSubjectPresetClosureV1,
} from "@whitebox-world/subject-registry";

import {
  assertSubjectPresetArtifactLocationV1,
  planSubjectPresetPromotion,
  promoteSubjectPresetTransactionally,
  validateSubjectPresetCandidateFile,
  type SubjectPresetPromotionPlanV1,
} from "./subject-preset-promotion";
import {
  main as worldkitMain,
  parseWorldkitArgs,
  WorldkitUsageError,
} from "../worldkit";

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const temporaryRoots: string[] = [];

const SUBJECT_REF =
  "worldkit://subject-definition/animal.quadruped.forward-steer@1";
const MOTION_REF = "worldkit://motion-profile/free-ground.humanoid-medium@1";
const CONTROL_REF =
  "worldkit://control-profile/planar.camera-relative@1";
const CONTROL_FEEL_REF =
  "worldkit://control-feel-profile/humanoid.medium-ground@1";
const CAMERA_CONTEXT_REF =
  "worldkit://camera-context/capability-driven.default@1";
const CAMERA_REF = "worldkit://camera-profile/orbit.medium@1";

function sha256Bytes(bytes: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function lockedHash(resourceRef: string): string {
  const entry = resolveSubjectPresetClosureV1(
    builtInSubjectResourceRegistry,
    SUBJECT_REF,
  ).entries.find((candidate) => candidate.resourceRef === resourceRef);
  if (entry === undefined) throw new Error(`Missing fixture resource ${resourceRef}`);
  return entry.contentHash;
}

function createCandidate(): SubjectPresetCandidateV1 {
  const closure = resolveSubjectPresetClosureV1(
    builtInSubjectResourceRegistry,
    SUBJECT_REF,
  );
  const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(SUBJECT_REF);
  const context = builtInSubjectResourceRegistry.resolveCameraContextProfile(
    CAMERA_CONTEXT_REF,
  );
  if (definition === undefined || context === undefined) {
    throw new Error("Missing promotion fixture Registry resources.");
  }
  const cameraRefs = [...new Set([
    context.defaultCameraRigProfileRef,
    ...(context.firstPersonCameraRigProfileRef === undefined
      ? []
      : [context.firstPersonCameraRigProfileRef]),
    ...context.rules.flatMap((rule) =>
      rule.cameraRigProfileRef === undefined ? [] : [rule.cameraRigProfileRef]
    ),
  ])].sort();

  return createSubjectPresetCandidateV1({
    kind: "worldkit-subject-preset-candidate",
    schemaVersion: 1,
    semanticContent: {
      candidateId: "quadruped-official-v1",
      subjectDefinitionId: "animal.quadruped.forward-steer",
      base: {
        subjectDefinitionRef: SUBJECT_REF,
        subjectDefinitionContentHash: closure.subjectDefinitionContentHash,
        registryLock: closure.entries,
        registryLockHash: closure.contentHash,
      },
      selections: {
        motionRoles: {
          default: {
            sourceProfileRef: MOTION_REF,
            sourceContentHash: lockedHash(MOTION_REF),
            disposition: "preserve",
          },
          optional: [{
            sourceProfileRef: "worldkit://motion-profile/safe-ground@1",
            sourceContentHash: lockedHash(
              "worldkit://motion-profile/safe-ground@1",
            ),
            disposition: "preserve",
          }],
          fallback: {
            sourceProfileRef: "worldkit://motion-profile/safe-ground@1",
            sourceContentHash: lockedHash(
              "worldkit://motion-profile/safe-ground@1",
            ),
            disposition: "preserve",
          },
        },
        controlFeel: {
          profileRef: CONTROL_FEEL_REF,
          contentHash: lockedHash(CONTROL_FEEL_REF),
          disposition: "derive",
        },
        control: {
          profileRef: CONTROL_REF,
          contentHash: lockedHash(CONTROL_REF),
          disposition: "preserve",
        },
        cameraContextProfileRef: CAMERA_CONTEXT_REF,
        defaultCameraRigProfileRef: CAMERA_REF,
      },
      overrides: {
        controlFeelByProfileRef: {
          [CONTROL_FEEL_REF]: {
            baseResourceRef: CONTROL_FEEL_REF,
            baseContentHash: lockedHash(CONTROL_FEEL_REF),
            values: {
              jumpSpeedMetersPerSecond: 3.1,
              turnRateRadiansPerSecond: 2.4,
            },
          },
        },
        controlByProfileRef: {},
        cameraByProfileRef: {
          [CAMERA_REF]: {
            baseResourceRef: CAMERA_REF,
            baseContentHash: lockedHash(CAMERA_REF),
            values: {
              collisionRecoveryMetersPerSecond: 3.25,
              collisionRetractionMetersPerSecond: 4.5,
              targetHeightMeters: 1.35,
            },
          },
        },
        cameraPublicationBySourceProfileRef: Object.fromEntries(
          cameraRefs.map((resourceRef) => [
            resourceRef,
            {
              sourceContentHash: lockedHash(resourceRef),
              disposition: resourceRef === CAMERA_REF ? "derive" : "preserve",
            },
          ]),
        ),
      },
      publication: {
        mode: "subject-scoped-derivatives",
        publicDefaultEnabled: true,
      },
    },
    provenance: {
      displayName: "Quadruped official feel",
      notes: "Six reviewed tuning differences.",
      createdAtIso: "2026-08-21T08:00:00.000Z",
      sourceCommit: "0123456789abcdef0123456789abcdef01234567",
    },
    evidence: {
      harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
      passedCheckIds: ["H01", "H02", "H03"],
      runtimeBuild: "playground-2026.08.21",
    },
  });
}

async function git(root: string, ...arguments_: string[]): Promise<string> {
  const result = await execFile("git", ["-C", root, ...arguments_]);
  return result.stdout.trim();
}

async function createFixtureRepository(): Promise<{
  root: string;
  candidatePath: string;
}> {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "worldkit-preset-promotion-"));
  temporaryRoots.push(fixtureRoot);
  const root = path.join(fixtureRoot, "repository");
  await mkdir(path.join(root, "assets"), { recursive: true });
  await cp(
    path.join(repositoryRoot, "assets", "registry"),
    path.join(root, "assets", "registry"),
    { recursive: true },
  );
  await git(root, "init", "-b", "feature/preset-promotion-test");
  await git(root, "config", "user.email", "worldkit-tests@example.invalid");
  await git(root, "config", "user.name", "Worldkit Tests");
  await git(root, "add", "assets/registry");
  await git(root, "commit", "-m", "fixture registry");

  const candidatePath = path.join(fixtureRoot, "candidate.json");
  await writeFile(candidatePath, `${JSON.stringify(createCandidate())}\n`, "utf8");
  return { root, candidatePath };
}

function decodeTarget(plan: SubjectPresetPromotionPlanV1, logicalPath: string): unknown {
  const target = plan.targets.find((candidate) => candidate.logicalPath === logicalPath);
  if (target === undefined) throw new Error(`Missing plan target ${logicalPath}`);
  return JSON.parse(Buffer.from(target.canonicalBytesBase64, "base64").toString("utf8"));
}

function rehashPlan(plan: SubjectPresetPromotionPlanV1): SubjectPresetPromotionPlanV1 {
  const clone = structuredClone(plan);
  const { planHash: _ignored, ...hashInput } = clone;
  clone.planHash = sha256CanonicalJson(hashInput);
  return clone;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("subject preset promotion", { timeout: 60_000 }, () => {
  it("allows candidate and plan artifacts only outside the repository or in the ignored preset area", () => {
    const root = path.join(tmpdir(), "worldkit-location-boundary");
    expect(() => assertSubjectPresetArtifactLocationV1(
      path.join(root, "assets", "registry", "motion-profiles", "catalog.json"),
      root,
    )).toThrow("SUBJECT_PRESET_PROMOTION_INPUT_LOCATION_FORBIDDEN");
    expect(() => assertSubjectPresetArtifactLocationV1(
      path.join(root, ".codex-tmp", "subject-presets", "candidate.json"),
      root,
    )).not.toThrow();
    expect(() => assertSubjectPresetArtifactLocationV1(
      path.join(path.dirname(root), "candidate.json"),
      root,
    )).not.toThrow();
  });

  it("parses validate, plan, and explicit-write promote CLI commands", () => {
    expect(parseWorldkitArgs([
      "subject-preset",
      "validate",
      "candidate.json",
      "--legacy-v4",
      "--json",
    ])).toEqual({
      command: "subject-preset-validate",
      inputPath: "candidate.json",
      legacyV4: true,
      json: true,
    });
    expect(parseWorldkitArgs([
      "subject-preset",
      "plan",
      "candidate.json",
      "--output",
      "plan.json",
      "--legacy-v4",
      "--json",
    ])).toEqual({
      command: "subject-preset-plan",
      inputPath: "candidate.json",
      outputPath: "plan.json",
      legacyV4: true,
      json: true,
    });
    expect(parseWorldkitArgs([
      "subject-preset",
      "promote",
      "candidate.json",
      "--plan",
      "plan.json",
      "--write",
      "--legacy-v4",
      "--json",
    ])).toEqual({
      command: "subject-preset-promote",
      inputPath: "candidate.json",
      planPath: "plan.json",
      write: true,
      legacyV4: true,
      json: true,
    });
    expect(() => parseWorldkitArgs([
      "subject-preset",
      "promote",
      "candidate.json",
      "--plan",
      "plan.json",
    ])).toThrow(WorldkitUsageError);
  });

  it("emits JSON-safe validate and plan results from the Worldkit CLI", async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "worldkit-preset-cli-"));
    temporaryRoots.push(fixtureRoot);
    const candidatePath = path.join(fixtureRoot, "candidate.json");
    const planPath = path.join(fixtureRoot, "plan.json");
    await writeFile(candidatePath, `${JSON.stringify(createCandidate())}\n`, "utf8");
    let stdout = "";
    let stderr = "";
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    }) as typeof process.stderr.write;
    try {
      await expect(worldkitMain([
        "subject-preset",
        "validate",
        candidatePath,
        "--json",
      ])).resolves.toBe(0);
      await expect(worldkitMain([
        "subject-preset",
        "plan",
        candidatePath,
        "--output",
        planPath,
        "--json",
      ])).resolves.toBe(0);
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    expect(stderr).toBe("");
    const results = stdout.trim().split("\n").map((line) => JSON.parse(line));
    expect(results).toEqual([
      expect.objectContaining({
        ok: true,
        kind: "worldkit-subject-preset-validation",
        candidateSemanticContentHash: createCandidate().semanticContentHash,
      }),
      expect.objectContaining({
        ok: true,
        kind: "worldkit-subject-preset-promotion-plan",
        outputPath: path.resolve(planPath),
        planHash: expect.stringMatching(/^sha256:/),
      }),
    ]);
    expect(JSON.parse(await readFile(planPath, "utf8"))).toMatchObject({
      kind: "worldkit-subject-preset-promotion-plan",
      candidateId: "quadruped-official-v1",
    });
  });

  it("validates and plans exact subject-scoped Registry resources without writing", async () => {
    const fixture = await createFixtureRepository();

    const validated = await validateSubjectPresetCandidateFile(fixture.candidatePath);
    const first = await planSubjectPresetPromotion(fixture.candidatePath, {
      repositoryRoot: fixture.root,
    });
    const second = await planSubjectPresetPromotion(fixture.candidatePath, {
      repositoryRoot: fixture.root,
    });

    expect(validated.semanticContentHash).toBe(createCandidate().semanticContentHash);
    expect(second).toEqual(first);
    expect(await git(fixture.root, "status", "--porcelain")).toBe("");
    expect(first.generatedResources.map((resource) => resource.resourceRef)).toEqual([
      "worldkit://camera-context/subject.animal.quadruped.forward-steer.default@1",
      "worldkit://camera-profile/subject.animal.quadruped.forward-steer.orbit-medium@1",
      "worldkit://control-feel-profile/subject.animal.quadruped.forward-steer.default@2",
      "worldkit://subject-definition/animal.quadruped.forward-steer@3",
    ]);
    expect(first.targets.map((target) => target.logicalPath)).toEqual([
      ".codex-tmp/subject-presets/quadruped-official-v1.registry-fixture.json",
      "assets/registry/camera-profiles/catalog.json",
      "assets/registry/control-feel-profiles/catalog.json",
      "assets/registry/subject-defaults/catalog.json",
      "assets/registry/subject-definitions/catalog.json",
    ]);

    const controlFeelCatalog = decodeTarget(
      first,
      "assets/registry/control-feel-profiles/catalog.json",
    ) as Array<Record<string, unknown>>;
    const derivedControlFeel = controlFeelCatalog.find((resource) =>
      resource.resourceRef ===
        "worldkit://control-feel-profile/subject.animal.quadruped.forward-steer.default@2"
    );
    expect(derivedControlFeel).toMatchObject({
      jumpSpeedMetersPerSecond: 3.1,
      turnRateRadiansPerSecond: 2.4,
    });

    const cameraCatalog = decodeTarget(
      first,
      "assets/registry/camera-profiles/catalog.json",
    ) as { contexts: Array<Record<string, unknown>> };
    expect(cameraCatalog.contexts).toContainEqual(expect.objectContaining({
      kind: "camera-context-profile",
      resourceRef:
        "worldkit://camera-context/subject.animal.quadruped.forward-steer.default@1",
      defaultCameraRigProfileRef:
        "worldkit://camera-profile/subject.animal.quadruped.forward-steer.orbit-medium@1",
    }));

    const subjectCatalog = decodeTarget(
      first,
      "assets/registry/subject-definitions/catalog.json",
    ) as Array<Record<string, unknown>>;
    expect(subjectCatalog).toContainEqual(expect.objectContaining({
      id: "animal.quadruped.forward-steer",
      version: 3,
      resourceRef:
        "worldkit://subject-definition/animal.quadruped.forward-steer@3",
    }));
    await expect(lstat(path.join(
      fixture.root,
      ".codex-tmp",
      "subject-presets",
      "quadruped-official-v1.registry-fixture.json",
    ))).rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);

  it("requires --write and rejects main, detached HEAD, and tracked dirt", async () => {
    const missingWrite = await createFixtureRepository();
    const missingWritePlan = await planSubjectPresetPromotion(missingWrite.candidatePath, {
      repositoryRoot: missingWrite.root,
    });
    await expect(promoteSubjectPresetTransactionally(missingWrite.candidatePath, {
      repositoryRoot: missingWrite.root,
      plan: missingWritePlan,
      write: false,
    })).rejects.toThrow("SUBJECT_PRESET_PROMOTION_WRITE_REQUIRED");

    const main = await createFixtureRepository();
    const mainPlan = await planSubjectPresetPromotion(main.candidatePath, {
      repositoryRoot: main.root,
    });
    await git(main.root, "branch", "-m", "main");
    await expect(promoteSubjectPresetTransactionally(main.candidatePath, {
      repositoryRoot: main.root,
      plan: mainPlan,
      write: true,
    })).rejects.toThrow("SUBJECT_PRESET_PROMOTION_MAIN_FORBIDDEN");

    const detached = await createFixtureRepository();
    const detachedPlan = await planSubjectPresetPromotion(detached.candidatePath, {
      repositoryRoot: detached.root,
    });
    await git(detached.root, "checkout", "--detach");
    await expect(promoteSubjectPresetTransactionally(detached.candidatePath, {
      repositoryRoot: detached.root,
      plan: detachedPlan,
      write: true,
    })).rejects.toThrow("SUBJECT_PRESET_PROMOTION_DETACHED_HEAD");

    const dirty = await createFixtureRepository();
    const dirtyPlan = await planSubjectPresetPromotion(dirty.candidatePath, {
      repositoryRoot: dirty.root,
    });
    await writeFile(
      path.join(dirty.root, "assets", "registry", "motion-profiles", "catalog.json"),
      "[]\n",
      "utf8",
    );
    await expect(promoteSubjectPresetTransactionally(dirty.candidatePath, {
      repositoryRoot: dirty.root,
      plan: dirtyPlan,
      write: true,
    })).rejects.toThrow("SUBJECT_PRESET_PROMOTION_DIRTY_WORKTREE");
  }, 20_000);

  it("rejects stale preimages and tampered plan hashes", async () => {
    const stale = await createFixtureRepository();
    const stalePlan = await planSubjectPresetPromotion(stale.candidatePath, {
      repositoryRoot: stale.root,
    });
    const catalogPath = path.join(
      stale.root,
      "assets",
      "registry",
      "control-feel-profiles",
      "catalog.json",
    );
    const catalog = await readFile(catalogPath, "utf8");
    await writeFile(catalogPath, `${catalog.trim()}\n\n`, "utf8");
    await git(stale.root, "add", "assets/registry/control-feel-profiles/catalog.json");
    await git(stale.root, "commit", "-m", "change preimage bytes");
    await expect(promoteSubjectPresetTransactionally(stale.candidatePath, {
      repositoryRoot: stale.root,
      plan: stalePlan,
      write: true,
    })).rejects.toThrow("SUBJECT_PRESET_PROMOTION_STALE_PREIMAGE");

    const tampered = await createFixtureRepository();
    const tamperedPlan = await planSubjectPresetPromotion(tampered.candidatePath, {
      repositoryRoot: tampered.root,
    });
    tamperedPlan.proposedSubjectDefinitionContentHash =
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    await expect(promoteSubjectPresetTransactionally(tampered.candidatePath, {
      repositoryRoot: tampered.root,
      plan: tamperedPlan,
      write: true,
    })).rejects.toThrow("SUBJECT_PRESET_PROMOTION_PLAN_HASH_MISMATCH");
  });

  it.each([
    "C:/outside/catalog.json",
    "C:\\outside\\catalog.json",
    "//server/share/catalog.json",
    "https://example.invalid/catalog.json",
    "../outside/catalog.json",
  ])("rejects unsafe target path %s", async (unsafePath) => {
    const fixture = await createFixtureRepository();
    const plan = await planSubjectPresetPromotion(fixture.candidatePath, {
      repositoryRoot: fixture.root,
    });
    plan.targets[0]!.logicalPath = unsafePath;
    const maliciousPlan = rehashPlan(plan);

    await expect(promoteSubjectPresetTransactionally(fixture.candidatePath, {
      repositoryRoot: fixture.root,
      plan: maliciousPlan,
      write: true,
    })).rejects.toThrow("SUBJECT_PRESET_PROMOTION_UNSAFE_TARGET");
  });

  it("rejects symlinked target ancestors", async () => {
    const fixture = await createFixtureRepository();
    const plan = await planSubjectPresetPromotion(fixture.candidatePath, {
      repositoryRoot: fixture.root,
    });
    const cameraDirectory = path.join(
      fixture.root,
      "assets",
      "registry",
      "camera-profiles",
    );
    const outsideDirectory = path.join(path.dirname(fixture.root), "outside-camera");
    await cp(cameraDirectory, outsideDirectory, { recursive: true });
    await rm(cameraDirectory, { recursive: true });
    await symlink(outsideDirectory, cameraDirectory, "junction");

    await expect(promoteSubjectPresetTransactionally(fixture.candidatePath, {
      repositoryRoot: fixture.root,
      plan,
      write: true,
    })).rejects.toThrow("SUBJECT_PRESET_PROMOTION_SYMLINK_TARGET");
  });

  it("rejects duplicate resource versions in proposed catalog bytes", async () => {
    const fixture = await createFixtureRepository();
    const plan = await planSubjectPresetPromotion(fixture.candidatePath, {
      repositoryRoot: fixture.root,
    });
    const controlFeelTarget = plan.targets.find((target) =>
      target.logicalPath === "assets/registry/control-feel-profiles/catalog.json"
    )!;
    const controlFeelCatalog = JSON.parse(
      Buffer.from(controlFeelTarget.canonicalBytesBase64, "base64").toString("utf8"),
    ) as unknown[];
    controlFeelCatalog.push(structuredClone(controlFeelCatalog.at(-1)!));
    const maliciousBytes = `${JSON.stringify(controlFeelCatalog)}\n`;
    controlFeelTarget.canonicalBytesBase64 = Buffer.from(maliciousBytes).toString("base64");
    controlFeelTarget.postimageSha256 = sha256Bytes(maliciousBytes);
    const maliciousPlan = rehashPlan(plan);

    await expect(promoteSubjectPresetTransactionally(fixture.candidatePath, {
      repositoryRoot: fixture.root,
      plan: maliciousPlan,
      write: true,
    })).rejects.toThrow("SUBJECT_PRESET_PROMOTION_VERSION_COLLISION");
  });

  it("rejects duplicate Camera resource versions in the structured Camera catalog", async () => {
    const fixture = await createFixtureRepository();
    const plan = await planSubjectPresetPromotion(fixture.candidatePath, {
      repositoryRoot: fixture.root,
    });
    const cameraTarget = plan.targets.find((target) =>
      target.logicalPath === "assets/registry/camera-profiles/catalog.json"
    )!;
    const cameraCatalog = JSON.parse(
      Buffer.from(cameraTarget.canonicalBytesBase64, "base64").toString("utf8"),
    ) as { profiles: unknown[] };
    cameraCatalog.profiles.push(structuredClone(cameraCatalog.profiles.at(-1)!));
    const maliciousBytes = `${JSON.stringify(cameraCatalog)}\n`;
    cameraTarget.canonicalBytesBase64 = Buffer.from(maliciousBytes).toString("base64");
    cameraTarget.postimageSha256 = sha256Bytes(maliciousBytes);
    const maliciousPlan = rehashPlan(plan);

    await expect(promoteSubjectPresetTransactionally(fixture.candidatePath, {
      repositoryRoot: fixture.root,
      plan: maliciousPlan,
      write: true,
    })).rejects.toThrow("SUBJECT_PRESET_PROMOTION_VERSION_COLLISION");
  });

  it("rolls back byte-identical preimages and removes new targets on failure", async () => {
    const fixture = await createFixtureRepository();
    const plan = await planSubjectPresetPromotion(fixture.candidatePath, {
      repositoryRoot: fixture.root,
    });
    const oldBytes = new Map<string, Buffer | undefined>();
    for (const target of plan.targets) {
      const targetPath = path.join(fixture.root, ...target.logicalPath.split("/"));
      oldBytes.set(
        target.logicalPath,
        target.preimageSha256 === null ? undefined : await readFile(targetPath),
      );
    }

    await expect(promoteSubjectPresetTransactionally(fixture.candidatePath, {
      repositoryRoot: fixture.root,
      plan,
      write: true,
      injectFailure(point) {
        if (
          point.phase === "before-publish-rename" &&
          point.logicalPath === "assets/registry/subject-definitions/catalog.json"
        ) {
          throw new Error("injected promotion failure");
        }
      },
    })).rejects.toThrow("injected promotion failure");

    for (const [logicalPath, bytes] of oldBytes) {
      const targetPath = path.join(fixture.root, ...logicalPath.split("/"));
      if (bytes === undefined) {
        await expect(lstat(targetPath)).rejects.toMatchObject({ code: "ENOENT" });
      } else {
        expect(await readFile(targetPath)).toEqual(bytes);
      }
    }
    expect(await git(fixture.root, "status", "--porcelain")).toBe("");
  });

  it("promotes every planned target on a clean feature branch", async () => {
    const fixture = await createFixtureRepository();
    const plan = await planSubjectPresetPromotion(fixture.candidatePath, {
      repositoryRoot: fixture.root,
    });

    const result = await promoteSubjectPresetTransactionally(fixture.candidatePath, {
      repositoryRoot: fixture.root,
      plan,
      write: true,
    });

    expect(result.planHash).toBe(plan.planHash);
    expect(result.writtenLogicalPaths).toEqual(plan.targets.map((target) => target.logicalPath));
    for (const target of plan.targets) {
      const bytes = await readFile(path.join(fixture.root, ...target.logicalPath.split("/")));
      expect(sha256Bytes(bytes)).toBe(target.postimageSha256);
    }
    const defaults = JSON.parse(await readFile(path.join(
      fixture.root,
      "assets",
      "registry",
      "subject-defaults",
      "catalog.json",
    ), "utf8")) as { defaults: Array<Record<string, unknown>> };
    expect(defaults.defaults).toContainEqual(expect.objectContaining({
      subjectDefinitionId: "animal.quadruped.forward-steer",
      subjectDefinitionRef:
        "worldkit://subject-definition/animal.quadruped.forward-steer@3",
    }));
  });
});
