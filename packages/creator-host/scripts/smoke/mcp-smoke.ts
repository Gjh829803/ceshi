import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ThreeCreatorTools } from '../../src/tools/tools.js';
import { profileFrom, sha256 } from '../../src/contracts.js';
const require = createRequire(import.meta.url);
const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const profile = profileFrom(arg('--profile') ?? 'three-raw'), root = path.resolve(arg('--workspace') ?? `.codex-tmp/three-creator-smoke/mcp-${profile}`);
await mkdir(root, { recursive: true }); const service = new ThreeCreatorTools(root, profile), example = await service.examples(); for (const [name, text] of Object.entries(example.files)) await writeFile(path.join(root, name), text); await service.close();
const pinnedEnvironment: Record<string, string> = {}; for (const key of ['WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT', 'WORLDKIT_THREE_PREBUILT_RUNTIME_MANIFEST_SHA256', 'WORLDKIT_CREATOR_RUNTIME_HASH']) if (process.env[key]) pinnedEnvironment[key] = process.env[key]!;
const transport = new StdioClientTransport({ command: process.execPath, args: [require.resolve('tsx/cli'), path.resolve('packages/creator-host/src/cli/mcp.ts'), '--workspace', root, '--profile', profile], env: pinnedEnvironment, stderr: 'pipe' });
const client = new Client({ name: 'three-creator-local-transport-smoke', version: '1.0.0' });
try {
  await client.connect(transport); const listed = await client.listTools(); const events: any[] = [];
  async function call(name: string, args: Record<string, unknown> = {}) { const result = await client.callTool({ name, arguments: args }); if (result.isError) throw new Error(JSON.stringify(result.content)); const text = (result.content as any[]).find(item => item.type === 'text'); const value = JSON.parse(text.text); events.push({ name, value, images: (result.content as any[]).filter(item => item.type === 'image').map(item => ({ mimeType: item.mimeType, sha256: sha256(Buffer.from(item.data, 'base64')) })) }); return value; }
  const environment = await call('creator_describe_environment'), validation = await call('world_validate'); let compiled;
  do { compiled = await call('operations_get', { operationId: validation.operationId, waitSeconds: 10 }); } while (['queued', 'running'].includes(compiled.status));
  if (compiled.status !== 'succeeded' || (pinnedEnvironment.WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT && !compiled.result.runtimeCacheHit)) throw new Error('THREE_MCP_PREBUILT_NOT_REUSED');
  const started = await call('world_preview'); let operation;
  do { operation = await call('operations_get', { operationId: started.operationId, waitSeconds: 10 }); } while (['queued', 'running'].includes(operation.status));
  if (operation.status !== 'succeeded' || events.at(-1).images[0]?.sha256 !== operation.result.image.sha256) throw new Error('THREE_MCP_IMAGE_EVIDENCE_MISMATCH');
  const report = { status: 'passed', transport: 'actual-stdio-mcp', toolCount: listed.tools.length, profile, prebuiltRuntimeCacheHit: compiled.result.runtimeCacheHit, environment, events };
  await writeFile(path.join(root, 'mcp-smoke-report.json'), JSON.stringify(report, null, 2)); process.stdout.write(`${JSON.stringify({ status: report.status, toolCount: report.toolCount, profile, worldBuildHash: operation.result.worldBuildHash, pngSha256: operation.result.image.sha256, reportPath: path.join(root, 'mcp-smoke-report.json') }, null, 2)}\n`);
} finally { await client.close(); await transport.close(); }
