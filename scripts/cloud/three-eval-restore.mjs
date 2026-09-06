// Launcher-owned source restoration. This never runs authored code or replays a
// previous tool receipt as evidence for the new model execution.
import {execFile} from 'node:child_process';
import {promisify, isDeepStrictEqual} from 'node:util';
import {createHash, randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {open, lstat, mkdir, readdir, realpath, rename, rm, copyFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const exec = promisify(execFile), here = path.dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const HOST_ROOTS = new Set(['inputs', 'outputs', 'scratch', '.creator-session', '.git']);
const FORBIDDEN_ROOTS = new Set([...HOST_ROOTS, '.three-creator', 'runtime', 'node_modules', 'dist', 'episode.json', 'package-lock.json']);
const PRIVATE = new Set(['auth.json', 'credentials', 'aws-credentials', 'aws-config', 'google-service-account.json', 'codex_home']);
const fail = detail => { throw new Error(`THREE_CONTINUATION_${detail}`); };
const require = (value, detail) => { if (!value) fail(detail); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = isDeepStrictEqual;
const slug = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{2,159}$/.test(value);

async function stat(file) { try { return await lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function directory(file, create = false) {
  if (create) await mkdir(file, {recursive:true, mode:0o700});
  const info = await lstat(file);
  require(info.isDirectory() && !info.isSymbolicLink() && await realpath(file) === file, 'PATH_INVALID');
}
async function bytes(file, maximum = 8 * 1024 * 1024) {
  require(await realpath(file) === file, 'PATH_INVALID');
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    require(info.isFile() && info.nlink === 1 && info.size <= maximum, 'FILE_INVALID');
    const result = await handle.readFile();
    require(result.length === info.size, 'FILE_CHANGED');
    return result;
  } finally { await handle.close(); }
}
async function json(file) { return JSON.parse((await bytes(file)).toString()); }
async function save(file, value) {
  const temporary = `${file}.${randomUUID()}.part`;
  try { await writeFile(temporary, JSON.stringify(value), {flag:'wx',mode:0o600}); await rename(temporary, file); }
  finally { await rm(temporary, {force:true}); }
}

function sourceName(name) {
  const parts = name.split('/');
  require(name && !name.includes('\\') && !/[\x00-\x1f\x7f]/.test(name) && parts.every(part => part && !part.startsWith('.') && !PRIVATE.has(part.toLowerCase()) && !part.toLowerCase().startsWith('codex_home_')), 'SOURCE_PATH_INVALID');
  require(!FORBIDDEN_ROOTS.has(parts[0].toLowerCase()) && !parts[0].toLowerCase().startsWith('creator-'), 'HOST_SOURCE_FORBIDDEN');
  return parts;
}
function validateAsset(asset, input, layout, lock) {
  require(object(asset) && asset.kind === 'three-creator-continuation' && asset.schemaVersion === 1, 'ASSET_INVALID');
  const expected = {caseId:layout.caseId, taskId:layout.taskId, profile:layout.profile, creatorRuntimeLockHash:lock.runtimeHash, runtimeHash:lock.prebuiltRuntimes?.[layout.profile]?.runtimeHash};
  require(['three-sdk','three-raw'].includes(layout.profile) && slug(layout.caseId) && layout.taskId === `${layout.caseId}--${layout.profile}`, 'LAYOUT_INVALID');
  for (const [key, value] of Object.entries(expected)) require(value !== undefined && asset[key] === value, `IDENTITY_MISMATCH_${key}`);
  require(HASH.test(asset.creatorRuntimeLockHash) && HASH.test(asset.runtimeHash) && HASH.test(asset.caseHash ?? ''), 'HASH_INVALID');
  require(object(input) && input.kind === 'three-creator-case-input' && input.schemaVersion === 1 && input.caseId === layout.caseId && input.taskId === layout.taskId && input.profile === layout.profile && input.runtimeHash === lock.runtimeHash && input.model === 'gpt-6-astra' && input.reasoningEffort === 'xhigh', 'INPUT_IDENTITY_MISMATCH');
  require(hash(JSON.stringify(input)) === asset.caseHash && HASH.test(input.referenceImageSha256 ?? ''), 'CASE_HASH_MISMATCH');
  require(object(asset.parent) && slug(asset.parent.runId) && /^gen_[a-f0-9]{8,64}$/.test(asset.parent.jobId ?? '') && /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,255}$/.test(asset.parent.requestId ?? ''), 'PARENT_INVALID');
  require(asset.attemptNumber === 2 && asset.maximumModelAttempts === 2 && Number.isSafeInteger(lock.maximumTaskSeconds) && asset.maximumCumulativeModelSeconds === lock.maximumTaskSeconds * asset.maximumModelAttempts, 'BUDGET_INVALID');
  require(object(asset.failure) && /^[a-z][a-z0-9_-]{0,63}$/.test(asset.failure.category ?? '') && /^[A-Za-z0-9_:-]{1,128}$/.test(asset.failure.code ?? ''), 'FAILURE_INVALID');
  require(Array.isArray(asset.remainingWork) && asset.remainingWork.length <= 12 && asset.remainingWork.every(line => typeof line === 'string' && line.length > 0 && line.length <= 1000 && !/[\x00-\x1f\x7f]/.test(line)), 'HANDOFF_INVALID');
  const descriptor = (value, kind) => {
    require(object(value) && ['progress','checkpoint'].includes(value.kind) && (!kind || value.kind === kind) && value.receiptFile === `creator-${value.kind}.json` && value.archiveFile === `creator-${value.kind}.tar.gz` && HASH.test(value.archiveSha256 ?? '') && HASH.test(value.sourceHash ?? ''), 'SOURCE_DESCRIPTOR_INVALID');
  };
  descriptor(asset.source);
  require(asset.fallback === null || asset.source.kind === 'progress', 'FALLBACK_INVALID');
  if (asset.fallback !== null) descriptor(asset.fallback, 'checkpoint');
  return expected;
}

async function unpack(descriptor, inputs, output, expected) {
  const receipt = path.join(inputs, descriptor.receiptFile), archive = path.join(inputs, descriptor.archiveFile);
  // Both verifiers use closed archive inventories, reject links/private paths,
  // and validate all bytes before atomically publishing the extracted directory.
  const {stdout} = await exec('python3', ['-I', '-B', path.join(here, `three-${descriptor.kind}-unpack.py`), '--archive', archive, '--receipt', receipt, '--output', output, '--expected-json', JSON.stringify({...expected, sourceHash:descriptor.sourceHash, archiveSha256:descriptor.archiveSha256})], {timeout:60000, maxBuffer:16 * 1024 * 1024, env:{PATH:process.env.PATH ?? '/usr/bin:/bin'}});
  const metadata = JSON.parse(stdout);
  const files = Object.fromEntries(Object.entries(metadata.files).filter(([name]) => name.startsWith('source/')).map(([name, digest]) => [name.slice(7), digest]).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0));
  require(Object.keys(files).length > 0, 'SOURCE_EMPTY');
  for (const [name, digest] of Object.entries(files)) { sourceName(name); require(HASH.test(digest), 'SOURCE_HASH_INVALID'); }
  return {root:path.join(output,'payload/source'), files};
}

async function sourceTree(root) {
  const result = {};
  async function walk(current, prefix) {
    await directory(current);
    for (const name of (await readdir(current)).sort()) {
      const file = path.join(current,name), relative = prefix ? `${prefix}/${name}` : name;
      const info = await lstat(file); require(!info.isSymbolicLink(), 'SOURCE_LINK_FORBIDDEN');
      if (info.isDirectory()) await walk(file, relative);
      else { require(info.isFile(), 'SOURCE_FILE_INVALID'); result[relative] = hash(await bytes(file,256 * 1024 * 1024)); }
    }
  }
  await walk(root,''); return result;
}
async function existingAuthorRoots(workspace) {
  const result = [];
  for (const name of (await readdir(workspace)).sort()) {
    if (HOST_ROOTS.has(name)) { await directory(path.join(workspace,name)); continue; }
    if (name === '.three-creator') { await directory(path.join(workspace,name)); continue; }
    result.push(name);
  }
  return result;
}
async function installedTree(workspace, top) {
  const file = path.join(workspace,top), info = await stat(file);
  if (!info) return null;
  require(!info.isSymbolicLink(), 'SOURCE_LINK_FORBIDDEN');
  if (info.isDirectory()) return Object.fromEntries(Object.entries(await sourceTree(file)).map(([name,digest]) => [`${top}/${name}`,digest]));
  require(info.isFile(), 'SOURCE_FILE_INVALID');
  return {[top]:hash(await bytes(file,256 * 1024 * 1024))};
}

/** Restore a host-verified source artifact before starting a new Codex process. */
export async function restoreThreeContinuation({layout, lock}) {
  const workspace = path.resolve(layout.workspace), inputs = path.join(workspace,'inputs');
  await directory(workspace);
  if (!await stat(inputs)) return null;
  await directory(inputs);
  const assetFile = path.join(inputs,'creator-continuation.json');
  if (!await stat(assetFile)) return null;
  const [asset, input] = await Promise.all([json(assetFile), json(path.join(inputs,'case-input.json'))]);
  const expected = validateAsset(asset,input,layout,lock);
  require(hash(await bytes(path.join(inputs,'reference.png'),128 * 1024 * 1024)) === input.referenceImageSha256, 'REFERENCE_HASH_MISMATCH');
  const fingerprint = hash(JSON.stringify(asset));
  const runtimeRoot = path.join(workspace,'.three-creator'), recovery = path.join(runtimeRoot,'recovery');
  await directory(runtimeRoot,true); await directory(recovery,true);
  require((await readdir(runtimeRoot)).every(name => name === 'recovery'), 'EXISTING_RUNTIME_FORBIDDEN');
  const markerFile = path.join(recovery,'restore.json'), marker = await stat(markerFile) ? await json(markerFile) : null;
  require(!marker || marker.kind === 'three-creator-source-restore' && marker.schemaVersion === 1 && marker.continuationSha256 === fingerprint && ['restoring','restored'].includes(marker.status), 'RESTORE_IDENTITY_MISMATCH');
  // Verify the latest WIP and fallback independently before changing author files.
  const selected = await unpack(asset.source,inputs,path.join(recovery,'selected'),expected);
  if (asset.fallback) await unpack(asset.fallback,inputs,path.join(recovery,'last-runnable'),expected);
  require(!marker || same(marker.files,selected.files), 'RESTORE_INVENTORY_MISMATCH');
  const topNames = [...new Set(Object.keys(selected.files).map(name => name.split('/')[0]))].sort();
  const existing = await existingAuthorRoots(workspace);
  require(marker ? existing.every(name => topNames.includes(name)) : existing.length === 0, 'EXISTING_SOURCE_FORBIDDEN');
  for (const top of existing) {
    const expectedFiles = Object.fromEntries(Object.entries(selected.files).filter(([name]) => name === top || name.startsWith(`${top}/`)));
    require(same(await installedTree(workspace,top),expectedFiles), 'EXISTING_SOURCE_CHANGED');
  }
  const journal = {kind:'three-creator-source-restore',schemaVersion:1,continuationSha256:fingerprint,status:'restoring',files:selected.files};
  if (!marker) await save(markerFile,journal);
  // Each top-level entry is installed with a same-filesystem atomic rename.
  // The durable inventory makes a kill between entries safely retryable. Existing
  // entries must exactly match the sealed source; independent edits are never replaced.
  for (const top of topNames) {
    if (existing.includes(top)) continue;
    const temporary = path.join(recovery,`install-${randomUUID()}`), source = path.join(selected.root,top), destination = path.join(workspace,top);
    try {
      const info = await lstat(source);
      if (info.isDirectory()) {
        await directory(temporary,true);
        for (const name of Object.keys(selected.files).filter(name => name.startsWith(`${top}/`))) {
          const target = path.join(temporary,...name.split('/').slice(1));
          await mkdir(path.dirname(target),{recursive:true}); await copyFile(path.join(selected.root,name),target,constants.COPYFILE_EXCL);
        }
      } else await copyFile(source,temporary,constants.COPYFILE_EXCL);
      require(!await stat(destination), 'EXISTING_SOURCE_FORBIDDEN');
      await rename(temporary,destination);
    } finally { await rm(temporary,{recursive:true,force:true}); }
  }
  await save(markerFile,{...journal,status:'restored'});
  const continuation = {kind:'artifact-continuation',parentRunId:asset.parent.runId,parentJobId:asset.parent.jobId,parentRequestId:asset.parent.requestId,attemptNumber:asset.attemptNumber,maximumModelAttempts:asset.maximumModelAttempts,sourceKind:asset.source.kind,sourceHash:asset.source.sourceHash,...(asset.fallback ? {fallbackSourceHash:asset.fallback.sourceHash} : {})};
  const prompt = [
    `Continue the same reference and user requirements from the restored ${asset.source.kind === 'progress' ? 'unverified work in progress' : 'source with a previously clean Preview'}. Inspect and reuse its useful code, assets and world layout.`,
    ...(asset.fallback ? ['The previous runnable source is separately preserved at .three-creator/recovery/last-runnable/payload/source. Compare it if needed; do not blindly discard newer work.'] : []),
    `The previous execution stopped with category ${asset.failure.category} and code ${asset.failure.code}. This alone does not establish a source defect.`,
    'Previous operation IDs and receipts are historical. Use the current Preview and tools to verify the restored world, complete the original requirements and submit with fresh evidence.',
  ].join('\n\n');
  return {prompt,continuation};
}

/** Ordinary invocations are byte-preserving, including inherited stdin. */
export async function continuationPrompt(argument, restored, input) {
  if (!restored) return {argument};
  let original = argument;
  if (argument === '-') {
    const chunks = []; let length = 0;
    for await (const chunk of input) {
      const bytes = Buffer.from(chunk); length += bytes.length;
      if (length > 8 * 1024 * 1024) fail('PROMPT_TOO_LARGE');
      chunks.push(bytes);
    }
    original = Buffer.concat(chunks).toString('utf8');
  }
  const prompt = original + '\n\n' + restored.prompt;
  return argument === '-' ? {argument:'-',stdin:prompt} : {argument:prompt};
}
