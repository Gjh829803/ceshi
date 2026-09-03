import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  diversionDiffContainsChangesV1,
  priorTextFromDiversionDiffV1,
  readGitPriorLedgerV1,
  verify3cMigrationV1,
  verifySingleAuthorityStructureV1,
} from "./verify-3c-migration.js";

const execFileAsync = promisify(execFile);

function token(parts: readonly string[]): string {
  return parts.join("");
}

const temporaryDirectories: string[] = [];
const BASELINE_COMMIT = "6d9e0304016448231ca05aa2f20e4b6ef7e7bd88";
const SOURCE_POLICY = {
  executableExtensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
  excludedPathPrefixes: [
    ".git/", ".diversion/", "node_modules/", "docs/", "config/", ".superpowers/", "artifacts/",
    "apps/playground/dist/",
    "scripts/verification/verify-3c-migration.ts",
  ],
  excludedFileSuffixes: [
    ".test.ts", ".test.tsx", ".test.mts", ".test.cts", ".test.js", ".test.jsx",
    ".test.mjs", ".test.cjs", ".spec.ts", ".spec.tsx", ".d.ts", ".d.mts",
  ],
} as const;

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function repositoryWithSource(source: string, relativePath = "packages/runtime-babylon/src/legacy.ts") {
  const root = await mkdtemp(join(tmpdir(), "whitebox-3c-ledger-"));
  temporaryDirectories.push(root);
  const file = join(root, ...relativePath.split("/"));
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, source, "utf8");
  return root;
}

async function writeRepositoryFile(root: string, relativePath: string, content: string) {
  const file = join(root, ...relativePath.split("/"));
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, content, "utf8");
}

async function singleAuthorityRepository(): Promise<string> {
  const root = await repositoryWithSource(
    "export interface GameplayWorldPortV1 { prepareFixedInputTick(input: FixedInputOneTickV1): Promise<GameplayWorldTransactionV1> }\n",
    "packages/runtime-host/src/gameplay-world-port.ts",
  );
  await Promise.all([
    writeRepositoryFile(
      root,
      "packages/runtime-babylon/src/gameplay-runtime-internal.ts",
      "export interface BabylonGameplayRuntimeInternalV1 { prepareFixedInputTick(input: FixedInputOneTickV1): Promise<PreparedBabylonGameplayFixedInputTickV1> }\n",
    ),
    writeRepositoryFile(
      root,
      "packages/runtime-host/src/world-session.ts",
      "await this.options.worldPort.prepareFixedInputTick(input, actionProjection);\n",
    ),
    writeRepositoryFile(
      root,
      "packages/gameplay-contracts/src/gameplay-contracts.ts",
      [
        'readonly kind: "locomotion-capability-state-v2";',
        "export type GameplayCapabilityStateV1 = LocomotionCapabilityStateEnvelopeV2;",
      ].join("\n"),
    ),
    writeRepositoryFile(
      root,
      "packages/runtime-babylon/src/character-movement-component.ts",
      "supportsCharacterMovementSubjectV1(subject); 3C_PLANAR_MOVEMENT_OWNER_DUPLICATE;\n",
    ),
    writeRepositoryFile(
      root,
      "packages/runtime-babylon/src/runtime-projection.ts",
      [
        'movementOwner: "character-movement";',
        'movementOwner: "specialized-motion";',
        "locomotion?: never;",
      ].join("\n"),
    ),
    writeRepositoryFile(root, "packages/authoring/src/index.ts", "export {};\n"),
    writeRepositoryFile(
      root,
      "packages/authoring/package.json",
      '{"exports":{"./schema": "./src/authoring-spec-v4.schema.json"}}\n',
    ),
  ]);
  return root;
}

function ledger(entryOverrides: Record<string, unknown> = {}, rootOverrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    baselineCommit: BASELINE_COMMIT,
    sourcePolicy: SOURCE_POLICY,
    entries: [{
      id: token(["3C-", "legacy", "-motion", "-kernel-runtime"]),
      legacySymbol: "MotionKernelRuntimeV1",
      legacyModulePaths: ["packages/runtime-babylon/src/motion-kernel-runtime"],
      targetOwner: "@whitebox-world/character-movement",
      dependsOn: [],
      deletionCondition: "Golden runtime no longer constructs the legacy Motion Kernel.",
      state: "live",
      baselineSourceReferenceCount: 6,
      currentSourceReferenceCeiling: 1,
      evidence: [],
      ...entryOverrides,
    }],
    ...rootOverrides,
  };
}

describe("Diversion prior-ledger reconstruction", () => {
  it("treats Diversion's clean-workspace sentinel as no diff", () => {
    expect(diversionDiffContainsChangesV1("")).toBe(false);
    expect(diversionDiffContainsChangesV1("No changes detected\r\n")).toBe(false);
    expect(diversionDiffContainsChangesV1("diff --git a/file b/file\n")).toBe(true);
  });

  it("reverses a unified diff against the current ledger text", () => {
    const current = "{\n  \"ceiling\": 1,\n  \"evidence\": [\"baseline\", \"reduced\"]\n}\n";
    const diff = [
      "diff --git a/config/3c-migration-ledger.json b/config/3c-migration-ledger.json",
      "--- a/config/3c-migration-ledger.json",
      "+++ b/config/3c-migration-ledger.json",
      "@@ -1,4 +1,4 @@",
      " {",
      "-  \"ceiling\": 2,",
      "-  \"evidence\": [\"baseline\"]",
      "+  \"ceiling\": 1,",
      "+  \"evidence\": [\"baseline\", \"reduced\"]",
      " }",
      "",
    ].join("\n");
    expect(priorTextFromDiversionDiffV1(current, diff)).toBe(
      "{\n  \"ceiling\": 2,\n  \"evidence\": [\"baseline\"]\n}\n",
    );
  });

  it("identifies a Diversion genesis add without inventing a prior ledger", () => {
    expect(priorTextFromDiversionDiffV1("{}\n", [
      "diff --git a/config/3c-migration-ledger.json b/config/3c-migration-ledger.json",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/config/3c-migration-ledger.json",
    ].join("\n"))).toBeUndefined();
  });
});

describe("3C migration ledger verifier", () => {
  it("accepts the fixed-input, movement, locomotion, and public-entry single-authority structure", async () => {
    const root = await singleAuthorityRepository();
    await expect(verifySingleAuthorityStructureV1(root)).resolves.toHaveLength(8);
  });

  it.each([
    {
      label: "RuntimeHost mutating fixed-input fallback",
      path: "packages/runtime-host/src/gameplay-world-port.ts",
      source: "prepareFixedInputTick(): void; runFixedInputTick(): void;\n",
    },
    {
      label: "provider mutating fixed-input fallback",
      path: "packages/runtime-babylon/src/gameplay-runtime-internal.ts",
      source: "prepareFixedInputTick(): void; runFixedInputTick(): void;\n",
    },
    {
      label: "renamed direct fixed-input mutation beside the transaction",
      path: "packages/runtime-host/src/gameplay-world-port.ts",
      source: [
        "export interface GameplayWorldPortV1 {",
        "prepareFixedInputTick(input: FixedInputOneTickV1): Promise<GameplayWorldTransactionV1>;",
        "advanceFixedInputTickDirectly(input: FixedInputOneTickV1): Promise<void>;",
        "}",
      ].join("\n"),
    },
    {
      label: "flat Locomotion V1 envelope",
      path: "packages/gameplay-contracts/src/gameplay-contracts.ts",
      source: [
        'readonly kind: "locomotion-capability-state-v2";',
        "interface LocomotionCapabilityStateV1 {}",
        "export type GameplayCapabilityStateV1 = LocomotionCapabilityStateEnvelopeV2;",
      ].join("\n"),
    },
    {
      label: "second planar motion sampler",
      path: "packages/runtime-babylon/src/character-movement-component.ts",
      source: [
        "supportsCharacterMovementSubjectV1(subject);",
        "3C_PLANAR_MOVEMENT_OWNER_DUPLICATE;",
        "sampleMotion();",
      ].join("\n"),
    },
    {
      label: "projection without specialized owner discriminator",
      path: "packages/runtime-babylon/src/runtime-projection.ts",
      source: 'movementOwner: "character-movement";\nlocomotion?: never;\n',
    },
    {
      label: "Authoring canonical JSON re-export",
      path: "packages/authoring/src/index.ts",
      source: 'export * from "./canonical-json";\n',
    },
    {
      label: "duplicate Authoring schema subpath",
      path: "packages/authoring/package.json",
      source: JSON.stringify({
        exports: {
          "./schema": "./src/authoring-spec-v4.schema.json",
          "./schema-v4": "./src/authoring-spec-v4.schema.json",
        },
      }),
    },
  ])("rejects $label", async ({ path, source }) => {
    const root = await singleAuthorityRepository();
    await writeRepositoryFile(root, path, source);
    await expect(verifySingleAuthorityStructureV1(root)).rejects.toThrow(
      /^SINGLE_AUTHORITY_STRUCTURE_(?:FORBIDDEN|REQUIRED_MISSING)/,
    );
  });

  it.each([
    ["unknown root key", { ...ledger(), generatedAt: "now" }],
    ["missing deletion condition", ledger({ deletionCondition: undefined })],
    ["fractional baseline", ledger({ baselineSourceReferenceCount: 1.5 })],
    ["ceiling above baseline", ledger({ currentSourceReferenceCeiling: 7 })],
    ["duplicate dependencies", ledger({ dependsOn: ["3C-1", "3C-1"] })],
    ["sparse ledger entries", ledger({}, { entries: new Array(1) })],
    ["extra-key module paths", ledger({ legacyModulePaths: Object.assign([], { provider: true }) })],
  ])("rejects malformed ledger: %s", async (_label, input) => {
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n");
    await expect(verify3cMigrationV1({ repositoryRoot: root, ledger: input, allowGenesis: true }))
      .rejects.toThrow("3C_MIGRATION_LEDGER_INVALID");
  });

  it("rejects 6 -> 2 -> 3, a raised ceiling, and count restoration", async () => {
    const root = await repositoryWithSource(
      "MotionKernelRuntimeV1; MotionKernelRuntimeV1; MotionKernelRuntimeV1;\n",
    );
    const prior = ledger({ currentSourceReferenceCeiling: 2 });
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ currentSourceReferenceCeiling: 3 }),
      priorLedger: prior,
    })).rejects.toThrow("3C_MIGRATION_REFERENCE_COUNT_INCREASED");
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ currentSourceReferenceCeiling: 2 }),
      priorLedger: prior,
    })).rejects.toThrow("3C_MIGRATION_REFERENCE_COUNT_INCREASED");
  });

  it("rejects baseline count mutation against the accepted prior ledger", async () => {
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n");
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ baselineSourceReferenceCount: 7, currentSourceReferenceCeiling: 1 }),
      priorLedger: ledger(),
    })).rejects.toThrow("3C_MIGRATION_BASELINE_MUTATED");
  });

  it.each([
    ["sites/legacy.mts", "export class MotionKernelRuntimeV1 {}\n"],
    ["templates/legacy.cjs", "module.exports = MotionKernelRuntimeV1;\n"],
    ["other/legacy.jsx", "export const x = <MotionKernelRuntimeV1 />;\n"],
  ])("counts moved executable source %s from any repository root", async (relativePath, source) => {
    const root = await repositoryWithSource(source, relativePath);
    await expect(verify3cMigrationV1({ repositoryRoot: root, ledger: ledger(), allowGenesis: true }))
      .resolves.toMatchObject({ entries: [{ liveSourceReferenceCount: 1 }] });
  });

  it("rejects completion while the legacy module path remains under an alias", async () => {
    const root = await repositoryWithSource(
      "export class RenamedMovementFacade {}\n",
      "packages/runtime-babylon/src/motion-kernel-runtime.mts",
    );
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ state: "completed", currentSourceReferenceCeiling: 0, evidence: ["task-7"] }),
      allowGenesis: true,
    })).rejects.toThrow("3C_MIGRATION_COMPLETED_MODULE_LIVE");
  });

  it("rejects a required Golden authority omitted from the ledger", async () => {
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n");
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger(),
      requiredLegacySymbols: ["MotionKernelRuntimeV1", "MotionKernelSnapshotV1"],
      allowGenesis: true,
    })).rejects.toThrow("3C_MIGRATION_LEDGER_INCOMPLETE");
  });

  it("reports exact measured counts for a valid current ceiling", async () => {
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n");
    await expect(verify3cMigrationV1({ repositoryRoot: root, ledger: ledger(), allowGenesis: true }))
      .resolves.toEqual({
        baselineCommit: BASELINE_COMMIT,
        entries: [{
          id: token(["3C-", "legacy", "-motion", "-kernel-runtime"]),
          legacySymbol: "MotionKernelRuntimeV1",
          baselineSourceReferenceCount: 6,
          currentSourceReferenceCeiling: 1,
          liveSourceReferenceCount: 1,
          state: "live",
        }],
      });
  });

  it("ignores tracked inventory entries deleted from the working tree", async () => {
    const relativePath = "packages/runtime-babylon/src/legacy.ts";
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n", relativePath);
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger(),
      sourceFilePaths: [relativePath, "packages/runtime-contracts/src/deleted.ts"],
      allowGenesis: true,
    })).resolves.toMatchObject({ entries: [{ liveSourceReferenceCount: 1 }] });
  });

  it("requires an accepted schema-2 prior unless genesis is explicit", async () => {
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n");
    await expect(verify3cMigrationV1({ repositoryRoot: root, ledger: ledger() }))
      .rejects.toThrow("3C_MIGRATION_PRIOR_REQUIRED");
    await expect(verify3cMigrationV1({ repositoryRoot: root, ledger: ledger(), allowGenesis: true }))
      .resolves.toMatchObject({ entries: [{ liveSourceReferenceCount: 1 }] });
  });

  it("freezes the exact prior entry identity set", async () => {
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n");
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({}, { entries: [] }),
      priorLedger: ledger(),
    })).rejects.toThrow("3C_MIGRATION_ENTRY_SET_CHANGED");
    const extraEntry = {
      id: "3C-extra-authority",
      legacySymbol: "OtherLegacyAuthorityV1",
      legacyModulePaths: [],
      targetOwner: "@whitebox-world/character-movement",
      dependsOn: [],
      deletionCondition: "The extra authority is removed.",
      state: "live",
      baselineSourceReferenceCount: 0,
      currentSourceReferenceCeiling: 0,
      evidence: [],
    };
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({}, { entries: [ledger().entries[0], extraEntry] }),
      priorLedger: ledger(),
    })).rejects.toThrow("3C_MIGRATION_ENTRY_SET_CHANGED");
  });

  it.each([
    ["module path", { legacyModulePaths: [] }],
    ["owner", { targetOwner: "@whitebox-world/runtime-host" }],
    ["dependencies", { dependsOn: ["3C-other"] }],
    ["condition", { deletionCondition: "weakened" }],
    ["id", { id: "3C-renamed-authority" }],
  ])("rejects frozen metadata mutation: %s", async (_label, currentOverrides) => {
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n");
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger(currentOverrides),
      priorLedger: ledger(),
    })).rejects.toThrow("3C_MIGRATION_METADATA_MUTATED");
  });

  it("rejects completed-state regression and evidence replacement", async () => {
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n");
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ state: "live", evidence: ["accepted", "current"] }),
      priorLedger: ledger({ state: "completed", evidence: ["accepted"] }),
    })).rejects.toThrow("3C_MIGRATION_STATE_REGRESSED");
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ evidence: ["replacement"] }),
      priorLedger: ledger({ evidence: ["accepted"] }),
    })).rejects.toThrow("3C_MIGRATION_EVIDENCE_REPLACED");
  });

  it("rejects duplicate evidence strings in every ledger state", async () => {
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n");
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ evidence: ["same receipt", "same receipt"] }),
      allowGenesis: true,
    })).rejects.toThrow("3C_MIGRATION_EVIDENCE_DUPLICATED");
  });

  it.each([
    ["live", "completed"],
    ["migrating", "completed"],
    ["live", "migrating"],
  ])("requires newly appended evidence when state advances %s -> %s", async (priorState, currentState) => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({
        state: currentState,
        currentSourceReferenceCeiling: 0,
        evidence: ["6d9e030 baseline census"],
      }),
      priorLedger: ledger({
        state: priorState,
        currentSourceReferenceCeiling: 1,
        evidence: ["6d9e030 baseline census"],
      }),
    })).rejects.toThrow("3C_MIGRATION_EVIDENCE_REQUIRED");
  });

  it.each([
    ["baseline-only", [], ["6d9e030 baseline census"]],
    ["genesis-only", ["6d9e030 baseline census"], ["6d9e030 baseline census", "e3ce412 schema-2 genesis"]],
    ["arbitrary text", ["6d9e030 baseline census"], ["6d9e030 baseline census", "task 7 is complete"]],
  ])("rejects completed transition with %s evidence", async (_label, priorEvidence, currentEvidence) => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ state: "completed", currentSourceReferenceCeiling: 0, evidence: currentEvidence }),
      priorLedger: ledger({ state: "live", currentSourceReferenceCeiling: 1, evidence: priorEvidence }),
    })).rejects.toThrow("3C_MIGRATION_COMPLETION_EVIDENCE_INVALID");
  });

  it.each([
    ["empty command", "completion:v1|command=|artifact=docs/reviews/task-7.txt"],
    ["newline command", "completion:v1|command=node verify\nall|artifact=docs/reviews/task-7.txt"],
    ["pipe command", "completion:v1|command=node|verify|artifact=docs/reviews/task-7.txt"],
    ["backslash path", "completion:v1|command=node verify|artifact=docs\\reviews\\task-7.txt"],
    ["parent path", "completion:v1|command=node verify|artifact=docs/reviews/../task-7.txt"],
    ["absolute POSIX path", "completion:v1|command=node verify|artifact=/docs/reviews/task-7.txt"],
    ["absolute Windows path", "completion:v1|command=node verify|artifact=C:/docs/reviews/task-7.txt"],
    ["unapproved root", "completion:v1|command=node verify|artifact=tmp/task-7.txt"],
    ["non-normal path", "completion:v1|command=node verify|artifact=docs/reviews//task-7.txt"],
  ])("rejects malformed completion evidence: %s", async (_label, completionEvidence) => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ state: "completed", currentSourceReferenceCeiling: 0, evidence: [completionEvidence] }),
      priorLedger: ledger({ state: "live", currentSourceReferenceCeiling: 1, evidence: [] }),
    })).rejects.toThrow("3C_MIGRATION_COMPLETION_EVIDENCE_INVALID");
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
  ])("rejects %s completion evidence artifact", async (_label, artifactContent) => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    if (artifactContent !== undefined) await writeRepositoryFile(root, "docs/reviews/task-7.txt", artifactContent);
    const completionEvidence = "completion:v1|command=node verify|artifact=docs/reviews/task-7.txt";
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ state: "completed", currentSourceReferenceCeiling: 0, evidence: [completionEvidence] }),
      priorLedger: ledger({ state: "live", currentSourceReferenceCeiling: 1, evidence: [] }),
    })).rejects.toThrow("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID");
  });

  it("accepts a new strict completion record backed by a non-empty repository artifact", async () => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await writeRepositoryFile(root, "docs/reviews/task-7.txt", "Task 7 verification passed.\n");
    const completionEvidence =
      "completion:v1|command=node.exe scripts/verification/verify-3c-migration.ts|artifact=docs/reviews/task-7.txt";
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({
        state: "completed",
        currentSourceReferenceCeiling: 0,
        evidence: ["6d9e030 baseline census", completionEvidence],
      }),
      priorLedger: ledger({
        state: "live",
        currentSourceReferenceCeiling: 1,
        evidence: ["6d9e030 baseline census"],
      }),
    })).resolves.toMatchObject({ entries: [{ state: "completed", liveSourceReferenceCount: 0 }] });
  });

  it("rejects an exact prior completion record appended again", async () => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await writeRepositoryFile(root, "docs/reviews/task-7.txt", "Task 7 verification passed.\n");
    const completionEvidence =
      "completion:v1|command=node.exe verify-old|artifact=docs/reviews/task-7.txt";
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({
        state: "completed",
        currentSourceReferenceCeiling: 0,
        evidence: [completionEvidence, completionEvidence],
      }),
      priorLedger: ledger({
        state: "migrating",
        currentSourceReferenceCeiling: 1,
        evidence: [completionEvidence],
      }),
    })).rejects.toThrow("3C_MIGRATION_EVIDENCE_DUPLICATED");
  });

  it("rejects a changed command that reuses a prior completion artifact", async () => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await writeRepositoryFile(root, "docs/reviews/task-7.txt", "Task 7 verification passed.\n");
    const priorCompletion =
      "completion:v1|command=node.exe verify-old|artifact=docs/reviews/task-7.txt";
    const currentCompletion =
      "completion:v1|command=node.exe verify-new|artifact=docs/reviews/task-7.txt";
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({
        state: "completed",
        currentSourceReferenceCeiling: 0,
        evidence: [priorCompletion, currentCompletion],
      }),
      priorLedger: ledger({
        state: "migrating",
        currentSourceReferenceCeiling: 1,
        evidence: [priorCompletion],
      }),
    })).rejects.toThrow("3C_MIGRATION_COMPLETION_EVIDENCE_REUSED");
  });

  it.runIf(process.platform === "win32")("rejects a case-mismatched completion artifact filename", async () => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await writeRepositoryFile(root, "docs/reviews/Task-7.txt", "Task 7 verification passed.\n");
    const completionEvidence =
      "completion:v1|command=node.exe verify|artifact=docs/reviews/task-7.txt";
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ state: "completed", currentSourceReferenceCeiling: 0, evidence: [completionEvidence] }),
      priorLedger: ledger({ state: "migrating", currentSourceReferenceCeiling: 1, evidence: [] }),
    })).rejects.toThrow("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID");
  });

  it.runIf(process.platform === "win32")("rejects case mismatch in a nested artifact parent", async () => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await writeRepositoryFile(root, "docs/reviews/Nested/task-7.txt", "Task 7 verification passed.\n");
    const completionEvidence =
      "completion:v1|command=node.exe verify|artifact=docs/reviews/nested/task-7.txt";
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ state: "completed", currentSourceReferenceCeiling: 0, evidence: [completionEvidence] }),
      priorLedger: ledger({ state: "migrating", currentSourceReferenceCeiling: 1, evidence: [] }),
    })).rejects.toThrow("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID");
  });

  it.runIf(process.platform === "win32")("rejects case-variant reuse of a prior physical artifact", async () => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await writeRepositoryFile(root, "docs/reviews/Task-7.txt", "Task 7 verification passed.\n");
    const priorCompletion =
      "completion:v1|command=node.exe verify-old|artifact=docs/reviews/Task-7.txt";
    const currentCompletion =
      "completion:v1|command=node.exe verify-new|artifact=docs/reviews/task-7.txt";
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({
        state: "completed",
        currentSourceReferenceCeiling: 0,
        evidence: [priorCompletion, currentCompletion],
      }),
      priorLedger: ledger({
        state: "migrating",
        currentSourceReferenceCeiling: 1,
        evidence: [priorCompletion],
      }),
    })).rejects.toThrow("3C_MIGRATION_COMPLETION_EVIDENCE_REUSED");
  });

  it("accepts the canonical physical spelling of a completion artifact", async () => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await writeRepositoryFile(root, "docs/reviews/Task-7.txt", "Task 7 verification passed.\n");
    const completionEvidence =
      "completion:v1|command=node.exe verify|artifact=docs/reviews/Task-7.txt";
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ state: "completed", currentSourceReferenceCeiling: 0, evidence: [completionEvidence] }),
      priorLedger: ledger({ state: "migrating", currentSourceReferenceCeiling: 1, evidence: [] }),
    })).resolves.toMatchObject({ entries: [{ state: "completed", liveSourceReferenceCount: 0 }] });
  });

  it.runIf(process.platform !== "win32")("rejects a completion artifact that is a symbolic-link file", async () => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await writeRepositoryFile(root, "docs/reviews/actual.txt", "Unrelated prior review.\n");
    await symlink("actual.txt", join(root, "docs", "reviews", "linked.txt"), "file");
    const completionEvidence =
      "completion:v1|command=node.exe verify|artifact=docs/reviews/linked.txt";
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ state: "completed", currentSourceReferenceCeiling: 0, evidence: [completionEvidence] }),
      priorLedger: ledger({ state: "migrating", currentSourceReferenceCeiling: 1, evidence: [] }),
    })).rejects.toThrow("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID");
  });

  it("rejects a completion artifact reached through a symlink or junction directory", async () => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await writeRepositoryFile(root, "unrelated/report.txt", "Unrelated in-repository report.\n");
    const link = join(root, "docs", "reviews", "linked-directory");
    await mkdir(join(root, "docs", "reviews"), { recursive: true });
    await symlink(
      join(root, "unrelated"),
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    const completionEvidence =
      "completion:v1|command=node.exe verify|artifact=docs/reviews/linked-directory/report.txt";
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ state: "completed", currentSourceReferenceCeiling: 0, evidence: [completionEvidence] }),
      priorLedger: ledger({ state: "migrating", currentSourceReferenceCeiling: 1, evidence: [] }),
    })).rejects.toThrow("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID");
  });

  it("rejects a docs parent junction that supplies the approved reviews root", async () => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await writeRepositoryFile(root, "unrelated/reviews/report.txt", "Unrelated in-repository report.\n");
    await symlink(
      join(root, "unrelated"),
      join(root, "docs"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const completionEvidence =
      "completion:v1|command=node.exe verify|artifact=docs/reviews/report.txt";
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ state: "completed", currentSourceReferenceCeiling: 0, evidence: [completionEvidence] }),
      priorLedger: ledger({ state: "migrating", currentSourceReferenceCeiling: 1, evidence: [] }),
    })).rejects.toThrow("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID");
  });

  it("rejects an artifacts approved-root junction", async () => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await writeRepositoryFile(root, "unrelated/report.txt", "Unrelated in-repository report.\n");
    await symlink(
      join(root, "unrelated"),
      join(root, "artifacts"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const completionEvidence =
      "completion:v1|command=node.exe verify|artifact=artifacts/report.txt";
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ state: "completed", currentSourceReferenceCeiling: 0, evidence: [completionEvidence] }),
      priorLedger: ledger({ state: "migrating", currentSourceReferenceCeiling: 1, evidence: [] }),
    })).rejects.toThrow("3C_MIGRATION_COMPLETION_ARTIFACT_INVALID");
  });

  it.each([
    "docs/reviews/nested/task-7.txt",
    "artifacts/nested/task-7.txt",
  ])("accepts an ordinary nested completion artifact at %s", async (artifact) => {
    const root = await repositoryWithSource("export const migrated = true;\n");
    await writeRepositoryFile(root, artifact, "Task 7 verification passed.\n");
    const completionEvidence = `completion:v1|command=node.exe verify|artifact=${artifact}`;
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ state: "completed", currentSourceReferenceCeiling: 0, evidence: [completionEvidence] }),
      priorLedger: ledger({ state: "migrating", currentSourceReferenceCeiling: 1, evidence: [] }),
    })).resolves.toMatchObject({ entries: [{ state: "completed", liveSourceReferenceCount: 0 }] });
  });

  it("requires appended evidence when the current ceiling decreases", async () => {
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n");
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ currentSourceReferenceCeiling: 1, evidence: ["baseline"] }),
      priorLedger: ledger({ currentSourceReferenceCeiling: 2, evidence: ["baseline"] }),
    })).rejects.toThrow("3C_MIGRATION_EVIDENCE_REQUIRED");
    await expect(verify3cMigrationV1({
      repositoryRoot: root,
      ledger: ledger({ currentSourceReferenceCeiling: 1, evidence: ["baseline", "reduced by task 2"] }),
      priorLedger: ledger({ currentSourceReferenceCeiling: 2, evidence: ["baseline"] }),
    })).resolves.toMatchObject({ entries: [{ currentSourceReferenceCeiling: 1 }] });
  });
});

async function git(root: string, args: readonly string[]): Promise<string> {
  return (await execFileAsync("git", [...args], {
    cwd: root,
    encoding: "utf8",
  })).stdout;
}

async function initializeGitRepository(root: string): Promise<void> {
  await git(root, ["init", "-b", "main"]);
  await git(root, ["config", "user.email", "3c-test@example.com"]);
  await git(root, ["config", "user.name", "3C Test"]);
}

async function commitAll(root: string, message: string): Promise<void> {
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", message]);
}

describe("git prior-ledger resolution", () => {
  it("reads a merge's ledger-bearing parent instead of resetting genesis", async () => {
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n");
    await initializeGitRepository(root);
    await writeRepositoryFile(root, "README", "base\n");
    await commitAll(root, "base without ledger");
    await git(root, ["checkout", "-b", "feature"]);
    const ledgerText = `${JSON.stringify(ledger(), null, 2)}\n`;
    await writeRepositoryFile(root, "config/3c-migration-ledger.json", ledgerText);
    await commitAll(root, "add ledger");
    await git(root, ["checkout", "main"]);
    await git(root, ["merge", "--no-ff", "-m", "merge feature", "feature"]);
    await expect(readGitPriorLedgerV1(root, ledgerText)).resolves.toEqual({
      prior: ledger(),
      allowGenesis: false,
    });
  }, 60_000);

  it("reads the first-parent schema-2 ledger as prior", async () => {
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n");
    await initializeGitRepository(root);
    const priorLedger = ledger({ currentSourceReferenceCeiling: 1 });
    const currentLedger = ledger({
      currentSourceReferenceCeiling: 1,
      evidence: ["baseline"],
    });
    await writeRepositoryFile(
      root,
      "config/3c-migration-ledger.json",
      `${JSON.stringify(priorLedger, null, 2)}\n`,
    );
    await commitAll(root, "prior ledger");
    const currentText = `${JSON.stringify(currentLedger, null, 2)}\n`;
    await writeRepositoryFile(root, "config/3c-migration-ledger.json", currentText);
    await commitAll(root, "current ledger");
    await expect(readGitPriorLedgerV1(root, currentText)).resolves.toEqual({
      prior: priorLedger,
      allowGenesis: false,
    });
  }, 60_000);

  it("uses HEAD as prior when the working tree ledger differs", async () => {
    const root = await repositoryWithSource("export class MotionKernelRuntimeV1 {}\n");
    await initializeGitRepository(root);
    const headLedger = ledger({ currentSourceReferenceCeiling: 1 });
    const workingLedger = ledger({
      currentSourceReferenceCeiling: 1,
      evidence: ["working tree"],
    });
    await writeRepositoryFile(
      root,
      "config/3c-migration-ledger.json",
      `${JSON.stringify(headLedger, null, 2)}\n`,
    );
    await commitAll(root, "HEAD ledger");
    await expect(readGitPriorLedgerV1(
      root,
      `${JSON.stringify(workingLedger, null, 2)}\n`,
    )).resolves.toEqual({
      prior: headLedger,
      allowGenesis: false,
    });
  }, 60_000);
});
