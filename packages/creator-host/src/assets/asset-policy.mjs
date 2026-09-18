import { createHash } from 'node:crypto';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
  return value;
}
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `: ${detail}` : ''}`); };
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function keys(value, expected, code) {
  if (!record(value) || Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) fail(code);
}
function policyOf(value) {
  const code = 'THREE_ASSET_POLICY_INVALID';
  keys(value, ['schemaVersion', 'allowedAssetIds', 'defaultHumanoidAssetId', 'allowCustomAssets'], code);
  if (value.schemaVersion !== 1 || typeof value.allowCustomAssets !== 'boolean'
      || !Array.isArray(value.allowedAssetIds) || value.allowedAssetIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id))
      || new Set(value.allowedAssetIds).size !== value.allowedAssetIds.length
      || !value.allowedAssetIds.includes(value.defaultHumanoidAssetId)) fail(code);
  return structuredClone(value);
}
function publicValue(value) {
  if (Array.isArray(value)) return value.map(publicValue);
  if (record(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'sourcePath').map(([key, child]) => [key, publicValue(child)]));
  return value;
}
const resources = asset => [asset, ...(asset.resources ?? [])];
function resourcePath(resource) {
  if (!hex(resource.sha256) || !Number.isSafeInteger(resource.byteLength) || resource.byteLength <= 0
      || !new RegExp(`^\\./assets/(subjects|resources)/${resource.sha256}\\.[a-z0-9]+$`).test(resource.uri)) fail('THREE_ASSET_POLICY_RESOURCE_INVALID');
  return resource.uri.slice(2);
}
function checkAssets(policy, assets) {
  if (!Array.isArray(assets) || assets.length !== policy.allowedAssetIds.length) fail('THREE_ASSET_POLICY_CATALOG_INVALID');
  const ids = assets.map(asset => asset?.id);
  if (new Set(ids).size !== ids.length || policy.allowedAssetIds.some(id => !ids.includes(id))) fail('THREE_ASSET_POLICY_CATALOG_INVALID');
  for (const asset of assets) {
    if (!record(asset) || !record(asset.actions) || (asset.resources !== undefined && !Array.isArray(asset.resources))) fail('THREE_ASSET_POLICY_CATALOG_INVALID');
    for (const resource of resources(asset)) resourcePath(resource);
    if (canonical(publicValue(asset)) !== canonical(asset)) fail('THREE_ASSET_POLICY_PRIVATE_PATH');
  }
  const humanoid = assets.find(asset => asset.id === policy.defaultHumanoidAssetId);
  if (!humanoid.locomotionBindingIds?.includes('locomotion.ground')
      || ['idle','walk','run','jump'].some(id => !humanoid.actions[id])
      || !(humanoid.recommendedBody?.heightMeters > 0) || !(humanoid.recommendedBody?.radiusMeters > 0)) fail('THREE_ASSET_POLICY_DEFAULT_UNSUPPORTED');
}

export function createAssetPolicySnapshot(value, catalog, additionalDeniedHashes=[]) {
  const policy = policyOf(value);
  if (!Array.isArray(catalog) || new Set(catalog.map(a => a.id)).size !== catalog.length) fail('THREE_ASSET_POLICY_CATALOG_INVALID');
  const allowedAssets = policy.allowedAssetIds.map(id => {
    const asset = catalog.find(a => a.id === id);
    if (!asset) fail('THREE_ASSET_POLICY_UNKNOWN_ASSET', id);
    return publicValue(asset);
  });
  checkAssets(policy, allowedAssets);
  const allowedHashes = new Set(allowedAssets.flatMap(resources).map(resource => resource.sha256));
  if(!Array.isArray(additionalDeniedHashes)||additionalDeniedHashes.some(sha=>!hex(sha)))fail('THREE_ASSET_POLICY_SCOPE_INVALID');
  const deniedResourceSha256 = [...new Set([...additionalDeniedHashes,...catalog.filter(a => !policy.allowedAssetIds.includes(a.id))
    .flatMap(resources).map(resource => { resourcePath(resource); return resource.sha256; })
    ].filter(sha => !allowedHashes.has(sha)))].sort();
  return {kind:'three-creator-asset-policy-snapshot',schemaVersion:1,policy,allowedAssets,deniedResourceSha256};
}

export function validateAssetPolicySnapshot(value) {
  keys(value, ['kind','schemaVersion','policy','allowedAssets','deniedResourceSha256'], 'THREE_ASSET_POLICY_SNAPSHOT_INVALID');
  if (value.kind !== 'three-creator-asset-policy-snapshot' || value.schemaVersion !== 1) fail('THREE_ASSET_POLICY_SNAPSHOT_INVALID');
  const policy = policyOf(value.policy); checkAssets(policy, value.allowedAssets);
  const denied = value.deniedResourceSha256;
  if (!Array.isArray(denied) || denied.some(sha => !hex(sha)) || new Set(denied).size !== denied.length
      || value.allowedAssets.flatMap(resources).some(resource => denied.includes(resource.sha256))) fail('THREE_ASSET_POLICY_SNAPSHOT_INVALID');
  return structuredClone(value);
}
export function assetPolicyHash(snapshot) { return hash(canonical(validateAssetPolicySnapshot(snapshot))); }

const mediaFile = /\.(?:glb|gltf|bin|png|jpe?g|webp|gif|svg|mp3|ogg|wav|woff2?|ttf)$/i;
const reserved = name => ['asset-policy.json','asset-definitions.json','project.assets.json','project.assets.lock.json'].includes(name) || /^(runtime|compiled)\//.test(name);
function checkFiles(snapshot, files, source) {
  const denied = new Set(snapshot.deniedResourceSha256);
  const allowed = new Set(snapshot.allowedAssets.flatMap(resources).map(resource => resource.sha256));
  for (const [name, bytes] of Object.entries(files)) {
    if (source && reserved(name)) fail('THREE_ASSET_POLICY_RESERVED_FILE', name);
    const contentHash = hash(bytes);
    if (denied.has(contentHash)) fail('THREE_ASSET_POLICY_RESOURCE_DENIED', name);
    // These are generated by the trusted compiler, never copied from author roots.
    if (!source && reserved(name)) continue;
    let asset = mediaFile.test(name);
    if (/\.json$/i.test(name) && !['project.json','episode.json'].includes(name)) {
      try { const value = JSON.parse(Buffer.from(bytes).toString());
        asset ||= value?.asset?.version === '2.0' || Array.isArray(value?.tracks)
          || ['Object','Geometry','BufferGeometry','Material','Texture'].includes(value?.metadata?.type);
      } catch { /* Ordinary game data may be non-JSON; compilation owns syntax. */ }
    }
    if (!snapshot.policy.allowCustomAssets && asset && !allowed.has(contentHash)) fail('THREE_CUSTOM_ASSET_NOT_ALLOWED', name);
    // Exact embedded data URLs are also inspectable; arbitrary generated JS is
    // deliberately not described as a complete provenance/security boundary.
    if (/\.(?:html|[cm]?js|jsx|tsx?|json|css|gltf|svg)$/i.test(name)) {
      const text = Buffer.from(bytes).toString();
      for (const match of text.matchAll(/data:[^\s"'<>;,]*;base64,([a-zA-Z0-9+/=]+)/g)) {
        const embeddedHash = hash(Buffer.from(match[1], 'base64'));
        if (denied.has(embeddedHash)) fail('THREE_ASSET_POLICY_RESOURCE_DENIED', name);
        if (!snapshot.policy.allowCustomAssets && !allowed.has(embeddedHash)) fail('THREE_CUSTOM_ASSET_NOT_ALLOWED', name);
      }
    }
  }
}
export function verifyAssetPolicySources(snapshot, files) { checkFiles(validateAssetPolicySnapshot(snapshot), files, true); }

export function verifyAssetPolicyBundle({snapshot,expectedHash,sourceFiles,playableFiles,assetDefinitions}) {
  snapshot = validateAssetPolicySnapshot(snapshot);
  if (!hex(expectedHash) || assetPolicyHash(snapshot) !== expectedHash) fail('THREE_ASSET_POLICY_HASH_MISMATCH');
  checkFiles(snapshot, sourceFiles, true); checkFiles(snapshot, playableFiles, false);
  const carried = playableFiles['asset-policy.json'];
  if (!carried || assetPolicyHash(JSON.parse(Buffer.from(carried).toString())) !== expectedHash) fail('THREE_ASSET_POLICY_HASH_MISMATCH');
  const project = sourceFiles['project.json'] ? JSON.parse(Buffer.from(sourceFiles['project.json']).toString()) : {schemaVersion:1,assetIds:[]};
  if (project.schemaVersion !== 1 || !Array.isArray(project.assetIds) || project.assetIds.some(id => typeof id !== 'string')
      || new Set(project.assetIds).size !== project.assetIds.length) fail('THREE_PROJECT_INVALID');
  const selected = project.assetIds.map(id => {
    const asset = snapshot.allowedAssets.find(a => a.id === id);
    if (!asset) fail('THREE_ASSET_POLICY_DENIED', id); return asset;
  });
  if (!record(assetDefinitions) || assetDefinitions.schemaVersion !== 1 || !Array.isArray(assetDefinitions.assets)
      || canonical(assetDefinitions.assets) !== canonical(selected)) fail('THREE_ASSET_POLICY_DEFINITIONS_MISMATCH');
  const definitionsFile = playableFiles['asset-definitions.json'];
  if (!definitionsFile || canonical(JSON.parse(Buffer.from(definitionsFile).toString())) !== canonical(assetDefinitions)) fail('THREE_ASSET_POLICY_DEFINITIONS_MISMATCH');
  for (const resource of selected.flatMap(resources)) {
    const file = resourcePath(resource), bytes = playableFiles[file];
    if (!bytes || bytes.byteLength !== resource.byteLength || hash(bytes) !== resource.sha256) fail('THREE_ASSET_POLICY_RESOURCE_MISMATCH', file);
  }
}
