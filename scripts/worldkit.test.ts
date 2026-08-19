import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createValidAuthoringSpec } from "../packages/authoring/src/test-fixture";
import {
  buildFile,
  parseWorldkitArgs,
  validateFile,
  WorldkitUsageError,
} from "./worldkit";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "worldkit-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("worldkit CLI", () => {
  it("parses explicit command contracts without positional guessing", () => {
    expect(parseWorldkitArgs(["validate", "examples/authoring/basic-world.json"])).toEqual({
      command: "validate",
      inputPath: "examples/authoring/basic-world.json",
      json: false,
    });
    expect(parseWorldkitArgs(["capture", "world.json", "--output", "world.png", "--snapshot", "state.json", "--port", "4123", "--json"])).toEqual({
      command: "capture",
      inputPath: "world.json",
      outputPath: "world.png",
      snapshotPath: "state.json",
      port: 4123,
      json: true,
    });
  });

  it("rejects unknown or incomplete command options", () => {
    expect(() => parseWorldkitArgs(["build", "world.json"])).toThrow(WorldkitUsageError);
    expect(() => parseWorldkitArgs(["validate", "world.json", "--output", "bad"])).toThrow(WorldkitUsageError);
    expect(() => parseWorldkitArgs(["run", "world.json", "--port", "70000"])).toThrow(WorldkitUsageError);
  });

  it("validates files with strict parser and stable diagnostics", async () => {
    const directory = await createTemporaryDirectory();
    const validPath = path.join(directory, "valid.json");
    const invalidPath = path.join(directory, "invalid.json");
    await writeFile(validPath, JSON.stringify(createValidAuthoringSpec()), "utf8");
    await writeFile(invalidPath, '{"kind":"worldkit-authoring-spec","kind":"duplicate"}', "utf8");

    const valid = await validateFile(validPath);
    const invalid = await validateFile(invalidPath);

    expect(valid).toMatchObject({ ok: true, exitCode: 0, diagnostics: [] });
    expect(valid.normalizedWorldIrHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(valid.executionPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(invalid).toMatchObject({
      ok: false,
      exitCode: 2,
      diagnostics: [{ code: "AUTHORING_JSON_DUPLICATE_KEY", instancePath: "/kind" }],
    });
  });

  it("builds an atomic, deterministic artifact and never overwrites its input", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = path.join(directory, "world.json");
    const outputPath = path.join(directory, "dist", "world.build.json");
    await writeFile(inputPath, JSON.stringify(createValidAuthoringSpec()), "utf8");

    const first = await buildFile(inputPath, outputPath);
    const firstBytes = await readFile(outputPath, "utf8");
    const second = await buildFile(inputPath, outputPath);
    const secondBytes = await readFile(outputPath, "utf8");
    const samePath = await buildFile(inputPath, inputPath);

    expect(first).toMatchObject({ ok: true, exitCode: 0, outputPath });
    expect(second.ok).toBe(true);
    expect(firstBytes).toBe(secondBytes);
    expect(JSON.parse(firstBytes)).toMatchObject({
      kind: "worldkit-build-artifact",
      schemaVersion: 2,
      executionPlan: {
        schemaVersion: 2,
        runtimeBackend: "babylon-havok",
        controlledEntityId: "player",
        subjects: [expect.objectContaining({ entityId: "player" })],
      },
    });
    expect(samePath).toMatchObject({
      ok: false,
      exitCode: 2,
      diagnostics: [{ code: "CLI_OUTPUT_OVERWRITES_INPUT" }],
    });
  });
});
