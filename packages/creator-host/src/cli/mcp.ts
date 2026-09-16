import {executeThreeCreatorTool, THREE_CREATOR_TOOLS} from '../tools/tool-dispatch.js';
export {executeThreeCreatorTool, THREE_CREATOR_TOOLS} from '../tools/tool-dispatch.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ThreeCreatorTools } from '../tools/tools.js';
import { profileFrom, THREE_CREATOR_VERSION, sha256, type CreatorProfile } from '../contracts.js';
import { creatorToolErrorResponse } from '../tools/tool-errors.js';
import { CREATOR_QUALITY_SUMMARY } from '../discovery/quality-guidance.js';
import type { CompilerOptions } from '../compiler/compiler.js';
export async function toolContent(service: ThreeCreatorTools, result: any) {
  const content: any[] = [{ type: 'text', text: JSON.stringify(result) }];
  const image = result?.status === 'succeeded' ? result.result?.image : result?.image;
  if (image && path.resolve(image.path).startsWith(`${service.evidenceRoot}${path.sep}`)) {
    const bytes = await readFile(image.path); if (sha256(bytes) !== image.sha256) throw new Error('THREE_IMAGE_CHANGED');
    content.push({ type: 'image', mimeType: 'image/png', data: bytes.toString('base64') });
  }
  return content;
}
export async function serveThreeCreatorMcp(workspace: string, profile: CreatorProfile, policyOptions:CompilerOptions={}) {
  const service = new ThreeCreatorTools(workspace, profile, policyOptions);
  const server = new Server({ name: 'worldkit_three_creator', version: THREE_CREATOR_VERSION }, { capabilities: { tools: {} }, instructions: `Use ordinary Three scene code in the selected raw/SDK profile. Read environment and relevant schema/examples. ${CREATOR_QUALITY_SUMMARY} Inspect real screenshots and input playtests, repair the same project, and preserve external task goals. Long tools return operation IDs. Delivery technical success is separate from semantic/reference review.` });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: THREE_CREATOR_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async request => { try { return { content: await toolContent(service, await executeThreeCreatorTool(service, request.params.name, request.params.arguments ?? {})) }; } catch (error) { return { isError: true, content: [{ type: 'text', text: JSON.stringify(creatorToolErrorResponse(error)) }] }; } });
  const close = async () => { await service.close(); await server.close(); };
  process.once('SIGTERM', () => void close()); process.once('SIGINT', () => void close()); await server.connect(new StdioServerTransport());
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const workspaceIndex = process.argv.indexOf('--workspace'), profileIndex = process.argv.indexOf('--profile');
  const policyIndex=process.argv.indexOf('--asset-policy-snapshot'),hashIndex=process.argv.indexOf('--asset-policy-sha256');
  if((policyIndex>=0&&!process.argv[policyIndex+1])||(hashIndex>=0&&!process.argv[hashIndex+1]))throw new Error('THREE_ASSET_POLICY_PIN_REQUIRED');
  await serveThreeCreatorMcp(workspaceIndex < 0 ? process.cwd() : process.argv[workspaceIndex + 1]!, profileFrom(profileIndex < 0 ? undefined : process.argv[profileIndex + 1]),
   {debugTools:process.argv.includes('--debug-tools'),...(policyIndex<0?{}:{assetPolicySnapshotPath:process.argv[policyIndex+1]!}),...(hashIndex<0?{}:{assetPolicySha256:process.argv[hashIndex+1]!})});
}
