import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { afterEach, describe, expect, it } from "vitest";

import {
  getProjectHealthEvidenceV1,
  putProjectHealthEvidenceJsonV1,
  putProjectHealthEvidenceTextV1,
  writeProjectHealthJsonAtomicV1,
} from "./evidence-store";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-store-"));
  roots.push(root);
  return root;
}

describe("project health evidence store", () => {
  it("does not spawn and stores content-addressed redacted evidence", async () => {
    const source = await readFile(new URL("./evidence-store.ts", import.meta.url), "utf8");
    expect(source).not.toMatch("child_process");
    const repositoryRoot = await createRoot();
    const first = await putProjectHealthEvidenceTextV1({
      repositoryRoot,
      text: "token=crsr_exampletokenvalue1234 from /Users/example/private.log",
    });
    const second = await putProjectHealthEvidenceTextV1({
      repositoryRoot,
      text: "token=crsr_exampletokenvalue1234 from /Users/example/private.log",
    });
    expect(first.evidenceRef).toBe(second.evidenceRef);
    expect(first.evidenceRef).toMatch(/^sha256:[a-f0-9]{64}$/);
    const stored = await getProjectHealthEvidenceV1({
      repositoryRoot,
      evidenceRef: first.evidenceRef,
    });
    expect(stored).not.toMatch(/crsr_/);
    expect(stored).not.toMatch("/Users/example/private.log");
    expect(stored).toMatch(/REDACTED/);
    const files = await readdir(path.join(repositoryRoot, ".project-health/evidence/sha256"));
    expect(files).toEqual([first.evidenceRef.slice("sha256:".length)]);
  });

  it("hashes canonical JSON after redaction and writes reports atomically", async () => {
    const repositoryRoot = await createRoot();
    const payload = {
      kind: "fixture-evidence",
      note: "Read /etc/passwd and file:///tmp/secret.log",
      command: "pnpm typecheck",
    };
    const stored = await putProjectHealthEvidenceJsonV1({
      repositoryRoot,
      value: payload,
    });
    const raw = await getProjectHealthEvidenceV1({
      repositoryRoot,
      evidenceRef: stored.evidenceRef,
    });
    expect(raw).not.toMatch("/etc/passwd");
    expect(raw).not.toMatch("file://");
    const parsed = JSON.parse(raw) as { readonly note: string; readonly command: string };
    expect(parsed.command).toBe("pnpm typecheck");
    expect(stored.evidenceRef).toBe(sha256CanonicalJson(JSON.parse(raw)));

    const reordered = await putProjectHealthEvidenceJsonV1({
      repositoryRoot,
      value: { command: "pnpm typecheck", note: "Read /etc/passwd and file:///tmp/secret.log", kind: "fixture-evidence" },
    });
    expect(reordered.evidenceRef).toBe(stored.evidenceRef);
    expect(await getProjectHealthEvidenceV1({
      repositoryRoot,
      evidenceRef: reordered.evidenceRef,
    })).toBe(raw);
    expect(raw).toBe('{"command":"pnpm typecheck","kind":"fixture-evidence","note":"Read [REDACTED_PATH] and [REDACTED_PATH]"}');

    const outputPath = path.join(repositoryRoot, ".project-health/report.json");
    await writeProjectHealthJsonAtomicV1({
      outputPath,
      value: { kind: "project-health-report", status: "passed" },
    });
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual({
      kind: "project-health-report",
      status: "passed",
    });
    const siblings = await readdir(path.join(repositoryRoot, ".project-health"));
    expect(siblings.filter((entry) => entry.endsWith(".tmp") || entry.includes("report.json."))).toEqual([]);
  });

  it("rejects a repository escape and leaves no partial output", async () => {
    const repositoryRoot = await createRoot();
    await expect(putProjectHealthEvidenceTextV1({
      repositoryRoot: path.join(repositoryRoot, "..", "outside"),
      text: "escape",
    })).rejects.toThrow(/repository/i);
    await writeFile(path.join(repositoryRoot, "tracked.json"), "{\"ok\":true}\n", "utf8");
    await expect(writeProjectHealthJsonAtomicV1({
      outputPath: path.join(repositoryRoot, "..", "escaped.json"),
      value: { ok: false },
      repositoryRoot,
    })).rejects.toThrow(/repository/i);
    await expect(readFile(path.join(repositoryRoot, "..", "escaped.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects symlinked evidence parents and never overwrites an existing object", async () => {
    const repositoryRoot = await createRoot();
    const outsideRoot = await createRoot();
    await symlink(outsideRoot, path.join(repositoryRoot, ".project-health"), "dir");
    await expect(putProjectHealthEvidenceTextV1({
      repositoryRoot,
      text: "must-not-escape",
    })).rejects.toThrow(/canonical|identity|symbolic/i);
    expect(await readdir(outsideRoot)).toEqual([]);

    await rm(path.join(repositoryRoot, ".project-health"));
    const value = { kind: "race-fixture", value: true };
    const evidenceRef = sha256CanonicalJson(value);
    const evidenceDirectory = path.join(repositoryRoot, ".project-health/evidence/sha256");
    await mkdir(evidenceDirectory, { recursive: true });
    const evidencePath = path.join(evidenceDirectory, evidenceRef.slice("sha256:".length));
    await writeFile(evidencePath, "tampered", "utf8");
    await expect(putProjectHealthEvidenceJsonV1({ repositoryRoot, value })).rejects.toThrow(/collision|canonical/i);
    expect(await readFile(evidencePath, "utf8")).toBe("tampered");
  });
});
