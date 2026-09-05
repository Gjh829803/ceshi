import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectLock, auditCapsule, sha256 } from '../../scripts/cloud/three-capsule.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rootManifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json')));
const lock = readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8');

test('minimal importer projection preserves exact package resolutions and integrity records', () => {
  const projected = projectLock(lock, rootManifest);
  const importers = projected.slice(projected.indexOf('\nimporters:\n'), projected.indexOf('\npackages:\n'));
  assert.deepEqual([...importers.matchAll(/^  (\S+):$/gm)].map(match => match[1]), ['.', 'packages/three-world']);
  assert(!importers.includes('@babylonjs')); assert(!importers.includes('@whitebox-world'));
  assert(importers.includes("'@worldkit/three'")); assert(importers.includes("'@modelcontextprotocol/sdk'"));
  assert.equal(projected.slice(projected.indexOf('\npackages:\n')), lock.slice(lock.indexOf('\npackages:\n')));
  assert.equal(projected.slice(0, projected.indexOf('\nimporters:\n')), lock.slice(0, lock.indexOf('\nimporters:\n')));
});

test('projection rejects changed dependency versions and unknown lock formats', () => {
  assert.throws(() => projectLock(lock, { ...rootManifest, dependencies: { ...rootManifest.dependencies, three: '99.0.0' } }), /Root\/lock mismatch/);
  assert.throws(() => projectLock(lock.replace("lockfileVersion: '9.0'", "lockfileVersion: '10.0'"), rootManifest), /lock layout/);
  assert.throws(() => projectLock(lock.replace('  packages/three-world:', '  packages/not-three:'), rootManifest), /workspace importer/);
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
