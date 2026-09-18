import {test,expect,vi} from 'vitest';
import * as browserCapture from '@worldkit/browser-capture/browser';
import {WebSocket as NodeWebSocket} from 'ws';
import {ProducerMediaConnection} from '../src/media-connection.js';
import {decodeFrame,type FrameHeader,type CodecConfig} from '@worldkit/stream-protocol';
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


test('producer recovers backpressure without repeated encoder metadata or Host keyframe hints',async()=>{
  const browser=await launchChromiumWithSystemFallback({headless:true});
  const launch=vi.spyOn(browserCapture,'launchChromiumWithSystemFallback').mockResolvedValue(browser);
  const newContext=browser.newContext.bind(browser);
  const contextSpy=vi.spyOn(browser,'newContext').mockImplementation(async options=>{
    const context=await newContext(options);
    await context.addInitScript(()=>{
      const OriginalSocket=window.WebSocket,OriginalEncoder=window.VideoEncoder;
      const probe={sockets:[] as WebSocket[],congested:false,configs:0,rejectConnections:0};
      Object.assign(window,{__mediaProbe:probe});
      window.WebSocket=class extends OriginalSocket{
        constructor(url:string|URL,protocols?:string|string[]){
          const media=String(url).includes('/producer-media');
          if(media&&probe.rejectConnections>0){probe.rejectConnections--;url=String(url).replace('/producer-media','/reject-media');}
          super(url,protocols);if(media)probe.sockets.push(this);
        }
        get bufferedAmount(){return probe.congested&&String(this.url).includes('/producer-media')?5*1024*1024:super.bufferedAmount;}
        addEventListener(type:string,listener:any,options?:any){
          // Recovery must not rely on the separate control-channel hint racing open.
          if(type==='message'&&String(this.url).includes('/producer-control'))super.addEventListener(type,event=>{
            if(JSON.parse(String((event as MessageEvent).data)).type!=='media.keyframe')listener(event);
          },options);else super.addEventListener(type,listener,options);
        }
      };
      window.VideoEncoder=class extends OriginalEncoder{
        constructor(init:VideoEncoderInit){let first=true;super({...init,output:(chunk,metadata)=>{
          if(first&&metadata?.decoderConfig){first=false;probe.configs++;init.output(chunk,metadata);}
          else init.output(chunk,{});
        }});}
      };
    });
    return context;
  });
  let host:Awaited<ReturnType<typeof startStreamHost>>|undefined;
  const clients:NodeWebSocket[]=[];
  try{
    host=await startStreamHost({worldsDirectory:path.resolve('examples/three-creator/streaming-ui'),port:0,width:640,height:360,fps:12});
    const [world]=await (await fetch(host.baseUrl+'/v1/worlds')).json() as {id:string}[];
    const response=await fetch(host.baseUrl+'/v1/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({worldId:world!.id})});
    expect(response.status).toBe(201);const session=await response.json() as {sessionId:string;accessToken:string};
    const configs=new Map<number,CodecConfig>(),frames:{header:FrameHeader;payload:number[]}[]=[],errors:string[]=[],ended:string[]=[];
    const connect=(channel:string)=>{
      const url=new URL(`/v1/sessions/${session.sessionId}/${channel}`,host!.baseUrl);url.protocol='ws:';url.searchParams.set('token',session.accessToken);url.searchParams.set('clientId','recovery-test');
      const socket=new NodeWebSocket(url);clients.push(socket);return socket;
    };
    const control=connect('control');control.on('message',data=>{const m=JSON.parse(data.toString());if(m.type==='media.config')configs.set(m.mediaGeneration,m.config);if(m.type==='error')errors.push(m.code);if(m.type==='session.ended')ended.push(m.reason);});
    const media=connect('media');media.on('message',data=>{const packet=decodeFrame(Buffer.from(data as ArrayBuffer));frames.push({header:packet.header,payload:[...packet.payload]});});
    await expect.poll(()=>frames.filter(f=>f.header.type==='key').length,{timeout:15000}).toBeGreaterThan(0);
    const page=browser.contexts()[0]!.pages()[0]!;
    const initial=frames.at(-1)!.header.mediaGeneration;
    await page.evaluate(()=>{(window as any).__mediaProbe.congested=true;});
    await expect.poll(()=>page.evaluate(()=>(window as any).__mediaProbe.sockets[0].readyState)).not.toBe(1);
    await page.evaluate(()=>{(window as any).__mediaProbe.congested=false;});
    await expect.poll(()=>frames.filter(f=>f.header.mediaGeneration>initial).length,{timeout:10000}).toBeGreaterThan(3);
    const recovered=frames.filter(f=>f.header.mediaGeneration>initial),generation=recovered[0]!.header.mediaGeneration;
    expect(recovered[0]!.header.type).toBe('key');expect(configs.has(generation)).toBe(true);
    expect(await page.evaluate(()=>(window as any).__mediaProbe.configs)).toBe(1);
    // Exercise actual WebCodecs decoding, not just packet arrival.
    expect(await page.evaluate(async ({config,packets})=>{
      let decoded=0,failure:unknown;const decoder=new VideoDecoder({output:frame=>{decoded++;frame.close();},error:error=>{failure=error;}});
      try{const {description,...settings}=config;decoder.configure({...settings,...(description?{description:new Uint8Array(description)}:{})});
        for(const packet of packets)decoder.decode(new EncodedVideoChunk({type:packet.header.type,timestamp:packet.header.outputPtsUs,data:new Uint8Array(packet.payload)}));
        await decoder.flush();if(failure)throw failure;return decoded;
      }finally{decoder.close();}
    },{config:configs.get(generation)!,packets:recovered.filter(f=>f.header.mediaGeneration===generation)})).toBeGreaterThan(3);
    // A transport close followed by one refused upgrade recovers within the same session.
    await page.evaluate(()=>{const p=(window as any).__mediaProbe;p.rejectConnections=1;p.sockets.at(-1).close();});
    await expect.poll(()=>frames.filter(f=>f.header.mediaGeneration>generation+1).length,{timeout:10000}).toBeGreaterThan(3);
    const afterError=frames.filter(f=>f.header.mediaGeneration>generation+1);
    expect(afterError[0]!.header.type).toBe('key');expect(configs.has(afterError[0]!.header.mediaGeneration)).toBe(true);
    expect(host.sessions()[0]!.status).toBe('running');expect(errors).toEqual([]);
    // Persistent refusal must terminate explicitly instead of leaving status running.
    await page.evaluate(()=>{const p=(window as any).__mediaProbe;p.rejectConnections=100;p.sockets.at(-1).close();});
    await expect.poll(()=>host!.sessions()[0]?.status,{timeout:20000}).toBe('failed');
    await expect.poll(()=>ended.some(reason=>reason.includes('STREAM_MEDIA_RECONNECT_EXHAUSTED'))).toBe(true);
    expect(errors.some(reason=>reason.includes('STREAM_MEDIA_RECONNECT_EXHAUSTED'))).toBe(true);
  }finally{for(const client of clients)client.terminate();await host?.close();contextSpy.mockRestore();launch.mockRestore();await browser.close();}
},60000);


class TestMediaSocket {
  static OPEN=1;static CONNECTING=0;
  static instances:TestMediaSocket[]=[];
  readyState=0;bufferedAmount=0;sent:Uint8Array[]=[];
  onopen:(()=>void)|null=null;onclose:(()=>void)|null=null;onerror:(()=>void)|null=null;
  constructor(){TestMediaSocket.instances.push(this);}
  open(){this.readyState=1;this.onopen?.();}
  close(){this.readyState=3;this.onclose?.();}
  send(bytes:Uint8Array){if(this.readyState!==1)throw new Error('closed');this.sent.push(bytes);}
}
const mediaHeader=(generation:number,type:'key'|'delta'='key'):FrameHeader=>({protocolVersion:1,sessionId:'test',epoch:0,mediaGeneration:generation,outputFrameId:1,outputPtsUs:1,type,source:{presentationId:'p',sdkEpoch:0,sourceFrameId:1,sourceTimeUs:1,simulationTick:1,worldRevision:0},uiRevision:0,uiCompleteThroughUs:1,widthPixels:640,heightPixels:360,payloadBytes:1});

test('media generations reject stale callbacks/frames, replay updated config, and cancel retry on disposal',async()=>{
  vi.useFakeTimers();vi.stubGlobal('WebSocket',TestMediaSocket);TestMediaSocket.instances=[];
  const publish=vi.fn(()=>true),fail=vi.fn(),connection=new ProducerMediaConnection({url:'ws://test',publishConfig:publish,invalidate:vi.fn(),fail});
  const config={codec:'vp8',codedWidth:640,codedHeight:360},payload=new Uint8Array([1]);
  try{
    const ready=connection.start(),first=TestMediaSocket.instances[0]!;first.open();await ready;
    connection.setConfig(config);connection.send(mediaHeader(1),payload);expect(first.sent).toHaveLength(1);
    const staleOpen=first.onopen!,staleClose=first.onclose!;
    first.bufferedAmount=5*1024*1024;connection.send(mediaHeader(1),payload);
    expect(connection.state).toBe('reconnecting');expect(connection.canCapture).toBe(false);
    await vi.advanceTimersByTimeAsync(250);const second=TestMediaSocket.instances[1]!;
    expect(publish).toHaveBeenCalledTimes(1);second.open();
    expect(publish).toHaveBeenLastCalledWith(2,config);
    staleOpen();staleClose();expect(connection.state).toBe('waiting-keyframe');
    connection.send(mediaHeader(1),payload);connection.send(mediaHeader(2,'delta'),payload);expect(second.sent).toHaveLength(0);
    connection.send(mediaHeader(2),payload);expect(second.sent).toHaveLength(1);
    // A settings change during reconnect must replace, not replay, the old codec config.
    second.close();connection.resetEncoder();const resized={...config,codedWidth:1280,codedHeight:720};connection.setConfig(resized);
    await vi.advanceTimersByTimeAsync(500);const third=TestMediaSocket.instances[2]!;third.open();
    expect(publish).toHaveBeenLastCalledWith(4,resized);
    connection.send(mediaHeader(2),payload);expect(third.sent).toHaveLength(0);
    third.close();connection.dispose();await vi.runAllTimersAsync();expect(TestMediaSocket.instances).toHaveLength(3);expect(fail).not.toHaveBeenCalled();
  }finally{connection.dispose();vi.unstubAllGlobals();vi.useRealTimers();}
});

test('media connect timeouts and repeated open-close flapping have a bounded retry budget',async()=>{
  vi.useFakeTimers();vi.stubGlobal('WebSocket',TestMediaSocket);TestMediaSocket.instances=[];
  const failed=vi.fn(),connection=new ProducerMediaConnection({url:'ws://test',publishConfig:()=>true,invalidate:vi.fn(),fail:failed});
  try{
    const ready=connection.start().catch(error=>error);
    TestMediaSocket.instances[0]!.onerror!(); // error followed by close counts only once
    TestMediaSocket.instances[0]!.close();await vi.runAllTimersAsync();
    expect((await ready).message).toContain('STREAM_MEDIA_RECONNECT_EXHAUSTED');
    expect(TestMediaSocket.instances).toHaveLength(6);expect(failed).toHaveBeenCalledTimes(1);expect(connection.state).toBe('failed');
    connection.dispose();await vi.runAllTimersAsync();expect(TestMediaSocket.instances).toHaveLength(6);
  }finally{connection.dispose();vi.unstubAllGlobals();vi.useRealTimers();}

  vi.useFakeTimers();vi.stubGlobal('WebSocket',TestMediaSocket);TestMediaSocket.instances=[];
  const exhausted=vi.fn(),flapping=new ProducerMediaConnection({url:'ws://test',publishConfig:()=>true,invalidate:vi.fn(),fail:exhausted});
  try{
    const ready=flapping.start();TestMediaSocket.instances[0]!.open();await ready;
    flapping.setConfig({codec:'vp8',codedWidth:640,codedHeight:360});
    for(const delay of [250,500,1000,2000,4000]){
      flapping.send(mediaHeader(flapping.generation),new Uint8Array([1]));TestMediaSocket.instances.at(-1)!.close();
      await vi.advanceTimersByTimeAsync(delay);TestMediaSocket.instances.at(-1)!.open();
    }
    TestMediaSocket.instances.at(-1)!.close();await vi.runAllTimersAsync();
    expect(exhausted).toHaveBeenCalledTimes(1);expect(TestMediaSocket.instances).toHaveLength(6);
  }finally{flapping.dispose();vi.unstubAllGlobals();vi.useRealTimers();}
});
