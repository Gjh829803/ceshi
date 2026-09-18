import { canonicalJson, protocolError, satisfiesVersion } from '@worldkit/asset-contracts';
import { assertValid } from '@worldkit/asset-contracts/validate';

const encoder = new TextEncoder();
const digestPattern = /^[a-f0-9]{64}$/;
const metadataLimit = 8 * 1024 * 1024;
const fail = (code, message = code, details = {}) => { throw protocolError(code, message, 400, details); };

export async function sha256(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}

export async function verifyLock(lock) {
  assertValid('ProjectLock', lock);
  const { lock_digest, ...content } = lock;
  if (await sha256(encoder.encode(canonicalJson(content))) !== lock_digest) fail('ASSET_LOCK_DIGEST_MISMATCH');
  return lock;
}

function httpUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('ASSET_URL_INVALID'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) fail('ASSET_URL_INVALID');
  return url;
}

function baseUrl(value) {
  const url = httpUrl(value);
  if (url.search) fail('ASSET_URL_INVALID');
  if (url.pathname.endsWith('/registry.json')) url.pathname = url.pathname.slice(0, -'registry.json'.length);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function freeze(value) {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); }
  return value;
}

export function parseManifest(bytes, ref) {
  let manifest;
  try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('ASSET_MANIFEST_INVALID'); }
  assertValid('Manifest', manifest);
  if (manifest.asset_id !== ref.asset_id || manifest.version !== ref.version) fail('ASSET_MANIFEST_IDENTITY_MISMATCH');
  return manifest;
}

/** Browser-safe, snapshot-pinned metadata and verified artifact transport. */
export class RegistryClient {
  #root; #artifactRoot; #fetch; #descriptor; #selection;

  constructor({ registryUrl, artifactBaseUrl, fetch: fetchImpl = globalThis.fetch }) {
    this.#root = baseUrl(registryUrl);
    this.#artifactRoot = artifactBaseUrl ? baseUrl(artifactBaseUrl) : null;
    if (typeof fetchImpl !== 'function') fail('ASSET_FETCH_UNAVAILABLE');
    // Browser fetch is a Web API method; never invoke it with this client as receiver.
    this.#fetch = (...args) => fetchImpl(...args);
  }

  async #request(path, { body, limit = metadataLimit, raw = false } = {}) {
    const url = path instanceof URL ? path : new URL(path, this.#root);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await this.#fetch(url.href, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: controller.signal,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const bound = response.ok ? limit : metadataLimit;
      const declared = response.headers.get('content-length');
      if (declared !== null && Number(declared) > bound) { await response.body?.cancel(); fail('ASSET_RESPONSE_TOO_LARGE'); }
      const chunks = []; let size = 0;
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            size += value.byteLength;
            if (size > bound) { await reader.cancel(); fail('ASSET_RESPONSE_TOO_LARGE'); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let data;
      if (!response.ok || !raw) {
        try { data = JSON.parse(new TextDecoder().decode(bytes)); }
        catch { fail('ASSET_RESPONSE_INVALID', 'Registry response is not JSON'); }
      }
      if (!response.ok) {
        assertValid('Error', data);
        throw Object.assign(protocolError(data.error.code, data.error.message, response.status, data.error.details), { retryable: data.error.retryable });
      }
      return raw ? bytes : data;
    } catch (error) {
      if (typeof error.code === 'string' && typeof error.status === 'number') throw error;
      throw protocolError('ASSET_TRANSPORT_FAILED', 'Selected registry or artifact source is unavailable', 503);
    } finally { clearTimeout(timer); }
  }

  async descriptor({ snapshotId } = {}) {
    if (snapshotId !== undefined && !digestPattern.test(snapshotId)) fail('ASSET_SNAPSHOT_INVALID');
    if (this.#selection && snapshotId && this.#selection !== snapshotId) fail('ASSET_SNAPSHOT_MISMATCH');
    if (!this.#descriptor) {
      this.#selection = snapshotId || null;
      this.#descriptor = (async () => {
        const data = await this.#request(snapshotId ? `releases/${snapshotId}/registry.json` : 'registry.json');
        assertValid('Registry', data);
        if (snapshotId && data.snapshot_id !== snapshotId) fail('ASSET_SNAPSHOT_MISMATCH');
        this.#selection = data.snapshot_id;
        return freeze(data);
      })();
    }
    const descriptor = await this.#descriptor;
    if (snapshotId && descriptor.snapshot_id !== snapshotId) fail('ASSET_SNAPSHOT_MISMATCH');
    return descriptor;
  }

  async searchAssets(request = {}) {
    assertValid('SearchRequest', request);
    const descriptor = await this.descriptor({ snapshotId: request.snapshot_id });
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...request, snapshot_id: descriptor.snapshot_id })) {
      if (value !== undefined) query.set(key, Array.isArray(value) ? value.join(',') : typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    const result = await this.#request(`v1/assets?${query}`);
    assertValid('SearchResponse', result);
    if (result.snapshot_id !== descriptor.snapshot_id || result.registry_id !== descriptor.registry_id) fail('ASSET_SNAPSHOT_MISMATCH');
    return result;
  }

  async describeAsset(assetId, { version, snapshotId } = {}) {
    if (!/^[a-z][a-z0-9._-]{0,127}$/.test(assetId)) fail('ASSET_ID_INVALID');
    if (version !== undefined) assertValid('AssetRef', { asset_id: assetId, version });
    const descriptor = await this.descriptor({ snapshotId });
    const query = new URLSearchParams({ snapshot_id: descriptor.snapshot_id });
    const result = await this.#request(`v1/assets/${assetId}${version ? `/versions/${version}` : ''}?${query}`);
    assertValid('Manifest', result);
    if (result.asset_id !== assetId || (version && result.version !== version)) fail('ASSET_MANIFEST_IDENTITY_MISMATCH');
    return result;
  }

  async checkCompatibility(request) {
    assertValid('CompatibilityRequest', request);
    const descriptor = await this.descriptor({ snapshotId: request.snapshot_id });
    const result = await this.#request('v1/compatibility/check', { body: { ...request, snapshot_id: descriptor.snapshot_id } });
    assertValid('CompatibilityResult', result);
    const refs = values => values.map(ref => `${ref.asset_id}@${ref.version}`).sort();
    if (canonicalJson(result.runtime) !== canonicalJson(request.runtime) || canonicalJson(refs(result.assets)) !== canonicalJson(refs(request.assets))) fail('ASSET_COMPATIBILITY_CONTEXT_MISMATCH');
    return result;
  }

  async resourceScope(request) {
    assertValid('ResourceScopeRequest', request);
    const descriptor = await this.descriptor({ snapshotId: request.snapshot_id });
    const result = await this.#request('v1/policies/resource-scope', { body: { ...request, snapshot_id: descriptor.snapshot_id } });
    assertValid('ResourceScope', result);
    if (result.snapshot_id !== descriptor.snapshot_id || result.registry_id !== descriptor.registry_id) fail('ASSET_SNAPSHOT_MISMATCH');
    const denied = [...new Set(result.denied_resource_sha256)].sort();
    const identity = { registry_id: result.registry_id, snapshot_id: result.snapshot_id, allowed_asset_ids: [...new Set(request.allowed_asset_ids)].sort(), denied_resource_sha256: denied };
    if (canonicalJson(denied) !== canonicalJson(result.denied_resource_sha256) || await sha256(encoder.encode(canonicalJson(identity))) !== result.scope_digest) fail('ASSET_RESOURCE_SCOPE_DIGEST_MISMATCH');
    return result;
  }

  async resolveAssembly(request) {
    assertValid('ResolveRequest', request);
    const descriptor = await this.descriptor({ snapshotId: request.snapshot_id });
    const result = await this.#request('v1/assemblies/resolve', { body: { ...request, snapshot_id: descriptor.snapshot_id } });
    await verifyLock(result);
    if (result.snapshot_id !== descriptor.snapshot_id || result.registry_id !== descriptor.registry_id || result.purpose !== request.purpose || canonicalJson(result.runtime) !== canonicalJson(request.runtime)) fail('ASSET_LOCK_CONTEXT_MISMATCH');
    for (const selected of request.assets) {
      const root = result.roots.find(ref => ref.asset_id === selected.asset_id);
      if (!root || !satisfiesVersion(root.version, selected.version)) fail('ASSET_LOCK_SELECTION_MISMATCH');
    }
    if (!request.assemblies?.length && result.roots.some(ref => !request.assets.some(selected => selected.asset_id === ref.asset_id))) fail('ASSET_LOCK_SELECTION_MISMATCH');
    for (const selected of request.assemblies || []) if (!result.assemblies.some(ref => ref.assembly_id === selected.assembly_id && ref.version === selected.version)) fail('ASSET_LOCK_SELECTION_MISMATCH');
    return result;
  }

  async locateArtifact(artifactId) {
    if (!/^sha256:[a-f0-9]{64}$/.test(artifactId)) fail('ASSET_ARTIFACT_ID_INVALID');
    const hash = artifactId.slice(7);
    if (this.#artifactRoot) return { contract_version: '1.0.0', artifact_id: artifactId, url: new URL(`artifacts/sha256/${hash.slice(0, 2)}/${hash}`, this.#artifactRoot).href, expires_at: null };
    const result = await this.#request(`v1/artifacts/${hash}`);
    assertValid('ArtifactLocation', result);
    if (result.artifact_id !== artifactId) fail('ASSET_ARTIFACT_IDENTITY_MISMATCH');
    httpUrl(result.url);
    return result;
  }

  async fetchManifestBytes(ref, { snapshotId } = {}) {
    assertValid('ManifestRef', ref);
    const descriptor = await this.descriptor({ snapshotId });
    const bytes = await this.#request(`v1/assets/${ref.asset_id}/versions/${ref.version}?snapshot_id=${descriptor.snapshot_id}`, { raw: true });
    if (await sha256(bytes) !== ref.manifest_digest) fail('ASSET_MANIFEST_DIGEST_MISMATCH');
    parseManifest(bytes, ref);
    return bytes;
  }

  async fetchManifest(ref, options) { return parseManifest(await this.fetchManifestBytes(ref, options), ref); }

  async fetchArtifact(artifact) {
    const { resource_id: _resourceId, logical_paths: _logicalPaths, ...identity } = artifact;
    assertValid('Artifact', identity);
    if (!Number.isSafeInteger(artifact.byte_length)) fail('ASSET_ARTIFACT_LENGTH_INVALID');
    const location = await this.locateArtifact(artifact.artifact_id);
    const bytes = await this.#request(httpUrl(location.url), { raw: true, limit: artifact.byte_length });
    if (bytes.byteLength !== artifact.byte_length || await sha256(bytes) !== artifact.sha256) fail('ASSET_ARTIFACT_INTEGRITY');
    return bytes;
  }
}
