import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { resolveFormalWorldCaptureSdkOwnerIdentitiesV1 } from "./sdk-owner-identities";

const SOURCE_COMMIT_A = "0123456789abcdef0123456789abcdef01234567";
const SOURCE_COMMIT_B = "89abcdef0123456789abcdef0123456789abcdef";
const execFile = promisify(execFileCallback);

async function createCommittedRepository(): Promise<Readonly<{
  root: string;
  trackedPath: string;
}>> {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-sdk-owner-identities-"));
  const trackedPath = path.join(root, "runtime-source.ts");
  await execFile("git", ["init", "--quiet", root]);
  await execFile("git", ["-C", root, "config", "user.email", "worldkit@example.invalid"]);
  await execFile("git", ["-C", root, "config", "user.name", "WorldKit Test"]);
  await writeFile(trackedPath, "export const runtimeSource = true;\n", "utf8");
  await execFile("git", ["-C", root, "add", "runtime-source.ts"]);
  await execFile("git", ["-C", root, "commit", "--quiet", "-m", "fixture"]);
  return Object.freeze({ root, trackedPath });
}

describe("trusted formal Capture SDK owner identities", () => {
  it("does not treat documentary edits as SDK implementation changes", async () => {
    const repository = await createCommittedRepository();
    const documentPaths = [
      "docs/18-refactor-progress-and-backlog.md",
      "docs/superpowers/specs/capture-design.md",
      "docs/superpowers/plans/capture-plan.md",
      "docs/reviews/capture-review.md",
    ];
    try {
      for (const relative of documentPaths) {
        await mkdir(path.dirname(path.join(repository.root, relative)), { recursive: true });
        await writeFile(path.join(repository.root, relative), "initial\n");
      }
      await execFile("git", ["-C", repository.root, "add", "docs"]);
      await execFile("git", ["-C", repository.root, "commit", "--quiet", "-m", "documents"]);
      const before = await resolveFormalWorldCaptureSdkOwnerIdentitiesV1({ repositoryRoot: repository.root });
      for (const relative of documentPaths) await writeFile(path.join(repository.root, relative), "progress\n");
      await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({ repositoryRoot: repository.root }))
        .resolves.toEqual(before);
      await execFile("git", ["-C", repository.root, "add", "docs"]);
      await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({ repositoryRoot: repository.root }))
        .resolves.toEqual(before);
      // A dirty implementation must still fail even alongside staged documentary edits.
      await writeFile(repository.trackedPath, "changed implementation\n");
      await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({ repositoryRoot: repository.root }))
        .rejects.toThrow("WORLDKIT_SDK_OWNER_IDENTITY_SOURCE_DIRTY");
    } finally {
      await rm(repository.root, { recursive: true, force: true });
    }
  });

  it.each([
    ".codex/skills/worldkit-native-block-builder/SKILL.md",
    "docs/superpowers/skills/worldkit-native-block-builder/SKILL.md",
    "docs/superpowers/specs/executable.ts",
    "apps/native-scene-playground/vite.config.ts",
    "pnpm-lock.yaml",
  ])("still rejects modified execution or frozen input %s", async (relative) => {
    const repository = await createCommittedRepository();
    try {
      const file = path.join(repository.root, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "initial\n");
      await execFile("git", ["-C", repository.root, "add", relative]);
      await execFile("git", ["-C", repository.root, "commit", "--quiet", "-m", "input"]);
      await writeFile(file, "changed\n");
      await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({ repositoryRoot: repository.root }))
        .rejects.toThrow("WORLDKIT_SDK_OWNER_IDENTITY_SOURCE_DIRTY");
    } finally {
      await rm(repository.root, { recursive: true, force: true });
    }
  });

  it("cannot hide a source deletion by renaming it into the document scope", async () => {
    const repository = await createCommittedRepository();
    try {
      await mkdir(path.join(repository.root, "docs/reviews"), { recursive: true });
      await execFile("git", ["-C", repository.root, "mv", "runtime-source.ts", "docs/reviews/hidden.md"]);
      await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({ repositoryRoot: repository.root }))
        .rejects.toThrow("WORLDKIT_SDK_OWNER_IDENTITY_SOURCE_DIRTY");
    } finally {
      await rm(repository.root, { recursive: true, force: true });
    }
  });

  it("publishes the five SDK owners in contract order from the root SDK version and exact source commit", async () => {
    const identities = await resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
      envCommit: SOURCE_COMMIT_A,
      readRepositoryStatus: async () => "",
      gitCommit: async () => {
        throw new Error("the trusted injected commit must win");
      },
    });

    expect(identities.map(({ ownerId, implementationRef }) => ({
      ownerId,
      implementationRef,
    }))).toEqual([
      {
        ownerId: "action",
        implementationRef: "worldkit://sdk-owner/subject-actions@1",
      },
      {
        ownerId: "camera",
        implementationRef: "worldkit://sdk-owner/camera@1",
      },
      {
        ownerId: "input",
        implementationRef: "worldkit://sdk-owner/control-capture@1",
      },
      {
        ownerId: "physics",
        implementationRef: "worldkit://sdk-owner/character-movement@1",
      },
      {
        ownerId: "subject",
        implementationRef: "worldkit://sdk-owner/subject-contracts@1",
      },
    ]);
    expect(identities.map(({ implementationHash }) => implementationHash))
      .toEqual([
        "sha256:177fffbd3463e524908cc110ecaf3a529ab4c2a0358a2cfe9ccf5a947fc732ee",
        "sha256:0bd4afe4546e142f7aa0eaae5737b2eefd6fabaa0f98113adba85bde43a532de",
        "sha256:49c91d7ea03f107aa2efcd1e47051be39b2197641f38cfb39cf310625b819e78",
        "sha256:1a7b49efb26bcc5dc09c17eef9faba986bb9362c8cf56f2d548191db0debadcb",
        "sha256:3bcd4c8ffe3382577cda5de8f80daf4e961076f60ee660b5c3ed50cb0044c7db",
      ]);
    expect(Object.isFrozen(identities)).toBe(true);
    expect(identities.every(Object.isFrozen)).toBe(true);
  });

  it("changes every implementation identity when the exact source commit changes", async () => {
    const first = await resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
      envCommit: SOURCE_COMMIT_A,
      readRepositoryStatus: async () => "",
    });
    const second = await resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
      envCommit: SOURCE_COMMIT_B,
      readRepositoryStatus: async () => "",
    });

    expect(second.map(({ implementationHash }) => implementationHash))
      .not.toEqual(first.map(({ implementationHash }) => implementationHash));
  });

  it("allows untracked formal artifacts while tracked modified or deleted source fails closed", async () => {
    const repository = await createCommittedRepository();
    try {
      const artifactDirectory = path.join(repository.root, "artifacts", "scenes", "case-1");
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(path.join(artifactDirectory, "opening.png"), "capture", "utf8");

      await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
        repositoryRoot: repository.root,
      })).resolves.toHaveLength(5);

      await writeFile(repository.trackedPath, "export const runtimeSource = false;\n", "utf8");
      await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
        repositoryRoot: repository.root,
      })).rejects.toThrow("WORLDKIT_SDK_OWNER_IDENTITY_SOURCE_DIRTY");

      await writeFile(repository.trackedPath, "export const runtimeSource = true;\n", "utf8");
      await unlink(repository.trackedPath);
      await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
        repositoryRoot: repository.root,
      })).rejects.toThrow("WORLDKIT_SDK_OWNER_IDENTITY_SOURCE_DIRTY");
    } finally {
      await rm(repository.root, { recursive: true, force: true });
    }
  });

  it("fails closed for dirty or unavailable repository state", async () => {
    await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
      envCommit: SOURCE_COMMIT_A,
      readRepositoryStatus: async () => " M scripts/runtime.ts\n",
    })).rejects.toThrow("WORLDKIT_SDK_OWNER_IDENTITY_SOURCE_DIRTY");

    await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
      envCommit: SOURCE_COMMIT_A,
      readRepositoryStatus: async () => {
        throw new Error("git unavailable");
      },
    })).rejects.toThrow("WORLDKIT_SDK_OWNER_IDENTITY_SOURCE_STATE_UNAVAILABLE");
  });

  it("fails closed when neither the Host nor git supplies a trusted commit", async () => {
    await expect(resolveFormalWorldCaptureSdkOwnerIdentitiesV1({
      envCommit: "main",
      readRepositoryStatus: async () => "",
      gitCommit: async () => "0".repeat(40),
    })).rejects.toThrow("WORLDKIT_SOURCE_COMMIT_UNTRUSTED");
  });
});
