import { PLAYER_CAPTURE_VERSION } from './playback-policy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCloudClient } from './cloud.mjs';
import { modelEnvironment, parseEpisodeCloudLayout, launch } from './cloud-launcher.mjs';
import { threeEpisodeHostJob, threeEpisodeSourceUploadJob } from '../cloud/three-episode-host.mjs';
import { createCaptureDispatcher } from './capture-cloud.mjs';

async function fixture(t, behavior = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'episode-cloud-')); t.after(() => rm(root, { recursive: true, force: true }));
  const calls = []; let payload;
  const runtime = { launcherPath: '/fsx/pinned/cloud-launcher.mjs', codexBinary: '/fsx/pinned/codex', outputS3Root: 's3://test-bucket/three-episode', ...behavior.runtime };
  const client = createCloudClient({ repoRoot: root, runtime, config: { baseUrl: 'https://unit.invalid', token: 'never-log-synthetic', userId: 'unit' }, request: async (url, options) => {
    calls.push({ url, method: options.method ?? 'GET' });
    if (options.method === 'POST') { payload = options.body; if (behavior.postError) throw behavior.postError; return { job: { job_id: 'gen_abc123' } }; }
    if (url.includes('by-request-id')) { if (behavior.lookupError) throw behavior.lookupError; return { job_id: 'gen_abc123' }; }
    if (url.endsWith('/config')) return { config: { ...payload, options: { ...payload.defaults, ...payload.options } } };
    if (url.includes('/items')) return { items: (payload.tasks ?? payload.items).map(row => ({ item_id: row.id, status: behavior.failed ? 'failed' : 'succeeded', error: behavior.failed ? 'test terminal' : '' })) };
    throw new Error(`Unexpected URL ${url}`);
  }, poll: async () => { if (behavior.pollError) throw behavior.pollError; return { status: behavior.pollStatus ?? (behavior.failed ? 'failed' : 'succeeded') }; }, transfer: async (source, destination) => {
    if (!source.startsWith('s3://')) return;
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source.includes('episode-launcher-report') ? JSON.stringify({ status: 'delivered', model: 'gpt-6-astra', reasoningEffort: 'xhigh' }) : '{"ok":true}');
  } });
  const args = { taskId: 'test-route', instruction: 'Read and plan', assets: [], outputs: [{ path: path.join(root, 'plan.json'), required: true, contentType: 'application/json' }], model: 'gpt-6-astra', reasoningEffort: 'xhigh', outputRoot: root };
  return { root, calls, client, args, runtime, payload: () => payload };
}
test('cloud GPT-6 outputs have durable identity and repeated calls use exact cached delivery', async t => {
  const f = await fixture(t); const first = await f.client.runCodex(f.args); const second = await f.client.runCodex(f.args);
  assert.equal(first.jobId, second.jobId); assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(f.payload().defaults.model, 'gpt-6-astra'); assert.equal(f.payload().defaults.reasoning_effort, 'xhigh');
  assert.equal(f.payload().tasks[0].outputs[0].path, 'plan.json');
  assert(!JSON.stringify(f.payload()).includes('never-log-synthetic'));
});
test('POST timeout resolves by exact request ID without a second POST', async t => {
  const f = await fixture(t, { postError: new Error('network timeout') }); const state = await f.client.runCodex(f.args);
  assert.equal(state.recoveredByRequestId, true); assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(f.calls.filter(c => c.url.includes('by-request-id')).length, 1);
});
test('unknown submissions stay unknown and never rerun the model on restart', async t => {
  const f = await fixture(t, { postError: new Error('network timeout'), lookupError: Object.assign(new Error('404'), { status: 404 }) });
  await assert.rejects(f.client.runCodex(f.args), { code: 'EPISODE_SUBMISSION_UNKNOWN' });
  await assert.rejects(f.client.runCodex(f.args), { code: 'EPISODE_SUBMISSION_UNKNOWN' });
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});
test('definite submission rejection is distinguished from uncertain transport', async t => {
  const f = await fixture(t, { postError: Object.assign(new Error('invalid request'), { status: 400 }) });
  await assert.rejects(f.client.runCodex(f.args), { code: 'EPISODE_SUBMISSION_REJECTED' });
  await assert.rejects(f.client.runCodex(f.args), { code: 'EPISODE_SUBMISSION_REJECTED' });
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1); assert(!f.calls.some(c => c.url.includes('by-request-id')));
});
test('terminal cloud failure cannot trigger an automatic retry', async t => {
  const f = await fixture(t, { failed: true });
  await assert.rejects(f.client.runCodex(f.args), { code: 'EPISODE_CLOUD_TERMINAL_FAILED' });
  await assert.rejects(f.client.runCodex(f.args), { code: 'EPISODE_CLOUD_TERMINAL_FAILED' });
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});
test('pending is not terminal failure and payload changes cannot reuse old intent', async t => {
  const f = await fixture(t, { pollError: new Error('still running') });
  await assert.rejects(f.client.runCodex(f.args), { code: 'EPISODE_REMOTE_PENDING' });
  await assert.rejects(f.client.runCodex({ ...f.args, instruction: 'different' }), /IMMUTABLE_REQUEST_CHANGED/);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});
test('T2I explicitly pins native GPT-6 and produces no video request', async t => {
  const f = await fixture(t); await f.client.generateImages({ batchId: 'test-images', outputRoot: f.root, items: [{ id: 'opening-00', prompt: 'Preserve geometry', images: [], outputPath: path.join(f.root, 'opening.png'), width: 1280, height: 720 }] });
  const p = f.payload(); assert.equal(p.pipeline, 't2i'); assert.equal(p.generate_video, false); assert.equal(p.options.codex_image_tool, 'system_image_gen');
  assert.match(p.runtime_env.env_vars.LWDP_CODEX_EXEC_ARGS, /gpt-6-astra/); assert.match(p.runtime_env.env_vars.LWDP_CODEX_EXEC_ARGS, /xhigh/); assert.equal(p.items[0].width, 1280);
});
test('rejects model downgrade and output escape before posting', async t => {
  const f = await fixture(t); await assert.rejects(f.client.runCodex({ ...f.args, model: 'gpt-5.5' }), /REQUIRES_GPT6/);
  await assert.rejects(f.client.runCodex({ ...f.args, outputs: [{ path: '/outside/plan.json' }] }), /OUTPUT_OUTSIDE_ROOT/); assert.equal(f.calls.length, 0);
});
test('MCP child strips provider and account authentication; only model keeps platform home', () => {
  const runtime = { nodeBinary: '/bin/node', codexBinary: '/bin/codex' }; const inherited = { CODEX_HOME: '/platform/account-home', LWDP_GENERATION_API_TOKEN: 'secret', AWS_SECRET_ACCESS_KEY: 'secret', GOOGLE_APPLICATION_CREDENTIALS: '/secret' };
  assert.equal(modelEnvironment(runtime, '/task', inherited).CODEX_HOME, undefined);
  assert.equal(modelEnvironment(runtime, '/task', inherited, { authentication: true }).CODEX_HOME, inherited.CODEX_HOME);
  assert(!Object.keys(modelEnvironment(runtime, '/task', inherited)).some(key => /^(LWDP|AWS|GOOGLE)/.test(key)));
});
test('Host Job uses formal Secret injection and explicit pre-Seedance stop', () => {
  const args = { jobId: 'test-episode', image: `registry/worldkit@sha256:${'a'.repeat(64)}`, sourceArchiveS3Uri: 's3://bucket/closure.tar.gz', runArgs: ['scripts/three-episode/run.mjs', '--stop-before-seedance'] };
  const job = threeEpisodeHostJob(args); const container = job.spec.template.spec.containers[0];
  assert.equal(container.env.find(e => e.name === 'LWDP_GENERATION_API_TOKEN').valueFrom.secretKeyRef.name, 'lwdp-generation-token');
  assert.equal(job.spec.backoffLimit, 0); assert.throws(() => threeEpisodeHostJob({ ...args, runArgs: [] }), /PRE_SEEDANCE_STOP/);
});
test('source upload mounts the shared FSx read-only and materializes only project AWS credentials', () => {
  const input = { jobId: 'episode-upload', image: `registry/worldkit@sha256:${'a'.repeat(64)}`, archivePath: '/fsx/pipeline/worldkit-three-episode-experiments/run/source.tar.gz', archiveSha256: 'b'.repeat(64), outputS3Uri: 's3://bucket/source.tar.gz' };
  const job = threeEpisodeSourceUploadJob(input); const spec = job.spec.template.spec;
  assert.equal(spec.volumes.find(v => v.name === 'fsx').persistentVolumeClaim.readOnly, true);
  assert.deepEqual(spec.volumes.find(v => v.name === 'episode-runtime').secret.items.map(i => i.key), ['aws-config', 'aws-credentials']);
  assert(spec.containers[0].command.includes(input.archiveSha256));
  assert.throws(() => threeEpisodeSourceUploadJob({ ...input, archivePath: '/fsx/pipeline/worldkit-three-episode-experiments/../unrelated.tar.gz' }), /IDENTITY_INVALID/);
});
test('launcher enforces layout and captures real subprocess transport without model invocation', async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'episode-launcher-')); const root = await (await import('node:fs/promises')).realpath(temp); t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'unit-task'); const outputs = path.join(workspace, 'outputs'); await mkdir(outputs, { recursive: true }); await mkdir(path.join(workspace, 'inputs'));
  await writeFile(path.join(workspace, 'inputs/episode-launch-input.json'), JSON.stringify({ kind: 'three-episode-launch-input', schemaVersion: 1, taskId: 'unit-task', episodeSourceManifest: null }));
  const binary = path.join(root, 'fake-codex'); const script = `#!${process.execPath}\nconst fs=require('node:fs'); for(const name of ['episode-events.jsonl','episode-stderr.log','episode-launcher-report.json'])fs.writeFileSync('outputs/'+name,'model-generated placeholder'); process.stdout.write(JSON.stringify({type:'turn.completed'})+'\\n');\n`;
  await writeFile(binary, script); await chmod(binary, 0o755);
  const runtime = { codexBinary: binary, codexBinarySha256: createHash('sha256').update(script).digest('hex'), nodeBinary: process.execPath, maximumTaskSeconds: 5 };
  const runtimeFile = path.join(root, 'episode-runtime.json'); await writeFile(runtimeFile, JSON.stringify(runtime));
  const argv = ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'workspace-write', '--model', 'gpt-6-astra', '-c', 'model_reasoning_effort="xhigh"', '-c', 'notify=[]', '-C', workspace, '--add-dir', outputs, '--add-dir', path.join(workspace, 'inputs'), '--output-last-message', path.join(outputs, 'assistant_response.md'), 'test'];
  assert.equal((await parseEpisodeCloudLayout(argv)).workspace, workspace);
  await assert.rejects(parseEpisodeCloudLayout([...argv.slice(0, -1), '--dangerously-bypass-approvals-and-sandbox', 'test']), /PROVIDER_ARGUMENT_INVALID/);
  const previous = process.env.CODEX_HOME; process.env.CODEX_HOME = path.join(root, 'synthetic-platform-home');
  try { const report = await launch(argv, runtimeFile); assert.equal(report.status, 'delivered'); assert.equal(report.eventsSha256, report.eventsTransportSha256); assert.equal(report.nativeImageGenerationEnabled, true); }
  finally { if (previous === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previous; }
  assert.match(await readFile(path.join(outputs, 'episode-stderr.log'), 'utf8'), /process starting/);
  assert.equal(await readFile(path.join(outputs, 'episode-events.jsonl'), 'utf8'), JSON.stringify({type:'turn.completed'})+'\n');
  const receipt=JSON.parse(await readFile(path.join(outputs,'episode-launcher-report.json'),'utf8'));
  assert.equal(receipt.diagnosticsOwnership,'host-private-until-process-exit');
  assert.deepEqual(receipt.discardedModelDiagnosticPaths,['episode-events.jsonl','episode-stderr.log','episode-launcher-report.json']);
});
test('publication hydrates exact content hashes and rejects changed remote bytes', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'episode-artifacts-')); t.after(() => rm(root, { recursive: true, force: true }));
  const objects = new Map(); const client = createCloudClient({ repoRoot: root, transfer: async (source, destination) => {
    if (source.startsWith('s3://')) { await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, objects.get(source)); }
    else objects.set(destination, await readFile(source));
  } });
  const source = path.join(root, 'source'); await mkdir(source); await writeFile(path.join(source, 'capture-summary.json'), '{"ok":true}');
  const manifest = await client.publishDirectory(source, 's3://bucket/artifacts');
  const output = path.join(root, 'output'); await client.hydrateDirectory('s3://bucket/artifacts', output);
  assert.equal(await readFile(path.join(output, 'capture-summary.json'), 'utf8'), '{"ok":true}');
  objects.set(manifest.files[0].s3Uri, Buffer.from('changed')); await rm(path.join(output, 'capture-summary.json'));
  await assert.rejects(client.hydrateDirectory('s3://bucket/artifacts', output), /HASH_MISMATCH/);
});
test('capture dispatch requests one real GPU and resumes exact Job without model/provider calls', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'episode-capture-cloud-')); t.after(() => rm(root, { recursive: true, force: true }));
  const worldBuildHash = 'a'.repeat(64); const sourceManifestPath = path.join(root, 'source.json'); const planPath = path.join(root, 'plan.json');
  await writeFile(sourceManifestPath, JSON.stringify({ worldBuildHash, runtimeHash: 'b'.repeat(64) })); await writeFile(planPath, JSON.stringify({ worldBuildHash }));
  const conf = { workerImage: `registry/image@sha256:${'c'.repeat(64)}`, sourceArchiveS3Uri: 's3://bucket/frozen.tar.gz', captureS3Root: 's3://bucket/captures' };
  let job; let creates = 0; let uploads = 0;
  const dispatcher = createCaptureDispatcher({ runtimeConfig: conf, kube: async (args, input) => { if (args[0] === 'create') { creates++; job = input; } return { ...job, status: { conditions: [{ type: 'Complete', status: 'True' }] } }; }, cloud: {
    uploadArtifact: async () => { uploads++; }, hydrateDirectory: async (prefix, outputRoot) => { await mkdir(outputRoot, { recursive: true }); await writeFile(path.join(outputRoot, 'capture-summary.json'), JSON.stringify({ kind: 'three-episode-capture-summary', playerCaptureVersion: PLAYER_CAPTURE_VERSION, worldBuildHash, status: 'completed', segments: [{ segmentId: 'segment-00', status: 'completed', outputRoot: '/episode/output/capture/segments/segment-00/recipe' }] })); },
  } });
  const args = { sourceManifestPath, planPath, worldBuildHash, outputRoot: path.join(root, 'capture') };
  const first = await dispatcher.run(args); await dispatcher.run(args);
  assert.equal(creates, 1); assert.equal(uploads, 1);
  const container = job.spec.template.spec.containers[0]; assert.equal(container.resources.requests['nvidia.com/gpu'], 1);
  assert.equal(container.env.find(entry => entry.name === 'WORLDKIT_CAPTURE_GPU').value, '1'); assert(container.args.includes('--capture-only')); assert(container.args.includes('--stop-before-seedance'));
  assert.equal(first.segments[0].outputRoot, path.join(args.outputRoot, 'segments/segment-00/recipe'));
});
test('unknown K8s create resolves exact name and never creates a duplicate on restart', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'episode-capture-unknown-')); t.after(() => rm(root, { recursive: true, force: true }));
  const worldBuildHash = 'a'.repeat(64); for (const name of ['source.json', 'plan.json']) await writeFile(path.join(root, name), JSON.stringify({ worldBuildHash })); let creates = 0;
  const dispatcher = createCaptureDispatcher({ runtimeConfig: { workerImage: `registry/image@sha256:${'c'.repeat(64)}`, sourceArchiveS3Uri: 's3://bucket/frozen.tar.gz', captureS3Root: 's3://bucket/captures' }, kube: async args => { if (args[0] === 'create') creates++; throw new Error('transport unavailable'); }, cloud: { uploadArtifact: async () => {} } });
  const args = { sourceManifestPath: path.join(root, 'source.json'), planPath: path.join(root, 'plan.json'), outputRoot: path.join(root, 'capture'), worldBuildHash };
  await assert.rejects(dispatcher.run(args), /transport/); await assert.rejects(dispatcher.run(args), /transport/); assert.equal(creates, 1);
});

test('image routing uses existing pool IDs with a stable request and rejects switching a live attempt',async t=>{
 const pool=['existing-account-one','existing-account-two'];const f=await fixture(t,{runtime:{imageAccountIds:pool}});
 const args={batchId:'test-image-pool',outputRoot:f.root,items:[{id:'image-one',prompt:'test image',outputPath:path.join(f.root,'image.png'),images:[]}]};
 await f.client.generateImages(args);const request=f.payload().request_id;assert.equal(f.payload().options.codex_account_ids.length,1);assert(pool.includes(f.payload().options.codex_account_ids[0]));
 await f.client.generateImages(args);assert.equal(f.payload().request_id,request);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 f.runtime.imageAccountIds=['different-existing-account'];await assert.rejects(f.client.generateImages(args),/REQUIRES_TERMINAL_FAILED/);
 const g=await fixture(t,{runtime:{imageAccountIds:pool},pollError:new Error('pending')});const pending={...args,outputRoot:g.root,items:[{...args.items[0],outputPath:path.join(g.root,'image.png')}]};
 await assert.rejects(g.client.generateImages(pending),/REMOTE_PENDING/);g.runtime.imageAccountIds=['different-existing-account'];await assert.rejects(g.client.generateImages(pending),/REQUIRES_TERMINAL_FAILED/);assert.equal(g.calls.filter(c=>c.method==='POST').length,1);
});

test('distinct same-basename assets cannot overwrite each other in the cloud input directory',async t=>{
 const f=await fixture(t);const assets=[];
 for(const [index,content]of ['first distinct image','second distinct image'].entries()){const dir=path.join(f.root,String(index));await mkdir(dir);const file=path.join(dir,'image.png');await writeFile(file,content);assets.push({id:`view-${index}`,path:file,attachAs:'image'});}
 await f.client.runCodex({...f.args,assets});const uploaded=f.payload().tasks[0].assets.slice(0,2);
 assert.equal(new Set(uploaded.map(a=>a.s3_uri)).size,2);assert.equal(new Set(uploaded.map(a=>a.name)).size,2);
 assert.deepEqual(uploaded.map(a=>a.name),['view-0.png','view-1.png']);
});

test('an explicit single-image retry preserves the failed journal and cannot repeat a live request',async t=>{
 const behavior={failed:true,runtime:{imageAccountIds:['existing-account']}};const f=await fixture(t,behavior);
 const args={batchId:'failed-image',outputRoot:f.root,items:[{id:'one-image',prompt:'same immutable image content',outputPath:path.join(f.root,'image.png'),images:[]}]};
 await assert.rejects(f.client.generateImages(args),/TERMINAL_FAILED/);const first=f.payload().request_id;
 behavior.failed=false;f.runtime.imageRetryAttempts={'failed-image':1};await f.client.generateImages(args);const second=f.payload().request_id;
 assert.notEqual(first,second);await f.client.generateImages(args);assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
 const states=await(await import('node:fs/promises')).readdir(path.join(f.root,'.cloud'));assert(states.some(s=>s.endsWith('-retry-1')));assert.equal(states.length,2);
 const g=await fixture(t,{pollError:new Error('still running'),runtime:{imageAccountIds:['existing-account']}});const pending={...args,outputRoot:g.root,items:[{...args.items[0],outputPath:path.join(g.root,'image.png')}]};
 await assert.rejects(g.client.generateImages(pending),/REMOTE_PENDING/);g.runtime.imageRetryAttempts={'failed-image':1};await assert.rejects(g.client.generateImages(pending),/REQUIRES_TERMINAL_FAILED/);assert.equal(g.calls.filter(c=>c.method==='POST').length,1);
});

test('artifact IO is bounded and concurrent while identical uploads share one transfer',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'episode-io-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new Map(),counts=new Map();let active=0,maximum=0;
 const client=createCloudClient({repoRoot:root,transfer:async(source,destination)=>{
  if(source.startsWith('s3://')){active++;maximum=Math.max(maximum,active);try{await new Promise(r=>setTimeout(r,5));await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,store.get(source));}finally{active--;}}
  else {counts.set(destination,(counts.get(destination)??0)+1);await new Promise(r=>setTimeout(r,5));store.set(destination,await readFile(source));}
 }});
 const input=path.join(root,'input');await mkdir(input);for(let i=0;i<12;i++)await writeFile(path.join(input,i+'.txt'),'identical bytes');
 const manifest=await client.publishDirectory(input,'s3://bucket/parallel');assert.equal(manifest.files.length,12);assert.equal(counts.get(manifest.files[0].s3Uri),1);
 await client.hydrateDirectory('s3://bucket/parallel',path.join(root,'output'));assert(maximum>1&&maximum<=8);for(let i=0;i<12;i++)assert.equal(await readFile(path.join(root,'output',i+'.txt'),'utf8'),'identical bytes');
});

test('cloud reviewer pool recovery retains failed evidence and cannot duplicate live or delivered work',async t=>{
 const behavior={failed:true};const f=await fixture(t,behavior);
 await assert.rejects(f.client.runCodex(f.args),/TERMINAL_FAILED/);const original=f.payload().request_id;
 behavior.failed=false;f.runtime.codexAccountIds=['existing-account-a','existing-account-b'];await f.client.runCodex(f.args);
 assert.notEqual(original,f.payload().request_id);assert.equal(f.payload().options.codex_account_ids.length,1);
 await f.client.runCodex(f.args);assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
 f.runtime.codexRetryAttempts={[f.args.taskId]:1};await assert.rejects(f.client.runCodex(f.args),/REQUIRES_TERMINAL_FAILED/);
 const pending=await fixture(t,{pollError:new Error('pending')});await assert.rejects(pending.client.runCodex(pending.args),/REMOTE_PENDING/);
 pending.runtime.codexAccountIds=['existing-account-a'];await assert.rejects(pending.client.runCodex(pending.args),/REQUIRES_TERMINAL_FAILED/);assert.equal(pending.calls.filter(c=>c.method==='POST').length,1);
});

 test('only an explicit exact-job recovery can retry a terminal cancelled image',async t=>{
  const behavior={pollStatus:'cancelled',runtime:{imageAccountIds:['account-a','account-b']}};const f=await fixture(t,behavior);
  const args={batchId:'cancelled-image',outputRoot:f.root,items:[{id:'one-image',prompt:'same prompt',images:[],outputPath:path.join(f.root,'image.png')}]};
  await assert.rejects(f.client.generateImages(args),/TERMINAL_FAILED/);const first=f.payload().request_id,account=f.payload().options.codex_account_ids[0];
  f.runtime.imageRetryAttempts={'cancelled-image':1};await assert.rejects(f.client.generateImages(args),/REQUIRES_TERMINAL_FAILED/);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
  f.runtime.imageRetryCancelledJobs=['gen_abc123'];behavior.pollStatus='succeeded';await f.client.generateImages(args);assert.notEqual(f.payload().request_id,first);assert.notEqual(f.payload().options.codex_account_ids[0],account);assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
 });
