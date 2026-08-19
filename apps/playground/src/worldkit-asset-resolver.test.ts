import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

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
        url: "https://playground.test/asset.glb?token=secret",
        arrayBuffer: async () => {
          bodyReads += 1;
          return sourceBytes.buffer;
        },
      });
    }) as typeof fetch;
    const mapping: Record<string, string> = {
      [ASSET_REF]: "/asset.glb?token=secret#fragment",
    };
    const resolver = createFetchSubjectAssetResolver(mapping, fetchImplementation);
    mapping[ASSET_REF] = "https://attacker.test/replaced.glb";

    const result = await resolver.resolveSubjectAsset(REQUEST);
    sourceBytes[0] = 99;

    expect(result).toEqual({
      bytes: new Uint8Array([1, 2, 3, 4]),
      sourceLabel: "/asset.glb",
    });
    expect(bodyReads).toBe(1);
    expect(fetchCalls).toEqual([
      {
        input: "https://playground.test/asset.glb?token=secret",
        init: {
          mode: "same-origin",
          credentials: "same-origin",
          redirect: "error",
        },
      },
    ]);
  });

  it("matches native Fetch fragment stripping while retaining the query", async () => {
    const observedRequestPaths: string[] = [];
    const server = createServer((request, response) => {
      observedRequestPaths.push(request.url ?? "");
      response.statusCode = 200;
      response.setHeader("content-type", "model/gltf-binary");
      response.end(Buffer.from([1, 2, 3, 4]));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${address.port}`;
    vi.stubGlobal("location", { origin });

    let result;
    try {
      const resolver = createFetchSubjectAssetResolver({
        [ASSET_REF]: "/asset.glb?token=secret#fragment",
      });
      result = await resolver.resolveSubjectAsset(REQUEST);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      });
    }

    expect(observedRequestPaths).toEqual(["/asset.glb?token=secret"]);
    expect(result).toEqual({
      bytes: new Uint8Array([1, 2, 3, 4]),
      sourceLabel: "/asset.glb",
    });
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
