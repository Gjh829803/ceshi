import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile, rm, realpath, readdir, symlink, copyFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {restoreThreeContinuation,continuationPrompt} from './three-eval-restore.mjs';

const exec = promisify(execFile), hash = value => createHash('sha256').update(value).digest('hex');
const writeJson = (file,value) => writeFile(file,JSON.stringify(value));
const fixtureArchive = String.raw`
import json,sys,hashlib,tarfile,io
from pathlib import Path
root=Path(sys.argv[1]); spec=json.loads(sys.argv[2]); kind=spec['kind']
encode=lambda value:json.dumps(value,separators=(',',':')).encode()
sha=lambda data:hashlib.sha256(data).hexdigest()
files={'source/'+name:data.encode() for name,data in spec['source'].items()}
source_hash=sha(encode({name:sha(data.encode()) for name,data in sorted(spec['source'].items())}))
manifest={'kind':'three-creator-'+kind,'schemaVersion':1,'status':'unverified' if kind=='progress' else 'runnable',**spec['identity'],'sourceHash':source_hash,'createdAt':'2026-09-06T00:00:00Z'}
if kind=='checkpoint':
  manifest.update(worldBuildHash='d'*64,previewView='opening',toolVersion='fixture')
  files['playable/index.html']=b'<html>Historical playable</html>'
  files['preview/preview.png']=b'fixture png'
  files['preview/preview.json']=encode({'kind':'three-creator-browser-preview','schemaVersion':1,'profile':manifest['profile'],'sourceHash':source_hash,'worldBuildHash':manifest['worldBuildHash'],'view':'opening','pageErrors':[],'runtimeErrors':[],'blockedNetworkRequests':[],'image':{'path':'preview.png','sha256':sha(files['preview/preview.png'])}})
else: manifest['sourceHashAlgorithm']='author-inventory-sha256-v1'
manifest['files']={name:sha(data) for name,data in files.items()}
files[kind+'.json']=encode(manifest)
files['artifact-hashes.json']=encode({'schemaVersion':1,'files':{name:sha(data) for name,data in files.items()}})
archive=root/('creator-'+kind+'.tar.gz')
with tarfile.open(archive,'w:gz') as stream:
  for name,data in files.items():
    member=tarfile.TarInfo('payload/'+name); member.size=len(data); stream.addfile(member,io.BytesIO(data))
  if spec.get('malicious'):
    member=tarfile.TarInfo(spec['malicious']['name'])
    if spec['malicious'].get('symlink'): member.type=tarfile.SYMTYPE; member.linkname='/tmp/outside'
    stream.addfile(member)
receipt={**manifest,'archiveSha256':sha(archive.read_bytes()),'archiveByteLength':archive.stat().st_size,kind+'ManifestSha256':sha(files[kind+'.json'])}
(root/('creator-'+kind+'.json')).write_bytes(encode(receipt))
print(json.dumps({'kind':kind,'receiptFile':'creator-'+kind+'.json','archiveFile':'creator-'+kind+'.tar.gz','archiveSha256':receipt['archiveSha256'],'sourceHash':receipt['sourceHash']}))
`;
async function archive(f,kind,source,overrides = {}) {
  const {stdout} = await exec('python3',['-c',fixtureArchive,f.inputs,JSON.stringify({kind,source,identity:f.identity,...overrides})]);
  return JSON.parse(stdout);
}
async function fixture(t,{kind='progress',fallback=false,source}={}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(),'three-restore-')); t.after(() => rm(temporary,{recursive:true,force:true}));
  const root = await realpath(temporary), workspace = path.join(root,'test-world--three-sdk'); await mkdir(workspace);
  const inputs = path.join(workspace,'inputs'); await mkdir(inputs);
  await mkdir(path.join(workspace,'outputs')); await mkdir(path.join(workspace,'scratch')); await mkdir(path.join(workspace,'.creator-session'));
  await writeFile(path.join(workspace,'outputs/provider.log'),'preserve provider output');
  const reference = Buffer.from('original image bytes'); await writeFile(path.join(inputs,'reference.png'),reference);
  const layout = {workspace,outputs:path.join(workspace,'outputs'),caseId:'test-world',taskId:'test-world--three-sdk',profile:'three-sdk'};
  const lock = {runtimeHash:'a'.repeat(64),maximumTaskSeconds:2700,prebuiltRuntimes:{'three-sdk':{runtimeHash:'b'.repeat(64)}}};
  const identity = {caseId:layout.caseId,taskId:layout.taskId,profile:layout.profile,creatorRuntimeLockHash:lock.runtimeHash,runtimeHash:lock.prebuiltRuntimes[layout.profile].runtimeHash};
  const input = {kind:'three-creator-case-input',schemaVersion:1,caseId:layout.caseId,taskId:layout.taskId,profile:layout.profile,engine:'three@0.185.1',referenceImageSha256:hash(reference),runtimeHash:lock.runtimeHash,effectiveUserPrompt:'Build the original world.',model:'gpt-6-astra',reasoningEffort:'xhigh'};
  await writeJson(path.join(inputs,'case-input.json'),input);
  const f = {root,inputs,layout,lock,identity,input,source:source ?? (kind === 'progress' ? {'main.ts':'throw new Error("uncompiled WIP; never execute in restore")','planning/map.png':'saved generated map','planning/notes.md':'Continue this map.','feature.ts':'// latest work'} : {'index.html':'<html>previous source</html>','main.js':'// previous source'})};
  const selected = await archive(f,kind,f.source);
  const fallbackSource = fallback ? await archive(f,'checkpoint',{'index.html':'<html>last runnable source</html>','main.js':'// older working code'}) : null;
  f.asset = {kind:'three-creator-continuation',schemaVersion:1,...identity,caseHash:hash(JSON.stringify(input)),parent:{runId:'parent-run',jobId:'gen_12345678',requestId:'wk3-parent-a1'},attemptNumber:2,maximumModelAttempts:2,maximumCumulativeModelSeconds:5400,source:selected,fallback:fallbackSource,failure:{category:'timeout',code:'CREATOR_TASK_TIMEOUT'},remainingWork:['Inspect the existing project and finish required delivery.']};
  f.assetFile = path.join(inputs,'creator-continuation.json'); await writeJson(f.assetFile,f.asset);
  f.restore = () => restoreThreeContinuation({layout:f.layout,lock:f.lock});
  return f;
}
async function noAuthorFiles(f) {
  assert.deepEqual((await readdir(f.layout.workspace)).filter(name => !['inputs','outputs','scratch','.creator-session','.three-creator'].includes(name)),[]);
}

test('a normal generation without a continuation asset does not modify its workspace',async t => {
  const f = await fixture(t); await rm(f.assetFile);
  assert.equal(await f.restore(),null); assert.deepEqual((await readdir(f.layout.workspace)).sort(),['.creator-session','inputs','outputs','scratch']);
});
test('actual WIP archive restores incomplete source and planning assets, with separate runnable fallback and safe lineage',async t => {
  const f = await fixture(t,{fallback:true});
  const result = await f.restore();
  for (const [name,value] of Object.entries(f.source)) assert.equal(await readFile(path.join(f.layout.workspace,name),'utf8'),value);
  await assert.rejects(readFile(path.join(f.layout.workspace,'index.html')),/ENOENT/);
  assert.equal(await readFile(path.join(f.layout.workspace,'.three-creator/recovery/last-runnable/payload/source/index.html'),'utf8'),'<html>last runnable source</html>');
  for (const name of ['creator-result.json','creator-checkpoint.json','creator-progress.json']) await assert.rejects(readFile(path.join(f.layout.workspace,name)),/ENOENT/);
  assert.deepEqual(result.continuation,{kind:'artifact-continuation',parentRunId:'parent-run',parentJobId:'gen_12345678',parentRequestId:'wk3-parent-a1',attemptNumber:2,maximumModelAttempts:2,sourceKind:'progress',sourceHash:f.asset.source.sourceHash,fallbackSourceHash:f.asset.fallback.sourceHash});
  assert.match(result.prompt,/unverified work in progress/); assert.match(result.prompt,/reuse its useful code, assets and world layout/); assert.match(result.prompt,/current Preview/); assert.match(result.prompt,/fresh evidence/);
  assert.equal(await readFile(path.join(f.layout.workspace,'outputs/provider.log'),'utf8'),'preserve provider output');
  assert.deepEqual(await f.restore(),result);
});
test('a checkpoint-only continuation restores source without passing historical delivery evidence forward',async t => {
  const f = await fixture(t,{kind:'checkpoint'}), result = await f.restore();
  assert.equal(result.continuation.sourceKind,'checkpoint'); assert.equal(result.continuation.fallbackSourceHash,undefined);
  assert.equal(await readFile(path.join(f.layout.workspace,'index.html'),'utf8'),f.source['index.html']);
  assert.match(result.prompt,/previous execution/); await assert.rejects(readFile(path.join(f.layout.workspace,'preview/preview.json')),/ENOENT/);
});
test('original case, model, reference, profile and frozen runtime identities must match before source installation',async t => {
  for (const mutate of [
    f => { f.asset.caseId = 'other-case'; },
    f => { f.asset.taskId = 'other-case--three-sdk'; },
    f => { f.asset.profile = 'three-raw'; },
    f => { f.asset.runtimeHash = 'c'.repeat(64); },
    f => { f.asset.creatorRuntimeLockHash = 'c'.repeat(64); },
    f => { f.asset.caseHash = 'c'.repeat(64); },
    f => { f.asset.maximumModelAttempts = 3; },
    f => { f.asset.maximumCumulativeModelSeconds = 100000; },
    f => { f.asset.source.archiveFile = '../creator-progress.tar.gz'; },
    f => { f.asset.parent.runId = '../../outside'; },
  ]) {
    const f = await fixture(t); mutate(f); await writeJson(f.assetFile,f.asset);
    await assert.rejects(f.restore(),/THREE_CONTINUATION_/); await noAuthorFiles(f);
  }
  const changedInput = await fixture(t); changedInput.input.effectiveUserPrompt = 'unrelated world'; await writeJson(path.join(changedInput.inputs,'case-input.json'),changedInput.input);
  await assert.rejects(changedInput.restore(),/CASE_HASH_MISMATCH/); await noAuthorFiles(changedInput);
  const changedReference = await fixture(t); await writeFile(path.join(changedReference.inputs,'reference.png'),'replacement');
  await assert.rejects(changedReference.restore(),/REFERENCE_HASH_MISMATCH/); await noAuthorFiles(changedReference);
});
test('bad source or fallback archives install no author files and fixing the asset allows retry',async t => {
  for (const fallback of [false,true]) {
    const f = await fixture(t,{fallback}), descriptor = fallback ? f.asset.fallback : f.asset.source;
    const file = path.join(f.inputs,descriptor.archiveFile), before = await readFile(file);
    await writeFile(file,'truncated upload');
    await assert.rejects(f.restore(),/PAIR_MISMATCH/); await noAuthorFiles(f);
    await writeFile(file,before); await f.restore();
    assert.equal(await readFile(path.join(f.layout.workspace,'main.ts'),'utf8'),f.source['main.ts']);
  }
});
test('valid paired archives belonging to a different runtime or task are refused',async t => {
  for (const field of ['runtimeHash','creatorRuntimeLockHash','taskId']) {
    const f = await fixture(t), identity = {...f.identity,[field]:field === 'taskId' ? 'another-world--three-sdk' : 'c'.repeat(64),...(field === 'taskId' ? {caseId:'another-world'} : {})};
    f.asset.source = await archive(f,'progress',f.source,{identity}); await writeJson(f.assetFile,f.asset);
    await assert.rejects(f.restore(),/IDENTITY_MISMATCH/); await noAuthorFiles(f);
  }
});
test('even byte-identical preexisting authored source is not adopted without a restore journal',async t => {
  const f = await fixture(t); await writeFile(path.join(f.layout.workspace,'main.ts'),f.source['main.ts']);
  await assert.rejects(f.restore(),/EXISTING_SOURCE_FORBIDDEN/);
  assert.equal(await readFile(path.join(f.layout.workspace,'main.ts'),'utf8'),f.source['main.ts']);
  await rm(path.join(f.layout.workspace,'main.ts')); await f.restore();
});
test('restart after a partial durable install completes missing top-level entries without overwriting existing ones',async t => {
  const f = await fixture(t); const expected = await f.restore(), markerFile = path.join(f.layout.workspace,'.three-creator/recovery/restore.json');
  const marker = JSON.parse(await readFile(markerFile,'utf8')); marker.status = 'restoring'; await writeJson(markerFile,marker);
  await rm(path.join(f.layout.workspace,'feature.ts')); await rm(path.join(f.layout.workspace,'planning'),{recursive:true});
  assert.deepEqual(await f.restore(),expected);
  for (const [name,value] of Object.entries(f.source)) assert.equal(await readFile(path.join(f.layout.workspace,name),'utf8'),value);
  assert.equal(JSON.parse(await readFile(markerFile,'utf8')).status,'restored');
});
test('changed source after a partial restore is retained and blocks destructive reinstallation',async t => {
  const f = await fixture(t); await f.restore();
  await writeFile(path.join(f.layout.workspace,'main.ts'),'new independent work');
  await assert.rejects(f.restore(),/EXISTING_SOURCE_CHANGED/);
  assert.equal(await readFile(path.join(f.layout.workspace,'main.ts'),'utf8'),'new independent work');
});
test('host paths are forbidden even inside an otherwise valid checkpoint archive',async t => {
  for (const name of ['inputs/override.json','outputs/report.json','runtime/runtime.js','creator-result.json','scratch/code.js']) {
    const f = await fixture(t,{kind:'checkpoint',source:{'index.html':'<html>source</html>',[name]:'must never restore'}});
    await assert.rejects(f.restore(),/HOST_SOURCE_FORBIDDEN|PRIVATE_PATH/); await noAuthorFiles(f);
    assert.equal(await readFile(path.join(f.layout.workspace,'outputs/provider.log'),'utf8'),'preserve provider output');
  }
});
test('archive traversal, links and private account-home members are rejected before author writes',async t => {
  for (const malicious of [{name:'payload/source/../../outside'},{name:'payload/source/linked',symlink:true},{name:'payload/source/.codex/auth.json'}]) {
    const f = await fixture(t,{kind:'checkpoint'});
    f.asset.source = await archive(f,'checkpoint',f.source,{malicious}); await writeJson(f.assetFile,f.asset);
    await assert.rejects(f.restore(),/THREE_CHECKPOINT_/); await noAuthorFiles(f);
  }
});
test('linked input files and redirected restore directories cannot redirect restoration',async t => {
  const f = await fixture(t), original = path.join(f.root,'outside-reference.png');
  await copyFile(path.join(f.inputs,'reference.png'),original); await rm(path.join(f.inputs,'reference.png')); await symlink(original,path.join(f.inputs,'reference.png'));
  await assert.rejects(f.restore(),/PATH_INVALID/); await noAuthorFiles(f);
  const redirected = await fixture(t), outside = path.join(redirected.root,'outside'); await mkdir(outside);
  await symlink(outside,path.join(redirected.layout.workspace,'.three-creator'));
  await assert.rejects(redirected.restore(),/PATH_INVALID/); assert.deepEqual(await readdir(outside),[]);
});

test('normal prompts preserve every byte and stdin is consumed only for an actual continuation',async()=>{
  const original='Original prompt\n中文\n';
  const unused={async *[Symbol.asyncIterator](){throw new Error('Normal stdin must stay inherited');}};
  assert.deepEqual(await continuationPrompt(original,null,unused),{argument:original});
  assert.deepEqual(await continuationPrompt('-',null,unused),{argument:'-'});
  const restored={prompt:'Restored source: inspect existing files.'};
  assert.deepEqual(await continuationPrompt(original,restored,unused),{argument:original+'\n\n'+restored.prompt});
  const input={async *[Symbol.asyncIterator](){yield Buffer.from(original);}};
  assert.deepEqual(await continuationPrompt('-',restored,input),{argument:'-',stdin:original+'\n\n'+restored.prompt});
});
