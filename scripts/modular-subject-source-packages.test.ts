import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  G_BOT_MODULAR_SUBJECT_SOURCE_PACKAGE,
  GOLDEN_MODULAR_SUBJECT_SOURCE_PACKAGE,
  MODULAR_SUBJECT_SOURCE_PACKAGE_CATALOG,
} from "./lib/modular-subject-source-catalog";
import {
  recoverModularSubjectSourcePackage,
  type RecoveredSubjectSourcePackageV1,
} from "./lib/modular-subject-source";
import {
  collectRecoveredSubjectSourcePackageFiles,
  parseModularSubjectSourcePackageArguments,
  writeModularSubjectSourcePackages,
} from "./modular-subject-source-packages";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const GOLDEN_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  GOLDEN_MODULAR_SUBJECT_SOURCE_PACKAGE.sourceGlbRelativePath,
);
const roots: string[] = [];

const GOLDEN_INVENTORY = [
  "animations/idle/clip.glb",
  "animations/idle/clip.manifest.json",
  "animations/jump/clip.glb",
  "animations/jump/clip.manifest.json",
  "animations/run/clip.glb",
  "animations/run/clip.manifest.json",
  "animations/walk/clip.glb",
  "animations/walk/clip.manifest.json",
  "extensions/source-archive/original.glb",
  "extensions/source-archive/original.manifest.json",
  "materials/default/material-set.manifest.json",
  "model/model.glb",
  "model/model.manifest.json",
  "package.manifest.json",
] as const;

async function temporaryOutput(): Promise<{
  readonly root: string;
  readonly outputRoot: string;
  readonly target: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "worldkit-modular-subject-packages-"));
  roots.push(root);
  return {
    root,
    outputRoot: path.join(root, "assets/subjects/packages"),
    target: path.join(root, "assets/subjects/packages/seedleap/golden-humanoid/v1"),
  };
}

async function recursiveInventory(directory: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (current: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(path.join(current, entry.name), relativePath);
      } else if (entry.isFile()) {
        result.push(relativePath);
      } else {
        result.push(`${relativePath}:unsupported`);
      }
    }
  };
  await visit(directory, "");
  return result.sort();
}

async function recursiveByteSnapshot(directory: string): Promise<ReadonlyMap<string, string>> {
  const snapshot = new Map<string, string>();
  for (const relativePath of await recursiveInventory(directory)) {
    snapshot.set(relativePath, (await readFile(path.join(directory, relativePath))).toString("hex"));
  }
  return snapshot;
}

async function recursiveEntryInventory(directory: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (current: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      result.push(`${entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other"}:${relativePath}`);
      if (entry.isDirectory()) await visit(path.join(current, entry.name), relativePath);
    }
  };
  await visit(directory, "");
  return result.sort();
}

function transactionDefinitions() {
  return ["alpha-subject", "bravo-subject"].map((id) => ({
    ...GOLDEN_MODULAR_SUBJECT_SOURCE_PACKAGE,
    id,
    displayName: id,
  }));
}

async function prepareTransactionTargets(
  outputRoot: string,
  definitions: ReturnType<typeof transactionDefinitions>,
): Promise<void> {
  for (const [index, definition] of definitions.entries()) {
    const target = path.join(
      outputRoot,
      definition.creatorId,
      definition.id,
      `v${definition.version}`,
    );
    await mkdir(path.join(target, "old/nested"), { recursive: true });
    await Promise.all([
      writeFile(path.join(target, "old/value.bin"), Uint8Array.from([index, 1, 2, 3])),
      writeFile(path.join(target, "old/nested/value.txt"), `old-${definition.id}\n`),
    ]);
  }
}

function goldenOptions(outputRoot: string, mode: "write" | "check") {
  return {
    mode,
    repositoryRoot: REPOSITORY_ROOT,
    outputRoot,
    packageDefinitions: [GOLDEN_MODULAR_SUBJECT_SOURCE_PACKAGE],
  } as const;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("modular Subject source package catalog", () => {
  it("keeps package IDs and every explicit action ID in deterministic code-unit order", () => {
    expect(MODULAR_SUBJECT_SOURCE_PACKAGE_CATALOG.map((row) => row.id)).toEqual([
      "g-bot",
      "golden-humanoid",
    ]);
    expect(MODULAR_SUBJECT_SOURCE_PACKAGE_CATALOG[0]?.actions.map((row) => row.actionId))
      .toEqual([
        "dance.rumba",
        "emote.angry",
        "emote.salute",
        "fall",
        "fight.enter",
        "float",
        "fly",
        "idle",
        "idle.gaming",
        "jump",
        "land.hard",
        "land.hard.alt",
        "lay.idle",
        "roll.toRun",
        "run",
        "sit",
        "sit.ground.idle",
        "sit.idle",
        "sit.toStand",
        "stand",
        "swim.exit",
        "swim.surface",
        "swim.tread",
        "walk",
        "walk.step",
      ]);
    expect(MODULAR_SUBJECT_SOURCE_PACKAGE_CATALOG[0]?.actions.map((row) => row.sourceClipName))
      .toEqual(MODULAR_SUBJECT_SOURCE_PACKAGE_CATALOG[0]?.actions.map((row) => row.actionId));
  });
});

describe("writeModularSubjectSourcePackages", () => {
  it.skipIf(process.platform === "win32").each(["creator", "package", "version"] as const)(
    "rejects a symlinked %s parent without changing the external directory",
    async (symlinkLevel) => {
      const { root, outputRoot } = await temporaryOutput();
      const externalDirectory = path.join(root, `external-${symlinkLevel}`);
      await mkdir(path.join(externalDirectory, "nested"), { recursive: true });
      await Promise.all([
        writeFile(path.join(externalDirectory, "sentinel.bin"), Uint8Array.from([9, 8, 7])),
        writeFile(path.join(externalDirectory, "nested/value.txt"), "external-owned\n"),
      ]);
      await mkdir(outputRoot, { recursive: true });
      const symlinkPath = symlinkLevel === "creator"
        ? path.join(outputRoot, "seedleap")
        : symlinkLevel === "package"
          ? path.join(outputRoot, "seedleap/golden-humanoid")
          : path.join(outputRoot, "seedleap/golden-humanoid/v1");
      if (symlinkLevel !== "creator") {
        await mkdir(path.join(outputRoot, "seedleap"), { recursive: true });
      }
      if (symlinkLevel === "version") {
        await mkdir(path.join(outputRoot, "seedleap/golden-humanoid"), { recursive: true });
      }
      await symlink(externalDirectory, symlinkPath, "dir");
      const before = await recursiveByteSnapshot(externalDirectory);

      const error = await writeModularSubjectSourcePackages(
        goldenOptions(outputRoot, "write"),
      ).then(() => undefined, (caught: unknown) => caught);

      expect(await recursiveByteSnapshot(externalDirectory)).toEqual(before);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        `MODULAR_SUBJECT_SOURCE_OUTPUT_SYMLINK_FORBIDDEN: ${
          symlinkLevel === "creator"
            ? "seedleap"
            : symlinkLevel === "package"
              ? "seedleap/golden-humanoid"
              : "seedleap/golden-humanoid/v1"
        }`,
      );
    },
  );

  it("publishes G Bot actions whose dotted IDs share directory-name prefixes", async () => {
    const { outputRoot } = await temporaryOutput();
    const target = path.join(outputRoot, "seedleap/g-bot/v1");

    await writeModularSubjectSourcePackages({
      mode: "write",
      repositoryRoot: REPOSITORY_ROOT,
      outputRoot,
      packageDefinitions: [G_BOT_MODULAR_SUBJECT_SOURCE_PACKAGE],
    });

    const inventory = await recursiveInventory(target);
    expect(inventory).toHaveLength(56);
    expect(inventory).toContain("animations/land.hard/clip.glb");
    expect(inventory).toContain("animations/land.hard.alt/clip.glb");
    expect(inventory).toContain("animations/sit/clip.glb");
    expect(inventory).toContain("animations/sit.idle/clip.glb");
  }, 30_000);

  it("publishes the exact validated Golden nested inventory including the Source Archive", async () => {
    const { outputRoot, target } = await temporaryOutput();

    await writeModularSubjectSourcePackages(goldenOptions(outputRoot, "write"));

    expect(await recursiveInventory(target)).toEqual([...GOLDEN_INVENTORY]);
    expect(await readFile(path.join(target, "extensions/source-archive/original.glb")))
      .toEqual(await readFile(GOLDEN_SOURCE_PATH));
    expect(JSON.parse(
      await readFile(
        path.join(target, "extensions/source-archive/original.manifest.json"),
        "utf8",
      ),
    )).toMatchObject({
      kind: "subject-source-archive",
      runtimeConsumption: "forbidden",
      residueInventory: {
        cameraCount: 0,
        lightCount: 0,
        extensionsUsed: [],
        extensionsRequired: [],
        extensionNames: [],
        extrasPropertyCount: 4,
        unknownTopLevelKeys: [],
      },
    });
  });

  it("includes both Source Archive and independently declared texture artifacts in the write closure", async () => {
    const recovered = await recoverModularSubjectSourcePackage({
      definition: GOLDEN_MODULAR_SUBJECT_SOURCE_PACKAGE,
      sourceGlbBytes: await readFile(GOLDEN_SOURCE_PATH),
    });
    const textureBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const textureHash = `sha256:${createHash("sha256").update(textureBytes).digest("hex")}` as const;
    const textureRelativePath =
      `materials/default/textures/${textureHash.slice("sha256:".length)}.png`;
    const recoveredWithTexture = {
      ...recovered,
      materialSet: {
        ...recovered.materialSet,
        textureArtifacts: [{
          id: `golden-humanoid.texture.${textureHash.slice("sha256:".length)}`,
          resourceRef:
            `worldkit://texture/seedleap.golden-humanoid.${textureHash.slice("sha256:".length)}@1`,
          relativePath: textureRelativePath,
          mediaType: "image/png",
          byteLengthBytes: textureBytes.byteLength,
          contentHash: textureHash,
          bytes: textureBytes,
        }],
      },
    } as RecoveredSubjectSourcePackageV1;

    const files = collectRecoveredSubjectSourcePackageFiles(recoveredWithTexture);

    expect(files.map((file) => file.relativePath)).toContain(
      "extensions/source-archive/original.glb",
    );
    expect(files.map((file) => file.relativePath)).toContain(
      "extensions/source-archive/original.manifest.json",
    );
    expect(files.map((file) => file.relativePath)).toContain(textureRelativePath);
    expect(files.find((file) => file.relativePath === textureRelativePath)?.bytes)
      .toEqual(textureBytes);
  });

  it("passes exact check mode against unchanged generated output", async () => {
    const { outputRoot } = await temporaryOutput();
    await writeModularSubjectSourcePackages(goldenOptions(outputRoot, "write"));

    const migrationInventory = JSON.parse(
      await readFile(path.join(outputRoot, "migration-inventory.json"), "utf8"),
    ) as { readonly rows: readonly unknown[] };
    expect(migrationInventory.rows).toHaveLength(21);

    await expect(writeModularSubjectSourcePackages(goldenOptions(outputRoot, "check")))
      .resolves.toBeUndefined();
  });

  it("reports every extra entry across the complete managed output root", async () => {
    const { outputRoot } = await temporaryOutput();
    await writeModularSubjectSourcePackages(goldenOptions(outputRoot, "write"));
    const extras = [
      "root-extra.json",
      "seedleap/golden-humanoid/v2/package.manifest.json",
      "seedleap/golden-humanoid/v1.backup-stale/package.manifest.json",
      "unexpected-creator/rogue/v1/value.bin",
    ] as const;
    for (const [index, relativePath] of extras.entries()) {
      const absolutePath = path.join(outputRoot, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, Uint8Array.from([index]));
    }

    const error = await writeModularSubjectSourcePackages(
      goldenOptions(outputRoot, "check"),
    ).then(() => undefined, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    const expectedMismatches = [
      "root-extra.json (unexpected)",
      "seedleap/golden-humanoid/v1.backup-stale (unexpected directory)",
      "seedleap/golden-humanoid/v1.backup-stale/package.manifest.json (unexpected)",
      "seedleap/golden-humanoid/v2 (unexpected directory)",
      "seedleap/golden-humanoid/v2/package.manifest.json (unexpected)",
      "unexpected-creator (unexpected directory)",
      "unexpected-creator/rogue (unexpected directory)",
      "unexpected-creator/rogue/v1 (unexpected directory)",
      "unexpected-creator/rogue/v1/value.bin (unexpected)",
    ].sort();
    expect((error as Error).message).toBe(
      `MODULAR_SUBJECT_SOURCE_OUTPUT_MISMATCH: ${expectedMismatches.join(", ")}`,
    );
  });

  it("reports a tampered migration inventory without rewriting it", async () => {
    const { outputRoot } = await temporaryOutput();
    await writeModularSubjectSourcePackages(goldenOptions(outputRoot, "write"));
    const inventoryPath = path.join(outputRoot, "migration-inventory.json");
    const tampered = Buffer.from("{\"tampered\":true}\n", "utf8");
    await writeFile(inventoryPath, tampered);

    await expect(writeModularSubjectSourcePackages(goldenOptions(outputRoot, "check")))
      .rejects.toThrowError(
        "MODULAR_SUBJECT_SOURCE_OUTPUT_MISMATCH: migration-inventory.json",
      );
    expect(await readFile(inventoryPath)).toEqual(tampered);
  });

  it("reports a tampered Clip byte without rewriting the committed output", async () => {
    const { outputRoot, target } = await temporaryOutput();
    await writeModularSubjectSourcePackages(goldenOptions(outputRoot, "write"));
    const clipPath = path.join(target, "animations/jump/clip.glb");
    const tampered = await readFile(clipPath);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
    await writeFile(clipPath, tampered);

    await expect(writeModularSubjectSourcePackages(goldenOptions(outputRoot, "check")))
      .rejects.toThrowError(
        "MODULAR_SUBJECT_SOURCE_OUTPUT_MISMATCH: seedleap/golden-humanoid/v1/animations/jump/clip.glb",
      );
    expect(await readFile(clipPath)).toEqual(tampered);
  });

  it("preserves an existing nested target byte-for-byte when staging fails", async () => {
    const { outputRoot, target } = await temporaryOutput();
    await mkdir(path.join(target, "old/nested"), { recursive: true });
    await Promise.all([
      writeFile(path.join(target, "old/value.bin"), Uint8Array.from([0, 1, 2, 3])),
      writeFile(path.join(target, "old/nested/value.txt"), "previous target\n"),
    ]);
    const before = await recursiveByteSnapshot(target);

    await expect(writeModularSubjectSourcePackages({
      ...goldenOptions(outputRoot, "write"),
      injectFailure(point) {
        if (
          point.phase === "after-staged-file-write" &&
          point.relativePath === "model/model.glb"
        ) {
          throw new Error("injected staging failure");
        }
      },
    })).rejects.toThrowError("injected staging failure");

    expect(await recursiveByteSnapshot(target)).toEqual(before);
  });

  it("restores both package targets when the second publish fails after the first publishes", async () => {
    const { outputRoot } = await temporaryOutput();
    const definitions = transactionDefinitions();
    await prepareTransactionTargets(outputRoot, definitions);
    const beforeBytes = await recursiveByteSnapshot(outputRoot);
    const beforeInventory = await recursiveEntryInventory(outputRoot);

    await expect(writeModularSubjectSourcePackages({
      mode: "write",
      repositoryRoot: REPOSITORY_ROOT,
      outputRoot,
      packageDefinitions: definitions,
      injectFailure(point) {
        if (
          point.phase === "before-publish-rename" &&
          point.packageId === "bravo-subject"
        ) {
          throw new Error("injected second publish failure");
        }
      },
    })).rejects.toThrowError("injected second publish failure");

    expect(await recursiveByteSnapshot(outputRoot)).toEqual(beforeBytes);
    expect(await recursiveEntryInventory(outputRoot)).toEqual(beforeInventory);
    expect((await recursiveEntryInventory(outputRoot)).filter((entry) =>
      entry.includes(".staging-") || entry.includes(".backup-")
    )).toEqual([]);
  });

  it("restores earlier backups when backing up the later package fails", async () => {
    const { outputRoot } = await temporaryOutput();
    const definitions = transactionDefinitions();
    await prepareTransactionTargets(outputRoot, definitions);
    const beforeBytes = await recursiveByteSnapshot(outputRoot);
    const beforeInventory = await recursiveEntryInventory(outputRoot);

    await expect(writeModularSubjectSourcePackages({
      mode: "write",
      repositoryRoot: REPOSITORY_ROOT,
      outputRoot,
      packageDefinitions: definitions,
      injectFailure(point) {
        if (
          point.phase === "before-backup-rename" &&
          point.packageId === "bravo-subject"
        ) {
          throw new Error("injected later backup failure");
        }
      },
    })).rejects.toThrowError("injected later backup failure");

    expect(await recursiveByteSnapshot(outputRoot)).toEqual(beforeBytes);
    expect(await recursiveEntryInventory(outputRoot)).toEqual(beforeInventory);
    expect((await recursiveEntryInventory(outputRoot)).filter((entry) =>
      entry.includes(".staging-") || entry.includes(".backup-")
    )).toEqual([]);
  });
});

describe("modular Subject source package CLI arguments", () => {
  it("fails closed for unknown arguments and invocation without one exact mode", () => {
    expect(() => parseModularSubjectSourcePackageArguments(["--unknown"]))
      .toThrowError("MODULAR_SUBJECT_SOURCE_ARGUMENT_UNKNOWN: --unknown");
    expect(() => parseModularSubjectSourcePackageArguments([]))
      .toThrowError("MODULAR_SUBJECT_SOURCE_MODE_REQUIRED");
    expect(() => parseModularSubjectSourcePackageArguments(["--write", "--check"]))
      .toThrowError("MODULAR_SUBJECT_SOURCE_MODE_CONFLICT");
    expect(parseModularSubjectSourcePackageArguments(["--write"]))
      .toEqual({ mode: "write" });
    expect(parseModularSubjectSourcePackageArguments(["--check"]))
      .toEqual({ mode: "check" });
  });
});
