import { describe, expect, it } from "vitest";

import { patchStaticPlaygroundEntry } from "./publish-static-playground.mjs";

describe("static Playground publication", () => {
  it("rewrites dynamic bootstrap and absolute public assets to the release", () => {
    const source = 'const x=fetch(`/api/worlds/${encodeURIComponent(m)}/preview-bootstrap`,{cache:"no-store"});const a="/subject-assets/a.glb";const b="/scene-plans/world/a.png";const wasm="/assets/HavokPhysics.wasm";';
    const result = patchStaticPlaygroundEntry(
      source,
      "/world-model/sft/worldkit_seedance_review/releases/v1/play",
    );
    expect(result).not.toContain("/api/worlds/");
    expect(result).toContain("preview-bootstrap.json");
    expect(result).toContain(
      "/world-model/sft/worldkit_seedance_review/releases/v1/play/subject-assets/a.glb",
    );
    expect(result).toContain('/scene-plans/world/a.png');
    expect(result).toContain(
      "/world-model/sft/worldkit_seedance_review/releases/v1/play/assets/HavokPhysics.wasm",
    );
  });

  it("rewrites asset-only chunks without requiring a bootstrap request", () => {
    const result = patchStaticPlaygroundEntry(
      'const model="/subject-assets/skateboard.glb";',
      "/world-model/sft/worldkit_seedance_review/releases/v1/play",
    );
    expect(result).toContain(
      "/world-model/sft/worldkit_seedance_review/releases/v1/play/subject-assets/skateboard.glb",
    );
  });
});
