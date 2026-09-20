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

const native=()=>page.evaluate(()=>({...((window as unknown as {nativeLifecycleLab:{snapshot:()=>{loaded:{id:string;type:string}[];mapId:string;bounds:{min:number[];max:number[]};world:{simulationTick:number;errors:unknown[]};errors:string[]}}}).nativeLifecycleLab.snapshot()),message:document.getElementById('message')!.textContent,createEnabled:!(document.getElementById('car-create') as HTMLButtonElement).disabled}));
async function openCatalog(){
 await page.goto(url);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 const before=await native();expect(before.mapId).toBe('campus');expect(before.bounds.max[0]!-before.bounds.min[0]!).toBe(1000);
 const types=await page.locator('#vehicle-type option').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value));
 expect(types).toEqual(expect.arrayContaining(['canoe','plane','horse','tank','spacecraft','dragon-D01','dragon-D11']));
 return {before,types};
}
async function createCatalogChoice(type:string){
 await page.selectOption('#vehicle-type',type);await page.locator('#car-create').click();
 const completion=await page.waitForFunction(selected=>{
  const state=(window as unknown as {nativeLifecycleLab:{snapshot:()=>{loaded:{type:string}[];errors:string[]}}}).nativeLifecycleLab.snapshot();
  if(!state.errors.length&&!state.loaded.some(entry=>entry.type===selected))return false;
  const create=document.getElementById('car-create') as HTMLButtonElement;
  return JSON.stringify({loaded:state.loaded,errors:state.errors,message:document.getElementById('message')!.textContent,createEnabled:!create.disabled});
 },type,{timeout:20000,polling:100});
 const observed=JSON.parse(String(await completion.jsonValue())) as {loaded:{type:string}[];errors:string[];message:string;createEnabled:boolean};
 await completion.dispose();
 expect(observed.errors,`${type}: ${observed.message}`).toEqual([]);expect(observed.loaded.some(entry=>entry.type===type),type).toBe(true);
 expect(observed.createEnabled,type).toBe(false);expect(observed.message,type).toContain('已创建');
}
async function releaseCatalogChoice(type:string){
 await page.locator('#car-destroy').click();
 const removal=await page.waitForFunction(selected=>{
  const state=(window as unknown as {nativeLifecycleLab:{snapshot:()=>{loaded:{type:string}[];errors:string[]}}}).nativeLifecycleLab.snapshot();
  return !state.loaded.some(entry=>entry.type===selected)&&JSON.stringify({loaded:state.loaded,errors:state.errors});
 },type,{timeout:20000,polling:100});
 const released=JSON.parse(String(await removal.jsonValue())) as {loaded:{type:string}[];errors:string[]};
 await removal.dispose();expect(released.errors,type).toEqual([]);
}

const batchCount=6;
it.each(Array.from({length:batchCount},(_,index)=>index))('creates catalog batch %i in a stable full-campus world',async batch=>{
 const {before,types}=await openCatalog();
 const ordered=[...types.filter(type=>type!=='rover'&&!type.startsWith('dragon-')),...types.filter(type=>type.startsWith('dragon-'))];
 const batchTypes=ordered.filter((_,index)=>index%batchCount===batch);expect(batchTypes.length).toBeGreaterThan(0);
 for(const type of batchTypes){await createCatalogChoice(type);await releaseCatalogChoice(type);}
 const final=await native();expect(final.loaded.map(entry=>entry.type)).toEqual(['rover']);expect(final.world.simulationTick).toBeGreaterThan(before.world.simulationTick);expect(final.world.errors).toEqual([]);
},60000);

it('keeps representative catalog choices together and resets them without replacing the world',async()=>{
 const {before}=await openCatalog();
 await createCatalogChoice('tank');await createCatalogChoice('dragon-D11');
 const final=await native();expect(final.loaded.map(entry=>entry.type).sort()).toEqual(['dragon-D11','rover','tank']);expect(final.world.simulationTick).toBeGreaterThan(before.world.simulationTick);expect(final.world.errors).toEqual([]);
 await page.screenshot({path:path.join(app,'../../.codex-tmp/asset-lifecycle-lab/catalog-all.png'),fullPage:true});
 await page.locator('#reset').press('Enter');await expect.poll(async()=>(await native()).loaded.length).toBe(1);
 expect((await native()).loaded[0]!.type).toBe('rover');expect((await native()).errors).toEqual([]);
},60000);
