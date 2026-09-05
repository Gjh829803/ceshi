import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type Server } from 'node:http';
import { readFile, writeFile, mkdir, copyFile, readdir, lstat, realpath, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import Ajv from 'ajv';
import { ThreeCompiler, REPOSITORY_ROOT, hashTree, verifyFiles, readCatalog, publicAsset, isWithin, assertNoSymlinks, type Candidate } from './compiler.js';
import { EPISODE_SCHEMA, PROJECT_SCHEMA, THREE_CREATOR_VERSION, type CreatorProfile, type Episode, errorMessage, sha256 } from './contracts.js';
import { RAW_EXAMPLE, SDK_EXAMPLE } from './examples.js';

const checkEpisode = new Ajv({ allErrors: true, strict: false, strictNumbers: true }).compile(EPISODE_SCHEMA);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const json = async (file: string, value: unknown) => { await mkdir(path.dirname(file), { recursive: true }); const temporary = `${file}.${randomUUID()}.tmp`; await writeFile(temporary, JSON.stringify(value, null, 2)); await rename(temporary, file); };
export type Operation = { id: string; type: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; createdAt: string; updatedAt: string; result?: any; error?: string; progress?: unknown };
type Session = { candidate: Candidate; browser: Browser; context: BrowserContext; page: Page; server: Server; errors: string[]; networkErrors: string[]; close: () => Promise<void> };
type Evidence = { root: string; files: Record<string, string>; report: any };
export function assertSdkPlaytestRunning(profile: CreatorProfile, state: { isRunning?: boolean | null; simulationTick?: number | null; errors?: unknown[] }): void {
  if (profile === 'three-sdk' && state.isRunning === false) throw new Error(`THREE_PLAYTEST_RUNTIME_STOPPED: ${JSON.stringify({ simulationTick: state.simulationTick ?? null, errors: state.errors ?? [] })}`);
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
  readonly evidenceRoot: string;
  readonly workspace: string;
  private operations = new Map<string, Operation>();
  private cancelled = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();
  private activeOperationId?: string;
  private session?: Session;
  private playtestEvidence?: Evidence;
  private captureEvidence?: Evidence;
  constructor(workspace: string, readonly profile: CreatorProfile) {
    this.compiler = new ThreeCompiler(workspace, profile); this.workspace = this.compiler.workspace; this.evidenceRoot = path.join(this.compiler.outputRoot, 'evidence');
  }
  async environment() {
    return { kind: 'experimental-three-creator-environment', schemaVersion: 1, version: THREE_CREATOR_VERSION, profile: this.profile,
      engine: 'three@0.185.1', sdk: this.profile === 'three-sdk' ? '@worldkit/three' : null,
      authoring: 'Ordinary index.html and main.ts/js. Native Three, browser APIs, local modules and Three addons are allowed. The Host compiles browser modules without executing author JavaScript/configuration in Node. One shared prebuilt Three; the SDK profile adds the fixed SDK runtime.',
      project: 'Optional project.json selects catalog assetIds. Exact definitions are written to asset-definitions.json. Episode steps live in episode.json and do not affect worldBuildHash.',
      observation: 'Expose window.__WORLDKIT_EVAL__: {ready,scene,camera,renderer,player,targets,startLive,stopLive,reset,snapshot?,inspect?}. SDK world.expose() installs this automatically. Raw Three provides this small observer itself. targets map IDs to complete THREE.Object3D groups.',
      feedback: 'world_validate compiles only; world_preview and world_inspect start an actual browser. world_playtest sends real Playwright keydown/keyup and pointer drags; captures actual wall time, player transforms, DOM keyboard events, optional SDK ticks/physics/actions and video. Raw worlds without snapshot report those fields as null.',
      delivery: 'Versioned three-creator-delivery, experimental. Requires current source and current episode, a completed real 180s+ episode with captured keydown and keyup and no browser/SDK errors, and real player/target front-right-back captures. Route success is a measurement, not semantic or visual acceptance.',
      operations: 'Long operations are serialized. Poll their operationId; never invent evidence or replace an unknown operation. Debug with a short playtest before the full episode.',
      limitations: ['Browser network is same-origin only; dependencies are fixed Three/addons and the selected SDK.', 'No Node APIs or execution of author build/config scripts.', 'The Host does not independently guarantee visual fidelity or task semantics; final reference/task review remains separate.'],
    };
  }
  async schema() {
    const contracts = await readFile(path.join(REPOSITORY_ROOT, 'packages/three-world/src/contracts.ts'), 'utf8');
    const declaration = /export interface WorldObservation \{[\s\S]*?\n\}/.exec(contracts)?.[0];
    if (!declaration) throw new Error('THREE_OBSERVATION_CONTRACT_MISSING');
    // Required observation is shared. SDK construction, physics, commands and
    // telemetry types belong only to the SDK profile and remain in its full guide.
    const observation = `import type * as THREE from 'three';\n${declaration.split('\n').filter(line => !/^\s+(snapshot|capabilities|execute)\?\(/.test(line)).join('\n')}`;
    const sdk = this.profile === 'three-sdk' ? { sdkContracts: contracts, sdkGuide: await readFile(path.join(REPOSITORY_ROOT, 'packages/three-world/README.md'), 'utf8') } : {};
    return { project: PROJECT_SCHEMA, episode: EPISODE_SCHEMA, observation, observationScope: 'The shared minimal observation object. Optional SDK telemetry/commands are documented only in the SDK profile; raw Three can omit them.', ...sdk,
      episodeNote: 'keysDown persist across steps until keysUp. Calling keysDown again on an already held key produces a real repeat keydown. Space is the Playwright key name. durationSeconds uses real wall time. Targets are fixed world-space XYZ measurements, including height; they do not steer or teleport the player. Separate fixed external task goals must not be weakened to obtain a pass.' };
  }
  async examples() { return { profile: this.profile, files: { 'main.ts': this.profile === 'three-sdk' ? SDK_EXAMPLE : RAW_EXAMPLE, 'index.html': '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script type="module" src="./main.ts"></script></body></html>', 'project.json': JSON.stringify({ schemaVersion: 1, assetIds: [] }), 'episode.json': JSON.stringify({ schemaVersion: 1, steps: [{ keysDown: ['w'], durationSeconds: 2 }, { keysDown: ['Shift'], durationSeconds: 2 }, { keysUp: ['w', 'Shift'], durationSeconds: 1 }, { keysDown: ['ArrowLeft'], durationSeconds: 1 }, { keysUp: ['ArrowLeft'], keysDown: ['Space'], durationSeconds: 0.2 }, { keysUp: ['Space'], durationSeconds: 1 }], targets: [] }, null, 2) }, sdkExample: this.profile === 'three-sdk' ? 'Read the exported contracts and the installed SDK example before using createWorld. Use world.expose() to install the common observer. The main script owns ordinary Three scene geometry and camera composition.' : 'Use normal Three scene, camera and renderer. Your loop and keyboard handlers remain yours. Expose a ready observer with scene/camera/renderer/player/targets and startLive/stopLive/reset. The Host does not provide a movement or physics implementation to the raw baseline.' }; }
  async assets(query = '', assetId?: string) { const assets = await readCatalog(); const words = query.toLowerCase().split(/\s+/).filter(Boolean); return { schemaVersion: 1, assets: assets.filter(asset => (!assetId || asset.id === assetId) && words.every(word => JSON.stringify(publicAsset(asset)).toLowerCase().includes(word))).map(publicAsset) }; }
  start(type: string, run: (id: string) => Promise<unknown>) {
    const now = new Date().toISOString(), id = randomUUID(); const operation: Operation = { id, type, status: 'queued', createdAt: now, updatedAt: now }; this.operations.set(id, operation);
    this.queue = this.queue.then(async () => {
      if (this.cancelled.has(id)) { operation.status = 'cancelled'; return; }
      this.activeOperationId = id; operation.status = 'running'; operation.updatedAt = new Date().toISOString();
      try { operation.result = await run(id); operation.status = this.cancelled.has(id) ? 'cancelled' : 'succeeded'; }
      catch (error) { operation.status = this.cancelled.has(id) ? 'cancelled' : 'failed'; operation.error = errorMessage(error); }
      finally { operation.updatedAt = new Date().toISOString(); delete this.activeOperationId; await json(path.join(this.evidenceRoot, 'operations', `${id}.json`), operation); }
    }).catch(() => { /* Every operation owns its own diagnostic result; a failed persistence write does not poison the serial queue. */ });
    return { operationId: id, status: operation.status };
  }
  async getOperation(id: string, waitSeconds = 0) {
    if (!Number.isFinite(waitSeconds) || waitSeconds < 0 || waitSeconds > 25) throw new Error('THREE_WAIT_INVALID');
    const operation = this.operations.get(id); if (!operation) throw new Error('THREE_OPERATION_UNKNOWN: only operations created in this service session are trusted');
    const until = Date.now() + waitSeconds * 1000; while ((operation.status === 'queued' || operation.status === 'running') && Date.now() < until) await sleep(Math.min(100, until - Date.now()));
    return structuredClone(operation);
  }
  async cancel(id: string) { const operation = this.operations.get(id); if (!operation) throw new Error('THREE_OPERATION_UNKNOWN'); if (operation.status === 'queued' || operation.status === 'running') { this.cancelled.add(id); if (id === this.activeOperationId) await this.closeSession(); } return this.getOperation(id); }
  private assertActive(id: string) { if (this.cancelled.has(id)) throw new Error('THREE_OPERATION_CANCELLED'); }
  async close() { for (const operation of this.operations.values()) if (['queued', 'running'].includes(operation.status)) this.cancelled.add(operation.id); await this.closeSession(); }
  private async closeSession() { const session = this.session; delete this.session; if (session) await session.close(); }
  private async open(candidate: Candidate, recordRoot?: string): Promise<Session> {
    if (this.session?.candidate.worldBuildHash === candidate.worldBuildHash && !recordRoot) return this.session;
    await this.closeSession(); await verifyFiles(candidate.root, candidate.files);
    const errors: string[] = [], networkErrors: string[] = [];
    const mountPath = `/playable/${candidate.worldBuildHash}/`;
    const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://localhost'); const decoded = decodeURIComponent(url.pathname);
        if (url.pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
        if (!decoded.startsWith(mountPath)) { response.writeHead(404).end(); return; }
        const relative = decoded.slice(mountPath.length) || 'index.html', filename = path.resolve(candidate.playableRoot, relative);
        if (!isWithin(candidate.playableRoot, filename) || !(await lstat(filename)).isFile() || (await lstat(filename)).isSymbolicLink() || !isWithin(candidate.playableRoot, await realpath(filename))) { response.writeHead(403).end(); return; }
        response.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
        response.setHeader('Content-Type', mime[path.extname(filename)] ?? 'application/octet-stream'); response.end(await readFile(filename));
      } catch { response.writeHead(404).end(); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('THREE_HTTP_START_FAILED'); const origin = `http://127.0.0.1:${address.port}`;
    const browserEnv: Record<string, string> = {}; for (const key of ['PATH', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'DISPLAY', 'XDG_RUNTIME_DIR', 'LD_LIBRARY_PATH', 'FONTCONFIG_FILE', 'FONTCONFIG_PATH', 'LANG', 'LC_ALL', 'PLAYWRIGHT_BROWSERS_PATH']) if (process.env[key]) browserEnv[key] = process.env[key]!;
    const home = path.join(this.compiler.outputRoot, 'browser-home'); await mkdir(home, { recursive: true }); browserEnv.HOME = home;
    let browser: Browser;
    const launchOptions = { headless: true, env: browserEnv, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'] };
    try { browser = await chromium.launch(launchOptions); } catch (bundledError) { try { browser = await chromium.launch({ ...launchOptions, channel: 'chrome' }); } catch (fallbackError) { server.close(); throw new AggregateError([bundledError, fallbackError], 'THREE_BROWSER_UNAVAILABLE'); } }
    const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, ...(recordRoot ? { recordVideo: { dir: recordRoot, size: { width: 960, height: 540 } } } : {}) });
    await context.route('**/*', async route => { const url = route.request().url(); if (url.startsWith(`${origin}/`) || /^(?:data|blob):/.test(url)) await route.continue(); else { networkErrors.push(url.replace(/\?.*/, '')); await route.abort('blockedbyclient'); } });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console.error: ${message.text().slice(0, 4000)}`); });
    const session: Session = { candidate, browser, context, page, server, errors, networkErrors, close: async () => { await context.close().catch(() => {}); await browser.close().catch(() => {}); await new Promise<void>(resolve => server.close(() => resolve())); } };
    this.session = session;
    try {
      await page.goto(`${origin}${mountPath}`, { waitUntil: 'domcontentloaded', timeout: 60_000 }); const deadline = Date.now() + 60_000;
      for (;;) {
        if (errors.length) throw new Error(`THREE_BROWSER_STARTUP: ${errors.join('\n')}`);
        const state = await page.evaluate(() => ({ ready: Boolean((window as any).__THREE_CREATOR_HOST__?.ready()), exposed: Boolean((window as any).__WORLDKIT_EVAL__?.ready) }));
        if (state.ready) break;
        if (state.exposed) await this.bridge(session, 'inspect'); // Report the exact missing/invalid observer field immediately.
        if (Date.now() >= deadline) throw new Error('THREE_OBSERVER_TIMEOUT: initialize and expose WorldObservation; browser errors are listed below');
        await sleep(50);
      }
    }
    catch (error) { await this.closeSession(); throw new Error(`THREE_BROWSER_STARTUP_FAILED: ${errorMessage(error)}\n${errors.join('\n')}`); }
    return session;
  }
  private async bridge(session: Session, method: string, args: unknown[] = []): Promise<any> {
    return session.page.evaluate(`window.__THREE_CREATOR_HOST__[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
  }
  async validate() { const candidate = await this.compiler.prepare(); return { status: 'compiled', candidateId: candidate.id, profile: this.profile, sourceHash: candidate.sourceHash, worldBuildHash: candidate.worldBuildHash, runtimeHash: candidate.runtimeHash, candidateCacheHit: candidate.candidateCacheHit, runtimeCacheHit: candidate.runtimeCacheHit, runtimeValidation: 'not-run', playableRoot: candidate.playableRoot }; }
  async inspect() { const candidate = await this.compiler.prepare(), session = await this.open(candidate); return { sourceHash: candidate.sourceHash, worldBuildHash: candidate.worldBuildHash, profile: this.profile, observation: await this.bridge(session, 'inspect'), pageErrors: [...session.errors], blockedNetworkRequests: [...session.networkErrors] }; }
  private async capture(session: Session, root: string, view: string, entityIds: string[] = [], frontYawRadians?: number) {
    const result = await this.bridge(session, 'capture', [view, entityIds, frontYawRadians]); const bytes = Buffer.from(result.image.replace(/^data:image\/png;base64,/, ''), 'base64'); delete result.image;
    const name = `${view}-${sha256(JSON.stringify(entityIds)).slice(0, 10)}.png`, file = path.join(root, name); await mkdir(root, { recursive: true }); await writeFile(file, bytes);
    return { ...result, image: { path: file, sha256: sha256(bytes), byteLength: bytes.length }, sourceHash: session.candidate.sourceHash, worldBuildHash: session.candidate.worldBuildHash, profile: this.profile };
  }
  async preview(view = 'opening', entityIds: string[] = [], frontYawRadians?: number) {
    if (!['opening', 'top-down', 'entity-triview'].includes(view) || (frontYawRadians !== undefined && !Number.isFinite(frontYawRadians))) throw new Error('THREE_PREVIEW_INPUT_INVALID');
    const candidate = await this.compiler.prepare(), session = await this.open(candidate); await this.bridge(session, 'stop');
    if (view === 'opening') await this.bridge(session, 'reset');
    return this.capture(session, path.join(this.evidenceRoot, candidate.worldBuildHash, `preview-${randomUUID()}`), view, entityIds, frontYawRadians);
  }
  async triviews() {
    const candidate = await this.compiler.prepare(), session = await this.open(candidate); await this.bridge(session, 'reset');
    const root = path.join(this.evidenceRoot, candidate.worldBuildHash, `captures-${randomUUID()}`), observation = await this.bridge(session, 'inspect'); const images = [];
    images.push(await this.capture(session, root, 'opening'));
    for (const id of ['player', ...Object.keys(observation.targets).filter(id => id !== 'player' && observation.targets[id].uuid !== observation.player.uuid)]) images.push(await this.capture(session, root, 'entity-triview', [id]));
    const report = { kind: 'three-creator-captures', schemaVersion: 1, profile: this.profile, worldBuildHash: candidate.worldBuildHash, sourceHash: candidate.sourceHash, images, pageErrors: [...session.errors] };
    await json(path.join(root, 'captures.json'), report); this.captureEvidence = { root, files: await hashTree(root), report }; return { ...report, image: images[0]!.image };
  }
  private async episode(): Promise<{ episode: Episode; hash: string; bytes: Buffer }> {
    const file = path.join(this.workspace, 'episode.json'); if ((await lstat(file)).isSymbolicLink() || !isWithin(await realpath(this.workspace), await realpath(file))) throw new Error('THREE_EPISODE_PATH_INVALID');
    const bytes = await readFile(file), episode = JSON.parse(bytes.toString());
    if (!checkEpisode(episode)) throw new Error(`THREE_EPISODE_INVALID: ${JSON.stringify(checkEpisode.errors)}`);
    const duration = (episode as Episode).steps.reduce((sum, step) => sum + step.durationSeconds, 0);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 600) throw new Error('THREE_EPISODE_DURATION_INVALID: total duration must be within (0,600] seconds');
    return { episode: episode as Episode, hash: sha256(bytes), bytes };
  }
  async playtest(operationId: string, durationSeconds?: number, framesPerSecond = 3) {
    const candidate = await this.compiler.prepare(), input = await this.episode(), plannedSeconds = input.episode.steps.reduce((sum, step) => sum + step.durationSeconds, 0);
    const requestedSeconds = durationSeconds ?? plannedSeconds;
    const limitSeconds = durationSeconds === undefined ? Infinity : requestedSeconds;
    if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0 || requestedSeconds > 600 || ![1, 2, 3, 6].includes(framesPerSecond)) throw new Error('THREE_PLAYTEST_DURATION_INVALID');
    const root = path.join(this.evidenceRoot, candidate.worldBuildHash, `playtest-${operationId}`); await mkdir(root, { recursive: true });
    const session = await this.open(candidate);
    const hostEvents: any[] = [], keyframes: any[] = [], held = new Set<string>(); let trace: any; let failure: string | null = null; let completedSteps = 0;
    await this.bridge(session, 'reset'); await this.bridge(session, 'beginRecording', [framesPerSecond]); await this.bridge(session, 'start'); await this.bridge(session, 'beginTrace'); const started = performance.now();
    const elapsed = () => (performance.now() - started) / 1000; let nextKeyframe = 0;
    const send = async (type: 'keydown' | 'keyup', key: string, cleanup = false) => { const before = await this.bridge(session, 'read'); if (type === 'keydown') { await session.page.keyboard.down(key); held.add(key); } else { await session.page.keyboard.up(key); held.delete(key); } hostEvents.push({ type, key, cleanup, wallSeconds: elapsed(), before }); };
    try {
      for (const [index, step] of input.episode.steps.entries()) {
        if (elapsed() >= limitSeconds) break; this.assertActive(operationId);
        for (const key of step.keysUp ?? []) await send('keyup', key);
        for (const key of step.keysDown ?? []) await send('keydown', key);
        if (step.pointerDrag) { const drag = step.pointerDrag; await session.page.mouse.move(480, 270); await session.page.mouse.down({ button: drag.button ?? 'left' }); await session.page.mouse.move(480 + drag.deltaXPixels, 270 + drag.deltaYPixels, { steps: 8 }); await session.page.mouse.up({ button: drag.button ?? 'left' }); hostEvents.push({ type: 'pointer-drag', wallSeconds: elapsed(), ...drag }); }
        const until = Math.min(limitSeconds, elapsed() + step.durationSeconds);
        while (elapsed() < until) {
          this.assertActive(operationId);
          const currentState = await this.bridge(session, 'latestSample'); assertSdkPlaytestRunning(this.profile, currentState);
          if (elapsed() >= nextKeyframe) { const file = path.join(root, `keyframe-${keyframes.length.toString().padStart(3, '0')}.png`); const bytes = await session.page.screenshot({ path: file }); keyframes.push({ path: file, sha256: sha256(bytes), wallSeconds: elapsed() }); nextKeyframe += 15; }
          const operation = this.operations.get(operationId); if (operation) operation.progress = { phase: 'real-browser-keyboard', stepIndex: index, elapsedSeconds: elapsed(), requestedSeconds, currentState };
          if (session.errors.length) throw new Error(`THREE_PLAYTEST_PAGE_ERROR: ${session.errors.join('\n')}`);
          await sleep(Math.max(0, Math.min(200, (until - elapsed()) * 1000)));
        }
        completedSteps++;
      }
      while (elapsed() < requestedSeconds) { this.assertActive(operationId); await sleep(Math.min(200, (requestedSeconds - elapsed()) * 1000)); }
    } catch (error) { failure = errorMessage(error); }
    finally {
      for (const key of [...held]) await send('keyup', key, true).catch(error => { failure ??= errorMessage(error); });
      trace = await this.bridge(session, 'endTrace').catch(error => { failure ??= errorMessage(error); return { samples: [], keyboardEvents: [], browserFrameDeltasSeconds: [] }; });
      await this.bridge(session, 'stop').catch(() => {});
    }
    const actualWallSeconds = elapsed(), lastObservation = await this.bridge(session, 'inspect').catch(() => null);
    let videoFile: string | null = null;
    let videoMetadata: Awaited<ReturnType<typeof probeVideo>> | null = null;
    try {
      const recorded = await this.bridge(session, 'endRecording'); const raw = path.join(root, 'playtest.webm');
      await writeFile(raw, Buffer.from(recorded.replace(/^data:video\/webm;base64,/, ''), 'base64'));
      videoFile = path.join(root, 'playtest.mp4'); await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-vf', `fps=${framesPerSecond}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p', videoFile]);
      videoMetadata = await probeVideo(videoFile);
      if (videoMetadata.durationSeconds < actualWallSeconds - Math.max(1, 2 / framesPerSecond)) throw new Error('THREE_VIDEO_DURATION_MISMATCH: real recording ended before the input episode');
    } catch (error) { videoFile = null; failure ??= errorMessage(error); }
    const samples = trace.samples as any[], errors = samples.flatMap(sample => sample.errors ?? []); const validSamples = samples.filter(sample => Array.isArray(sample.positionMetersXYZ) && sample.positionMetersXYZ.length === 3 && sample.positionMetersXYZ.every((value: unknown) => typeof value === 'number' && Number.isFinite(value)));
    if (samples.length !== validSamples.length) failure ??= 'THREE_PLAYTEST_OBSERVATION_INVALID: missing or nonfinite actual player position';
    let travelledMeters = 0; for (let i = 1; i < validSamples.length; i++) { const a = validSamples[i - 1]!.positionMetersXYZ, b = validSamples[i]!.positionMetersXYZ; travelledMeters += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
    const targetResults = input.episode.targets.map(target => { const nearestDistanceMeters = Math.min(...validSamples.map(sample => Math.hypot(...target.positionMetersXYZ.map((value, index) => value - sample.positionMetersXYZ[index])))); return { ...target, nearestDistanceMeters: Number.isFinite(nearestDistanceMeters) ? nearestDistanceMeters : null, reached: nearestDistanceMeters <= target.toleranceMeters }; });
    const capturedInput = trace.keyboardEvents.some((event: any) => event.type === 'keydown' && event.isTrusted) && trace.keyboardEvents.some((event: any) => event.type === 'keyup' && event.isTrusted);
    const isCompleteEpisode = completedSteps === input.episode.steps.length && requestedSeconds >= plannedSeconds;
    if (session.networkErrors.length) failure ??= 'THREE_BLOCKED_NETWORK_REQUESTS: bundle local assets/dependencies for this same-origin world';
    const passed = !failure && session.errors.length === 0 && errors.length === 0 && capturedInput && validSamples.length > 0 && videoFile !== null && actualWallSeconds >= requestedSeconds - 0.05;
    const report = { kind: 'three-creator-browser-playtest', schemaVersion: 1, status: passed ? 'passed' : 'failed', profile: this.profile, sourceHash: candidate.sourceHash, worldBuildHash: candidate.worldBuildHash, runtimeHash: candidate.runtimeHash, episodeHash: input.hash, requestedSeconds, plannedSeconds, actualWallSeconds, completedSteps, isCompleteEpisode, capturedInput, travelledMeters, targetResults, semanticStatus: 'unreviewed', failure, pageErrors: session.errors, runtimeErrors: errors, blockedNetworkRequests: session.networkErrors, videoPath: videoFile, videoMetadata, keyframes, hostKeyboardEvents: hostEvents, browserKeyboardEvents: trace.keyboardEvents, lastObservation, frameTiming: { frameCount: trace.browserFrameDeltasSeconds.length, maximumFrameDeltaSeconds: Math.max(0, ...trace.browserFrameDeltasSeconds) } };
    await json(path.join(root, 'trace.json'), trace); await json(path.join(root, 'playtest.json'), report); await writeFile(path.join(root, 'episode.json'), input.bytes);
    this.playtestEvidence = { root, files: await hashTree(root), report }; return report;
  }
  async submit() {
    const candidate = await this.compiler.prepare(), episode = await this.episode(), played = this.playtestEvidence;
    if (!played || played.report.status !== 'passed' || played.report.actualWallSeconds < 180 || !played.report.isCompleteEpisode || !played.report.capturedInput || played.report.worldBuildHash !== candidate.worldBuildHash || played.report.episodeHash !== episode.hash) throw new Error('THREE_SUBMIT_PLAYTEST_REQUIRED: complete a current-source, current-episode real 180s+ keyboard/video playtest in this same service session');
    await verifyFiles(candidate.root, candidate.files); await verifyFiles(played.root, played.files);
    if (this.captureEvidence?.report.worldBuildHash !== candidate.worldBuildHash) await this.triviews();
    const captures = this.captureEvidence!; await verifyFiles(captures.root, captures.files);
    if (captures.report.pageErrors.length) throw new Error('THREE_SUBMIT_CAPTURE_ERRORS');
    const root = path.join(this.compiler.outputRoot, 'delivery', randomUUID()), payload = path.join(root, 'payload'); await mkdir(payload, { recursive: true });
    await copyClosed(candidate.sourceRoot, path.join(payload, 'source')); await copyClosed(candidate.playableRoot, path.join(payload, 'playable')); await copyClosed(played.root, path.join(payload, 'playtest')); await copyClosed(captures.root, path.join(payload, 'captures')); await writeFile(path.join(payload, 'episode.json'), episode.bytes);
    for (const prefix of ['source', 'playable']) await verifyFiles(path.join(payload, prefix), Object.fromEntries(Object.entries(candidate.files).filter(([name]) => name.startsWith(`${prefix}/`)).map(([name, hash]) => [name.slice(prefix.length + 1), hash])));
    await verifyFiles(path.join(payload, 'playtest'), played.files); await verifyFiles(path.join(payload, 'captures'), captures.files);
    const manifest = { kind: 'three-creator-delivery', schemaVersion: 1, toolVersion: THREE_CREATOR_VERSION, engine: 'three@0.185.1', creatorRuntimeLockHash: process.env.WORLDKIT_CREATOR_RUNTIME_HASH ?? null, profile: this.profile, status: 'ready-for-independent-review', technicalStatus: 'passed', semanticStatus: 'unreviewed', sourceHash: candidate.sourceHash, worldBuildHash: candidate.worldBuildHash, runtimeHash: candidate.runtimeHash, episodeHash: episode.hash, browserObservationContract: 'WorldObservation-v1', actualWallSeconds: played.report.actualWallSeconds, targetResults: played.report.targetResults, deliveredAt: new Date().toISOString(), files: await hashTree(payload) };
    await json(path.join(payload, 'delivery.json'), manifest); const hashes = await hashTree(payload); await json(path.join(payload, 'artifact-hashes.json'), { schemaVersion: 1, files: hashes });
    const temporary = path.join(root, 'creator-delivery.tar.gz'); await createClosedArchive(root, temporary);
    await verifyFiles(candidate.root, candidate.files); await verifyFiles(played.root, played.files); await verifyFiles(captures.root, captures.files);
    const archivePath = path.join(this.workspace, 'creator-delivery.tar.gz'), temporaryArchive = `${archivePath}.${randomUUID()}.tmp`; await copyFile(temporary, temporaryArchive); await rename(temporaryArchive, archivePath);
    const receipt = { ...manifest, archivePath, archiveSha256: sha256(await readFile(archivePath)), archiveByteLength: (await lstat(archivePath)).size, deliveryManifestSha256: sha256(await readFile(path.join(payload, 'delivery.json'))) };
    await json(path.join(this.workspace, 'creator-result.json'), receipt); return receipt;
  }
}
