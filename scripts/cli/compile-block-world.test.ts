import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseAuthoringSpecV4 } from "@whitebox-world/authoring";
import { describe, expect, it } from "vitest";

import { compileBlockWorldModuleV2 } from "./compile-block-world.js";

describe("Block World compile CLI", () => {
  it("writes Host-owned runtime transport and derived visual mappings", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "block-world-compile-"));
    const authoringOutputPath = path.join(directory, "authoring.json");
    const mapOutputPath = path.join(directory, "implementation-map.draft.json");
    const result = await compileBlockWorldModuleV2({
      worldPath: "examples/block-world/basic-world.mjs",
      authoringOutputPath,
      mapOutputPath,
    });
    expect(result.ok).toBe(true);
    expect(parseAuthoringSpecV4(await readFile(authoringOutputPath, "utf8")).ok).toBe(true);
    const map = JSON.parse(await readFile(mapOutputPath, "utf8"));
    expect(map).toMatchObject({
      sceneId: "basic-block-world",
      visualTargetMappings: [
        { visualTargetId: "visual-target-1", runtimeEntityIds: ["player"], frontDirectionWorldXZ: [0, -1] },
        {
          visualTargetId: "visual-target-2",
          runtimeEntityIds: [expect.stringMatching(/^bw-chunk-/)],
          frontDirectionWorldXZ: [0, -1],
        },
      ],
    });
  });

  it("does not write transport artifacts for a failed world", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "block-world-reject-"));
    const result = await compileBlockWorldModuleV2({
      worldPath: "scripts/fixtures/block-world-disconnected.mjs",
      authoringOutputPath: path.join(directory, "authoring.json"),
      mapOutputPath: path.join(directory, "implementation-map.draft.json"),
    });
    expect(result.ok).toBe(false);
  });
});
