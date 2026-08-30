import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  verifyRuntimeAuthorityBoundariesV1,
} from "./verify-runtime-authority-boundaries.js";

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

const POLICY = Object.freeze({
  schemaVersion: 1,
  protectedFacts: Object.freeze([Object.freeze({
    id: "jump-episode",
    ownerPackage: "@whitebox-world/character-movement",
    providerPackage: "@whitebox-world/runtime-babylon",
    forbiddenDeclaredIdentifiers: Object.freeze(["SplitJumpIntentV1"]),
    forbiddenPublicFieldNames: Object.freeze([
      "jumpPresentation",
      "smallJumpSequence",
      "jumpTakeoffDelaySeconds",
    ]),
    requiredSnapshotTypeName: "CharacterMovementSnapshotV1",
  })]),
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function repositoryWithFiles(
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "whitebox-runtime-authority-"));
  temporaryDirectories.push(repositoryRoot);
  await Promise.all(Object.entries(files).map(async ([relativePath, source]) => {
    const absolutePath = join(repositoryRoot, ...relativePath.split("/"));
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, source, "utf8");
  }));
  return repositoryRoot;
}

describe("runtime authority boundary verifier", () => {
  it.each([
    [
      "provider-owned split-jump class",
      "export class SplitJumpIntentV1 { private pending = false; }\n",
    ],
    [
      "presentation side-channel field",
      "export interface Projection { readonly jumpPresentation?: unknown; }\n",
    ],
    [
      "animation-owned split sequence field",
      "export interface AnimationSet { readonly smallJumpSequence?: unknown; }\n",
    ],
    [
      "animation-owned takeoff delay field",
      "export const bootstrap = { jumpTakeoffDelaySeconds: 0.9 };\n",
    ],
  ])("rejects %s", async (_label, providerSource) => {
    const repositoryRoot = await repositoryWithFiles({
      "packages/runtime-babylon/src/provider.ts": providerSource,
      "packages/character-movement/src/contracts.ts": [
        "export interface CharacterMovementSnapshotV1 {",
        "  readonly jumpEpisode?: JumpEpisodeStateV1;",
        "}",
        "export type JumpEpisodeStateV1 = Readonly<{ phase: 'airborne' }>;",
        "",
      ].join("\n"),
    });

    await expect(verifyRuntimeAuthorityBoundariesV1({
      repositoryRoot,
      policy: POLICY,
      sourceFilePaths: [
        "packages/character-movement/src/contracts.ts",
        "packages/runtime-babylon/src/provider.ts",
      ],
    })).rejects.toThrow("RUNTIME_AUTHORITY_SHADOW_OWNER");
  });

  it("accepts provider read-only use of the owner contract and ignores comments and strings", async () => {
    const repositoryRoot = await repositoryWithFiles({
      "packages/character-movement/src/contracts.ts": [
        "export type JumpEpisodeStateV1 = Readonly<{ phase: 'airborne' }>;",
        "export interface CharacterMovementSnapshotV1 {",
        "  readonly jumpEpisode?: JumpEpisodeStateV1;",
        "}",
        "",
      ].join("\n"),
      "packages/runtime-babylon/src/provider.ts": [
        "import type { JumpEpisodeStateV1 } from '@whitebox-world/character-movement';",
        "// SplitJumpIntentV1 and jumpPresentation are forbidden production declarations.",
        "export function projectJump(input: JumpEpisodeStateV1): string {",
        "  return input.phase === 'airborne' ? 'smallJumpSequence' : 'jumpTakeoffDelaySeconds';",
        "}",
        "",
      ].join("\n"),
    });

    await expect(verifyRuntimeAuthorityBoundariesV1({
      repositoryRoot,
      policy: POLICY,
      sourceFilePaths: [
        "packages/runtime-babylon/src/provider.ts",
        "packages/character-movement/src/contracts.ts",
      ],
    })).resolves.toEqual({
      schemaVersion: 1,
      policyHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      scannedFileCount: 2,
      protectedFactIds: ["jump-episode"],
      ok: true,
    });
  });

  it("rejects a provider import of an owner private module", async () => {
    const repositoryRoot = await repositoryWithFiles({
      "packages/character-movement/src/contracts.ts": [
        "export type JumpEpisodeStateV1 = Readonly<{ phase: 'airborne' }>;",
        "export interface CharacterMovementSnapshotV1 {",
        "  readonly jumpEpisode?: JumpEpisodeStateV1;",
        "}",
        "",
      ].join("\n"),
      "packages/runtime-babylon/src/provider.ts": [
        "import type { JumpEpisodeStateV1 } from '@whitebox-world/character-movement/src/contracts.js';",
        "export const projectJump = (episode: JumpEpisodeStateV1): string => episode.phase;",
        "",
      ].join("\n"),
    });

    await expect(verifyRuntimeAuthorityBoundariesV1({
      repositoryRoot,
      policy: POLICY,
      sourceFilePaths: [
        "packages/runtime-babylon/src/provider.ts",
        "packages/character-movement/src/contracts.ts",
      ],
    })).rejects.toThrow("RUNTIME_AUTHORITY_PRIVATE_OWNER_IMPORT");
  });

  it("rejects malformed duplicate fact and field policy before scanning source", async () => {
    const repositoryRoot = await repositoryWithFiles({
      "packages/runtime-babylon/src/provider.ts": "export const value = 1;\n",
    });
    const duplicate = {
      ...POLICY,
      protectedFacts: [
        POLICY.protectedFacts[0],
        {
          ...POLICY.protectedFacts[0],
          forbiddenPublicFieldNames: ["jumpPresentation", "jumpPresentation"],
        },
      ],
    };

    await expect(verifyRuntimeAuthorityBoundariesV1({
      repositoryRoot,
      policy: duplicate,
      sourceFilePaths: ["packages/runtime-babylon/src/provider.ts"],
    })).rejects.toThrow("RUNTIME_AUTHORITY_POLICY_INVALID");
  });

  it("rejects a protected fact whose owner does not publish the required snapshot type", async () => {
    const repositoryRoot = await repositoryWithFiles({
      "packages/character-movement/src/contracts.ts":
        "export type JumpEpisodeStateV1 = Readonly<{ phase: 'airborne' }>;\n",
      "packages/runtime-babylon/src/provider.ts":
        "export const projectJump = (phase: string): string => phase;\n",
    });

    await expect(verifyRuntimeAuthorityBoundariesV1({
      repositoryRoot,
      policy: POLICY,
      sourceFilePaths: [
        "packages/character-movement/src/contracts.ts",
        "packages/runtime-babylon/src/provider.ts",
      ],
    })).rejects.toThrow("RUNTIME_AUTHORITY_SNAPSHOT_COVERAGE_MISSING");
  });

  it("rejects a forbidden public field published by a JSON schema or manifest", async () => {
    const repositoryRoot = await repositoryWithFiles({
      "packages/character-movement/src/contracts.ts": [
        "export type JumpEpisodeStateV1 = Readonly<{ phase: 'airborne' }>;",
        "export interface CharacterMovementSnapshotV1 {",
        "  readonly jumpEpisode?: JumpEpisodeStateV1;",
        "}",
        "",
      ].join("\n"),
      "packages/runtime-contracts/src/runtime.schema.json": JSON.stringify({
        type: "object",
        properties: { smallJumpSequence: { type: "object" } },
      }),
    });

    await expect(verifyRuntimeAuthorityBoundariesV1({
      repositoryRoot,
      policy: POLICY,
      sourceFilePaths: [
        "packages/character-movement/src/contracts.ts",
        "packages/runtime-contracts/src/runtime.schema.json",
      ],
    })).rejects.toThrow("RUNTIME_AUTHORITY_SHADOW_OWNER");
  });

  it("discovers tracked and untracked production files when paths are not supplied", async () => {
    const repositoryRoot = await repositoryWithFiles({
      "packages/character-movement/src/contracts.ts": [
        "export type JumpEpisodeStateV1 = Readonly<{ phase: 'airborne' }>;",
        "export interface CharacterMovementSnapshotV1 {",
        "  readonly jumpEpisode?: JumpEpisodeStateV1;",
        "}",
        "",
      ].join("\n"),
      "packages/runtime-babylon/src/provider.ts":
        "export interface ProviderState { readonly jumpPresentation?: unknown; }\n",
    });
    await execFileAsync("git", ["init", "--quiet"], { cwd: repositoryRoot });
    await execFileAsync("git", ["add", "packages/character-movement/src/contracts.ts"], {
      cwd: repositoryRoot,
    });

    await expect(verifyRuntimeAuthorityBoundariesV1({
      repositoryRoot,
      policy: POLICY,
    })).rejects.toThrow("RUNTIME_AUTHORITY_SHADOW_OWNER");
  });
});
