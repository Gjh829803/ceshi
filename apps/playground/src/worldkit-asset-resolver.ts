import type { SubjectAssetResolverV1 } from "@whitebox-world/runtime-babylon";

export const PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1 = Object.freeze({
  "worldkit://subject-asset/humanoid.golden@1":
    "/worldkit-assets/golden-humanoid.glb",
});

export const PLAYGROUND_CAPABILITY_SUBJECT_ASSET_URI_BY_REF_V1 = Object.freeze({
  ...PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
  "worldkit://subject-asset/actor.humanoid.g-bot@1":
    "/subject-assets/humanoid/g-bot/v1/g-bot.glb",
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
        const response = await fetchImplementation(networkUrl.href, {
          mode: "same-origin",
          credentials: "same-origin",
          redirect: "error",
        });
        if (!response.ok || response.redirected) throw hostResolveFailure();
        const responseUrl = safeSameOriginUrl(response.url, pageOrigin);
        if (responseUrl.href !== networkUrl.href) throw hostResolveFailure();
        const body = await response.arrayBuffer();
        return {
          bytes: Uint8Array.from(new Uint8Array(body)),
          sourceLabel: policyUrl.pathname,
        };
      } catch (error) {
        if (error instanceof WorldkitHostSubjectAssetResolveErrorV1) throw error;
        throw hostResolveFailure();
      }
    },
  };
}
