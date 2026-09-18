import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalJson, protocolError } from '@worldkit/asset-contracts';
import { assertValid } from '@worldkit/asset-contracts/validate';
import { parseManifest, sha256, verifyLock } from './registry-client.mjs';

const pending = new Map();
const fail = (code, message = code) => { throw protocolError(code, message); };
const artifactFields = ['artifact_id', 'sha256', 'byte_length', 'mime_type', 'format', 'role', 'storage_path'];
const asArtifact = resource => Object.fromEntries(artifactFields.map(key => [key, resource[key]]));

// Inspect every existing ancestor, including the caller's cache/output root.
// Caller roots are trusted configuration; remote paths never select local names.
async function safePath(root, relative, create = false) {
  if (typeof root !== 'string' || !root) fail('ASSET_CACHE_ROOT_REQUIRED');
  const absoluteRoot = path.resolve(root);
  const destination = path.resolve(absoluteRoot, relative);
  if (!destination.startsWith(absoluteRoot + path.sep)) fail('ASSET_CACHE_PATH_INVALID');
  const { root: volume } = path.parse(destination);
  const parts = destination.slice(volume.length).split(path.sep);
  let current = volume;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = await lstat(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (create && i < parts.length - 1) {
        try { await mkdir(current); } catch (creation) { if (creation.code !== 'EEXIST') throw creation; }
        stat = await lstat(current);
      }
    }
    if (stat?.isSymbolicLink()) fail('ASSET_CACHE_SYMLINK');
    if (stat && (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) fail('ASSET_CACHE_PATH_INVALID');
  }
  return destination;
}

async function readCached(root, relative) {
  const destination = await safePath(root, relative);
  let file;
  try { file = await open(destination, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  try {
    if (!(await file.stat()).isFile()) fail('ASSET_CACHE_PATH_INVALID');
    return await file.readFile();
  } finally { await file.close(); }
}

async function atomicWrite(root, relative, bytes) {
  const destination = await safePath(root, relative, true);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  let file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(bytes); await file.sync(); await file.close(); file = null;
    await safePath(root, relative);
    await rename(temporary, destination);
  } finally {
    await file?.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  return destination;
}

async function deduplicate(key, action) {
  if (!pending.has(key)) pending.set(key, action());
  const promise = pending.get(key);
  try { return await promise; } finally { if (pending.get(key) === promise) pending.delete(key); }
}

function artifactPath(artifact) { return `artifacts/sha256/${artifact.sha256.slice(0, 2)}/${artifact.sha256}`; }
function manifestPath(ref) { return `manifests/sha256/${ref.manifest_digest.slice(0, 2)}/${ref.manifest_digest}`; }
async function validArtifact(bytes, artifact) { return bytes !== null && bytes.byteLength === artifact.byte_length && await sha256(bytes) === artifact.sha256; }

export async function readArtifact(resource, { client, cacheRoot, offline = false }) {
  const artifact = asArtifact(resource);
  assertValid('Artifact', artifact);
  if (!Number.isSafeInteger(artifact.byte_length)) fail('ASSET_ARTIFACT_LENGTH_INVALID');
  const relative = artifactPath(artifact);
  await safePath(cacheRoot, relative);
  const bytes = await deduplicate(`${path.resolve(cacheRoot)}:artifact:${artifact.sha256}:${offline}`, async () => {
    const cached = await readCached(cacheRoot, relative);
    if (await validArtifact(cached, artifact)) return cached;
    if (offline) fail(cached === null ? 'ASSET_CACHE_MISS' : 'ASSET_CACHE_INTEGRITY');
    if (!client) fail('ASSET_CLIENT_REQUIRED');
    const fetched = Buffer.from(await client.fetchArtifact(artifact));
    if (!await validArtifact(fetched, artifact)) fail('ASSET_ARTIFACT_INTEGRITY');
    await atomicWrite(cacheRoot, relative, fetched);
    return fetched;
  });
  // Every caller checks its own declared length even when transport was shared.
  if (!await validArtifact(bytes, artifact)) fail('ASSET_ARTIFACT_INTEGRITY');
  return Buffer.from(bytes);
}

async function readManifest(ref, { client, cacheRoot, offline, snapshotId }) {
  const relative = manifestPath(ref);
  const bytes = await deduplicate(`${path.resolve(cacheRoot)}:manifest:${ref.manifest_digest}:${offline}`, async () => {
    const cached = await readCached(cacheRoot, relative);
    if (cached !== null && await sha256(cached) === ref.manifest_digest) return cached;
    if (offline) fail(cached === null ? 'ASSET_MANIFEST_CACHE_MISS' : 'ASSET_MANIFEST_CACHE_INTEGRITY');
    if (!client) fail('ASSET_CLIENT_REQUIRED');
    const fetched = Buffer.from(await client.fetchManifestBytes(ref, { snapshotId }));
    if (await sha256(fetched) !== ref.manifest_digest) fail('ASSET_MANIFEST_DIGEST_MISMATCH');
    parseManifest(fetched, ref);
    await atomicWrite(cacheRoot, relative, fetched);
    return fetched;
  });
  return parseManifest(bytes, ref);
}

function verifyClosure(lock, manifests) {
  const byId = new Map(manifests.map(manifest => [manifest.asset_id, manifest]));
  const visited = new Set(), active = new Set();
  function visit(ref) {
    const manifest = byId.get(ref.asset_id);
    if (!manifest || manifest.version !== ref.version) fail('ASSET_LOCK_DEPENDENCY_MISMATCH');
    if (active.has(ref.asset_id)) fail('ASSET_DEPENDENCY_CYCLE');
    if (visited.has(ref.asset_id)) return;
    if (manifest.taxonomy_version !== lock.taxonomy_version) fail('ASSET_LOCK_CONTEXT_MISMATCH');
    active.add(ref.asset_id);
    for (const dependency of manifest.dependencies) visit(dependency);
    active.delete(ref.asset_id); visited.add(ref.asset_id);
  }
  const roots = new Set();
  for (const root of lock.roots) {
    if (roots.has(root.asset_id)) fail('ASSET_LOCK_DUPLICATE_ROOT');
    roots.add(root.asset_id); visit(root);
  }
  if (visited.size !== manifests.length) fail('ASSET_LOCK_EXTRANEOUS_ASSET');
  const expected = new Map();
  for (const manifest of manifests) for (const resource of manifest.resources) {
    if (lock.purpose === 'runtime' && resource.role !== 'runtime') continue;
    const artifact = asArtifact(resource), prior = expected.get(artifact.artifact_id);
    if (prior) {
      // One hash may serve both preview and runtime; runtime wins deterministically.
      const role = prior.role === 'runtime' || artifact.role === 'runtime' ? 'runtime' : 'preview';
      if (canonicalJson({ ...prior, role }) !== canonicalJson({ ...artifact, role })) fail('ASSET_ARTIFACT_METADATA_CONFLICT');
      artifact.role = role;
    }
    expected.set(artifact.artifact_id, artifact);
  }
  if (expected.size !== lock.artifacts.length) fail('ASSET_LOCK_ARTIFACT_CLOSURE_MISMATCH');
  for (const artifact of lock.artifacts) if (canonicalJson(expected.get(artifact.artifact_id) ?? null) !== canonicalJson(artifact)) fail('ASSET_LOCK_ARTIFACT_CLOSURE_MISMATCH');
  if (canonicalJson(lock.compatibility.runtime) !== canonicalJson(lock.runtime)) fail('ASSET_LOCK_CONTEXT_MISMATCH');
  const exactRefs = refs => refs.map(ref => `${ref.asset_id}@${ref.version}`).sort();
  if (canonicalJson(exactRefs(lock.compatibility.assets)) !== canonicalJson(exactRefs(lock.assets))) fail('ASSET_LOCK_COMPATIBILITY_MISMATCH');
  for (const evidence of lock.compatibility.evidence) {
    const ref = lock.assets.find(item => item.asset_id === evidence.asset_id);
    if (!ref || ref.version !== evidence.version || ref.manifest_digest !== evidence.manifest_digest) fail('ASSET_LOCK_EVIDENCE_MISMATCH');
  }
  const assemblies = new Set();
  for (const assembly of lock.assemblies) {
    if (assemblies.has(assembly.assembly_id)) fail('ASSET_LOCK_DUPLICATE_ASSEMBLY');
    assemblies.add(assembly.assembly_id);
  }
}

export async function materializeAssets(input, { client, cacheRoot, outputRoot, offline = false }) {
  // Detach caller-owned objects before awaits so the verified identity cannot change mid-flight.
  const lock = JSON.parse(canonicalJson(input));
  await verifyLock(lock);
  if (!offline) {
    if (!client) fail('ASSET_CLIENT_REQUIRED');
    const descriptor = await client.descriptor({ snapshotId: lock.snapshot_id });
    if (descriptor.registry_id !== lock.registry_id || descriptor.taxonomy_version !== lock.taxonomy_version) fail('ASSET_LOCK_CONTEXT_MISMATCH');
  }
  const manifests = [];
  // Finish all metadata/closure validation before requesting any artifact bytes.
  for (const ref of lock.assets) manifests.push(await readManifest(ref, { client, cacheRoot, offline, snapshotId: lock.snapshot_id }));
  verifyClosure(lock, manifests);
  const files = {};
  // Bounded parallelism; shared hashes also coalesce across materialize calls.
  let next = 0, failure;
  await Promise.all(Array.from({ length: Math.min(4, lock.artifacts.length) }, async () => {
    try {
      while (!failure && next < lock.artifacts.length) {
        const artifact = lock.artifacts[next++];
        const bytes = await readArtifact(artifact, { client, cacheRoot, offline });
        files[artifact.artifact_id] = outputRoot
          ? await atomicWrite(outputRoot, artifactPath(artifact), bytes)
          : await safePath(cacheRoot, artifactPath(artifact));
      }
    } catch (error) {
      // Join in-flight writes before rejecting so callers can safely clean up roots.
      failure ||= error;
    }
  }));
  if (failure) throw failure;
  return { files, manifests, lock };
}
