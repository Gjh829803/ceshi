import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Bytes } from "@whitebox-world/protocol";
import {
  XIER120_SUBJECT_ASSET_MANIFESTS,
  builtInSubjectResourceRegistry,
} from "@whitebox-world/subject-registry";

import {
  PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
  PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
  XIER120_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
  XIER120_SUBJECT_ASSET_URI_BY_REF_V1,
  createFetchSubjectAssetResolver,
  resolveWorldPackageSubjectAssetBytesV1,
} from "./worldkit-asset-resolver";

const ASSET_REF = "worldkit://subject-asset/humanoid.golden@2";
const G_BOT_ASSET_REF = "worldkit://subject-asset/actor.humanoid.g-bot@2";
const ASSET_BYTES = new Uint8Array([1, 2, 3, 4]);
const REQUEST = {
  subjectAssetRef: ASSET_REF,
  artifactContentHash: sha256Bytes(ASSET_BYTES),
  byteLength: ASSET_BYTES.byteLength,
  mediaType: "model/gltf-binary" as const,
};

const EXPECTED_XIER120_RESOLVER_ROWS = [
  ["aerial-cockpit", "/subject-assets/xier120/aerial-cockpit/v1/aerial-cockpit.glb", "resources/subject-assets/xier120.aerial-cockpit.glb"],
  ["aerial-hanging", "/subject-assets/xier120/aerial-hanging/v1/aerial-hanging.glb", "resources/subject-assets/xier120.aerial-hanging.glb"],
  ["aerial-seated", "/subject-assets/xier120/aerial-seated/v1/aerial-seated.glb", "resources/subject-assets/xier120.aerial-seated.glb"],
  ["aerial-seated-variant", "/subject-assets/xier120/aerial-seated-variant/v1/aerial-seated-variant.glb", "resources/subject-assets/xier120.aerial-seated-variant.glb"],
  ["aerial-standing", "/subject-assets/xier120/aerial-standing/v1/aerial-standing.glb", "resources/subject-assets/xier120.aerial-standing.glb"],
  ["biped-animal", "/subject-assets/xier120/biped-animal/v1/biped-animal.glb", "resources/subject-assets/xier120.biped-animal.glb"],
  ["flat-seated-glider", "/subject-assets/xier120/flat-seated-glider/v1/flat-seated-glider.glb", "resources/subject-assets/xier120.flat-seated-glider.glb"],
  ["four-wheel", "/subject-assets/xier120/four-wheel/v1/four-wheel.glb", "resources/subject-assets/xier120.four-wheel.glb"],
  ["four-wheel-variant", "/subject-assets/xier120/four-wheel-variant/v1/four-wheel-variant.glb", "resources/subject-assets/xier120.four-wheel-variant.glb"],
  ["hoverboard-standing", "/subject-assets/xier120/hoverboard-standing/v1/hoverboard-standing.glb", "resources/subject-assets/xier120.hoverboard-standing.glb"],
  ["prone-glider", "/subject-assets/xier120/prone-glider/v1/prone-glider.glb", "resources/subject-assets/xier120.prone-glider.glb"],
  ["quadruped-animal", "/subject-assets/xier120/quadruped-animal/v1/quadruped-animal.glb", "resources/subject-assets/xier120.quadruped-animal.glb"],
  ["quadruped-reptile", "/subject-assets/xier120/quadruped-reptile/v1/quadruped-reptile.glb", "resources/subject-assets/xier120.quadruped-reptile.glb"],
  ["quadruped-ridable", "/subject-assets/xier120/quadruped-ridable/v1/quadruped-ridable.glb", "resources/subject-assets/xier120.quadruped-ridable.glb"],
  ["snake-animal", "/subject-assets/xier120/snake-animal/v1/snake-animal.glb", "resources/subject-assets/xier120.snake-animal.glb"],
  ["three-wheel", "/subject-assets/xier120/three-wheel/v1/three-wheel.glb", "resources/subject-assets/xier120.three-wheel.glb"],
  ["tracked", "/subject-assets/xier120/tracked/v1/tracked.glb", "resources/subject-assets/xier120.tracked.glb"],
  ["two-wheel-motorcycle", "/subject-assets/xier120/two-wheel-motorcycle/v1/two-wheel-motorcycle.glb", "resources/subject-assets/xier120.two-wheel-motorcycle.glb"],
  ["two-wheel-motorcycle-variant", "/subject-assets/xier120/two-wheel-motorcycle-variant/v1/two-wheel-motorcycle-variant.glb", "resources/subject-assets/xier120.two-wheel-motorcycle-variant.glb"],
] as const;

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
    url: options.url ??
      `https://playground.test/subject-assets/humanoid/golden/v2/golden-humanoid.glb?worldkit-content-hash=${encodeURIComponent(REQUEST.artifactContentHash)}`,
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
        url: `https://playground.test/asset.glb?token=secret&worldkit-content-hash=${encodeURIComponent(REQUEST.artifactContentHash)}`,
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
        input: `https://playground.test/asset.glb?token=secret&worldkit-content-hash=${encodeURIComponent(REQUEST.artifactContentHash)}`,
        init: {
          mode: "same-origin",
          credentials: "same-origin",
          redirect: "error",
          cache: "no-store",
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

    expect(observedRequestPaths).toEqual([
      `/asset.glb?token=secret&worldkit-content-hash=${encodeURIComponent(REQUEST.artifactContentHash)}`,
    ]);
    expect(result).toEqual({
      bytes: new Uint8Array([1, 2, 3, 4]),
      sourceLabel: "/asset.glb",
    });
  });

  it("contains the exact same-origin Golden and G Bot Host mappings", () => {
    expect(PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1).toMatchObject({
      [ASSET_REF]: "/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
      [G_BOT_ASSET_REF]: "/subject-assets/humanoid/g-bot/v2/g-bot.glb",
    });
    expect(PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1).toMatchObject({
      [ASSET_REF]: "resources/subject-assets/humanoid.golden.glb",
      [G_BOT_ASSET_REF]: "resources/subject-assets/actor.humanoid.g-bot.glb",
    });
  });

  it("contains the STK kart Host and WorldPackage mappings", () => {
    const ref = "worldkit://subject-asset/kart-control-lab.stk-kart@1";
    expect(PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1[ref]).toBe(
      "/subject-assets/kart-control-lab/stk-kart/v1/stk-kart.glb",
    );
    expect(PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1[ref]).toBe(
      "resources/subject-assets/kart-control-lab.stk-kart.glb",
    );
  });

  it("publishes exactly nineteen creator-qualified xier120 URI and WorldPackage paths", () => {
    expect(EXPECTED_XIER120_RESOLVER_ROWS).toHaveLength(19);
    expect(XIER120_SUBJECT_ASSET_MANIFESTS).toHaveLength(19);
    expect(XIER120_SUBJECT_ASSET_URI_BY_REF_V1).toEqual(Object.fromEntries(
      EXPECTED_XIER120_RESOLVER_ROWS.map(([slug, uri]) => [
        `worldkit://subject-asset/xier120.${slug}@1`,
        uri,
      ]),
    ));
    expect(XIER120_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1).toEqual(Object.fromEntries(
      EXPECTED_XIER120_RESOLVER_ROWS.map(([slug, , packagePath]) => [
        `worldkit://subject-asset/xier120.${slug}@1`,
        packagePath,
      ]),
    ));
    expect(PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1).toMatchObject(
      XIER120_SUBJECT_ASSET_URI_BY_REF_V1,
    );
    expect(PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1).toMatchObject(
      XIER120_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
    );
  });

  it("resolves every xier120 WorldPackage artifact from real GLB bytes", async () => {
    vi.stubGlobal("location", { origin: "https://playground.test" });

    for (const manifest of XIER120_SUBJECT_ASSET_MANIFESTS) {
      const resolvedManifest = builtInSubjectResourceRegistry.resolveSubjectAsset(
        manifest.resourceRef,
      );
      expect(resolvedManifest).toBeDefined();
      const uri = XIER120_SUBJECT_ASSET_URI_BY_REF_V1[manifest.resourceRef];
      const packagePath =
        XIER120_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1[manifest.resourceRef];
      expect(uri).toBeTypeOf("string");
      expect(packagePath).toBeTypeOf("string");
      const diskBytes = await readFile(new URL(`../public${uri}`, import.meta.url));
      expect(diskBytes.byteLength).toBe(manifest.artifact.byteLength);
      expect(sha256Bytes(diskBytes)).toBe(manifest.artifact.contentHash);

      const artifacts = await resolveWorldPackageSubjectAssetBytesV1(
        [{
          subjectAssetRef: manifest.resourceRef,
          subjectAssetManifestHash: resolvedManifest!.contentHash,
          artifactContentHash: manifest.artifact.contentHash as `sha256:${string}`,
          byteLength: manifest.artifact.byteLength,
          mediaType: manifest.artifact.mediaType,
          format: manifest.format,
          inventory: manifest.inventory,
        }],
        PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
        PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
        (async (input) => ({
          ok: true,
          status: 200,
          redirected: false,
          url: String(input),
          arrayBuffer: async () => Uint8Array.from(diskBytes).buffer,
        }) as Response) as typeof fetch,
      );

      expect(artifacts).toMatchObject([{
        resourceRef: manifest.resourceRef,
        packagePath,
        mediaType: "model/gltf-binary",
      }]);
      expect(artifacts[0]?.bytes.byteLength).toBe(diskBytes.byteLength);
      expect(sha256Bytes(artifacts[0]!.bytes)).toBe(manifest.artifact.contentHash);
    }
  }, 30_000);

  it("resolves locked WorldPackage artifacts with stable package paths", async () => {
    vi.stubGlobal("location", { origin: "https://playground.test" });
    const sourceBytes = new Uint8Array(ASSET_BYTES);
    const artifacts = await resolveWorldPackageSubjectAssetBytesV1(
      [{
        ...REQUEST,
        subjectAssetManifestHash: `sha256:${"f".repeat(64)}`,
        format: "glb",
        inventory: {
          meshCount: 1,
          vertexCount: 1,
          triangleCount: 1,
          skeletonCount: 0,
          boneCount: 0,
          animationClipNames: [],
        },
      }],
      PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
      PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
      (async () => responseFixture({
        arrayBuffer: async () => sourceBytes.buffer,
      })) as typeof fetch,
    );
    sourceBytes[0] = 99;

    expect(artifacts).toEqual([{
      resourceRef: ASSET_REF,
      packagePath: "resources/subject-assets/humanoid.golden.glb",
      mediaType: "model/gltf-binary",
      bytes: ASSET_BYTES,
    }]);
    expect(Object.isFrozen(artifacts)).toBe(true);
    expect(Object.isFrozen(artifacts[0])).toBe(true);
  });

  it("fails closed when a locked WorldPackage artifact has no Host mapping", async () => {
    vi.stubGlobal("location", { origin: "https://playground.test" });
    await expect(resolveWorldPackageSubjectAssetBytesV1(
      [{
        ...REQUEST,
        subjectAssetRef: "worldkit://subject-asset/unknown@1",
        subjectAssetManifestHash: `sha256:${"f".repeat(64)}`,
        format: "glb",
        inventory: {
          meshCount: 1,
          vertexCount: 1,
          triangleCount: 1,
          skeletonCount: 0,
          boneCount: 0,
          animationClipNames: [],
        },
      }],
      PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
      PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
      (async () => responseFixture()) as typeof fetch,
    )).rejects.toMatchObject({
      name: "WorldkitHostSubjectAssetResolveErrorV1",
    });
  });

  it("fails closed on duplicate locked resource refs or package paths before fetch", async () => {
    vi.stubGlobal("location", { origin: "https://playground.test" });
    let fetchCount = 0;
    const fetchImplementation = (async () => {
      fetchCount += 1;
      return responseFixture();
    }) as typeof fetch;
    const descriptor = {
      ...REQUEST,
      subjectAssetManifestHash: `sha256:${"f".repeat(64)}`,
      format: "glb" as const,
      inventory: {
        meshCount: 1,
        vertexCount: 1,
        triangleCount: 1,
        skeletonCount: 0,
        boneCount: 0,
        animationClipNames: [],
      },
    };

    await expect(resolveWorldPackageSubjectAssetBytesV1(
      [descriptor, descriptor],
      PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
      PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
      fetchImplementation,
    )).rejects.toMatchObject({
      name: "WorldkitHostSubjectAssetResolveErrorV1",
    });
    await expect(resolveWorldPackageSubjectAssetBytesV1(
      [
        descriptor,
        { ...descriptor, subjectAssetRef: G_BOT_ASSET_REF },
      ],
      PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
      {
        [ASSET_REF]: "resources/subject-assets/shared.glb",
        [G_BOT_ASSET_REF]: "resources/subject-assets/shared.glb",
      },
      fetchImplementation,
    )).rejects.toMatchObject({
      name: "WorldkitHostSubjectAssetResolveErrorV1",
    });
    expect(fetchCount).toBe(0);
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

  it.each([
    {
      label: "byte length",
      request: { ...REQUEST, byteLength: REQUEST.byteLength + 1 },
    },
    {
      label: "content hash",
      request: {
        ...REQUEST,
        artifactContentHash: `sha256:${"f".repeat(64)}`,
      },
    },
    {
      label: "media type",
      request: {
        ...REQUEST,
        mediaType: "model/gltf+json" as "model/gltf-binary",
      },
    },
  ])("rejects bytes that do not match the locked $label", async ({ request }) => {
    vi.stubGlobal("location", { origin: "https://playground.test" });
    const resolver = createFetchSubjectAssetResolver(
      PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
      (async () => responseFixture()) as typeof fetch,
    );

    await expect(resolver.resolveSubjectAsset(request)).rejects.toMatchObject({
      name: "WorldkitHostSubjectAssetResolveErrorV1",
    });
  });
});
