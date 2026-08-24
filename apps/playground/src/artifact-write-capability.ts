import { isNil } from "lodash-es";

const ARTIFACT_CAPABILITY_ENDPOINT = "/__whitebox/artifact-capability";
const SERVER_NONCE_HEADER = "x-worldkit-server-nonce";
const ARTIFACT_WRITE_CAPABILITY_BRAND = Symbol("artifact-write-capability");
const issuedNonceByCapability = new WeakMap<object, string>();

export interface ArtifactWriteCapabilityV1 {
  readonly kind: "artifact-write";
  readonly [ARTIFACT_WRITE_CAPABILITY_BRAND]: true;
}

type ArtifactWriteHeadersV1 = Readonly<Record<
  "content-type" | typeof SERVER_NONCE_HEADER,
  string
>>;

function invalidCapability(): Error {
  return new Error("ARTIFACT_WRITE_CAPABILITY_INVALID");
}

function issueArtifactWriteCapability(nonce: string): ArtifactWriteCapabilityV1 {
  const capability = Object.freeze({
    kind: "artifact-write" as const,
    [ARTIFACT_WRITE_CAPABILITY_BRAND]: true as const,
  });
  issuedNonceByCapability.set(capability, nonce);
  return capability;
}

/** Loads write authority from the trusted same-origin host, never from URL data. */
export async function loadArtifactWriteCapability(
  fetcher: typeof fetch = fetch,
): Promise<ArtifactWriteCapabilityV1> {
  let response: Response;
  try {
    response = await fetcher(ARTIFACT_CAPABILITY_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
  } catch {
    throw invalidCapability();
  }
  if (response.ok !== true) throw invalidCapability();

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw invalidCapability();
  }
  if (
    typeof body !== "object" ||
    isNil(body) ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    typeof (body as { nonce?: unknown }).nonce !== "string"
  ) {
    throw invalidCapability();
  }

  const nonce = (body as { nonce: string }).nonce;
  const responseNonce = response.headers.get(SERVER_NONCE_HEADER);
  if (
    nonce.length === 0 ||
    nonce.length > 256 ||
    isNil(responseNonce) ||
    responseNonce !== nonce
  ) {
    throw invalidCapability();
  }
  return issueArtifactWriteCapability(nonce);
}

/** Derives request headers only from a capability issued by this module. */
export function artifactWriteHeaders(
  capability: ArtifactWriteCapabilityV1,
): ArtifactWriteHeadersV1 {
  if (typeof capability !== "object" || isNil(capability)) {
    throw invalidCapability();
  }
  const nonce = issuedNonceByCapability.get(capability);
  if (isNil(nonce)) throw invalidCapability();
  return Object.freeze({
    "content-type": "application/json",
    [SERVER_NONCE_HEADER]: nonce,
  });
}
