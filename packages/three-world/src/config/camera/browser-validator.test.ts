import { expect, it } from "vitest";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
it("executes the standalone validator in a browser realm with no require or Node globals", async () => {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL("./validator.generated.ts", import.meta.url)),
    ],
    bundle: false,
    write: false,
    format: "iife",
    globalName: "cameraValidator",
    platform: "browser",
  });
  const realm: Record<string, unknown> = Object.create(null);
  // No bundling at consumption time: this mirrors Vite transforming source modules.
  runInNewContext(result.outputFiles[0]!.text, realm);
  const validator = (
    realm.cameraValidator as { validateCameraDocument(value: unknown): boolean }
  ).validateCameraDocument;
  expect(
    validator({
      kind: "world-camera",
      schemaVersion: 1,
      defaultViewId: "eyes",
      views: { eyes: { kind: "first-person" } },
      binding: { targetEntityId: "player" },
    }),
  ).toBe(true);
  expect(validator({ kind: "world-camera", schemaVersion: 999 })).toBe(false);
});
