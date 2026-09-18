import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '@worldkit/asset-contracts';
import { RegistryClient } from '../src/registry-client.mjs';
import { materializeAssets, readArtifact } from '../src/materialize.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const snapshot = digest('fixture-snapshot');
const code = expected => error => error.code === expected;
function seal(lock) { const { lock_digest: _, ...content } = lock; return { ...content, lock_digest: digest(canonicalJson(content)) }; }
const artifact = (bytes, role = 'runtime') => {
  const sha256 = digest(bytes);
  return { artifact_id: `sha256:${sha256}`, sha256, byte_length: bytes.length, mime_type: 'model/gltf-binary', format: 'glb', role, storage_path: `artifacts/sha256/${sha256.slice(0, 2)}/${sha256}` };
};

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'worldkit-assets-'));
  const payloads = [Buffer.from('selected root GLB'), Buffer.from('dependency GLB'), Buffer.from('preview GLB'), Buffer.from('unselected GLB')];
  const artifacts = payloads.map((bytes, i) => artifact(bytes, i === 2 ? 'preview' : 'runtime'));
  const resource = (index, id) => ({ ...artifacts[index], resource_id: id, logical_paths: [`${id}.glb`] });
  const manifest = (id, resources, dependencies = []) => ({
    kind: 'asset-manifest', contract_version: '1.0.0', asset_id: id, version: '1.0.0', taxonomy_version: '1.0.0',
    display_name: id, description: '', group: 'props', placeholder: false, model_resource_id: resources[0].resource_id,
    preview_resource_id: resources.find(r => r.role === 'preview')?.resource_id ?? null, resources, dependencies, runtime_requirements: [],
    sections: { asset: {}, capabilities: {}, bindings: {}, facts: {}, animations: [], provenance: {}, validation: {}, assembly: {} }, extensions: {},
  });
  const manifests = [manifest('root', [resource(0, 'model'), resource(2, 'preview')], [{ asset_id: 'dep', version: '1.0.0' }]), manifest('dep', [resource(1, 'model')]), manifest('other', [resource(3, 'model')])];
  const raw = manifests.map(m => Buffer.from(canonicalJson(m) + '\n'));
  const refs = manifests.map((m, i) => ({ asset_id: m.asset_id, version: m.version, manifest_digest: digest(raw[i]), manifest_path: `manifests/${m.asset_id}/${m.version}/manifest.json` }));
  const compatibility = { contract_version: '1.0.0', status: 'unknown', assets: refs.slice(0, 2).map(({ asset_id, version }) => ({ asset_id, version })), runtime: null, reasons: [], evidence: [] };
  let lock = seal({ kind: 'asset-lock', contract_version: '1.0.0', registry_id: 'whitebox-assets', snapshot_id: snapshot, taxonomy_version: '1.0.0', purpose: 'runtime', roots: [{ asset_id: 'root', version: '1.0.0' }], assets: refs.slice(0, 2), artifacts: artifacts.slice(0, 2), assemblies: [], runtime: null, compatibility });
  const descriptor = { kind: 'asset-registry', contract_version: '1.0.0', registry_id: 'whitebox-assets', snapshot_id: snapshot, taxonomy_version: '1.0.0', audience: 'internal', index_path: `indexes/${snapshot}.json`, index_digest: snapshot, endpoints: { search: 'v1/assets', describe: 'v1/assets', compatibility: 'v1/compatibility/check', resolve: 'v1/assemblies/resolve', artifacts: 'v1/artifacts' } };
  const requests = [], downloads = [];
  let corruptArtifact = false, corruptManifest = false, redirect = false;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture'); requests.push(url);
    const json = data => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)); };
    if (url.pathname === '/registry.json' || url.pathname === `/releases/${snapshot}/registry.json`) return json(descriptor);
    if (url.pathname === '/v1/assets') return json({ contract_version: '1.0.0', registry_id: 'whitebox-assets', snapshot_id: snapshot, items: refs.map((ref, i) => ({ ...ref, display_name: ref.asset_id, description: '', group: 'props', stage: 'candidate', license_status: 'unknown', license_id: null, placeholder: false, preview: i === 0 ? artifacts[2] : null, morphology: [], movement: [], capabilities: [], readiness: { previewable: true, runtime: 'unknown' }, requirements: [] })), next_cursor: null });
    if (url.pathname === '/v1/compatibility/check') return json(compatibility);
    if (url.pathname === '/v1/policies/resource-scope') {
      let input = ''; for await (const chunk of req) input += chunk;
      const body = JSON.parse(input), denied_resource_sha256 = [artifacts[3].sha256];
      return json({ contract_version: '1.0.0', registry_id: 'whitebox-assets', snapshot_id: snapshot, denied_resource_sha256, scope_digest: digest(canonicalJson({ registry_id: 'whitebox-assets', snapshot_id: snapshot, allowed_asset_ids: [...new Set(body.allowed_asset_ids)].sort(), denied_resource_sha256 })) });
    }
    if (url.pathname === '/v1/assemblies/resolve') return json(lock);
    const match = url.pathname.match(/^\/v1\/assets\/([^/]+)(?:\/versions\/1\.0\.0)?$/);
    if (match) { const i = manifests.findIndex(m => m.asset_id === match[1]); if (i >= 0) return res.end(corruptManifest ? Buffer.concat([raw[i], Buffer.from(' ')]) : raw[i]); }
    if (url.pathname.startsWith('/v1/artifacts/')) {
      const a = artifacts.find(a => url.pathname.endsWith(a.sha256));
      if (a) return json({ contract_version: '1.0.0', artifact_id: a.artifact_id, url: `${base}/${a.storage_path}`, expires_at: null });
    }
    if (url.pathname.startsWith('/artifacts/sha256/')) {
      const i = artifacts.findIndex(a => url.pathname === '/' + a.storage_path);
      if (i >= 0) { downloads.push(artifacts[i].artifact_id); if (redirect) { res.writeHead(302, { location: '/elsewhere' }); return res.end(); } return res.end(corruptArtifact ? Buffer.alloc(payloads[i].length) : payloads[i]); }
    }
    res.statusCode = 404; json({ error: { code: 'ASSET_NOT_FOUND', message: 'Unknown asset', retryable: false, details: { fixture: true } } });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  return { root, artifacts, manifests, refs, requests, downloads, raw, payloads, base, lock, client: new RegistryClient({ registryUrl: base }),
    setLock(value) { lock = value; }, corruptArtifact(value) { corruptArtifact = value; }, corruptManifest(value) { corruptManifest = value; }, redirect(value) { redirect = value; } };
}

test('metadata operations pin snapshot and transfer no artifact bytes', async t => {
  const f = await fixture(t);
  assert.equal((await f.client.searchAssets({ asset_ids: ['root'], limit: 2 })).items.length, 3);
  assert.equal((await f.client.describeAsset('root')).asset_id, 'root');
  assert.equal((await f.client.checkCompatibility({ assets: f.lock.compatibility.assets, runtime: null })).status, 'unknown');
  assert.deepEqual((await f.client.resourceScope({ allowed_asset_ids: ['root', 'dep'] })).denied_resource_sha256, [f.artifacts[3].sha256]);
  assert.deepEqual(await f.client.resolveAssembly({ assets: [{ asset_id: 'root', version: 'latest' }], purpose: 'runtime', runtime: null }), f.lock);
  assert.deepEqual(await f.client.fetchManifest(f.refs[0]), f.manifests[0]);
  assert.equal(f.downloads.length, 0);
  assert.ok(f.requests.filter(url => url.pathname.startsWith('/v1/assets')).every(url => url.searchParams.get('snapshot_id') === snapshot));
  await assert.rejects(f.client.descriptor({ snapshotId: digest('another') }), code('ASSET_SNAPSHOT_MISMATCH'));
  const selected = await f.client.descriptor(); assert.ok(Object.isFrozen(selected));
  await assert.rejects(f.client.describeAsset('missing'), error => error.code === 'ASSET_NOT_FOUND' && error.status === 404 && error.details.fixture);
});

test('transport invokes injected browser fetch without binding RegistryClient as receiver',async t=>{
  const f=await fixture(t);
  const client=new RegistryClient({registryUrl:f.base,fetch:function(...args){assert.equal(this,undefined);return fetch(...args);}});
  assert.equal((await client.descriptor()).snapshot_id,snapshot);
});

test('only selected runtime closure is fetched; offline replay uses exact cached manifests', async t => {
  const f = await fixture(t), cacheRoot = path.join(f.root, 'cache');
  const outputRoot = path.join(f.root, 'delivery');
  const result = await materializeAssets(f.lock, { client: f.client, cacheRoot, outputRoot });
  assert.deepEqual(new Set(f.downloads), new Set(f.artifacts.slice(0, 2).map(a => a.artifact_id)));
  assert.equal(result.manifests.length, 2);
  assert.deepEqual(await readFile(result.files[f.artifacts[0].artifact_id]), f.payloads[0]);
  const requests = f.requests.length;
  const offline = await materializeAssets(f.lock, { cacheRoot, offline: true });
  assert.equal(Object.keys(offline.files).length, 2); assert.equal(f.requests.length, requests);
  const manifestCache = path.join(cacheRoot, 'manifests/sha256', f.refs[0].manifest_digest.slice(0, 2), f.refs[0].manifest_digest);
  assert.deepEqual(await readFile(manifestCache), f.raw[0]);
  await writeFile(manifestCache, '{}');
  await assert.rejects(materializeAssets(f.lock, { cacheRoot, offline: true }), code('ASSET_MANIFEST_CACHE_INTEGRITY'));
  await materializeAssets(f.lock, { client: f.client, cacheRoot });
  assert.deepEqual(await readFile(manifestCache), f.raw[0]);
});

test('parallel same-hash requests deduplicate; corrupt cache repairs online and rejects offline', async t => {
  const f = await fixture(t), cacheRoot = path.join(f.root, 'cache'), a = f.artifacts[0];
  const buffers = await Promise.all(Array.from({ length: 8 }, () => readArtifact(a, { client: f.client, cacheRoot })));
  assert.equal(f.downloads.length, 1); assert.ok(buffers.every(bytes => bytes.equals(f.payloads[0])));
  const filename = path.join(cacheRoot, a.storage_path); await writeFile(filename, Buffer.alloc(a.byte_length));
  await assert.rejects(readArtifact(a, { cacheRoot, offline: true }), code('ASSET_CACHE_INTEGRITY'));
  assert.deepEqual(await readArtifact(a, { client: f.client, cacheRoot }), f.payloads[0]); assert.equal(f.downloads.length, 2);
  await assert.rejects(readArtifact(f.artifacts[1], { cacheRoot, offline: true }), code('ASSET_CACHE_MISS'));
});

test('tampered lock, raw manifest digest, artifact closure, and dependency versions reject before media', async t => {
  const f = await fixture(t), cacheRoot = path.join(f.root, 'cache');
  await assert.rejects(materializeAssets({ ...f.lock, purpose: 'preview' }, { client: f.client, cacheRoot }), code('ASSET_LOCK_DIGEST_MISMATCH'));
  f.corruptManifest(true);
  await assert.rejects(materializeAssets(f.lock, { client: f.client, cacheRoot }), code('ASSET_MANIFEST_DIGEST_MISMATCH'));
  f.corruptManifest(false);
  await assert.rejects(materializeAssets(seal({ ...f.lock, artifacts: [...f.lock.artifacts, f.artifacts[3]] }), { client: f.client, cacheRoot }), code('ASSET_LOCK_ARTIFACT_CLOSURE_MISMATCH'));
  await assert.rejects(materializeAssets(seal({ ...f.lock, assets: [f.refs[0]] }), { client: f.client, cacheRoot }), code('ASSET_LOCK_DEPENDENCY_MISMATCH'));
  await assert.rejects(materializeAssets(seal({ ...f.lock, roots: [{ asset_id: 'root', version: '2.0.0' }] }), { client: f.client, cacheRoot }), code('ASSET_LOCK_DEPENDENCY_MISMATCH'));
  assert.equal(f.downloads.length, 0);
});

test('preview purpose adds preview resources; independently configured artifact base works', async t => {
  const f = await fixture(t), cacheRoot = path.join(f.root, 'cache');
  const lock = seal({ ...f.lock, purpose: 'preview', artifacts: f.artifacts.slice(0, 3) });
  const client = new RegistryClient({ registryUrl: f.base, artifactBaseUrl: f.base });
  await materializeAssets(lock, { client, cacheRoot });
  assert.equal(f.downloads.length, 3);
  assert.equal(f.requests.filter(url => url.pathname.startsWith('/v1/artifacts/')).length, 0);
});

test('artifact hash and length validation rejects tampering and redirects', async t => {
  const f = await fixture(t);
  f.corruptArtifact(true);
  await assert.rejects(f.client.fetchArtifact(f.artifacts[0]), code('ASSET_ARTIFACT_INTEGRITY'));
  f.corruptArtifact(false);
  await assert.rejects(f.client.fetchArtifact({ ...f.artifacts[0], byte_length: 1 }), code('ASSET_RESPONSE_TOO_LARGE'));
  f.redirect(true);
  await assert.rejects(f.client.fetchArtifact(f.artifacts[0]), code('ASSET_TRANSPORT_FAILED'));
  assert.equal(f.requests.filter(url => url.pathname === '/elsewhere').length, 0);
});

test('cache and output symlinks and remote traversal paths are rejected', async t => {
  const f = await fixture(t), outside = path.join(f.root, 'outside'), cacheRoot = path.join(f.root, 'cache');
  await mkdir(outside); await mkdir(cacheRoot);
  await symlink(outside, path.join(cacheRoot, 'artifacts'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(readArtifact(f.artifacts[0], { client: f.client, cacheRoot }), code('ASSET_CACHE_SYMLINK'));
  assert.equal(f.downloads.length, 0);
  await assert.rejects(readArtifact({ ...f.artifacts[0], storage_path: '../escape' }, { client: f.client, cacheRoot }), error => /ASSET_CONTRACT/.test(error.code));
  const outputRoot = path.join(f.root, 'output'); await symlink(outside, outputRoot, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(materializeAssets(f.lock, { client: f.client, cacheRoot: path.join(f.root, 'good-cache'), outputRoot }), code('ASSET_CACHE_SYMLINK'));
});

test('resource scope digest binds allowed selection and denied hashes', async t => {
  const f = await fixture(t);
  const client = new RegistryClient({ registryUrl: f.base, fetch: async (...args) => {
    const response = await fetch(...args);
    if (!args[0].endsWith('/v1/policies/resource-scope')) return response;
    const result = await response.json(); result.denied_resource_sha256 = [];
    return new Response(JSON.stringify(result), { status: 200 });
  } });
  await assert.rejects(client.resourceScope({ allowed_asset_ids: ['root'] }), code('ASSET_RESOURCE_SCOPE_DIGEST_MISMATCH'));
  assert.equal(f.downloads.length, 0);
});

test('materialization joins in-flight writes before reporting another worker failure',async t=>{
  const f=await fixture(t),cacheRoot=path.join(f.root,'cache');
  let releaseSecond,secondStarted;
  const started=new Promise(resolve=>{secondStarted=resolve;});
  const release=new Promise(resolve=>{releaseSecond=resolve;});
  const client={
    descriptor:options=>f.client.descriptor(options),
    fetchManifestBytes:(ref,options)=>f.client.fetchManifestBytes(ref,options),
    fetchArtifact:async artifact=>{
      if(artifact.artifact_id===f.artifacts[0].artifact_id){await started;throw Object.assign(new Error('First transfer failed'),{code:'ASSET_ARTIFACT_INTEGRITY'});}
      secondStarted();await release;return f.payloads[1];
    },
  };
  let settled=false;
  const result=materializeAssets(f.lock,{client,cacheRoot}).then(value=>{settled=true;return value;},error=>{settled=true;throw error;});
  const rejected=assert.rejects(result,code('ASSET_ARTIFACT_INTEGRITY'));
  await started;
  await new Promise(resolve=>setImmediate(resolve));
  const rejectedBeforeCleanup=settled;
  releaseSecond();await rejected;
  assert.equal(rejectedBeforeCleanup,false,'in-flight cache writes must finish before rejection');
  assert.deepEqual(await readFile(path.join(cacheRoot,f.artifacts[1].storage_path)),f.payloads[1]);
});

test('lock selection and dependency cycles are rejected before artifact transport', async t => {
  const f = await fixture(t), cacheRoot = path.join(f.root, 'cache');
  f.setLock(seal({ ...f.lock, roots: [{ asset_id: 'dep', version: '1.0.0' }] }));
  await assert.rejects(f.client.resolveAssembly({ assets: [{ asset_id: 'root', version: 'latest' }], purpose: 'runtime', runtime: null }), code('ASSET_LOCK_SELECTION_MISMATCH'));
  f.manifests[1].dependencies = [{ asset_id: 'root', version: '1.0.0' }];
  f.raw[1] = Buffer.from(canonicalJson(f.manifests[1]) + '\n'); f.refs[1].manifest_digest = digest(f.raw[1]);
  await assert.rejects(materializeAssets(seal(f.lock), { client: f.client, cacheRoot }), code('ASSET_DEPENDENCY_CYCLE'));
  assert.equal(f.downloads.length, 0);
  await assert.rejects(materializeAssets(seal(f.lock), { cacheRoot: path.join(f.root, 'empty'), offline: true }), code('ASSET_MANIFEST_CACHE_MISS'));
});

test('CLI search, describe, manifest resolve, online fetch and offline replay', async t => {
  const f = await fixture(t), run = promisify(execFile), cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  const invoke = async args => JSON.parse((await run(process.execPath, [cli, ...args])).stdout);
  assert.equal((await invoke(['search', 'root', '--registry', f.base])).snapshot_id, snapshot);
  assert.equal((await invoke(['describe', 'root', '--registry', f.base, '--version', '1.0.0'])).asset_id, 'root');
  const requestPath = path.join(f.root, 'request.json'), lockPath = path.join(f.root, 'lock.json');
  await writeFile(requestPath, JSON.stringify({ assets: [{ asset_id: 'root', version: 'latest' }], purpose: 'runtime', runtime: null }));
  const lock = await invoke(['resolve', '--manifest', requestPath, '--registry', f.base]);
  assert.deepEqual(lock, f.lock); assert.equal(f.downloads.length, 0);
  await writeFile(lockPath, JSON.stringify(lock));
  const cacheRoot = path.join(f.root, 'cache');
  assert.equal(Object.keys((await invoke(['fetch', '--lock', lockPath, '--registry', f.base, '--cache', cacheRoot])).files).length, 2);
  const requests = f.requests.length;
  assert.equal(Object.keys((await invoke(['fetch', '--lock', lockPath, '--cache', cacheRoot, '--offline'])).files).length, 2);
  assert.equal(f.requests.length, requests);
});
