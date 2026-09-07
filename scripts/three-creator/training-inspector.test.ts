import {build} from 'esbuild';
import type {Browser,Page} from 'playwright';
import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect} from 'vitest';
import {launchChromiumWithSystemFallback} from '../lib/playwright-browser-launch.js';

describe('training motion and camera inspector',()=>{
 let browser:Browser,page:Page,script:string,css:string;
 beforeAll(async()=>{
  const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
   import {mountInspector} from './examples/three-creator/sdk-capabilities/platform/inspector.ts';
   import {getDefaultProfile,parseAssetProfile} from './examples/three-creator/sdk-capabilities/platform/profiles.ts';
   import {SPECS} from './examples/three-creator/sdk-capabilities/config.ts';
   let current='person',mode=0,interactions=0;const appliedSections=[];
   const profiles=new Map(['person',...SPECS.map(s=>s.id)].map(id=>[id,getDefaultProfile(id)])),saved=[];
   const inspector=mountInspector(document.querySelector('#host'),{
    getAssetId:()=>current,getSubject:()=>({name:current}),getProfile:id=>structuredClone(profiles.get(id)),
    applyProfile:(p,section)=>{appliedSections.push(section);profiles.set(p.assetId,parseAssetProfile(p));},saveProfile:p=>saved.push(structuredClone(p)),
    resetProfile:(id,section)=>{const p=structuredClone(profiles.get(id));p[section==='movement'?'control':'camera']=getDefaultProfile(id)[section==='movement'?'control':'camera'];profiles.set(id,p);},
    getMovement:()=>({family:SPECS.find(s=>s.id===current)?.mode??'character',control:profiles.get(current).control,velocity:[1,2,3],grounded:true}),
    getCamera:()=>({mode,distance:8,fovDegrees:60,yawRadians:0,pitchRadians:0,collisionLimited:false}),
    setCameraMode:v=>mode=v,onInteract:()=>interactions++
   });
   window.inspectorTest={ids:[...profiles.keys()],select:id=>{current=id;inspector.sync();},state:()=>({profile:profiles.get(current),saved,interactions,mode,appliedSections}),dispose:()=>inspector.dispose()};
  `},bundle:true,write:false,outdir:'inspector-test',format:'iife',platform:'browser',logLevel:'silent',loader:{'.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl','.svg':'dataurl'}});
  script=bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text;css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text;
  browser=await launchChromiumWithSystemFallback();
 });
 beforeEach(async()=>{page=await browser.newPage({viewport:{width:1000,height:950}});page.setDefaultTimeout(2000);await page.setContent('<div id="host" style="width:320px;height:900px"></div>');await page.addStyleTag({content:css});await page.addScriptTag({content:script});});
 afterEach(async()=>{await page?.close();});afterAll(async()=>{await browser?.close();});
 const state=()=>page.evaluate(()=>(window as any).inspectorTest.state());
 const control=(key:string)=>page.locator(`[data-control-field="${key}"] input[type=number]`);
 it('edits independent speed, coasting and braking values and switches family-specific fields',async()=>{
  await page.evaluate(()=>(window as any).inspectorTest.select('rover'));
  for(const [key,value]of [['maxSpeed','40'],['reverseSpeed','5'],['coastDeceleration','2'],['brakeDeceleration','25'],['brakeDamping','4'],['steeringResponse','8'],['steeringReturn','12']])await control(key!).fill(value!);
  expect((await state()).profile.control).toMatchObject({maxSpeed:40,reverseSpeed:5,coastDeceleration:2,brakeDeceleration:25,brakeDamping:4,steeringResponse:8,steeringReturn:12});
  await page.getByRole('button',{name:'保存到本地'}).click();expect((await state()).saved.at(-1).control.coastDeceleration).toBe(2);
  await page.evaluate(()=>(window as any).inspectorTest.select('sub'));await control('verticalAcceleration').fill('3');await control('linearDamping').fill('0.5');expect((await state()).profile.control.verticalAcceleration).toBe(3);
  await page.evaluate(()=>(window as any).inspectorTest.select('plane'));await control('dragQuadratic').fill('0.005');expect((await state()).profile.control.dragQuadratic).toBe(.005);expect(await control('coastDeceleration').isVisible()).toBe(false);
 });
 it('places motion and camera in one accessible keyboard-switchable tab row',async()=>{
  const motion=page.getByRole('tab',{name:'运动属性'}),camera=page.getByRole('tab',{name:'相机模式'});
  expect(await motion.getAttribute('aria-selected')).toBe('true');
  const a=await motion.boundingBox(),b=await camera.boundingBox();expect(a!.y).toBe(b!.y);
  await motion.focus();await page.keyboard.press('ArrowRight');expect(await camera.getAttribute('aria-selected')).toBe('true');
  expect(await control('speed').isVisible()).toBe(false);expect(await page.getByRole('button',{name:'跟随',exact:true}).isVisible()).toBe(true);
  await page.keyboard.press('Home');expect(await motion.getAttribute('aria-selected')).toBe('true');
 });
 it('applies controls independently per asset and resets only the active section',async()=>{
  await control('speed').fill('6');expect((await state()).profile.control.speed).toBe(6);expect((await state()).appliedSections.at(-1)).toBe('movement');
  await page.getByRole('tab',{name:'相机模式'}).click();await page.locator('[data-camera-field="distance"] input[type=number]').fill('10');
  expect((await state()).appliedSections.at(-1)).toBe('camera');
  await page.getByRole('tab',{name:'运动属性'}).click();await page.getByRole('button',{name:'恢复运动默认'}).click();
  expect((await state()).profile.control.speed).toBe(3.1);expect((await state()).profile.camera.distance).toBe(10);
  await page.evaluate(()=>(window as any).inspectorTest.select('rover'));await control('speed').fill('12');
  await page.evaluate(()=>(window as any).inspectorTest.select('person'));expect(await control('speed').inputValue()).toBe('3.1');
  await page.evaluate(()=>(window as any).inspectorTest.select('rover'));expect(await control('speed').inputValue()).toBe('12');
  await page.getByRole('button',{name:'保存到本地'}).click();expect((await state()).saved.at(-1).control.speed).toBe(12);
  await page.getByRole('tab',{name:'相机模式'}).click();await page.getByRole('button',{name:'恢复相机默认'}).click();expect((await state()).profile.control.speed).toBe(12);
 });
 it('populates all twenty subjects and applies every supported control through its inputs',async()=>{
  const results=await page.evaluate(()=>{
   const api=(window as any).inspectorTest;
   return api.ids.map((id:string)=>{api.select(id);const changes:Record<string,number>={};
    for(const row of document.querySelectorAll<HTMLElement>('[data-control-field]')){const key=row.dataset.controlField!,input=row.querySelector<HTMLInputElement>('input[type=number]')!;
     if(!row.hidden&&!input.disabled){const value=key==='dragQuadratic'?.005:key==='steer'?.3:2;input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));changes[key]=value;}}
    return {id,changes,control:api.state().profile.control};
   });
  });
  expect(results).toHaveLength(20);
  for(const result of results)for(const [key,value]of Object.entries(result.changes))expect(result.control[key]).toBe(value);
 });
 it('shows family-specific applicability, runtime values and rejects invalid edits',async()=>{
  await page.evaluate(()=>(window as any).inspectorTest.select('glider'));
  expect(await control('accel').isDisabled()).toBe(true);expect(await control('grip').isDisabled()).toBe(true);
  await page.evaluate(()=>(window as any).inspectorTest.select('patrol-boat'));expect(await control('accel').isEnabled()).toBe(true);
  const before=(await state()).profile.control.speed;await control('speed').fill('-1');await control('steer').focus();
  expect((await state()).profile.control.speed).toBe(before);expect(await control('speed').inputValue()).toBe(String(before));
  expect(await page.getByLabel('有效运动配置').textContent()).toContain('松键减速度');
  expect((await state()).interactions).toBeGreaterThan(0);
 });
});
