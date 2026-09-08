import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
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
  expect(guide).not.toHaveProperty('sdkContracts');
  expect(guide).not.toHaveProperty('trainingSourceContracts');
  expect(guide.availableSections).toContain('training');
  expect(Buffer.byteLength(JSON.stringify(guide))).toBeLessThan(12000);
  const declarations = await schema(tools, { topic: 'mounted-interaction', sections: ['training'] });
  expect(declarations.trainingSourceContracts?.['horse.ts']).toContain('class TrainingHorse');
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
