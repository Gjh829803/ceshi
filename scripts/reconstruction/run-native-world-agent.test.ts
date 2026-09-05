import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  lstat,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

import { sha256Bytes } from "@whitebox-world/protocol";
import { afterEach, describe, expect, it } from "vitest";

import { freezeNativeWorldReferenceInputsV1 } from
  "./run-native-world-agent.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("Native-default world agent Host route", () => {
  it("uses the same two model-stage topology as the Block baseline", () => {
    const source = readFileSync(
      "scripts/reconstruction/run-native-world-agent.ts",
      "utf8",
    );
    expect(source).toContain("scripts/agents/run-canonical-world-agent.sh");
    expect(source).toContain('"--plan-only"');
    expect(source).toContain('"--scene-source"');
    expect(source).toContain('"babylon-native"');
    expect(source).toContain("deriveNativeWorldBaselineProposalV1");
    expect(source).toContain("parseSceneBriefV1");
    expect(source).toContain("sceneBriefSemanticHash:");
    expect(source).toContain("sceneBrief.sceneBriefHash");
    expect(source).toContain("validateNativeWorldPlannerInputClosureV1");
    expect(source).toContain("copyAcceptedPlannerExecutionV1({");
    expect(source).toContain("verifyAcceptedPlannerExecutionV1({");
    expect(source).not.toContain("rm(publicPlanRoot");
    expect(source).not.toContain("ownsPlannerOutputs");
    expect(source).toContain('plannerArguments.push("--image", plannerImagePath)');
    expect(source).toContain("uploadedReferenceInputs: references.map");
    expect(source).not.toContain('plannerArguments.push("--image", sourcePath)');
    expect(source).toContain('"worldkit",\n        "reconstruct",\n        "run"');
    expect(source).not.toContain("native-case-mapping");
    expect(source).not.toContain("native-case-proposal.json");
    expect(source).not.toContain("scripts/agents/run-codex-task.mjs");
  });

  it("reports only Planner and Native Builder as model stages", () => {
    const result = spawnSync(
      "pnpm",
      [
        "exec",
        "tsx",
        path.resolve("scripts/reconstruction/run-native-world-agent.ts"),
        "--scene-id",
        "native-prompt-smoke",
        "build a mountainous T-shaped world",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, WORLDKIT_PROMPT_SMOKE: "1" },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "WORLDKIT_NATIVE_WORLD_SMOKE_OK unified-planning native-generation native-check package runtime capture evaluation final-publication",
    );
    expect(result.stdout).not.toContain("native-case-mapping");
    expect(result.stdout).not.toContain(" repair ");
  }, 15_000);

  it("freezes one stable private copy before original paths are replaced or deleted", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-input-"));
    temporaryRoots.push(root);
    const replacedPath = path.join(root, "replace.png");
    const deletedPath = path.join(root, "delete.jpg");
    const snapshotDirectoryPath = path.join(root, "private-snapshots");
    const image = () => sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } });
    const png = await image().png().toBuffer();
    const jpeg = await image().jpeg().toBuffer();
    await Promise.all([
      writeFile(replacedPath, png),
      writeFile(deletedPath, jpeg),
    ]);

    const references = await freezeNativeWorldReferenceInputsV1({
      sourcePaths: [replacedPath, deletedPath],
      snapshotDirectoryPath,
    });

    // These changes model the whole Planner window. Planner receives only the
    // private paths returned above, while identity and Case preparation retain
    // the already-read bytes.
    await Promise.all([
      writeFile(replacedPath, "replacement-png"),
      rm(deletedPath),
    ]);

    expect(references.map(({ inputRef, contentHash, mediaType }) => ({
      inputRef,
      contentHash,
      mediaType,
    }))).toEqual([{
      inputRef: "reference-0.png",
      contentHash: sha256Bytes(png),
      mediaType: "image/png",
    }, {
      inputRef: "reference-1.jpg",
      contentHash: sha256Bytes(jpeg),
      mediaType: "image/jpeg",
    }]);
    await expect(readFile(references[0]!.plannerImagePath)).resolves.toEqual(png);
    await expect(readFile(references[1]!.plannerImagePath)).resolves.toEqual(jpeg);
    expect(references[0]!.plannerImagePath.startsWith(
      `${snapshotDirectoryPath}${path.sep}`,
    )).toBe(true);
    expect(Number((await lstat(references[0]!.plannerImagePath, {
      bigint: true,
    })).mode & 0o777n)).toBe(0o400);
  });

  it.each([true, false])("freezes original WebP bytes without conversion (lossless=%s)", async (lossless) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-webp-"));
    temporaryRoots.push(root);
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } })
      .webp({ lossless }).toBuffer();
    const sourcePath = path.join(root, "reference.WEBP");
    await writeFile(sourcePath, bytes);
    const [reference] = await freezeNativeWorldReferenceInputsV1({
      sourcePaths: [sourcePath], snapshotDirectoryPath: path.join(root, "snapshots"),
    });
    expect(reference).toMatchObject({ inputRef: "reference-0.webp", mediaType: "image/webp", contentHash: sha256Bytes(bytes) });
    expect(await readFile(reference!.plannerImagePath)).toEqual(bytes);
    expect(Buffer.from(reference!.bytes)).toEqual(bytes);
  });

  it.each(["wrong-extension", "malformed", "animated"])("rejects %s WebP before Planner dispatch", async (kind) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-invalid-webp-"));
    temporaryRoots.push(root);
    const bytes = kind === "malformed" ? Buffer.from("RIFFxxxxWEBP")
      : kind === "animated"
        ? await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), { raw: { width: 1, height: 2, channels: 3, pageHeight: 1 } })
          .webp({ loop: 0, delay: [100, 100] }).toBuffer()
        : await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).png().toBuffer();
    const sourcePath = path.join(root, "reference.webp");
    await writeFile(sourcePath, bytes);
    const snapshotDirectoryPath = path.join(root, "snapshots");
    await expect(freezeNativeWorldReferenceInputsV1({ sourcePaths: [sourcePath], snapshotDirectoryPath }))
      .rejects.toThrow("NATIVE_WORLD_REFERENCE_IMAGE_INVALID");
    await expect(lstat(snapshotDirectoryPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a final-component symlink without leaving a partial snapshot", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-link-"));
    temporaryRoots.push(root);
    const targetPath = path.join(root, "target.png");
    const linkPath = path.join(root, "reference.png");
    const snapshotDirectoryPath = path.join(root, "private-snapshots");
    await writeFile(targetPath, "target-bytes");
    await symlink(targetPath, linkPath);

    await expect(freezeNativeWorldReferenceInputsV1({
      sourcePaths: [linkPath],
      snapshotDirectoryPath,
    })).rejects.toThrow("NATIVE_WORLD_REFERENCE_FILE_INVALID");
    await expect(lstat(snapshotDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
