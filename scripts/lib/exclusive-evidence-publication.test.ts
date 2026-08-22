import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  publishEvidenceAndReportNoReplaceV1,
  type EvidencePublicationPhaseV1,
} from "./exclusive-evidence-publication.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "worldkit-evidence-publication-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

function publicationInput(directory: string) {
  return {
    reportPath: path.join(directory, "validation-report.json"),
    reportBytes: new TextEncoder().encode("{\"status\":\"passed\"}\n"),
    evidenceFiles: [
      {
        relativePath: "route-validation-set-receipt.json",
        bytes: new TextEncoder().encode("{\"rows\":[]}"),
      },
      {
        relativePath: "rows/route-path-receipt.json",
        bytes: new Uint8Array([1, 2, 3]),
      },
    ],
  } as const;
}

describe("publishEvidenceAndReportNoReplaceV1", () => {
  it("publishes exact evidence bytes before the Report commit marker", async () => {
    const directory = await temporaryDirectory();
    const input = publicationInput(directory);
    const observedPhases: EvidencePublicationPhaseV1[] = [];

    const result = await publishEvidenceAndReportNoReplaceV1(input, {
      onPhase: async (phase) => {
        observedPhases.push(phase);
        if (phase !== "before-report-publish") return;
        await expect(lstat(input.reportPath)).rejects.toMatchObject({ code: "ENOENT" });
        await expect(readFile(
          path.join(`${input.reportPath}.evidence`, "route-validation-set-receipt.json"),
        )).resolves.toEqual(Buffer.from("{\"rows\":[]}"));
      },
    });

    expect(result).toEqual({
      commitStatus: "committed",
      postCommitCleanupStatus: "complete",
      reportPath: path.resolve(input.reportPath),
      evidenceDirectory: path.resolve(`${input.reportPath}.evidence`),
    });
    expect(await readFile(input.reportPath)).toEqual(Buffer.from(input.reportBytes));
    expect(await readFile(path.join(
      `${input.reportPath}.evidence`,
      "rows/route-path-receipt.json",
    ))).toEqual(Buffer.from([1, 2, 3]));
    expect(observedPhases).toContain("before-report-publish");
    expect((await readdir(`${input.reportPath}.evidence`, { recursive: true })).sort())
      .toEqual([
        "route-validation-set-receipt.json",
        "rows",
        "rows/route-path-receipt.json",
      ]);
  });

  it("refuses existing Report or evidence targets without mutating them", async () => {
    const directory = await temporaryDirectory();
    const input = publicationInput(directory);
    await writeFile(input.reportPath, "winner-report", "utf8");

    await expect(publishEvidenceAndReportNoReplaceV1(input)).rejects.toThrow(
      "WORLDKIT_EVIDENCE_PUBLICATION_TARGET_EXISTS",
    );
    await expect(readFile(input.reportPath, "utf8")).resolves.toBe("winner-report");
    await expect(lstat(`${input.reportPath}.evidence`)).rejects.toMatchObject({ code: "ENOENT" });

    await rm(input.reportPath);
    await mkdir(`${input.reportPath}.evidence`);
    await writeFile(path.join(`${input.reportPath}.evidence`, "sentinel"), "keep", "utf8");
    await expect(publishEvidenceAndReportNoReplaceV1(input)).rejects.toThrow(
      "WORLDKIT_EVIDENCE_PUBLICATION_TARGET_EXISTS",
    );
    await expect(readFile(
      path.join(`${input.reportPath}.evidence`, "sentinel"),
      "utf8",
    )).resolves.toBe("keep");
    await expect(lstat(input.reportPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses a pre-existing symlink without touching its target", async () => {
    const directory = await temporaryDirectory();
    const outside = await temporaryDirectory();
    const input = publicationInput(directory);
    await writeFile(path.join(outside, "sentinel"), "keep", "utf8");
    await symlink(outside, `${input.reportPath}.evidence`, "dir");

    await expect(publishEvidenceAndReportNoReplaceV1(input)).rejects.toThrow(
      "WORLDKIT_EVIDENCE_PUBLICATION_TARGET_EXISTS",
    );
    await expect(readFile(path.join(outside, "sentinel"), "utf8")).resolves.toBe("keep");
  });

  it("allows exactly one concurrent publisher", async () => {
    const directory = await temporaryDirectory();
    const input = publicationInput(directory);
    const settled = await Promise.allSettled([
      publishEvidenceAndReportNoReplaceV1(input),
      publishEvidenceAndReportNoReplaceV1(input),
    ]);

    expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(settled.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const loser = settled.find(({ status }) => status === "rejected");
    expect(loser).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        message: expect.stringContaining(
          "WORLDKIT_EVIDENCE_PUBLICATION_TARGET_EXISTS",
        ),
      }),
    });
    expect(await readFile(input.reportPath)).toEqual(Buffer.from(input.reportBytes));
    expect(await readFile(path.join(
      `${input.reportPath}.evidence`,
      "route-validation-set-receipt.json",
    ))).toEqual(Buffer.from("{\"rows\":[]}"));
  });

  it("returns the stable target-exists error for an evidence link collision", async () => {
    const directory = await temporaryDirectory();
    const input = publicationInput(directory);

    await expect(publishEvidenceAndReportNoReplaceV1(input, {
      onPhase: async (phase) => {
        if (phase !== "evidence-directory-claimed") return;
        await writeFile(
          path.join(
            `${input.reportPath}.evidence`,
            "route-validation-set-receipt.json",
          ),
          "competitor",
          "utf8",
        );
      },
    })).rejects.toThrow("WORLDKIT_EVIDENCE_PUBLICATION_TARGET_EXISTS");

    await expect(lstat(input.reportPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(`${input.reportPath}.evidence`)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("removes only invocation-owned partial output when publication fails", async () => {
    const directory = await temporaryDirectory();
    const input = publicationInput(directory);

    await expect(publishEvidenceAndReportNoReplaceV1(input, {
      onPhase: (phase) => {
        if (phase === "before-report-publish") {
          throw new Error("injected failure");
        }
      },
    })).rejects.toThrow("injected failure");

    await expect(lstat(input.reportPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(`${input.reportPath}.evidence`)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(directory)).filter((entry) => entry.includes(".staging-")))
      .toEqual([]);
  });

  it("does not remove a replacement at the claimed evidence path", async () => {
    const directory = await temporaryDirectory();
    const input = publicationInput(directory);
    const movedOwnedDirectory = path.join(directory, "moved-owned-evidence");

    await expect(publishEvidenceAndReportNoReplaceV1(input, {
      onPhase: async (phase) => {
        if (phase !== "evidence-directory-claimed") return;
        await rename(`${input.reportPath}.evidence`, movedOwnedDirectory);
        await mkdir(`${input.reportPath}.evidence`);
        await writeFile(
          path.join(`${input.reportPath}.evidence`, "sentinel"),
          "replacement",
          "utf8",
        );
        throw new Error("injected failure after replacement");
      },
    })).rejects.toThrow("injected failure after replacement");

    await expect(readFile(
      path.join(`${input.reportPath}.evidence`, "sentinel"),
      "utf8",
    )).resolves.toBe("replacement");
    await expect(lstat(movedOwnedDirectory)).resolves.toBeDefined();
    await expect(lstat(input.reportPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("returns a committed result when post-commit observation fails", async () => {
    const directory = await temporaryDirectory();
    const input = publicationInput(directory);

    const result = await publishEvidenceAndReportNoReplaceV1(input, {
      onPhase: (phase) => {
        if (phase === "report-published") {
          throw new Error("injected post-commit failure");
        }
      },
    });

    expect(result).toEqual({
      commitStatus: "committed",
      postCommitCleanupStatus: "incomplete",
      reportPath: path.resolve(input.reportPath),
      evidenceDirectory: path.resolve(`${input.reportPath}.evidence`),
    });
    expect(await readFile(input.reportPath)).toEqual(Buffer.from(input.reportBytes));
    expect((await readdir(`${input.reportPath}.evidence`, { recursive: true })).sort())
      .toEqual([
        "route-validation-set-receipt.json",
        "rows",
        "rows/route-path-receipt.json",
      ]);
  });

  it("preserves primary and cleanup failures in one AggregateError", async () => {
    const directory = await temporaryDirectory();
    const input = publicationInput(directory);
    const primaryError = new Error("injected primary failure");

    const publication = publishEvidenceAndReportNoReplaceV1(input, {
      onPhase: async (phase) => {
        if (phase !== "before-report-publish") return;
        const stagingEntry = (await readdir(directory)).find((entry) =>
          entry.includes(".staging-")
        );
        expect(stagingEntry).toBeDefined();
        const markerPath = path.join(
          directory,
          stagingEntry!,
          ".worldkit-publication-owner",
        );
        await rm(markerPath, { recursive: true, force: true });
        await mkdir(markerPath);
        throw primaryError;
      },
    });

    const error = await publication.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors[0]).toBe(primaryError);
    expect((error as AggregateError).errors).toHaveLength(2);
    await expect(lstat(input.reportPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("snapshots byte inputs and rejects accessor or symbol-bearing wrappers", async () => {
    const directory = await temporaryDirectory();
    const input = publicationInput(directory);
    const expectedReport = Buffer.from(input.reportBytes);
    const expectedEvidence = Buffer.from(input.evidenceFiles[0]!.bytes);
    const publication = publishEvidenceAndReportNoReplaceV1(input);
    input.reportBytes.fill(0);
    input.evidenceFiles[0]!.bytes.fill(0);
    await publication;

    expect(await readFile(input.reportPath)).toEqual(expectedReport);
    expect(await readFile(path.join(
      `${input.reportPath}.evidence`,
      input.evidenceFiles[0]!.relativePath,
    ))).toEqual(expectedEvidence);

    const accessorInput = publicationInput(path.join(directory, "accessor"));
    let accessorReadCount = 0;
    Object.defineProperty(accessorInput, "reportPath", {
      enumerable: true,
      get: () => {
        accessorReadCount += 1;
        return path.join(directory, "forbidden.json");
      },
    });
    await expect(publishEvidenceAndReportNoReplaceV1(accessorInput)).rejects.toThrow(
      "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
    );
    expect(accessorReadCount).toBe(0);

    const symbolInput = {
      ...publicationInput(path.join(directory, "symbol")),
      [Symbol("providerHandle")]: "forbidden",
    };
    await expect(publishEvidenceAndReportNoReplaceV1(symbolInput)).rejects.toThrow(
      "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
    );
  });

  it("rejects accessor, symbol, detached, and shared byte views with a stable error", async () => {
    const directory = await temporaryDirectory();
    const accessorBytes = new Uint8Array([1]);
    let accessorReadCount = 0;
    Object.defineProperty(accessorBytes, "buffer", {
      configurable: true,
      get: () => {
        accessorReadCount += 1;
        return new ArrayBuffer(1);
      },
    });
    await expect(publishEvidenceAndReportNoReplaceV1({
      ...publicationInput(path.join(directory, "accessor-bytes")),
      reportBytes: accessorBytes,
    })).rejects.toThrow("WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID");
    expect(accessorReadCount).toBe(0);

    const symbolBytes = new Uint8Array([1]);
    Object.defineProperty(symbolBytes, Symbol("providerHandle"), {
      value: "forbidden",
    });
    await expect(publishEvidenceAndReportNoReplaceV1({
      ...publicationInput(path.join(directory, "symbol-bytes")),
      reportBytes: symbolBytes,
    })).rejects.toThrow("WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID");

    const detachedBytes = new Uint8Array([1]);
    structuredClone(detachedBytes.buffer, { transfer: [detachedBytes.buffer] });
    await expect(publishEvidenceAndReportNoReplaceV1({
      ...publicationInput(path.join(directory, "detached-bytes")),
      reportBytes: detachedBytes,
    })).rejects.toThrow("WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID");

    if (typeof SharedArrayBuffer !== "undefined") {
      await expect(publishEvidenceAndReportNoReplaceV1({
        ...publicationInput(path.join(directory, "shared-bytes")),
        reportBytes: new Uint8Array(new SharedArrayBuffer(1)),
      })).rejects.toThrow("WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID");
    }
  });

  it.each([
    "../escape.json",
    "/absolute.json",
    "rows\\windows.json",
    "rows/../escape.json",
    "rows:bad/file.json",
    "",
  ])("rejects unsafe evidence path %s before creating outputs", async (relativePath) => {
    const directory = await temporaryDirectory();
    const input = publicationInput(directory);
    await expect(publishEvidenceAndReportNoReplaceV1({
      ...input,
      evidenceFiles: [{ relativePath, bytes: new Uint8Array([1]) }],
    })).rejects.toThrow("WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID");
    await expect(lstat(input.reportPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(`${input.reportPath}.evidence`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects file and directory prefix collisions before creating outputs", async () => {
    const directory = await temporaryDirectory();
    const input = publicationInput(directory);
    await expect(publishEvidenceAndReportNoReplaceV1({
      ...input,
      evidenceFiles: [
        { relativePath: "rows", bytes: new Uint8Array([1]) },
        { relativePath: "rows/path.json", bytes: new Uint8Array([2]) },
      ],
    })).rejects.toThrow("WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID");
    await expect(lstat(input.reportPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(`${input.reportPath}.evidence`)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
