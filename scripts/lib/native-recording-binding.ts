/** Trusted shell-server configuration. Never serialize it into a browser define. */
export interface NativeRecordingBinding {
  readonly sceneId: string;
  readonly worldPackageRootHash: `sha256:${string}`;
  readonly studioOrigin: string;
  readonly capability: string;
}

export function parseNativeRecordingBinding(value: unknown): NativeRecordingBinding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("NATIVE_RECORDING_BINDING_INVALID");
  const record = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(record);
  if (keys.length !== 4 || !keys.every(key => ["sceneId", "worldPackageRootHash", "studioOrigin", "capability"].includes(String(key))) ||
      typeof record.sceneId !== "string" || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(record.sceneId) ||
      typeof record.worldPackageRootHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(record.worldPackageRootHash) ||
      typeof record.capability !== "string" || !/^[a-f0-9]{64}$/.test(record.capability) || typeof record.studioOrigin !== "string") {
    throw new Error("NATIVE_RECORDING_BINDING_INVALID");
  }
  const origin = new URL(record.studioOrigin);
  if (origin.origin !== record.studioOrigin || origin.protocol !== "http:" ||
      !["127.0.0.1", "[::1]", "localhost"].includes(origin.hostname)) throw new Error("NATIVE_RECORDING_STUDIO_ORIGIN_INVALID");
  return Object.freeze(record as unknown as NativeRecordingBinding);
}

/** Exact media/workbench endpoints for one scene, not a general Studio proxy. */
export function isNativeRecordingRequest(sceneId: string, method: string, pathname: string): boolean {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(sceneId)) return false;
  const collection = `/api/recording-worlds/${sceneId}/recordings`;
  if (pathname === collection) return method === "GET" || method === "POST";
  if (pathname.startsWith(`${collection}/`)) {
    const suffix = pathname.slice(collection.length + 1);
    const match = /^(recording-[0-9]{8}t[0-9]{6}-[a-f0-9]{6})\/(source|prompt-template|prompt|generated|bundle|generate)$/.exec(suffix);
    return match !== null && (match[2] === "generate" ? method === "POST" :
      method === "GET" || method === "HEAD" && match[2] !== "bundle");
  }
  if (method !== "GET" && method !== "HEAD") return false;
  if (pathname === `/api/worlds/${sceneId}/deliverables/styled-opening-frame`) return true;
  const targetPrefix = `/api/worlds/${sceneId}/`;
  return pathname.startsWith(targetPrefix) && /^(?:styled-triviews|triviews)\/[a-z0-9][a-z0-9-]{0,95}$/.test(pathname.slice(targetPrefix.length));
}
