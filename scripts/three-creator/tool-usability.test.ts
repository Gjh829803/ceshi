import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ThreeCreatorTools } from './tools';
import { RuntimeGuidance } from './runtime-guidance';
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
  expect(result.assets.map(asset => asset.id)).not.toContain('creature.horse');
  expect(result.mountUsage).toEqual([]);
  await expect(describeAsset(tools, { assetId: 'creature.horse' })).rejects.toThrow('THREE_ASSET_UNAVAILABLE');
  const guidance = await schema(tools, { topic: 'mounted-interaction' });
  expect(guidance.humanoidExampleTopic).toBeUndefined();
  expect(guidance.sdkGuide).not.toContain('new HorseVisual');
});

it('discovers handling configurations without offering vehicle models', async () => {
  const tools = await service();
  const result = await search(tools, { query: 'humanoid.wheeled', limit: 20 });
  expect(result.assets).toEqual([]);
  const selected=await schema(tools,{topic:'humanoid',sections:['humanoid']});
  expect(selected.aircraftConfigurations!.plane.mode).toBe('plane');
  expect(selected.aircraftConfigurations!.plane.airframe.wheels).toHaveLength(3);
  expect(selected.humanoidSourceContracts['humanoid-runtime/aircraft-spec.ts']).toContain('export declare function createAircraftSpec');
  expect(selected.roadVehicleConfigurations!.car.mode).toBe('wheeled');
  expect(selected.roadVehicleConfigurations!.motorcycle.mode).toBe('motorcycle');
  expect(selected.roadVehicleConfigurations!.car.wheelPhysics.wheels).toHaveLength(4);
  expect(selected.roadVehicleConfigurations!.motorcycle.wheelPhysics.wheels).toHaveLength(2);
  expect(selected.humanoidSourceContracts['humanoid-runtime/road-vehicle.ts']).toContain('export declare function createRoadVehicleSpec');
  const vehicleContract=selected.humanoidSourceContracts['humanoid-runtime/config.ts'];
  expect(vehicleContract).toContain("'skateboard'");
  expect(vehicleContract).toContain("'paddled_boat'");
  expect(vehicleContract).toContain("'submarine'");
  expect(vehicleContract).toContain("'spacecraft'");
  expect(vehicleContract).not.toMatch(/['"](?:sub|space|slide|paddle)['"](?=\s*\|)/);
  expect(vehicleContract).toContain('Driving family and map-region permission key');
  expect(vehicleContract).toContain('Rider pose, not propulsion');
  expect(vehicleContract).toContain('canoe and raft use single-blade strokes');
  expect(vehicleContract).toContain("kind: 'paddle'");
  const guide=await schema(tools,{topic:'humanoid',sections:['guide']});
  expect(guide.sdkGuide).toContain('| Canoe | `paddled_boat` | `canoe` |');
  expect(guide.sdkGuide).toContain("characterPose: 'paddling'");
  expect(guide.sdkGuide).toContain('| Submarine | `submarine` | `submarine` |');
  expect(guide.sdkGuide).toContain('| Spacecraft | `spacecraft` | `spacecraft` |');
});

it('returns a readable schema guide first and actual source contracts only when requested', async () => {
  const tools = await service();
  const guide = await schema(tools, { topic: 'mounted-interaction' });
  expect(guide.sdkGuide).toContain('Imported horse');
  expect(guide.sdkGuide).not.toContain('## Per-wheel road simulation');
  expect((await schema(tools, { topic: 'humanoid' })).sdkGuide).toContain('## Per-wheel road simulation');
  expect(guide).not.toHaveProperty('sdkContracts');
  expect(guide).not.toHaveProperty('humanoidSourceContracts');
  expect(guide.availableSections).toContain('humanoid');
  expect(Buffer.byteLength(JSON.stringify(guide))).toBeLessThan(12000);
  const declarations = await schema(tools, { topic: 'mounted-interaction', sections: ['humanoid'] });
  expect(declarations.humanoidSourceContracts?.['humanoid-runtime/horse.ts']).toContain('class HorseVisual');
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
  expect(complete.humanoidSourceContracts).toEqual(declarations.humanoidSourceContracts);
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
    expect(next.result.assets[0].id).toBe('creature.horse');
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
    expect(schema.availableSections).not.toContain('humanoid');
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


it('preserves an initialization RuntimeError before observer publication in the original operation', async () => {
  const tools = await service();
  await writeFile(path.join(tools.workspace, 'project.json'), JSON.stringify({schemaVersion:1,assetIds:[]}));
  await writeFile(path.join(tools.workspace, 'index.html'), '<script type="module" src="./main.ts"></script>');
  await writeFile(path.join(tools.workspace, 'main.ts'), `await Promise.reject({code:'ENTITY_ROLE_REQUIRED',message:'The landmark needs an explicit role.',category:'invalid-input',phase:'control',entityIds:['landmark'],suggestedAction:'Set role to terrain, obstacle or decoration.'});`);
  const started = tools.start('world.inspect', () => tools.inspect());
  let operation = await tools.getOperation(started.operationId, 25);
  if (operation.status === 'running') operation = await tools.getOperation(started.operationId,25);
  expect(operation.status).toBe('failed');
  expect(operation.errorDetails).toMatchObject({code:'ENTITY_ROLE_REQUIRED',message:'The landmark needs an explicit role.',category:'invalid-input',phase:'control',entityIds:['landmark'],host:{phase:'browser.startup',candidate:{sourceHash:expect.any(String),runtimeHash:expect.any(String),worldBuildHash:expect.any(String)}}});
  expect(operation.errorDetails).not.toHaveProperty('stack');
  expect(await tools.getOperation(started.operationId)).toEqual(operation);
  expect(await tools.getOperation(started.operationId)).toEqual(operation);
},60000);

it('serializes only bounded diagnostic fields despite hostile thrown objects', async () => {
  const {creatorToolErrorResponse} = await import('./tool-errors');
  const value:any={code:'ENTITY_ROLE_REQUIRED',message:'x'.repeat(20000),entityIds:['landmark',1n],secret:'do not copy',toJSON(){throw Error('no');}};
  value.cause=value;
  Object.defineProperty(value,'stack',{get(){throw Error('no');}});
  const response=creatorToolErrorResponse(value);
  expect(response.errorDetails.code).toBe('ENTITY_ROLE_REQUIRED');
  expect(response.errorDetails.message.length).toBeLessThanOrEqual(4000);
  expect(JSON.stringify(response)).not.toContain('do not copy');
  expect(JSON.stringify(response).length).toBeLessThan(20000);
  let getterCalls=0;
  const ordinary=new Error('guarded');
  Object.defineProperty(ordinary,'stack',{get(){getterCalls++;throw Error('do not run');}});
  expect(creatorToolErrorResponse(ordinary).errorDetails).not.toHaveProperty('stack');
  expect(getterCalls).toBe(0);
});

it('preserves browser RPC throws and rejections once, with paused state unchanged and transport distinct', async () => {
  const tools = await service();
  await writeFile(path.join(tools.workspace,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
  await writeFile(path.join(tools.workspace,'index.html'),'<script type="module" src="./main.ts"></script>');
  await writeFile(path.join(tools.workspace,'main.ts'),`
    import * as THREE from 'three'; import {createWorld} from '@worldkit/three';
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),renderer=new THREE.WebGLRenderer();
    renderer.setSize(32,32);document.body.append(renderer.domElement);
    const world=await createWorld({scene,camera,renderer,navigation:false});
    world.addCharacter({id:'hero',object:new THREE.Group(),body:{heightMeters:1,radiusMeters:.2}});world.setControlledEntity('hero');
    await world.start();world.stop();
  `);
  const before=await tools.inspect();
  const session=(tools as any).session;
  await session.page.evaluate(() => {
    const host=(window as any).__THREE_CREATOR_HOST__;
    (window as any).calls=0;
    host.testSync=()=>{(window as any).calls++;throw {code:'ENTITY_ROLE_REQUIRED',message:'sync',phase:'control',entityIds:['landmark']};};
    host.testAsync=async()=>{(window as any).calls++;throw {code:'ASYNC_REJECTED',message:'async',category:'invalid-input'};};
    host.testError=()=>{(window as any).calls++;throw new Error('ordinary error',{cause:new Error('inner cause')});};
    host.testReceipt=()=>{(window as any).calls++;return {status:'rejected',error:{code:'ACTOR_OWNED'}};};
  });
  for(const [method,code] of [['testSync','ENTITY_ROLE_REQUIRED'],['testAsync','ASYNC_REJECTED'],['testError','THREE_TOOL_FAILED']]) {
    const started=tools.start('test.rpc',()=> (tools as any).bridge(session,method));
    const operation=await tools.getOperation(started.operationId,1);
    expect(operation.errorDetails).toMatchObject({code,host:{phase:'browser.bridge',method}});
    if(method==='testError') expect(operation.errorDetails).toMatchObject({stack:expect.stringContaining('ordinary error'),cause:{message:'inner cause'}});
  }
  expect(await (tools as any).bridge(session,'testReceipt')).toEqual({status:'rejected',error:{code:'ACTOR_OWNED'}});
  expect(await session.page.evaluate(()=>(window as any).calls)).toBe(4);
  const after=await tools.inspect();
  expect(after.observation.snapshot).toEqual(before.observation.snapshot);
  expect(after.observation.sample.simulationTick).toBe(before.observation.sample.simulationTick);
  await session.page.close();
  const started=tools.start('test.transport',()=> (tools as any).bridge(session,'testSync'));
  expect((await tools.getOperation(started.operationId,1)).errorDetails).toMatchObject({host:{phase:'browser.transport',method:'testSync'}});
},30000);

it.each(['launch','context','page'])('retains %s failure causes and cleans resources without operation query retries', async stage => {
  const {chromium}=await import('playwright');
  const tools=await service();
  await writeFile(path.join(tools.workspace,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
  await writeFile(path.join(tools.workspace,'index.html'),'<script type="module" src="./main.ts"></script>');
  await writeFile(path.join(tools.workspace,'main.ts'),'export {};');
  const context={route:vi.fn().mockResolvedValue(undefined),newPage:vi.fn().mockRejectedValue(new Error('page unavailable')),close:vi.fn().mockResolvedValue(undefined)};
  const browser={newContext:stage==='context'?vi.fn().mockRejectedValue(new Error('context unavailable')):vi.fn().mockResolvedValue(context),close:vi.fn().mockResolvedValue(undefined)};
  const launch=vi.spyOn(chromium,'launch');
  if(stage==='launch') launch.mockRejectedValueOnce(new Error('bundled unavailable')).mockRejectedValueOnce(new Error('chrome unavailable'));
  else launch.mockResolvedValue(browser as any);
  try {
    const started=tools.start('world.inspect',()=>tools.inspect());
    const operation=await tools.getOperation(started.operationId,25);
    expect(operation.status).toBe('failed');
    expect(operation.errorDetails?.host?.phase).toBe(`browser.${stage}`);
    if(stage==='launch') expect(operation.errorDetails).toMatchObject({code:'THREE_BROWSER_UNAVAILABLE',causes:[{message:'bundled unavailable'},{message:'chrome unavailable'}]});
    else expect(browser.close).toHaveBeenCalledTimes(1);
    if(stage==='page') expect(context.close).toHaveBeenCalledTimes(1);
    expect(await tools.getOperation(started.operationId)).toEqual(operation);
    expect(await tools.getOperation(started.operationId)).toEqual(operation);
    expect(launch).toHaveBeenCalledTimes(stage==='launch'?2:1);
  } finally {launch.mockRestore();}
},30000);

it('retains the real addEntity role failure before start without inventing a stack', async () => {
  const tools=await service();
  await writeFile(path.join(tools.workspace,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
  await writeFile(path.join(tools.workspace,'index.html'),'<script type="module" src="./main.ts"></script>');
  await writeFile(path.join(tools.workspace,'main.ts'),`
    import * as THREE from 'three';import {createWorld} from '@worldkit/three';
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),renderer=new THREE.WebGLRenderer();
    const world=await createWorld({scene,camera,renderer,navigation:false});
    world.addEntity({id:'landmark',object:new THREE.Group()});
  `);
  const started=tools.start('world.inspect',()=>tools.inspect());
  const operation=await tools.getOperation(started.operationId,25);
  expect(operation.errorDetails).toMatchObject({code:'ENTITY_ROLE_REQUIRED',category:'invalid-input',phase:'control',entityIds:['landmark'],suggestedAction:expect.any(String),host:{phase:'browser.startup'}});
  expect(operation.errorDetails).not.toHaveProperty('stack');
},30000);

it.each([
  {code:'ENVIRONMENT_INVALID',entityId:'yard',action:`map.regions=[{id:'yard',name:'Yard',description:'Driving area',center:[0,24],size:[40,40],color:'#eee',modes:['character']}]; await createHumanoidWorld({scene,camera,canvas,map});`,diagnosticPath:'regions[0].center',actual:[0,24]},
  {code:'HUMANOID_CONTENT_REGISTER_IN_OPTIONS',entityId:'ramp-marker',action:`const world=await createHumanoidWorld({scene,camera,canvas,map});world.addEntity({id:'ramp-marker',object:new THREE.Group(),role:'terrain'});`,diagnosticPath:'world.addEntity',actual:'physical entity registration after Humanoid creation'},
  {code:'DECORATION_CANNOT_HAVE_PHYSICS',entityId:'ramp-marker',action:`const world=await createWorld({scene,camera,canvas,navigation:false});world.addEntity({id:'ramp-marker',object:new THREE.Group(),role:'decoration',physics:{kind:'none'}});`,diagnosticPath:'physics',actual:'present'},
])('returns actionable $code from real browser initialization through the tool contract',async({code,entityId,action,diagnosticPath,actual})=>{
  const tools=await service(['humanoid.source-101']);
  await writeFile(path.join(tools.workspace,'project.json'),JSON.stringify({schemaVersion:1,assetIds:['humanoid.source-101']}));
  await writeFile(path.join(tools.workspace,'index.html'),'<script type="module" src="./main.ts"></script>');
  await writeFile(path.join(tools.workspace,'main.ts'),`
    import * as THREE from 'three';import {createWorld,createHumanoidWorld} from '@worldkit/three';
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),canvas=document.createElement('canvas');document.body.append(canvas);
    const map={id:'yard-map',name:'Yard',description:'Physical floor',bounds:{min:[-20,-5,-20],max:[20,20,20]},boxes:[{id:'floor',position:[0,-.5,0],size:[40,1,40]}],water:[],regions:[],spawns:[],playerSpawn:[0,0,0]};
    ${action}
  `);
  const started=await executeThreeCreatorTool(tools,'world_preview',{view:'opening'}) as {operationId:string};
  const operation=await tools.getOperation(started.operationId,25);
  expect(operation.status).toBe('failed');
  expect(operation.errorDetails).toMatchObject({code,entityIds:[entityId],path:diagnosticPath,actual,expected:expect.any(String),suggestedAction:expect.any(String),host:{phase:'browser.startup',candidate:{sourceHash:expect.any(String),runtimeHash:expect.any(String)}}});
  expect(operation.errorDetails?.nextSteps[0]?.instruction).toBe(operation.errorDetails?.suggestedAction);
  expect(await executeThreeCreatorTool(tools,'operations_get',{operationId:started.operationId})).toMatchObject({...operation,operationId:operation.id,next:null});
},60000);

it('bounds field diagnostics without reading authored accessors or coercing values',async()=>{
  const {creatorToolErrorResponse}=await import('./tool-errors');
  let reads=0;
  const actual:unknown[]=[0,24];
  Object.defineProperty(actual,'2',{get(){reads++;throw Error('must not read');}});
  actual[3]={toString(){reads++;throw Error('must not coerce');}};
  const error={code:'ENVIRONMENT_INVALID',message:'invalid center',path:'x'.repeat(8000),expected:'e'.repeat(8000),actual,suggestedAction:'Use three finite coordinates.'};
  const response=creatorToolErrorResponse(error);
  expect(response.errorDetails).toMatchObject({path:'x'.repeat(4000),expected:'e'.repeat(4000),actual:[0,24,'<unavailable>','<unavailable>']});
  expect(reads).toBe(0);
  Object.defineProperty(error,'actual',{get(){reads++;throw Error('must not read');}});
  expect(creatorToolErrorResponse(error).errorDetails).not.toHaveProperty('actual');
  expect(reads).toBe(0);
  expect(creatorToolErrorResponse({message:'values',actual:[null,false,0,Number.NaN]}).errorDetails.actual).toEqual([null,false,0,'<unavailable>']);
  expect(creatorToolErrorResponse({message:'long',actual:Array(100).fill(1)}).errorDetails.actual).toEqual([...Array(8).fill(1),'<truncated>']);
});

it('preserves legacy physics error codes instead of classifying a known budget error as generic',async()=>{
  const {creatorToolErrorResponse}=await import('./tool-errors');
  const response=creatorToolErrorResponse(new Error('PHYSICS_TRIANGLE_BUDGET_EXCEEDED: old workspace SDK message'));
  expect(response.errorDetails.code).toBe('PHYSICS_TRIANGLE_BUDGET_EXCEEDED');
});

it('returns the failed entity, actual subdivision budget and conditional shape guidance from browser startup',async()=>{
  const tools=await service();
  await writeFile(path.join(tools.workspace,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
  await writeFile(path.join(tools.workspace,'index.html'),'<script type="module" src="./main.ts"></script>');
  await writeFile(path.join(tools.workspace,'main.ts'),`
    import * as THREE from 'three';import {createWorld} from '@worldkit/three';
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),renderer=new THREE.WebGLRenderer();
    const world=await createWorld({scene,camera,renderer,navigation:false,physics:{maximumTriangleCount:64}});
    world.addEntity({id:'wide-floor',role:'terrain',object:new THREE.Mesh(new THREE.BoxGeometry(30,1,30)),physics:{kind:'fixed',shape:'mesh'}});
  `);
  const started=tools.start('world.preview',()=>tools.preview());
  const operation=await tools.getOperation(started.operationId,25);
  expect(operation.status).toBe('failed');
  expect(operation.errorDetails).toMatchObject({code:'PHYSICS_TRIANGLE_BUDGET_EXCEEDED',category:'content',phase:'physics',entityIds:['wide-floor'],
    message:expect.stringContaining('availableTriangleBudget=64'),suggestedAction:expect.stringContaining('convex-hull'),stack:expect.any(String),
    host:{phase:'browser.startup',candidate:{worldBuildHash:expect.any(String)}}});
  expect(operation.errorDetails?.suggestedAction).toMatch(/concav|openings/);
  expect(operation.errorDetails?.nextSteps[0]?.instruction).toBe(operation.errorDetails?.suggestedAction);
  expect(await tools.getOperation(started.operationId)).toEqual(operation);
},30000);


it('keeps navigation failure primary when auxiliary diagnostic collection fails and closes once', async () => {
  const {chromium}=await import('playwright');
  const tools=await service();
  await writeFile(path.join(tools.workspace,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
  await writeFile(path.join(tools.workspace,'index.html'),'<script type="module" src="./main.ts"></script>');
  await writeFile(path.join(tools.workspace,'main.ts'),'export {};');
  const page={on:vi.fn(),addInitScript:vi.fn().mockResolvedValue(undefined),goto:vi.fn().mockRejectedValue(new Error('navigation failed')),evaluate:vi.fn().mockRejectedValue(new Error('collection unavailable'))};
  const context={route:vi.fn().mockResolvedValue(undefined),newPage:vi.fn().mockResolvedValue(page),close:vi.fn().mockResolvedValue(undefined)};
  const browser={newContext:vi.fn().mockResolvedValue(context),close:vi.fn().mockResolvedValue(undefined)};
  const launch=vi.spyOn(chromium,'launch').mockResolvedValue(browser as any);
  try {
    const started=tools.start('world.inspect',()=>tools.inspect());
    const operation=await tools.getOperation(started.operationId,25);
    expect(operation.errorDetails).toMatchObject({message:'navigation failed',collectionError:{message:'collection unavailable'},host:{phase:'browser.startup'}});
    expect(context.close).toHaveBeenCalledTimes(1);expect(browser.close).toHaveBeenCalledTimes(1);
    expect(page.addInitScript.mock.invocationCallOrder[0]).toBeLessThan(page.goto.mock.invocationCallOrder[0]!);
  } finally {launch.mockRestore();}
},30000);

it.each(['unavailable','inspect-rpc','read-transport'])('keeps startup diagnostic sampling local and nested phase exact: %s', async mode => {
  const {chromium}=await import('playwright');
  const tools=await service();
  await writeFile(path.join(tools.workspace,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
  await writeFile(path.join(tools.workspace,'index.html'),'<script type="module" src="./main.ts"></script>');
  await writeFile(path.join(tools.workspace,'main.ts'),'export {};');
  const page={on:vi.fn(),addInitScript:vi.fn().mockResolvedValue(undefined),goto:vi.fn().mockResolvedValue(undefined),evaluate:vi.fn(async (_fn:unknown,args?:{method:string})=> {
    if(args?.method==='inspect') return {ok:false,error:{code:'OBSERVER_INVALID',message:'inspect rejected',phase:'control'}};
    if(args?.method==='read') {
      if(mode==='read-transport') throw new Error('read transport unavailable');
      return {ok:true,result:{snapshotSchemaVersion:2}};
    }
    if(String(_fn).includes('__THREE_CREATOR_DIAGNOSTICS__')) {
      if(mode==='unavailable') throw new Error('optional diagnostics unavailable');
      return [];
    }
    return {ready:mode!=='inspect-rpc',exposed:true};
  })};
  const context={route:vi.fn().mockResolvedValue(undefined),newPage:vi.fn().mockResolvedValue(page),close:vi.fn().mockResolvedValue(undefined)};
  const browser={newContext:vi.fn().mockResolvedValue(context),close:vi.fn().mockResolvedValue(undefined)};
  const launch=vi.spyOn(chromium,'launch').mockResolvedValue(browser as any);
  try {
    const started=tools.start('test.open',async()=>{await (tools as any).open(await tools.compiler.prepare());return {opened:true};});
    const operation=await tools.getOperation(started.operationId,25);
    if(mode==='unavailable') {
      expect(operation).toMatchObject({status:'succeeded',result:{opened:true}});
      expect(context.close).not.toHaveBeenCalled();
      expect((tools as any).session.collectionError).toMatchObject({message:'optional diagnostics unavailable'});
    } else {
      expect(operation).toMatchObject({status:'failed',errorDetails:{host:{phase:mode==='inspect-rpc'?'browser.bridge':'browser.transport',method:mode==='inspect-rpc'?'inspect':'read'}}});
      expect(context.close).toHaveBeenCalledTimes(1);
    }
    expect(await tools.getOperation(started.operationId)).toEqual(operation);
    expect(launch).toHaveBeenCalledTimes(1);
  } finally {launch.mockRestore();}
},30000);

it('contains hostile proxies in public diagnostics and persisted failed operations', async () => {
  const {creatorToolErrorResponse}=await import('./tool-errors');
  const revoked=Proxy.revocable({},{});revoked.revoke();
  const throwing=new Proxy({}, {getPrototypeOf(){throw new Error('prototype unavailable');}});
  const tools=await service();
  for(const value of [revoked.proxy,throwing]) {
    const response=creatorToolErrorResponse(value);
    expect(response).toMatchObject({error:'Unknown thrown value',errorDetails:{code:'THREE_TOOL_FAILED'}});
    expect(()=>JSON.stringify(response)).not.toThrow();
    const started=tools.start('test.proxy',async()=>{throw value;});
    const operation=await tools.getOperation(started.operationId,1);
    expect(operation).toMatchObject({status:'failed',error:response.error,errorDetails:response.errorDetails});
    await expect.poll(async()=>JSON.parse(await readFile(path.join(tools.evidenceRoot,'operations',`${started.operationId}.json`),'utf8'))).toMatchObject({errorDetails:response.errorDetails});
  }
});

it('materializes declarations only for requested sections without hiding available sections', async () => {
  const tools = await service();
  const source = vi.spyOn(RuntimeGuidance.prototype, 'source');
  const definitions = vi.spyOn(RuntimeGuidance.prototype, 'definitions');
  try {
    const guide = await schema(tools, {topic:'mounted-interaction',sections:['guide']});
    expect(source).not.toHaveBeenCalled();
    expect(definitions).not.toHaveBeenCalled();
    expect(guide.availableSections).toContain('contracts');
    expect(guide.availableSections).toContain('humanoid');
    const declarations = await schema(tools, {topic:'mounted-interaction',sections:['contracts','humanoid']});
    expect(source).toHaveBeenCalledWith('contracts.ts');
    expect(source).toHaveBeenCalledWith('humanoid-runtime/road-vehicle.ts');
    const full = await schema(tools, {topic:'mounted-interaction',sections:['all']});
    expect(declarations.sdkContracts).toBe(full.sdkContracts);
    expect(declarations.humanoidSourceContracts).toEqual(full.humanoidSourceContracts);
    expect(guide.availableSections).toEqual(full.availableSections);
  } finally { source.mockRestore(); definitions.mockRestore(); }
});
