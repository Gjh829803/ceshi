import {AGENT_READING_GUIDE,WORLD_UI_AUTHORING,type AgentDocumentPath} from '../discovery/agent-docs.js';
import type {InspectionQuery} from '../browser/bridge.js';
import {captureUiPreview} from './ui-preview-capture.js';
import {checkViewport} from './viewport-check.js';
import type {ViewportSize} from '../browser/viewport-diagnostics.js';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type Server } from 'node:http';
import { readFile, writeFile, mkdir, copyFile, readdir, lstat, realpath, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import Ajv from 'ajv';
import { ThreeCompiler, REPOSITORY_ROOT, hashTree, verifyFiles, isWithin, assertNoSymlinks, type Candidate, type CompilerOptions } from '../compiler/compiler.js';
import { EPISODE_SCHEMA, THREE_CREATOR_VERSION, episodeStepBudget, type CreatorProfile, type Episode, errorMessage, sha256 } from '../contracts.js';
import { humanoid, RoadVehicleRouteController, roadVehicleBrakeInput, type WorldInput, type WorldCommand } from '@worldkit/three';
import { AUTHORING_TOPICS, type AuthoringTopic } from '../discovery/authoring-schema.js';
import { readRuntimeGuidance } from '../discovery/runtime-guidance.js';
import { CreatorDiscovery, type SchemaSection } from '../discovery/creator-discovery.js';
import { CreatorOperationQueue } from './operation-queue.js';
export type { Operation } from './operation-queue.js';
import { browserDiagnosticsScript, HostDiagnosticError, serializeDiagnostic, type HostDiagnosticContext, type SerializedDiagnostic } from './diagnostic-serialization.js';
import { WORLD_COMMAND_SCHEMA } from '../schema/command-schema.js';
import type { ExampleTopic } from '../discovery/example-files.js';
import {summarizeCharacterContinuity} from '../browser/character-continuity.js';
import {subjectAuthoringGuidance} from '../discovery/subject-guidance.js';
import {humanAuthoringGuidance} from '../discovery/character-guidance.js';
import {cameraAuthoringGuidance} from '../discovery/camera-guidance.js';
import {buildWaterFeedback,summarizeWaterFeedback} from './water-feedback.js';
import {hasRequiredCaptureViews,selectTriviewTargets} from './capture-plan.js';
import {recordedVideoEncodingArgs} from './video.js';
import {measureEpisodeTargets} from './target-feedback.js';
import {summarizePlaytestActions, summarizeRoadRouteResults, summarizePlaytestTrace, validatePlaytestTraceQuery, type PlaytestTraceQuery} from './playtest-summary.js';

const checkEpisode = new Ajv({ allErrors: true, strict: false, strictNumbers: true }).compile(EPISODE_SCHEMA);
const checkCommand = new Ajv({ allErrors: true, strict: false, strictNumbers: true }).compile(WORLD_COMMAND_SCHEMA);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const json = async (file: string, value: unknown) => { await mkdir(path.dirname(file), { recursive: true }); const temporary = `${file}.${randomUUID()}.tmp`; await writeFile(temporary, JSON.stringify(value, null, 2)); await rename(temporary, file); };
type Session = { candidate: Candidate; browser: Browser; context: BrowserContext; page: Page; server: Server; errors: string[]; networkErrors: string[]; collectionError?: SerializedDiagnostic; close: () => Promise<void> };
function uiFeedback(candidate:Pick<Candidate,'profile'|'project'>){
  if(candidate.profile!=='three-sdk')return {status:'not-applicable'};
  return candidate.project.ui
    ? {status:'compiled',declaration:candidate.project.ui,note:'UI bundle included; inspect includeUi:true previews and actual UI behavior separately.'}
    : {status:'not-configured',warning:'project.ui is absent: no stream UI bundle is delivered. Handwritten DOM HUD is not serialized.',next:WORLD_UI_AUTHORING};
}
type Evidence = { root: string; files: Record<string, string>; report: any };
export async function withStageDeadline<T>(work: () => Promise<T>, milliseconds: number, errorCode: string, onTimeout: () => Promise<void>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(work), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new Error(errorCode)); void onTimeout().catch(() => {}); }, milliseconds);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
export function resolvePlaytestBudget(plannedSeconds: number, durationSeconds: number | undefined, stepCount: number) {
  const requestedSeconds = durationSeconds ?? plannedSeconds;
  if (!Number.isFinite(plannedSeconds) || plannedSeconds <= 0 || !Number.isFinite(requestedSeconds) || requestedSeconds <= 0 || requestedSeconds > 600 || !Number.isInteger(stepCount) || stepCount < 1) throw new Error('THREE_PLAYTEST_DURATION_INVALID');
  const mode = durationSeconds !== undefined && durationSeconds < plannedSeconds - 1e-7 ? 'debug' : 'full-episode';
  const overheadAllowanceSeconds = Math.min(120, Math.max(15, requestedSeconds * .2, stepCount * .04));
  return { mode, requestedSeconds, executionBudgetSeconds: requestedSeconds + overheadAllowanceSeconds, overheadAllowanceSeconds };
}
export function validateCaptureTiming(inputTiming: any, captureTiming: any, videoDurationSeconds: number): void {
  const values = [inputTiming?.startedAtMilliseconds, inputTiming?.endedAtMilliseconds, inputTiming?.durationSeconds, captureTiming?.initialFrameRequestedAtMilliseconds, captureTiming?.finalFrameRequestedAtMilliseconds, captureTiming?.framePeriodSeconds, videoDurationSeconds];
  if (inputTiming?.clock !== 'browser-performance' || captureTiming?.clock !== 'browser-performance' || !values.every(Number.isFinite) || inputTiming.durationSeconds <= 0 || captureTiming.framePeriodSeconds <= 0 || videoDurationSeconds <= 0 || inputTiming.endedAtMilliseconds < inputTiming.startedAtMilliseconds || captureTiming.initialFrameRequestedAtMilliseconds > inputTiming.startedAtMilliseconds || captureTiming.finalFrameRequestedAtMilliseconds < inputTiming.endedAtMilliseconds) throw new Error('THREE_VIDEO_BOUNDARY_INVALID');
  if (Math.abs(inputTiming.durationSeconds - (inputTiming.endedAtMilliseconds-inputTiming.startedAtMilliseconds)/1000) > .001) throw new Error('THREE_INPUT_CLOCK_INVALID');
  if (videoDurationSeconds < inputTiming.durationSeconds - Math.max(1, 2*captureTiming.framePeriodSeconds)) throw new Error('THREE_VIDEO_DURATION_MISMATCH: real recording ended before the browser input episode');
}
const positiveFinite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
export function hasRecordedPlay(report: { actualWallSeconds?: number; inputWallSeconds?: number; activePlaySeconds?: number; videoMetadata?: { durationSeconds?: number } | null }): boolean {
  return [report.actualWallSeconds, report.inputWallSeconds, report.activePlaySeconds, report.videoMetadata?.durationSeconds].every(positiveFinite);
}
export function playtestSubmissionReadiness(report: any, current: { worldBuildHash: string; episodeHash: string }) {
  const issues: Array<{ code: string; field?: string; actual?: unknown; required?: unknown }> = [];
  if (!report) return { eligible: false, issues: [{ code: 'NO_PLAYTEST_IN_THIS_SERVICE_SESSION' }] };
  if (report.status !== 'passed') issues.push({ code: 'PLAYTEST_DID_NOT_PASS', actual: report.status ?? null, required: 'passed' });
  if (report.isCompleteEpisode !== true) issues.push({ code: 'INCOMPLETE_EPISODE', actual: report.isCompleteEpisode ?? null, required: true });
  if (report.capturedInput !== true) issues.push({ code: 'RECORDED_INPUT_MISSING', actual: report.capturedInput ?? null, required: true });
  for (const field of ['actualWallSeconds', 'inputWallSeconds', 'activePlaySeconds', 'videoDurationSeconds']) {
    const actual = field === 'videoDurationSeconds' ? report.videoMetadata?.durationSeconds : report[field];
    if (!positiveFinite(actual)) issues.push({ code: 'RECORDED_TIME_INVALID', field, actual: actual ?? null, required: 'finite-positive' });
  }
  if (report.worldBuildHash !== current.worldBuildHash) issues.push({ code: 'WORLD_SOURCE_CHANGED_AFTER_PLAYTEST', actual: report.worldBuildHash ?? null, required: current.worldBuildHash });
  if (report.episodeHash !== current.episodeHash) issues.push({ code: 'EPISODE_CHANGED_AFTER_PLAYTEST', actual: report.episodeHash ?? null, required: current.episodeHash });
  return { eligible: issues.length === 0, issues };
}
export function assertSdkPlaytestRunning(profile: CreatorProfile, state: { isRunning?: boolean | null; simulationTick?: number | null; errors?: unknown[] }): void {
  if (profile === 'three-sdk' && state.isRunning === false) throw new Error(`THREE_PLAYTEST_RUNTIME_STOPPED: ${JSON.stringify({ simulationTick: state.simulationTick ?? null, errors: state.errors ?? [] })}`);
}
export function assertSdkObservationVersion(profile: CreatorProfile, snapshotSchemaVersion: unknown): void {
  if (profile === 'three-sdk' && snapshotSchemaVersion !== 2) throw new Error('THREE_SDK_OBSERVATION_VERSION_MISMATCH: expected the actual SDK v2 snapshot from await world.start()');
}
async function copyClosed(from: string, to: string) { await mkdir(to, { recursive: true }); for (const name of await readdir(from)) { const source = path.join(from, name), target = path.join(to, name), stat = await lstat(source); if (stat.isSymbolicLink()) throw new Error('THREE_SYMLINK_REJECTED'); if (stat.isDirectory()) await copyClosed(source, target); else if (stat.isFile()) await copyFile(source, target); else throw new Error('THREE_NONREGULAR_FILE'); } }
async function command(binary: string, args: string[], cwd?: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { ...(cwd ? { cwd } : {}), ...(binary === 'tar' ? { env: { ...process.env, COPYFILE_DISABLE: '1' } } : {}), stdio: ['ignore', 'ignore', 'pipe'] }); let error = '';
    child.stderr.on('data', data => { error = (error + data).slice(-8000); }); child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error(`THREE_PROCESS_FAILED: ${binary} ${error}`)));
  });
}
export async function createClosedArchive(root: string, output: string): Promise<void> {
  await assertNoSymlinks(path.join(root, 'payload')); await command('tar', ['-czf', output, '--', 'payload'], root);
}
async function probeVideo(file: string): Promise<{ durationSeconds: number; frameCount: number; widthPixels: number; heightPixels: number }> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames:format=duration', '-of', 'json', file], { stdio: ['ignore', 'pipe', 'pipe'] }); let result = '', error = '';
    child.stdout.on('data', data => { result += data; }); child.stderr.on('data', data => { error = (error + data).slice(-2000); }); child.once('error', reject); child.once('close', code => code === 0 ? resolve(result) : reject(new Error(`THREE_VIDEO_PROBE_FAILED: ${error}`)));
  });
  const value = JSON.parse(output), stream = value.streams?.[0];
  const result = { durationSeconds: Number(value.format?.duration), frameCount: Number(stream?.nb_read_frames), widthPixels: Number(stream?.width), heightPixels: Number(stream?.height) };
  if (!Object.values(result).every(number => Number.isFinite(number) && number > 0)) throw new Error('THREE_VIDEO_METADATA_INVALID'); return result;
}
export class ThreeCreatorTools {
  readonly compiler: ThreeCompiler;
  private readonly discovery: CreatorDiscovery;
  readonly evidenceRoot: string;
  readonly workspace: string;
  private readonly operationQueue: CreatorOperationQueue;
  private session?: Session;
  private playtestEvidence?: Evidence;
  private readonly recordedPlaytests = new Map<string, Evidence>();
  private captureEvidence?: Evidence;
  constructor(workspace: string, readonly profile: CreatorProfile, policyOptions:CompilerOptions = {}) {
    this.compiler = new ThreeCompiler(workspace, profile, policyOptions); this.compiler.assetPolicy(); this.discovery = new CreatorDiscovery(this.compiler); this.workspace = this.compiler.workspace; this.evidenceRoot = path.join(this.compiler.outputRoot, 'evidence');
    this.operationQueue = new CreatorOperationQueue({
      persist: operation => json(path.join(this.evidenceRoot, 'operations', `${operation.id}.json`), operation),
      cancelActive: () => this.closeSession(),
    });
  }
  async environment() {
    const snapshot=this.compiler.assetPolicy();
    const guidance=await readRuntimeGuidance(this.compiler),runtimeGuidance=guidance.provenance;
    const cameraAuthoring=cameraAuthoringGuidance(this.profile,guidance.isWorkspace);
    return {readingGuide:AGENT_READING_GUIDE,runtimeGuidance, kind: 'experimental-three-creator-environment', schemaVersion: 1, version: THREE_CREATOR_VERSION, profile: this.profile,
      assetPolicy:{...snapshot.policy,sha256:this.compiler.assetPolicySha256,assetDetailsTool:'assets_search / assets_describe',scope:'catalog resources and external asset files; ordinary Three geometry remains allowed'},
      engine: 'three@0.185.1', sdk: this.profile === 'three-sdk' ? '@worldkit/three' : null, sdkVersion: this.profile === 'three-sdk' ? THREE_CREATOR_VERSION : null, browserObservationContract: this.profile === 'three-sdk' ? 'WorldObservation-v2' : 'WorldObservation-v1', schemaTopics: AUTHORING_TOPICS,
      authoring: 'Author index.html and local JS/TS. Read programming for project structure, execution ownership and validation.',
      subjectAuthoring:subjectAuthoringGuidance(this.profile),
      humanAuthoring: humanAuthoringGuidance(this.compiler.assetPolicy().policy,this.profile),
      ...(cameraAuthoring?{cameraAuthoring}:{}),
      ...(this.profile==='three-sdk'?{uiAuthoring:WORLD_UI_AUTHORING}:{}),
      runtimeSource: this.profile==='three-sdk'?{tool:'creator_materialize_runtime',directory:'sdk',edit:'Edit sdk/three-world/src or sdk/camera-collision/src, then world_validate. The compiler uses locked dependencies and records runtimeSourceHash; all SDK source ships with delivery.'}:null,
      authoringLayers:['reuse: select the subject entry point','scene conditions: character-actions capability cards','parameters: control/extensions','runtime source: creator_materialize_runtime'],
      project: 'project.json declares assetIds and the SDK world UI bundle. Read programming and uiAuthoring. Exact asset definitions are written to asset-definitions.json; episode.json does not affect worldBuildHash.',
      observation: 'SDK world.start() installs the observer after preparation. Raw authors implement the observation contract; request sections:[observation].',
      feedback: 'Tools return actual browser observations and real-input evidence. Read programming for selection, timing and failures.',
      delivery: 'Read quality for completion requirements and programming for current-session recording, views and world_submit.',
      discovery: 'Asset search returns ranked, paginated summaries; assets_describe supplies complete details. Schema defaults to guide; request sections for contracts as needed.',
      operations: 'Long operations are serialized. Follow next using the same operationId. Host status and World action outcome are separate; read programming for details.',
      limitations: ['Browser network is same-origin only; dependencies are fixed Three/addons and the selected SDK.', 'No Node APIs or execution of author build/config scripts.', 'The Host does not independently guarantee visual fidelity or task semantics; final reference/task review remains separate.'],
    };
  }
  schema(topic: AuthoringTopic = 'getting-started') { return this.discovery.schema(topic); }
  authoringSchema(topic?: AuthoringTopic, sections?: readonly SchemaSection[]) { return this.discovery.selectedSchema(topic, sections); }
  readAuthoringDocument(document:AgentDocumentPath) {return this.discovery.document(document);}
  bindingExamples(topic?:ExampleTopic,files?:readonly string[],variant?:import('../discovery/binding-examples').BindingVariant){return this.discovery.bindingExamples(topic,files,variant);}
  examples(topic: ExampleTopic = 'getting-started', files?: readonly string[], variant?:'car'|'motorcycle') { return this.discovery.examples(topic, files,variant); }
  assets(query = '', assetId?: string) { return this.discovery.assets(query, assetId); }
  searchAssets(query?: string, limit?: number, offset?: number) { return this.discovery.searchAssets(query, limit, offset); }
  describeAsset(assetId: string) { return this.discovery.describeAsset(assetId); }
  start(type: string, run: (id: string) => Promise<unknown>) { return this.operationQueue.start(type, run); }
  getOperation(id: string, waitSeconds = 0) { return this.operationQueue.get(id, waitSeconds); }
  cancel(id: string) { return this.operationQueue.cancel(id); }
  async readPlaytest(operationId: string, query: PlaytestTraceQuery = {}) {
    validatePlaytestTraceQuery(query);
    const operation = await this.getOperation(operationId);
    if (operation.type !== 'world.playtest') throw new Error('THREE_PLAYTEST_OPERATION_REQUIRED');
    if (operation.status === 'queued' || operation.status === 'running') return {status:'not-ready', operationId, operationStatus:operation.status};
    const evidence = this.recordedPlaytests.get(operationId);
    if (!evidence) return {status:'unavailable', operationId, reason:'NO_RECORDED_TRACE_IN_THIS_SERVICE_SESSION'};
    const {report} = evidence;
    const source = {creatorOperationId:operationId, operationCompletedAt:operation.updatedAt,
      sourceHash:report.sourceHash, worldBuildHash:report.worldBuildHash, runtimeHash:report.runtimeHash,
      runtimeSourceHash:report.runtimeSourceHash, episodeHash:report.episodeHash};
    const identity = {kind:'three-creator-playtest-summary', advisory:true, source, currentWorldComparison:'not-performed',
      recording:{status:report.status,executionMode:report.executionMode,isCompleteEpisode:report.isCompleteEpisode,creatorOperationStatus:operation.status,
        ...(report.roadRouteResults?{roadRoutes:summarizeRoadRouteResults(report.roadRouteResults)}:{})}};
    try {
      const file = path.join(evidence.root, 'trace.json'), stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024 * 1024 ||
          !isWithin(await realpath(this.workspace), await realpath(file))) throw new Error('TRACE_FILE_UNAVAILABLE');
      const bytes = await readFile(file);
      if (sha256(bytes) !== evidence.files['trace.json']) return {...identity,status:'unavailable',reason:'RECORDED_TRACE_CHANGED'};
      return {...identity, traceSha256:evidence.files['trace.json'], ...summarizePlaytestTrace(JSON.parse(bytes.toString()), query)};
    } catch { return {...identity,status:'unavailable',reason:'RECORDED_TRACE_UNREADABLE'}; }
  }
  private assertActive(id: string) { this.operationQueue.assertActive(id); }
  async close() { this.operationQueue.cancelAll(); await this.closeSession(); }
  private async closeSession() { const session = this.session; delete this.session; if (session) await session.close(); }
  private async open(candidate: Candidate, recordRoot?: string): Promise<Session> {
    if (this.session?.candidate.worldBuildHash === candidate.worldBuildHash && !recordRoot) return this.session;
    await this.closeSession(); await verifyFiles(candidate.root, candidate.files);
    const errors: string[] = [], networkErrors: string[] = [];
    const mountPath = `/playable/${candidate.worldBuildHash}/`;
    const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://localhost'); const decoded = decodeURIComponent(url.pathname);
        if (url.pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
        if (!decoded.startsWith(mountPath)) { response.writeHead(404).end(); return; }
        const relative = decoded.slice(mountPath.length) || 'index.html', filename = path.resolve(candidate.playableRoot, relative);
        if (!isWithin(candidate.playableRoot, filename) || !(await lstat(filename)).isFile() || (await lstat(filename)).isSymbolicLink() || !isWithin(candidate.playableRoot, await realpath(filename))) { response.writeHead(403).end(); return; }
        // The shared UI runtime compiles JSON schemas with Ajv in this local browser.
        const uiScriptPolicy=candidate.project.ui?" 'unsafe-eval'":'';
        response.setHeader('Content-Security-Policy', `default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${uiScriptPolicy}; connect-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'`);
        response.setHeader('Content-Type', mime[path.extname(filename)] ?? 'application/octet-stream'); response.end(await readFile(filename));
      } catch { response.writeHead(404).end(); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('THREE_HTTP_START_FAILED'); const origin = `http://127.0.0.1:${address.port}`;
    const browserEnv: Record<string, string> = {}; for (const key of ['PATH', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'DISPLAY', 'XDG_RUNTIME_DIR', 'LD_LIBRARY_PATH', 'FONTCONFIG_FILE', 'FONTCONFIG_PATH', 'LANG', 'LC_ALL', 'PLAYWRIGHT_BROWSERS_PATH']) if (process.env[key]) browserEnv[key] = process.env[key]!;
    const home = path.join(this.compiler.outputRoot, 'browser-home'); await mkdir(home, { recursive: true }); browserEnv.HOME = home;
    let browser: Browser | undefined, context: BrowserContext | undefined, page: Page | undefined;
    let hostPhase = 'browser.launch';
    const host = (): HostDiagnosticContext => ({phase:hostPhase,candidate:{id:candidate.id,sourceHash:candidate.sourceHash,runtimeHash:candidate.runtimeHash,runtimeSourceHash:candidate.runtimeSourceHash,worldBuildHash:candidate.worldBuildHash}});
    const fallbackErrors: SerializedDiagnostic[] = [];
    let collectionError: SerializedDiagnostic | undefined;
    let closing: Promise<void> | undefined;
    const close = () => closing ??= (async () => {
      await context?.close().catch(() => {}); await browser?.close().catch(() => {});
      await new Promise<void>(resolve => server.close(() => resolve()));
    })();
    try {
      const launchOptions = { headless: true, env: browserEnv, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'] };
      try { browser = await chromium.launch(launchOptions); } catch (bundledError) { try { browser = await chromium.launch({ ...launchOptions, channel: 'chrome' }); } catch (fallbackError) { throw new AggregateError([bundledError, fallbackError], 'THREE_BROWSER_UNAVAILABLE'); } }
      hostPhase = 'browser.context';
      context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, ...(recordRoot ? { recordVideo: { dir: recordRoot, size: { width: 960, height: 540 } } } : {}) });
      await context.route('**/*', async route => { const url = route.request().url(); if (url.startsWith(`${origin}/`) || /^(?:data|blob):/.test(url)) await route.continue(); else { networkErrors.push(url.replace(/\?.*/, '')); await route.abort('blockedbyclient'); } });
      hostPhase = 'browser.page';
      page = await context.newPage(); page.on('pageerror', error => { errors.push(error.message); if(fallbackErrors.length < 20) fallbackErrors.push(serializeDiagnostic(error)); });
      await page.addInitScript({content:browserDiagnosticsScript});
      page.on('console', message => { if (message.type() === 'error') errors.push(`console.error: ${message.text().slice(0, 4000)}`); });
      const session: Session = { candidate, browser, context, page, server, errors, networkErrors, close };
      this.session = session;
      hostPhase = 'browser.startup';
      await page.goto(`${origin}${mountPath}?ui=off`, { waitUntil: 'domcontentloaded', timeout: 60_000 }); const deadline = Date.now() + 60_000;
      for (;;) {
        let diagnostics: SerializedDiagnostic[] = [];
        try { diagnostics = await page.evaluate(() => (window as any).__THREE_CREATOR_DIAGNOSTICS__?.records ?? []); }
        catch (failure) { session.collectionError = collectionError = serializeDiagnostic(failure); }
        const firstDiagnostic = diagnostics[0];
        if (firstDiagnostic) throw new HostDiagnosticError(firstDiagnostic,host());
        if (errors.length) throw new Error(`THREE_BROWSER_STARTUP: ${errors.join('\n')}`);
        const state = await page.evaluate(() => ({ ready: Boolean((window as any).__THREE_CREATOR_HOST__?.ready()), exposed: Boolean((window as any).__WORLDKIT_EVAL__?.ready) }));
        if (state.ready) break;
        if (state.exposed) await this.bridge(session, 'inspect'); // Report the exact missing/invalid observer field immediately.
        if (Date.now() >= deadline) throw new Error('THREE_OBSERVER_TIMEOUT: initialize and expose WorldObservation; browser errors are listed below');
        await sleep(50);
      }
      assertSdkObservationVersion(this.profile, (await this.bridge(session, 'read')).snapshotSchemaVersion);
      return session;
    } catch (error) {
      let records: SerializedDiagnostic[] = [];
      if (page) try { records = await page.evaluate(() => (window as any).__THREE_CREATOR_DIAGNOSTICS__?.records ?? []); }
      catch (failure) { collectionError = serializeDiagnostic(failure); }
      await this.closeSession();
      await close();
      const original = error instanceof HostDiagnosticError ? error.diagnostic : serializeDiagnostic(error);
      const primary = original.message.startsWith('THREE_BROWSER_STARTUP:') ? records[0] ?? original : original;
      const nested = error instanceof HostDiagnosticError ? error : undefined;
      throw new HostDiagnosticError(primary, nested?.host ?? host(),
        records.length ? records : fallbackErrors.length ? fallbackErrors : nested?.browserErrors,
        collectionError ?? nested?.collectionError);
    }
  }
  private async bridge(session: Session, method: string, args: unknown[] = []): Promise<any> {
    const candidate = session.candidate;
    const host: HostDiagnosticContext = {phase:'browser.bridge',method,candidate:{id:candidate.id,sourceHash:candidate.sourceHash,runtimeHash:candidate.runtimeHash,runtimeSourceHash:candidate.runtimeSourceHash,worldBuildHash:candidate.worldBuildHash}};
    let response: any;
    try {
      response = await session.page.evaluate(async ({method,args}) => {
        try { return {ok:true,result:await (window as any).__THREE_CREATOR_HOST__[method](...args)}; }
        catch (error) {
          try {return {ok:false,error:(window as any).__THREE_CREATOR_DIAGNOSTICS__.serialize(error)};}
          catch {
            let message='Browser operation failed; detailed diagnostic unavailable';
            try {const value=typeof error==='string'?error:Object.getOwnPropertyDescriptor(error,'message')?.value;if(typeof value==='string')message=value.slice(0,4000);}catch{}
            return {ok:false,error:{message},collectionError:{message:'Browser diagnostic serialization unavailable'}};
          }
        }
      }, {method,args});
    } catch (error) { throw new HostDiagnosticError(serializeDiagnostic(error),{...host,phase:'browser.transport'}); }
    if (!response.ok) throw new HostDiagnosticError(response.error,host,undefined,response.collectionError);
    return response.result;
  }
  async materializeRuntime() { return this.compiler.materializeRuntime(); }
  async validate() { const candidate = await this.compiler.prepare(); return { status: 'compiled', candidateId: candidate.id, profile: this.profile, sourceHash: candidate.sourceHash, worldBuildHash: candidate.worldBuildHash, runtimeHash: candidate.runtimeHash, runtimeSourceHash:candidate.runtimeSourceHash, candidateCacheHit: candidate.candidateCacheHit, runtimeCacheHit: candidate.runtimeCacheHit, runtimeValidation: 'not-run', ui:uiFeedback(candidate), playableRoot: candidate.playableRoot }; }
  async inspect(query?: InspectionQuery) {
    const candidate = await this.compiler.prepare(), session = await this.open(candidate);
    const observation = await this.bridge(session, 'inspect', [query ?? null]);
    let image:{path:string;sha256:string;byteLength:number}|undefined;
    const highlight=observation.surfaceOverlapHighlight;
    if(highlight?.imageDataUrl){
      const data=highlight.imageDataUrl;delete highlight.imageDataUrl;
      try{
        const bytes=Buffer.from(data.replace(/^data:image\/png;base64,/,''),'base64');
        const root=path.join(this.evidenceRoot,candidate.worldBuildHash,`surface-overlap-${randomUUID()}`);
        await mkdir(root,{recursive:true});const file=path.join(root,'highlight.png');await writeFile(file,bytes);
        image={path:file,sha256:sha256(bytes),byteLength:bytes.length};
        await json(path.join(root,'inspection.json'),{sourceHash:candidate.sourceHash,worldBuildHash:candidate.worldBuildHash,
          runtimeHash:candidate.runtimeHash,runtimeSourceHash:candidate.runtimeSourceHash,sample:observation.sample,
          surfaceOverlaps:observation.surfaceOverlaps,highlight,image});
      }catch{image=undefined;observation.surfaceOverlapHighlight={status:'unavailable',diagnostic:true,reason:'evidence-write-failed',findingId:highlight.findingId};}
    }
    return {
      sourceHash: candidate.sourceHash, worldBuildHash: candidate.worldBuildHash,
      runtimeHash: candidate.runtimeHash, runtimeSourceHash: candidate.runtimeSourceHash, profile: this.profile,
      observation,
      ...(image?{image}:{}),
      feedback: {
        characterContinuity: observation.characterContinuity,
        viewport: observation.viewport,
        water: 'snapshot' in observation ? buildWaterFeedback(observation.snapshot?.humanoid?.water) : undefined,
      },
      pageErrors: [...session.errors], blockedNetworkRequests: [...session.networkErrors],
    };
  }
  async checkViewport(target: ViewportSize) {
    if (![target.width, target.height].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 4096)) throw new Error('THREE_VIEWPORT_CHECK_SIZE_INVALID');
    const candidate = await this.compiler.prepare(), session = await this.open(candidate);
    const feedback = await checkViewport(session.page, target, () => this.bridge(session, 'viewport'));
    return {sourceHash: candidate.sourceHash, worldBuildHash: candidate.worldBuildHash,
      runtimeHash: candidate.runtimeHash, runtimeSourceHash: candidate.runtimeSourceHash, profile: this.profile,
      feedback, pageErrors: [...session.errors], blockedNetworkRequests: [...session.networkErrors]};
  }
  async executeCommand(command: WorldCommand, creatorOperationId: string = randomUUID()) {
    if (!checkCommand(command)) throw new Error(`THREE_WORLD_COMMAND_INVALID: ${JSON.stringify(checkCommand.errors)}`);
    if (this.profile !== 'three-sdk') throw new Error('THREE_WORLD_COMMANDS_UNSUPPORTED: raw profile has no SDK command capability');
    const candidate = await this.compiler.prepare(), session = await this.open(candidate);
    const commandId = `creator-tool:${creatorOperationId}`;
    const result = await this.bridge(session, 'executeCommand', [command, commandId]);
    const record = { sourceHash: candidate.sourceHash, worldBuildHash: candidate.worldBuildHash, creatorOperationId, command, contextPolicy: 'host-command-id-only', ...result };
    await json(path.join(this.evidenceRoot, candidate.worldBuildHash, 'commands', `${randomUUID()}.json`), record);
    return record;
  }
  async worldOperation(worldOperationId: string, waitSeconds = 0) {
    if (this.profile !== 'three-sdk') throw new Error('THREE_WORLD_OPERATIONS_UNSUPPORTED: raw profile has no SDK operations');
    if (!Number.isFinite(waitSeconds) || waitSeconds < 0 || waitSeconds > 25) throw new Error('THREE_WAIT_INVALID');
    const candidate = await this.compiler.prepare(), session = await this.open(candidate), deadline = Date.now() + waitSeconds * 1000;
    let worldOperation = await this.bridge(session, 'worldOperation', [worldOperationId]);
    while (['queued', 'running'].includes(worldOperation.status) && Date.now() < deadline) {
      await sleep(Math.min(100, deadline-Date.now())); worldOperation = await this.bridge(session, 'worldOperation', [worldOperationId]);
    }
    return { sourceHash: candidate.sourceHash, worldBuildHash: candidate.worldBuildHash, worldOperation };
  }
  private async capture(session: Session, root: string, view: string, entityIds: string[] = [], frontYawRadians?: number, includeUi=false) {
    let result:any,bytes:Buffer;
    if(includeUi&&session.candidate.project.ui){
      ({result,bytes}=await withStageDeadline(()=>captureUiPreview(session.page,view as 'opening'|'current'),15000,'UI_PREVIEW_CAPTURE_TIMEOUT',()=>this.closeSession()));
    }else{
      result = await this.bridge(session, 'capture', [view, entityIds, frontYawRadians]); bytes = Buffer.from(result.image.replace(/^data:image\/png;base64,/, ''), 'base64'); delete result.image;
      result.ui={included:false,reason:includeUi?'not-defined':'disabled',...(includeUi&&this.profile==='three-sdk'?{next:WORLD_UI_AUTHORING}:{})};
    }
    const name = `${view}-${sha256(JSON.stringify(entityIds)).slice(0, 10)}.png`, file = path.join(root, name); await mkdir(root, { recursive: true }); await writeFile(file, bytes);
    return { ...result, image: { path: file, sha256: sha256(bytes), byteLength: bytes.length }, sourceHash: session.candidate.sourceHash, worldBuildHash: session.candidate.worldBuildHash, runtimeHash: session.candidate.runtimeHash, runtimeSourceHash: session.candidate.runtimeSourceHash, profile: this.profile };
  }
  async preview(view = 'opening', entityIds: string[] = [], frontYawRadians?: number, includeUi = view === 'opening' || view === 'current') {
    if (!['opening', 'current', 'top-down', 'entity-triview'].includes(view) || (frontYawRadians !== undefined && !Number.isFinite(frontYawRadians))) throw new Error('THREE_PREVIEW_INPUT_INVALID');
    if(typeof includeUi!=='boolean'||(includeUi&&view!=='opening'&&view!=='current'))throw new Error('THREE_PREVIEW_UI_VIEW_INVALID: includeUi:true requires opening or current');
    const candidate = await this.compiler.prepare(), session = await this.open(candidate);
    if (view !== 'current') await this.bridge(session, 'stop');
    if (view === 'opening') await this.bridge(session, 'reset');
    return this.capture(session, path.join(this.evidenceRoot, candidate.worldBuildHash, `preview-${randomUUID()}`), view, entityIds, frontYawRadians, includeUi);
  }
  async triviews(includeAdditionalTargets=false) {
    const candidate = await this.compiler.prepare(), session = await this.open(candidate); await this.bridge(session, 'reset');
    const root = path.join(this.evidenceRoot, candidate.worldBuildHash, `captures-${randomUUID()}`);
    const plan=selectTriviewTargets(await this.bridge(session,'captureTargets'),includeAdditionalTargets); const images = [];
    images.push(await this.capture(session, root, 'opening'));
    images.push(await this.capture(session, root, 'top-down'));
    for (const target of plan.selectedTargets) images.push(await this.capture(session,root,'entity-triview',[target.id]));
    const report = { kind: 'three-creator-captures', schemaVersion: 1, selectionPolicy:plan.selectionPolicy, conditioningEntityIds:plan.conditioningEntityIds, omittedEntityIds:plan.omittedEntityIds, profile: this.profile, worldBuildHash: candidate.worldBuildHash, sourceHash: candidate.sourceHash, images, pageErrors: [...session.errors] };
    await json(path.join(root, 'captures.json'), report); this.captureEvidence = { root, files: await hashTree(root), report }; return { ...report, image: images[0]!.image };
  }
  private async episode(): Promise<{ episode: Episode; hash: string; bytes: Buffer }> {
    const file = path.join(this.workspace, 'episode.json'); if ((await lstat(file)).isSymbolicLink() || !isWithin(await realpath(this.workspace), await realpath(file))) throw new Error('THREE_EPISODE_PATH_INVALID');
    const bytes = await readFile(file), episode = JSON.parse(bytes.toString());
    if (!checkEpisode(episode)) throw new Error(`THREE_EPISODE_INVALID: ${JSON.stringify(checkEpisode.errors)}`);
    const duration = (episode as Episode).steps.reduce((sum, step) => sum + episodeStepBudget(step), 0);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 600) throw new Error('THREE_EPISODE_DURATION_INVALID: total duration must be within (0,600] seconds');
    return { episode: episode as Episode, hash: sha256(bytes), bytes };
  }
  async playtest(operationId: string, durationSeconds?: number, framesPerSecond = 3) {
    const candidate = await this.compiler.prepare(), input = await this.episode(), plannedSeconds = input.episode.steps.reduce((sum, step) => sum + episodeStepBudget(step), 0);
    const hasRoadRoutes=input.episode.steps.some(step=>step.driveTo);
    const minimumInputSeconds=hasRoadRoutes&&durationSeconds===undefined?input.episode.steps.reduce((sum,step)=>sum+(step.durationSeconds??0),0):durationSeconds??plannedSeconds;
    const budget = resolvePlaytestBudget(plannedSeconds, durationSeconds, input.episode.steps.length);
    const requestedSeconds = budget.requestedSeconds;
    const limitSeconds = budget.mode === 'full-episode' ? Infinity : requestedSeconds;
    if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0 || requestedSeconds > 600 || ![1, 2, 3, 6].includes(framesPerSecond)) throw new Error('THREE_PLAYTEST_DURATION_INVALID');
    const root = path.join(this.evidenceRoot, candidate.worldBuildHash, `playtest-${operationId}`); await mkdir(root, { recursive: true });
    const session = await this.open(candidate);
    const hostEvents: any[] = [], keyframes: any[] = [], held = new Set<string>(), worldOperations = new Map<string, any>(); let trace: any; let recorded: any; let finalizationTimedOut = false; let failure: string | null = null; let completedSteps = 0; let expectedRunning = true; let activePlaySeconds = 0;
    await this.bridge(session, 'reset'); await withStageDeadline(() => this.bridge(session, 'beginRecording', [framesPerSecond]), 15_000, 'THREE_RECORDING_START_TIMEOUT', () => this.closeSession()); await this.bridge(session, 'start'); await this.bridge(session, 'beginTrace'); const started = performance.now();
    let budgetExceeded = false;
    const budgetTimer = setTimeout(() => { budgetExceeded = true; if (this.session === session) void this.closeSession(); }, budget.executionBudgetSeconds * 1000);
    let accountedAt = performance.now();
    const accountPlay = () => { const now = performance.now(); if (expectedRunning) activePlaySeconds += (now-accountedAt)/1000; accountedAt=now; };
    const elapsed = () => (performance.now() - started) / 1000; let nextKeyframe = 0;
    let nextOperationPoll = 0;
    const observeWorldOperations = async () => {
      for (const [id, previous] of worldOperations) {
        if (previous && !['queued', 'running'].includes(previous.status)) continue;
        const current = await this.bridge(session, 'worldOperation', [id]);
        if (JSON.stringify(previous) !== JSON.stringify(current)) hostEvents.push({ type: 'world-operation', worldOperationId: id, worldOperation: current, wallSeconds: elapsed() });
        worldOperations.set(id, current);
      }
    };
    const send = async (type: 'keydown' | 'keyup', key: string, cleanup = false) => { const before = await this.bridge(session, 'read'); if (type === 'keydown') { await session.page.keyboard.down(key); held.add(key); } else { await session.page.keyboard.up(key); held.delete(key); } hostEvents.push({ type, key, cleanup, wallSeconds: elapsed(), before }); };
    const roadRouteResults:any[]=[];
    let roadActorId:string|undefined,roadInputSequence=0;
    let roadSubject:{actorGeneration:number;vehicleId:string;lifecycleGeneration:number}|undefined;
    const sendRoadInput=async(value:WorldInput['humanoid']|null,cleanup=false)=>{
      if(!roadActorId)return;
      const command={type:'humanoid.set-input' as const,actorId:roadActorId,input:value??null};
      const result=await this.bridge(session,'executeCommand',[command,`creator-road-route:${operationId}:${roadInputSequence++}`,roadSubject]);
      hostEvents.push({type:'world-command',source:'road-route',command,cleanup,wallSeconds:elapsed(),...result});
      if(result.worldCommandReceipt.status!=='applied')throw new Error(`THREE_ROAD_ROUTE_INPUT_REJECTED: ${JSON.stringify(result.worldCommandReceipt)}`);
    };
    const captureKeyframe=async()=>{
      if(elapsed()<nextKeyframe)return;
      const file=path.join(root,`keyframe-${keyframes.length.toString().padStart(3,'0')}.png`);
      const frame=await this.bridge(session,'capture',['opening']),bytes=Buffer.from(frame.image.replace(/^data:image\/png;base64,/,''),'base64');
      await writeFile(file,bytes);keyframes.push({path:file,sha256:sha256(bytes),wallSeconds:elapsed()});nextKeyframe+=15;
    };
    try {
      for (const [index, step] of input.episode.steps.entries()) {
        if (elapsed() >= limitSeconds) break; this.assertActive(operationId);
        if(step.driveTo){
          if(this.profile!=='three-sdk')throw new Error('THREE_ROAD_ROUTE_SDK_REQUIRED');
          for(const key of [...held])await send('keyup',key,true);
          const route=step.driveTo,controller=new RoadVehicleRouteController(route),started=elapsed(),samples:any[]=[];
          const result:any={stepIndex:index,vehicleId:route.vehicleId,targetPositionWorldMetersXYZ:route.positionWorldMetersXYZ,stopAtTarget:route.stopAtTarget!==false,status:'running',startedAtSeconds:started,samples,appliedInputCount:0};
          roadRouteResults.push(result);
          try{
            let previousInput='',subjectIdentity:string|undefined;
            while(true){
              this.assertActive(operationId);
              if(elapsed()>=limitSeconds)throw new Error('THREE_ROAD_ROUTE_TRUNCATED');
              if(elapsed()-started>=step.timeoutSeconds!)throw new Error('THREE_ROAD_ROUTE_TIMEOUT');
              const state=await this.bridge(session,'roadVehicleState',[route.vehicleId]);
              assertSdkPlaytestRunning(this.profile,state);
              if(state.errors?.length)throw new Error(`THREE_PLAYTEST_RUNTIME_ERRORS: ${JSON.stringify(state.errors)}`);
              if(roadActorId!==undefined&&roadActorId!==state.actorId)throw new Error('THREE_ROAD_ROUTE_ACTOR_CHANGED');
              const identity=JSON.stringify([state.actorId,state.actorGeneration,state.vehicleGeneration,state.lifecycleGeneration]);
              if(subjectIdentity!==undefined&&identity!==subjectIdentity)throw new Error('THREE_ROAD_ROUTE_SUBJECT_CHANGED');
              subjectIdentity=identity;roadActorId=state.actorId;
              result.subjectIdentity??={actorId:state.actorId,actorGeneration:state.actorGeneration,vehicleId:route.vehicleId,vehicleGeneration:state.vehicleGeneration,lifecycleGeneration:state.lifecycleGeneration};
              roadSubject={actorGeneration:state.actorGeneration,vehicleId:route.vehicleId,lifecycleGeneration:state.lifecycleGeneration};
              result.startSimulationTick??=state.simulationTick;result.endSimulationTick=state.simulationTick;
              const decision=controller.step(state.motion,state.simulationSeconds);
              if(samples.at(-1)?.simulationTick!==state.simulationTick||samples.at(-1)?.status!==decision.status)samples.push({wallSeconds:elapsed(),simulationTick:state.simulationTick,simulationSeconds:state.simulationSeconds,positionWorldMetersXYZ:state.motion.positionWorldMetersXYZ,collisionEntityIds:state.collisionEntityIds,...decision});
              if(decision.status==='failed')throw new Error(decision.errorCode);
              const serialized=JSON.stringify(decision.input);
              if(serialized!==previousInput){await sendRoadInput(decision.input.humanoid);result.appliedInputCount++;previousInput=serialized;}
              if(decision.status==='arrived'){result.status='arrived';break;}
              this.operationQueue.updateProgress(operationId, {phase:'road-route',stepIndex:index,elapsedSeconds:elapsed(),requestedSeconds,currentState:state,roadRoute:decision});
              if(session.errors.length)throw new Error(`THREE_PLAYTEST_PAGE_ERROR: ${session.errors.join('\n')}`);
              if(elapsed()>=nextOperationPoll){await observeWorldOperations();nextOperationPoll=elapsed()+1;}
              await captureKeyframe();
              await sleep(50);
            }
          }catch(error){result.status='failed';result.error=errorMessage(error);throw error;}
          finally{result.endedAtSeconds=elapsed();}
          await sendRoadInput(null,true);roadActorId=undefined;roadSubject=undefined;
          completedSteps++;continue;
        }
        for (const key of step.keysUp ?? []) await send('keyup', key);
        if (step.lifecycle) {
          accountPlay();
          for (const key of [...held]) await send('keyup', key, true);
          const before = await this.bridge(session, 'read');
          if (step.lifecycle === 'pause') { await this.bridge(session, 'stop'); expectedRunning = false; }
          else if (step.lifecycle === 'reset') { await this.bridge(session, 'reset'); expectedRunning = false; }
          else { await this.bridge(session, 'start'); expectedRunning = true; }
          accountedAt = performance.now();
          hostEvents.push({ type: 'lifecycle', action: step.lifecycle, wallSeconds: elapsed(), before, after: await this.bridge(session, 'read') });
        }
        for (const [commandIndex, command] of (step.commands ?? []).entries()) {
          if (this.profile !== 'three-sdk') throw new Error('THREE_WORLD_COMMANDS_UNSUPPORTED');
          const commandId = `creator-episode:${operationId}:step:${index}:command:${commandIndex}`;
          const result = await this.bridge(session, 'executeCommand', [command, commandId]);
          hostEvents.push({ type: 'world-command', command, wallSeconds: elapsed(), ...result });
          if (result.worldCommandReceipt.status === 'accepted') worldOperations.set(result.worldCommandReceipt.operationId, null);
        }
        for (const key of step.keysDown ?? []) await send('keydown', key);
        if (step.pointerDrag) { const drag = step.pointerDrag; await session.page.mouse.move(480, 270); await session.page.mouse.down({ button: drag.button ?? 'left' }); await session.page.mouse.move(480 + drag.deltaXPixels, 270 + drag.deltaYPixels, { steps: 8 }); await session.page.mouse.up({ button: drag.button ?? 'left' }); hostEvents.push({ type: 'pointer-drag', wallSeconds: elapsed(), ...drag }); }
        const until = Math.min(limitSeconds, elapsed() + step.durationSeconds!);
        while (elapsed() < until) {
          this.assertActive(operationId);
          const currentState = await this.bridge(session, 'read'); if (expectedRunning) assertSdkPlaytestRunning(this.profile, currentState);
          if (currentState.errors?.length) throw new Error(`THREE_PLAYTEST_RUNTIME_ERRORS: ${JSON.stringify(currentState.errors)}`);
          if (elapsed() >= nextOperationPoll) { await observeWorldOperations(); nextOperationPoll = elapsed() + 1; }
          await captureKeyframe();
          this.operationQueue.updateProgress(operationId, { phase: 'real-browser-keyboard', stepIndex: index, elapsedSeconds: elapsed(), requestedSeconds, currentState });
          if (session.errors.length) throw new Error(`THREE_PLAYTEST_PAGE_ERROR: ${session.errors.join('\n')}`);
          await sleep(Math.max(0, Math.min(200, (until - elapsed()) * 1000)));
        }
        completedSteps++;
      }
      while ((!hasRoadRoutes||durationSeconds!==undefined)&&elapsed() < requestedSeconds) { this.assertActive(operationId); if (expectedRunning) assertSdkPlaytestRunning(this.profile, await this.bridge(session, 'read')); await observeWorldOperations(); await sleep(Math.min(200, (requestedSeconds - elapsed()) * 1000)); }
      await observeWorldOperations();
    } catch (error) { failure = budgetExceeded ? 'THREE_EPISODE_BUDGET_EXCEEDED' : errorMessage(error); }
    finally {
      clearTimeout(budgetTimer);
      if(roadActorId)await sendRoadInput(roadVehicleBrakeInput().humanoid,true).catch(error=>{failure??=errorMessage(error);});
      for (const key of [...held]) await send('keyup', key, true).catch(error => { failure ??= errorMessage(error); });
      accountPlay();
      const finished = await withStageDeadline(() => this.bridge(session, 'finishRun'), 15_000, 'THREE_RECORDING_FINALIZATION_TIMEOUT', async () => { finalizationTimedOut = true; await this.closeSession(); }).catch(error => { failure ??= errorMessage(error); return { trace: { samples: [], keyboardEvents: [], browserFrameDeltasSeconds: [] }, recording: null }; });
      trace = finished.trace; recorded = finished.recording;
      if(roadActorId)await sendRoadInput(null,true).catch(error=>{failure??=errorMessage(error);});
      if (!recorded && !finalizationTimedOut) await this.closeSession();
    }
    const actualWallSeconds = elapsed(), inputWallSeconds = trace.timing?.durationSeconds ?? null, captureTiming = recorded?.timing ?? null, lastObservation = finalizationTimedOut || !recorded ? null : await this.bridge(session, 'inspect').catch(() => null);
    let videoFile: string | null = null; let videoFailure: string | null = null;
    let videoMetadata: Awaited<ReturnType<typeof probeVideo>> | null = null;
    try {
      if (!recorded?.data) throw new Error('THREE_VIDEO_MISSING');
      const raw = path.join(root, 'playtest.webm');
      await writeFile(raw, Buffer.from(recorded.data.replace(/^data:video\/webm;base64,/, ''), 'base64'));
      videoFile = path.join(root, 'playtest.mp4'); await command('ffmpeg', await recordedVideoEncodingArgs(raw, videoFile));
      videoMetadata = await probeVideo(videoFile);
      validateCaptureTiming(trace.timing, captureTiming, videoMetadata.durationSeconds);
    } catch (error) { videoFile = null; videoFailure = errorMessage(error); failure ??= videoFailure; }
    const samples = trace.samples as any[], errors = samples.flatMap(sample => sample.errors ?? []); const validSamples = samples.filter(sample => Array.isArray(sample.positionMetersXYZ) && sample.positionMetersXYZ.length === 3 && sample.positionMetersXYZ.every((value: unknown) => typeof value === 'number' && Number.isFinite(value)));
    if (samples.length !== validSamples.length) failure ??= 'THREE_PLAYTEST_OBSERVATION_INVALID: missing or nonfinite actual player position';
    let travelledMeters = 0; for (let i = 1; i < validSamples.length; i++) { const a = validSamples[i - 1]!.positionMetersXYZ, b = validSamples[i]!.positionMetersXYZ; travelledMeters += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
    const targetResults = measureEpisodeTargets(input.episode.targets, samples);
    const capturedKeyboardInput = trace.keyboardEvents.some((event: any) => event.type === 'keydown' && event.isTrusted) && trace.keyboardEvents.some((event: any) => event.type === 'keyup' && event.isTrusted);
    const capturedRoadInput=roadRouteResults.some(result=>result.appliedInputCount>0&&result.endSimulationTick>result.startSimulationTick);
    const capturedInput=capturedKeyboardInput||capturedRoadInput;
    const isCompleteEpisode = completedSteps === input.episode.steps.length && budget.mode === 'full-episode';
    if (budget.mode === 'full-episode' && !isCompleteEpisode) failure ??= 'THREE_EPISODE_INCOMPLETE';
    if (session.networkErrors.length) failure ??= 'THREE_BLOCKED_NETWORK_REQUESTS: bundle local assets/dependencies for this same-origin world';
    const passed = !failure && session.errors.length === 0 && errors.length === 0 && capturedInput && validSamples.length > 0 && videoFile !== null && typeof inputWallSeconds === 'number' && inputWallSeconds >= minimumInputSeconds - 0.05;
    let roadRouteTrace: {file:string;sha256:string}|undefined;
    if(hasRoadRoutes){
      const file='road-route-trace.json';
      await json(path.join(root,file),{sourceHash:candidate.sourceHash,runtimeHash:candidate.runtimeHash,worldBuildHash:candidate.worldBuildHash,episodeHash:input.hash,steps:roadRouteResults});
      roadRouteTrace={file,sha256:sha256(await readFile(path.join(root,file)))};
    }
    const compactRoadResults=roadRouteResults.map(({samples,...result})=>({...result,sampleCount:samples.length,initialSample:samples[0]??null,finalSample:samples.at(-1)??null}));
    const feedback={viewport:lastObservation?.viewport,actions:summarizePlaytestActions(hostEvents,[...worldOperations.values()]),...(hasRoadRoutes?{roadRoutes:summarizeRoadRouteResults(roadRouteResults)}:{}),characterContinuity:summarizeCharacterContinuity(trace.samples??[]),water:buildWaterFeedback(lastObservation?.snapshot?.humanoid?.water),waterTimeline:summarizeWaterFeedback(trace.samples??[])};
    const recording = { feedback, ...(hasRoadRoutes?{roadRouteResults:compactRoadResults,roadRouteTrace,timingMode:'bounded-steps',minimumInputSeconds,capturedKeyboardInput,capturedRoadInput}:{}), kind: 'three-creator-browser-playtest', schemaVersion: 1, status: passed ? 'passed' : 'failed', profile: this.profile, sourceHash: candidate.sourceHash, worldBuildHash: candidate.worldBuildHash, runtimeHash: candidate.runtimeHash, runtimeSourceHash:candidate.runtimeSourceHash, episodeHash: input.hash, requestedSeconds, plannedSeconds, executionMode: budget.mode, executionBudgetSeconds: budget.executionBudgetSeconds, actualWallSeconds, inputWallSeconds, captureTiming, activePlaySeconds, completedSteps, isCompleteEpisode, capturedInput, travelledMeters, targetResults, semanticStatus: 'unreviewed', failure, pageErrors: session.errors, runtimeErrors: errors, blockedNetworkRequests: session.networkErrors, videoPath: videoFile, videoMetadata, videoFailure, keyframes, hostKeyboardEvents: hostEvents.filter(event => event.type === 'keydown' || event.type === 'keyup'), hostActionEvents: hostEvents, worldOperations: [...worldOperations.values()], browserKeyboardEvents: trace.keyboardEvents, lastObservation, frameTiming: { frameCount: trace.browserFrameDeltasSeconds.length, maximumFrameDeltaSeconds: Math.max(0, ...trace.browserFrameDeltasSeconds) } };
    const identity = {worldBuildHash: candidate.worldBuildHash, episodeHash: input.hash};
    const report = {...recording, readTrace:{tool:'world_read_playtest',arguments:{operationId}}, recordingReadiness: {scope: 'recording-only' as const,
      checkedAt: new Date().toISOString(), creatorOperationId: operationId, ...identity,
      ...playtestSubmissionReadiness(recording, identity)}};
    await json(path.join(root, 'trace.json'), trace); await json(path.join(root, 'playtest.json'), report); await writeFile(path.join(root, 'episode.json'), input.bytes);
    this.playtestEvidence = { root, files: await hashTree(root), report };
    this.recordedPlaytests.set(operationId, this.playtestEvidence);
    return report;
  }
  async submit() {
    if(this.compiler.debugTools)throw new Error('THREE_DEBUG_BUILD_NOT_DELIVERABLE: rebuild without --debug-tools and record the production artifact before submitting.');
    const candidate = await this.compiler.prepare(), episode = await this.episode(), played = this.playtestEvidence;
    const readiness = playtestSubmissionReadiness(played?.report, { worldBuildHash: candidate.worldBuildHash, episodeHash: episode.hash });
    if (!played || !readiness.eligible) throw new Error(`THREE_SUBMIT_PLAYTEST_REQUIRED: ${JSON.stringify(readiness)}. Keep this MCP session; resolve the listed source/episode or recording issue before submitting again.`);
    await verifyFiles(candidate.root, candidate.files); await verifyFiles(played.root, played.files);
    if (this.captureEvidence?.report.worldBuildHash !== candidate.worldBuildHash || !hasRequiredCaptureViews(this.captureEvidence?.report)) await this.triviews();
    const captures = this.captureEvidence!; await verifyFiles(captures.root, captures.files);
    if (captures.report.pageErrors.length) throw new Error('THREE_SUBMIT_CAPTURE_ERRORS');
    await this.compiler.verifyCandidatePolicy(candidate);
    const root = path.join(this.compiler.outputRoot, 'delivery', randomUUID()), payload = path.join(root, 'payload'); await mkdir(payload, { recursive: true });
    await copyClosed(candidate.sourceRoot, path.join(payload, 'source')); await copyClosed(candidate.playableRoot, path.join(payload, 'playable')); await copyClosed(played.root, path.join(payload, 'playtest')); await copyClosed(captures.root, path.join(payload, 'captures')); await writeFile(path.join(payload, 'episode.json'), episode.bytes);
    for (const prefix of ['source', 'playable']) await verifyFiles(path.join(payload, prefix), Object.fromEntries(Object.entries(candidate.files).filter(([name]) => name.startsWith(`${prefix}/`)).map(([name, hash]) => [name.slice(prefix.length + 1), hash])));
    await verifyFiles(path.join(payload, 'playtest'), played.files); await verifyFiles(path.join(payload, 'captures'), captures.files);
    await this.compiler.verifyCandidatePolicy({...candidate,sourceRoot:path.join(payload,'source'),playableRoot:path.join(payload,'playable')});
    const manifest = { assetPolicySha256:candidate.assetPolicySha256, kind: 'three-creator-delivery', schemaVersion: 1, toolVersion: THREE_CREATOR_VERSION, engine: 'three@0.185.1', creatorRuntimeLockHash: process.env.WORLDKIT_CREATOR_RUNTIME_HASH ?? null, profile: this.profile, status: 'ready-for-independent-review', technicalStatus: 'passed', semanticStatus: 'unreviewed', sourceHash: candidate.sourceHash, worldBuildHash: candidate.worldBuildHash, runtimeHash: candidate.runtimeHash, runtimeSourceHash:candidate.runtimeSourceHash, episodeHash: episode.hash, sdkVersion: this.profile === 'three-sdk' ? THREE_CREATOR_VERSION : null, browserObservationContract: this.profile === 'three-sdk' ? 'WorldObservation-v2' : 'WorldObservation-v1', actualWallSeconds: played.report.actualWallSeconds, inputWallSeconds: played.report.inputWallSeconds, videoMetadata: played.report.videoMetadata, captureTiming: played.report.captureTiming, activePlaySeconds: played.report.activePlaySeconds, targetResults: played.report.targetResults, ui:uiFeedback(candidate), deliveredAt: new Date().toISOString(), files: await hashTree(payload) };
    await json(path.join(payload, 'delivery.json'), manifest); const hashes = await hashTree(payload); await json(path.join(payload, 'artifact-hashes.json'), { schemaVersion: 1, files: hashes });
    const temporary = path.join(root, 'creator-delivery.tar.gz'); await createClosedArchive(root, temporary);
    await verifyFiles(candidate.root, candidate.files); await verifyFiles(played.root, played.files); await verifyFiles(captures.root, captures.files);
    const archivePath = path.join(this.workspace, 'creator-delivery.tar.gz'), temporaryArchive = `${archivePath}.${randomUUID()}.tmp`; await copyFile(temporary, temporaryArchive); await rename(temporaryArchive, archivePath);
    const receipt = { ...manifest, archivePath, archiveSha256: sha256(await readFile(archivePath)), archiveByteLength: (await lstat(archivePath)).size, deliveryManifestSha256: sha256(await readFile(path.join(payload, 'delivery.json'))) };
    await json(path.join(this.workspace, 'creator-result.json'), receipt); return receipt;
  }
}
