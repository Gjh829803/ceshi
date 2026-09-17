import {test,expect} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,cp,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';
import {startStreamHost} from '../src/server.js';

test('real encoded stream, custom UI actions, input, reconnect and epoch reset',async()=>{
  const output=await mkdtemp(path.join(os.tmpdir(),'world-stream-test-'));
  await promisify(execFile)('pnpm',['--filter','@worldkit/stream-web','exec','vite','build','--outDir',output,'--emptyOutDir'],{timeout:30000});
  const worldDirectory=await mkdtemp(path.join(os.tmpdir(),'world-stream-author-'));
  await cp('examples/three-creator/streaming-ui',worldDirectory,{recursive:true,filter:source=>!source.includes('.three-creator')});
  const sourceFile=path.join(worldDirectory,'scene.ts');
  await writeFile(sourceFile,(await readFile(sourceFile,'utf8')).replace('heal:()=>health.set(100)','heal:()=>world.reset()'));
  const host=await startStreamHost({worldsDirectory:worldDirectory,webRoot:output,port:0,width:640,height:360,fps:12,idleSessionTimeoutMs:5000});
  const browser=await launchChromiumWithSystemFallback({headless:true});
  try{
    const page=await browser.newPage();
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(() => {
      const Original=window.WebSocket;
      const sockets:WebSocket[]=[],inputs:string[]=[],inputSequences:number[]=[],receipts:{sequence:number;clientSequence:number;clientId:string}[]=[];
      Object.assign(window,{__testSockets:sockets,__testInputs:inputs,__testInputSequences:inputSequences,__testReceipts:receipts});
      window.WebSocket=class extends Original {
        constructor(url:string|URL,protocols?:string|string[]){super(url,protocols);sockets.push(this);this.addEventListener('message',event=>{if(typeof event.data==='string'){const m=JSON.parse(event.data);if(m.type==='input.receipt')receipts.push(m);}});}
        send(data:Parameters<WebSocket['send']>[0]){if(typeof data==='string'){const message=JSON.parse(data);if(String(message.type).startsWith('input.'))inputs.push(message.type);if(message.type==='input.state')inputSequences.push(message.input.sequence);}super.send(data);}
      };
    });
    // Hold the first create response to reload while the client only knows its
    // idempotency key. The server must not create a second producer on recovery.
    let firstCreate=true,releaseFirst!:()=>void;
    const heldResponse=new Promise<void>(resolve=>{releaseFirst=resolve;});
    await page.route('**/v1/sessions',async route=>{
      const hold=firstCreate;firstCreate=false;const response=await route.fetch();
      if(hold)await heldResponse;
      try{await route.fulfill({response});}catch(error){if(!hold)throw error;}
    });
    await page.goto(host.baseUrl);
    await page.getByLabel('视频分辨率').selectOption('640x360');
    await page.getByLabel('目标视频帧率').selectOption('12');
    await page.locator('[data-world-id]').click();
    await expect.poll(()=>host.sessions()[0]?.status,{timeout:45000}).toBe('running');
    const startingId=host.sessions()[0]!.id;
    await page.reload();releaseFirst();
    await page.waitForSelector('[data-status="playing"]',{timeout:45000});
    expect(await page.locator('[data-health-value]').textContent()).toContain('100');
    await expect.poll(()=>page.locator('[data-flow-node="media"]').getAttribute('data-state')).toBe('open');
    const id=host.sessions()[0]!.id;expect(id).toBe(startingId);expect(host.sessions()).toHaveLength(1);
    const metric=(label:string)=>page.locator('.metric').filter({has:page.getByText(label,{exact:true})}).locator('strong');
    await expect.poll(async()=>Number.parseFloat(await metric('源端实际采集').textContent()??''),{timeout:10000}).toBeGreaterThan(0);
    await expect.poll(async()=>Number.parseFloat(await metric('源端实际编码').textContent()??'')).toBeGreaterThan(0);
    expect(await metric('最近操作回执').textContent()).toContain('—');
    expect(await page.getByRole('button',{name:/近期事件/}).getAttribute('aria-expanded')).toBe('false');
    const layoutMetrics=async()=>{
      const surface=(await page.locator('[data-world-stream-player] [tabindex]').boundingBox())!;
      const health=(await page.locator('[data-world-ui-node="health"]').boundingBox())!;
      const controls=(await page.locator('[data-world-ui-node="controls"]').boundingBox())!;
      const scale=surface.width/1280;
      return {left:(health.x-surface.x)/scale,top:(health.y-surface.y)/scale,width:health.width/scale,bottom:(surface.y+surface.height-controls.y-controls.height)/scale,controlsWidth:controls.width/scale};
    };
    const checkLayout=async()=>{
      await expect.poll(async()=>Math.abs((await layoutMetrics()).bottom-28)).toBeLessThan(.2);
      const m=await layoutMetrics();expect(m.left).toBeCloseTo(28,0);expect(m.top).toBeCloseTo(28,0);expect(m.width).toBeCloseTo(346,0);expect(m.controlsWidth).toBeCloseTo(1224,0);
    };
    await checkLayout();
    await page.setViewportSize({width:900,height:900});await checkLayout();
    await page.setViewportSize({width:1280,height:900});await checkLayout();
    const state=async()=>await host.inspectSession(id) as {snapshot:{entities:{id:string;positionWorldMetersXYZ:[number,number,number];motion?:{velocityWorldMetersPerSecondXYZ:[number,number,number]}}[]};ui:{player:{health:number}}};
    const inputEdge=page.locator('[data-flow-edge="player-input"]');
    // Observe a real heartbeat sample: idle traffic must keep a static connection.
    await expect.poll(()=>page.locator('[data-flow-node="input"]').textContent()).toMatch(/[1-9]\d* 包\/s/);
    expect(await inputEdge.getAttribute('class')).toContain('edge-connected');
    expect(await inputEdge.getAttribute('data-active')).toBe('false');
    await page.getByRole('button',{name:'受到伤害 −20'}).click();
    await expect.poll(async()=>Number.parseFloat(await metric('UI 状态增量').textContent()??''),{interval:50}).toBeGreaterThan(0);
    await expect.poll(()=>inputEdge.getAttribute('data-active'),{interval:50}).toBe('true');
    await expect.poll(()=>inputEdge.getAttribute('data-active'),{timeout:4000}).toBe('false');
    await expect.poll(async()=>await page.locator('[data-health-value]').textContent()).toContain('80');
    expect((await state()).ui.player.health).toBe(80);
    await expect.poll(async()=>Number.parseFloat(await metric('回执有效样本').textContent()??'')).toBeGreaterThan(0);
    expect(Number.parseFloat(await metric('最近操作回执').textContent()??'')).toBeGreaterThanOrEqual(0);
    await page.reload();
    await page.waitForSelector('[data-status="playing"]',{timeout:15000});
    expect(host.sessions().map(s=>s.id)).toEqual([id]);
    expect(await page.locator('[data-health-value]').textContent()).toContain('80');
    // Host sequence remains session-wide after reload; echoed client sequence must
    // still match this new player's own request, not an unrelated receipt.
    await expect.poll(()=>page.evaluate(()=>{
      const w=window as unknown as {__testInputSequences:number[];__testReceipts:{sequence:number;clientSequence:number;clientId:string}[];__testSockets:WebSocket[]};
      const last=w.__testReceipts.at(-1),control=w.__testSockets.find(s=>new URL(s.url).pathname.endsWith('/control'));
      return !!last&&!!control&&last.sequence>last.clientSequence&&w.__testInputSequences.includes(last.clientSequence)&&last.clientId===new URL(control.url).searchParams.get('clientId');
    })).toBe(true);
    expect(await metric('最近操作回执').textContent()).toContain('—');
    await page.getByRole('button',{name:'受到伤害 −20'}).click();
    await expect.poll(async()=>await page.locator('[data-health-value]').textContent()).toContain('60');
    expect((await state()).ui.player.health).toBe(60);
    await page.getByRole('button',{name:'仅视频',exact:true}).click();
    expect(await page.locator('[data-ui-layer]').isVisible()).toBe(false);
    await expect.poll(()=>page.locator('[data-video-layer]').isVisible()).toBe(true);
    await expect.poll(()=>page.locator('[data-flow-node="ui"]').getAttribute('data-state')).toBe('paused');
    await page.getByRole('button',{name:'仅 UI',exact:true}).click();
    await expect.poll(()=>page.locator('[data-ui-layer]').isVisible()).toBe(true);
    expect(await page.locator('[data-video-layer]').isVisible()).toBe(false);
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {__testSockets:WebSocket[]}).__testSockets.filter(socket=>new URL(socket.url).pathname.endsWith('/media')&&socket.readyState===WebSocket.OPEN).length)).toBe(0);
    await expect.poll(()=>page.locator('[data-flow-node="media"]').getAttribute('data-state')).toBe('disabled');
    await expect.poll(async()=>Number.parseFloat(await metric('UI 时钟同步').textContent()??'')).toBeGreaterThan(0);
    await expect.poll(async()=>Number.parseFloat(await metric('源端实际编码').textContent()??'')).toBeGreaterThan(0);
    await page.getByRole('button',{name:'受到伤害 −20'}).click();
    await expect.poll(()=>page.locator('[data-health-value]').textContent()).toContain('40');
    expect((await state()).ui.player.health).toBe(40);
    await page.getByRole('button',{name:'视频 + UI',exact:true}).click();
    await page.waitForSelector('[data-status="playing"]',{timeout:15000});
    await expect.poll(()=>page.locator('[data-flow-node="media"]').getAttribute('data-state')).toBe('open');
    const epochBefore=host.sessions()[0]!.epoch;
    await page.getByLabel('视频分辨率').selectOption('854x480');
    await page.getByLabel('目标视频帧率').selectOption('24');
    await page.getByLabel('目标视频码率').selectOption('1000000');
    await page.getByRole('button',{name:'应用视频参数'}).click();
    await expect.poll(()=>page.locator('[data-video-layer]').getAttribute('width'),{timeout:15000}).toBe('854');
    expect(await page.locator('[data-video-layer]').getAttribute('height')).toBe('480');
    await checkLayout();
    await expect.poll(()=>page.getByText('当前 854×480 · 24 fps · 1.0 Mbps',{exact:false}).count()).toBe(1);
    expect(host.sessions()[0]!.epoch).toBe(epochBefore);
    expect(host.sessions()[0]!.id).toBe(id);
    expect((await state()).ui.player.health).toBe(40);
    const playerPosition=async()=>(await state()).snapshot.entities.find(e=>e.id==='player')!.positionWorldMetersXYZ;
    const before=await playerPosition();
    await page.locator('[data-world-stream-player] [tabindex]').focus();
    await page.keyboard.down('KeyW');
    await expect.poll(async()=>{const p=await playerPosition();return Math.hypot(p[0]-before[0],p[2]-before[2]);},{timeout:5000}).toBeGreaterThan(.2);
    const toggle=page.getByRole('switch',{name:'操作响应'});
    expect(await toggle.getAttribute('aria-checked')).toBe('true');
    // Programmatic click keeps keyboard focus on the picture: release must come
    // from the interactive prop change, not merely from focus leaving the player.
    await toggle.evaluate((button:HTMLButtonElement)=>button.click());
    await expect.poll(()=>toggle.getAttribute('aria-checked')).toBe('false');
    await expect.poll(async()=>{
      const velocity=(await state()).snapshot.entities.find(e=>e.id==='player')!.motion?.velocityWorldMetersPerSecondXYZ;
      return velocity?Math.hypot(velocity[0],velocity[2]):Infinity;
    }).toBeLessThan(.01);
    await page.keyboard.up('KeyW');
    const sent=()=>page.evaluate(()=>(window as unknown as {__testInputs:string[]}).__testInputs.length);
    const count=await sent(),stopped=await playerPosition();
    await page.getByRole('button',{name:'受到伤害 −20'}).click();
    await page.locator('[data-world-stream-player] [tabindex]').focus();
    await page.keyboard.press('KeyW');
    const surface=(await page.locator('[data-world-stream-player] [tabindex]').boundingBox())!;
    await page.mouse.move(surface.x+surface.width*.7,surface.y+surface.height*.5);
    await page.mouse.down();await page.mouse.move(surface.x+surface.width*.8,surface.y+surface.height*.55);await page.mouse.up();await page.mouse.wheel(0,40);
    await page.waitForTimeout(350); // Include a heartbeat interval while input is disabled.
    expect(await sent()).toBe(count);
    expect((await state()).ui.player.health).toBe(40);
    const after=await playerPosition();expect(Math.hypot(after[0]-stopped[0],after[2]-stopped[2])).toBeLessThan(.01);
    expect(await page.locator('[data-flow-node="input"]').getAttribute('data-state')).toBe('disabled');
    await toggle.click();
    await page.getByRole('button',{name:'受到伤害 −20'}).click();
    await expect.poll(async()=>(await state()).ui.player.health).toBe(20);
    // A world-owned reset (including a native reset shortcut) revokes the SDK
    // remote lease without recreating the Host session. Subsequent input must work.
    await page.getByRole('button',{name:'恢复生命'}).click();
    await expect.poll(async()=>(await state()).ui.player.health).toBe(100);
    const resetPosition=await playerPosition();
    await page.locator('[data-world-stream-player] [tabindex]').focus();await page.keyboard.down('KeyW');
    await expect.poll(async()=>{const p=await playerPosition();return Math.hypot(p[0]-resetPosition[0],p[2]-resetPosition[2]);}).toBeGreaterThan(.2);
    await page.keyboard.up('KeyW');
    expect(host.sessions()[0]!.epoch).toBe(epochBefore);
    await page.evaluate(()=>{for(const socket of (window as unknown as {__testSockets:WebSocket[]}).__testSockets)socket.close();});
    await page.waitForSelector('[data-status="disconnected"]',{timeout:5000});
    await page.waitForSelector('[data-status="playing"]',{timeout:15000});
    await page.getByRole('button',{name:'重置世界'}).click();
    await expect.poll(()=>host.sessions()[0]?.epoch).toBe(1);
    await expect.poll(async()=>await page.locator('[data-health-value]').textContent(),{timeout:30000}).toContain('100');
    await page.waitForSelector('[data-status="playing"]');
    expect((await state()).ui.player.health).toBe(100);
    await page.getByRole('button',{name:/近期事件/}).click();
    expect(await page.getByRole('list',{name:'近期连接事件'}).textContent()).toContain('视频参数已更新');
    expect(await page.getByRole('list',{name:'近期连接事件'}).textContent()).toContain('世界重置');
    expect(errors).toEqual([]);
    await page.goto('about:blank');
    await expect.poll(()=>host.sessions().length,{timeout:12000}).toBe(0);
    await page.goto(host.baseUrl);
    await expect.poll(()=>page.getByRole('status').textContent()).toContain('上次会话已结束');
    expect(host.sessions()).toHaveLength(0);
    expect(await page.locator('[data-world-id]').isEnabled()).toBe(true);
  }finally{await browser.close();await host.close();await rm(output,{recursive:true,force:true});await rm(worldDirectory,{recursive:true,force:true});}
},120000);
