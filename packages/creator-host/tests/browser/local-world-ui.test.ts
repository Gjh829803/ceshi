import {test,expect} from 'vitest';
import {mkdtemp,cp,rm,readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import os from 'node:os';
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
