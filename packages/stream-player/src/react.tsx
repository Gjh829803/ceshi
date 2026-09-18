/// <reference types="@types/dom-webcodecs" />
import * as React from 'react';
import {createPortal} from 'react-dom';
import {WorldUiRenderer,PresentedUiStore,createWorldUiRuntime,type WorldUiModule} from '@worldkit/world-ui/react';
import {validateUiInsets,type UiInsets,type UiSnapshot,type JsonValue} from '@worldkit/world-ui/schema';
import {decodeFrame,parseJsonMessage,type SessionDescriptor,type FrameHeader,type CodecConfig,type ServerMessage,type InputState,type VideoSettings,parseVideoSettings,type UiClock,validateUiClock,type SourceDiagnostics,validateSourceDiagnostics} from '@worldkit/stream-protocol';
import {PresentationCoordinator} from './core.js';
import {ReceiptTimings} from './diagnostics.js';

export type StreamConnectionStatus='connecting'|'open'|'closed'|'error'|'disabled';
export interface PlayerConnections {ui:'subscribing'|'subscribed'|'paused';control:StreamConnectionStatus;media:StreamConnectionStatus;role:'controller'|'spectator'|'unassigned'}
export interface PlayerEvent {timestampMs:number;type:'control.connection'|'media.connection'|'ui.subscription'|'ui.resync'|'view.mode'|'session.ready'|'session.reset'|'session.ended'|'video.settings'|'error';value:string;level:'info'|'warning'|'error'}
export interface PlayerDiagnostics {
  uiCommitsPerSecond:number;uiSnapshotsPerSecond:number;uiClocksPerSecond:number;
  inputAckMs:number|null;inputAckP95Ms:number|null;inputAckSamples:number;
  sourceDiagnostics:SourceDiagnostics|null;sourceDiagnosticsAgeMs:number;
  frames:number;sourceTimeUs:number;simulationTick:number;uiRevision:number;unmappedFrames:number;lastInputTick?:number;
  uiMessagesPerSecond:number;uiKbps:number;inputMessagesPerSecond:number;inputEventsPerSecond:number;uiFramesPerSecond:number;lastUiAgeMs:number;lastInputAckAgeMs:number;
  framesPerSecond:number;mediaKbps:number;lastFrameAgeMs:number;decodeQueueSize:number;droppedFrames:number;codec:string;
}
export type PlayerViewMode='combined'|'video'|'ui';
export interface WorldStreamPlayerProps {
  /** Insets in displayed CSS pixels, relative to the video surface. Defaults to zero. */
  safeAreaInsets?:UiInsets;
  viewMode?:PlayerViewMode;onVideoSettingsChange?:(video:VideoSettings)=>void;
  session:SessionDescriptor;interactive?:boolean;
  onEvent?:(event:PlayerEvent)=>void;
  onConnectionsChange?:(value:PlayerConnections)=>void;onStatusChange?:(status:string)=>void;onDiagnostics?:(value:PlayerDiagnostics)=>void;onError?:(error:Error)=>void;
}
async function checkedBytes(url:string,hash:string):Promise<ArrayBuffer>{
  const response=await fetch(url);if(!response.ok)throw new Error(`UI_FETCH_${response.status}`);
  const bytes=await response.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
  if(digest!==hash)throw new Error('UI_RESOURCE_HASH_MISMATCH');return bytes;
}
export function WorldStreamPlayer(props:WorldStreamPlayerProps):React.ReactElement {
  const {session}=props;
  validateUiInsets(props.safeAreaInsets??{});
  const [layoutViewport,setLayoutViewport]=React.useState({...session.ui.document.designViewport,scale:1});
  const safeAreaInsets=Object.fromEntries(Object.entries(props.safeAreaInsets??{}).map(([edge,value])=>[edge,value/layoutViewport.scale])) as UiInsets;
  const canvas=React.useRef<HTMLCanvasElement>(null),overlay=React.useRef<HTMLDivElement>(null),surface=React.useRef<HTMLDivElement>(null);
  const callbacks=React.useRef(props);callbacks.current=props;
  const sendRef=React.useRef<(value:unknown)=>void>(()=>{}),epochRef=React.useRef(session.epoch),controller=React.useRef(false);
  const [ui,setUi]=React.useState<{root:HTMLDivElement;module:WorldUiModule;store:PresentedUiStore}|null>(null);
  const modeChange=React.useRef<()=>void>(()=>{}),stopInput=React.useRef<()=>void>(()=>{});
  const [status,setStatus]=React.useState('connecting');
  const action=React.useCallback((name:string,params:Record<string,JsonValue>)=>{
    if(controller.current&&callbacks.current.interactive!==false)sendRef.current({type:'input.action',epoch:epochRef.current,actionId:crypto.randomUUID(),name,params});
  },[]);
  React.useEffect(()=>{
    const display=canvas.current!,host=overlay.current!,target=surface.current!;
    const root=host.shadowRoot??host.attachShadow({mode:'open'});root.replaceChildren();
    const mount=document.createElement('div');mount.style.cssText=`position:absolute;inset:0;width:${session.ui.document.designViewport.width}px;height:${session.ui.document.designViewport.height}px;transform-origin:top left`;root.append(mount);
    const updateLayout=()=>{const rect=target.getBoundingClientRect(),scale=rect.width/session.ui.document.designViewport.width;if(scale<=0||rect.height<=0)return;
      const viewport={width:session.ui.document.designViewport.width,height:rect.height/scale,scale};
      mount.style.height=`${viewport.height}px`;mount.style.transform=`scale(${scale})`;
      setLayoutViewport(previous=>previous.width===viewport.width&&previous.height===viewport.height&&previous.scale===scale?previous:viewport);
    };
    const resize=new ResizeObserver(updateLayout);resize.observe(target);updateLayout();
    let mode=callbacks.current.viewMode??'combined';
    const needsVideo=()=>mode!=='ui',needsUi=()=>mode!=='video';
    const store=new PresentedUiStore(),coordinator=new PresentationCoordinator(session.sessionId,session.epoch);
    let disposed=false,module:WorldUiModule|undefined,moduleUrl:string|undefined,control:WebSocket|undefined,media:WebSocket|undefined;
    let generation=-1,decoder:VideoDecoder|undefined,configKey='',waitingKey=true,frames=0,unmappedFrames=0,lastSource=-1;
    let controlRetry:ReturnType<typeof setTimeout>|undefined,mediaRetry:ReturnType<typeof setTimeout>|undefined,ended=false,raf=0,readyUi=false,mountedUi=false,lastResync=0,lastInputTick:number|undefined;
    const frameMap=new Map<number,FrameHeader>(),decoded:{image:VideoFrame;header:FrameHeader;received:number}[]=[];
    const pending:{header:FrameHeader;payload:Uint8Array<ArrayBuffer>}[]=[];
    const clientId=crypto.randomUUID();epochRef.current=session.epoch;
    let connections:PlayerConnections={control:'connecting',media:needsVideo()?'closed':'disabled',ui:needsUi()?'subscribing':'paused',role:'unassigned'};
    const emit=(type:PlayerEvent['type'],value:string,level:PlayerEvent['level']='info')=>{if(!disposed)callbacks.current.onEvent?.({timestampMs:Date.now(),type,value:value.slice(0,500),level});};
    const connection=(patch:Partial<PlayerConnections>)=>{
      for(const channel of ['control','media','ui'] as const){const value=patch[channel];if(value!==undefined&&value!==connections[channel])emit(channel==='ui'?'ui.subscription':`${channel}.connection`,value,value==='error'?'error':value==='closed'?'warning':'info');}
      connections={...connections,...patch};if(!disposed)callbacks.current.onConnectionsChange?.({...connections});
    };
    let receivedBytes=0,droppedFrames=0,codec='—',lastPresentedAt=0,lastHeader:FrameHeader|undefined;
    let latestClock:UiClock|undefined,presentedClock:UiClock|undefined,cachedConfig:{config:CodecConfig;generation:number}|undefined;
    const receiptTimings=new ReceiptTimings();
    let sourceDiagnostics:SourceDiagnostics|null=null,sourceDiagnosticsAt=0;
    let uiCommits=0,uiSnapshots=0,uiClocks=0,measuredCommits=0,measuredSnapshots=0,measuredClocks=0;
    let uiMessages=0,uiBytes=0,inputPackets=0,inputEvents=0,uiFrames=0,lastUiAt=0,lastAckAt=0;
    let measuredAt=performance.now(),measuredFrames=0,measuredBytes=0,measuredUi=0,measuredUiBytes=0,measuredInputs=0,measuredEvents=0,measuredUiFrames=0;
    const diagnosticsTimer=setInterval(()=>{
      if(disposed)return;const now=performance.now(),seconds=(now-measuredAt)/1000,source=mode==='ui'?presentedClock:undefined;
      const receipt=receiptTimings.snapshot();
      callbacks.current.onDiagnostics?.({
        uiCommitsPerSecond:(uiCommits-measuredCommits)/seconds,uiSnapshotsPerSecond:(uiSnapshots-measuredSnapshots)/seconds,uiClocksPerSecond:(uiClocks-measuredClocks)/seconds,
        inputAckMs:receipt.latestMs,inputAckP95Ms:receipt.p95Ms,inputAckSamples:receipt.sampleCount,
        sourceDiagnostics:sourceDiagnostics&&now-sourceDiagnosticsAt<3000?sourceDiagnostics:null,sourceDiagnosticsAgeMs:sourceDiagnosticsAt?now-sourceDiagnosticsAt:-1,frames,sourceTimeUs:source?.sourceTimeUs??lastHeader?.source.sourceTimeUs??0,simulationTick:source?.simulationTick??lastHeader?.source.simulationTick??0,uiRevision:source?.uiRevision??lastHeader?.uiRevision??0,unmappedFrames,
        framesPerSecond:needsVideo()?(frames-measuredFrames)/seconds:0,mediaKbps:needsVideo()?(receivedBytes-measuredBytes)*8/seconds/1000:0,lastFrameAgeMs:lastPresentedAt?now-lastPresentedAt:0,decodeQueueSize:decoder?.decodeQueueSize??0,droppedFrames,codec,
        uiMessagesPerSecond:(uiMessages-measuredUi)/seconds,uiKbps:(uiBytes-measuredUiBytes)*8/seconds/1000,inputMessagesPerSecond:(inputPackets-measuredInputs)/seconds,inputEventsPerSecond:(inputEvents-measuredEvents)/seconds,uiFramesPerSecond:(uiFrames-measuredUiFrames)/seconds,
        lastUiAgeMs:lastUiAt?now-lastUiAt:-1,lastInputAckAgeMs:lastAckAt?now-lastAckAt:-1,...(lastInputTick===undefined?{}:{lastInputTick})});
      measuredCommits=uiCommits;measuredSnapshots=uiSnapshots;measuredClocks=uiClocks;
      measuredAt=now;measuredFrames=frames;measuredBytes=receivedBytes;measuredUi=uiMessages;measuredUiBytes=uiBytes;measuredInputs=inputPackets;measuredEvents=inputEvents;measuredUiFrames=uiFrames;
    },1000);
    const notify=(value:string)=>{if(!disposed){setStatus(value);callbacks.current.onStatusChange?.(value);}};
    const report=(error:unknown)=>{if(!disposed){const e=error instanceof Error?error:new Error(String(error));emit('error',e.message,'error');callbacks.current.onError?.(e);notify('error');}};
    const send=(message:unknown)=>{if(control?.readyState===WebSocket.OPEN){control.send(JSON.stringify(message));
      const m=message as {type:string;input?:InputState;actionId?:string};if(m.type.startsWith('input.'))inputPackets++;
      if(m.type==='input.action'||(m.input&&(m.input.heldKeys.length||m.input.keyEdges.length||m.input.yawDeltaRadians||m.input.pitchDeltaRadians||m.input.distanceDeltaMeters))){inputEvents++;receiptTimings.sent(m.input?`input:${m.input.sequence}`:`action:${m.actionId}`);}
    }};sendRef.current=send;
    const resync=()=>{if(performance.now()-lastResync>300){lastResync=performance.now();send({type:'ui.resync',epoch:epochRef.current});emit('ui.resync','requested','warning');}};
    const clearMedia=()=>{for(const f of decoded.splice(0))f.image.close();frameMap.clear();pending.length=0;decoder?.close();decoder=undefined;configKey='';waitingKey=true;};
    const socketUrl=(channel:string)=>{const url=new URL(`/v1/sessions/${session.sessionId}/${channel}`,session.baseUrl);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('token',session.accessToken);url.searchParams.set('clientId',clientId);url.searchParams.set('ui',needsUi()?'1':'0');url.searchParams.set('clock',mode==='ui'?'1':'0');return url.toString();};
    const decode=(packet:{header:FrameHeader;payload:Uint8Array<ArrayBuffer>})=>{
      if(!needsVideo())return;const h=packet.header;if(h.epoch!==epochRef.current||h.sessionId!==session.sessionId||h.mediaGeneration<generation)return;
      if(!decoder||h.mediaGeneration!==generation){if(pending.length<8)pending.push(packet);return;}
      if(waitingKey&&h.type!=='key')return;if(h.type==='key')waitingKey=false;
      if(decoder.decodeQueueSize>8){droppedFrames++;clearMedia();resync();return;}
      frameMap.set(h.outputPtsUs,h);while(frameMap.size>128)frameMap.delete(frameMap.keys().next().value!);
      decoder.decode(new EncodedVideoChunk({type:h.type,timestamp:h.outputPtsUs,data:packet.payload}));
    };
    const configure=(value:CodecConfig,nextGeneration:number)=>{
      cachedConfig={config:value,generation:nextGeneration};codec=value.codec;if(!needsVideo())return;
      const key=JSON.stringify([nextGeneration,value]);if(key===configKey)return;
      const queued=pending.splice(0);clearMedia();generation=nextGeneration;configKey=key;codec=value.codec;
      decoder=new VideoDecoder({error:error=>{report(error);configKey='';resync();},output:image=>{
        const header=frameMap.get(image.timestamp);frameMap.delete(image.timestamp);
        if(disposed||!header){image.close();return;}
        decoded.push({image,header,received:performance.now()});decoded.sort((a,b)=>a.header.outputPtsUs-b.header.outputPtsUs);
        while(decoded.length>3){decoded.shift()!.image.close();droppedFrames++;}
      }});
      decoder.configure({codec:value.codec,codedWidth:value.codedWidth,codedHeight:value.codedHeight,...(value.description?{description:new Uint8Array(value.description)}:{})});
      for(const p of queued)decode(p);
    };
    const mediaConnect=()=>{
      if(disposed||ended||!needsVideo())return;
      if(media&&media.readyState<=WebSocket.OPEN)return;
      connection({media:'connecting'});const socket=new WebSocket(socketUrl('media'));media=socket;socket.binaryType='arraybuffer';
      socket.onopen=()=>{if(media===socket)connection({media:'open'});};socket.onerror=()=>{if(media===socket)connection({media:'error'});};
      socket.onmessage=event=>{if(media!==socket||!needsVideo())return;receivedBytes+=(event.data as ArrayBuffer).byteLength;try{decode(decodeFrame(event.data as ArrayBuffer));}catch(error){report(error);resync();}};
      socket.onclose=()=>{if(media!==socket)return;media=undefined;connection({media:needsVideo()?'closed':'disabled'});if(!disposed&&!ended&&needsVideo()){notify(control?.readyState===WebSocket.OPEN?'buffering':'disconnected');clearMedia();generation=-1;mediaRetry=setTimeout(mediaConnect,500);}};
    };
    const connect=()=>{
      if(disposed||ended)return;notify('connecting');connection({control:'connecting'});control=new WebSocket(socketUrl('control'));
      control.onopen=()=>connection({control:'open'});control.onerror=()=>connection({control:'error'});
      control.onmessage=event=>{try{
        const message=parseJsonMessage(String(event.data)) as unknown as ServerMessage;
        if(message.type==='session.ready'){emit('session.ready',message.role);controller.current=message.role==='controller';connection({role:message.role});if(message.epoch!==epochRef.current){receiptTimings.reset();sourceDiagnostics=null;sourceDiagnosticsAt=0;epochRef.current=message.epoch;coordinator.reset(message.epoch);store.reset();release();host.style.visibility='hidden';lastSource=-1;clearMedia();}notify('buffering');if(needsVideo())mediaConnect();return;}
        if(message.type==='session.reset'){emit('session.reset',String(message.epoch));latestClock=undefined;presentedClock=undefined;receiptTimings.reset();sourceDiagnostics=null;sourceDiagnosticsAt=0;epochRef.current=message.epoch;coordinator.reset(message.epoch);store.reset();release();host.style.visibility='hidden';lastSource=-1;generation=-1;clearMedia();host.style.visibility='hidden';notify('buffering');return;}
        if(message.type==='session.ended'){emit('session.ended',message.reason,'warning');receiptTimings.reset();sourceDiagnostics=null;sourceDiagnosticsAt=0;ended=true;release();clearMedia();host.style.visibility='hidden';notify('ended');control?.close();media?.close();return;}
        if(message.type==='error'){report(message.code);return;}
        if(!('epoch' in message)||message.epoch!==epochRef.current)return;
        if(message.type.startsWith('ui.')&&needsUi()){
          uiMessages++;uiBytes+=new TextEncoder().encode(String(event.data)).length;lastUiAt=performance.now();
          if(message.type==='ui.commit')uiCommits++;else if(message.type==='ui.snapshot')uiSnapshots++;else if(message.type==='ui.clock')uiClocks++;
        }
        if(message.type==='source.diagnostics'){
          // Diagnostic failures degrade locally; they must not interrupt playback.
          try{validateSourceDiagnostics(message.diagnostics);sourceDiagnostics=message.diagnostics;sourceDiagnosticsAt=performance.now();}catch{sourceDiagnostics=null;sourceDiagnosticsAt=0;}
          return;
        }
        if(message.type==='session.video'){const video=parseVideoSettings(message.video);emit('video.settings',`${video.width}×${video.height} · ${video.fps} fps · ${(video.bitrate/1e6).toFixed(1)} Mbps`);callbacks.current.onVideoSettingsChange?.(video);}
        if(message.type==='stream.subscribed')connection({ui:message.ui?'subscribed':'paused'});
        if(message.type==='ui.clock'&&mode==='ui'){validateUiClock(message.clock);latestClock=message.clock;}
        if(message.type==='media.config')configure(message.config,message.mediaGeneration);
        if(message.type==='ui.snapshot'&&needsUi())coordinator.snapshot(message.snapshot);
        if(message.type==='ui.commit'&&needsUi()){try{coordinator.commit(message.commit);}catch{resync();}}
        if(message.type==='input.receipt'){lastInputTick=message.simulationTick;lastAckAt=performance.now();if(message.clientId===clientId)receiptTimings.received(`input:${message.clientSequence}`);}
        if(message.type==='action.receipt'){receiptTimings.received(`action:${message.actionId}`);if(message.status==='failed')emit('error',message.error??'ACTION_FAILED','error');}
      }catch(error){report(error);}};
      control.onclose=()=>{receiptTimings.reset();sourceDiagnostics=null;sourceDiagnosticsAt=0;latestClock=undefined;connection({control:'closed',role:'unassigned',ui:needsUi()?'subscribing':'paused'});controller.current=false;if(!disposed&&!ended){release();notify('disconnected');controlRetry=setTimeout(connect,700);}};
    };
    const presentUi=(snapshot:UiSnapshot,time:number)=>{
      store.present(snapshot,time);uiFrames++;
      if(!mountedUi&&module){setUi({root:mount,module,store});mountedUi=true;}host.style.visibility='visible';
    };
    const paint=()=>{
      if(disposed)return;
      if(mode==='ui'&&readyUi&&latestClock&&latestClock.sourceTimeUs>lastSource){
        const snapshot=coordinator.history.at(latestClock.uiRevision,latestClock.sourceTimeUs);lastSource=latestClock.sourceTimeUs;
        if(snapshot&&latestClock.completeThroughUs>=lastSource){presentUi(snapshot,lastSource);presentedClock=latestClock;lastPresentedAt=performance.now();notify('playing');}
        else{unmappedFrames++;host.style.visibility='hidden';notify('unmapped');resync();}
      }
      const candidate=needsVideo()?decoded[0]:undefined;
      if(candidate){
        const snapshot=needsUi()?coordinator.select(candidate.header):undefined;
        if(!needsUi()||snapshot||performance.now()-candidate.received>=100){
          decoded.shift();try{
            if(candidate.header.source.sourceTimeUs>=lastSource&&candidate.header.epoch===epochRef.current){
              display.style.visibility='visible';display.width=candidate.header.widthPixels;display.height=candidate.header.heightPixels;display.getContext('2d')!.drawImage(candidate.image,0,0);
              lastSource=candidate.header.source.sourceTimeUs;
              if(!needsUi()){host.style.visibility='hidden';notify('playing');}
              else if(snapshot&&readyUi){presentUi(snapshot,lastSource);notify('playing');}
              else{unmappedFrames++;host.style.visibility='hidden';notify('unmapped');resync();}
              frames++;lastPresentedAt=performance.now();lastHeader=candidate.header;
            }
          }finally{candidate.image.close();}
        }
      }
      raf=requestAnimationFrame(paint);
    };
    let held=new Set<string>(),edges:InputState['keyEdges']=[],sequence=0,yaw=0,pitch=0,zoom=0,drag:{id:number;x:number;y:number}|undefined;
    const flush=()=>{if(!controller.current||callbacks.current.interactive===false)return;send({type:'input.state',epoch:epochRef.current,input:{sequence:++sequence,heldKeys:[...held],keyEdges:edges,yawDeltaRadians:yaw,pitchDeltaRadians:pitch,distanceDeltaMeters:zoom}});edges=[];yaw=0;pitch=0;zoom=0;};
    const release=()=>{if(drag&&target.hasPointerCapture(drag.id))target.releasePointerCapture(drag.id);held.clear();edges=[];yaw=0;pitch=0;zoom=0;drag=undefined;if(controller.current&&callbacks.current.interactive!==false)send({type:'input.release',epoch:epochRef.current});};
    stopInput.current=()=>{release();if(controller.current&&callbacks.current.interactive===false)send({type:'input.release',epoch:epochRef.current});};
    const canInteract=()=>controller.current&&callbacks.current.interactive!==false;
    const abort=new AbortController(),listen={signal:abort.signal};
    const isUi=(e:Event)=>e.composedPath().some(t=>t instanceof Element&&t.matches('button,input,textarea,select,a,[contenteditable=true],[role=button]'));
    target.addEventListener('keydown',event=>{if(!canInteract()||isUi(event)||event.repeat)return;event.preventDefault();held.add(event.code);edges.push({code:event.code,kind:'down'});flush();},listen);
    target.addEventListener('keyup',event=>{if(!held.has(event.code))return;held.delete(event.code);edges.push({code:event.code,kind:'up'});flush();},listen);
    target.addEventListener('focusin',event=>{if(isUi(event))release();},listen);
    target.addEventListener('pointerdown',event=>{if(!canInteract())return;if(isUi(event)){release();return;}target.focus();target.setPointerCapture(event.pointerId);drag={id:event.pointerId,x:event.clientX,y:event.clientY};},listen);
    target.addEventListener('pointermove',event=>{if(!canInteract()||!drag||drag.id!==event.pointerId)return;const rect=target.getBoundingClientRect();yaw-=(event.clientX-drag.x)/rect.width*session.ui.document.designViewport.width*.004;pitch+=(event.clientY-drag.y)/rect.height*session.ui.document.designViewport.height*.004;drag.x=event.clientX;drag.y=event.clientY;flush();},listen);
    target.addEventListener('pointerup',()=>{drag=undefined;},listen);target.addEventListener('pointercancel',release,listen);
    target.addEventListener('wheel',event=>{if(!canInteract()||isUi(event))return;event.preventDefault();zoom+=(event.deltaMode===1?event.deltaY*16:event.deltaMode===2?event.deltaY*session.height:event.deltaY)*.005;flush();},{...listen,passive:false});
    target.addEventListener('focusout',event=>{if(!target.contains(event.relatedTarget as Node|null))release();},listen);
    window.addEventListener('blur',release,listen);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();},listen);
    const heartbeat=setInterval(flush,250);
    modeChange.current=()=>{
      const next=callbacks.current.viewMode??'combined';if(next===mode)return;
      release();mode=next;emit('view.mode',mode);display.style.visibility='hidden';coordinator.reset(epochRef.current);store.reset();lastSource=-1;latestClock=undefined;presentedClock=undefined;host.style.visibility='hidden';notify('buffering');
      connection({ui:needsUi()?'subscribing':'paused'});
      send({type:'stream.subscribe',epoch:epochRef.current,ui:needsUi(),clock:mode==='ui'});
      if(!needsVideo()){
        if(mediaRetry)clearTimeout(mediaRetry);const previous=media;media=undefined;previous?.close();clearMedia();generation=-1;connection({media:'disabled'});
      }else{if(cachedConfig)configure(cachedConfig.config,cachedConfig.generation);mediaConnect();}
    };
    void (async()=>{
      const bytes=await checkedBytes(session.ui.moduleUrl,session.ui.moduleSha256);if(disposed)return;
      moduleUrl=URL.createObjectURL(new Blob([bytes],{type:'text/javascript'}));
      const exports=await import(/* @vite-ignore */ moduleUrl) as {createWorldUiModule:(runtime:ReturnType<typeof createWorldUiRuntime>)=>WorldUiModule};
      if(disposed)return;module=exports.createWorldUiModule(createWorldUiRuntime(session.ui.moduleUrl));
      for(const file of session.ui.styles){await checkedBytes(file.url,file.sha256);if(disposed)return;const link=document.createElement('link');link.rel='stylesheet';link.href=file.url;await new Promise<void>((resolve,reject)=>{link.onload=()=>resolve();link.onerror=()=>reject(new Error('UI_STYLESHEET_FAILED'));root.append(link);});}
      if(disposed)return;readyUi=true;
    })().catch(report);
    connect();raf=requestAnimationFrame(paint);
    return()=>{modeChange.current=()=>{};stopInput.current=()=>{};release();disposed=true;resize.disconnect();abort.abort();clearInterval(heartbeat);clearInterval(diagnosticsTimer);if(controlRetry)clearTimeout(controlRetry);if(mediaRetry)clearTimeout(mediaRetry);cancelAnimationFrame(raf);control?.close();media?.close();clearMedia();store.dispose();module?.dispose?.();if(moduleUrl)URL.revokeObjectURL(moduleUrl);controller.current=false;setUi(null);};
  },[session.sessionId,session.baseUrl,session.uiBundleHash]);
  React.useEffect(()=>{modeChange.current();},[props.viewMode]);
  React.useEffect(()=>{if(props.interactive===false)stopInput.current();},[props.interactive]);
  return <div data-world-stream-player="" data-status={status} data-view-mode={props.viewMode??'combined'}>
    <div ref={surface} tabIndex={0} style={{position:'relative',width:'100%',aspectRatio:`${session.width}/${session.height}`,overflow:'hidden',backgroundColor:'#101820',outline:'none',touchAction:'none'}}>
      <canvas data-video-layer="" ref={canvas} style={{visibility:props.viewMode==='ui'?'hidden':'visible',position:'absolute',inset:0,width:'100%',height:'100%'}}/>
      <div data-ui-layer="" ref={overlay} style={{display:props.viewMode==='video'?'none':undefined,position:'absolute',inset:0,pointerEvents:'none',visibility:'hidden'}}/>
      {ui&&createPortal(<WorldUiRenderer document={session.ui.document} catalog={session.ui.catalog} module={ui.module} store={ui.store} viewport={layoutViewport} safeAreaInsets={safeAreaInsets} onAction={action}/>,ui.root)}
    </div>
    <output aria-live="polite" style={{fontSize:12}}>{status}</output>
  </div>;
}
