import { createServer } from 'node:http';
import { lstat, readFile, realpath, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium, type Page } from 'playwright';
import type { Vec3, WorldInput, WorldSnapshot } from '@worldkit/three';
import type { EpisodeRuntimePort, EpisodeRouteInputRequest, EpisodeCapabilities, EpisodeStart, EpisodeStartProbe, EpisodeFrame, CommandReceipt, OperationStatus } from '@worldkit/three';

export interface EpisodeBrowserOptions {
  playableRoot: string; executablePath?: string; headless?: boolean;
  widthPixels?: number; heightPixels?: number; timeoutMilliseconds?: number;
}
export interface EpisodeObserveOptions {
  view?: 'opening' | 'current' | 'top-down'; cameraPositionWorldMetersXYZ?: Vec3;
  lookAtWorldMetersXYZ?: Vec3; entityIds?: readonly string[];
}
export interface EpisodeObservation {
  viewId: string; imageDataUrl: string; snapshot: WorldSnapshot;
  capabilities: EpisodeCapabilities; entities: unknown;
  camera: { projectionMatrix: number[]; viewMatrix: number[]; cameraToWorldMatrix: number[] };
  renderOverrides: { fogDisabled: boolean };
}
export interface EpisodeCaptureSession {
  readonly errors: readonly string[];
  capabilities(): Promise<EpisodeCapabilities>;
  boarding?(instanceId:string):Promise<import('@worldkit/three').humanoid.BoardingObservation>;
  routeInput?(request:EpisodeRouteInputRequest):Promise<WorldInput>;
  probeStart(start: EpisodeStart): Promise<EpisodeStartProbe>;
  prepareSegment(start: EpisodeStart, viewport: { widthPixels: number; heightPixels: number }): Promise<WorldSnapshot>;
  advance(input: WorldInput, ticks: number): Promise<WorldSnapshot>;
  execute(command: Parameters<EpisodeRuntimePort['execute']>[0]): Promise<CommandReceipt>;
  operation(id: string): Promise<OperationStatus>;
  frame(mimeType: 'image/jpeg' | 'image/png'): Promise<EpisodeFrame>;
  release(): Promise<void>;
  close(): Promise<void>;
}
export interface BrowserSession extends EpisodeCaptureSession {
  readonly page: Page;
  observe(options?: EpisodeObserveOptions): Promise<EpisodeObservation>;
  screenshot(): Promise<string>;
  pick(viewId: string, pixelUv: readonly [number, number]): Promise<unknown>;
}

function cameraStateShape(camera:WorldSnapshot['camera']):boolean {
 return !!camera&&['authored','follow-pending','follow'].includes(camera.mode)
  &&(camera.viewId===null||typeof camera.viewId==='string'&&camera.viewId.length>0)
  &&(camera.viewKind===null||['third-person','first-person','shoulder'].includes(camera.viewKind))
  &&(camera.documentHash===null||typeof camera.documentHash==='string')
  &&[camera.configurationRevision,camera.cameraCommitRevision].every(v=>Number.isSafeInteger(v)&&v>=0)
  &&(camera.lifecycleGeneration===null||Number.isSafeInteger(camera.lifecycleGeneration))
  &&(camera.subjectGeneration===null||Number.isSafeInteger(camera.subjectGeneration))
  &&(camera.logicalTargetId===null||typeof camera.logicalTargetId==='string')
  &&(camera.resolvedSubjectId===null||typeof camera.resolvedSubjectId==='string')
  &&['none','blend'].includes(camera.transition?.kind)
  &&Number.isFinite(camera.transition.configuredDurationSeconds)&&camera.transition.configuredDurationSeconds>=0
  &&(camera.transition.kind==='none'?camera.transition.effectiveDurationSeconds===0:camera.transition.targetViewId===camera.viewId&&Number.isFinite(camera.transition.elapsedSeconds)&&camera.transition.elapsedSeconds>=0&&Number.isFinite(camera.transition.durationSeconds)&&camera.transition.durationSeconds>0)
  &&(camera.mode==='authored'?camera.viewId===null&&camera.viewKind===null:camera.viewId!==null&&camera.viewKind!==null&&camera.resolvedSubjectId!==null&&camera.subjectGeneration!==null);
}
/** Admission is intentionally independent from source/delivery envelope versions. */
export function assertEpisodeCameraCapabilities(value:EpisodeCapabilities):void {
  const c=value?.camera;
  if(value?.schemaVersion!==2||!c||!Array.isArray(c.views)||!['authored','follow-pending','follow'].includes(c.baselineMode)||!cameraStateShape(c.current)||(c.documentHash!==null&&typeof c.documentHash!=='string'))throw new Error('EPISODE_CAMERA_PROTOCOL_UNSUPPORTED');
  if(c.views.some(v=>!v||typeof v.viewId!=='string'||!v.viewId||!['third-person','first-person','shoulder'].includes(v.kind))||new Set(c.views.map(v=>v.viewId)).size!==c.views.length||!(c.defaultViewId===null?c.views.length===0:c.views.some(v=>v.viewId===c.defaultViewId)))throw new Error('EPISODE_CAMERA_PROTOCOL_UNSUPPORTED');
}
export function assertEpisodeCameraStart(start:EpisodeStart,capabilities:EpisodeCapabilities):void {
 assertEpisodeCameraCapabilities(capabilities);
 if(start.cameraViewSelection!==undefined&&(start.cameraViewSelection!=='automatic'||start.cameraViewId!==undefined))throw new Error('EPISODE_CAMERA_FIELDS_CONFLICT');
 if(start.cameraViewSelection==='automatic'&&!capabilities.camera.automaticViewSelection)throw new Error('EPISODE_CAMERA_SELECTION_UNSUPPORTED');
 if(start.cameraViewId!==undefined&&!capabilities.camera.views.some(v=>v.viewId===start.cameraViewId))throw new Error('EPISODE_CAMERA_VIEW_UNDECLARED');
}
export function assertEpisodeCameraPrepared(start:EpisodeStart,capabilities:EpisodeCapabilities,snapshot:WorldSnapshot):void {
 assertEpisodeCameraStart(start,capabilities);
 const automatic=start.cameraViewSelection==='automatic',camera=snapshot?.camera;
 const expected=automatic?camera?.viewId:start.cameraViewId??(capabilities.camera.baselineMode==='authored'?null:capabilities.camera.defaultViewId);
 const kind=expected===null?null:capabilities.camera.views.find(v=>v.viewId===expected)?.kind;
 if(automatic&&(!camera?.viewSelection||camera.viewSelection.source==='manual'||camera.viewSelection.suspendedBy||!capabilities.camera.views.some(view=>view.viewId===expected)))throw new Error('EPISODE_CAMERA_PREPARED_STATE_MISMATCH');
 if(!cameraStateShape(camera)||camera.viewId!==expected||camera.viewKind!==kind||camera.transition?.kind!=='none'||camera.documentHash!==capabilities.camera.documentHash||!Number.isSafeInteger(camera.configurationRevision)||!Number.isSafeInteger(camera.cameraCommitRevision)||(expected===null?camera.mode!=='authored':camera.mode!=='follow'||!camera.resolvedSubjectId||!Number.isSafeInteger(camera.subjectGeneration)))throw new Error('EPISODE_CAMERA_PREPARED_STATE_MISMATCH');
}

function isWithin(root: string, filename: string) {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Directly mounts the frozen playable; no Creator/Studio process or compiler is
 * started. The browser only sees this mount and a fresh credential-free HOME. */
export async function openEpisodeBrowser(options: EpisodeBrowserOptions): Promise<BrowserSession> {
  const root = await realpath(options.playableRoot);
  const home = await mkdtemp(path.join(os.tmpdir(), 'worldkit-episode-browser-'));
  const errors: string[] = [];
  const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
      const filename = path.resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
      if (!isWithin(root, filename) || !(await lstat(filename)).isFile() || (await lstat(filename)).isSymbolicLink() || !isWithin(root, await realpath(filename))) { response.writeHead(403).end(); return; }
      response.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
      response.setHeader('Content-Type', mime[path.extname(filename)] ?? 'application/octet-stream');
      response.end(await readFile(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('EPISODE_HTTP_START_FAILED');
  const origin = `http://127.0.0.1:${address.port}`;
  const env: Record<string, string> = { HOME: home };
  for (const key of ['PATH', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'DISPLAY', 'XDG_RUNTIME_DIR', 'LD_LIBRARY_PATH', 'FONTCONFIG_FILE', 'FONTCONFIG_PATH', 'LANG', 'LC_ALL', 'PLAYWRIGHT_BROWSERS_PATH']) if (process.env[key]) env[key] = process.env[key]!;
  const launch = { headless: options.headless ?? true, env,
    ...(options.executablePath ? { executablePath: options.executablePath } : {}),
    args: process.env.WORLDKIT_CAPTURE_GPU === '1'
      ? ['--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-software-rasterizer', '--disable-gpu-sandbox']
      : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'] };
  let browser;
  try { browser = await chromium.launch(launch).catch(async error => {
    if (options.executablePath) throw error;
    try { return await chromium.launch({ ...launch, channel: 'chrome' }); }
    catch (fallbackError) { throw new AggregateError([error, fallbackError], 'EPISODE_BROWSER_UNAVAILABLE'); }
  }); } catch (error) { await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); throw error; }
  let isClosed = false;
  const close = async () => {
    if (isClosed) return; isClosed = true;
    await browser.close().catch(() => undefined);
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  };
  try {
    const context = await browser.newContext({ viewport: { width: options.widthPixels ?? 1280, height: options.heightPixels ?? 720 }, deviceScaleFactor: 1 });
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith(`${origin}/`) || /^(data|blob):/.test(url)) await route.continue();
      else { errors.push(`EPISODE_NETWORK_BLOCKED: ${url.replace(/\?.*/, '').slice(0, 400)}`); await route.abort(); }
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console.error: ${message.text().slice(0, 2000)}`); });
    await page.goto(`${origin}/index.html?ui=off`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMilliseconds ?? 60_000 });
    await page.waitForFunction(() => (window as any).__WORLDKIT_EVAL__?.ready, undefined, { timeout: options.timeoutMilliseconds ?? 60_000 });
    await page.evaluate(async () => {
      const observer = (window as any).__WORLDKIT_EVAL__;
      if(observer.episode?.schemaVersion!==2||observer.episode.capabilities?.()?.schemaVersion!==2)throw new Error('EPISODE_CAMERA_PROTOCOL_UNSUPPORTED');
      await observer.stopLive();
      if (!observer.episode || ['prepareSegment', 'execute', 'operation'].some(method => typeof observer.episode[method] !== 'function')) throw new Error('EPISODE_RUNTIME_PORT_MISSING: build and deliver a runtime with the Episode capture port');
      (window as any).__THREE_EPISODE_VIEWS__ = { serial: 0, views: new Map() };
    });
    const call = <K extends keyof EpisodeRuntimePort>(method: K, args: unknown[] = []): Promise<any> => page.evaluate(async ({ method, args }) => {
      const port = (window as any).__WORLDKIT_EVAL__?.episode;
      if (!port || typeof port[method] !== 'function') throw new Error(`EPISODE_PORT_METHOD_MISSING: ${method}`);
      return await port[method](...args);
    }, { method, args });
    const initialCapabilities=await call('capabilities');assertEpisodeCameraCapabilities(initialCapabilities);
    const session: BrowserSession = {
      page, errors,
      capabilities: async () => {const value=await call('capabilities');assertEpisodeCameraCapabilities(value);return value;}, boarding:id=>call('boarding',[id]), routeInput:request=>call('routeInput',[request]), probeStart: start => call('probeStart', [start]),
      prepareSegment: async (start, viewport) => {const capabilities=await session.capabilities();assertEpisodeCameraStart(start,capabilities);const snapshot=await call('prepareSegment',[start,viewport]);try{assertEpisodeCameraPrepared(start,capabilities,snapshot);return snapshot;}catch(error){await call('release');throw error;}},
      execute: command => call('execute', [command]), operation: id => call('operation', [id]),
      advance: (input,ticks) => call('advance',[input,ticks]), frame: mimeType => call('frame', [mimeType]),
      release: () => call('release'), close,
      screenshot: async () => page.evaluate(() => {
        const observer = (window as any).__WORLDKIT_EVAL__;
        observer.scene.updateMatrixWorld(true); observer.camera.updateWorldMatrix(true, false);
        observer.renderer.render(observer.scene, observer.camera);
        return observer.renderer.domElement.toDataURL('image/png');
      }),
      observe: async (query = {}) => page.evaluate(async query => {
        const observer = (window as any).__WORLDKIT_EVAL__;
        if (query.view === 'opening') { await observer.reset(); await observer.stopLive(); }
        const THREE = await import('three');
        observer.camera.updateWorldMatrix(true, false);
        const camera = observer.camera.clone();
        observer.camera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
        const snapshot = observer.snapshot();
        if (query.view === 'top-down') {
          const worldBounds = observer.episode.capabilities().worldBounds;
          if (!worldBounds) throw new Error('EPISODE_WORLD_BOUNDS_MISSING');
          const bounds = new THREE.Box3(new THREE.Vector3().fromArray(worldBounds.minimumWorldMetersXYZ), new THREE.Vector3().fromArray(worldBounds.maximumWorldMetersXYZ));
          if (bounds.isEmpty()) throw new Error('EPISODE_OBSERVE_EMPTY_WORLD');
          const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
          const fov = ('fov' in camera ? camera.fov : 55) * Math.PI / 180;
          const aspect = observer.renderer.domElement.width / observer.renderer.domElement.height;
          const height = Math.max(size.z, size.x / aspect) / (2 * Math.tan(fov / 2)) * 1.12 + size.y / 2;
          camera.position.set(center.x, center.y + Math.max(10, height), center.z);
          camera.up.set(0, 0, -1); camera.lookAt(center); camera.far = Math.max(camera.far, height * 4);
          if (camera.isOrthographicCamera) {
            const halfHeight = Math.max(size.z, size.x / aspect) * 0.56;
            camera.top = halfHeight; camera.bottom = -halfHeight; camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.zoom = 1;
          }
          camera.updateProjectionMatrix();
        }
        if (query.cameraPositionWorldMetersXYZ) camera.position.fromArray(query.cameraPositionWorldMetersXYZ);
        if (query.lookAtWorldMetersXYZ) camera.lookAt(new THREE.Vector3().fromArray(query.lookAtWorldMetersXYZ));
        camera.updateMatrixWorld(true); observer.scene.updateMatrixWorld(true);
        const views = (window as any).__THREE_EPISODE_VIEWS__, viewId = `view-${++views.serial}`;
        views.views.set(viewId, camera);
        while (views.views.size > 20) views.views.delete(views.views.keys().next().value);
        const fog = observer.scene.fog, fogDisabled = query.view === 'top-down';
        let imageDataUrl;
        try {
          // A high map camera otherwise sees only distance fog. This declared
          // observation override never changes the live/captured world rendering.
          if (fogDisabled) observer.scene.fog = null;
          observer.renderer.render(observer.scene, camera);
          imageDataUrl = observer.renderer.domElement.toDataURL('image/png');
        } finally {
          observer.scene.fog = fog;
          observer.renderer.render(observer.scene, observer.camera);
        }
        return { viewId, imageDataUrl, snapshot, capabilities: observer.episode.capabilities(),
          entities: query.entityIds ? snapshot.entities.filter((entity: any) => query.entityIds!.includes(entity.id)) : snapshot.entities,
          camera: { projectionMatrix: camera.projectionMatrix.toArray(), viewMatrix: camera.matrixWorldInverse.toArray(), cameraToWorldMatrix: camera.matrixWorld.toArray() }, renderOverrides: {fogDisabled} };
      }, query),
      pick: async (viewId, pixelUv) => {
        if (pixelUv.length !== 2 || pixelUv.some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('EPISODE_PICK_UV_INVALID');
        return page.evaluate(async ({ viewId, pixelUv }) => {
          const observer = (window as any).__WORLDKIT_EVAL__, camera = (window as any).__THREE_EPISODE_VIEWS__.views.get(viewId);
          if (!camera) throw new Error('EPISODE_VIEW_EXPIRED');
          const THREE = await import('three');
          const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(pixelUv[0]! * 2 - 1, 1 - pixelUv[1]! * 2), camera);
          const hits = raycaster.intersectObject(observer.scene, true).filter((hit: any) => {
            for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
            return true;
          });
          const hit = hits[0]; if (!hit) return { viewId, pixelUv, visualHit: null };
          let entityId: string | undefined;
          for (const [id, object] of Object.entries(observer.targets)) {
            for (let candidate: typeof hit.object | null = hit.object; candidate; candidate = candidate.parent) if (candidate === object) { entityId = id; break; }
            if (entityId) break;
          }
          const positionWorldMetersXYZ = hit.point.toArray();
          const normal = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).toArray() ?? null;
          let startProbe: unknown;
          try {
            const yaw = observer.snapshot().camera.desiredYawRadians;
            const direction = observer.camera.getWorldDirection(new THREE.Vector3());
            startProbe = observer.episode.probeStart({ positionWorldMetersXYZ,
              facingYawRadians: Number.isFinite(yaw) ? yaw : Math.atan2(-direction.x, -direction.z) });
          }
          catch (error) { startProbe = { isValid: false, diagnostics: [{ code: 'EPISODE_POINT_PROBE_FAILED', message: String(error) }] }; }
          return { viewId, pixelUv, visualHit: { positionWorldMetersXYZ, normalWorldXYZ: normal, entityId: entityId ?? null, objectName: hit.object.name, distanceMeters: hit.distance }, startProbe };
        }, { viewId, pixelUv });
      },
    };
    if (errors.length) throw new Error(`EPISODE_BROWSER_STARTUP_FAILED: ${errors.join('\n')}`);
    return session;
  } catch (error) { await close(); throw error; }
}
