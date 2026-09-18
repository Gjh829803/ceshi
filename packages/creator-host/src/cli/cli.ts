import path from 'node:path';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { ThreeCreatorTools } from '../tools/tools.js';
import { executeThreeCreatorTool } from '../tools/tool-dispatch.js';
import { creatorToolErrorResponse } from '../tools/tool-errors.js';
import { profileFrom } from '../contracts.js';
import {REPOSITORY_ROOT} from '../compiler/compiler.js';
import {prepareAssetLibrary} from '../assets/library-source.mjs';

const args = process.argv.slice(2), value = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const policyPath=value('--asset-policy-snapshot'),policyHash=value('--asset-policy-sha256');
await prepareAssetLibrary(REPOSITORY_ROOT,{policySnapshotPath:policyPath});
const service = new ThreeCreatorTools(path.resolve(value('--workspace') ?? process.cwd()), profileFrom(value('--profile')),
 {debugTools:args.includes('--debug-tools'),...(policyPath===undefined?{}:{assetPolicySnapshotPath:policyPath}),...(policyHash===undefined?{}:{assetPolicySha256:policyHash})});
try {
  if (args.includes('--session')) {
    // JSON-lines mode keeps operation/evidence authority in this one process, just like MCP.
    for await (const line of createInterface({ input: process.stdin, terminal: false })) {
      if (!line.trim()) continue;
      let requestId: unknown = null;
      try { const request = JSON.parse(line); requestId = request.id ?? null; const result = await executeThreeCreatorTool(service, request.name, request.arguments ?? {}); process.stdout.write(`${JSON.stringify({ id: request.id ?? null, result })}\n`); }
      catch (error) { process.stdout.write(`${JSON.stringify({ id: requestId, ...creatorToolErrorResponse(error) })}\n`); }
    }
  } else {
    const name = value('--tool') ?? 'creator_describe_environment'; const file = value('--arguments-file');
    const input = file ? JSON.parse(await readFile(file, 'utf8')) : JSON.parse(value('--arguments') ?? '{}');
    let result: any = await executeThreeCreatorTool(service, name, input);
    while (result.operationId && ['queued', 'running'].includes(result.status)) { result = await executeThreeCreatorTool(service, 'operations_get', {operationId: result.operationId, waitSeconds: 25}); }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.status === 'failed' || result.status === 'cancelled') process.exitCode = 1;
  }
} catch (error) { process.stderr.write(`${JSON.stringify(creatorToolErrorResponse(error))}\n`); process.exitCode = 1; }
finally { await service.close(); }
