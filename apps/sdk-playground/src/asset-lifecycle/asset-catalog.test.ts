import {afterAll,afterEach,beforeAll,expect,it} from 'vitest';
import {createServer,type ViteDevServer} from 'vite';
import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';
import type {Browser,Page} from 'playwright';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// This all-model workload owns a fresh browser/server rather than inheriting the
// mounted-control cases' browser process. Its world stays live for the whole case.
const app=fileURLToPath(new URL('../..',import.meta.url));
let server:ViteDevServer,browser:Browser,page:Page,url:string;
const errors:string[]=[];
beforeAll(async()=>{
 server=await createServer({root:app,configFile:path.join(app,'asset-lifecycle.vite.config.ts'),configLoader:'runner',cacheDir:path.join(app,'../../.codex-tmp/asset-catalog-test-vite'),server:{port:0,strictPort:false,open:false},logLevel:'error'});
 await server.listen();const address=server.httpServer!.address();if(!address||typeof address==='string')throw Error('Missing test server address');url=`http://127.0.0.1:${address.port}/native-lifecycle.html`;
 // Prepare only the JS module graph, as the preceding native-page cases did
 // before this workload was isolated. No world or model is loaded during setup.
 await server.environments.client.warmupRequest('/src/asset-lifecycle/native.ts');
 await server.environments.client.waitForRequestsIdle();
 browser=await launchChromiumWithSystemFallback();page=await browser.newPage({viewport:{width:960,height:600}});page.on('pageerror',e=>errors.push(String(e)));
},60000);
afterEach(()=>{expect(errors).toEqual([]);});
afterAll(async()=>{try{await browser?.close();}finally{await server?.close();}});

it('creates every catalog choice on demand in the full campus without replacing the world',async()=>{
 const started=performance.now(),stage=(name:string)=>console.info('Catalog stage',{name,elapsedMs:Math.round(performance.now()-started)});
 // Keep the real desktop layout and full map while bounding software raster work on CI.
 await page.goto(url);await page.waitForFunction(()=>document.body.dataset.ready==='true');stage('ready');
 const native=()=>page.evaluate(()=>({...((window as unknown as {nativeLifecycleLab:{snapshot:()=>{loaded:{id:string;type:string}[];mapId:string;bounds:{min:number[];max:number[]};world:{simulationTick:number;errors:unknown[]};errors:string[]}}}).nativeLifecycleLab.snapshot()),message:document.getElementById('message')!.textContent,createEnabled:!(document.getElementById('car-create') as HTMLButtonElement).disabled}));
 const before=await native();expect(before.mapId).toBe('campus');expect(before.bounds.max[0]!-before.bounds.min[0]!).toBe(1000);
 const types=await page.locator('#vehicle-type option').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value));expect(types).toEqual(expect.arrayContaining(['canoe','plane','horse','tank','spacecraft','dragon-D01','dragon-D11']));
 // Add the imported skeletal models last: every instance remains live for the
 // final coexistence/reset checks, without paying their render cost on every earlier UI action.
 const creationOrder=[...types.filter(type=>type!=='rover'&&!type.startsWith('dragon-')),...types.filter(type=>type.startsWith('dragon-'))];
 // These controls are stable DOM nodes; reuse their handles instead of resolving
 // selectors and refocusing the same button behind each expensive live frame.
 // This case verifies that every choice can coexist in one live world. The
 // focused approach/boarding flow is exercised by the smaller native-page cases.
 const catalog=await page.$('#vehicle-type'),create=await page.$('#car-create');
 if(!catalog||!create)throw Error('Missing catalog controls');
 const timings:{type:string;milliseconds:number}[]=[];
 for(const type of creationOrder){
  const started=performance.now();
  try{
   await catalog.selectOption(type);
   const {visible,enabled,focused}=await create.evaluate(element=>{const button=element as HTMLButtonElement;button.focus();return {visible:button.checkVisibility({visibilityProperty:true}),enabled:!button.disabled,focused:document.activeElement===button};});
   expect(visible).toBe(true);expect(enabled).toBe(true);expect(focused).toBe(true);
   // Keyboard activation of the primary create flow is covered by the focused
   // lifecycle cases. Click the secondary create control here to focus this
   // workload on all-model coexistence.
   await create.click();
   // Return the completion sample itself as a primitive. A second evaluation would
   // wait behind another live frame and rebuild/serialize the entire world again.
   const completion=await page.waitForFunction(selected=>{
    const state=(window as unknown as {nativeLifecycleLab:{snapshot:()=>{loaded:{type:string}[];errors:string[]}}}).nativeLifecycleLab.snapshot();
    if(!state.errors.length&&!state.loaded.some(entry=>entry.type===selected))return false;
    const create=document.getElementById('car-create') as HTMLButtonElement;
    return JSON.stringify({loaded:state.loaded,errors:state.errors,message:document.getElementById('message')!.textContent,createEnabled:!create.disabled});
   },type,{timeout:20000,polling:100});
   const observed=JSON.parse(String(await completion.jsonValue())) as Pick<Awaited<ReturnType<typeof native>>,'loaded'|'errors'|'message'|'createEnabled'>;
   await completion.dispose();
   expect(observed.errors,`${type}: ${observed.message}`).toEqual([]);expect(observed.loaded.some(entry=>entry.type===type),type).toBe(true);
   expect(observed.createEnabled,type).toBe(false);expect(observed.message,type).toContain('已创建');
  }catch(error){console.error('Catalog creation failed',{type,elapsedMs:Math.round(performance.now()-started),completed:timings});throw error;}
  timings.push({type,milliseconds:Math.round(performance.now()-started)});
 }
 console.info('Catalog creation timings',timings);stage('all-created');
 const final=await native();expect(final.loaded.length).toBe(types.length);expect(final.world.simulationTick).toBeGreaterThan(before.world.simulationTick);expect(final.world.errors).toEqual([]);
 await page.screenshot({path:path.join(app,'../../.codex-tmp/asset-lifecycle-lab/catalog-all.png'),fullPage:true});stage('captured');
 await page.locator('#reset').press('Enter');await expect.poll(async()=>(await native()).loaded.length).toBe(1);
 expect((await native()).loaded[0]!.type).toBe('rover');expect((await native()).errors).toEqual([]);stage('reset-verified');
},150000);
