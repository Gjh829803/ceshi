import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
  createFetchSubjectAssetResolver,
} from "./worldkit-asset-resolver";

const ASSET_REF = "worldkit://subject-asset/humanoid.golden@1";
const REQUEST = {
  subjectAssetRef: ASSET_REF,
  artifactContentHash: `sha256:${"1".repeat(64)}`,
  byteLength: 4,
  mediaType: "model/gltf-binary" as const,
};

function responseFixture(options: {
  ok?: boolean;
  status?: number;
  redirected?: boolean;
  url?: string;
  arrayBuffer?: () => Promise<ArrayBuffer>;
} = {}): Response {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    redirected: options.redirected ?? false,
    url: options.url ?? "https://playground.test/worldkit-assets/golden-humanoid.glb",
    arrayBuffer: options.arrayBuffer ?? (async () => new Uint8Array([1, 2, 3, 4]).buffer),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createFetchSubjectAssetResolver", () => {
  it("snapshots the built-in mapping and returns copied bytes with a pathname-only label", async () => {
    vi.stubGlobal("location", { origin: "https://playground.test" });
    const sourceBytes = new Uint8Array([1, 2, 3, 4]);
    let bodyReads = 0;
    const fetchCalls: Array<{ input: string; init: RequestInit | undefined }> = [];
    const fetchImplementation = (async (input: URL | RequestInfo, init?: RequestInit) => {
      fetchCalls.push({ input: String(input), init });
      return responseFixture({
        url: "https://playground.test/worldkit-assets/golden-humanoid.glb?token=secret#fragment",
        arrayBuffer: async () => {
          bodyReads += 1;
          return sourceBytes.buffer;
        },
      });
    }) as typeof fetch;
    const mapping: Record<string, string> = {
      [ASSET_REF]: "/worldkit-assets/golden-humanoid.glb?token=secret#fragment",
    };
    const resolver = createFetchSubjectAssetResolver(mapping, fetchImplementation);
    mapping[ASSET_REF] = "https://attacker.test/replaced.glb";

    const result = await resolver.resolveSubjectAsset(REQUEST);
    sourceBytes[0] = 99;

    expect(result).toEqual({
      bytes: new Uint8Array([1, 2, 3, 4]),
      sourceLabel: "/worldkit-assets/golden-humanoid.glb",
    });
    expect(bodyReads).toBe(1);
    expect(fetchCalls).toEqual([
      {
        input: "https://playground.test/worldkit-assets/golden-humanoid.glb?token=secret#fragment",
        init: {
          mode: "same-origin",
          credentials: "same-origin",
          redirect: "error",
        },
      },
    ]);
  });

  it("contains the exact same-origin Golden Humanoid Host mapping", () => {
    expect(PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1).toEqual({
      [ASSET_REF]: "/worldkit-assets/golden-humanoid.glb",
    });
  });

  it("rejects unmapped and unsafe mappings before fetch", async () => {
    vi.stubGlobal("location", { origin: "https://playground.test" });
    let fetchCount = 0;
    const fetchImplementation = (async () => {
      fetchCount += 1;
      return responseFixture();
    }) as typeof fetch;

    const unmapped = createFetchSubjectAssetResolver({}, fetchImplementation);
    await expect(unmapped.resolveSubjectAsset(REQUEST)).rejects.toMatchObject({
      name: "WorldkitHostSubjectAssetResolveErrorV1",
    });

    for (const unsafeUri of [
      "https://cdn.test/asset.glb",
      "https://user:secret@playground.test/asset.glb",
      "file:///tmp/asset.glb",
      "data:model/gltf-binary;base64,AA==",
    ]) {
      const resolver = createFetchSubjectAssetResolver(
        { [ASSET_REF]: unsafeUri },
        fetchImplementation,
      );
      await expect(resolver.resolveSubjectAsset(REQUEST)).rejects.toMatchObject({
        name: "WorldkitHostSubjectAssetResolveErrorV1",
      });
    }
    expect(fetchCount).toBe(0);
  });

  it("does not read non-OK or redirected response bodies", async () => {
    vi.stubGlobal("location", { origin: "https://playground.test" });
    for (const response of [
      responseFixture({ ok: false, status: 404 }),
      responseFixture({ redirected: true }),
      responseFixture({ url: "https://cdn.test/redirected.glb" }),
    ]) {
      let bodyReads = 0;
      Object.defineProperty(response, "arrayBuffer", {
        value: async () => {
          bodyReads += 1;
          return new ArrayBuffer(0);
        },
      });
      const resolver = createFetchSubjectAssetResolver(
        PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
        (async () => response) as typeof fetch,
      );

      await expect(resolver.resolveSubjectAsset(REQUEST)).rejects.toMatchObject({
        name: "WorldkitHostSubjectAssetResolveErrorV1",
      });
      expect(bodyReads).toBe(0);
    }
  });
});
