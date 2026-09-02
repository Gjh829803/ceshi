import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  parseCanonicalJson,
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/authoring";
import { afterEach, describe, expect, it } from "vitest";

import { captureFile } from "./worldkit.js";
import { compileBlockWorldModuleV2 } from "./compile-block-world.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("worldkit rigged Subject tri-view capture", () => {
  it("applies authored Builder camera tuning to the real Runtime opening capture", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "worldkit-opening-camera-capture-"),
    );
    temporaryDirectories.push(temporaryDirectory);
    const source = await readFile("examples/block-world/basic-world.mjs", "utf8");
    const captures = [] as Array<{
      pngHash: string;
      distanceMeters: number;
      positionMetersXYZ: readonly number[];
      subjectOriginYMeters: number;
      targetHeightMeters: number;
      targetYMeters: number;
    }>;
    for (const distanceMeters of [3, 8]) {
      const suffix = String(distanceMeters);
      const worldModulePath = path.join(temporaryDirectory, `world-${suffix}.mjs`);
      const authoringPath = path.join(temporaryDirectory, `authoring-${suffix}.json`);
      const snapshotPath = path.join(temporaryDirectory, `snapshot-${suffix}.json`);
      const openingFramePath = path.join(temporaryDirectory, `opening-${suffix}.png`);
      await writeFile(
        worldModulePath,
        source
          .replace('id: "basic-block-world"', `id: "camera-opening-${suffix}"`)
          .replace("distanceMeters: 5", `distanceMeters: ${distanceMeters}`),
        "utf8",
      );
      const compiled = await compileBlockWorldModuleV2({
        worldPath: worldModulePath,
        authoringOutputPath: authoringPath,
        mapOutputPath: path.join(temporaryDirectory, `map-${suffix}.json`),
      });
      expect(compiled.ok).toBe(true);
      expect(await captureFile(authoringPath, openingFramePath, { snapshotPath }))
        .toMatchObject({ ok: true });
      const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
      const targetEntityId = snapshot.view.camera.targetEntityId;
      captures.push({
        pngHash: createHash("sha256").update(await readFile(openingFramePath)).digest("hex"),
        distanceMeters: snapshot.view.camera.resolvedParameters.distanceMeters,
        positionMetersXYZ: snapshot.view.camera.positionMetersXYZ,
        subjectOriginYMeters:
          snapshot.world.subjectStatesByEntityId[targetEntityId].entityState.positionMetersXYZ[1],
        targetHeightMeters: snapshot.view.camera.resolvedParameters.targetHeightMeters,
        targetYMeters: snapshot.view.camera.actualTargetPositionMetersXYZ[1],
      });
    }
    expect(captures.map(({ distanceMeters }) => distanceMeters)).toEqual([3, 8]);
    for (const capture of captures) {
      expect(capture.targetYMeters - capture.subjectOriginYMeters).toBeCloseTo(
        capture.targetHeightMeters,
      );
    }
    expect(captures[0]?.positionMetersXYZ).not.toEqual(captures[1]?.positionMetersXYZ);
    expect(captures[0]?.pngHash).not.toBe(captures[1]?.pngHash);
  }, 120_000);

  it("publishes non-empty front, right, and back panels for the G Bot Subject", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "worldkit-triview-capture-integration-"),
    );
    temporaryDirectories.push(temporaryDirectory);
    const worldPath = path.resolve("examples/authoring/g-bot-subject-world.json");
    const parsedWorld = parseCanonicalJson(await readFile(worldPath, "utf8"));
    if (!parsedWorld.ok || parsedWorld.value === undefined) {
      throw new Error("G Bot integration fixture is not canonical JSON.");
    }
    const implementationMapPath = path.join(temporaryDirectory, "implementation-map.json");
    await writeFile(implementationMapPath, `${stringifyCanonicalJson({
      kind: "worldkit-scene-brief-implementation-map",
      schemaVersion: 1,
      sceneId: "g-bot-triview-regression",
      sceneBriefHash: `sha256:${"a".repeat(64)}`,
      authoringSpecId: "g-bot-subject-world",
      authoringSpecHash: sha256CanonicalJson(parsedWorld.value),
      visualTargetMappings: [{
        visualTargetId: "primary-g-bot",
        runtimeEntityIds: ["g-bot-primary"],
        frontDirectionWorldXZ: [0, -1],
      }],
      visualCaptureGroups: [{
        visualTargetId: "primary-g-bot",
        runtimeEntityIds: ["g-bot-primary"],
        role: "primary-subject",
        semanticClassId: "subject.humanoid.g-bot",
        identityColor: "#E85D5D",
        frontDirectionWorldXZ: [0, -1],
      }],
    })}\n`, "utf8");
    const outputDirectory = path.join(temporaryDirectory, "triviews");

    const result = await captureFile(
      worldPath,
      path.join(temporaryDirectory, "opening-frame.png"),
      {
        snapshotPath: path.join(temporaryDirectory, "runtime-snapshot.json"),
        triviewOutputPath: outputDirectory,
        implementationMapPath,
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(result.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect((await stat(path.join(
      outputDirectory,
      "primary-g-bot",
      "whitebox-triview.png",
    ))).size).toBeGreaterThan(1_000);
    expect(JSON.parse(await readFile(
      path.join(outputDirectory, "whitebox-triview-manifest.json"),
      "utf8",
    ))).toMatchObject({
      whiteboxTriviews: [{
        visualTargetId: "primary-g-bot",
        views: ["front", "right", "back"],
      }],
    });
  }, 30_000);

  it("waits for the orthographic shader variant before publishing a package-local primitive Subject", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "worldkit-primitive-triview-capture-integration-"),
    );
    temporaryDirectories.push(temporaryDirectory);
    const worldPath = path.resolve("examples/authoring/package-subject-world.json");
    const parsedWorld = parseCanonicalJson(await readFile(worldPath, "utf8"));
    if (!parsedWorld.ok || parsedWorld.value === undefined) {
      throw new Error("Primitive Subject integration fixture is not canonical JSON.");
    }
    const implementationMapPath = path.join(temporaryDirectory, "implementation-map.json");
    await writeFile(implementationMapPath, `${stringifyCanonicalJson({
      kind: "worldkit-scene-brief-implementation-map",
      schemaVersion: 1,
      sceneId: "primitive-subject-triview-regression",
      sceneBriefHash: `sha256:${"b".repeat(64)}`,
      authoringSpecId: "package-subject-world",
      authoringSpecHash: sha256CanonicalJson(parsedWorld.value),
      visualTargetMappings: [{
        visualTargetId: "primary-pack-animal",
        runtimeEntityIds: ["pack-animal-a"],
        frontDirectionWorldXZ: [0, -1],
      }],
      visualCaptureGroups: [{
        visualTargetId: "primary-pack-animal",
        runtimeEntityIds: ["pack-animal-a"],
        role: "primary-subject",
        semanticClassId: "subject.animal.pack",
        identityColor: "#E85D5D",
        frontDirectionWorldXZ: [0, -1],
      }],
    })}\n`, "utf8");
    const outputDirectory = path.join(temporaryDirectory, "triviews");

    const result = await captureFile(
      worldPath,
      path.join(temporaryDirectory, "opening-frame.png"),
      {
        snapshotPath: path.join(temporaryDirectory, "runtime-snapshot.json"),
        triviewOutputPath: outputDirectory,
        implementationMapPath,
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(result.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect((await stat(path.join(
      outputDirectory,
      "primary-pack-animal",
      "whitebox-triview.png",
    ))).size).toBeGreaterThan(1_000);
    expect(JSON.parse(await readFile(
      path.join(outputDirectory, "whitebox-triview-manifest.json"),
      "utf8",
    ))).toMatchObject({
      whiteboxTriviews: [{
        visualTargetId: "primary-pack-animal",
        views: ["front", "right", "back"],
      }],
    });
  }, 30_000);
});
