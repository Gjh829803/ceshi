import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launchChromiumWithSystemFallback} from '../../../scripts/lib/playwright-browser-launch';

const output=path.resolve(process.argv[3]??'output/playwright/motion-families');
await mkdir(output,{recursive:true});
const browser=await launchChromiumWithSystemFallback();
const page=await browser.newPage({viewport:{width:1500,height:1000}});
const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(process.argv[2]??'http://127.0.0.1:5194');
  await page.waitForFunction(()=>!!(window as any).playground?.getState().ready,{},{timeout:60000});
  const before=await page.evaluate(()=>(window as any).playground.getState());
  await page.getByText('七大类能力目录',{exact:true}).click();
  const family=page.getByRole('combobox',{name:'运动大类',exact:true});
  const subtype=page.getByRole('combobox',{name:'运动小类',exact:true});
  const names=['人','车类','水面船类','飞机类','飞行生物类','水里类','太空类'];
  await family.click();assert.deepEqual(await page.getByRole('option').allTextContents(),names);await page.keyboard.press('Escape');
  for(const name of names){
    await family.click();await page.getByRole('option',{name,exact:true}).click();
    assert.equal(await page.locator('[data-motion-subtype-status]').getAttribute('data-motion-subtype-status'),'implemented');
    assert((await page.getByRole('list',{name:'小类参数范围'}).locator('li').count())>0);
  }
  await family.click();await page.getByRole('option',{name:'飞机类',exact:true}).click();
  await subtype.click();await page.getByRole('option',{name:'旋翼飞机',exact:true}).click();
  assert.equal(await page.locator('[data-motion-subtype-status]').getAttribute('data-motion-subtype-status'),'reserved');
  assert.equal(await page.getByRole('list',{name:'小类参数范围'}).locator('li').count(),0);
  await subtype.click();await page.getByRole('option',{name:'固定翼飞机',exact:true}).click();
  await page.screenshot({path:path.join(output,'seven-family-catalog.png')});
  const after=await page.evaluate(()=>(window as any).playground.getState());
  assert.equal(after.activeVehicle,before.activeVehicle);assert.deepEqual(after.movement.control,before.movement.control);
  assert.deepEqual(errors,[]);
  const results={families:names,reservedSubtypeVerified:true,browsingPreservesActiveControls:true,errors};
  await writeFile(path.join(output,'catalog-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
