import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import { fileURLToPath } from 'node:url';
import { ThreeCreatorTools } from './tools.js';
import { objectSchema, profileFrom, THREE_CREATOR_VERSION, PREVIEW_INPUT_SCHEMA, sha256, errorMessage, type CreatorProfile } from './contracts.js';
import { AUTHORING_TOPICS } from './authoring-schema.js';
import { WORLD_COMMAND_SCHEMA } from './command-schema.js';
const string = { type: 'string', minLength: 1 };
export const THREE_CREATOR_TOOLS = [
  { name: 'creator_describe_environment', description: 'Read the selected Three raw/SDK profile, actual capabilities and limitations. Call first.', inputSchema: objectSchema({}) },
  { name: 'creator_get_authoring_schema', description: 'Read the selected public SDK topic, shared observer and preview input schema. Default is getting-started; use control/extensions when needed.', inputSchema: objectSchema({ topic: { enum: AUTHORING_TOPICS } }) },
  { name: 'creator_get_examples', description: 'Get an ordinary HTML project. Default getting-started is minimal; SDK extensions is the full asset/control/movement/effects/geometry example.', inputSchema: objectSchema({ topic: { enum: ['getting-started', 'extensions'] } }) },
  { name: 'assets_search', description: 'Search verified reusable GLB assets, exact actions and limitations. Does not expose private Host source paths.', inputSchema: objectSchema({ query: string }) },
  { name: 'assets_describe', description: 'Describe a catalog asset and exact animation mapping. Select its id in project.json assetIds; SDK world.assets.load(id) loads the packaged verified resource.', inputSchema: objectSchema({ assetId: string }, ['assetId']) },
  { name: 'world_validate', description: 'Compile a browser candidate without executing author code/config on the Host. Cached fixed Three/SDK is reused. Episode-only changes do not rebuild the world. Returns operationId; compilation alone is not runtime acceptance.', inputSchema: objectSchema({}) },
  { name: 'world_preview', description: 'See actual browser images. opening resets to the reference camera; current preserves the live page. Current input holds keys up to 15 seconds, clicks, drags or scrolls, then releases keys and returns state/errors, camera continuity and approximate projected-player-bounds diagnostics, plus at most 3 actual images: before input, first heuristic transition if detected, and final page. Signals are informational, can reflect intentional input, and never block delivery. No episode or video. top-down and entity-triview inspect geometry.', inputSchema: objectSchema({ view: { enum: ['opening', 'current', 'top-down', 'entity-triview'] }, input: PREVIEW_INPUT_SCHEMA, entityIds: { type: 'array', items: string, maxItems: 16 }, frontYawRadians: { type: 'number' } }) },
  { name: 'world_inspect', description: 'Inspect actual browser object hierarchy, player/camera/targets/bounds and optional SDK physics/animation state, plus v2 capability descriptions and browser errors. Returns Creator operationId.', inputSchema: objectSchema({ query: string, entityIds: { type: 'array', items: string, maxItems: 64 } }) },
  { name: 'world_execute_command', description: 'Execute one closed SDK v2 command in the actual current browser. Returns Creator operationId; its result.worldCommandReceipt is applied, accepted with a distinct World operationId, or rejected. Use world_get_operation for accepted work. Does not auto-start, rebuild, teleport for testing, or imply task completion. Raw profile is unsupported.', inputSchema: objectSchema({ command: WORLD_COMMAND_SCHEMA }, ['command']) },
  { name: 'world_get_operation', description: 'Read an actual World operation from an accepted command, distinct from the Creator operationId returned by tools. Returns Creator operationId; result.worldOperation contains the live SDK status. Does not submit the command again or start the world.', inputSchema: objectSchema({ worldOperationId: string, waitSeconds: { type: 'number', minimum: 0, maximum: 25 } }, ['worldOperationId']) },
  { name: 'world_capture_triviews', description: 'Capture actual opening plus complete player and every target group in front/right/back orthographic views. Preserve child meshes, attachments and rig hierarchy.', inputSchema: objectSchema({}) },
  { name: 'world_submit', description: 'Package this current-source opening preview, actual three views and playable into a preview-based delivery. No episode file, minimum play duration or video is required. A completed delivery is directly playable; there is no manual review stage.', inputSchema: objectSchema({}) },
  { name: 'operations_get', description: 'Poll a previously returned operationId; successful previews include actual image bytes. waitSeconds is at most 25. Never submit duplicate operations while waiting.', inputSchema: objectSchema({ operationId: string, waitSeconds: { type: 'number', minimum: 0, maximum: 25 } }, ['operationId']) },
  { name: 'operations_cancel', description: 'Cancel an operation in this service. Cancelling a queued operation never closes an unrelated active browser.', inputSchema: objectSchema({ operationId: string }, ['operationId']) },
].map(tool => ({ ...tool, annotations: { readOnlyHint: ['creator_describe_environment', 'creator_get_authoring_schema', 'creator_get_examples', 'assets_search', 'assets_describe', 'operations_get'].includes(tool.name), destructiveHint: false, openWorldHint: false } }));
const ajv = new Ajv({ allErrors: true, strict: false, strictNumbers: true });
const checks = new Map(THREE_CREATOR_TOOLS.map(tool => [tool.name, ajv.compile(tool.inputSchema)]));
export async function executeThreeCreatorTool(service: ThreeCreatorTools, name: string, args: Record<string, any> = {}) {
  const check = checks.get(name); const valid = check?.(args); if (!check || !valid) throw new Error(`THREE_TOOL_INPUT_INVALID: ${name} ${JSON.stringify(check?.errors ?? [])}`);
  const input = args as Record<string, any>;
  switch (name) {
    case 'creator_describe_environment': return service.environment();
    case 'creator_get_authoring_schema': return service.schema(input.topic);
    case 'creator_get_examples': return service.examples(input.topic);
    case 'assets_search': return service.assets(input.query);
    case 'assets_describe': return service.assets('', input.assetId);
    case 'world_validate': return service.start('world.validate', () => service.validate());
    case 'world_preview': return service.start('world.preview', () => service.preview(input.view, input.entityIds, input.frontYawRadians, input.input));
    case 'world_inspect': return service.start('world.inspect', () => service.inspect({ query: input.query, entityIds: input.entityIds }));
    case 'world_execute_command': return service.start('world.execute-command', id => service.executeCommand(input.command, id));
    case 'world_get_operation': return service.start('world.get-operation', () => service.worldOperation(input.worldOperationId, input.waitSeconds ?? 0));
    case 'world_capture_triviews': return service.start('world.capture-triviews', () => service.triviews());
    case 'world_submit': return service.start('world.submit', () => service.submit());
    case 'operations_get': return service.getOperation(input.operationId, input.waitSeconds ?? 0);
    case 'operations_cancel': return service.cancel(input.operationId);
    default: throw new Error('THREE_TOOL_UNKNOWN');
  }
}
export async function toolContent(service: ThreeCreatorTools, result: any) {
  const content: any[] = [{ type: 'text', text: JSON.stringify(result) }];
  const value = result?.status === 'succeeded' ? result.result : result;
  const images = [...(value?.cameraDiagnostics?.keyframes ?? []).slice(0, 2).map((frame: any) => ({ image: frame.image,
    label: `Actual world canvas: ${frame.reason}; render ${frame.renderIndex}; ${frame.wallSeconds.toFixed(3)} browser wall seconds.` })),
    ...(value?.image ? [{ image: value.image, label: value?.cameraDiagnostics ? 'Actual final browser page after input; paused.' : null }] : [])];
  for (const { image, label } of images) {
    if (image && path.resolve(image.path).startsWith(`${service.evidenceRoot}${path.sep}`)) {
      const bytes = await readFile(image.path); if (sha256(bytes) !== image.sha256) throw new Error('THREE_IMAGE_CHANGED');
      if (label) content.push({ type: 'text', text: label });
      content.push({ type: 'image', mimeType: 'image/png', data: bytes.toString('base64') });
    }
  }
  return content;
}
export async function serveThreeCreatorMcp(workspace: string, profile: CreatorProfile) {
  const service = new ThreeCreatorTools(workspace, profile);
  const server = new Server({ name: 'worldkit_three_creator', version: THREE_CREATOR_VERSION }, { capabilities: { tools: {} }, instructions: 'Use ordinary Three scene code in the selected raw/SDK profile. Read environment, schema and examples. Inspect real screenshots and use current-page input, repair the same project, and preserve fixed external task goals. Long tools return operation IDs. Deliver the playable directly; do not wait for a Host reviewer.' });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: THREE_CREATOR_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async request => { try { return { content: await toolContent(service, await executeThreeCreatorTool(service, request.params.name, request.params.arguments ?? {})) }; } catch (error) { return { isError: true, content: [{ type: 'text', text: errorMessage(error) }] }; } });
  const close = async () => { await service.close(); await server.close(); };
  process.once('SIGTERM', () => void close()); process.once('SIGINT', () => void close()); await server.connect(new StdioServerTransport());
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const workspaceIndex = process.argv.indexOf('--workspace'), profileIndex = process.argv.indexOf('--profile');
  await serveThreeCreatorMcp(workspaceIndex < 0 ? process.cwd() : process.argv[workspaceIndex + 1]!, profileFrom(profileIndex < 0 ? undefined : process.argv[profileIndex + 1]));
}
