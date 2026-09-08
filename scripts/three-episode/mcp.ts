import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import Ajv from 'ajv';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash, EPISODE_PLAN_SCHEMA, EPISODE_START_SCHEMA, validateEpisodePlan, type EpisodePlan, type EpisodeSourceManifest } from './contracts.js';
import { closedPath, loadEpisodeSource, resolveEpisodeSourcePaths, verifyFile } from './source.js';
import { openEpisodeBrowser, type BrowserSession, type EpisodeObserveOptions } from './browser.js';
import type { EpisodeStart } from '@worldkit/three';

const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object' as const, properties, required, additionalProperties: false });
const string = { type: 'string', minLength: 1, maxLength: 512 };
const vec3 = { type: 'array', items: { type: 'number', minimum: -100_000, maximum: 100_000 }, minItems: 3, maxItems: 3 };
export const EPISODE_TOOLS = [
 { name: 'episode_observe', description: 'Read a frozen source file or see an actual opening/current/top-down/local browser view with entity and camera facts. Source filenames come from sourceFiles in observation results. Views and probes are optional planning aids, not a mandatory scouting or rehearsal stage. A screenshot viewId can be used for point picking. Does not change or compile the world.', inputSchema: { type: 'object' as const, oneOf: [
  object({ view: { enum: ['opening', 'current', 'top-down'] }, cameraPositionWorldMetersXYZ: vec3, lookAtWorldMetersXYZ: vec3, entityIds: { type: 'array', items: string, maxItems: 64, uniqueItems: true } }),
  object({ sourceFile: string, offsetCharacters: { type: 'integer', minimum: 0, maximum: 1_048_576 }, maximumCharacters: { type: 'integer', minimum: 1, maximum: 32_000 } }, ['sourceFile']),
 ] } },
 { name: 'episode_probe', description: 'Inspect one requested start (including the full optional Training vehicle state) using real local Rapier queries, or pick a point from a previous actual view. Keeps requested XZ and only aligns support height locally; reports unsupported/overlapping starts without selecting another room or route. Point hits distinguish visible geometry from actual support.', inputSchema: { type: 'object' as const, oneOf: [
  object({ kind: { const: 'start' }, start: EPISODE_START_SCHEMA }, ['kind', 'start']),
  object({ kind: { const: 'view-point' }, viewId: string, pixelUv: { type: 'array', items: { type: 'number', minimum: 0, maximum: 1 }, minItems: 2, maxItems: 2 } }, ['kind', 'viewId', 'pixelUv']),
 ] } },
 { name: 'episode_submit_plan', description: 'Deliver the six ordered independent 30-second route intentions as plan.json. Host starts actual recording from this plan; this tool does not pretend routes have passed recording. A repair submission must preserve every passing segment exactly. Use this tool for final delivery; writing a JSON file manually is insufficient. No Seedance submission.', inputSchema: object({ plan: EPISODE_PLAN_SCHEMA }, ['plan']) },
].map(tool => ({ ...tool, annotations: { readOnlyHint: tool.name !== 'episode_submit_plan', destructiveHint: false, openWorldHint: false } }));
const checks = new Map(EPISODE_TOOLS.map(tool => [tool.name, new Ajv({ allErrors: true, strict: false, strictNumbers: true }).compile(tool.inputSchema)]));
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const within = (root: string, target: string) => { const relative = path.relative(root, target); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).split('\n').slice(0, 3).join('\n').slice(0, 3000);
async function regular(file: string, root: string): Promise<string> {
 const resolved = path.resolve(file);
 if (!within(root, resolved) || !(await lstat(resolved)).isFile() || await realpath(resolved) !== resolved) throw new Error('EPISODE_TOOL_INPUT_OUTSIDE_FROZEN_ROOT');
 return resolved;
}
async function boundedRead(file: string, maximumBytes: number): Promise<Buffer> {
 if ((await lstat(file)).size > maximumBytes) throw new Error('EPISODE_TOOL_FILE_TOO_LARGE');
 return readFile(file);
}
function boundedJson(value: unknown): string {
 let remaining = 42_000;
 const reduce = (current: unknown, depth: number, field = ''): unknown => {
  if (remaining <= 0 || depth > 9) return '[additional data in evidence file]';
  if (typeof current === 'string') { const result = current.slice(0, Math.min(remaining, field === 'content' ? 32_000 : 2500)); remaining -= result.length; return result; }
  if (Array.isArray(current)) { const values = current.slice(0, 64).map(item => reduce(item, depth + 1)); if (current.length > 64) values.push(`[${current.length - 64} additional items in evidence file]`); return values; }
  if (current && typeof current === 'object') { const result: Record<string, unknown> = {}; for (const [key, item] of Object.entries(current).slice(0, 80)) { remaining -= key.length + 8; result[key] = reduce(item, depth + 1, key); if (remaining <= 0) break; } return result; }
  remaining -= 20; return current;
 };
 return JSON.stringify(reduce(value, 0));
}
export interface EpisodeMcpOptions { sourceManifest: string; outputRoot: string; sourceRoot?: string; repairInput?: string }
type RepairInput = { previousPlan: EpisodePlan; failedSegmentIds: string[]; failures: unknown };
type EvidenceEntry = { id: string; tool: string; inputHash: string; startedAt: string; status: 'succeeded' | 'failed'; resultSha256?: string; resultPath?: string; image?: { path: string; sha256: string }; error?: string; planHash?: string };

/** Frozen source is the only read capability. The sole write capability is this Episode output directory. */
export class EpisodePlannerTools {
 private browser: Promise<BrowserSession> | undefined;
 private queue: Promise<unknown> = Promise.resolve();
 private closed = false;
 private serial = 0;
 private readonly calls: EvidenceEntry[] = [];
 private planHash: string | undefined;
 private submissionCount = 0;
 private constructor(readonly source: EpisodeSourceManifest, readonly outputRoot: string,
  private readonly sourceManifestSha256: string, private readonly repair?: RepairInput) {}

 static async create(options: EpisodeMcpOptions): Promise<EpisodePlannerTools> {
  const sourceRoot = await realpath(path.resolve(options.sourceRoot ?? path.dirname(options.sourceManifest)));
  const sourceManifest = await regular(options.sourceManifest, sourceRoot), manifestBytes = await boundedRead(sourceManifest, 4 * 1024 * 1024);
  // Check path authority before the shared loader performs any hash reads.
  const header = resolveEpisodeSourcePaths(JSON.parse(manifestBytes.toString()) as EpisodeSourceManifest, sourceManifest);
  for (const directory of [header.sourceRoot, header.playableRoot]) {
   if (typeof directory !== 'string' || !path.isAbsolute(directory) || !within(sourceRoot, directory) || await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) throw new Error('EPISODE_TOOL_SOURCE_DIRECTORY_ESCAPE');
  }
  if (!header.sourceFiles || Object.keys(header.sourceFiles).length > 2000) throw new Error('EPISODE_TOOL_SOURCE_INVENTORY_INVALID');
  for (const relative of Object.keys(header.sourceFiles)) closedPath(header.sourceRoot, relative);
  const files = [header.opening, ...(header.targets ?? []).map(target => target.whiteboxTriview), header.referenceImage, header.worldPlan].filter(Boolean);
  for (const file of files) await regular(file!.path, sourceRoot);
  if (header.contextPath) await regular(header.contextPath, sourceRoot);
  const source = await loadEpisodeSource(sourceManifest);
  const outputRoot = path.resolve(options.outputRoot);
  if (within(sourceRoot, outputRoot) || within(outputRoot, sourceRoot)) throw new Error('EPISODE_TOOL_OUTPUT_INPUT_OVERLAP');
  await mkdir(outputRoot, { recursive: true });
  if (await realpath(outputRoot) !== outputRoot) throw new Error('EPISODE_TOOL_OUTPUT_SYMLINK');
  let repair: RepairInput | undefined;
  if (options.repairInput) {
   const file = path.resolve(options.repairInput), allowedRoot = within(outputRoot, file) ? outputRoot : sourceRoot;
   repair = JSON.parse((await boundedRead(await regular(file, allowedRoot), 4 * 1024 * 1024)).toString()) as RepairInput;
   repair.previousPlan = validateEpisodePlan(repair.previousPlan, { worldBuildHash: source.worldBuildHash });
   if (!Array.isArray(repair.failedSegmentIds) || !repair.failedSegmentIds.length || new Set(repair.failedSegmentIds).size !== repair.failedSegmentIds.length || repair.failedSegmentIds.some(id => !repair!.previousPlan.segments.some(segment => segment.id === id))) throw new Error('EPISODE_REPAIR_INPUT_INVALID');
  }
  const service = new EpisodePlannerTools(source, outputRoot, sha(manifestBytes), repair);
  await service.persist(); return service;
 }
 private identity() { return { worldBuildHash: this.source.worldBuildHash, sourceHash: this.source.sourceHash, runtimeHash: this.source.runtimeHash }; }
 private async write(relative: string, bytes: string | Uint8Array): Promise<{ path: string; sha256: string }> {
  const file = closedPath(this.outputRoot, relative), directory = path.dirname(file);
  await mkdir(directory, { recursive: true }); if (await realpath(directory) !== directory || await realpath(this.outputRoot) !== this.outputRoot) throw new Error('EPISODE_TOOL_OUTPUT_SYMLINK');
  const temporary = path.join(directory, `.episode-${randomUUID()}.part`);
  await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, file); return { path: relative, sha256: sha(bytes) };
 }
 private async persist() {
  await this.write('planner-tool-evidence.json', JSON.stringify({ kind: 'three-episode-planner-tool-evidence', schemaVersion: 1, ...this.identity(), sourceManifestSha256: this.sourceManifestSha256,
   status: this.planHash ? 'submitted' : 'planning', planHash: this.planHash ?? null, submissionCount: this.submissionCount,
   repair: this.repair ? { previousPlanHash: canonicalHash(this.repair.previousPlan), failedSegmentIds: this.repair.failedSegmentIds } : null, calls: this.calls }, null, 2));
 }
 private session(): Promise<BrowserSession> {
  this.browser ??= openEpisodeBrowser({ playableRoot: this.source.playableRoot,
   ...(process.env.WORLDKIT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.WORLDKIT_CHROMIUM_EXECUTABLE } : {}) });
  return this.browser;
 }
 execute(name: string, input: unknown): Promise<CallToolResult> {
  const operation = this.queue.then(() => this.perform(name, input)); this.queue = operation.then(() => undefined, () => undefined); return operation;
 }
 private async perform(name: string, input: unknown): Promise<CallToolResult> {
  if (this.closed) throw new Error('EPISODE_TOOL_SERVICE_CLOSED');
  const check = checks.get(name);
  if (!check || !check(input)) return { isError: true, content: [{ type: 'text', text: `EPISODE_TOOL_INPUT_INVALID: ${name} ${JSON.stringify(check?.errors ?? []).slice(0, 2000)}` }] };
  const args = input as Record<string, any>, id = `tool-${String(++this.serial).padStart(4, '0')}`;
  const evidence: EvidenceEntry = { id, tool: name, inputHash: canonicalHash(args), startedAt: new Date().toISOString(), status: 'succeeded' };
  try {
   let result: Record<string, unknown>; let imageBytes: Buffer | undefined;
   if (name === 'episode_observe' && args.sourceFile !== undefined) {
    const relative = args.sourceFile as string;
    if (!Object.hasOwn(this.source.sourceFiles, relative)) throw new Error('EPISODE_SOURCE_FILE_NOT_DECLARED');
    const file = closedPath(this.source.sourceRoot, relative);
    await verifyFile({ path: file, sha256: this.source.sourceFiles[relative]! });
    if (!/\.(ts|tsx|js|jsx|mjs|json|html|css|md|txt)$/i.test(relative)) throw new Error('EPISODE_SOURCE_FILE_NOT_TEXT');
    const bytes = await boundedRead(file, 1024 * 1024);
    const text = bytes.toString(), offset = args.offsetCharacters ?? 0, end = Math.min(text.length, offset + (args.maximumCharacters ?? 24_000));
    result = { ...this.identity(), sourceFile: relative, sha256: sha(bytes), byteLength: bytes.length, totalCharacters: text.length, offsetCharacters: offset,
     nextOffsetCharacters: end < text.length ? end : null, content: text.slice(offset, end), sourceFiles: Object.keys(this.source.sourceFiles) };
   } else if (name === 'episode_observe') {
    const session = await this.session(), observation = await session.observe(args as EpisodeObserveOptions);
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(observation.imageDataUrl);
    if (!match || match[1]!.length > 40 * 1024 * 1024) throw new Error('EPISODE_OBSERVATION_IMAGE_INVALID');
    imageBytes = Buffer.from(match[1]!, 'base64');
    if (imageBytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('EPISODE_OBSERVATION_PNG_INVALID');
    const { imageDataUrl: _image, ...facts } = observation;
    evidence.image = await this.write(`evidence/${id}.png`, imageBytes);
    result = { ...this.identity(), ...facts, browserErrors: [...session.errors].slice(-32), image: evidence.image, sourceFiles: Object.keys(this.source.sourceFiles),
     ...(this.repair ? { repair: this.repair } : {}) };
   } else if (name === 'episode_probe') {
    const session = await this.session();
    result = { ...this.identity(), result: args.kind === 'start' ? await session.probeStart(args.start as EpisodeStart) : await session.pick(args.viewId, args.pixelUv), browserErrors: [...session.errors].slice(-32) };
   } else {
    const plan = validateEpisodePlan(args.plan, { worldBuildHash: this.source.worldBuildHash });
    if (this.repair) for (const previous of this.repair.previousPlan.segments) {
     if (!this.repair.failedSegmentIds.includes(previous.id) && canonicalHash(previous) !== canonicalHash(plan.segments.find(segment => segment.id === previous.id))) throw new Error(`EPISODE_REPAIR_CHANGED_PASSING_SEGMENT: ${previous.id}`);
    }
    // The source remains the same immutable world even when no preview was needed.
    for (const [relative, hash] of Object.entries(this.source.sourceFiles)) await verifyFile({ path: closedPath(this.source.sourceRoot, relative), sha256: hash });
    const artifact = await this.write('plan.json', `${JSON.stringify(plan, null, 2)}\n`);
    this.planHash = canonicalHash(plan); this.submissionCount++; evidence.planHash = this.planHash;
    result = { ...this.identity(), status: 'submitted', planHash: this.planHash, plan: artifact, segmentIds: plan.segments.map(segment => segment.id),
     nextStage: 'host-recording', recordingHasRun: false, seedanceHasRun: false };
   }
   const resultFile = await this.write(`evidence/${id}.json`, JSON.stringify({ input: args, result }, null, 2));
   evidence.resultPath = resultFile.path; evidence.resultSha256 = resultFile.sha256; this.calls.push(evidence); await this.persist();
   const content: CallToolResult['content'] = [{ type: 'text', text: boundedJson({ ...result, toolEvidence: resultFile }) }];
   if (imageBytes) content.push({ type: 'image', mimeType: 'image/png', data: imageBytes.toString('base64') });
   return { content };
  } catch (error) {
   evidence.status = 'failed'; evidence.error = errorText(error); this.calls.push(evidence); await this.persist();
   return { isError: true, content: [{ type: 'text', text: evidence.error }] };
  }
 }
 async close(): Promise<void> { if (this.closed) return; this.closed = true; const browser = await this.browser?.catch(() => undefined); await browser?.close(); await this.queue; await this.persist(); }
}

export async function serveEpisodeMcp(options: EpisodeMcpOptions): Promise<void> {
 const service = await EpisodePlannerTools.create(options);
 const server = new Server({ name: 'worldkit_three_episode', version: '1.0.0' }, { capabilities: { tools: {} }, instructions: 'Plan six routes in the immutable delivered world. Actual observations and local probes are optional; submit the final plan using episode_submit_plan. Do not edit the world or invoke video generation.' });
 server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: EPISODE_TOOLS }));
 server.setRequestHandler(CallToolRequestSchema, async request => service.execute(request.params.name, request.params.arguments ?? {}));
 let closing = false;
 const close = async () => { if (closing) return; closing = true; await service.close(); await server.close(); process.off('SIGTERM', onSignal); process.off('SIGINT', onSignal); };
 const onSignal = () => { void close().catch(error => { process.stderr.write(`${errorText(error)}\n`); process.exitCode = 1; }); };
 server.onclose = onSignal; process.once('SIGTERM', onSignal); process.once('SIGINT', onSignal);
 await server.connect(new StdioServerTransport());
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const get = (flag: string) => { const index = process.argv.indexOf(flag); return index < 0 ? undefined : process.argv[index + 1]; };
 const sourceManifest = get('--source-manifest'), outputRoot = get('--output-root');
 if (!sourceManifest || !outputRoot) throw new Error('EPISODE_MCP_ARGUMENTS_REQUIRED');
 await serveEpisodeMcp({ sourceManifest, outputRoot, ...(get('--source-root') ? { sourceRoot: get('--source-root')! } : {}), ...(get('--repair-input') ? { repairInput: get('--repair-input')! } : {}) });
}
