import fs from 'node:fs';
import path from 'node:path';
import {ROOT, collect, inside, latest, read, sha256, write} from './core.mjs';
import {readPhysicalFacts} from './content-facts.mjs';

const libraryReadinessNote = '资源预览不等于控制器、碰撞或骑乘验证。';

function logicalPath(value) {
  if (typeof value !== 'string' || !value || value.split('/').some(part => !part || part === '.' || part === '..') || /[\\?#\0:]/.test(value)) {
    throw Error('INVALID_WHITEBOX_LOGICAL_PATH: ' + value);
  }
  return value;
}

/** Build the immutable delivery adapter from the selected library, never a previous catalog. */
export function buildWhiteboxCatalog(root = ROOT, {allVersions = false} = {}) {
  const subjects = collect(root);
  const versions = new Map(latest(subjects.map(s => s.asset)).map(a => [a.asset_id, a.asset_version]));
  const checked = new Map();
  const assets = [];
  function resource(file, namespace, alias) {
    logicalPath(file.path);
    const absolute = inside(root, file.path);
    if (!fs.existsSync(absolute)) throw Error('WHITEBOX_RESOURCE_MISSING: ' + file.path);
    if (!checked.has(file.path)) {
      const bytes = fs.readFileSync(absolute);
      checked.set(file.path, {sha256:sha256(bytes), byteLength:bytes.length});
    }
    const actual = checked.get(file.path);
    if (actual.sha256 !== file.sha256 || actual.byteLength !== file.byte_length) throw Error('WHITEBOX_RESOURCE_HASH_MISMATCH: ' + file.path);
    const extension = path.posix.extname(file.path).toLowerCase();
    if (!/^\.[a-z0-9]+$/.test(extension)) throw Error('WHITEBOX_RESOURCE_EXTENSION: ' + file.path);
    return {...(alias ? {path:logicalPath(alias)} : {}), uri:`./assets/${namespace}/${actual.sha256}${extension}`, ...actual, sourcePath:'asset-library/' + file.path};
  }
  for (const subject of subjects) {
    const {asset, resources} = subject;
    if ((!allVersions && asset.asset_version !== versions.get(asset.asset_id)) || asset.placeholder || ['placeholder','planned'].includes(asset.lifecycle)) continue;
    const bindingPath = path.join(subject.base, 'bindings/whitebox.json');
    if (!fs.existsSync(bindingPath)) continue; // A host adapter must be explicitly authored.
    const {schema_version, empty_fields = [], include_bone_count, vehicle, ...binding} = read(bindingPath);
    if (schema_version !== '1.0') throw Error('WHITEBOX_BINDING_SCHEMA: ' + asset.asset_id);
    const promoted = ['id','contentVersion','displayName','path','uri','sourcePath','sha256','byteLength','resources','actions','rootTransform','sockets','collision','selectedNodeIndices','provenance','limitations','boneCount'];
    for (const key of promoted) if (key in binding) throw Error('WHITEBOX_DUPLICATE_SOURCE_FIELD: ' + asset.asset_id + '.' + key);
    if (binding.integrationMetadata?.cameraPresetReferences) throw Error('WHITEBOX_ENGINE_CAMERA_REFERENCE: ' + asset.asset_id);
    const model = resources.files.find(f => f.path === resources.model);
    if (!model) throw Error('WHITEBOX_MODEL_UNREGISTERED: ' + asset.asset_id);
    const bindings=subject.assembly.bindings??{};
    const rig = bindings.rig?read(inside(root, bindings.rig)):{};
    const actions = bindings.animations?read(inside(root, bindings.animations)).slots:{};
    const sockets = bindings.sockets?read(inside(root, bindings.sockets)).sockets:[];
    const collisionFile=path.join(subject.base,'collision/collision.json');
    const collision = fs.existsSync(collisionFile)?read(collisionFile).shapes:[];
    if (collision.length > 1) throw Error('WHITEBOX_MULTIPLE_COLLIDERS_UNSUPPORTED: ' + asset.asset_id);
    const entry = {id:asset.asset_id, contentVersion:asset.asset_version, displayName:asset.display_name, ...resource(model, 'subjects', resources.model_logical_path), ...binding,
      rootTransform:asset.scale.source_transform, actions,
      limitations:subject.capabilities.limitations.filter(note => note !== libraryReadinessNote)};
    if (rig.selected_node_indices !== null && rig.selected_node_indices !== undefined) entry.selectedNodeIndices = rig.selected_node_indices;
    if (include_bone_count) entry.boneCount = resources.inspection?.bones?.length || 0;
    if (Object.keys(subject.provenance.original || {}).length) entry.provenance = subject.provenance.original;
    const aliases = new Set();
    const linked = resources.files.flatMap(file => (file.logical_paths || []).map(alias => {
      if (aliases.has(alias)) throw Error('WHITEBOX_DUPLICATE_LOGICAL_PATH: ' + asset.asset_id + ':' + alias);
      aliases.add(alias);
      return resource(file, 'resources', alias);
    }));
    if (linked.length || empty_fields.includes('resources')) entry.resources = linked;
    if (sockets.length || empty_fields.includes('sockets')) entry.sockets = sockets;
    if (collision.length) entry.collision = collision[0];
    if (vehicle) {
      const profile = readPhysicalFacts(root,subject);
      if (!profile?.parameters) throw Error('WHITEBOX_PHYSICAL_FACTS_REQUIRED: ' + asset.asset_id);
      if (Object.keys(vehicle.spec || {}).length) throw Error('WHITEBOX_DUPLICATE_VEHICLE_PARAMETER: ' + asset.asset_id);
      for (const key of Object.keys(vehicle.spec || {})) if (key in profile.parameters) throw Error('WHITEBOX_DUPLICATE_VEHICLE_PARAMETER: ' + asset.asset_id + '.' + key);
      entry.vehicle = {...vehicle, spec:{...vehicle.spec, ...profile.parameters}};
    }
    assets.push(entry);
  }
  return {schemaVersion:1, assets};
}

/** Write or verify both generated adapters. check=true never writes. */
export function syncWhiteboxCatalog(root = ROOT, check = false) {
  const catalog = buildWhiteboxCatalog(root);
  const direct = structuredClone(catalog);
  for (const asset of direct.assets) {
    delete asset.path;
    for (const file of [asset, ...(asset.resources || [])]) {
      file.uri = './' + file.sourcePath.slice('asset-library/'.length);
      delete file.sourcePath;
    }
  }
  const outputs = {'asset-catalog.json':catalog, 'asset-definitions.json':direct};
  for (const [name, value] of Object.entries(outputs)) {
    const file = path.join(root, 'dist/whitebox', name);
    const expected = JSON.stringify(value, null, 2) + '\n';
    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== expected) throw Error('WHITEBOX_OUTPUT_STALE: ' + name);
    } else write(file, expected);
  }
  return catalog;
}
