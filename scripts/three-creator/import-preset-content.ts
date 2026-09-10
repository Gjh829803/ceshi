/** Reproducible content import. No donor code executes in the deployed Host. */
import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { REPOSITORY_ROOT } from './compiler.js';
import { presetImportDetails } from './preset-import-catalog.js';

const donor = path.resolve(process.argv[2] ?? '');
const expected = 'c293622a63716b8473cc2a95cb485c515265945e';
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: donor, encoding: 'utf8' }).trim() !== expected) throw new Error('PRESET_DONOR_VERSION_MISMATCH');
const destination = path.join(REPOSITORY_ROOT, 'assets/three-creator/presets');
const content = path.join(REPOSITORY_ROOT, 'shared/preset-content');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function walk(dir: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('PRESET_SOURCE_SYMLINK');
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file)); else result.push(file);
  }
  return result.sort();
}
async function resource(relative: string) {
  const bytes = await readFile(path.join(destination, relative)), hash = digest(bytes);
  return { path: relative, uri: `./assets/resources/${hash}${path.extname(relative).toLowerCase()}`, sha256: hash, byteLength: bytes.length,
    sourcePath: `assets/three-creator/presets/${relative}` };
}
const sourceRoot = path.join(donor, 'public/assets/humanoid/source');
const sourceManifest = JSON.parse(await readFile(path.join(sourceRoot, 'manifest.json'), 'utf8'));
const runtimeFiles = new Set<string>(['manifest.json', sourceManifest.model]);
for (const clip of sourceManifest.runtimeClips) { runtimeFiles.add(clip.file); if (clip.metadata) runtimeFiles.add(clip.metadata); }
for (const file of await walk(sourceRoot)) {
  const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
  if (/LICENSE|NOTICE/.test(path.basename(file)) && !relative.startsWith('reference/')) runtimeFiles.add(relative);
}
const imports = [...runtimeFiles].map(file => `humanoid/source/${file}`);
imports.push('creatures/horse.glb', 'creatures/dragon.glb', 'creatures/manifest.json', 'creatures/LICENSE-ANIMALS.txt', 'creatures/LICENSE-MONSTERS.txt');
for (const relative of imports) {
  const target = path.join(destination, relative); await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(donor, 'public/assets', relative), target);
}
// Content modules remain authored source; runtime algorithms are separately migrated to the SDK.
const contentModules = ['config.ts','models.ts','world.ts','vehicle-animation.ts',
  'environment/maps.ts','environment/types.ts','environment/modules.ts','environment/indoor.ts','environment/campus.ts',
  'creatures/specs.ts','creatures/manifest.ts','creatures/visual.ts',
  'platform/catalog.ts','platform/profiles.ts','platform/profile-runtime.ts','platform/scenarios.ts',
  'humanoid/workshop.ts','humanoid/interaction-visuals.ts','humanoid/demo.ts',
  'ui/shortcuts.ts','ui/thumbnails.ts'];
for (const relative of contentModules) {
  const source = path.join(donor, 'src', relative);
  try {
    const bytes = await readFile(source), target = path.join(content, relative);
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes);
  } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
}
// GLTFExporter only needs canvas for donor's presentation labels, which are excluded from model export.
Object.assign(globalThis, { document: { createElement: () => ({ width: 768, height: 128, getContext: () => new Proxy({}, { get: () => () => undefined, set: () => true }) }) },
  FileReader: class { result: unknown; onloadend?: () => void; readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); } } });
const { SPECS } = await import(pathToFileURL(path.join(donor, 'src/config.ts')).href);
const { buildVehicle } = await import(pathToFileURL(path.join(donor, 'src/models.ts')).href);
const catalogFile = path.join(REPOSITORY_ROOT, 'assets/three-creator/asset-catalog.json');
const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
const previousAssets = new Map<string, Parameters<typeof presetImportDetails>[1]>(
  catalog.assets.map((asset: { id: string }) => [asset.id, asset]),
);
catalog.assets = catalog.assets.filter((asset: any) => asset.provenance?.repository !== 'vehicle-training-ground' && asset.id !== 'humanoid.source-101');
const provenance = { repository: 'vehicle-training-ground', commit: expected, notices: 'resources', importedWithoutChangingAssetBytes: true };
const transform = { positionMetersXYZ: [0,0,0], rotationEulerRadiansXYZ: [0,0,0], scaleXYZ: [1,1,1] };
async function definition(id: string, displayName: string, primary: string, dependencies: string[], extra = {}) {
  const source = await resource(primary);
  return { id, displayName, ...source, uri: `./assets/subjects/${source.sha256}.glb`, usage: 'reusable', rootTransform: transform,
    actions: {}, limitations: [], provenance, resources: await Promise.all(dependencies.map(resource)), ...extra };
}
catalog.assets.push(await definition('humanoid.source-101', '原版人物 / 101 骨 / 48 动作', `humanoid/source/${sourceManifest.model}`,
  imports.filter(file => file.startsWith('humanoid/')), { recommendedBody: { heightMeters: 1.68, radiusMeters: .28 },
    locomotionBindingIds: ['locomotion.humanoid'], runtimeActions: sourceManifest.runtimeClips, boneCount: 101, runtimeClipCount: 48 }));
for (const spec of SPECS) {
  let primary: string;
  if (spec.id === 'horse' || spec.id === 'dragon') primary = `creatures/${spec.id}.glb`;
  else {
    const visual = buildVehicle(spec); visual.root.remove(visual.label);
    visual.seat.name = 'seat.driver';
    visual.wheelRigs.forEach((rig: any, index: number) => { rig.steering.name = `wheel.${index}.steer`; rig.spin.name = `wheel.${index}.spin`; });
    visual.rotors.forEach((node: any, index: number) => { node.name = `rotor.${index}`; });
    const bytes = await new GLTFExporter().parseAsync(visual.root, { binary: true, onlyVisible: false }) as ArrayBuffer;
    primary = `vehicles/${spec.id}.glb`; await mkdir(path.join(destination, 'vehicles'), { recursive: true });
    await writeFile(path.join(destination, primary), Buffer.from(bytes));
  }
  const assetId = `${spec.id === 'horse' || spec.id === 'dragon' ? 'creature' : 'vehicle'}.${spec.id}`;
  const { dependencyPaths, ...details } = presetImportDetails(spec, previousAssets.get(assetId));
  catalog.assets.push(await definition(assetId, `${spec.name} / ${spec.en}`, primary, dependencyPaths, {
    locomotionBindingIds: [`locomotion.${spec.mode}`], vehicle: { schemaVersion: 1, spec },
    ...details, collision: spec.envelope,
  }));
}
await writeFile(catalogFile, JSON.stringify(catalog, null, 2) + '\n');
await writeFile(path.join(destination, 'import-manifest.json'), JSON.stringify({ schemaVersion: 1, provenance,
  character: { boneCount: 101, runtimeClipCount: sourceManifest.runtimeClipCount }, vehicleIds: SPECS.map((s: any) => s.id),
  maps: ['campus','indoor-lab','character-workshop'], resources: await Promise.all(imports.map(resource)) }, null, 2) + '\n');
execFileSync('python3', [path.join(REPOSITORY_ROOT,'scripts/three-creator/build-humanoid.py')], {cwd:REPOSITORY_ROOT,stdio:'inherit'});
console.log(JSON.stringify({ importedResources: imports.length, vehicles: SPECS.length, runtimeClips: sourceManifest.runtimeClipCount }));
