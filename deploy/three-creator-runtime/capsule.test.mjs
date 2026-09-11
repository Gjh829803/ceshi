import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectLock, auditCapsule, sha256, stageContext } from '../../scripts/cloud/three-capsule.mjs';
import { freezeRunAssetPolicy } from '../../scripts/cloud/three-eval-mcp-bridge.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rootManifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json')));
const lock = readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8');

test('minimal importer projection preserves exact package resolutions and integrity records', () => {
  const projected = projectLock(lock, rootManifest);
  const importers = projected.slice(projected.indexOf('\nimporters:\n'), projected.indexOf('\npackages:\n'));
  assert.deepEqual([...importers.matchAll(/^  (\S+):(?: \{\})?$/gm)].map(match => match[1]), ['.', 'packages/three-world', 'packages/camera-collision']);
  assert(!importers.includes('@babylonjs'));
  assert(!importers.replaceAll('@whitebox-world/camera-collision', '').includes('@whitebox-world'));
  assert(importers.includes('version: link:../camera-collision'));
  assert(importers.includes("'@worldkit/three'")); assert(importers.includes("'@modelcontextprotocol/sdk'"));
  assert(importers.includes('      typescript:\n'), 'Runtime authoring schema requires the pinned TypeScript compiler API');
  assert.equal(projected.slice(projected.indexOf('\npackages:\n')), lock.slice(lock.indexOf('\npackages:\n')));
  assert.equal(projected.slice(0, projected.indexOf('\nimporters:\n')), lock.slice(0, lock.indexOf('\nimporters:\n')));
});

test('projection rejects changed dependency versions and unknown lock formats', () => {
  assert.throws(() => projectLock(lock, { ...rootManifest, dependencies: { ...rootManifest.dependencies, three: '99.0.0' } }), /Root\/lock mismatch/);
  assert.throws(() => projectLock(lock, { ...rootManifest, devDependencies: { ...rootManifest.devDependencies, typescript: '99.0.0' } }), /Root\/lock mismatch/);
  assert.throws(() => projectLock(lock.replace("lockfileVersion: '9.0'", "lockfileVersion: '10.0'"), rootManifest), /lock layout/);
  assert.throws(() => projectLock(lock.replace('  packages/three-world:', '  packages/not-three:'), rootManifest), /workspace importer/);
  assert.throws(() => projectLock(lock.replace('  packages/camera-collision: {}', '  packages/camera-collision:\n    dependencies: {}'), rootManifest), /shared camera collision dependencies/);
});

function withCapsule(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'three-capsule-audit-'));
  try { mkdirSync(path.join(root, 'sdk'), { recursive: true }); run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('audit pins file hashes, keeps contained relative links and relocates pnpm shims', () => withCapsule(root => {
  const bins = path.join(root, 'sdk/node_modules/.bin'); mkdirSync(bins, { recursive: true });
  writeFileSync(path.join(root, 'sdk/value.txt'), 'same bytes'); symlinkSync('../value.txt', path.join(root, 'sdk/node_modules/value'));
  writeFileSync(path.join(bins, 'tsx'), '#!/bin/sh\nbasedir=$(dirname "$0")\nexec node /opt/three-creator-toolkit/sdk/node_modules/tsx/dist/cli.mjs "$@"\n');
  const result = auditCapsule(root);
  assert.equal(result.relocatedShimCount, 1);
  assert.equal(result.entries.find(entry => entry.path === 'sdk/value.txt').sha256, sha256('same bytes'));
  assert.equal(result.entries.find(entry => entry.path === 'sdk/node_modules/value').target, '../value.txt');
  assert(!readFileSync(path.join(bins, 'tsx'), 'utf8').includes('/opt/three-creator-toolkit'));
}));

test('audit rejects symlink escape and Native dependencies', () => {
  withCapsule(root => { symlinkSync('/etc/passwd', path.join(root, 'sdk/absolute')); assert.throws(() => auditCapsule(root), /Absolute symlink/); });
  withCapsule(root => { symlinkSync('../../../etc/passwd', path.join(root, 'sdk/relative')); assert.throws(() => auditCapsule(root)); });
  withCapsule(root => { const file = path.join(root, 'sdk/node_modules/.pnpm/@babylonjs+core@9.23.0/package.json'); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, '{}'); assert.throws(() => auditCapsule(root), /Native dependency present/); });
});

test('ELF audit rejects wrong architecture and glibc requirements above Jammy', () => {
  const binary = (machine, glibc) => { const bytes = Buffer.alloc(96); Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]).copy(bytes); bytes.writeUInt16LE(machine, 18); bytes.write(glibc, 32); return bytes; };
  withCapsule(root => { writeFileSync(path.join(root, 'sdk/native.node'), binary(183, 'GLIBC_2.17')); assert.throws(() => auditCapsule(root), /Non-x64/); });
  withCapsule(root => { writeFileSync(path.join(root, 'sdk/native.node'), binary(62, 'GLIBC_2.36')); assert.throws(() => auditCapsule(root), /Newer than Jammy/); });
  withCapsule(root => { writeFileSync(path.join(root, 'sdk/native.node'), binary(62, 'GLIBC_2.28')); const audit = auditCapsule(root); assert.equal(audit.elfCount, 1); assert.equal(audit.maximumRequiredGlibc, '2.28'); });
});


test('staged assets preserve catalog bytes and new runs freeze the packaged Host config', async () => {
  const temporaryParent = path.join(repositoryRoot, '.codex-tmp');
  mkdirSync(temporaryParent, { recursive: true });
  const outputRoot = mkdtempSync(path.join(temporaryParent, 'three-asset-closure-'));
  try {
    stageContext(repositoryRoot, outputRoot);
    const sourceRoot = path.join(outputRoot, 'context/sources');
    const nativeBuild = JSON.parse(readFileSync(path.join(repositoryRoot, 'vendor/rapier-query-refresh/build.json'), 'utf8'));
    const nativeArchive = readFileSync(path.join(sourceRoot, 'vendor/rapier-query-refresh', nativeBuild.archive));
    assert.equal(sha256(nativeArchive), `sha256:${nativeBuild.sha256}`, 'Cloud install must include the current SDK native archive');
    assert.equal(JSON.parse(readFileSync(path.join(sourceRoot, 'packages/three-world/package.json'), 'utf8')).dependencies['@dimforge/rapier3d-compat'], `file:../../vendor/rapier-query-refresh/${nativeBuild.archive}`);
    for (const name of ['index.html', 'main.ts', 'project.json', 'episode.json']) {
      for (const example of ['vehicle-sandbox','character-actions','horse-riding','custom-vehicle','vehicle-camera','nonhuman-subject','flying-creature']) {
        const relative = `examples/three-creator/${example}/${name}`;
        assert.equal(readFileSync(path.join(sourceRoot, relative), 'utf8'), readFileSync(path.join(repositoryRoot, relative), 'utf8'));
      }
    }
    for (const name of ['config.ts', 'project.json', 'environment/maps.ts', 'models.ts']) {
      const relative = `shared/preset-content/${name}`;
      assert.deepEqual(readFileSync(path.join(sourceRoot, relative)), readFileSync(path.join(repositoryRoot, relative)));
    }
    for (const name of ['asset-policy.mjs', 'asset-policy.d.mts']) {
      const relative = `scripts/three-creator/${name}`;
      assert.equal(readFileSync(path.join(sourceRoot, relative), 'utf8'), readFileSync(path.join(repositoryRoot, relative), 'utf8'));
    }
    const observerPath='apps/three-creator-playground/character-continuity.ts';
    assert.deepEqual(readFileSync(path.join(sourceRoot,observerPath)),readFileSync(path.join(repositoryRoot,observerPath)));
    const policyPath = 'config/three-creator/asset-policy.json';
    assert(existsSync(path.join(sourceRoot, policyPath)), 'Capsule must include Host policy at its default config path');
    const policyBytes = readFileSync(path.join(sourceRoot, policyPath));
    assert.deepEqual(policyBytes, readFileSync(path.join(repositoryRoot, policyPath)));
    const manifest = JSON.parse(readFileSync(path.join(sourceRoot, 'source-manifest.json')));
    assert.equal(manifest.files.find(file => file.path === policyPath)?.sha256, sha256(policyBytes));
    assert(!existsSync(path.join(sourceRoot, 'scripts/three-creator/asset-policy.json')));
    const frozen = await freezeRunAssetPolicy({toolkitRoot: sourceRoot});
    assert.deepEqual(frozen.assetPolicySnapshot.policy, JSON.parse(policyBytes));
    assert.deepEqual(frozen, await freezeRunAssetPolicy({toolkitRoot: repositoryRoot}));
    const catalogPath = 'assets/three-creator/asset-catalog.json';
    const catalogBytes = readFileSync(path.join(sourceRoot, catalogPath));
    assert.deepEqual(catalogBytes, readFileSync(path.join(repositoryRoot, catalogPath)));
    assert.equal(manifest.files.find(file => file.path === catalogPath)?.sha256, sha256(catalogBytes));
    assert(!existsSync(path.join(sourceRoot, 'scripts/three-creator/asset-catalog.json')));
    assert(!existsSync(path.join(sourceRoot, 'config/three-creator/account-policy.json')), 'Account routing is Host-only');
    const catalog = JSON.parse(catalogBytes);
    const dragons=catalog.assets.filter(asset=>/^creature\.dragon\.d\d{2}$/.test(asset.id));
    assert.equal(dragons.length,11);
    for(const dragon of dragons)for(const resource of dragon.resources){
      const bytes=readFileSync(path.join(sourceRoot,resource.sourcePath));assert.equal(bytes.length,resource.byteLength);assert.equal(sha256(bytes),`sha256:${resource.sha256}`);
    }
    assert(!existsSync(path.join(sourceRoot,'assets/dragon-training/__creature-assets/rider.glb')), 'Source101 remains the only supplied rider in this closure');
    for (const asset of catalog.assets) {
      assert(/^assets\/(?:three-creator|dragon-training)\//.test(asset.sourcePath), 'Three assets must not depend on an application directory');
      const bytes = readFileSync(path.join(sourceRoot, asset.sourcePath));
      assert.equal(sha256(bytes), `sha256:${asset.sha256}`);
      assert.equal(bytes.length, asset.byteLength);
    }
  } finally { rmSync(outputRoot, { recursive: true, force: true }); }
});
