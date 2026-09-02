import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildStaticReviewModel,
  rewriteEpisodeForStaticReview,
  writeStaticReviewBundle,
} from "./build-seedance-static-review.mjs";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

function episode() {
  return {
    episodeId: "episode-scene-a-123abc",
    sceneId: "scene-a",
    status: "succeeded",
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T01:00:00.000Z",
    finishedAt: "2026-08-31T01:00:00.000Z",
    stages: [],
    artifacts: [{
      relativePath: "whitebox/segment-00.mp4",
      title: "whitebox",
      kind: "video",
      sizeBytes: 10,
      url: "/api/episode-workflows/episode-scene-a-123abc/artifacts/whitebox/segment-00.mp4",
    }, {
      relativePath: "visual/segment-00.png",
      title: "poster",
      kind: "image",
      sizeBytes: 4,
      url: "/api/episode-workflows/episode-scene-a-123abc/artifacts/visual/segment-00.png",
    }],
    playbackComparisons: [{
      segmentId: "segment-00",
      index: 0,
      title: "阶段 1",
      globalStartSeconds: 0,
      globalEndSeconds: 30,
      durationSeconds: 30,
      whiteboxVideo: {
        relativePath: "whitebox/segment-00.mp4",
        url: "/dynamic",
        poster: { relativePath: "visual/segment-00.png", url: "/dynamic-poster" },
      },
      finalVideo: {
        relativePath: "whitebox/segment-00.mp4",
        url: "/dynamic-final",
        poster: { relativePath: "visual/segment-00.png", url: "/dynamic-poster" },
      },
      publicPreviewVideo: null,
      reviewStyledOpeningFrame: null,
      legacyPromptVideo: null,
      relaxedActionVideo: null,
      inputActivations: [],
      promptEvent: null,
    }],
    reviewDownloads: {
      images: [{
        id: "user-reference",
        title: "reference",
        url: "/api/episode-workflows/episode-scene-a-123abc/scene-assets/user-reference",
      }],
      documents: [{
        id: "interaction-timeline",
        title: "timeline",
        kind: "json",
        url: "/api/episode-workflows/episode-scene-a-123abc/interaction-timeline",
      }],
      bundle: {
        ready: true,
        fileName: "episode-scene-a.zip",
        url: "/api/episode-workflows/episode-scene-a-123abc/bundle",
      },
    },
  };
}

describe("static Seedance review bundle", () => {
  it("removes dynamic API URLs from a published case", () => {
    const rewritten = rewriteEpisodeForStaticReview(episode());
    const serialized = JSON.stringify(rewritten.manifest);
    expect(serialized).not.toContain("/api/");
    expect(rewritten.manifest.playbackComparisons[0].whiteboxVideo.url).toBe(
      "cases/episode-scene-a-123abc/artifacts/whitebox/segment-00.mp4",
    );
    expect(rewritten.manifest.reviewDownloads.images[0].url).toBe(
      "cases/episode-scene-a-123abc/scene-assets/user-reference.png",
    );
    expect(rewritten.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "episode-artifact" }),
      expect.objectContaining({ kind: "http", expectedKind: "image" }),
      expect.objectContaining({ kind: "http", expectedKind: "zip" }),
    ]));
  });

  it("writes a self-contained static shell and versioned manifests", async () => {
    const output = await mkdtemp(join(tmpdir(), "worldkit-static-review-"));
    temporaryDirectories.push(output);
    const model = buildStaticReviewModel({ episodes: [episode()] }, {
      generatedAt: "2026-08-31T02:00:00.000Z",
    });
    await writeStaticReviewBundle(output, model);

    const [index, app, catalog, manifest] = await Promise.all([
      readFile(join(output, "index.html"), "utf8"),
      readFile(join(output, "app.js"), "utf8"),
      readFile(join(output, "data", "catalog.json"), "utf8"),
      readFile(join(output, "cases", episode().episodeId, "manifest.json"), "utf8"),
    ]);
    expect(index).toContain("S3 PERSISTENT");
    expect(app).toContain("inputActivations");
    expect(JSON.parse(catalog).episodes).toHaveLength(1);
    expect(manifest).not.toContain("/api/");
  });
});
