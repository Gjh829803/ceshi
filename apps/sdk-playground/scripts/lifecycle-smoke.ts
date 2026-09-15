import assert from 'node:assert/strict';
import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';

const browser = await launchChromiumWithSystemFallback();
const page = await browser.newPage();
const browserErrors: string[] = [];
page.on('pageerror', error => browserErrors.push(error.message));
await page.addInitScript(`
  window.__registeredToolSignals = [];
  window.__registeredTools = new Map();
  Object.defineProperty(document, 'modelContext', {value: {
    registerTool(tool, options) { window.__registeredToolSignals.push(options.signal); window.__registeredTools.set(tool.name, tool); }
  }});
`);
try {
  await page.goto(`${process.argv[2] ?? 'http://127.0.0.1:5191'}/#/scenes/npc-workshop`);
  await page.waitForFunction(() => (window as any).playground?.getState().npc.ready, {}, {timeout: 60000});
  const cameraTool=await page.evaluate(()=>{
    const tool=(window as any).__registeredTools.get('inspect_camera');
    if(!tool)throw Error('inspect_camera was not registered');
    const observer=window.__WORLDKIT_EVAL__!;
    const before=JSON.stringify([observer.snapshot!(),observer.inspectCamera!()]);
    const first=tool.execute({}),second=tool.execute({});
    return {schema:tool.inputSchema,annotations:tool.annotations,source:first.source,
      repeated:JSON.stringify(first)===JSON.stringify(second),unchanged:before===JSON.stringify([observer.snapshot!(),observer.inspectCamera!()])};
  });
  assert.deepEqual(cameraTool.schema,{type:'object',properties:{},additionalProperties:false});
  assert.equal(cameraTool.annotations.readOnlyHint,true);assert.equal(cameraTool.source,'committed-camera');
  assert(cameraTool.repeated&&cameraTool.unchanged,'camera inspection must not alter the world or enable sampling');
  const debugTools=await page.evaluate(async()=>{
    const tools=(window as any).__registeredTools as Map<string,{annotations:{readOnlyHint:boolean};execute:(input:unknown)=>any}>;
    const names=['inspect_debug_controls','set_debug_simulation','step_debug_simulation','set_debug_character_pose','set_debug_camera','execute_debug_vehicle_action'];
    for(const name of names)if(!tools.has(name))throw Error(`${name} was not registered`);
    const observer=window.__WORLDKIT_EVAL__!,playground=(window as any).playground;
    const initial=observer.snapshot!();
    if(!initial.controlledEntityId||initial.humanoid?.character.instanceId!==initial.controlledEntityId||initial.humanoid.mountedInstanceId)
      throw Error('Debug smoke requires the current on-foot character; it must not take over an NPC.');
    const paused=await tools.get('set_debug_simulation')!.execute({paused:true});
    // Method syntax avoids esbuild keepNames helpers outside Playwright's serialized closure.
    const evidence={read(){return JSON.stringify([observer.snapshot!(),observer.inspectCamera!(),playground.getState().inputState,playground.getState().paused]);}};
    const beforeInspection=evidence.read();
    const first=tools.get('inspect_debug_controls')!.execute({}),second=tools.get('inspect_debug_controls')!.execute({});
    const readonly=beforeInspection===evidence.read()&&JSON.stringify(first)===JSON.stringify(second);
    const beforeStep=observer.snapshot!();
    const stepped=await tools.get('step_debug_simulation')!.execute({frames:3,input:{}});
    const afterStep=observer.snapshot!();
    const beforeRejection=evidence.read();
    const rejectedFrames=await tools.get('step_debug_simulation')!.execute({frames:0});
    const rejectedInput=await tools.get('step_debug_simulation')!.execute({frames:1,input:{moveXRatio:2}});
    return {
      annotations:names.map(name=>({name,...tools.get(name)!.annotations})),
      pauseStatus:paused.status,paused:first.paused,isRunning:first.isRunning,readonly,
      stepStatus:stepped.status,advancedTicks:stepped.result?.advancedTicks,tickDifference:afterStep.simulationTick-beforeStep.simulationTick,
      remainsPaused:playground.getState().paused&&!afterStep.isRunning,
      sameControlledCharacter:initial.controlledEntityId===afterStep.controlledEntityId,
      rejected:[rejectedFrames,rejectedInput].map(value=>({status:value.status,code:value.code})),
      rejectionUnchanged:beforeRejection===evidence.read(),errors:afterStep.errors,
    };
  });
  for(const tool of debugTools.annotations)assert.equal(tool.readOnlyHint,tool.name==='inspect_debug_controls',`${tool.name} must declare its actual effect`);
  assert.equal(debugTools.pauseStatus,'applied');assert(debugTools.paused&&!debugTools.isRunning);
  assert(debugTools.readonly,'debug inspection must be repeatable and leave the paused world untouched');
  assert.equal(debugTools.stepStatus,'applied');assert.equal(debugTools.advancedTicks,3);assert.equal(debugTools.tickDifference,3);
  assert(debugTools.remainsPaused&&debugTools.sameControlledCharacter,'debug stepping must leave the same character paused');
  assert.deepEqual(debugTools.rejected,Array.from({length:2},()=>({status:'rejected',code:'DEBUG_INPUT_INVALID'})));
  assert(debugTools.rejectionUnchanged,'invalid debug input must not change the world, camera, pause state or pending input');
  assert.deepEqual(debugTools.errors,[]);
  const result = await page.evaluate(() => {
    const errors: string[] = [];
    window.addEventListener('error', event => {errors.push(event.message); event.preventDefault();});
    // Navigation/reload may deliver visibility and focus events after pagehide cleanup.
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    window.dispatchEvent(new Event('blur'));
    Object.defineProperty(document, 'hidden', {configurable: true, value: true});
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('focusin'));
    window.dispatchEvent(new KeyboardEvent('keydown', {code: 'Escape'}));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return {errors, toolCount: (window as any).__registeredToolSignals.length, toolsAborted: (window as any).__registeredToolSignals.every((signal: AbortSignal) => signal.aborted)};
  });
  assert.deepEqual(result.errors, [], 'retired page callbacks must not access the disposed runtime');
  assert(result.toolCount > 0 && result.toolsAborted, 'page disposal must revoke its tool registrations');
  await page.reload();
  await page.waitForFunction(() => (window as any).playground?.getState().npc.ready, {}, {timeout: 60000});
  await page.getByRole('button', {name: '操控玩家', exact: true}).click();
  const before = await page.evaluate(() => (window as any).playground.getState().position);
  await page.keyboard.down('w');
  await page.waitForFunction(before => {
    const position = (window as any).playground.getState().position;
    return Math.hypot(position[0] - before[0], position[2] - before[2]) > .5;
  }, before);
  await page.keyboard.up('w');
  assert.deepEqual(browserErrors, []);

  await page.goto(`${process.argv[2] ?? 'http://127.0.0.1:5191'}/#/scenes/campus`);
  await page.waitForFunction(() => (window as any).playground?.getState().ready, {}, {timeout: 60000});
  const demoTakeover=await page.evaluate(async()=>{
    // Reacquire this document's registrations after navigation.
    const tools=(window as any).__registeredTools as Map<string,{execute:(input:unknown)=>any}>;
    const playground=(window as any).playground,observer=window.__WORLDKIT_EVAL__!;
    // campus-vault is the maintained forward/traversal demonstration in workshop.ts.
    const prepared=tools.get('prepare_character_trial')!.execute({mapId:'campus',trialId:'campus-vault',demo:true});
    const pause=await tools.get('set_debug_simulation')!.execute({paused:true});
    const demoPaused=playground.humanoidState().自动演示;
    const before=observer.snapshot!(),beforeOrbit=observer.inspectCamera!().intent!;
    const actorBefore=before.entities.find(entity=>entity.id===before.controlledEntityId)!;
    const stepped=await tools.get('step_debug_simulation')!.execute({frames:3,input:{}});
    const after=observer.snapshot!(),afterOrbit=observer.inspectCamera!().intent!;
    const actorAfter=after.entities.find(entity=>entity.id===after.controlledEntityId)!;
    const state=playground.getState();
    return {demoStarted:prepared.自动演示,demoPaused,demoAfter:playground.humanoidState().自动演示,
      pauseStatus:pause.status,stepStatus:stepped.status,advancedTicks:after.simulationTick-before.simulationTick,
      input:state.inputState,paused:state.paused,isRunning:after.isRunning,
      horizontalMovementMeters:Math.hypot(actorAfter.positionWorldMetersXYZ[0]-actorBefore.positionWorldMetersXYZ[0],actorAfter.positionWorldMetersXYZ[2]-actorBefore.positionWorldMetersXYZ[2]),
      beforeOrbit:[beforeOrbit.yawRadians,beforeOrbit.pitchRadians,beforeOrbit.distanceMeters],
      afterOrbit:[afterOrbit.yawRadians,afterOrbit.pitchRadians,afterOrbit.distanceMeters],errors:after.errors};
  });
  assert.equal(demoTakeover.demoStarted,'园区低栏翻越');assert.equal(demoTakeover.demoPaused,demoTakeover.demoStarted);
  assert.equal(demoTakeover.pauseStatus,'applied');assert.equal(demoTakeover.stepStatus,'applied');
  assert.equal(demoTakeover.demoAfter,null,'explicit debug stepping must cancel the local demonstration');
  assert.equal(demoTakeover.advancedTicks,3);assert(demoTakeover.paused&&!demoTakeover.isRunning);
  assert.equal(demoTakeover.input.override,null);assert.equal(demoTakeover.input.lastApplied?.source,'world-input');
  assert(demoTakeover.input.lastApplied.input.forward===0&&demoTakeover.input.lastApplied.input.steer===0,'neutral input must contain no forward or steering motion');
  assert(demoTakeover.horizontalMovementMeters<1e-4,'neutral debug ticks must not consume the demonstration movement');
  assert(demoTakeover.afterOrbit.every((value,index)=>value===demoTakeover.beforeOrbit[index]),'neutral debug ticks must preserve camera orbit intent');
  assert.deepEqual(demoTakeover.errors,[]);assert.deepEqual(browserErrors,[]);

  console.log('Playground read-only inspection, debug pause/step/rejection and demonstration takeover, pagehide cleanup, all tool revocations and real keyboard input after reload: passed.');
} finally { await browser.close(); }
