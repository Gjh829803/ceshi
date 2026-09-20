import {afterAll,afterEach,beforeAll,beforeEach,expect,it} from 'vitest';
import {createServer,type ViteDevServer} from 'vite';
import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';
import {humanoid} from '@worldkit/three';
import type {Browser,Page} from 'playwright';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=fileURLToPath(new URL('../..',import.meta.url));
let server:ViteDevServer,browser:Browser,page:Page,url:string;
let errors:string[]=[];
type Snapshot={world:{simulationTick:number;controlledEntityId?:string;errors:unknown[];entities:{id:string;isActive:boolean;positionWorldMetersXYZ:number[];animation?:{actionId:string;timeSeconds:number};motion?:{isGrounded:boolean;collisionEntityIds:string[]}}[]}|null;worldId:number;state:string;pending:number;visibleInstances:number;shared:number;counts:Record<string,{total:number;released:number;pending:number}>;resources:{uuid:string;kind:string;disposed:boolean}[];instances:{id:string;phase:string}[];events:string[]};
const state=()=>page.evaluate(()=>(window as unknown as {assetLifecycleLab:{snapshot:()=>Snapshot}}).assetLifecycleLab.snapshot());
beforeAll(async()=>{
 server=await createServer({root:app,configFile:path.join(app,'asset-lifecycle.vite.config.ts'),configLoader:'runner',cacheDir:path.join(app,'../../.codex-tmp/asset-lifecycle-test-vite'),server:{port:0,strictPort:false,open:false},logLevel:'error'});
 await server.listen();const address=server.httpServer!.address();if(!address||typeof address==='string')throw Error('Missing test server address');url=`http://127.0.0.1:${address.port}/asset-lifecycle.html`;
 browser=await launchChromiumWithSystemFallback();
},60000);
beforeEach(async()=>{errors=[];page=await browser.newPage({viewport:{width:1440,height:950}});page.on('pageerror',e=>errors.push(String(e)));});
afterEach(async()=>{try{expect(errors).toEqual([]);}finally{await page?.close();}});
afterAll(async()=>{await browser?.close();await server?.close();});
async function open(){await page.goto(url);await page.waitForFunction(()=>document.body.dataset.labState==='运行中');}
async function load(count:number){await page.locator('#load').click();await expect.poll(async()=>(await state()).visibleInstances,{timeout:15000}).toBe(count);await expect.poll(async()=>(await state()).pending).toBe(0);}

it('loads on demand, keeps removed instances honest, releases shared resources on disposal and reloads fresh',async()=>{
 const modelRequests:string[]=[];page.on('request',r=>{if(r.url().includes('.glb'))modelRequests.push(r.url());});
 await open();expect(modelRequests).toEqual([]);expect((await state()).visibleInstances).toBe(0);
 await load(1);await expect.poll(async()=>(await state()).counts.texture!.total).toBeGreaterThan(0);
 const first=await state(),geometry=first.resources.filter(r=>r.kind==='geometry').map(r=>r.uuid);
 await load(2);expect((await state()).shared).toBeGreaterThan(0);
 await page.getByRole('button',{name:`移除 ${first.instances[0]!.id}`,exact:true}).click();
 await expect.poll(async()=>(await state()).visibleInstances).toBe(1);
 const removed=await state();expect(removed.instances[0]!.phase).toBe('removed');expect(removed.counts.geometry!.pending).toBeGreaterThan(0);expect(removed.counts.geometry!.released).toBe(0);
 await page.locator('#destroy').click();const disposed=await state();expect(disposed.state).toBe('已销毁');expect(disposed.visibleInstances).toBe(0);
 for(const count of Object.values(disposed.counts)){expect(count.pending).toBe(0);expect(count.released).toBe(count.total);}
 expect(await page.locator('#load').isDisabled()).toBe(true);
 await page.locator('#create').click();await page.waitForFunction(()=>document.body.dataset.labState==='运行中');await load(1);
 expect((await state()).worldId).toBe(2);expect((await state()).resources.some(r=>geometry.includes(r.uuid))).toBe(false);expect(modelRequests.length).toBeGreaterThanOrEqual(2);
 await page.setViewportSize({width:390,height:844});expect(await page.locator('#load').isVisible()).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
},30000);

it('rejects a delayed load after world disposal without attaching it to a new world',async()=>{
 await open();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let requested=false;
 await page.route('**/*.glb',async route=>{requested=true;await gate;await route.continue();});
 try{
  await page.locator('#load').click();await expect.poll(()=>requested).toBe(true);
  await page.locator('#destroy').click();expect((await state()).state).toBe('已销毁');
  await page.locator('#create').click();await page.waitForFunction(()=>document.body.dataset.labState==='运行中');
  release();await expect.poll(async()=>(await state()).events.some(e=>e.includes('迟到加载已失效')),{timeout:15000}).toBe(true);
  expect((await state()).worldId).toBe(2);expect((await state()).visibleInstances).toBe(0);
  await page.unroute('**/*.glb');await load(1);
 }finally{release();}
},30000);

it('reports a failed model request and allows an ordinary retry',async()=>{
 await open();await page.route('**/*.glb',route=>route.fulfill({status:503,body:'local failure fixture'}));
 await page.locator('#load').click();await expect.poll(async()=>(await state()).events.some(e=>e.includes('加载失败'))).toBe(true);
 expect((await state()).visibleInstances).toBe(0);expect(await page.locator('#load').isEnabled()).toBe(true);
 await page.unroute('**/*.glb');await load(1);await page.locator('#destroy').click();
 expect(Object.values((await state()).counts).every(c=>c.pending===0)).toBe(true);
 expect(await page.locator("#message").textContent()).toContain("本轮已观察资源均收到释放事件");
},30000);


it('destroys individual textured models while a peer keeps rendering, then releases the last shared resources',async()=>{
 await open();await load(1);await load(2);const initial=await state();expect(initial.shared).toBeGreaterThan(0);
 await page.getByRole('button',{name:`销毁 ${initial.instances[0]!.id}`,exact:true}).click();
 await expect.poll(async()=>(await state()).visibleInstances).toBe(1);
 const single=await state();expect(single.state).toBe('运行中');expect(single.shared).toBe(0);expect(single.instances[0]!.phase).toBe('destroyed');
 expect(single.counts.material!.released).toBeGreaterThan(0);expect(single.counts.geometry!.released).toBe(0);
 await page.getByRole('button',{name:`销毁 ${initial.instances[1]!.id}`,exact:true}).click();
 await expect.poll(async()=>(await state()).visibleInstances).toBe(0);
 const empty=await state();expect(empty.state).toBe('运行中');expect(Object.values(empty.counts).every(c=>c.pending===0)).toBe(true);
 await load(1);expect((await state()).worldId).toBe(initial.worldId);
},30000);

it('runs a real controllable actor, collides with a wall, freezes one actor while its peer animates, resumes and destroys it',async()=>{
 await open();await page.locator('#create-actor').click();await expect.poll(async()=>(await state()).visibleInstances).toBe(1);
 const first=(await state()).instances[0]!.id;
 await page.locator('#create-actor').click();await expect.poll(async()=>(await state()).visibleInstances).toBe(2);const second=(await state()).instances[1]!.id;
 const actor=async(id:string)=>(await state()).world!.entities.find(e=>e.id===id)!;
 await expect.poll(async()=>(await actor(first)).motion?.isGrounded).toBe(true);
 const groundY=(await actor(first)).positionWorldMetersXYZ[1]!;
 await page.locator('#viewport canvas').click();await page.keyboard.down('Space');
 try{await expect.poll(async()=>(await actor(first)).motion?.isGrounded).toBe(false);await expect.poll(async()=>(await actor(first)).positionWorldMetersXYZ[1]).toBeGreaterThan(groundY+.2);}finally{await page.keyboard.up('Space');}
 await expect.poll(async()=>(await actor(first)).motion?.isGrounded).toBe(true);
 await page.getByRole('button',{name:`播放动作 ${second}`,exact:true}).click();
 await page.locator('#viewport canvas').click();await page.keyboard.down('Shift');await page.keyboard.down('w');
 try{await expect.poll(async()=>(await actor(first)).animation?.actionId,{timeout:5000}).toBe('run');await expect.poll(async()=>(await actor(first)).positionWorldMetersXYZ[2],{timeout:8000}).toBeLessThan(-2);}
 finally{await page.keyboard.up('w');await page.keyboard.up('Shift');}
 expect((await actor(first)).positionWorldMetersXYZ[2]).toBeGreaterThan(-3);
 await page.getByRole('button',{name:`停用 ${first}`,exact:true}).click();await expect.poll(async()=>(await actor(first)).isActive).toBe(false);
 const frozen=await actor(first),before=await state(),peerTime=(await actor(second)).animation!.timeSeconds;
 await page.locator('#viewport canvas').click();await page.keyboard.down('s');
 try{await page.waitForFunction(t=>(window as unknown as {assetLifecycleLab:{snapshot:()=>Snapshot}}).assetLifecycleLab.snapshot().world!.simulationTick>t+20,before.world!.simulationTick);}
 finally{await page.keyboard.up('s');}
 expect((await actor(first)).positionWorldMetersXYZ).toEqual(frozen.positionWorldMetersXYZ);expect((await actor(first)).animation).toEqual(frozen.animation);expect((await actor(second)).animation!.timeSeconds).not.toBe(peerTime);
 await page.getByRole('button',{name:`恢复 ${first}`,exact:true}).click();await expect.poll(async()=>(await actor(first)).isActive).toBe(true);
 await page.locator('#viewport canvas').click();await page.keyboard.down('s');
 try{await expect.poll(async()=>(await actor(first)).positionWorldMetersXYZ[2]).toBeGreaterThan(frozen.positionWorldMetersXYZ[2]!+.4);}finally{await page.keyboard.up('s');}
 await page.getByRole('button',{name:`销毁 ${first}`,exact:true}).click();await expect.poll(async()=>(await state()).visibleInstances).toBe(1);
 expect((await state()).world!.entities.some(e=>e.id===first)).toBe(false);expect((await state()).world!.errors).toEqual([]);
 await page.getByRole('button',{name:`操控 ${second}`,exact:true}).click();expect((await state()).world!.controlledEntityId).toBe(second);
 await page.locator('#create-actor').click();await expect.poll(async()=>(await state()).visibleInstances).toBe(2);
 const live=(await state()).world!.entities.filter(e=>e.id.startsWith('asset-'));expect(Math.hypot(live[0]!.positionWorldMetersXYZ[0]!-live[1]!.positionWorldMetersXYZ[0]!,live[0]!.positionWorldMetersXYZ[2]!-live[1]!.positionWorldMetersXYZ[2]!)).toBeGreaterThan(1.5);
 await page.screenshot({path:path.join(app,'../../.codex-tmp/asset-lifecycle-lab/runtime-final.png'),fullPage:true});
},30000);


it('suspends a native mounted character and car together while the peer animation and world continue',async()=>{
 await page.goto(url.replace('asset-lifecycle.html','native-lifecycle.html'));await page.waitForFunction(()=>document.body.dataset.ready==='true'||((window as unknown as {nativeLifecycleLab?:{snapshot:()=>{errors:string[]}}}).nativeLifecycleLab?.snapshot().errors.length??0)>0,{},{timeout:30000});
 expect(await page.locator('#message').textContent()).not.toMatch(/Error|Failed/);
 const nativeState=()=>page.evaluate(()=>(window as unknown as {nativeLifecycleLab:{snapshot:()=>{disposed:boolean;world:NonNullable<Snapshot['world']>;errors:string[]}}}).nativeLifecycleLab.snapshot());
 const actor=async(id:string)=>(await nativeState()).world.entities.find(e=>e.id===id)!;
 await page.locator('#viewport canvas').click();const before=(await actor('car')).positionWorldMetersXYZ;
 await page.keyboard.down('w');try{await expect.poll(async()=>Math.abs((await actor('car')).positionWorldMetersXYZ[2]!-before[2]!),{timeout:7000}).toBeGreaterThan(.5);}finally{await page.keyboard.up('w');}
 await page.locator('#pause').click();await expect.poll(async()=>(await actor('car')).isActive).toBe(false);expect((await actor('player')).isActive).toBe(false);
 const frozen=await actor('car'),player=await actor('player'),peerTime=(await actor('peer')).animation!.timeSeconds,tick=(await nativeState()).world.simulationTick;
 await page.waitForFunction(t=>(window as unknown as {nativeLifecycleLab:{snapshot:()=>{world:{simulationTick:number}}}}).nativeLifecycleLab.snapshot().world.simulationTick>t+30,tick);
 expect((await actor('car')).positionWorldMetersXYZ).toEqual(frozen.positionWorldMetersXYZ);expect((await actor('player')).animation).toEqual(player.animation);expect((await actor('peer')).animation!.timeSeconds).not.toBe(peerTime);
 await page.screenshot({path:path.join(app,'../../.codex-tmp/asset-lifecycle-lab/native-paused.png'),fullPage:true});
 await page.locator('#resume').click();await expect.poll(async()=>(await actor('car')).isActive).toBe(true);await page.locator('#viewport canvas').click();await page.keyboard.down('w');try{await expect.poll(async()=>Math.abs((await actor('car')).positionWorldMetersXYZ[2]!-frozen.positionWorldMetersXYZ[2]!)).toBeGreaterThan(.3);}finally{await page.keyboard.up('w');}
 await page.locator('#pause').click();await expect.poll(async()=>(await actor('player')).isActive).toBe(false);await page.locator('#reset').click();await expect.poll(async()=>(await actor('player')).isActive).toBe(true);
 expect((await nativeState()).world.errors).toEqual([]);expect((await nativeState()).errors).toEqual([]);await page.locator('#destroy').click();expect((await nativeState()).disposed).toBe(true);
},45000);


it('destroys and reloads a native character while the mounted player keeps running and reset does not resurrect it',async()=>{
 await page.goto(url.replace('asset-lifecycle.html','native-lifecycle.html'));await page.waitForFunction(()=>document.body.dataset.ready==='true');
 const nativeState=()=>page.evaluate(()=>(window as unknown as {nativeLifecycleLab:{snapshot:()=>{disposed:boolean;world:NonNullable<Snapshot['world']>;errors:string[]}}}).nativeLifecycleLab.snapshot());
 await page.locator('#peer-pause').click();await expect.poll(async()=>(await nativeState()).world.entities.find(e=>e.id==='peer')?.isActive).toBe(false);
 await page.locator('#peer-destroy').click();await expect.poll(async()=>(await nativeState()).world.entities.some(e=>e.id==='peer')).toBe(false);
 const before=(await nativeState()).world.entities.find(e=>e.id==='car')!.positionWorldMetersXYZ;await page.locator('#viewport canvas').click();await page.keyboard.down('w');
 try{await expect.poll(async()=>Math.abs((await nativeState()).world.entities.find(e=>e.id==='car')!.positionWorldMetersXYZ[2]!-before[2]!)).toBeGreaterThan(.3);}finally{await page.keyboard.up('w');}
 await page.locator('#reset').click();await expect.poll(async()=>page.locator('#message').textContent()).toContain('已重置');expect((await nativeState()).world.entities.some(e=>e.id==='peer')).toBe(false);
 await page.locator('#peer-create').click();await expect.poll(async()=>(await nativeState()).world.entities.some(e=>e.id==='peer')).toBe(true);
 const time=(await nativeState()).world.entities.find(e=>e.id==='peer')!.animation!.timeSeconds;await expect.poll(async()=>(await nativeState()).world.entities.find(e=>e.id==='peer')!.animation!.timeSeconds).toBeGreaterThan(time);
 await page.screenshot({path:path.join(app,'../../.codex-tmp/asset-lifecycle-lab/native-character-recreated.png'),fullPage:true});
 await page.locator('#peer-destroy').click();await expect.poll(async()=>(await nativeState()).world.entities.some(e=>e.id==='peer')).toBe(false);
 expect((await nativeState()).world.errors).toEqual([]);expect((await nativeState()).errors).toEqual([]);await page.locator('#destroy').click();expect((await nativeState()).disposed).toBe(true);
},45000);


it('automatically exits and destroys the native car in the real page, then keeps walking and resetting',async()=>{
 await page.goto(url.replace('asset-lifecycle.html','native-lifecycle.html'));await page.waitForFunction(()=>document.body.dataset.ready==='true');
 const nativeState=()=>page.evaluate(()=>(window as unknown as {nativeLifecycleLab:{snapshot:()=>{disposed:boolean;world:NonNullable<Snapshot['world']>;errors:string[]}}}).nativeLifecycleLab.snapshot());
 await page.locator('#car-destroy').click();await expect.poll(async()=>(await nativeState()).world.entities.some(e=>e.id==='car')).toBe(false);
 expect((await nativeState()).world.entities.some(e=>e.id==='player')).toBe(true);const before=(await nativeState()).world.entities.find(e=>e.id==='player')!.positionWorldMetersXYZ;
 await page.locator('#viewport canvas').click();await page.keyboard.down('w');try{await expect.poll(async()=>{const p=(await nativeState()).world.entities.find(e=>e.id==='player')!.positionWorldMetersXYZ;return Math.hypot(p[0]!-before[0]!,p[2]!-before[2]!);}).toBeGreaterThan(.3);}finally{await page.keyboard.up('w');}
 await page.locator('#reset').click();await expect.poll(async()=>page.locator('#message').textContent()).toContain('已重置');expect((await nativeState()).world.entities.some(e=>e.id==='car')).toBe(false);expect((await nativeState()).world.entities.some(e=>e.id==='peer')).toBe(true);
 await page.screenshot({path:path.join(app,'../../.codex-tmp/asset-lifecycle-lab/native-car-destroyed.png'),fullPage:true});
 expect((await nativeState()).world.errors).toEqual([]);expect((await nativeState()).errors).toEqual([]);
},45000);


it('recreates the native car, drives it in the same world and clears the new instance on reset',async()=>{
 await page.goto(url.replace('asset-lifecycle.html','native-lifecycle.html'));await page.waitForFunction(()=>document.body.dataset.ready==='true');
 const nativeState=()=>page.evaluate(()=>(window as unknown as {nativeLifecycleLab:{snapshot:()=>{disposed:boolean;world:NonNullable<Snapshot['world']>;errors:string[]}}}).nativeLifecycleLab.snapshot());
 await page.locator('#pause').click();await expect.poll(async()=>(await nativeState()).world.entities.find(e=>e.id==='player')!.isActive).toBe(false);
 await page.locator('#car-destroy').click();await expect.poll(async()=>(await nativeState()).world.entities.some(e=>e.id==='car')).toBe(false);
 const tick=(await nativeState()).world.simulationTick;await page.locator('#car-create').click();await expect.poll(async()=>(await nativeState()).world.entities.some(e=>e.id==='car')).toBe(true);expect((await nativeState()).world.simulationTick).toBeGreaterThanOrEqual(tick);
 await page.locator('#resume').click();await expect.poll(async()=>(await nativeState()).world.entities.find(e=>e.id==='player')!.isActive).toBe(true);
 // Allow the normal live simulation to settle before boarding the fresh car.
 await page.waitForFunction(t=>(window as unknown as {nativeLifecycleLab:{snapshot:()=>{world:{simulationTick:number}}}}).nativeLifecycleLab.snapshot().world.simulationTick>t+35,tick);
 await page.locator('#enter').click();await page.locator('#viewport canvas').click();const before=(await nativeState()).world.entities.find(e=>e.id==='car')!.positionWorldMetersXYZ;await page.keyboard.down('w');
 try{await expect.poll(async()=>Math.abs((await nativeState()).world.entities.find(e=>e.id==='car')!.positionWorldMetersXYZ[2]!-before[2]!),{timeout:7000}).toBeGreaterThan(.4);}finally{await page.keyboard.up('w');}
 await page.screenshot({path:path.join(app,'../../.codex-tmp/asset-lifecycle-lab/native-car-recreated.png'),fullPage:true});
 await page.locator('#reset').click();await expect.poll(async()=>page.locator('#message').textContent()).toContain('已重置');expect((await nativeState()).world.entities.some(e=>e.id==='car')).toBe(false);expect((await nativeState()).world.entities.some(e=>e.id==='player')).toBe(true);
 await page.locator('#car-create').click();await expect.poll(async()=>(await nativeState()).world.entities.some(e=>e.id==='car')).toBe(true);expect((await nativeState()).world.errors).toEqual([]);expect((await nativeState()).errors).toEqual([]);
 await page.locator('#destroy').click();expect((await nativeState()).disposed).toBe(true);
},45000);


it.each([{type:'canoe',key:'w'},{type:'plane',key:'Shift'},{type:'horse',key:'w'},{type:'spacecraft',key:'w'},{type:'dragon-D01',key:'w'}])('boards and controls a newly created $type through the shared runtime',async({type,key})=>{
 await page.goto(url.replace('asset-lifecycle.html','native-lifecycle.html'));await page.waitForFunction(()=>document.body.dataset.ready==='true');
 const native=()=>page.evaluate(()=>(window as unknown as {nativeLifecycleLab:{snapshot:()=>{selectedId:string;riding:{vehicleId:string|null;transitioning:boolean};world:NonNullable<Snapshot['world']>;errors:string[]}}}).nativeLifecycleLab.snapshot());
 await page.selectOption('#vehicle-type',type);await page.locator('#vehicle-create').click();
 await expect.poll(async()=>page.locator('#message').textContent(),{timeout:20000}).toContain('已定位');
 if(type.startsWith('dragon-')){await expect.poll(async()=>(await native()).world.entities.find(e=>e.id==='player')!.motion?.isGrounded).toBe(true);await page.locator('#summon').click();await expect.poll(async()=>page.locator('#message').textContent()).toContain('召唤已开始');await expect.poll(async()=>page.locator('#dragon-state').textContent(),{timeout:70000}).toContain('飞龙已落稳');await page.locator('#locate').click();await expect.poll(async()=>page.locator('#message').textContent()).toContain('已定位');}
 await page.locator('#enter').click();await expect.poll(async()=>page.locator('#message').textContent()).toContain('已执行');
 if(type.startsWith('dragon-')){await expect.poll(async()=>(await native()).riding,{timeout:15000}).toEqual({vehicleId:(await native()).selectedId,transitioning:false});await page.locator('#viewport canvas').click();await page.keyboard.press(humanoid.DEFAULT_KEY_BINDINGS.ascend[0]!);}
 const state=await native(),id=state.selectedId,before=state.world.entities.find(e=>e.id===id)!.positionWorldMetersXYZ;
 await page.locator('#viewport canvas').click();await page.keyboard.down(key);
 try{await expect.poll(async()=>{const p=(await native()).world.entities.find(e=>e.id===id)!.positionWorldMetersXYZ;return Math.hypot(...p.map((v,i)=>v-before[i]!));},{timeout:10000}).toBeGreaterThan(.5);}finally{await page.keyboard.up(key);}
 await page.locator('#pause').click();await expect.poll(async()=>(await native()).world.entities.find(e=>e.id===id)!.isActive).toBe(false);expect((await native()).world.entities.find(e=>e.id==='player')!.isActive).toBe(false);
 await page.locator('#resume').click();await expect.poll(async()=>(await native()).world.entities.find(e=>e.id===id)!.isActive).toBe(true);
 expect((await native()).world.errors).toEqual([]);expect((await native()).errors).toEqual([]);
 await page.screenshot({path:path.join(app,`../../.codex-tmp/asset-lifecycle-lab/catalog-riding-${type}.png`),fullPage:true});
},100000);
