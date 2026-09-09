import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ThreeCreatorTools } from './tools';
import { executeThreeCreatorTool } from './mcp';
import { createAssetPolicySnapshot, assetPolicyHash } from './asset-policy.mjs';
import catalog from '../../assets/three-creator/asset-catalog.json';

// Narrow the dynamic MCP dispatch result to the wire contract exercised by each test.
const search = (tools: ThreeCreatorTools, args: Record<string, unknown>) =>
  executeThreeCreatorTool(tools, 'assets_search', args) as ReturnType<ThreeCreatorTools['searchAssets']>;
const describeAsset = (tools: ThreeCreatorTools, args: Record<string, unknown>) =>
  executeThreeCreatorTool(tools, 'assets_describe', args) as ReturnType<ThreeCreatorTools['assets']>;
type SelectedSchema = Partial<Awaited<ReturnType<ThreeCreatorTools['schema']>>> & { availableSections: string[] };
const schema = (tools: ThreeCreatorTools, args: Record<string, unknown>) =>
  executeThreeCreatorTool(tools, 'creator_get_authoring_schema', args) as Promise<SelectedSchema>;

const services: ThreeCreatorTools[] = [];
const roots: string[] = [];
async function service(allowedIds?: string[]) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'creator-usability-'));
  roots.push(root);
  let options = {};
  if (allowedIds) {
    const snapshot = createAssetPolicySnapshot({ schemaVersion: 1, allowedAssetIds: allowedIds, defaultHumanoidAssetId: allowedIds[0]!, allowCustomAssets: true }, catalog.assets);
    const host = await mkdtemp(path.join(os.tmpdir(), 'creator-usability-policy-'));
    roots.push(host);
    const file = path.join(host, 'frozen-policy.json');
    await writeFile(file, JSON.stringify(snapshot));
    options = { assetPolicySnapshotPath: file, assetPolicySha256: assetPolicyHash(snapshot) };
  }
  const tools = new ThreeCreatorTools(root, 'three-sdk', options);
  services.push(tools);
  return tools;
}
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it('searches with compact semantic summaries and fetches complete resource details on demand', async () => {
  const tools = await service();
  const found = await search(tools, { query: 'walk' });
  expect(found.assets.length).toBeGreaterThan(0);
  expect(Buffer.byteLength(JSON.stringify(found))).toBeLessThan(6000);
  for (const asset of found.assets) {
    expect(asset).not.toHaveProperty('resources');
    expect(asset).not.toHaveProperty('sha256');
    expect(asset.details).toEqual({ tool: 'assets_describe', arguments: { assetId: asset.id } });
  }
  const detail = await describeAsset(tools, { assetId: 'humanoid.source-101' });
  const resources = detail.assets[0]?.resources;
  expect(Array.isArray(resources) && resources.length > 40).toBe(true);
  expect(detail.characterUsage[0]?.skillRequests?.find((skill: { id: string }) => skill.id === 'slide')).toBeDefined();
  expect(JSON.stringify(detail)).not.toContain('sourcePath');
});

it('ranks exact identity ahead of assets mentioning it in their guidance', async () => {
  const result = await search(await service(), { query: 'humanoid.source-101' });
  expect(result.assets[0]?.id).toBe('humanoid.source-101');
});

it('paginates the permitted catalog deterministically without omissions or duplicate rows', async () => {
  const tools = await service();
  const ids: string[] = [];
  let offset = 0;
  for (;;) {
    const result = await search(tools, { query: '', limit: 2, offset });
    expect(result.assets.length).toBeLessThanOrEqual(2);
    ids.push(...result.assets.map((asset: { id: string }) => asset.id));
    if (result.nextOffset === null) { expect(ids).toHaveLength(result.total); break; }
    expect(result.nextOffset).toBeGreaterThan(offset);
    offset = result.nextOffset;
  }
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(ids)).toEqual(new Set(tools.compiler.allowedAssets().map(asset => asset.id)));
});

it('keeps denied assets and dependent examples outside the frozen search and guidance', async () => {
  const tools = await service(['humanoid.source-101']);
  const result = await search(tools, { query: '骑马' });
  expect(result.assets.map(asset => asset.id)).not.toContain('training.horse');
  expect(result.mountUsage).toEqual([]);
  await expect(describeAsset(tools, { assetId: 'training.horse' })).rejects.toThrow('THREE_ASSET_UNAVAILABLE');
  const guidance = await schema(tools, { topic: 'mounted-interaction' });
  expect(guidance.trainingExampleTopic).toBeUndefined();
  expect(guidance.sdkGuide).not.toContain('new TrainingHorse');
});

it('discovers vehicles by their maneuver and control guidance', async () => {
  const tools = await service();
  const result = await search(tools, { query: '漂移', limit: 20 });
  expect(result.assets.map(asset => asset.id)).toEqual(expect.arrayContaining(['training.rover', 'training.racer']));
  expect(result.assets.find(asset => asset.id === 'training.rover')?.useWhen).toContain('漂移');
  const bindings = await search(tools, { query: 'training.wheeled', limit: 20 });
  expect(bindings.assets.map(asset => asset.id)).toEqual(expect.arrayContaining(['training.rover', 'training.racer']));
});

it('returns a readable schema guide first and actual source contracts only when requested', async () => {
  const tools = await service();
  const guide = await schema(tools, { topic: 'mounted-interaction' });
  expect(guide.sdkGuide).toContain('Imported horse');
  expect(guide.sdkGuide).not.toContain('## Per-wheel road simulation');
  expect((await schema(tools, { topic: 'training' })).sdkGuide).toContain('## Per-wheel road simulation');
  expect(guide).not.toHaveProperty('sdkContracts');
  expect(guide).not.toHaveProperty('trainingSourceContracts');
  expect(guide.availableSections).toContain('training');
  expect(Buffer.byteLength(JSON.stringify(guide))).toBeLessThan(12000);
  const declarations = await schema(tools, { topic: 'mounted-interaction', sections: ['training'] });
  expect(declarations.trainingSourceContracts?.['training/horse.ts']).toContain('class TrainingHorse');
  expect(declarations).not.toHaveProperty('sdkGuide');
  const complete = await schema(tools, { topic: 'mounted-interaction', sections: ['all'] });
  expect(complete.sdkContracts).toBeDefined();
  expect(complete.sdkFactoryContracts).toContain('createHumanoidWorld');
  const contracts = await schema(tools, { sections: ['contracts'] });
  expect(contracts.sdkFactoryContracts).toContain('createHumanoidWorld');
  const controls = await schema(tools, { topic: 'control', sections: ['commands'] });
  expect(controls.characterCapabilities).toBeDefined();
  expect(controls.controlBindings).toBeDefined();
  expect(complete.episode).toBeDefined();
  expect(complete.trainingSourceContracts).toEqual(declarations.trainingSourceContracts);
});

it('keeps failed operation identity and adds actionable diagnostics to its persisted result', async () => {
  const tools = await service();
  const started = tools.start('world.submit', async () => { throw new Error('THREE_SUBMIT_PLAYTEST_REQUIRED: WORLD_SOURCE_CHANGED_AFTER_PLAYTEST'); });
  const operation = await tools.getOperation(started.operationId, 1);
  expect(operation.id).toBe(started.operationId);
  expect(operation.status).toBe('failed');
  expect(operation.error).toContain('THREE_SUBMIT_PLAYTEST_REQUIRED');
  expect(operation.errorDetails?.code).toBe('THREE_SUBMIT_PLAYTEST_REQUIRED');
  expect(operation.errorDetails?.nextSteps.some((step: { tool?: string }) => step.tool === 'world_playtest')).toBe(true);
  await expect.poll(async () => JSON.parse(await readFile(path.join(tools.evidenceRoot, 'operations', `${started.operationId}.json`), 'utf8'))).toMatchObject({ errorDetails: operation.errorDetails });
});

it('returns correlated structured CLI errors and keeps the same session usable', async () => {
  const tools = await service();
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/three-creator/cli.ts', '--workspace', tools.workspace, '--profile', 'three-sdk', '--session'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', value => { stdout += value; });
  child.stderr.on('data', value => { stderr += value; });
  const done = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  try {
    child.stdin.end([
      { id: 'invalid', name: 'assets_search', arguments: { query: 'horse', limit: 0 } },
      { id: 'unknown-operation', name: 'operations_get', arguments: { operationId: 'unknown' } },
      { id: 'next', name: 'assets_search', arguments: { query: '骑马' } },
    ].map(value => JSON.stringify(value)).join('\n') + '\n');
    expect(await done, stderr).toBe(0);
    const [invalid, unknown, next] = stdout.trim().split('\n').map(line => JSON.parse(line));
    expect(invalid.id).toBe('invalid');
    expect(invalid.errorDetails.code).toBe('THREE_TOOL_INPUT_INVALID');
    expect(invalid.errorDetails.details.validationErrors.some((item: { instancePath: string }) => item.instancePath === '/limit')).toBe(true);
    expect(unknown.id).toBe('unknown-operation');
    expect(unknown.errorDetails.nextSteps.map((step: { instruction: string }) => step.instruction).join(' ')).toContain('Do not resubmit');
    expect(next.id).toBe('next');
    expect(next.result.assets[0].id).toBe('training.horse');
  } finally { child.kill('SIGTERM'); }
}, 20000);

it('exposes structured MCP errors while keeping raw discovery on its supported authoring route', async () => {
  const tools = await service();
  const client = new Client({ name: 'creator-usability-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'scripts/three-creator/mcp.ts', '--workspace', tools.workspace, '--profile', 'three-raw'],
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const invalid = await client.callTool({ name: 'assets_search', arguments: { limit: 0 } });
    expect(invalid.isError).toBe(true);
    const content = invalid.content as { type: string; text: string }[];
    const diagnostic = JSON.parse(content[0]!.text);
    expect(diagnostic.error).toContain('THREE_TOOL_INPUT_INVALID');
    expect(diagnostic.errorDetails.details.validationErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ instancePath: '/limit' }),
    ]));
    const response = await client.callTool({ name: 'creator_get_authoring_schema', arguments: { sections: ['all'] } });
    expect(response.isError).not.toBe(true);
    const schema = JSON.parse((response.content as { text: string }[])[0]!.text);
    expect(schema.project).toBeDefined();
    expect(schema).not.toHaveProperty('sdkContracts');
    expect(schema.availableSections).not.toContain('training');
    const assets = await client.callTool({ name: 'assets_search', arguments: { query: 'horse' } });
    const found = JSON.parse((assets.content as { text: string }[])[0]!.text);
    expect(found.assets.length).toBeGreaterThan(0);
    expect(found.mountUsage[0].integrationReady).toBe(false);
  } finally { await client.close(); }
}, 20000);


it('returns an instant command result within an optional wait without a second tool call', async () => {
  const tools = await service();
  const execute = vi.spyOn(tools, 'executeCommand').mockResolvedValue({worldCommandReceipt: {
    status: 'applied', commandId: 'cmd-1', worldRevision: 1,
  }});
  const reply: any = await executeThreeCreatorTool(tools, 'world_execute_command', {
    command: {type: 'actor.stop', entityId: 'npc'}, waitSeconds: 1,
  });
  expect(reply.status).toBe('succeeded');
  expect(reply.operationId).toBe(reply.id);
  expect(reply.worldExecution).toEqual({status: 'applied'});
  expect(reply.next).toBeNull();
  expect(execute).toHaveBeenCalledTimes(1);
});

it('keeps command acceptance separate from completion and provides the exact next query', async () => {
  const tools = await service();
  const execute = vi.spyOn(tools, 'executeCommand').mockResolvedValue({worldCommandReceipt: {
    status: 'accepted', commandId: 'cmd-1', worldRevision: 1, operationId: 'world-1',
  }});
  const read = vi.spyOn(tools, 'worldOperation').mockResolvedValue({sourceHash: 's', worldBuildHash: 'w',
    worldOperation: {id: 'world-1', status: 'failed', phase: 'navigation', error: {code: 'BLOCKED'}},
  });
  const accepted: any = await executeThreeCreatorTool(tools, 'world_execute_command', {
    command: {type: 'actor.move-to', entityId: 'npc', targetPositionWorldMetersXYZ: [1,0,0]}, waitSeconds: 1,
  });
  expect(accepted.status).toBe('succeeded'); // Host dispatch completed; actor has not.
  expect(accepted.worldExecution).toEqual({status: 'accepted', operationId: 'world-1'});
  expect(accepted.next).toEqual({tool: 'world_get_operation', arguments: {worldOperationId: 'world-1', waitSeconds: 1}});
  const completed: any = await executeThreeCreatorTool(tools, accepted.next.tool, accepted.next.arguments);
  expect(completed.status).toBe('succeeded'); // Query succeeded, but movement failed.
  expect(completed.worldExecution).toMatchObject({status: 'failed', operationId: 'world-1', error: {code: 'BLOCKED'}});
  expect(completed.next).toBeNull();
  expect(execute).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith('world-1', 1);
});

it('returns the same pending operation after the wait budget and never resubmits it', async () => {
  const tools = await service();
  let finish!: (value: any) => void;
  const execute = vi.spyOn(tools, 'executeCommand').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending: any = await executeThreeCreatorTool(tools, 'world_execute_command', {
    command: {type: 'actor.stop', entityId: 'npc'}, waitSeconds: .01,
  });
  try {
    expect(pending.status).toBe('running');
    expect(pending.worldExecution).toBeUndefined();
    expect(pending.next).toEqual({tool: 'operations_get', arguments: {operationId: pending.operationId, waitSeconds: 1}});
  } finally { finish({worldCommandReceipt: {status: 'rejected', commandId: 'cmd', worldRevision: 1, error: {code: 'ACTOR_OWNED'}}}); }
  const rejected: any = await executeThreeCreatorTool(tools, 'operations_get', {operationId: pending.operationId, waitSeconds: 1});
  expect(rejected.operationId).toBe(pending.operationId);
  expect(rejected.worldExecution).toMatchObject({status: 'rejected', error: {code: 'ACTOR_OWNED'}});
  expect(rejected.next).toBeNull();
  expect(execute).toHaveBeenCalledTimes(1);
});


it('keeps a queued command intact and reports cancellation without inventing an action outcome', async () => {
  const tools = await service();
  let release!: () => void;
  const blocker = tools.start('test.blocker', () => new Promise<void>(resolve => { release = resolve; }));
  const execute = vi.spyOn(tools, 'executeCommand');
  const queued: any = await executeThreeCreatorTool(tools, 'world_execute_command', {
    command: {type: 'actor.stop', entityId: 'npc'}, waitSeconds: .01,
  });
  expect(queued.status).toBe('queued');
  await tools.cancel(queued.operationId);
  release();
  await tools.getOperation(blocker.operationId, 1);
  const cancelled: any = await executeThreeCreatorTool(tools, 'operations_get', {operationId: queued.operationId, waitSeconds: 1});
  expect(cancelled.status).toBe('cancelled');
  expect(cancelled.worldExecution).toBeUndefined();
  expect(cancelled.next).toBeNull();
  expect(execute).not.toHaveBeenCalled();
});

it('preserves the pending World query when its preparation outlasts the inline reply', async () => {
  const tools = await service();
  let ready!: () => void;
  const queried = vi.spyOn(tools, 'worldOperation').mockImplementation(async () => {
    await new Promise<void>(resolve => { ready = resolve; });
    return {sourceHash: 's', worldBuildHash: 'w', worldOperation: {id: 'world-pending', status: 'running', phase: 'moving'}};
  });
  const reply: any = await executeThreeCreatorTool(tools, 'world_get_operation', {worldOperationId: 'world-pending', waitSeconds: .01});
  try { expect(reply.next.tool).toBe('operations_get'); }
  finally { ready(); }
  const observed: any = await executeThreeCreatorTool(tools, reply.next.tool, reply.next.arguments);
  expect(observed.worldExecution).toMatchObject({status: 'running', operationId: 'world-pending'});
  expect(observed.next).toEqual({tool: 'world_get_operation', arguments: {worldOperationId: 'world-pending', waitSeconds: 1}});
  expect(queried).toHaveBeenCalledTimes(1);
});

it('rejects invalid wait and inspection selections before dispatch', async () => {
  const tools = await service(), execute = vi.spyOn(tools, 'executeCommand'), inspect = vi.spyOn(tools, 'inspect');
  await expect(executeThreeCreatorTool(tools, 'world_execute_command', {command: {type: 'actor.stop', entityId: 'npc'}, waitSeconds: -1})).rejects.toThrow('THREE_TOOL_INPUT_INVALID');
  await expect(executeThreeCreatorTool(tools, 'world_inspect', {sections: []})).rejects.toThrow('THREE_TOOL_INPUT_INVALID');
  await expect(executeThreeCreatorTool(tools, 'world_inspect', {sections: ['invented']})).rejects.toThrow('THREE_TOOL_INPUT_INVALID');
  expect(execute).not.toHaveBeenCalled();expect(inspect).not.toHaveBeenCalled();
});


it('inspects and executes through actual MCP and a paused browser without advancing simulation', async () => {
  const tools = await service();
  await writeFile(path.join(tools.workspace, 'project.json'), JSON.stringify({schemaVersion: 1, assetIds: []}));
  await writeFile(path.join(tools.workspace, 'index.html'), '<html><body><script type="module" src="./main.ts"></script></body></html>');
  await writeFile(path.join(tools.workspace, 'main.ts'), `
    import * as THREE from 'three';
    import {createWorld} from '@worldkit/three';
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const renderer = new THREE.WebGLRenderer(); renderer.setSize(320,240); document.body.append(renderer.domElement);
    const world = await createWorld({scene,camera,renderer,navigation:false});
    for (const id of ['hero','npc']) {
      const object = new THREE.Mesh(new THREE.BoxGeometry(.4,1,.4), new THREE.MeshBasicMaterial());
      object.position.x = id === 'hero' ? 0 : 3;
      world.addCharacter({id,object,body:{heightMeters:1,radiusMeters:.2}});
    }
    world.setControlledEntity('hero'); await world.start(); world.stop();
  `);
  const client = new Client({name: 'creator-api-feedback-browser', version: '1.0.0'});
  const transport = new StdioClientTransport({command: process.execPath,
    args: ['--import','tsx','scripts/three-creator/mcp.ts','--workspace',tools.workspace,'--profile','three-sdk'],stderr:'pipe'});
  async function call(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const response = await client.callTool({name,arguments:args});
    expect(response.isError).not.toBe(true);
    return JSON.parse((response.content as {text:string}[])[0]!.text);
  }
  async function finish(reply: any): Promise<any> {
    for (let attempt=0; ['queued','running'].includes(reply.status) && attempt<10; attempt++) {
      reply = await call('operations_get', {operationId:reply.operationId,waitSeconds:5});
    }
    expect(reply.status).toBe('succeeded');return reply;
  }
  try {
    await client.connect(transport);
    const full = (await finish(await call('world_inspect'))).result;
    const selected = (await finish(await call('world_inspect', {entityIds:['npc'],sections:['description']}))).result;
    expect(selected.observation.description.entities.map((entity: any)=>entity.state.id)).toEqual(['npc']);
    expect(selected.observation).not.toHaveProperty('objects');
    expect(selected.observation).not.toHaveProperty('snapshot');
    expect(selected.feedback).toEqual({});
    const compact = (await finish(await call('world_inspect', {sections:['snapshot']}))).result;
    expect(compact.observation.snapshot).toEqual(full.observation.snapshot);
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length);
    const applied = await finish(await call('world_execute_command', {command:{type:'entity.set-visible',entityId:'npc',isVisible:false},waitSeconds:5}));
    expect(applied.worldExecution.status).toBe('applied');expect(applied.next).toBeNull();
    const rejected = await finish(await call('world_execute_command', {command:{type:'actor.stop',entityId:'missing'},waitSeconds:5}));
    expect(rejected.worldExecution.status).toBe('rejected');expect(rejected.next).toBeNull();
    const after = (await finish(await call('world_inspect', {sections:['snapshot']}))).result;
    expect(after.observation.snapshot.entities.find((entity:any)=>entity.id==='npc').isVisibleLocal).toBe(false);
    expect(after.observation.sample.simulationTick).toBe(full.observation.sample.simulationTick);
    expect(after.observation.sample.isRunning).toBe(false);
    expect(after.pageErrors).toEqual([]);
  } finally { await client.close(); await transport.close(); }
}, 60000);


it('keeps the operation feedback envelope in one-shot CLI output', async () => {
  const tools = await service();
  const child = spawn(process.execPath, ['--import','tsx','scripts/three-creator/cli.ts',
    '--workspace',tools.workspace,'--profile','three-raw','--tool','world_execute_command',
    '--arguments',JSON.stringify({command:{type:'actor.stop',entityId:'npc'},waitSeconds:1})], {stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',value=>{stdout+=value;});child.stderr.on('data',value=>{stderr+=value;});
  try {
    const code = await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    expect(code,stderr).toBe(1);
    const result=JSON.parse(stdout);
    expect(result.status).toBe('failed');
    expect(result.operationId).toBe(result.id);
    expect(result.next).toBeNull();
    expect(result.worldExecution).toBeUndefined();
    expect(result.error).toContain('THREE_WORLD_COMMANDS_UNSUPPORTED');
  } finally {child.kill('SIGTERM');}
}, 15000);
