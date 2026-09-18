/// <reference types="@types/dom-webcodecs" />
import {ProducerMediaConnection} from './media-connection.js';
import type {World,JsonValue,RemoteInputLease} from '@worldkit/three';
import {UiRecorder} from '@worldkit/world-ui/core';
import {compileStateSchema,requireValid,type UiCatalog,type UiDocument,type UiState} from '@worldkit/world-ui/schema';
import {parseJsonMessage,parseVideoSettings,type VideoSettings,type FrameHeader,type CodecConfig,type InputState} from '@worldkit/stream-protocol';

export interface StreamWorldBinding {
  world:World;
  readUiState:()=>UiState;
  actions?:Record<string,(params:Record<string,JsonValue>)=>void|Promise<void>>;
}
declare global {interface Window {__WORLDKIT_STREAM_WORLD__?:StreamWorldBinding;__WORLDKIT_STREAM_CONTROL__?:{configureVideo:(video:VideoSettings)=>Promise<VideoSettings>}}}
interface ProducerOptions {sessionId:string;epoch:number;baseUrl:string;token:string;width:number;height:number;fps:number;bitrate:number;catalog:UiCatalog;document:UiDocument;stateSchema:Record<string,unknown>}
export async function startProducer(options:ProducerOptions):Promise<()=>void>{
  const binding=window.__WORLDKIT_STREAM_WORLD__;if(!binding)throw new Error('STREAM_WORLD_BINDING_REQUIRED');
  const {world}=binding;
  const video=parseVideoSettings({width:options.width,height:options.height,fps:options.fps,bitrate:options.bitrate});
  world.resize(video.width,video.height);
  const presentation=world.createPresentation();
  let lease:RemoteInputLease=world.acquireRemoteInput();
  const validate=compileStateSchema(options.stateSchema);
  const actionValidators=Object.fromEntries(Object.entries(options.catalog.actions).map(([id,definition])=>[id,compileStateSchema(definition.paramsSchema)]));
  const read=()=>{const state=binding.readUiState();requireValid(validate,state,'UI_STATE');return state;};
  const recorder=new UiRecorder(options.document,options.catalog,read());
  const origin=performance.now();
  let reconfiguring=false,captureTask:Promise<void>|undefined;
  const scaled=new OffscreenCanvas(video.width,video.height);
  let closed=false,capturing=false,lastCapture=-Infinity,frameId=0,forceKey=true,inputSequence=-1;
  let inputOrigin:{clientId:string;clientSequence:number}|undefined;
  let capturedFrames=0,encodedFrames=0,diagnosticsAt=performance.now();
  let encoder:VideoEncoder;let dispose:(()=>void)|undefined;
  const mappings=new Map<number,FrameHeader>();
  const control=new WebSocket(wsUrl('producer-control'));
  const send=(message:unknown)=>{if(control.readyState!==WebSocket.OPEN)return false;try{control.send(JSON.stringify(message));return true;}catch{return false;}};
  function wsUrl(channel:string){const u=new URL(`/v1/sessions/${options.sessionId}/${channel}`,options.baseUrl);u.protocol=u.protocol==='https:'?'wss:':'ws:';u.searchParams.set('token',options.token);return u.toString();}
  const open=(socket:WebSocket)=>new Promise<void>((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timeout);socket.removeEventListener('open',ready);socket.removeEventListener('error',error);socket.removeEventListener('close',error);};
    const ready=()=>{cleanup();resolve();},error=()=>{cleanup();reject(new Error('STREAM_PRODUCER_SOCKET'));};
    const timeout=setTimeout(error,10000);
    if(socket.readyState===WebSocket.OPEN){ready();return;}if(socket.readyState!==WebSocket.CONNECTING){error();return;}
    socket.addEventListener('open',ready);socket.addEventListener('error',error);socket.addEventListener('close',error);
  });
  const fail=(error:unknown)=>{send({type:'producer.error',message:error instanceof Error?error.message:String(error)});};
  const media=new ProducerMediaConnection({url:wsUrl('producer-media'),
    publishConfig:(mediaGeneration,config)=>send({type:'media.config',epoch:options.epoch,mediaGeneration,config}),
    invalidate:()=>{mappings.clear();forceKey=true;},
    fail:error=>{fail(error);dispose?.();},
  });
  const createEncoder=()=>new VideoEncoder({
    error:fail,
    output:(chunk,metadata)=>{
      const header=mappings.get(chunk.timestamp);mappings.delete(chunk.timestamp);if(!header||closed||header.mediaGeneration!==media.generation)return;
      encodedFrames++;
      if(metadata?.decoderConfig){const c=metadata.decoderConfig,d=c.description;const bytes=d?(ArrayBuffer.isView(d)?new Uint8Array(d.buffer,d.byteOffset,d.byteLength):new Uint8Array(d)):undefined;const config:CodecConfig={codec:c.codec,codedWidth:video.width,codedHeight:video.height,...(bytes?{description:Array.from(bytes)}:{})};
        media.setConfig(config);
      }
      const payload=new Uint8Array(chunk.byteLength);chunk.copyTo(payload);
      header.type=chunk.type;header.payloadBytes=payload.length;
      media.send(header,payload);
    },
  });
  const encoderOptions=(v:VideoSettings):VideoEncoderConfig=>({codec:'vp8',width:v.width,height:v.height,bitrate:v.bitrate,framerate:v.fps,latencyMode:'realtime'});
  const encodeConfig=encoderOptions(video);
  const support=await VideoEncoder.isConfigSupported(encodeConfig);if(!support.supported)throw new Error('STREAM_VP8_ENCODER_UNSUPPORTED');
  encoder=createEncoder();encoder.configure(encodeConfig);
  try{await Promise.all([open(control),media.start()]);}catch(error){media.dispose();encoder.close();control.close();lease.dispose();presentation.dispose();throw error;}
  let releaseTimer:ReturnType<typeof setTimeout>|undefined;
  const refreshLease=()=>{if(releaseTimer)clearTimeout(releaseTimer);releaseTimer=setTimeout(()=>lease.clear(),1500);};
  control.addEventListener('close',()=>{lease.clear();dispose?.();});
  control.addEventListener('message',event=>{
    try{
      const value=parseJsonMessage(String(event.data));if(value.epoch!==options.epoch)return;
      if(value.type==='input.state'){
        const input=value.input as InputState;
        if(lease.submit(input)){inputSequence=input.sequence;inputOrigin={clientId:String(value.clientId),clientSequence:Number(value.clientSequence)};refreshLease();}
      }else if(value.type==='input.release'){lease.clear();}
      else if(value.type==='media.keyframe'){forceKey=true;media.requestKeyframe();send({type:'ui.snapshot',epoch:options.epoch,snapshot:recorder.snapshot()});}
      else if(value.type==='ui.resync')send({type:'ui.snapshot',epoch:options.epoch,snapshot:recorder.snapshot()});
      else if(value.type==='input.action'){
        const name=String(value.name),actionId=String(value.actionId),params=value.params as Record<string,JsonValue>;
        const check=actionValidators[name],action=binding.actions?.[name];if(!check||!action)throw new Error('STREAM_ACTION_UNKNOWN');requireValid(check,params,'STREAM_ACTION_PARAMS');
        void Promise.resolve().then(()=>action(params)).then(()=>send({type:'action.receipt',epoch:options.epoch,actionId,status:'completed'}),error=>send({type:'action.receipt',epoch:options.epoch,actionId,status:'failed',error:String(error)}));
      }
    }catch(error){fail(error);}
  });
  let lastReceipt=-1,lastUiClock=-Infinity;
  const releaseReset=world.onReset(()=>{
    if(closed)return;
    // Native/world-owned reset revokes the old lease without replacing this page.
    // Rejoin the existing fixed clock; the Host session and source time stay stable.
    lease=world.acquireRemoteInput();inputSequence=-1;inputOrigin=undefined;lastReceipt=-1;forceKey=true;
  });
  const releaseSample=world.onRuntimeSample(sample=>{
    if(sample.kind==='fixed-input'){
      const sourceTimeUs=Math.max(0,Math.round((performance.now()-origin)*1000)),sampleUi=recorder.sample(read(),sourceTimeUs);
      if(sampleUi.commit)send({type:'ui.commit',epoch:options.epoch,commit:sampleUi.commit});
      if(sourceTimeUs-lastUiClock>=1e6/Math.min(video.fps,30)){lastUiClock=sourceTimeUs;send({type:'ui.clock',epoch:options.epoch,clock:{sourceTimeUs,simulationTick:sample.simulationTick,uiRevision:sampleUi.snapshot.revision,completeThroughUs:sourceTimeUs}});}
    }
    if(sample.kind==='fixed-input'&&inputOrigin&&inputSequence!==lastReceipt){lastReceipt=inputSequence;send({type:'input.receipt',epoch:options.epoch,sequence:inputSequence,...inputOrigin,simulationTick:sample.simulationTick});}
  });
  const capture=()=>{
    if(closed||reconfiguring||capturing||encoder.state!=='configured'||encoder.encodeQueueSize>=2||!media.canCapture)return;
    const now=performance.now();if(now-lastCapture<1000/video.fps*.85)return;lastCapture=now;capturing=true;const captureGeneration=media.generation;
    captureTask=presentation.modelInput.captureFrame({readMetadata:source=>{
      const sourceTimeUs=Math.max(0,Math.round((source.capturedAtMilliseconds-origin)*1000));
      const sample=recorder.sample(read(),sourceTimeUs);
      if(sample.commit)send({type:'ui.commit',epoch:options.epoch,commit:sample.commit});
      // A periodic/full source checkpoint makes late joins independent of delta history.
      if(forceKey||frameId%video.fps===0)send({type:'ui.snapshot',epoch:options.epoch,snapshot:sample.snapshot});
      return {sourceTimeUs,uiRevision:sample.snapshot.revision};
    }}).then(packet=>{
      try{
        if(closed||captureGeneration!==media.generation||!media.canCapture)return;capturedFrames++;const meta=packet.metadata!;
        const time=meta.sourceTimeUs;
        const header:FrameHeader={protocolVersion:1,sessionId:options.sessionId,epoch:options.epoch,mediaGeneration:captureGeneration,outputFrameId:++frameId,outputPtsUs:time,type:'delta',source:{presentationId:packet.source.presentationId,sdkEpoch:packet.source.epoch,sourceFrameId:packet.source.sourceFrameId,sourceTimeUs:time,simulationTick:packet.source.simulationTick,worldRevision:packet.source.worldRevision},uiRevision:meta.uiRevision,uiCompleteThroughUs:time,widthPixels:video.width,heightPixels:video.height,payloadBytes:1};
        mappings.set(time,header);while(mappings.size>128)mappings.delete(mappings.keys().next().value!);
        let pixels:ImageBitmap|OffscreenCanvas=packet.image;
        if(packet.image.width!==video.width||packet.image.height!==video.height){scaled.width=video.width;scaled.height=video.height;scaled.getContext('2d')!.drawImage(packet.image,0,0,video.width,video.height);pixels=scaled;}
        const videoFrame=new VideoFrame(pixels,{timestamp:time});try{encoder.encode(videoFrame,{keyFrame:forceKey||media.needsKeyframe||frameId%video.fps===0});forceKey=false;}finally{videoFrame.close();}
      }finally{packet.image.close();}
    }).catch(fail).finally(()=>{capturing=false;});
  };
  let timer=setInterval(capture,Math.max(4,Math.floor(1000/video.fps)));
  const diagnosticsTimer=setInterval(()=>{
    if(closed)return;const now=performance.now();
    send({type:'source.diagnostics',epoch:options.epoch,diagnostics:{sampleDurationMs:now-diagnosticsAt,capturedFrames,encodedFrames,encodeQueueSize:encoder.state==='closed'?0:encoder.encodeQueueSize}});
    diagnosticsAt=now;capturedFrames=0;encodedFrames=0;
  },1000);
  window.__WORLDKIT_STREAM_CONTROL__={configureVideo:async value=>{
    const next=parseVideoSettings(value);
    if(Math.abs(next.width/next.height-video.width/video.height)>.01)throw new Error('STREAM_VIDEO_ASPECT_MISMATCH');
    if(reconfiguring||closed)throw new Error('STREAM_VIDEO_BUSY');
    if(!((await VideoEncoder.isConfigSupported(encoderOptions(next))).supported))throw new Error('STREAM_VIDEO_UNSUPPORTED');
    reconfiguring=true;
    try{
      await captureTask;await encoder.flush();if(closed)throw new Error('STREAM_PRODUCER_CLOSED');
      const replacement=createEncoder();
      try{replacement.configure(encoderOptions(next));world.resize(next.width,next.height);}catch(error){replacement.close();throw error;}
      encoder.close();encoder=replacement;media.resetEncoder();Object.assign(video,next);
      media.setConfig({codec:'vp8',codedWidth:video.width,codedHeight:video.height});forceKey=true;lastCapture=-Infinity;
      clearInterval(timer);timer=setInterval(capture,Math.max(4,Math.floor(1000/video.fps)));
      return {...video};
    }finally{reconfiguring=false;}
  }};
  send({type:'producer.ready'});
  dispose=()=>{if(closed)return;closed=true;delete window.__WORLDKIT_STREAM_CONTROL__;clearInterval(timer);clearInterval(diagnosticsTimer);if(releaseTimer)clearTimeout(releaseTimer);releaseSample();releaseReset();lease.dispose();presentation.dispose();if(encoder.state!=='closed')encoder.close();mappings.clear();control.close();media.dispose();};
  world.onDispose(dispose);return dispose;
}
