import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ThreeCompiler, hashTree } from '../three-creator/compiler.js';
import { canonicalHash, type EpisodeFile, type EpisodeSourceManifest } from './contracts.js';
import { installEpisodePresentation } from './presentation.js';
import cameraProvenance from './compat/creator-camera-provenance.json';

const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export function closedPath(root: string, relative: string): string {
  if (!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(s => !s || s === '.' || s === '..')) throw new Error('EPISODE_SOURCE_PATH_INVALID');
  return path.join(root, relative);
}
export async function verifyFile(file: EpisodeFile): Promise<void> {
  if (!(await lstat(file.path)).isFile() || await realpath(file.path) !== path.resolve(file.path) || sha(await readFile(file.path)) !== file.sha256) throw new Error('EPISODE_SOURCE_FILE_CHANGED');
}
/** Resolve portable manifest paths before IO; every path remains under its own bundle. */
export function resolveEpisodeSourcePaths(value: EpisodeSourceManifest, manifestPath: string): EpisodeSourceManifest {
  const root = path.dirname(path.resolve(manifestPath));
  const resolve = (file: string): string => {
    if (typeof file !== 'string' || !file) throw new Error('EPISODE_SOURCE_PATH_INVALID');
    const result = path.resolve(root, file), relative = path.relative(root, result);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('EPISODE_SOURCE_PATH_ESCAPE');
    return result;
  };
  const image = (file: EpisodeFile): EpisodeFile => ({ ...file, path: resolve(file.path) });
  return { ...value, sourceRoot: resolve(value.sourceRoot), playableRoot: resolve(value.playableRoot),
    opening: image(value.opening), targets: value.targets.map(target => ({ ...target, whiteboxTriview: image(target.whiteboxTriview) })),
    ...(value.referenceImage ? { referenceImage: image(value.referenceImage) } : {}),
    ...(value.worldPlan ? { worldPlan: image(value.worldPlan) } : {}),
    ...(value.contextPath ? { contextPath: resolve(value.contextPath) } : {}) };
}
export async function saveEpisodeSource(file: string, source: EpisodeSourceManifest): Promise<void> {
  const root = path.dirname(path.resolve(file));
  const relative = (value: string) => { const rel = path.relative(root, value).split(path.sep).join('/'); closedPath(root, rel); return rel; };
  const image = (value: EpisodeFile) => ({ ...value, path: relative(value.path) });
  await writeJson(file, { ...source, sourceRoot: relative(source.sourceRoot), playableRoot: relative(source.playableRoot),
    opening: image(source.opening), targets: source.targets.map(target => ({ ...target, whiteboxTriview: image(target.whiteboxTriview) })),
    ...(source.referenceImage ? { referenceImage: image(source.referenceImage) } : {}),
    ...(source.worldPlan ? { worldPlan: image(source.worldPlan) } : {}),
    ...(source.contextPath ? { contextPath: relative(source.contextPath) } : {}) });
}
export async function loadEpisodeSource(file: string): Promise<EpisodeSourceManifest> {
  const header = JSON.parse(await readFile(file, 'utf8')) as EpisodeSourceManifest;
  if (header.kind !== 'three-episode-source' || header.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(header.worldBuildHash) || !header.targets?.length) throw new Error('EPISODE_SOURCE_INVALID');
  const source = resolveEpisodeSourcePaths(header, file);
  for (const [relative, hash] of Object.entries(source.sourceFiles)) await verifyFile({ path: closedPath(source.sourceRoot, relative), sha256: hash });
  if (canonicalHash(await hashTree(source.playableRoot)) !== canonicalHash(source.playableFiles)) throw new Error('EPISODE_PLAYABLE_CHANGED');
  await verifyFile(source.opening);
  if (source.referenceImage) await verifyFile(source.referenceImage);
  if (source.worldPlan) await verifyFile(source.worldPlan);
  for (const target of source.targets) await verifyFile(target.whiteboxTriview);
  return source;
}
async function writeJson(file: string, value: unknown) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`); }
/**
 * Builds an explicitly derived production playable from a closed old delivery.
 * Author source and compiled scene entry remain byte-identical. Only SDK/bridge
 * runtime files are replaced, with both original and derived identities retained.
 */
export async function prepareEpisodeSource(options: { payloadRoot: string; outputRoot: string; worldId: string; sourceUrl?: string; referenceImage?: EpisodeFile }): Promise<EpisodeSourceManifest> {
  const payload = await realpath(options.payloadRoot), output = path.resolve(options.outputRoot);
  const manifestBytes = await readFile(path.join(payload, 'delivery.json'));
  const delivery = JSON.parse(manifestBytes.toString());
  const delivered = delivery.schemaVersion === 1
    ? ['ready', 'ready-for-independent-review'].includes(delivery.status)
    : delivery.schemaVersion === 2 && delivery.status === 'ready';
  // Historical v1's status name predates direct publication. Only its actual
  // technical delivery/closed bytes matter; no assistant review is reintroduced.
  if (!['three-creator-delivery','three-episode-repaired-delivery'].includes(delivery.kind) || delivery.profile !== 'three-sdk' || delivery.technicalStatus !== 'passed' || !delivered || !/^[a-f0-9]{64}$/.test(delivery.worldBuildHash)) throw new Error('EPISODE_REQUIRES_CLOSED_THREE_DELIVERY');
  if(delivery.kind==='three-episode-repaired-delivery'){
    const evidenceFile=closedPath(payload,delivery.repairEvidence?.path);
    await verifyFile({path:evidenceFile,sha256:delivery.repairEvidence?.sha256});
    const evidence=JSON.parse(await readFile(evidenceFile,'utf8'));
    if(evidence.kind!=='manual-humanoid-motion-repair'||evidence.worldBuildHash!==delivery.worldBuildHash||evidence.sourceHash!==delivery.sourceHash||evidence.runtimeHash!==delivery.runtimeHash)throw new Error('EPISODE_REPAIR_EVIDENCE_MISMATCH');
    const regressionFile=closedPath(payload,delivery.regressionEvidence?.path);
    await verifyFile({path:regressionFile,sha256:delivery.regressionEvidence?.sha256});
    const regression=JSON.parse(await readFile(regressionFile,'utf8'));
    if(regression.status!=='succeeded'||regression.result?.status!=='passed'||regression.result?.worldBuildHash!==delivery.worldBuildHash)throw new Error('EPISODE_REPAIR_REGRESSION_REQUIRED');
  }
  await mkdir(output, { recursive: true });
  if((await readdir(output)).length)throw new Error('EPISODE_SOURCE_OUTPUT_NOT_EMPTY');
  const sourceRoot = path.join(output, 'source'), playableRoot = path.join(output, 'playable');
  const selected = Object.entries(delivery.files as Record<string, string>).filter(([key]) => /^(source|playable|captures)\//.test(key));
  if (!selected.length || selected.length > 10_000) throw new Error('EPISODE_SOURCE_INVENTORY_INVALID');
  for (const [relative, hash] of selected) {
    const from = closedPath(payload, relative), to = closedPath(output, relative);
    await verifyFile({ path: from, sha256: hash });
    await mkdir(path.dirname(to), { recursive: true }); await copyFile(from, to);
  }
  const sourceFiles = await hashTree(sourceRoot);
  const runtimeWorkspace = path.join(output, '.runtime-build');
  await mkdir(runtimeWorkspace, { recursive: true });
  const cameraCompatibility=[cameraProvenance.deliveryRuntimeHash,...cameraProvenance.compatibleDeliveryRuntimeHashes].includes(delivery.runtimeHash);
  const runtime = await new ThreeCompiler(runtimeWorkspace, 'three-sdk').prepareRuntime(cameraCompatibility?{cameraModulePath:fileURLToPath(new URL('./compat/creator-camera.ts',import.meta.url))}:{});
  for (const [relative] of Object.entries(await hashTree(runtime.root))) {
    const to = closedPath(path.join(playableRoot, 'runtime'), relative);
    await mkdir(path.dirname(to), { recursive: true }); await copyFile(closedPath(runtime.root, relative), to);
  }
  await installEpisodePresentation(playableRoot);
  // Compiler cache belongs to the host; it never enters the author input closure.
  const originalSourceEntries = Object.fromEntries(selected.filter(([key]) => key.startsWith('source/')).map(([key, hash]) => [key.slice(7), hash]));
  if (canonicalHash(sourceFiles) !== canonicalHash(originalSourceEntries)) throw new Error('EPISODE_AUTHOR_SOURCE_CHANGED');
  const runtimeFiles = await hashTree(path.join(playableRoot, 'runtime'));
  const runtimeHash = canonicalHash(runtimeFiles), playableFiles = await hashTree(playableRoot);
  const originalRuntimeFiles = Object.fromEntries(selected.filter(([key]) => key.startsWith('playable/runtime/')).map(([key, hash]) => [key.slice(17), hash]));
  const runtimeChanged = canonicalHash(originalRuntimeFiles) !== canonicalHash(runtimeFiles);
  const playableChanged=canonicalHash(playableFiles)!==canonicalHash(Object.fromEntries(selected.filter(([key])=>key.startsWith('playable/')).map(([key,hash])=>[key.slice(9),hash])));
  const worldBuildHash = runtimeChanged || playableChanged ? canonicalHash({ kind: 'three-episode-runtime-derivation', sourceWorldBuildHash: delivery.worldBuildHash, sourceHash: delivery.sourceHash, runtimeHash, playableFiles }) : delivery.worldBuildHash;
  const captures = JSON.parse(await readFile(path.join(output, 'captures/captures.json'), 'utf8'));
  const imageFile = async (entry: any): Promise<EpisodeFile> => {
    const file = path.join(output, 'captures', path.basename(entry.image.path));
    await verifyFile({ path: file, sha256: entry.image.sha256 });
    return { path: file, sha256: entry.image.sha256, byteLength: (await lstat(file)).size };
  };
  const openingEntry = captures.images.find((entry: any) => entry.view === 'opening');
  if (!openingEntry) throw new Error('EPISODE_OPENING_MISSING');
  let referenceImage: EpisodeFile | undefined;
  if (options.referenceImage) {
    await verifyFile(options.referenceImage);
    const extension = path.extname(options.referenceImage.path).toLowerCase();
    if (!['.png','.jpg','.jpeg','.webp'].includes(extension)) throw new Error('EPISODE_REFERENCE_IMAGE_FORMAT_INVALID');
    const filename = path.join(output, 'references', `user-original-${options.referenceImage.sha256}${extension}`);
    await mkdir(path.dirname(filename), { recursive: true }); await copyFile(options.referenceImage.path, filename);
    referenceImage = { path: filename, sha256: options.referenceImage.sha256, byteLength: (await lstat(filename)).size };
  }
  let targetCaptures=captures.images.filter((entry:any)=>entry.view==='entity-triview');
  if(captures.selectionPolicy==='important-representatives-v1'){
    const ids=captures.conditioningEntityIds;
    if(!Array.isArray(ids)||!ids.length||ids.some((id:any)=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new Error('EPISODE_TARGET_SELECTION_INVALID');
    targetCaptures=targetCaptures.filter((entry:any)=>entry.entityIds?.some((id:string)=>ids.includes(id)));
    if(ids.some((id:string)=>!targetCaptures.some((entry:any)=>entry.entityIds?.includes(id))))throw new Error('EPISODE_SELECTED_TARGET_MISSING');
  }
  const source: EpisodeSourceManifest = {
    kind: 'three-episode-source', schemaVersion: 1, worldId: options.worldId,
    sourceHash: delivery.sourceHash, worldBuildHash, runtimeHash,
    sourceWorldBuildHash: delivery.worldBuildHash, sourceRuntimeHash: delivery.runtimeHash,
    sourceDeliveryManifestSha256: sha(manifestBytes), sourceRoot, playableRoot, sourceFiles,
    ...(referenceImage ? { referenceImage } : {}),
    playableFiles, opening: await imageFile(openingEntry),
    targets: await Promise.all(targetCaptures.map(async (entry: any) => {
      const entityId = entry.orientationTargetId ?? entry.entityIds?.[0];
      if (typeof entityId !== 'string' || !entityId) throw new Error('EPISODE_CAPTURE_TARGET_INVALID');
      return { id: entityId, entityId, name: entityId, role: entry.entityIds?.includes('player') ? 'primary-subject' : 'complete-target', whiteboxTriview: await imageFile(entry) };
    })),
    ...(options.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
  };
  if (new Set(source.targets.map(target => target.id)).size !== source.targets.length) throw new Error('EPISODE_DUPLICATE_VISUAL_TARGET');
  await saveEpisodeSource(path.join(output, 'source.json'), source);
  await writeJson(path.join(output, 'derivation.json'), { schemaVersion: 1, sourceWorldBuildHash: source.sourceWorldBuildHash, worldBuildHash,
    sourceRuntimeHash: source.sourceRuntimeHash, runtimeHash, authorSourceUnchanged: true, authorCompiledEntriesUnchanged: selected.filter(([key]) => key.startsWith('playable/compiled/')).every(([key, hash]) => playableFiles[key.slice(9)] === hash),
    cameraCompatibility:cameraCompatibility?cameraProvenance:null, presentation:'world-canvas-only-v1', runtimeFiles, originalDeliveryManifestSha256: source.sourceDeliveryManifestSha256 });
  return source;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = (flag: string) => process.argv[process.argv.indexOf(flag) + 1]!;
  const source = await prepareEpisodeSource({ payloadRoot: value('--payload'), outputRoot: value('--output'), worldId: value('--world-id'), ...(process.argv.includes('--reference-image') ? { referenceImage: { path: path.resolve(value('--reference-image')), sha256: value('--reference-image-sha256') } } : {}), ...(process.argv.includes('--source-url') ? { sourceUrl: value('--source-url') } : {}) });
  process.stdout.write(`${JSON.stringify({ sourceManifest: path.join(path.resolve(value('--output')), 'source.json'), worldBuildHash: source.worldBuildHash, sourceWorldBuildHash: source.sourceWorldBuildHash })}\n`);
}
