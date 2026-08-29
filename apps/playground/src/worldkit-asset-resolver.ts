import type { NormalizedSubjectAssetV1 } from "@whitebox-world/authoring";
import { sha256Bytes } from "@whitebox-world/protocol";
import type { SubjectAssetResolverV1 } from "@whitebox-world/runtime-babylon";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import type {
  ResolvedWorldPackageResourceArtifactV1,
} from "@whitebox-world/world-package";
import { isEqual, isNil } from "lodash-es";

interface ResolvedWorldPackageResourceBytesV1 {
  readonly resourceRef: string;
  readonly packagePath: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export const XIER120_SUBJECT_ASSET_URI_BY_REF_V1: Readonly<Record<string, string>> =
  Object.freeze({
  "worldkit://subject-asset/xier120.aerial-cockpit@1":
    "/subject-assets/xier120/aerial-cockpit/v1/aerial-cockpit.glb",
  "worldkit://subject-asset/xier120.aerial-hanging@1":
    "/subject-assets/xier120/aerial-hanging/v1/aerial-hanging.glb",
  "worldkit://subject-asset/xier120.aerial-seated@1":
    "/subject-assets/xier120/aerial-seated/v1/aerial-seated.glb",
  "worldkit://subject-asset/xier120.aerial-seated-variant@1":
    "/subject-assets/xier120/aerial-seated-variant/v1/aerial-seated-variant.glb",
  "worldkit://subject-asset/xier120.aerial-standing@1":
    "/subject-assets/xier120/aerial-standing/v1/aerial-standing.glb",
  "worldkit://subject-asset/xier120.biped-animal@1":
    "/subject-assets/xier120/biped-animal/v1/biped-animal.glb",
  "worldkit://subject-asset/xier120.flat-seated-glider@1":
    "/subject-assets/xier120/flat-seated-glider/v1/flat-seated-glider.glb",
  "worldkit://subject-asset/xier120.four-wheel@1":
    "/subject-assets/xier120/four-wheel/v1/four-wheel.glb",
  "worldkit://subject-asset/xier120.four-wheel-variant@1":
    "/subject-assets/xier120/four-wheel-variant/v1/four-wheel-variant.glb",
  "worldkit://subject-asset/xier120.hoverboard-standing@1":
    "/subject-assets/xier120/hoverboard-standing/v1/hoverboard-standing.glb",
  "worldkit://subject-asset/xier120.prone-glider@1":
    "/subject-assets/xier120/prone-glider/v1/prone-glider.glb",
  "worldkit://subject-asset/xier120.quadruped-animal@1":
    "/subject-assets/xier120/quadruped-animal/v1/quadruped-animal.glb",
  "worldkit://subject-asset/xier120.quadruped-reptile@1":
    "/subject-assets/xier120/quadruped-reptile/v1/quadruped-reptile.glb",
  "worldkit://subject-asset/xier120.quadruped-ridable@1":
    "/subject-assets/xier120/quadruped-ridable/v1/quadruped-ridable.glb",
  "worldkit://subject-asset/xier120.snake-animal@1":
    "/subject-assets/xier120/snake-animal/v1/snake-animal.glb",
  "worldkit://subject-asset/xier120.three-wheel@1":
    "/subject-assets/xier120/three-wheel/v1/three-wheel.glb",
  "worldkit://subject-asset/xier120.tracked@1":
    "/subject-assets/xier120/tracked/v1/tracked.glb",
  "worldkit://subject-asset/xier120.two-wheel-motorcycle@1":
    "/subject-assets/xier120/two-wheel-motorcycle/v1/two-wheel-motorcycle.glb",
  "worldkit://subject-asset/xier120.two-wheel-motorcycle-variant@1":
    "/subject-assets/xier120/two-wheel-motorcycle-variant/v1/two-wheel-motorcycle-variant.glb",
});

export const XIER120_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1: Readonly<
  Record<string, string>
> = Object.freeze({
  "worldkit://subject-asset/xier120.aerial-cockpit@1":
    "resources/subject-assets/xier120.aerial-cockpit.glb",
  "worldkit://subject-asset/xier120.aerial-hanging@1":
    "resources/subject-assets/xier120.aerial-hanging.glb",
  "worldkit://subject-asset/xier120.aerial-seated@1":
    "resources/subject-assets/xier120.aerial-seated.glb",
  "worldkit://subject-asset/xier120.aerial-seated-variant@1":
    "resources/subject-assets/xier120.aerial-seated-variant.glb",
  "worldkit://subject-asset/xier120.aerial-standing@1":
    "resources/subject-assets/xier120.aerial-standing.glb",
  "worldkit://subject-asset/xier120.biped-animal@1":
    "resources/subject-assets/xier120.biped-animal.glb",
  "worldkit://subject-asset/xier120.flat-seated-glider@1":
    "resources/subject-assets/xier120.flat-seated-glider.glb",
  "worldkit://subject-asset/xier120.four-wheel@1":
    "resources/subject-assets/xier120.four-wheel.glb",
  "worldkit://subject-asset/xier120.four-wheel-variant@1":
    "resources/subject-assets/xier120.four-wheel-variant.glb",
  "worldkit://subject-asset/xier120.hoverboard-standing@1":
    "resources/subject-assets/xier120.hoverboard-standing.glb",
  "worldkit://subject-asset/xier120.prone-glider@1":
    "resources/subject-assets/xier120.prone-glider.glb",
  "worldkit://subject-asset/xier120.quadruped-animal@1":
    "resources/subject-assets/xier120.quadruped-animal.glb",
  "worldkit://subject-asset/xier120.quadruped-reptile@1":
    "resources/subject-assets/xier120.quadruped-reptile.glb",
  "worldkit://subject-asset/xier120.quadruped-ridable@1":
    "resources/subject-assets/xier120.quadruped-ridable.glb",
  "worldkit://subject-asset/xier120.snake-animal@1":
    "resources/subject-assets/xier120.snake-animal.glb",
  "worldkit://subject-asset/xier120.three-wheel@1":
    "resources/subject-assets/xier120.three-wheel.glb",
  "worldkit://subject-asset/xier120.tracked@1":
    "resources/subject-assets/xier120.tracked.glb",
  "worldkit://subject-asset/xier120.two-wheel-motorcycle@1":
    "resources/subject-assets/xier120.two-wheel-motorcycle.glb",
  "worldkit://subject-asset/xier120.two-wheel-motorcycle-variant@1":
    "resources/subject-assets/xier120.two-wheel-motorcycle-variant.glb",
});

export const PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1 = Object.freeze({
  ...XIER120_SUBJECT_ASSET_URI_BY_REF_V1,
  "worldkit://subject-asset/actor.humanoid.g-bot@2":
    "/subject-assets/humanoid/g-bot/v2/g-bot.glb",
  "worldkit://subject-asset/humanoid.golden@2":
    "/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
});

export const PLAYGROUND_CAPABILITY_SUBJECT_ASSET_URI_BY_REF_V1 = Object.freeze({
  ...PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
  "worldkit://subject-asset/actor.humanoid.g-bot@2":
    "/subject-assets/humanoid/g-bot/v2/g-bot.glb",
});

export const PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1 = Object.freeze({
  ...XIER120_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
  "worldkit://subject-asset/actor.humanoid.g-bot@2":
    "resources/subject-assets/actor.humanoid.g-bot.glb",
  "worldkit://subject-asset/humanoid.golden@2":
    "resources/subject-assets/humanoid.golden.glb",
});

class WorldkitHostSubjectAssetResolveErrorV1 extends Error {
  readonly name = "WorldkitHostSubjectAssetResolveErrorV1";

  constructor() {
    super("Worldkit Playground could not resolve the requested Subject Asset.");
  }
}

function hostResolveFailure(): WorldkitHostSubjectAssetResolveErrorV1 {
  return new WorldkitHostSubjectAssetResolveErrorV1();
}

function capturedPageOrigin(): URL {
  const origin = globalThis.location?.origin;
  if (origin === undefined) throw hostResolveFailure();
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw hostResolveFailure();
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw hostResolveFailure();
  }
  return parsed;
}

function safeSameOriginUrl(uri: string, pageOrigin: URL): URL {
  let resolved: URL;
  try {
    resolved = new URL(uri, pageOrigin);
  } catch {
    throw hostResolveFailure();
  }
  if (
    (resolved.protocol !== "http:" && resolved.protocol !== "https:") ||
    resolved.origin !== pageOrigin.origin ||
    resolved.username !== "" ||
    resolved.password !== ""
  ) {
    throw hostResolveFailure();
  }
  return resolved;
}

export function createFetchSubjectAssetResolver(
  assetUriByRef: Readonly<Record<string, string>>,
  fetchImplementation: typeof fetch = fetch,
): SubjectAssetResolverV1 {
  const pageOrigin = capturedPageOrigin();
  const capturedUriByRef = Object.freeze(
    Object.fromEntries(Object.entries(assetUriByRef)),
  ) as Readonly<Record<string, string>>;

  return {
    async resolveSubjectAsset(request) {
      try {
        if (!Object.hasOwn(capturedUriByRef, request.subjectAssetRef)) {
          throw hostResolveFailure();
        }
        const uri = capturedUriByRef[request.subjectAssetRef];
        if (uri === undefined) throw hostResolveFailure();
        const policyUrl = safeSameOriginUrl(uri, pageOrigin);
        const networkUrl = new URL(policyUrl.href);
        networkUrl.hash = "";
        // The same logical asset URL may be reused while artists publish a new
        // locked artifact. Address the browser request by the Registry lock so
        // an already-open authoring session cannot replay stale GLB bytes from
        // its HTTP cache and then fail the length/hash contract.
        networkUrl.searchParams.set(
          "worldkit-content-hash",
          request.artifactContentHash,
        );
        const response = await fetchImplementation(networkUrl.href, {
          mode: "same-origin",
          credentials: "same-origin",
          redirect: "error",
          cache: "no-store",
        });
        if (!response.ok || response.redirected) throw hostResolveFailure();
        const responseUrl = safeSameOriginUrl(response.url, pageOrigin);
        if (responseUrl.href !== networkUrl.href) throw hostResolveFailure();
        const body = await response.arrayBuffer();
        const bytes = Uint8Array.from(new Uint8Array(body));
        if (
          request.mediaType !== "model/gltf-binary" ||
          bytes.byteLength !== request.byteLength ||
          sha256Bytes(bytes) !== request.artifactContentHash
        ) {
          throw hostResolveFailure();
        }
        return {
          bytes,
          sourceLabel: policyUrl.pathname,
        };
      } catch (error) {
        if (error instanceof WorldkitHostSubjectAssetResolveErrorV1) throw error;
        throw hostResolveFailure();
      }
    },
  };
}

export async function resolveWorldPackageSubjectAssetBytesV1(
  subjectAssets: readonly NormalizedSubjectAssetV1[],
  assetUriByRef: Readonly<Record<string, string>> =
    PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
  packagePathByRef: Readonly<Record<string, string>> =
    PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
  fetchImplementation: typeof fetch = fetch,
): Promise<readonly ResolvedWorldPackageResourceBytesV1[]> {
  const orderedAssets = [...subjectAssets].sort((left, right) =>
    left.subjectAssetRef.localeCompare(right.subjectAssetRef),
  );
  if (orderedAssets.length === 0) return Object.freeze([]);
  const capturedPackagePathByRef = Object.freeze(
    Object.fromEntries(Object.entries(packagePathByRef)),
  ) as Readonly<Record<string, string>>;
  if (
    new Set(orderedAssets.map((asset) => asset.subjectAssetRef)).size !==
      orderedAssets.length
  ) {
    throw hostResolveFailure();
  }
  const packagePaths = orderedAssets.map((asset) =>
    capturedPackagePathByRef[asset.subjectAssetRef],
  );
  if (
    packagePaths.some(isNil) ||
    new Set(packagePaths).size !== packagePaths.length
  ) {
    throw hostResolveFailure();
  }
  const resolver = createFetchSubjectAssetResolver(
    assetUriByRef,
    fetchImplementation,
  );
  const artifacts: ResolvedWorldPackageResourceBytesV1[] = [];
  for (const asset of orderedAssets) {
    if (!Object.hasOwn(capturedPackagePathByRef, asset.subjectAssetRef)) {
      throw hostResolveFailure();
    }
    const packagePath = capturedPackagePathByRef[asset.subjectAssetRef];
    if (isNil(packagePath)) throw hostResolveFailure();
    const resolved = await resolver.resolveSubjectAsset(asset);
    artifacts.push(Object.freeze({
      resourceRef: asset.subjectAssetRef,
      packagePath,
      mediaType: asset.mediaType,
      bytes: resolved.bytes,
    }));
  }
  return Object.freeze(artifacts);
}

const LICENSE_DOCUMENT_ID_BY_SPDX_EXPRESSION = Object.freeze({
  "LicenseRef-Project-Owned": "project-owned",
  "LicenseRef-Loopit-Company-Private": "loopit-private",
} as const);

export async function resolveWorldPackageSubjectAssetArtifactsV1(
  subjectAssets: readonly NormalizedSubjectAssetV1[],
  assetUriByRef: Readonly<Record<string, string>> =
    PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
  packagePathByRef: Readonly<Record<string, string>> =
    PLAYGROUND_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
  fetchImplementation: typeof fetch = fetch,
): Promise<readonly ResolvedWorldPackageResourceArtifactV1[]> {
  const artifacts = await resolveWorldPackageSubjectAssetBytesV1(
    subjectAssets,
    assetUriByRef,
    packagePathByRef,
    fetchImplementation,
  );
  const assetByRef = new Map(subjectAssets.map((asset) => [
    asset.subjectAssetRef,
    asset,
  ]));
  return Object.freeze(artifacts.map((artifact) => {
    const asset = assetByRef.get(artifact.resourceRef);
    const manifest = builtInSubjectResourceRegistry.resolveSubjectAsset(
      artifact.resourceRef,
    );
    if (
      isNil(asset) ||
      isNil(manifest) ||
      manifest.contentHash !== asset.subjectAssetManifestHash ||
      manifest.artifact.contentHash !== asset.artifactContentHash ||
      manifest.artifact.byteLength !== asset.byteLength ||
      manifest.artifact.mediaType !== asset.mediaType ||
      manifest.inventory.meshCount !== asset.inventory.meshCount ||
      manifest.inventory.vertexCount !== asset.inventory.vertexCount ||
      manifest.inventory.triangleCount !== asset.inventory.triangleCount ||
      manifest.inventory.skeletonCount !== asset.inventory.skeletonCount ||
      manifest.inventory.boneCount !== asset.inventory.boneCount ||
      !isEqual(
        manifest.inventory.animationClipNames,
        asset.inventory.animationClipNames,
      )
    ) {
      throw hostResolveFailure();
    }
    const licenseDocumentId = LICENSE_DOCUMENT_ID_BY_SPDX_EXPRESSION[
      manifest.provenance.licenseSpdxId as keyof
        typeof LICENSE_DOCUMENT_ID_BY_SPDX_EXPRESSION
    ];
    if (isNil(licenseDocumentId)) throw hostResolveFailure();
    return Object.freeze({
      ...artifact,
      subjectAssetManifestHash:
        asset.subjectAssetManifestHash as `sha256:${string}`,
      licenseDocumentId,
      licenseSpdxExpression: manifest.provenance.licenseSpdxId,
      redistributionPolicy: manifest.provenance.redistributionPolicy,
      ...(isNil(manifest.provenance.sourceUri)
        ? {}
        : { sourceUri: manifest.provenance.sourceUri }),
      ...(isNil(manifest.provenance.author)
        ? {}
        : { author: manifest.provenance.author }),
    });
  }));
}
