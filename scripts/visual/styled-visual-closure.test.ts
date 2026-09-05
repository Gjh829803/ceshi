import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import {
  validateWhiteboxTriviewManifestV1,
  type WhiteboxTriviewManifestV1,
} from "@whitebox-world/runtime-contracts";

import { finalizeStyledOpeningFrame } from "./finalize-styled-opening-frame.js";
import { finalizeStyledTriviews } from "./finalize-styled-triviews.js";

const roots: string[] = [];
const sceneId = "styled-closure-scene";
const targetIds = ["traveler", "palace"];
const promptBundleFile = "visual-generation-prompts.json";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// One current bundle, using the old strong closure rules, not its schema 1 fallback.
// No self-review ledger or accepted-opening protocol is invented by this fixture.
function validBundle() {
  return {
    kind: "worldkit-visual-generation-prompts",
    schemaVersion: 2 as number | string,
    sceneId,
    openingFrame: {
      referenceRoles: ["actual-whitebox-opening", "user-first-frame"],
      prompt: "o".repeat(200),
    },
    styledTriviews: targetIds.map((visualTargetId) => ({
      visualTargetId,
      referenceRoles: ["target-whitebox-triview", "styled-opening-frame", "user-first-frame"],
      prompt: "t".repeat(150),
    })),
  };
}

async function fixture(sceneSourceKind: "canonical" | "babylon-native" = "canonical") {
  const root = await mkdtemp(path.join(tmpdir(), "styled-visual-closure-"));
  roots.push(root);
  const sceneRoot = path.join(root, "scene");
  const userFramePath = path.join(root, "user-input.png");
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(255);
  const pngBytes = PNG.sync.write(png);
  const manifest: WhiteboxTriviewManifestV1 = {
    kind: "worldkit-whitebox-triview-manifest",
    schemaVersion: 1,
    worldBuildIdentityHash: `sha256:${"a".repeat(64)}`,
    whiteboxTriviews: targetIds.map((visualTargetId, index) => ({
      visualTargetId,
      runtimeEntityIds: sceneSourceKind === "babylon-native" && index > 0
        ? ["native-block:palace-front", "native-block:palace-rear"] : [visualTargetId],
      frontDirectionWorldXZ: [0, -1],
      role: index === 0 ? "primary-subject" : "primary-landmark",
      semanticClassId: index === 0 ? "subject.traveler" : "landmark.palace",
      identityColor: index === 0 ? "#E85D5D" : "#5D9FE8",
      views: ["front", "right", "back"],
      imageUri: `${visualTargetId}/whitebox-triview.png`,
    })),
  };
  expect(validateWhiteboxTriviewManifestV1(manifest)).toEqual([]);
  for (const target of manifest.whiteboxTriviews) {
    const directory = path.join(sceneRoot, "triviews", target.visualTargetId);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "whitebox-triview.png"), pngBytes);
    await writeFile(path.join(directory, "styled-triview.png"), pngBytes);
  }
  await Promise.all([
    writeFile(userFramePath, pngBytes),
    writeFile(path.join(sceneRoot, "opening-frame.png"), pngBytes),
    writeFile(path.join(sceneRoot, "styled-opening-frame.png"), pngBytes),
    writeFile(path.join(sceneRoot, "triviews", "whitebox-triview-manifest.json"), JSON.stringify(manifest)),
    writeFile(path.join(sceneRoot, promptBundleFile), JSON.stringify(validBundle())),
  ]);
  return { sceneId, sceneRoot, userFramePath };
}

type Bundle = ReturnType<typeof validBundle>;
const invalidBundles: readonly { name: string; change: (bundle: Bundle) => void }[] = [
  { name: "wrong kind", change: (bundle) => { bundle.kind = "unrelated-prompts"; } },
  { name: "wrong scene", change: (bundle) => { bundle.sceneId = "another-scene"; } },
  { name: "legacy schema 1", change: (bundle) => { bundle.schemaVersion = 1; } },
  { name: "string schema 2", change: (bundle) => { bundle.schemaVersion = "2"; } },
  { name: "unknown schema", change: (bundle) => { bundle.schemaVersion = 99; } },
  { name: "provider extension key", change: (bundle) => { Object.assign(bundle, { provider: "lwdp-codex" }); } },
  { name: "reordered opening roles", change: (bundle) => { bundle.openingFrame.referenceRoles.reverse(); } },
  { name: "missing opening role", change: (bundle) => { bundle.openingFrame.referenceRoles.pop(); } },
  { name: "wrong tri-view appearance role", change: (bundle) => {
    bundle.styledTriviews[0]!.referenceRoles[1] = "actual-whitebox-opening";
  } },
  { name: "reordered tri-view roles", change: (bundle) => { bundle.styledTriviews[0]!.referenceRoles.reverse(); } },
  { name: "199-character trimmed opening prompt", change: (bundle) => { bundle.openingFrame.prompt = ` ${"o".repeat(199)} `; } },
  { name: "149-character trimmed tri-view prompt", change: (bundle) => { bundle.styledTriviews[0]!.prompt = ` ${"t".repeat(149)} `; } },
  { name: "missing target", change: (bundle) => { bundle.styledTriviews.pop(); } },
  { name: "extra target", change: (bundle) => {
    bundle.styledTriviews.push({ ...bundle.styledTriviews[0]!, visualTargetId: "undeclared-target" });
  } },
  { name: "reordered targets", change: (bundle) => { bundle.styledTriviews.reverse(); } },
  { name: "duplicate target", change: (bundle) => {
    bundle.styledTriviews[1]!.visualTargetId = bundle.styledTriviews[0]!.visualTargetId;
  } },
];

const finalizers = [
  { name: "opening", finalize: finalizeStyledOpeningFrame, prefix: "styled-opening-frame" },
  { name: "tri-views", finalize: finalizeStyledTriviews, prefix: "styled-triviews" },
] as const;

for (const finalizer of finalizers) {
  describe(`${finalizer.name} prompt-bundle closure`, () => {
    it.each(["canonical", "babylon-native"] as const)("accepts %s identities with exact roles/target order and minimum prompt lengths", async sceneSourceKind => {
      const input = await fixture(sceneSourceKind);
      await finalizer.finalize(input);
      const manifestBytes = await readFile(path.join(input.sceneRoot, `${finalizer.prefix}-manifest.json`));
      const manifest = JSON.parse(manifestBytes.toString("utf8"));
      const report = JSON.parse(await readFile(path.join(input.sceneRoot, `${finalizer.prefix}-report.json`), "utf8"));
      expect(manifest.status).toBe("passed");
      expect(report.status).toBe("passed");
      expect(manifest.sceneId).toBe(sceneId);
      expect(report.manifestHash).toBe(`sha256:${createHash("sha256").update(manifestBytes.toString("utf8").trim()).digest("hex")}`);
      const targets = finalizer.name === "opening" ? manifest.supplementalTriviews : manifest.targets;
      expect(targets.map((target: { visualTargetId: string }) => target.visualTargetId)).toEqual(targetIds);
      if (finalizer.name === "opening") {
        expect(manifest.promptBundle).toEqual({
          path: promptBundleFile,
          contentHash: `sha256:${createHash("sha256").update(await readFile(path.join(input.sceneRoot, promptBundleFile))).digest("hex")}`,
        });
      } else {
        expect(targets.map((target: { views: string[] }) => target.views)).toEqual([
          ["front", "right", "back"], ["front", "right", "back"],
        ]);
      }
    });

    async function rejectsWithoutPublishing(input: Awaited<ReturnType<typeof fixture>>) {
      const outcome = await finalizer.finalize(input).then(() => "resolved", () => "rejected");
      const outputExists = await Promise.all(["manifest", "report"].map(async (suffix) =>
        access(path.join(input.sceneRoot, `${finalizer.prefix}-${suffix}.json`)).then(() => true, () => false)
      ));
      // Inspect outputs even when a broken finalizer resolves, so RED captures false publication too.
      expect({ outcome, outputExists }).toEqual({ outcome: "rejected", outputExists: [false, false] });
    }

    if (finalizer.name === "opening") it("rejects a missing bundle before publishing passed artifacts", async () => {
      const input = await fixture();
      await rm(path.join(input.sceneRoot, promptBundleFile));
      await rejectsWithoutPublishing(input);
    });

    if (finalizer.name === "opening") it("rejects invalid bundle JSON before publishing passed artifacts", async () => {
      const input = await fixture();
      await writeFile(path.join(input.sceneRoot, promptBundleFile), "{");
      await rejectsWithoutPublishing(input);
    });

    // The opening finalizer owns full admission. Tri-view coverage is limited
    // to shared bundle role/target identity safety, not a new review stage.
    const applicableInvalidBundles = finalizer.name === "opening" ? invalidBundles : invalidBundles.filter(({ name }) =>
      ["wrong tri-view appearance role", "reordered tri-view roles", "missing target", "extra target", "reordered targets", "duplicate target"].includes(name)
    );
    it.each(applicableInvalidBundles)("rejects $name before publishing passed artifacts", async ({ change }) => {
      const input = await fixture();
      const bundle = validBundle();
      change(bundle);
      await writeFile(path.join(input.sceneRoot, promptBundleFile), JSON.stringify(bundle));
      await rejectsWithoutPublishing(input);
    });
  });
}
