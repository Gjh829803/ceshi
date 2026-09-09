import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
const audit = vi.hoisted(() => ({ forbiddenRoots: [] as string[], calls: [] as { operation: string; path: string }[] }));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const observe = (operation: string, value: unknown) => {
    const target = String(value); audit.calls.push({ operation, path: target });
    if (audit.forbiddenRoots.some(root => target === root || target.startsWith(root + '/'))) throw new Error(`TEST_HOST_RUNTIME_ACCESSED: ${operation}`);
  };
  return { ...actual,
    readdir: (...args: Parameters<typeof actual.readdir>) => { observe('readdir', args[0]); return Reflect.apply(actual.readdir, actual, args); },
    lstat: (...args: Parameters<typeof actual.lstat>) => { observe('lstat', args[0]); return Reflect.apply(actual.lstat, actual, args); },
    realpath: (...args: Parameters<typeof actual.realpath>) => { observe('realpath', args[0]); return Reflect.apply(actual.realpath, actual, args); },
    readFile: (...args: Parameters<typeof actual.readFile>) => { observe('readFile', args[0]); return Reflect.apply(actual.readFile, actual, args); },
  };
});
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { ThreeCompiler, hashTree } from './compiler.js';
import catalog from '../../assets/three-creator/asset-catalog.json';
import {createAssetPolicySnapshot,assetPolicyHash} from './asset-policy.mjs';
const roots: string[] = [];
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'three-compiler-boundary-'))); roots.push(root);
  await mkdir(path.join(root, 'features/scratch'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<html><head></head><body><script type="module" src="./main.ts"></script></body></html>');
  await writeFile(path.join(root, 'project.json'), '{"schemaVersion":1,"assetIds":[]}');
  await writeFile(path.join(root, 'main.ts'), "import { color } from './features/scratch/color'; document.title = color;");
  await writeFile(path.join(root, 'features/scratch/color.ts'), "export const color = 'ordinary-author-color';");
  return root;
}
async function platformScratch(root: string) {
  const scratch = path.join(root, 'scratch'), home = path.join(scratch, 'codex_home_bgtr6514/codex_home');
  await mkdir(path.join(home, 'tmp/arg0/codex-arg0-fixture'), { recursive: true });
  await writeFile(path.join(home, 'auth.json'), '{"SENTINEL_FAKE_CREDENTIAL":"NEVER_READ_OR_PACKAGE_THIS_FIXTURE"}');
  const wrapper = path.join(root, '.host-fake-apply-patch'); await writeFile(wrapper, 'FAKE_HOST_TOOL_SENTINEL');
  await symlink(wrapper, path.join(home, 'tmp/arg0/codex-arg0-fixture/apply_patch'));
  audit.forbiddenRoots.push(scratch); return scratch;
}
afterEach(async () => { audit.forbiddenRoots.length = 0; audit.calls.length = 0; await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it.each([
  ['training.carriage', ['creatures/horse.glb']],
  ['training.dragon', ['creatures/dragon.glb']],
] as const)('packages %s with only its required creature models', async (id, expected) => {
  const root = await fixture();
  await writeFile(path.join(root, 'project.json'), JSON.stringify({ schemaVersion: 1, assetIds: [id] }));
  // Test historical compound-asset packaging with an explicit fixture policy;
  // the production default intentionally excludes vehicle models.
  const policyRoot=await mkdtemp(path.join(os.tmpdir(),'compiler-asset-fixture-'));roots.push(policyRoot);
  const snapshot=createAssetPolicySnapshot({schemaVersion:1,allowedAssetIds:['humanoid.source-101',id],defaultHumanoidAssetId:'humanoid.source-101',allowCustomAssets:true},catalog.assets);
  const policyPath=path.join(policyRoot,'policy.json');await writeFile(policyPath,JSON.stringify(snapshot));
  const candidate = await new ThreeCompiler(root, 'three-raw',{assetPolicySnapshotPath:policyPath,assetPolicySha256:assetPolicyHash(snapshot)}).prepare();
  const definitions = JSON.parse(await readFile(path.join(candidate.playableRoot, 'asset-definitions.json'), 'utf8')) as {
    assets: { id: string; resources: { path: string; uri: string; byteLength: number }[] }[];
  };
  expect(definitions.assets.map(asset => asset.id)).toEqual([id]);
  const models = definitions.assets[0]!.resources.filter(resource => resource.path.endsWith('.glb'));
  expect(models.map(resource => resource.path)).toEqual(expected);
  for (const model of models) {
    const bytes = await readFile(path.resolve(candidate.playableRoot, model.uri));
    expect(bytes.length).toBe(model.byteLength);
  }
});

describe('Host-owned task root boundary', () => {
  it('never stats, traverses, resolves or reads platform scratch before collecting normal author sources', async () => {
    const root = await fixture(); const scratch = await platformScratch(root);
    const sources = await new ThreeCompiler(root, 'three-raw').sourceFiles();
    expect([...sources.keys()].sort()).toEqual(['features/scratch/color.ts', 'index.html', 'main.ts', 'project.json']);
    expect([...sources.values()].some(bytes => bytes.includes('NEVER_READ_OR_PACKAGE_THIS_FIXTURE'))).toBe(false);
    expect(audit.calls).toContainEqual({ operation: 'readFile', path: path.join(root, 'main.ts') });
    expect(audit.calls.some(call => call.path === scratch || call.path.startsWith(scratch + '/'))).toBe(false);
  });
  it('keeps the sealed candidate and playtest source identity current while Host scratch appears, changes and disappears', async () => {
    const root = await fixture(), compiler = new ThreeCompiler(root, 'three-raw');
    const acceptedCandidate = await compiler.prepare();
    const scratch = await platformScratch(root);
    const withScratch = await compiler.prepare();
    await writeFile(path.join(scratch, 'platform-state.json'), '{"SENTINEL_FAKE_LOG":"updated while Agent is playing"}');
    const withUpdate = await compiler.prepare();
    await rm(scratch, { recursive: true, force: true });
    const withoutScratch = await compiler.prepare();
    // These are the exact identity inputs the real same-session submit compares to its playtest evidence.
    for (const current of [withScratch, withUpdate, withoutScratch]) {
      expect(current.sourceHash).toBe(acceptedCandidate.sourceHash);
      expect(current.worldBuildHash).toBe(acceptedCandidate.worldBuildHash);
      expect(current.candidateCacheHit).toBe(true);
      expect(current.files).toEqual(acceptedCandidate.files);
    }
    const files = await hashTree(acceptedCandidate.root);
    expect(Object.keys(files).some(name => name.startsWith('source/scratch/') || name.startsWith('playable/scratch/'))).toBe(false);
    for (const name of Object.keys(files)) expect((await readFile(path.join(acceptedCandidate.root, name))).includes('SENTINEL_FAKE_')).toBe(false);
    expect(await readFile(path.join(acceptedCandidate.playableRoot, 'compiled/entry-0.js'), 'utf8')).toContain('ordinary-author-color');
  });
  it('excludes a root scratch symlink before even lstat and preserves nested author scratch modules', async () => {
    const root = await fixture(), outside = await fixture();
    await symlink(outside, path.join(root, 'scratch')); audit.forbiddenRoots.push(path.join(root, 'scratch'));
    const sources = await new ThreeCompiler(root, 'three-raw').sourceFiles();
    expect(sources.has('features/scratch/color.ts')).toBe(true); expect(sources.has('scratch/main.ts')).toBe(false);
  });
  it('still rejects symlinks in actual author sources, including a nested directory named scratch', async () => {
    const root = await fixture(); await symlink(path.join(root, 'main.ts'), path.join(root, 'features/scratch/alias.ts'));
    await expect(new ThreeCompiler(root, 'three-raw').sourceFiles()).rejects.toThrow('THREE_SOURCE_SYMLINK: features/scratch/alias.ts');
  });
  it('cannot import an excluded Host file through the authored module graph', async () => {
    const root = await fixture(); const scratch = await platformScratch(root);
    await writeFile(path.join(scratch, 'runtime.js'), "export const secret = 'SENTINEL_FAKE_RUNTIME';");
    await writeFile(path.join(root, 'main.ts'), "import { secret } from './scratch/runtime.js'; document.title=secret;");
    await expect(new ThreeCompiler(root, 'three-raw').prepare()).rejects.toThrow(/Could not resolve|THREE_IMPORT/);
    expect(audit.calls.some(call => call.path === scratch || call.path.startsWith(scratch + '/'))).toBe(false);
  });
});
