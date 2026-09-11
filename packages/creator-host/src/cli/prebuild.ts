import { mkdir, mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ThreeCompiler, hashTree, type PrebuiltRuntimeManifest } from '../compiler/compiler.js';
import { profileFrom, sha256 } from '../contracts.js';
const value = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const profile = profileFrom(value('--profile')), output = value('--output');
if (!output) throw new Error('Use --profile three-raw|three-sdk --output <Host-owned-directory>');
if (process.env.WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT) throw new Error('Unset WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT when producing a prebuilt runtime');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'three-runtime-prebuild-'));
try {
  const compiler = new ThreeCompiler(temporary, profile), runtime = await compiler.prepareRuntime(), target = path.resolve(output);
  await mkdir(target, { recursive: true }); await rm(path.join(target, 'runtime'), { recursive: true, force: true }); await cp(runtime.root, path.join(target, 'runtime'), { recursive: true, dereference: false });
  const manifest: PrebuiltRuntimeManifest = { schemaVersion: 1, profile, cacheIdentity: runtime.cacheIdentity, runtimeHash: runtime.hash, files: await hashTree(path.join(target, 'runtime')) };
  const file = path.join(target, 'runtime-manifest.json'); await writeFile(file, JSON.stringify(manifest, null, 2));
  process.stdout.write(`${JSON.stringify({ profile, root: target, runtimeHash: runtime.hash, manifestSha256: sha256(await readFile(file)) }, null, 2)}\n`);
} finally { await rm(temporary, { recursive: true, force: true }); }
