import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ROOT, read, write, collect, inside} from '../tools/core.mjs';
import {build} from '../tools/library.mjs';
import {buildWhiteboxCatalog, syncWhiteboxCatalog} from '../tools/whitebox.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whitebox-generator-'));
  const source = collect().find(s => s.asset.asset_id === 'creature.horse');
  fs.cpSync(source.base, path.join(root, source.path), {recursive:true});
  for (const file of source.resources.files) {
    const target = inside(root, file.path);
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.copyFileSync(inside(ROOT, file.path), target);
  }
  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'whitebox-generator-')));
    fs.rmSync(root, {recursive:true, force:true});
  });
  return {root, base:path.join(root, source.path)};
}

function edit(file, mutate) {
  const value = read(file);
  mutate(value);
  write(file, value);
}

test('publisher can request all explicit content versions while authoring adapter defaults to latest', t => {
  const {root,base}=fixture(t),next=path.join(path.dirname(base),'0.2.0');
  fs.cpSync(base,next,{recursive:true});
  edit(path.join(next,'asset.json'),asset=>{asset.asset_version='0.2.0';asset.default_assembly=asset.default_assembly.replace('/0.1.0/','/0.2.0/');});
  edit(path.join(next,'assemblies/default.json'),assembly=>{assembly.subject.version='0.2.0';assembly.facts.physical=assembly.facts.physical.replace('/0.1.0/','/0.2.0/');});
  edit(path.join(next,'facts/physical.json'),profile=>{profile.parameters.seat=[0,2.9,0];});
  const latest=buildWhiteboxCatalog(root).assets;
  assert.equal(latest.length,1);assert.equal(latest[0].contentVersion,'0.2.0');
  const all=buildWhiteboxCatalog(root,{allVersions:true}).assets;
  assert.deepEqual(all.map(a=>a.contentVersion).sort(),['0.1.0','0.2.0']);
  assert.notDeepEqual(all[0].vehicle.spec.seat,all[1].vehicle.spec.seat);
});

test('library build produces the Creator catalog from library-owned resources', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whitebox-build-'));
  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'whitebox-build-')));
    fs.rmSync(root, {recursive:true, force:true});
  });
  for (const folder of ['subjects','shared','schemas'])
    fs.cpSync(path.join(ROOT, folder), path.join(root, folder), {recursive:true});
  build(root);
  const catalogPath = path.join(root, 'dist/whitebox/asset-catalog.json');
  assert.ok(fs.existsSync(catalogPath), 'build must generate the Creator asset-catalog.json');
  const catalog = read(catalogPath);
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.assets.length, 44);
  for (const asset of catalog.assets) {
    for (const resource of [asset, ...(asset.resources || [])]) {
      assert.match(resource.sourcePath, /^asset-library\//);
      assert.match(resource.uri, /^\.\/assets\/(subjects|resources)\/[a-f0-9]{64}\.[a-z0-9]+$/);
    }
  }
});

test('subject metadata, bindings and logical resource aliases regenerate both adapters', t => {
  const {root, base} = fixture(t);
  syncWhiteboxCatalog(root);
  edit(path.join(base, 'asset.json'), value => {
    value.display_name = 'Edited library horse';
    value.scale.source_transform.scaleXYZ = [2, 2, 2];
  });
  edit(path.join(base, 'bindings/animation_map.json'), value => { value.slots.test = {clipName:'Idle', loop:true}; });
  edit(path.join(base, 'bindings/sockets.json'), value => { value.sockets = [{id:'test', positionMetersXYZ:[0, 2, 0]}]; });
  edit(path.join(base, 'facts/physical.json'), value => { value.parameters.seat = [0, 2.7, 0]; });
  edit(path.join(base, 'collision/collision.json'), value => { value.shapes = [{kind:'box', halfExtents:[2, 3, 4], offset:[0, 3, 0]}]; });
  edit(path.join(base, 'capabilities.json'), value => { value.limitations.push('Test host condition'); });
  edit(path.join(base, 'resources.json'), value => { value.files.find(f => f.logical_paths?.length).logical_paths.push('test/model.glb'); });
  assert.throws(() => syncWhiteboxCatalog(root, true), /WHITEBOX_OUTPUT_STALE/);
  const generated = syncWhiteboxCatalog(root).assets[0];
  assert.equal(generated.displayName, 'Edited library horse');
  assert.deepEqual(generated.rootTransform.scaleXYZ, [2, 2, 2]);
  assert.equal(generated.actions.test.clipName, 'Idle');
  assert.equal(generated.sockets[0].id, 'test');
  assert.deepEqual(generated.vehicle.spec.seat, [0, 2.7, 0]);
  assert.equal(generated.vehicle.spec.speed, undefined);
  assert.deepEqual(generated.collision.halfExtents, [2, 3, 4]);
  assert.ok(generated.limitations.includes('Test host condition'));
  assert.ok(generated.resources.some(resource => resource.path === 'test/model.glb'));
  const direct = read(path.join(root, 'dist/whitebox/asset-definitions.json')).assets[0];
  assert.equal(direct.displayName, generated.displayName);
  assert.ok(direct.uri.startsWith('./subjects/'));
  assert.equal('sourcePath' in direct, false);
  for (const resource of [direct, ...direct.resources]) assert.ok(fs.existsSync(inside(root, resource.uri.slice(2))));
  assert.doesNotThrow(() => syncWhiteboxCatalog(root, true));
});

test('content publication rejects engine tuning and camera configuration', t => {
  const {root,base}=fixture(t);
  edit(path.join(base,'facts/physical.json'),value=>{value.parameters.speed=77;});
  assert.throws(()=>buildWhiteboxCatalog(root),/ASSET_CONTENT_FACTS_INVALID/);
  edit(path.join(base,'facts/physical.json'),value=>{delete value.parameters.speed;});
  edit(path.join(base,'bindings/whitebox.json'),value=>{value.integrationMetadata={cameraPresetReferences:[]};});
  assert.throws(()=>buildWhiteboxCatalog(root),/WHITEBOX_ENGINE_CAMERA_REFERENCE/);
});

test('selected resources fail on missing bytes, hash changes and unresolved model references', t => {
  const {root, base} = fixture(t);
  const resources = read(path.join(base, 'resources.json'));
  const model = inside(root, resources.model);
  const bytes = fs.readFileSync(model);
  fs.writeFileSync(model, 'corrupt');
  assert.throws(() => buildWhiteboxCatalog(root), /WHITEBOX_RESOURCE_HASH_MISMATCH/);
  fs.unlinkSync(model);
  assert.throws(() => buildWhiteboxCatalog(root), /WHITEBOX_RESOURCE_MISSING/);
  fs.writeFileSync(model, bytes);
  edit(path.join(base, 'resources.json'), value => { value.model = 'subjects/missing.glb'; });
  assert.throws(() => buildWhiteboxCatalog(root), /WHITEBOX_MODEL_UNREGISTERED/);
});

test('placeholders are excluded and descriptor fields cannot become a second authoring source', t => {
  const {root, base} = fixture(t);
  edit(path.join(base, 'bindings/whitebox.json'), value => { value.displayName = 'Stale duplicate'; });
  assert.throws(() => buildWhiteboxCatalog(root), /WHITEBOX_DUPLICATE_SOURCE_FIELD/);
  edit(path.join(base, 'asset.json'), value => { value.placeholder = true; });
  assert.deepEqual(buildWhiteboxCatalog(root).assets, []);
});
