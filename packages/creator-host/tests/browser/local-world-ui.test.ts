import {test,expect} from 'vitest';
import {mkdtemp,cp,rm,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import type {Page} from 'playwright';
import {ThreeCreatorTools} from '../../src/tools/tools.js';
import {executeThreeCreatorTool} from '../../src/tools/tool-dispatch.js';
import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';
import {ThreeCompiler,isWithin} from '../../src/compiler/compiler.js';

test('local preview reuses authored UI and actions without sockets; capture query never mounts a second presentation',async()=>{
  const workspace=await mkdtemp(path.join(os.tmpdir(),'local-world-ui-'));
  await cp('examples/three-creator/streaming-ui',workspace,{recursive:true,filter:source=>!source.includes('.three-creator')});
  const candidate=await new ThreeCompiler(workspace,'three-sdk').prepare();
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url!,'http://localhost'),file=path.resolve(candidate.playableRoot,'.'+(url.pathname==='/'?'/index.html':url.pathname));
      if(!isWithin(candidate.playableRoot,file)){res.writeHead(403).end();return;}
      const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css'};
      res.writeHead(200,{'content-type':mime[path.extname(file)]??'application/octet-stream'});res.end(await readFile(file));
    }catch{res.writeHead(404).end();}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address() as {port:number},base=`http://127.0.0.1:${address.port}/`;
  const browser=await launchChromiumWithSystemFallback({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:960,height:540}}),errors:string[]=[],requests:string[]=[];
    let sockets=0;page.on('websocket',()=>sockets++);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',request=>requests.push(request.url()));
    await page.goto(base);
    await expect.poll(()=>page.locator('[data-health-value]').textContent()).toContain('100');
    expect(await page.locator('[data-worldkit-presentation]').count()).toBe(1);
    await page.getByRole('button',{name:'受到伤害 −20'}).click();
    await expect.poll(()=>page.locator('[data-health-value]').textContent()).toContain('80');
    expect(await page.evaluate(()=>window.__WORLDKIT_STREAM_WORLD__!.readUiState())).toMatchObject({player:{health:80}});
    await page.setViewportSize({width:800,height:700});
    const health=page.locator('[data-world-ui-node="health"]');
    await expect.poll(async()=>Math.round((await health.boundingBox())!.width)).toBe(Math.round(346*800/1280));
    await page.evaluate(()=>window.__WORLDKIT_STREAM_WORLD__!.world.reset());
    await expect.poll(()=>page.locator('[data-health-value]').textContent()).toContain('100');
    await page.getByRole('button',{name:'受到伤害 −20'}).click();
    await expect.poll(()=>page.locator('[data-health-value]').textContent()).toContain('80');
    expect(sockets).toBe(0);
    requests.length=0;
    await page.goto(base+'?ui=off');
    await page.waitForFunction(()=>!!window.__WORLDKIT_STREAM_WORLD__);
    expect(await page.locator('[data-world-ui-local]').count()).toBe(0);
    expect(requests.some(url=>url.includes('local-preview.js'))).toBe(false);
    await page.evaluate(()=>{const world=window.__WORLDKIT_STREAM_WORLD__!.world,presentation=world.createPresentation(),input=world.acquireRemoteInput();input.dispose();presentation.dispose();});
    await page.goto(base+'?ui=on');
    await expect.poll(()=>page.locator('[data-health-value]').textContent()).toContain('100');
    await page.evaluate(()=>window.__WORLDKIT_STREAM_WORLD__!.world.dispose());
    expect(await page.locator('[data-world-ui-local]').count()).toBe(0);
    expect(errors).toEqual([]);
  }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(workspace,{recursive:true,force:true});}
},60000);


test('Agent UI previews compose frozen state, preserve clean captures and clean up after failures',async()=>{
  const workspace=await mkdtemp(path.join(os.tmpdir(),'creator-ui-capture-'));
  const tools=new ThreeCreatorTools(workspace,'three-sdk');
  try{
    await cp('examples/three-creator/streaming-ui',workspace,{recursive:true,filter:source=>!source.includes('.three-creator')});
    const styles=path.join(workspace,'ui/styles.css');
    await writeFile(styles,(await readFile(styles,'utf8'))+'\n.health {background:rgb(255,0,128)!important}');
    const preview=async(args:Record<string,unknown>)=>{
      const op=await executeThreeCreatorTool(tools,'world_preview',args) as {operationId:string};
      const result=await tools.getOperation(op.operationId,25);
      expect(result.status,JSON.stringify(result)).toBe('succeeded');return result.result;
    };
    await expect(executeThreeCreatorTool(tools,'world_preview',{includeUi:'yes'})).rejects.toThrow();
    await expect(tools.preview('top-down',[],undefined,true)).rejects.toThrow('UI_VIEW_INVALID');
    const clean=await preview({view:'opening',includeUi:false});
    const page=(tools as unknown as {session:{page:Page}}).session.page;
    const before=await page.evaluate(()=>window.__WORLDKIT_EVAL__!.snapshot!());
    const ui=await preview({view:'current'});
    expect(ui.ui).toMatchObject({included:true,sample:{simulationTick:before.simulationTick},animation:'state-snapshot'});
    expect(await page.evaluate(()=>window.__WORLDKIT_EVAL__!.snapshot!())).toEqual(before);
    const pixel=async(file:string)=>[...(await sharp(file).removeAlpha().extract({left:40,top:40,width:1,height:1}).raw().toBuffer())];
    expect(await pixel(ui.image.path)).toEqual([255,0,128]);
    expect(await pixel(clean.image.path)).not.toEqual([255,0,128]);
    expect((await preview({view:'current',includeUi:false})).image.sha256).toBe(clean.image.sha256);
    expect(await page.locator('[data-world-ui-capture]').count()).toBe(0);
    expect(await page.locator('[data-worldkit-presentation]').count()).toBe(0);
    // State changes are read at capture, even while the SDK is paused.
    await page.evaluate(()=>window.__WORLDKIT_STREAM_WORLD__!.actions!.damage!({}));
    const changed=await preview({view:'current',includeUi:true});expect(changed.image.sha256).not.toBe(ui.image.sha256);
    const captures=await tools.triviews();
    expect(captures.images.every((image:any)=>image.ui.included===false)).toBe(true);
    expect(await pixel(captures.images[0].image.path)).not.toEqual([255,0,128]);
    // Bad CSS is an actionable error, never a successful screenshot lacking styles.
    await page.route('**/world-ui/*.css',route=>route.abort());
    await expect(tools.preview('current')).rejects.toThrow('UI_PREVIEW_STYLESHEET_FAILED');
    expect(await page.locator('[data-world-ui-capture]').count()).toBe(0);
    await page.unroute('**/world-ui/*.css');
    await preview({view:'current'});
    // A preview must not prevent the production owner from acquiring leases afterward.
    await page.evaluate(()=>{const world=window.__WORLDKIT_STREAM_WORLD__!.world,p=world.createPresentation(),input=world.acquireRemoteInput();input.dispose();p.dispose();});
    await page.evaluate(()=>window.__WORLDKIT_STREAM_WORLD__!.world.start());
    const live=await preview({view:'current'});
    expect(live.ui.included).toBe(true);
    expect(await page.evaluate(()=>window.__WORLDKIT_EVAL__!.snapshot!().isRunning)).toBe(true);
    await page.evaluate(()=>window.__WORLDKIT_STREAM_WORLD__!.world.stop());
    // json-render's error boundary logs and hides a broken widget; the Host must report failure.
    const components=path.join(workspace,'ui/components.tsx');
    await writeFile(components,(await readFile(components,'utf8')).replace('return <section className="health"', 'throw new Error("HUD_TEST_RENDER_ERROR");return <section className="health"'));
    await expect(tools.preview('opening')).rejects.toThrow('HUD_TEST_RENDER_ERROR');
    const failurePage=(tools as unknown as {session:{page:Page}}).session.page;
    expect(await failurePage.locator('[data-world-ui-capture]').count()).toBe(0);
    const project=JSON.parse(await readFile(path.join(workspace,'project.json'),'utf8'));delete project.ui;
    await writeFile(path.join(workspace,'project.json'),JSON.stringify(project));
    const without=await preview({view:'opening'});expect(without.ui).toEqual({included:false,reason:'not-defined'});
  }finally{await tools.close();await rm(workspace,{recursive:true,force:true});}
},120000);
