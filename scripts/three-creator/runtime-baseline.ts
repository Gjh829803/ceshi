import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {ThreeCreatorTools} from './tools.js';
import {openEpisodeBrowser} from '../three-episode/browser.js';
import type {WorldInput, Vec3} from '@worldkit/three';

// Maintainer-only baseline. No new runtime owner or production observation API.
// The temporary example exposes its world solely for synchronous timing wrappers.
const output = path.resolve(process.argv[2] ?? '.codex-tmp/r0-baseline');
const example = process.argv[3] ?? 'character-actions';
const recordActions = process.argv.includes('--record-actions');
const skipPerformance = process.argv.includes('--skip-performance');
const skipCreator = process.argv.includes('--skip-creator');
const actorCount=Number(process.argv.find(value=>value.startsWith('--actors='))?.split('=')[1]??1);
if(![1,3,10].includes(actorCount)||(actorCount>1&&example!=='custom-vehicle'))throw new Error('BASELINE_ACTOR_COUNT_INVALID');
if (process.env.WORLDKIT_CAPTURE_GPU === '1') throw new Error('BASELINE_REQUIRES_SWIFTSHADER: unset WORLDKIT_CAPTURE_GPU');
if (!['character-actions', 'custom-vehicle'].includes(example)) throw new Error('Unsupported baseline example');
await mkdir(output, {recursive: false});
const workspace = path.join(output, 'workspace');
await cp(path.resolve('examples/three-creator', example), workspace, {recursive: true,
  filter: source => !source.includes('.three-creator')});
let mainSource=await readFile(path.join(workspace,'main.ts'),'utf8');
if(actorCount>1)mainSource=mainSource.replace('await world.start();',`for(let n=1;n<${actorCount};n++){const actor=await world.humanoid!.createCharacter();actor.root.position.set(10+(n%3)*3,.04,8+Math.floor(n/3)*3);world.addCharacter({id:'benchmark-actor-'+n,humanoid:actor});}\nawait world.start();`);
await writeFile(path.join(workspace,'main.ts'),mainSource+'\n(window as any).__BASELINE_WORLD__ = world;\n');
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const report: Record<string, unknown> = {
  kind: 'local-runtime-baseline', schemaVersion: 1, example, actorCount, startedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  sourceDiffSha256: hash(execFileSync('git', ['diff', 'HEAD'])),
  harnessSha256: hash(await readFile(new URL(import.meta.url))),
  environment: {platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model,
    node: process.version, viewport: [1280, 720], deviceScaleFactor: 1, rendering: 'Episode SwiftShader'},
  limitations: ['render CPU measures submission, not GPU execution', 'JS heap is not total process/GPU memory',
    'no historical multi-actor baseline', 'automated behavior is not human visual acceptance'],
};
const save = () => writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
const service = new ThreeCreatorTools(workspace, 'three-sdk');
try {
  const compiled = await service.validate(); report.compiled = compiled; await save();
  console.log(JSON.stringify({stage: 'compiled', runtimeHash: compiled.runtimeHash}));
  if (!skipCreator) {
    report.creatorInitial = await service.inspect({sections: ['snapshot']});
    const playtest = await service.playtest('r0-baseline'); report.creatorPlaytest = playtest; await save();
    assert.equal(playtest.status, 'passed', 'Creator recording failed; see report');
  }
  await service.close();
  const session = await openEpisodeBrowser({playableRoot: compiled.playableRoot});
  try {
    report.browserVersion = session.page.context().browser()!.version();
    report.rendererBackend = await session.page.evaluate(() => {
      const gl = (window as any).__WORLDKIT_EVAL__.renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER),
        unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null};
    });
    const neutral: WorldInput = {humanoid: {forward: 0, steer: 0, roll: 0, lift: 0, pitch: 0, strafe: 0,
      boost: false, brake: false, slow: false, jump: false}};
    const records: unknown[] = []; report.episode = records;
    const capture = async (name: string) => {
      const frame = await session.frame('image/png');
      assert.deepEqual(frame.snapshot.errors, [], `Runtime errors at ${name}`);
      const bytes = Buffer.from(frame.imageDataUrl.split(',')[1]!, 'base64');
      await writeFile(path.join(output, `${name}.png`), bytes);
      records.push({name, snapshot: frame.snapshot, imageSha256: hash(bytes), captureSurface: frame.captureSurface});
      return frame.snapshot;
    };
    const prepare = async (position: Vec3, yaw = 0) => {
      const start = {positionWorldMetersXYZ: position, facingYawRadians: yaw};
      const probe = await session.probeStart(start); records.push({start, probe});
      assert(probe.isValid, JSON.stringify(probe));
      await session.prepareSegment(start, {widthPixels: 1280, heightPixels: 720});
      await session.advance(neutral, 60);
    };
    const checks: Record<string, unknown>[] = []; report.checks = checks;
    const check = async (name: string, run: () => Promise<void>) => {
      try { await run(); checks.push({name, status: 'passed'}); }
      catch (error) { checks.push({name, status: 'failed', error: String(error)}); process.exitCode = 1; }
      console.log(JSON.stringify(checks.at(-1))); await save();
    };
    const action = async (name: 'pickup' | 'putDown' | 'sit' | 'standUp', targetId?: string) => {
      const receipt = await session.execute({type: 'humanoid.perform-action',
        request: {requestId: `r0-${name}`, action: name, ...(targetId ? {targetId} : {})}});
      records.push({action: name, receipt});
      // putDown is currently synchronous and intentionally returns applied.
      assert.equal(receipt.status, name === 'putDown' ? 'applied' : 'accepted', JSON.stringify(receipt));
      if (recordActions) {
        const frames = path.join(output, `${name}-frames`); await mkdir(frames);
        const timeline = [];
        for (let index = 0; index < 60; index++) {
          await session.advance(neutral, 3);
          const frame = await session.frame('image/png');
          const bytes = Buffer.from(frame.imageDataUrl.split(',')[1]!, 'base64');
          await writeFile(path.join(frames, `${String(index).padStart(4, '0')}.png`), bytes);
          timeline.push({index, simulationTick: frame.snapshot.simulationTick, character: frame.snapshot.humanoid?.character,
            sha256: hash(bytes)});
        }
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '20', '-i', path.join(frames, '%04d.png'),
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(output, `${name}.mp4`)]);
        records.push({action: name, timeline, videoSha256: hash(await readFile(path.join(output, `${name}.mp4`)))});
      } else await session.advance(neutral, 180);
      if (receipt.status === 'accepted') {
        const operation = await session.operation(receipt.operationId); records.push({action: name, operation});
        assert.equal(operation.status, 'succeeded', JSON.stringify(operation));
      }
      const state = await capture(name);
      return state;
    };
    if (example === 'character-actions') {
      await check('move-jump-land-view', async () => {
        await prepare([3.5, .04, 0]);
        const before = await capture('move-before');
        const walking = await session.advance({humanoid: {...neutral.humanoid!, forward: 1}}, 60);
        const from = before.entities.find(e => e.id === 'person')!.positionWorldMetersXYZ;
        const to = walking.entities.find(e => e.id === 'person')!.positionWorldMetersXYZ;
        assert(Math.hypot(...to.map((v, i) => v - from[i]!)) > .5);
        await session.advance({humanoid: {...neutral.humanoid!, jump: true}}, 1);
        await session.advance(neutral, 15); const jumped = await capture('jump');
        assert.equal(jumped.humanoid!.character.state, 'jump');
        assert(jumped.entities.find(e => e.id === 'person')!.positionWorldMetersXYZ[1] > from[1] + .4);
        await session.advance(neutral, 120); const landed = await capture('land');
        assert(!landed.humanoid!.character.swimming);
        assert.equal(landed.humanoid!.character.state, 'idle');
        assert(Math.abs(landed.entities.find(e => e.id === 'person')!.positionWorldMetersXYZ[1] - from[1]) < .05);
        assert.equal((await session.execute({type: 'camera.set-perspective', perspective: 'first-person'})).status, 'applied');
        await capture('first-person');
        assert.equal((await session.execute({type: 'camera.set-perspective', perspective: 'third-person'})).status, 'applied');
        await capture('third-person');
      });
      await check('pickup-persistent-hold-put-down', async () => {
        await prepare([-5, .02, -6], 0);
        const picked = await action('pickup', 'parcel'); assert.equal(picked?.humanoid?.character.carrying, 'parcel');
        await session.advance(neutral, 120); assert.equal((await capture('holding-after-completion')).humanoid?.character.carrying, 'parcel');
        const put = await action('putDown'); assert.equal(put?.humanoid?.character.carrying, null);
      });
      await check('sit-persistent-occupancy-stand', async () => {
        await prepare([1, .02, -6], 0);
        const sitting = await action('sit', 'chair'); assert.equal(sitting?.humanoid?.character.seated, 'chair');
        await session.advance(neutral, 120); assert.equal((await capture('seated-after-completion')).humanoid?.character.seated, 'chair');
        const standing = await action('standUp'); assert.equal(standing?.humanoid?.character.seated, null);
      });
    } else {
      await check('mount-drive-brake-exit', async () => {
        await prepare([1.7, .04, -.2]);
        const receipt = await session.execute({type: 'vehicle.enter', instanceId: 'custom-bike'}); records.push({receipt});
        assert.notEqual(receipt.status, 'rejected', JSON.stringify(receipt));
        await session.advance(neutral, 90); const mounted = await capture('mounted');
        assert.equal(mounted.humanoid?.mountedInstanceId, 'custom-bike');
        const from = mounted.entities.find(e => e.id === 'custom-bike')!.positionWorldMetersXYZ;
        await session.advance({humanoid: {...neutral.humanoid!, forward: 1}}, 120); const driving = await capture('driving');
        const vehicle = driving.entities.find(e => e.id === 'custom-bike')!;
        assert(Math.hypot(...vehicle.positionWorldMetersXYZ.map((v, i) => v - from[i]!)) > 1, 'Bike must physically travel');
        assert(Math.hypot(...vehicle.motion!.velocityWorldMetersPerSecondXYZ) > 1, 'Bike must accelerate');
        await session.advance({humanoid: {...neutral.humanoid!, brake: true}}, 240);
        const braked = await capture('braked');
        assert(Math.hypot(...braked.entities.find(e => e.id === 'custom-bike')!.motion!.velocityWorldMetersPerSecondXYZ) < .1, 'Bike must stop before exit');
        const exit = await session.execute({type: 'vehicle.exit'}); records.push({exit});
        assert.notEqual(exit.status, 'rejected', JSON.stringify(exit));
        await session.advance(neutral, 90); assert.equal((await capture('dismounted')).humanoid?.mountedInstanceId, null);
      });
    }
    if (!skipPerformance) {
    await prepare(example === 'character-actions' ? [3.5, .04, 0] : [1.7, .04, -.2]);
    // Warmup is outside samples. All timings execute in the page to omit transport.
    await session.advance(neutral, 300);
    // tsx keepNames emits __name calls inside serialized page functions.
    // Supply that no-op naming helper in this isolated test page only.
    await session.page.evaluate('globalThis.__name = (fn) => fn');
    report.performance = await session.page.evaluate(({neutral}) => {
      const w = (window as any).__BASELINE_WORLD__, engine = w.engine;
      const port = (window as any).__WORLDKIT_EVAL__.episode;
      const physics = w.humanoid.simulation.environment.world;
      const mixers=[w.humanoid.options.character.animation.sourceCharacter.mixer,...[...w.humanoid.actors.values()].map((binding:any)=>binding.animation.sourceCharacter.mixer)];
      const updates=mixers.map(mixer=>mixer.update);
      const fixed = engine.fixedStep, render = w.renderer.render, step = physics.step;
      let fixedSamples: number[] = [], renderSamples: number[] = [], mixerEvaluations = 0, physicsSteps = 0;
      engine.fixedStep = function (...args: any[]) {const t = performance.now(); try {return fixed.apply(this, args);} finally {fixedSamples.push(performance.now() - t);}};
      w.renderer.render = function (...args: any[]) {const t = performance.now(); try {return render.apply(this, args);} finally {renderSamples.push(performance.now() - t);}};
      mixers.forEach((mixer,index)=>{mixer.update=function(...args:any[]){mixerEvaluations++;return updates[index].apply(this,args);};});
      physics.step = function (...args: any[]) {physicsSteps++; return step.apply(this, args);};
      const summarize = (samples: number[]) => {const sorted = [...samples].sort((a,b) => a-b); return {count: sorted.length,
        p50Milliseconds: sorted[Math.ceil(sorted.length*.5)-1], p95Milliseconds: sorted[Math.ceil(sorted.length*.95)-1], samplesMilliseconds: samples};};
      const rounds = [];
      try {
        for(let round=0; round<3; round++) {
          fixedSamples = []; renderSamples = []; mixerEvaluations = 0; physicsSteps = 0;
          const start = w.snapshot().simulationTick;
          for(let frame=0; frame<600; frame++) {port.advance(neutral, 1); engine.render();}
          rounds.push({round, fromTick: start, toTick: w.snapshot().simulationTick, fixed: summarize(fixedSamples),
            render: summarize(renderSamples), mixerEvaluations, physicsSteps,
            bodyCount: physics.bodies.len(), colliderCount: physics.colliders.len(),
            jsHeapUsedBytes: (performance as any).memory?.usedJSHeapSize ?? null, rendererMemory: {...w.renderer.info.memory}});
        }
      } finally {engine.fixedStep = fixed; w.renderer.render = render; mixers.forEach((mixer,index)=>{mixer.update=updates[index];}); physics.step = step;}
      return {scenario: `stationary ${mixers.length} Source101 actors; fixed 60 Hz; 600 frames per round`, rounds};
    }, {neutral});
    }
    report.episodeErrors = [...session.errors]; await save();
    assert.deepEqual(session.errors, [], 'Episode browser errors');
  } finally {await session.close();}
} catch(error) {report.failure = String(error); process.exitCode = 1;}
finally {await service.close(); report.finishedAt = new Date().toISOString(); await save();}
console.log(JSON.stringify({output, failure: report.failure ?? null}));
