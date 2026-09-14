import {readCatalogSources,writeCatalogSources,syncAssetCatalog} from '../../src/assets/catalog-sources.js';
/** Reproducible content import. No donor code executes in the deployed Host. */
import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { REPOSITORY_ROOT } from '../../src/compiler/compiler.js';
import { presetImportDetails, presetImportIdentity } from '../../src/assets/preset-import-catalog.js';

const donor = path.resolve(process.argv[2] ?? '');
const expected = 'c293622a63716b8473cc2a95cb485c515265945e';
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: donor, encoding: 'utf8' }).trim() !== expected) throw new Error('PRESET_DONOR_VERSION_MISMATCH');
const destination = path.join(REPOSITORY_ROOT, 'assets/three-creator/presets');
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
// The local manifest and visible skin are maintained content; the pinned donor supplies motions and notices.
const sourceManifest = JSON.parse(await readFile(path.join(destination, 'humanoid/source/manifest.json'), 'utf8'));
const maintainedHumanoidFiles=new Set(['humanoid/source/manifest.json',`humanoid/source/${sourceManifest.model}`]);
const runtimeFiles = new Set<string>(['manifest.json', sourceManifest.model]);
for (const clip of sourceManifest.runtimeClips) { runtimeFiles.add(clip.file); if (clip.metadata) runtimeFiles.add(clip.metadata); }
for (const file of await walk(sourceRoot)) {
  const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
  if (/LICENSE|NOTICE/.test(path.basename(file)) && !relative.startsWith('reference/')) runtimeFiles.add(relative);
}
const imports = [...runtimeFiles].map(file => `humanoid/source/${file}`);
imports.push('creatures/horse.glb', 'creatures/dragon.glb', 'creatures/manifest.json', 'creatures/LICENSE-ANIMALS.txt', 'creatures/LICENSE-MONSTERS.txt');
for (const relative of imports) {
  if(maintainedHumanoidFiles.has(relative))continue;
  const target = path.join(destination, relative); await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(donor, 'public/assets', relative), target);
}
// GLTFExporter only needs canvas for donor's presentation labels, which are excluded from model export.
Object.assign(globalThis, { document: { createElement: () => ({ width: 768, height: 128, getContext: () => new Proxy({}, { get: () => () => undefined, set: () => true }) }) },
  FileReader: class { result: unknown; onloadend?: () => void; readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); } } });
const { SPECS } = await import(pathToFileURL(path.join(donor, 'src/config.ts')).href);
const { buildVehicle } = await import(pathToFileURL(path.join(donor, 'src/models.ts')).href);
const catalog = {schemaVersion:1,assets:await readCatalogSources(REPOSITORY_ROOT)};
const previousAssets = new Map(catalog.assets.map(asset => [asset.id, asset]));
const previousHumanoid=catalog.assets.find(asset=>asset.id==='humanoid.uefn-mannequin')!;
catalog.assets = catalog.assets.filter((asset: any) => asset.provenance?.repository !== 'vehicle-training-ground' && asset.id !== 'humanoid.uefn-mannequin');
const provenance = { repository: 'vehicle-training-ground', commit: expected, notices: 'resources', importedWithoutChangingAssetBytes: true };
const transform = { positionMetersXYZ: [0,0,0], rotationEulerRadiansXYZ: [0,0,0], scaleXYZ: [1,1,1] };
async function definition(id: string, displayName: string, primary: string, dependencies: string[], extra = {}) {
  const source = await resource(primary);
  return { id, displayName, ...source, uri: `./assets/subjects/${source.sha256}.glb`, usage: 'reusable', rootTransform: transform,
    actions: {}, limitations: [], provenance, resources: await Promise.all(dependencies.map(resource)), ...extra };
}
catalog.assets.push(await definition('humanoid.uefn-mannequin', previousHumanoid.displayName, `humanoid/source/${sourceManifest.model}`,
  imports.filter(file => file.startsWith('humanoid/')), { provenance:previousHumanoid.provenance, recommendedBody: { heightMeters: 1.68, radiusMeters: .28 },
    locomotionBindingIds: ['locomotion.humanoid'], animationClips: sourceManifest.runtimeClips, boneCount: 101, runtimeClipCount: 48 }));
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
  const {assetId,specId}=presetImportIdentity(spec.id);
  const previous=previousAssets.get(assetId);
  const {camera:_retiredCamera,...handlingSpec}=spec;
  const { dependencyPaths, ...details } = presetImportDetails(spec, previous as Parameters<typeof presetImportDetails>[1]);
  catalog.assets.push(await definition(assetId, previous?.displayName??`${spec.name} / ${spec.en}`, primary, dependencyPaths, {
    locomotionBindingIds: previous?.locomotionBindingIds??[`locomotion.${String(spec.mode).replaceAll('_','-')}`],
    vehicle: { schemaVersion: 1, spec:{...handlingSpec,id:specId,name:previous?.vehicle?.spec?.name??spec.name,en:previous?.vehicle?.spec?.en??spec.en} },
    ...details, collision: spec.envelope,
  }));
}
await writeCatalogSources(REPOSITORY_ROOT,catalog.assets,true);
await syncAssetCatalog(REPOSITORY_ROOT);
await writeFile(path.join(destination, 'import-manifest.json'), JSON.stringify({ schemaVersion: 1, provenance:previousHumanoid.provenance,
  character: { boneCount: 101, runtimeClipCount: sourceManifest.runtimeClipCount }, vehicleIds: SPECS.map((s: any) => s.id),
  resources: await Promise.all(imports.map(resource)) }, null, 2) + '\n');
execFileSync('python3', [path.join(REPOSITORY_ROOT,'packages/creator-host/scripts/assets/build-humanoid.py')], {cwd:REPOSITORY_ROOT,stdio:'inherit'});
console.log(JSON.stringify({ importedResources: imports.length, vehicles: SPECS.length, runtimeClips: sourceManifest.runtimeClipCount }));
