import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256Bytes } from "@whitebox-world/protocol";
import {
  XIER120_SUBJECT_ASSET_MANIFESTS,
  sourceFbxContributorAssetInventory,
} from "@whitebox-world/subject-registry";
import { describe, expect, it } from "vitest";

import { XIER120_SUBJECT_ASSET_URI_BY_REF_V1 } from "../../apps/playground/src/worldkit-asset-resolver";
import {
  auditSubjectSourceMigration,
  serializeSubjectSourceMigrationInventory,
} from "./subject-source-migration-audit";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const EXPECTED_IDS = [
  "seedleap.g-bot",
  "seedleap.golden-humanoid",
  "xier120.aerial-cockpit",
  "xier120.aerial-hanging",
  "xier120.aerial-seated",
  "xier120.aerial-seated-variant",
  "xier120.aerial-standing",
  "xier120.biped-animal",
  "xier120.flat-seated-glider",
  "xier120.four-wheel",
  "xier120.four-wheel-variant",
  "xier120.hoverboard-standing",
  "xier120.prone-glider",
  "xier120.quadruped-animal",
  "xier120.quadruped-reptile",
  "xier120.quadruped-ridable",
  "xier120.snake-animal",
  "xier120.three-wheel",
  "xier120.tracked",
  "xier120.two-wheel-motorcycle",
  "xier120.two-wheel-motorcycle-variant",
] as const;

describe("auditSubjectSourceMigration", () => {
  it("audits the exact 21 assets and preserves every xier120 source/runtime identity", async () => {
    const inventory = await auditSubjectSourceMigration({
      repositoryRoot: REPOSITORY_ROOT,
    });
    const rowsById = Object.fromEntries(inventory.rows.map((row) => [row.id, row]));

    expect(inventory).toMatchObject({
      kind: "subject-source-migration-inventory",
      schemaVersion: 1,
    });
    expect(inventory.rows.map((row) => row.id)).toEqual(EXPECTED_IDS);
    expect(inventory.rows).toHaveLength(21);
    expect(rowsById["seedleap.g-bot"]?.statuses).toEqual([
      "recovered-modular",
      "needs-visual-review",
    ]);
    expect(rowsById["seedleap.golden-humanoid"]?.statuses).toEqual([
      "recovered-modular",
    ]);
    expect(rowsById["seedleap.g-bot"]?.runtime).toMatchObject({
      relativePath: "apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
      byteLengthBytes: 6_743_072,
      contentHash:
        "sha256:4bcf3fabdba1e083ef54bf172fd962ca740e0f2fabdb9cddaae45d5ea208718f",
    });
    expect(rowsById["seedleap.golden-humanoid"]?.runtime).toMatchObject({
      relativePath:
        "apps/playground/public/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
      byteLengthBytes: 48_060,
      contentHash:
        "sha256:6cf29a2c9c024bdc108a8a436255abbb5f370d658d78cca0afb30f4872cd25a8",
    });

    for (const source of sourceFbxContributorAssetInventory) {
      const row = rowsById[source.sourceId];
      const runtimeManifest = XIER120_SUBJECT_ASSET_MANIFESTS.find(
        (candidate) => candidate.id === source.sourceId,
      );
      expect(runtimeManifest, source.sourceId).toBeDefined();
      expect(row, source.sourceId).toMatchObject({
        id: source.sourceId,
        currentUseMode: "static-subject",
        statuses: ["ready-static", "requires-product-reexport"],
        source: {
          relativePath: source.repositoryRelativePath,
          byteLengthBytes: source.byteLength,
          contentHash: source.contentHash,
        },
        runtime: {
          subjectAssetRef: runtimeManifest!.resourceRef,
          byteLengthBytes: runtimeManifest!.artifact.byteLength,
          contentHash: runtimeManifest!.artifact.contentHash,
        },
        rigProfileRef: null,
        animationClipRefs: [],
      });
      expect(row?.productCorrection).toContain(source.sourceId);

      const sourceBytes = await readFile(path.join(REPOSITORY_ROOT, source.repositoryRelativePath));
      const publicUri = XIER120_SUBJECT_ASSET_URI_BY_REF_V1[runtimeManifest!.resourceRef];
      expect(publicUri, source.sourceId).toBeDefined();
      const runtimeBytes = await readFile(path.join(
        REPOSITORY_ROOT,
        "apps/playground/public",
        publicUri!.slice(1),
      ));
      expect(sha256Bytes(sourceBytes), `${source.sourceId} source`).toBe(source.contentHash);
      expect(sha256Bytes(runtimeBytes), `${source.sourceId} runtime`).toBe(
        runtimeManifest!.artifact.contentHash,
      );
      expect(row?.runtime.relativePath).toBe(
        path.posix.join("apps/playground/public", publicUri!.slice(1)),
      );
    }

    expect(rowsById["xier120.quadruped-animal"]?.riggedBlockers).toContain(
      "source-has-18-skeletons",
    );
    expect(rowsById["xier120.quadruped-ridable"]?.riggedBlockers).toEqual(
      expect.arrayContaining([
        "source-has-2-skeletons",
        "control-owner-undefined",
      ]),
    );
  });

  it("serializes one deterministic canonical inventory", async () => {
    const inventory = await auditSubjectSourceMigration({
      repositoryRoot: REPOSITORY_ROOT,
    });

    const first = serializeSubjectSourceMigrationInventory(inventory);
    const second = serializeSubjectSourceMigrationInventory(
      await auditSubjectSourceMigration({ repositoryRoot: REPOSITORY_ROOT }),
    );

    expect(second).toEqual(first);
    expect(JSON.parse(new TextDecoder().decode(first))).toEqual(inventory);
  });
});
