import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
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

    await expect(writeModularSubjectSourcePackages(goldenOptions(outputRoot, "check")))
      .resolves.toBeUndefined();
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
        "MODULAR_SUBJECT_SOURCE_OUTPUT_MISMATCH: golden-humanoid animations/jump/clip.glb",
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
