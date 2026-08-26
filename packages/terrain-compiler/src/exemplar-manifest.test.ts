import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

interface GoldenExemplarManifestV1 {
  readonly schemaVersion: 1;
  readonly kind: "worldkit-terrain-height-intent-golden-exemplars";
  readonly exemplars: readonly {
    readonly id: string;
    readonly terrainFamily: "canyon" | "rolling-desert";
    readonly imagePath: string;
    readonly sha256: `sha256:${string}`;
    readonly encodingProfile: "signed-diverging-blue-gray-orange@0";
    readonly promptRole: "encoding-style-only";
    readonly status: "accepted";
    readonly sourceExperiment: string;
    readonly limitations: readonly string[];
  }[];
}

describe("terrain Height Intent golden exemplars", () => {
  it("binds every accepted family exemplar to existing immutable PNG bytes", async () => {
    const manifestPath = path.resolve(
      "assets/terrain-height-intent/golden-exemplars.json",
    );
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as GoldenExemplarManifestV1;

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.kind).toBe(
      "worldkit-terrain-height-intent-golden-exemplars",
    );
    expect(manifest.exemplars.map(({ id }) => id)).toEqual([
      "grand-canyon-signed-v4",
      "green-sahara-rolling-v1",
    ]);

    for (const exemplar of manifest.exemplars) {
      expect(exemplar.status).toBe("accepted");
      expect(exemplar.promptRole).toBe("encoding-style-only");
      expect(exemplar.imagePath.startsWith("assets/terrain-height-intent/")).toBe(true);
      expect(exemplar.imagePath.endsWith(".png")).toBe(true);
      expect(exemplar.limitations.length).toBeGreaterThan(0);
      const bytes = await readFile(path.resolve(exemplar.imagePath));
      expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(
        exemplar.sha256,
      );
    }
  });
});
