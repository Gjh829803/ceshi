import {ARBORIST_CAPTURE_ADAPTER} from './custom-movement.js';
import { createHash } from 'node:crypto';
import { readdir, lstat, readFile, mkdir, writeFile, rename, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Vec3, WorldSnapshot } from '@worldkit/three';
import type { EpisodeCapabilities, EpisodeFrame } from '@worldkit/three';
import { createRenderedFrameEncoder, inspectRenderedVideo, type RenderedFrameEncoder } from '../lib/rendered-frame-encoder.js';
import { canonicalHash, PRE_SEEDANCE_PROFILE, SEGMENT_IDS, validateEpisodePlan, type EpisodePlan, type EpisodeSegmentPlan } from './contracts.js';
import { openEpisodeBrowser, type EpisodeBrowserOptions, type EpisodeCaptureSession } from './browser.js';
import { ROUTE_CONTROLLER_VERSION, type RouteDecision, type RouteMovement } from './route-controller.js';

import { PlayerCaptureController, summarizePlayerBehavior, playerBehaviorFeedback } from './player-controller.js';
import { PLAYER_CAPTURE_VERSION } from './playback-policy.mjs';
import { EpisodeActionController, ACTION_CAPTURE_VERSION } from './action-controller.js';

const PROFILE = PRE_SEEDANCE_PROFILE;
export interface CaptureArtifact { path: string; sha256: string; byteLength: number }
export interface SegmentCaptureResult {
  kind: 'three-episode-segment-capture'; schemaVersion: 1;
  segmentId: string; status: 'completed' | 'failed'; cacheHit: boolean;
  recipeHash: string; worldBuildHash: string; runtimeHash?: string;
  outputRoot: string; frameCount: number; durationSeconds: number;
  artifacts: CaptureArtifact[]; failure?: { code: string; message: string };
}
export interface CaptureSummary {
  kind: 'three-episode-capture-summary'; schemaVersion: 1;
  status: 'completed' | 'partial' | 'failed'; worldBuildHash: string;
  playerCaptureVersion?: string; playableFilesHash: string; segments: SegmentCaptureResult[];
}
export interface CaptureSegmentsOptions {
  playableRoot: string; plan: EpisodePlan; outputRoot: string; runtimeHash?: string;
  segmentIds?: readonly string[]; browserOptions?: Omit<EpisodeBrowserOptions, 'playableRoot'>;
  onProgress?: (event: { segmentId: string; frameCount: number; totalFrameCount: number; status: 'recording' | 'completed' | 'failed' | 'cached' }) => void | Promise<void>;
  /** One session per invocation: all six segments share its sealed reset baseline. */
  openBrowser?: (options: EpisodeBrowserOptions) => Promise<EpisodeCaptureSession>;
  encoderFactory?: typeof createRenderedFrameEncoder;
  inspectVideo?: typeof inspectRenderedVideo;
}

export function frameSimulationTick(frameIndex: number, fixedTimeStepSeconds: number): number {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || !Number.isFinite(fixedTimeStepSeconds) || Math.abs(fixedTimeStepSeconds * PROFILE.simulationTickRate - 1) > 1e-9) throw new Error('EPISODE_FIXED_STEP_UNSUPPORTED');
  return Math.round(frameIndex / PROFILE.captureFps / fixedTimeStepSeconds);
}

function imageBytes(dataUrl: string, mime: 'image/png' | 'image/jpeg'): Buffer {
  const prefix = `data:${mime};base64,`;
  if (!dataUrl.startsWith(prefix)) throw new Error(`EPISODE_FRAME_MIME_INVALID: expected ${mime}`);
  const bytes = Buffer.from(dataUrl.slice(prefix.length), 'base64');
  if (bytes.length < 8) throw new Error('EPISODE_FRAME_EMPTY');
  return bytes;
}
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function atomicJson(filename: string, value: unknown) {
  const temporary = `${filename}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`); await rename(temporary, filename);
}

async function playableIdentity(root: string) {
  const base = await realpath(root), files: Record<string, string> = {};
  async function visit(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      const filename = path.join(directory, name), info = await lstat(filename);
      if (info.isSymbolicLink()) throw new Error('EPISODE_PLAYABLE_SYMLINK_REJECTED');
      if (info.isDirectory()) await visit(filename);
      else if (info.isFile()) files[path.relative(base, filename).split(path.sep).join('/')] = sha256(await readFile(filename));
      else throw new Error('EPISODE_PLAYABLE_SPECIAL_FILE_REJECTED');
    }
  }
  await visit(base); if (!files['index.html']) throw new Error('EPISODE_PLAYABLE_INDEX_MISSING');
  return canonicalHash(files);
}
async function artifact(root: string, relative: string): Promise<CaptureArtifact> {
  const bytes = await readFile(path.join(root, relative)); return { path: relative, sha256: sha256(bytes), byteLength: bytes.length };
}
export async function readCaptureCache(root: string, recipeHash: string): Promise<SegmentCaptureResult | null> {
  try {
    const value = JSON.parse(await readFile(path.join(root, 'segment-result.json'), 'utf8')) as SegmentCaptureResult;
    if (value.kind !== 'three-episode-segment-capture' || value.status !== 'completed' || value.recipeHash !== recipeHash || value.frameCount !== PROFILE.captureFrameCount || value.durationSeconds !== PROFILE.segmentSeconds) return null;
    if (!['video.mp4', 'first-frame.png', 'trace.json', 'health.json'].every(required => value.artifacts.some(file => file.path === required))) return null;
    for (const file of value.artifacts) {
      if (file.path.includes('..') || path.isAbsolute(file.path)) return null;
      const observed = await artifact(root, file.path);
      if (observed.sha256 !== file.sha256 || observed.byteLength !== file.byteLength) return null;
    }
    return { ...value, outputRoot: root, cacheHit: true };
  } catch { return null; }
}

function inputBasis(frame: EpisodeFrame): Vec3 {
  const value = frame.camera.controlForwardWorldXYZ;
  if (!value || value.length !== 3 || value.some(number => !Number.isFinite(number))) throw new Error('EPISODE_CONTROL_BASIS_MISSING');
  return value;
}
function movementForCapture(capabilities: EpisodeCapabilities,session:EpisodeCaptureSession): RouteMovement {
  if (!capabilities.movement) throw new Error('EPISODE_CONTROLLED_MOVEMENT_UNAVAILABLE');
  const movement = capabilities.movement;
  if (movement.kind !== 'ground' && !(movement.episodeInput==='custom'&&session.routeInput) && !capabilities.humanoid && !(movement.movementId==='arborist.ground-with-steps'&&session.customMovementAdapterId===ARBORIST_CAPTURE_ADAPTER)) throw new Error('EPISODE_MOVEMENT_UNSUPPORTED: a custom movement needs its declared capture controller');
  if (!(movement.walkSpeedMetersPerSecond > 0) || !(movement.runSpeedMetersPerSecond > 0)) throw new Error('EPISODE_CONTROLLED_MOVEMENT_SPEED_UNAVAILABLE');
  return movement as RouteMovement;
}
function safeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { code: /^[A-Z][A-Z0-9_]+/.exec(message)?.[0] ?? 'EPISODE_CAPTURE_FAILED', message: message.slice(0, 6000) };
}

async function captureSegment(options: CaptureSegmentsOptions, session: EpisodeCaptureSession, capabilities: EpisodeCapabilities,
  segment: EpisodeSegmentPlan, root: string, recipeHash: string): Promise<SegmentCaptureResult> {
  await mkdir(root, { recursive: true });
  const trace: { frameIndex: number; timeSeconds: number; snapshot: WorldSnapshot; camera: EpisodeFrame['camera']; decision: RouteDecision }[] = [];
  const evidenceFrames: { frameIndex: number; imageDataUrl: string }[] = [];
  const artifacts: CaptureArtifact[] = [];
  let encoder: RenderedFrameEncoder | undefined, frameCount = 0, finishedAt: number | undefined;
  let initialTick = 0, terminalSnapshot: WorldSnapshot | undefined, initialSnapshot: WorldSnapshot | undefined;
  let travelledMeters = 0, lastPosition: Vec3 | undefined;
  let actions: EpisodeActionController | undefined;
  let failure: ReturnType<typeof safeFailure> | undefined, media: Awaited<ReturnType<typeof inspectRenderedVideo>> | undefined;
  const initialErrorCount = session.errors.length;
  try {
    const probe = await session.probeStart(segment.start);
    await atomicJson(path.join(root, 'start-probe.json'), probe);
    artifacts.push(await artifact(root, 'start-probe.json'));
    if (!probe.isValid) throw new Error(`EPISODE_START_INVALID: ${JSON.stringify(probe.diagnostics)}`);
    initialSnapshot = await session.prepareSegment(segment.start, { widthPixels: PROFILE.widthPixels, heightPixels: PROFILE.heightPixels });
    capabilities=await session.capabilities();
    initialTick = initialSnapshot.simulationTick;
    const opening = await session.frame('image/png');
    await writeFile(path.join(root, 'first-frame.png'), imageBytes(opening.imageDataUrl, 'image/png'));
    const controller = new PlayerCaptureController(segment, movementForCapture(capabilities,session), capabilities.camera.mode, start => session.probeStart(start),capabilities.movement.episodeInput==='custom'?request=>session.routeInput!(request):undefined);
    actions = new EpisodeActionController(segment, session, initialTick, capabilities.fixedTimeStepSeconds,capabilities.movement.episodeInput==='custom'?request=>session.routeInput!(request):undefined);
    encoder = (options.encoderFactory ?? createRenderedFrameEncoder)({ outputPath: path.join(root, 'video.mp4'), frameRate: PROFILE.captureFps, frameCount: PROFILE.captureFrameCount });
    for (let index = 0; index < PROFILE.captureFrameCount; index += 1) {
      const frame = await session.frame('image/jpeg');
      const expectedTick = initialTick + frameSimulationTick(index, capabilities.fixedTimeStepSeconds);
      if (frame.snapshot.simulationTick !== expectedTick) throw new Error(`EPISODE_TICK_DRIFT: expected ${expectedTick}, actual ${frame.snapshot.simulationTick}`);
      if (frame.snapshot.errors.length) throw new Error(`EPISODE_RUNTIME_ERROR: ${JSON.stringify(frame.snapshot.errors)}`);
      if (session.errors.length > initialErrorCount) throw new Error(`EPISODE_BROWSER_ERROR: ${session.errors.slice(initialErrorCount).join('\n')}`);
      const elapsedSeconds = index / PROFILE.captureFps;
      const releasedWaypoint = actions.takeReleasedWaypoint();
      if (releasedWaypoint !== undefined) controller.completeHeldWaypoint(releasedWaypoint);
      controller.holdWaypoint(actions.pendingTrigger);
      let decision: RouteDecision;
      if (actions.isActive) {
        controller.pause(elapsedSeconds);
        const previous = trace.at(-1)!.decision;
        decision = { ...previous, mode: 'action', input: {}, positionWorldMetersXYZ: frame.snapshot.entities.find(e => e.id === frame.snapshot.controlledEntityId)!.positionWorldMetersXYZ };
      } else decision = await controller.step(frame.snapshot, inputBasis(frame), elapsedSeconds);
      decision = await actions.step(frame.snapshot, inputBasis(frame), decision);
      trace.push({ frameIndex: index, timeSeconds: elapsedSeconds, snapshot: frame.snapshot, camera: frame.camera, decision });
      if (index % 12 === 0) {
        evidenceFrames.push({ frameIndex: index, imageDataUrl: frame.imageDataUrl });
        if (evidenceFrames.length > 8) evidenceFrames.shift();
      }
      if (lastPosition) travelledMeters += Math.hypot(...decision.positionWorldMetersXYZ.map((value, axis) => value - lastPosition![axis]!) as [number, number, number]);
      lastPosition = decision.positionWorldMetersXYZ;
      if (decision.mode === 'failed') throw new Error(`${decision.diagnostic!.code}: ${decision.diagnostic!.message}`);
      if (decision.mode === 'finished') {
        finishedAt ??= elapsedSeconds;
        if (!actions.hasGoals && elapsedSeconds - finishedAt > 3) throw new Error('EPISODE_ROUTE_TOO_SHORT: the requested route ends more than three seconds before capture ends');
      }
      await encoder.write(imageBytes(frame.imageDataUrl, 'image/jpeg')); frameCount += 1;
      const nextTick = initialTick + frameSimulationTick(index + 1, capabilities.fixedTimeStepSeconds);
      if (actions.hasGoals) {
        for (let tick = expectedTick; tick < nextTick; tick++) {
          const tickInput = tick === expectedTick ? decision.input : { ...decision.input, jumpPressed: false, interactPressed: false,
            ...(decision.input.humanoid ? { humanoid: { ...decision.input.humanoid, jump: false, actions: {} } } : {}) };
          terminalSnapshot = await session.advance(tickInput, 1);
          await actions.observe(terminalSnapshot);
        }
      } else terminalSnapshot = await session.advance(decision.input, nextTick - expectedTick);
      if (index % 120 === 0 || index === PROFILE.captureFrameCount - 1) await options.onProgress?.({ segmentId: segment.id, frameCount, totalFrameCount: PROFILE.captureFrameCount, status: 'recording' });
    }
    if (terminalSnapshot?.errors.length) throw new Error(`EPISODE_RUNTIME_ERROR: ${JSON.stringify(terminalSnapshot.errors)}`);
    actions.finish(terminalSnapshot, false); actions.assertComplete();

    await encoder.finish(); encoder = undefined;
    media = await (options.inspectVideo ?? inspectRenderedVideo)(path.join(root, 'video.mp4'));
    if (media.widthPixels !== PROFILE.widthPixels || media.heightPixels !== PROFILE.heightPixels || media.frameCount !== PROFILE.captureFrameCount || media.frameRate !== '24/1' || Math.abs(media.durationSeconds - PROFILE.segmentSeconds) > 0.001 || media.hasAudio) throw new Error(`EPISODE_VIDEO_CONTRACT_FAILED: ${JSON.stringify(media)}`);
    artifacts.push(await artifact(root, 'video.mp4'), await artifact(root, 'first-frame.png'));
  } catch (error) {
    failure = safeFailure(error);
    await encoder?.abort(); encoder = undefined;
    try {
      const frame = await session.frame('image/png');
      await writeFile(path.join(root, 'failure.png'), imageBytes(frame.imageDataUrl, 'image/png'));
      terminalSnapshot = frame.snapshot; artifacts.push(await artifact(root, 'failure.png'));
    } catch { /* Preserve the original failure even if the runtime is no longer usable. */ }
    for (const entry of evidenceFrames) {
      const relative = `failure-window/frame-${String(entry.frameIndex).padStart(4, '0')}.jpg`;
      await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      await writeFile(path.join(root, relative), imageBytes(entry.imageDataUrl, 'image/jpeg'));
      artifacts.push(await artifact(root, relative));
    }
  } finally {
    try { await session.release(); }
    catch (error) { failure ??= safeFailure(new Error(`EPISODE_RELEASE_FAILED: ${String(error)}`)); }
  }
  actions?.finish(terminalSnapshot, !!failure);
  const status = failure ? 'failed' : 'completed';
  const actionTimeline = actions?.timeline ?? (segment.actionGoals ?? []).map(goal => ({ goalId: goal.id, intent: goal.intent, targetId: goal.targetId ?? null, result: 'missing', diagnostic: 'Capture could not initialize.' }));
  await atomicJson(path.join(root, 'action-timeline.json'), { kind: 'three-episode-action-timeline', schemaVersion: 1, simulationTickRate: PROFILE.simulationTickRate, captureFps: PROFILE.captureFps, initialTick, actionTimeline });
  await atomicJson(path.join(root, 'trace.json'), { kind: 'three-episode-trace', schemaVersion: 2,
    worldBuildHash: options.plan.worldBuildHash, recipeHash, segment, profile: PROFILE,
    controllerVersion: ROUTE_CONTROLLER_VERSION, playerCaptureVersion: PLAYER_CAPTURE_VERSION, actionCaptureVersion: ACTION_CAPTURE_VERSION, actionTimeline, initialSnapshot, terminalSnapshot, frames: trace });
  await atomicJson(path.join(root, 'health.json'), { kind: 'three-episode-capture-health', schemaVersion: 1,
    status, frameCount, capturedDurationSeconds: frameCount / PROFILE.captureFps,
    simulationSeconds: terminalSnapshot ? (terminalSnapshot.simulationTick - initialTick) * capabilities.fixedTimeStepSeconds : 0,
    travelledMeters, actionGoals: actionTimeline.map(entry => ({ goalId: entry.goalId, result: entry.result })), playerBehavior: summarizePlayerBehavior(trace), advisoryDiagnostics:playerBehaviorFeedback(trace,capabilities,actions?.hasGoals).diagnostics, playerCaptureVersion: PLAYER_CAPTURE_VERSION, routeFinishedAtSeconds: finishedAt ?? null, failure: failure ?? null,
    lastDecision: trace.at(-1)?.decision ?? null, browserErrors: session.errors.slice(initialErrorCount), media: media ?? null,
    captureMode: 'deterministic-fixed-step-real-rendered-frames', paddingOrRepeatedFramesAdded: false,
    note: 'Route execution evidence covers only these requested segments; it is not a claim of whole-world connectivity or assistant content approval.' });
  artifacts.push(await artifact(root, 'trace.json'), await artifact(root, 'health.json'), await artifact(root, 'action-timeline.json'));
  const result: SegmentCaptureResult = { kind: 'three-episode-segment-capture', schemaVersion: 1,
    segmentId: segment.id, status, cacheHit: false, recipeHash, worldBuildHash: options.plan.worldBuildHash,
    ...(options.runtimeHash ? { runtimeHash: options.runtimeHash } : {}), outputRoot: root, frameCount,
    durationSeconds: frameCount / PROFILE.captureFps, artifacts, ...(failure ? { failure } : {}) };
  await atomicJson(path.join(root, 'segment-result.json'), result);
  await options.onProgress?.({ segmentId: segment.id, frameCount, totalFrameCount: PROFILE.captureFrameCount, status });
  return result;
}

export async function runCaptureSegments(options: CaptureSegmentsOptions): Promise<CaptureSummary> {
  const plan = validateEpisodePlan(options.plan, { worldBuildHash: options.plan.worldBuildHash });
  if (options.segmentIds?.some(id => !plan.segments.some(segment => segment.id === id))) throw new Error('EPISODE_CAPTURE_SEGMENT_UNKNOWN');
  const playableFilesHash = await playableIdentity(options.playableRoot);
  const segments = plan.segments.filter(segment => !options.segmentIds || options.segmentIds.includes(segment.id));
  if (!segments.length) throw new Error('EPISODE_CAPTURE_SEGMENTS_EMPTY');
  await mkdir(options.outputRoot, { recursive: true });
  const results: SegmentCaptureResult[] = [];
  let session: EpisodeCaptureSession | undefined, capabilities: EpisodeCapabilities | undefined;
  try {
    for (const segment of segments) {
      const recipeHash = canonicalHash({ segment, worldBuildHash: plan.worldBuildHash, runtimeHash: options.runtimeHash ?? null, playableFilesHash, profile: PROFILE, controllerVersion: ROUTE_CONTROLLER_VERSION, playerCaptureVersion: PLAYER_CAPTURE_VERSION, actionCaptureVersion: ACTION_CAPTURE_VERSION });
      const root = path.join(options.outputRoot, 'segments', segment.id, recipeHash);
      const cached = await readCaptureCache(root, recipeHash);
      if (cached) { results.push(cached); await options.onProgress?.({ segmentId: segment.id, frameCount: cached.frameCount, totalFrameCount: PROFILE.captureFrameCount, status: 'cached' }); continue; }
      if (!session) {
        session = await (options.openBrowser ?? openEpisodeBrowser)({ ...options.browserOptions, playableRoot: options.playableRoot, widthPixels: PROFILE.widthPixels, heightPixels: PROFILE.heightPixels });
        capabilities = await session.capabilities(); frameSimulationTick(0, capabilities.fixedTimeStepSeconds);
      }
      results.push(await captureSegment(options, session, capabilities!, segment, root, recipeHash));
      await atomicJson(path.join(options.outputRoot, 'capture-progress.json'), { worldBuildHash: plan.worldBuildHash, playableFilesHash, segments: results });
    }
  } finally { await session?.close(); }
  const summary: CaptureSummary = { kind: 'three-episode-capture-summary', schemaVersion: 1,
    status: results.every(result => result.status === 'completed') ? 'completed' : results.some(result => result.status === 'completed') ? 'partial' : 'failed',
    worldBuildHash: plan.worldBuildHash, playerCaptureVersion: PLAYER_CAPTURE_VERSION, playableFilesHash, segments: results };
  await atomicJson(path.join(options.outputRoot, 'capture-summary.json'), summary);
  return summary;
}

/** Closes the typed recording result into the visual pipeline's neutral input.
 * Expected source identity is only compared; it never supplies missing capture
 * provenance. Every segment and media file is checked against its disk receipt. */
export async function normalizeCaptureForVisuals(summary: CaptureSummary, expected: { readonly worldBuildHash: string; readonly runtimeHash: string }) {
  if (summary.kind !== 'three-episode-capture-summary' || summary.status !== 'completed' || summary.worldBuildHash !== expected.worldBuildHash || summary.segments.length !== 6 || summary.segments.some((segment, index) => segment.segmentId !== SEGMENT_IDS[index])) throw new Error('EPISODE_VISUAL_CAPTURE_CLOSURE_INVALID');
  const segments = [];
  let observedRuntimeHash: string | undefined;
  for (const segment of summary.segments) {
    if (segment.status !== 'completed' || segment.worldBuildHash !== summary.worldBuildHash || segment.runtimeHash !== expected.runtimeHash) throw new Error('EPISODE_VISUAL_CAPTURE_PROVENANCE_MISMATCH');
    const receipt = await readCaptureCache(segment.outputRoot, segment.recipeHash);
    if (!receipt || receipt.segmentId !== segment.segmentId || receipt.worldBuildHash !== segment.worldBuildHash || receipt.runtimeHash !== segment.runtimeHash) throw new Error('EPISODE_VISUAL_CAPTURE_RECEIPT_INVALID');
    observedRuntimeHash = receipt.runtimeHash;
    const file = (name: string) => {
      const entry = receipt.artifacts.find(item => item.path === name);
      if (!entry) throw new Error(`EPISODE_VISUAL_CAPTURE_FILE_MISSING: ${name}`);
      return { ...entry, path: path.resolve(receipt.outputRoot, entry.path) };
    };
    const actionEvidence = file('action-timeline.json');
    const timeline = JSON.parse(await readFile(actionEvidence.path, 'utf8'));
    if (timeline.kind !== 'three-episode-action-timeline' || timeline.schemaVersion !== 1 || !Array.isArray(timeline.actionTimeline) || timeline.actionTimeline.some((entry: {result: string}) => entry.result !== 'succeeded')) throw new Error('EPISODE_VISUAL_ACTION_EVIDENCE_INVALID');
    segments.push({ id: receipt.segmentId, status: 'completed' as const, worldBuildHash: receipt.worldBuildHash,
      runtimeHash: receipt.runtimeHash!, recipeHash: receipt.recipeHash, video: file('video.mp4'), firstFrame: file('first-frame.png'),
      trace: file('trace.json'), health: file('health.json'), actionEvidence, actionTimeline: timeline.actionTimeline,
      frameCount: receipt.frameCount, durationSeconds: receipt.durationSeconds });
  }
  if (!observedRuntimeHash) throw new Error('EPISODE_VISUAL_CAPTURE_RUNTIME_MISSING');
  return { kind: 'three-episode-visual-capture-input' as const, schemaVersion: 1 as const, worldBuildHash: summary.worldBuildHash, runtimeHash: observedRuntimeHash, playableFilesHash: summary.playableFilesHash, segments };
}
