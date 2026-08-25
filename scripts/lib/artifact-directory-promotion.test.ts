import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  finalizeArtifactDirectory,
  parseArtifactPublicationMode,
  promoteArtifactDirectory,
} from "./artifact-directory-promotion";

const roots: string[] = [];

async function fixture(): Promise<{
  root: string;
  target: string;
  temporary: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "artifact-promotion-"));
  roots.push(root);
  const target = path.join(root, "evidence");
  const temporary = path.join(root, ".evidence.tmp");
  await Promise.all([
    writeFile(path.join(await createDirectory(target), "value.txt"), "old"),
    writeFile(path.join(await createDirectory(temporary), "value.txt"), "new"),
  ]);
  return { root, target, temporary };
}

async function createDirectory(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  return directory;
}

async function valueAt(directory: string): Promise<string> {
  return readFile(path.join(directory, "value.txt"), "utf8");
}

function faultingFileSystem(options: {
  failingRenameCalls?: readonly number[];
  failRemove?: "before" | "after-partial-delete";
} = {}): {
  rename: typeof rename;
  rm: typeof rm;
  cp: typeof cp;
} {
  let renameCalls = 0;
  return {
    rename: async (...arguments_: Parameters<typeof rename>) => {
      renameCalls += 1;
      if (options.failingRenameCalls?.includes(renameCalls) === true) {
        throw Object.assign(new Error(`rename fault ${renameCalls}`), { code: "EIO" });
      }
      return rename(...arguments_);
    },
    rm: async (...arguments_: Parameters<typeof rm>) => {
      if (options.failRemove === "before") {
        throw Object.assign(new Error("rm fault"), { code: "EIO" });
      }
      if (options.failRemove === "after-partial-delete") {
        const directory = arguments_[0].toString();
        const filenames = await readdir(directory);
        if (filenames[0] !== undefined) {
          await rm(path.join(directory, filenames[0]), { force: true, recursive: true });
        }
        throw Object.assign(new Error("partial rm fault"), { code: "EIO" });
      }
      return rm(...arguments_);
    },
    cp,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("promoteArtifactDirectory", () => {
  it("publishes an exact sibling directory and removes the complete backup", async () => {
    const { root, target, temporary } = await fixture();

    await expect(promoteArtifactDirectory({
      temporaryDirectory: temporary,
      targetDirectory: target,
      expectedFilenames: ["value.txt"],
    })).resolves.toEqual({ backupGarbageCollection: "complete" });
    expect(await valueAt(target)).toBe("new");
    expect((await readdir(root)).sort()).toEqual(["evidence"]);
  });

  it("leaves old target and new temporary directory intact when backup rename fails", async () => {
    const { target, temporary } = await fixture();

    await expect(promoteArtifactDirectory({
      temporaryDirectory: temporary,
      targetDirectory: target,
      expectedFilenames: ["value.txt"],
      fileSystem: faultingFileSystem({ failingRenameCalls: [1] }),
    })).rejects.toThrow("rename fault 1");
    expect(await valueAt(target)).toBe("old");
    expect(await valueAt(temporary)).toBe("new");
  });

  it("rolls the complete backup back when publication rename fails", async () => {
    const { target, temporary } = await fixture();

    await expect(promoteArtifactDirectory({
      temporaryDirectory: temporary,
      targetDirectory: target,
      expectedFilenames: ["value.txt"],
      fileSystem: faultingFileSystem({ failingRenameCalls: [2] }),
    })).rejects.toThrow("rename fault 2");
    expect(await valueAt(target)).toBe("old");
    expect(await valueAt(temporary)).toBe("new");
  });

  it("restores old target bytes when the direct rollback rename also fails", async () => {
    const { target, temporary } = await fixture();

    await expect(promoteArtifactDirectory({
      temporaryDirectory: temporary,
      targetDirectory: target,
      expectedFilenames: ["value.txt"],
      fileSystem: faultingFileSystem({ failingRenameCalls: [2, 3] }),
    })).rejects.toThrow("publication and direct rollback failed");
    expect(await valueAt(target)).toBe("old");
    expect(await valueAt(temporary)).toBe("new");
  });

  it.each(["before", "after-partial-delete"] as const)(
    "keeps the committed new target and defers backup GC when rm fails %s deletion",
    async (failRemove) => {
      const { target, temporary } = await fixture();

      const result = await promoteArtifactDirectory({
        temporaryDirectory: temporary,
        targetDirectory: target,
        expectedFilenames: ["value.txt"],
        fileSystem: faultingFileSystem({ failRemove }),
      });
      expect(result.backupGarbageCollection).toBe("deferred");
      if (result.backupGarbageCollection !== "deferred") {
        throw new Error("Backup GC was expected to be deferred.");
      }
      expect(result.deferredBackupDirectory).toEqual(expect.any(String));
      expect(await valueAt(target)).toBe("new");
    },
  );
});

describe("artifact publication mode", () => {
  it("defaults to read-only check and requires an explicit update flag", () => {
    expect(parseArtifactPublicationMode([])).toBe("check");
    expect(parseArtifactPublicationMode(["--update"])).toBe("update");
    expect(() => parseArtifactPublicationMode(["--write"])).toThrow(
      /ARTIFACT_PUBLICATION_ARGUMENT_INVALID/,
    );
  });

  it("checks exact staging inventory without replacing tracked target bytes", async () => {
    const { target, temporary } = await fixture();

    await expect(finalizeArtifactDirectory({
      mode: "check",
      temporaryDirectory: temporary,
      targetDirectory: target,
      expectedFilenames: ["value.txt"],
    })).resolves.toEqual({ publicationMode: "check" });
    expect(await valueAt(target)).toBe("old");
    expect(await valueAt(temporary)).toBe("new");
  });

  it("promotes validated staging bytes only in explicit update mode", async () => {
    const { target, temporary } = await fixture();

    await expect(finalizeArtifactDirectory({
      mode: "update",
      temporaryDirectory: temporary,
      targetDirectory: target,
      expectedFilenames: ["value.txt"],
    })).resolves.toEqual({
      publicationMode: "update",
      backupGarbageCollection: "complete",
    });
    expect(await valueAt(target)).toBe("new");
  });
});
