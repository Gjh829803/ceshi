import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import type {Browser,BrowserContext,Page} from 'playwright';
import {deterministicCaptureBrowserLaunchOptions,launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';
import {decodeFrame,parseClientMessage,parseVideoSettings,type VideoSettings,parseJsonMessage,MAX_CONTROL_BYTES,MAX_MEDIA_BYTES,type ProducerMessage,type SessionDescriptor,type UiClock,validateUiClock} from '@worldkit/stream-protocol';
import {loadWorlds,buildProducerScript,type StreamWorld} from './build.js';

interface Viewer {id:string;ui:boolean;clock:boolean;control?:WebSocket;media?:WebSocket;lastInput:number}
interface Session {
  id:string;epoch:number;video:VideoSettings;configuring?:boolean;world:StreamWorld;token:string;producerToken:string;
  context?:BrowserContext;page?:Page;control?:WebSocket;producerMedia?:WebSocket;
  viewers:Map<string,Viewer>;controller?:string;inputSequence:number;
  uiClock?:UiClock;config?:ProducerMessage;snapshot?:ProducerMessage;commits:ProducerMessage[];actions:Set<string>;
  status:'starting'|'running'|'failed'|'stopped';error?:string;ready?:()=>void;
  idleTimer?:ReturnType<typeof setTimeout>;stopping?:Promise<void>;
}
export interface StreamHostOptions {worldsDirectory:string;webRoot?:string;port?:number;headless?:boolean;fps?:number;bitrate?:number;width?:number;height?:number;allowedOrigins?:readonly string[];idleSessionTimeoutMs?:number}
export interface StreamHost {baseUrl:string;close():Promise<void>;sessions():{id:string;status:string;epoch:number}[];inspectSession(id:string):Promise<unknown>}
const send=(socket:WebSocket|undefined,value:unknown)=>{if(socket?.readyState===WebSocket.OPEN){if(socket.bufferedAmount>MAX_CONTROL_BYTES){socket.close(1013,'slow control consumer');return;}socket.send(JSON.stringify(value));}};
const json=(res:ServerResponse,code:number,value:unknown)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff'};
async function serveFile(res:ServerResponse,root:string,name:string):Promise<void>{
  const base=await realpath(root),file=await realpath(path.resolve(base,name));const relative=path.relative(base,file);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('STREAM_FILE_OUTSIDE_ROOT');
  const bytes=await readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]??'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(bytes);
}
async function body(req:IncomingMessage):Promise<Record<string,unknown>>{let bytes=0,parts:Buffer[]=[];for await(const part of req){bytes+=part.length;if(bytes>64*1024)throw new Error('STREAM_BODY_TOO_LARGE');parts.push(part);}return parseJsonMessage(Buffer.concat(parts).toString()||'{}');}
export async function startStreamHost(options:StreamHostOptions):Promise<StreamHost>{
  const width=options.width??1280,height=options.height??720,fps=options.fps??24,idleTimeout=options.idleSessionTimeoutMs??60_000;
  if(!Number.isSafeInteger(idleTimeout)||idleTimeout<0||idleTimeout>2_147_483_647)throw new Error('STREAM_IDLE_TIMEOUT_INVALID');
  const defaults=parseVideoSettings({width,height,fps,bitrate:options.bitrate??2_000_000});
  const worlds=await loadWorlds(options.worldsDirectory);
  const producerScript=await buildProducerScript(fileURLToPath(new URL('./producer.ts',import.meta.url)));
  const sessions=new Map<string,Session>(),requests=new Map<string,{worldId:string;video:VideoSettings;pending:Promise<Session>}>();
  let browser:Browser|undefined,browserPromise:Promise<Browser>|undefined,baseUrl='',closing=false;
  const originAllowed=(origin:string|undefined)=>!origin||origin===baseUrl||options.allowedOrigins?.includes(origin)===true;
  const sockets=new WebSocketServer({noServer:true,maxPayload:MAX_MEDIA_BYTES+65540});
  const broadcast=(s:Session,m:unknown)=>{const type=(m as {type?:string}).type;for(const v of s.viewers.values()){
    if(type?.startsWith('ui.')&&!v.ui)continue;if(type==='ui.clock'&&!v.clock)continue;send(v.control,m);
  }};
  const sendUiState=(s:Session,v:Viewer)=>{if(!v.ui)return;if(s.snapshot)send(v.control,s.snapshot);for(const m of s.commits)send(v.control,m);if(v.clock&&s.uiClock)send(v.control,{type:'ui.clock',epoch:s.epoch,clock:s.uiClock});};
  const descriptor=(s:Session):SessionDescriptor=>({protocolVersion:1,sessionId:s.id,epoch:s.epoch,worldId:s.world.id,worldBuildHash:s.world.candidate.worldBuildHash,uiBundleHash:s.world.uiBundleHash,baseUrl,accessToken:s.token,...s.video,ui:{catalog:s.world.catalog,document:s.world.document,stateSchema:s.world.stateSchema,moduleUrl:`${baseUrl}/ui/${s.world.uiBundleHash}/${s.world.manifest.module.path}`,moduleSha256:s.world.manifest.module.sha256,styles:s.world.manifest.styles.map(file=>({url:`${baseUrl}/ui/${s.world.uiBundleHash}/${file.path}`,sha256:file.sha256}))}});
  const hasViewers=(s:Session)=>[...s.viewers.values()].some(v=>v.control?.readyState===WebSocket.OPEN||v.media?.readyState===WebSocket.OPEN);
  const cancelIdle=(s:Session)=>{if(s.idleTimer)clearTimeout(s.idleTimer);delete s.idleTimer;};
  const scheduleIdle=(s:Session)=>{
    cancelIdle(s);if(!idleTimeout||closing||s.status==='starting'||s.status==='stopped'||hasViewers(s))return;
    s.idleTimer=setTimeout(()=>{delete s.idleTimer;if(!hasViewers(s))void stop(s,'idle-timeout').catch(()=>{});},idleTimeout);
    s.idleTimer.unref();
  };
  async function boot(s:Session):Promise<void>{
    cancelIdle(s);
    s.status='starting';delete s.error;
    const oldControl=s.control;delete s.control;oldControl?.close();s.producerMedia?.close();delete s.producerMedia;
    await s.context?.close();delete s.context;delete s.page;delete s.config;delete s.snapshot;delete s.uiClock;s.commits=[];s.actions.clear();s.status='starting';
    const launch=deterministicCaptureBrowserLaunchOptions();browserPromise??=launchChromiumWithSystemFallback({...launch,...(options.headless===undefined?{}:{headless:options.headless})});browser=await browserPromise;
    if(closing||s.stopping)throw new Error('STREAM_SESSION_STOPPED');
    const context=await browser.newContext({viewport:{width:s.video.width,height:s.video.height},deviceScaleFactor:1});if(closing||s.stopping){await context.close();throw new Error('STREAM_SESSION_STOPPED');}s.context=context;
    const page=await context.newPage();s.page=page;
    page.on('pageerror',error=>{s.error=error.message;broadcast(s,{type:'error',code:error.message});});
    page.on('close',()=>{if(s.page===page&&s.status==='running'){s.status='failed';broadcast(s,{type:'session.ended',reason:'producer-closed'});scheduleIdle(s);}});
    await page.goto(`${baseUrl}/world/${s.id}/index.html?producer=${s.producerToken}&ui=off`);
    await page.waitForFunction(()=>!!(window as unknown as {__WORLDKIT_STREAM_WORLD__?:unknown}).__WORLDKIT_STREAM_WORLD__,{},{timeout:30_000});
    await page.addScriptTag({content:producerScript});
    let readyTimeout:ReturnType<typeof setTimeout>;
    const ready=new Promise<void>((resolve,reject)=>{readyTimeout=setTimeout(()=>reject(new Error(s.error??'STREAM_PRODUCER_READY_TIMEOUT')),15_000);s.ready=()=>{clearTimeout(readyTimeout);resolve();};});
    try{await Promise.all([ready,page.evaluate(async serialized=>{
      const opts=JSON.parse(serialized);
      const global=window as unknown as {WorldkitStreamProducer:{startProducer:(options:unknown)=>Promise<unknown>}};
      try{await global.WorldkitStreamProducer.startProducer(opts);}catch(error){
        // SDK failures are structured objects; preserve their diagnostic across
        // Playwright instead of reducing them to the unhelpful "Object".
        throw error instanceof Error?error:new Error(JSON.stringify(error));
      }
    },JSON.stringify({sessionId:s.id,epoch:s.epoch,baseUrl,token:s.producerToken,...s.video,catalog:s.world.catalog,document:s.world.document,stateSchema:s.world.stateSchema}))]);}finally{clearTimeout(readyTimeout!);delete s.ready;}
    if(closing||s.stopping)throw new Error('STREAM_SESSION_STOPPED');s.status='running';scheduleIdle(s);
  }
  function stop(s:Session,reason='stopped'):Promise<void>{
    if(s.stopping)return s.stopping;
    s.status='stopped';cancelIdle(s);
    s.stopping=(async()=>{
      send(s.control,{type:'input.release',epoch:s.epoch});broadcast(s,{type:'session.ended',reason});
      s.control?.close();s.producerMedia?.close();for(const v of s.viewers.values()){v.control?.close();v.media?.close();}
      try{await s.context?.close();}finally{sessions.delete(s.id);s.viewers.clear();delete s.context;delete s.page;delete s.config;delete s.snapshot;delete s.uiClock;s.commits=[];s.actions.clear();}
    })();return s.stopping;
  }
  async function create(worldId:string,video:VideoSettings):Promise<Session>{
    if(closing)throw new Error('STREAM_HOST_CLOSING');const world=worlds.find(w=>w.id===worldId);if(!world)throw new Error('STREAM_WORLD_UNKNOWN');
    if(sessions.size>=4)throw new Error('STREAM_SESSION_LIMIT');
    const s:Session={id:randomUUID(),epoch:0,video,world,token:randomBytes(24).toString('hex'),producerToken:randomBytes(24).toString('hex'),viewers:new Map(),inputSequence:0,commits:[],actions:new Set(),status:'starting'};sessions.set(s.id,s);
    try{await boot(s);return s;}catch(error){await stop(s);throw error;}
  }
  const server=createServer((req,res)=>{void (async()=>{
    const u=new URL(req.url??'/',baseUrl||'http://127.0.0.1');
    // Local control service: reject browser cross-origin mutations / websocket hijacking.
    if(!originAllowed(req.headers.origin)){json(res,403,{error:'STREAM_ORIGIN_DENIED'});return;}
    if(req.headers.origin){res.setHeader('access-control-allow-origin',req.headers.origin);res.setHeader('vary','Origin');res.setHeader('access-control-allow-methods','GET, POST, DELETE, OPTIONS');res.setHeader('access-control-allow-headers','Authorization, Content-Type, Idempotency-Key');}
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    if(u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(req.method==='GET'&&u.pathname==='/v1/worlds'){json(res,200,worlds.map(w=>({id:w.id,name:w.name,worldBuildHash:w.candidate.worldBuildHash})));return;}
    if(req.method==='POST'&&u.pathname==='/v1/sessions'){
      const input=await body(req),key=String(req.headers['idempotency-key']??randomUUID());
      const worldId=String(input.worldId),video=input.video===undefined?{...defaults}:parseVideoSettings(input.video),previous=requests.get(key);
      if(previous&&(previous.worldId!==worldId||JSON.stringify(previous.video)!==JSON.stringify(video))){json(res,409,{error:'STREAM_IDEMPOTENCY_CONFLICT'});return;}
      if(!previous){if(requests.size>=4096)throw new Error('STREAM_REQUEST_HISTORY_LIMIT');const pending=create(worldId,video);requests.set(key,{worldId,video:{...video},pending});void pending.catch(()=>requests.delete(key));}
      const s=await requests.get(key)!.pending;if(s.status==='stopped'){json(res,410,{error:'STREAM_SESSION_STOPPED'});return;}json(res,201,descriptor(s));return;
    }
    const sessionMatch=/^\/v1\/sessions\/([^/]+)(\/(?:reset|video))?$/.exec(u.pathname);
    if(sessionMatch){const s=sessions.get(sessionMatch[1]!);if(!s){json(res,404,{error:'STREAM_SESSION_UNKNOWN'});return;}
      if(req.headers.authorization!==`Bearer ${s.token}`){json(res,403,{error:'STREAM_ACCESS_DENIED'});return;}
      if(req.method==='DELETE'){await stop(s);json(res,200,{status:'stopped'});return;}
      if(req.method==='POST'&&sessionMatch[2]==='/video'){
        if(s.status!=='running'||s.configuring||!s.page){json(res,409,{error:'STREAM_VIDEO_BUSY'});return;}
        const next=parseVideoSettings(await body(req));if(Math.abs(next.width/next.height-s.video.width/s.video.height)>.01)throw new Error('STREAM_VIDEO_ASPECT_MISMATCH');
        s.configuring=true;try{
          await s.page.evaluate(async video=>{const port=window.__WORLDKIT_STREAM_CONTROL__;if(!port)throw new Error('STREAM_VIDEO_CONTROL_UNAVAILABLE');await port.configureVideo(video);},next);
          s.video={...next};broadcast(s,{type:'session.video',epoch:s.epoch,video:next});json(res,200,descriptor(s));
        }finally{s.configuring=false;}return;
      }
      if(req.method==='POST'&&sessionMatch[2]==='/reset'){if(s.status==='starting'||s.configuring){json(res,409,{error:'STREAM_RESET_IN_PROGRESS'});return;}s.epoch++;broadcast(s,{type:'session.reset',epoch:s.epoch});try{await boot(s);}catch(error){if(!s.stopping){s.status='failed';s.error=String(error);await s.context?.close();broadcast(s,{type:'session.ended',reason:'reset-failed'});scheduleIdle(s);}throw error;}json(res,200,descriptor(s));return;}
      if(req.method==='GET'){json(res,200,{...descriptor(s),status:s.status,error:s.error});return;}
    }
    const worldPath=/^\/world\/([^/]+)\/(.*)$/.exec(u.pathname);
    if(worldPath){const s=sessions.get(worldPath[1]!);if(!s)throw new Error('STREAM_WORLD_SESSION_UNKNOWN');
      // All resources in a producer context carry a context cookie. A second index cannot claim this producer.
      if(worldPath[2]==='index.html'){
        if(u.searchParams.get('producer')!==s.producerToken)throw new Error('STREAM_PRODUCER_LEASE_REQUIRED');
        res.setHeader('set-cookie',`producer-${s.id}=${s.producerToken}; HttpOnly; SameSite=Strict; Path=/world/${s.id}/`);
      }else if(!req.headers.cookie?.includes(`producer-${s.id}=${s.producerToken}`))throw new Error('STREAM_PRODUCER_ACCESS_DENIED');
      await serveFile(res,s.world.candidate.playableRoot,decodeURIComponent(worldPath[2]!));return;
    }
    const uiPath=/^\/ui\/([a-f0-9]+)\/(.*)$/.exec(u.pathname);
    if(uiPath){const world=worlds.find(w=>w.uiBundleHash===uiPath[1]);if(!world)throw new Error('STREAM_UI_UNKNOWN');
      const relative=decodeURIComponent(uiPath[2]!);const allowed=[world.manifest.module,...world.manifest.styles,...world.manifest.assets];if(!allowed.some(f=>f.path===relative))throw new Error('STREAM_UI_FILE_UNKNOWN');
      await serveFile(res,path.join(world.candidate.playableRoot,'world-ui'),relative);return;
    }
    if(options.webRoot&&req.method==='GET'){await serveFile(res,options.webRoot,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1)));return;}
    json(res,404,{error:'STREAM_NOT_FOUND'});
  })().catch(error=>{if(!res.headersSent)json(res,400,{error:error instanceof Error?error.message:String(error)});else res.end();});});
  server.on('upgrade',(req,socket,head)=>{
    const u=new URL(req.url??'/',baseUrl),match=/^\/v1\/sessions\/([^/]+)\/(control|media|producer-control|producer-media)$/.exec(u.pathname);
    const s=match&&sessions.get(match[1]!);const channel=match?.[2],producer=channel?.startsWith('producer-');
    if(!s||s.status==='stopped'||!originAllowed(req.headers.origin)||u.searchParams.get('token')!==(producer?s.producerToken:s.token)){socket.destroy();return;}
    sockets.handleUpgrade(req,socket,head,ws=>{
      if(channel==='producer-control'){
        if(s.control?.readyState===WebSocket.OPEN){ws.close(1008,'duplicate producer');return;}s.control=ws;
        ws.on('close',()=>{
          if(s.control!==ws||s.status!=='running')return;
          // Includes exhausted producer media recovery: dispose closes control.
          s.status='failed';broadcast(s,{type:'session.ended',reason:s.error??'producer-control-closed'});
          void s.context?.close().catch(()=>{});scheduleIdle(s);
        });
        ws.on('message',(data,isBinary)=>{try{
          if(isBinary||(Array.isArray(data)?Buffer.concat(data).length:data.byteLength)>MAX_CONTROL_BYTES)throw new Error('STREAM_CONTROL_INVALID');const m=parseJsonMessage(data.toString()) as unknown as ProducerMessage;
          if(m.type==='producer.ready'){s.ready?.();return;}
          if(m.type==='producer.error'){s.error=m.message;broadcast(s,{type:'error',code:m.message});return;}
          if(!('epoch' in m)||m.epoch!==s.epoch)return;
          if(m.type==='ui.clock'){validateUiClock(m.clock);s.uiClock=m.clock;}
          if(m.type==='media.config')s.config=m;
          if(m.type==='ui.snapshot'){s.snapshot=m;s.commits=s.commits.filter(c=>c.type==='ui.commit'&&c.commit.revision>m.snapshot.revision);}
          if(m.type==='ui.commit'){s.commits.push(m);if(s.commits.length>1024){s.commits=[];send(s.control,{type:'ui.resync',epoch:s.epoch});}}
          broadcast(s,m);
        }catch(error){ws.close(1008,String(error).slice(0,100));}});
      }else if(channel==='producer-media'){
        s.producerMedia?.close();s.producerMedia=ws;send(s.control,{type:'media.keyframe',epoch:s.epoch});
        ws.on('message',(data,isBinary)=>{try{
          if(!isBinary)throw new Error('STREAM_MEDIA_BINARY_REQUIRED');const packet=Buffer.isBuffer(data)?data:Buffer.from(data as ArrayBuffer);const {header}=decodeFrame(packet);
          if(s.producerMedia!==ws||header.sessionId!==s.id||header.epoch!==s.epoch)return;
          for(const v of s.viewers.values())if(v.media?.readyState===WebSocket.OPEN){if(v.media.bufferedAmount>MAX_MEDIA_BYTES)v.media.close(1013,'slow media consumer');else v.media.send(packet);}
        }catch(error){ws.close(1008,String(error).slice(0,100));}});
      }else{
        const clientId=u.searchParams.get('clientId');if(!clientId||clientId.length>128){ws.close(1008,'client id');return;}
        let v=s.viewers.get(clientId);if(!v){v={id:clientId,lastInput:-1,ui:u.searchParams.get('ui')!=='0',clock:u.searchParams.get('clock')==='1'};s.viewers.set(clientId,v);}const viewer=v;cancelIdle(s);
        if(channel==='control'){
          viewer.control?.close();viewer.control=ws;viewer.ui=u.searchParams.get('ui')!=='0';viewer.clock=viewer.ui&&u.searchParams.get('clock')==='1';if(!s.controller)s.controller=clientId;
          send(ws,{type:'session.ready',epoch:s.epoch,role:s.controller===clientId?'controller':'spectator'});
          if(s.config)send(ws,s.config);send(ws,{type:'stream.subscribed',epoch:s.epoch,ui:viewer.ui,clock:viewer.clock});sendUiState(s,viewer);
          send(s.control,{type:'media.keyframe',epoch:s.epoch});
          ws.on('message',(data)=>{try{
            const m=parseClientMessage(data.toString());if(m.epoch!==s.epoch)return;
            if(m.type==='stream.subscribe'){
              viewer.ui=m.ui;viewer.clock=m.clock;send(ws,{type:'stream.subscribed',epoch:s.epoch,ui:m.ui,clock:m.clock});sendUiState(s,viewer);
              if(m.ui)send(s.control,{type:'ui.resync',epoch:s.epoch});return;
            }
            if(m.type==='ui.resync'){send(s.control,m);send(s.control,{type:'media.keyframe',epoch:s.epoch});return;}
            if(s.controller!==clientId)throw new Error('STREAM_SPECTATOR_INPUT');
            if(m.type==='input.state'){if(m.input.sequence<=viewer.lastInput)return;viewer.lastInput=m.input.sequence;send(s.control,{...m,clientId,clientSequence:m.input.sequence,input:{...m.input,sequence:++s.inputSequence}});}
            else if(m.type==='input.action'){if(s.actions.has(m.actionId))return;if(s.actions.size>=4096)throw new Error('STREAM_ACTION_HISTORY_LIMIT');s.actions.add(m.actionId);send(s.control,m);}
            else send(s.control,m);
          }catch(error){send(ws,{type:'error',code:String(error)});}});
          ws.on('close',()=>{if(viewer.control!==ws)return;delete viewer.control;if(s.controller===clientId){delete s.controller;send(s.control,{type:'input.release',epoch:s.epoch});}if(!viewer.media)s.viewers.delete(clientId);scheduleIdle(s);});
        }else{
          viewer.media?.close();viewer.media=ws;send(s.control,{type:'media.keyframe',epoch:s.epoch});
          ws.on('close',()=>{if(viewer.media===ws)delete viewer.media;if(!viewer.control)s.viewers.delete(clientId);scheduleIdle(s);});
        }
      }
    });
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port??53900,'127.0.0.1',()=>resolve());});
  const address=server.address();if(!address||typeof address==='string')throw new Error('STREAM_LISTEN_FAILED');baseUrl=`http://127.0.0.1:${address.port}`;
  return {baseUrl,async inspectSession(id){const s=sessions.get(id);if(!s?.page)throw new Error('STREAM_SESSION_UNKNOWN');return JSON.parse(await s.page.evaluate(()=>{const b=window.__WORLDKIT_STREAM_WORLD__!;return JSON.stringify({snapshot:b.world.snapshot(),ui:b.readUiState()});}));},sessions:()=>[...sessions.values()].map(s=>({id:s.id,status:s.status,epoch:s.epoch})),async close(){if(closing)return;closing=true;await Promise.allSettled([...sessions.values()].map(s=>stop(s)));for(const ws of sockets.clients)ws.terminate();sockets.close();await browser?.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
