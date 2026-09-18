import {encodeFrame,MAX_MEDIA_BYTES,type CodecConfig,type FrameHeader} from '@worldkit/stream-protocol';

type MediaState='idle'|'connecting'|'waiting-config'|'waiting-keyframe'|'streaming'|'reconnecting'|'failed'|'closed';
const RETRY_DELAYS_MS=[250,500,1000,2000,4000];
const OPEN_TIMEOUT_MS=5000,STABLE_STREAM_MS=10000;

/** Owns one producer media socket. Encoder config outlives transport generations. */
export class ProducerMediaConnection {
  state:MediaState='idle';
  generation=1;
  private socket:WebSocket|undefined;
  private config:CodecConfig|undefined;
  private retry:ReturnType<typeof setTimeout>|undefined;
  private deadline:ReturnType<typeof setTimeout>|undefined;
  private attempts=0;
  private streamingSince:number|undefined;
  private opened:{resolve:()=>void;reject:(error:Error)=>void}|undefined;
  constructor(private readonly options:{
    url:string;
    publishConfig:(generation:number,config:CodecConfig)=>boolean;
    invalidate:()=>void;
    fail:(error:Error)=>void;
  }){}
  get canCapture(){return this.socket?.readyState===WebSocket.OPEN&&['waiting-config','waiting-keyframe','streaming'].includes(this.state);}
  get needsKeyframe(){return this.state!=='streaming';}
  start():Promise<void>{
    if(this.state!=='idle')throw new Error('STREAM_MEDIA_ALREADY_STARTED');
    return new Promise((resolve,reject)=>{this.opened={resolve,reject};this.connect();});
  }
  private connect(){
    this.state='connecting';
    let socket:WebSocket;
    try{socket=new WebSocket(this.options.url);}catch{this.recover('connect-error');return;}
    this.socket=socket;
    this.deadline=setTimeout(()=>{if(this.socket===socket)this.recover('open-timeout');},OPEN_TIMEOUT_MS);
    socket.onopen=()=>{
      if(this.socket!==socket)return;
      clearTimeout(this.deadline);this.deadline=undefined;
      this.state='waiting-config';this.opened?.resolve();this.opened=undefined;
      // A fresh socket needs the cached configuration even when the encoder has
      // no new decoderConfig metadata. Never depend on a Host keyframe hint.
      this.publishConfig();
    };
    socket.onclose=()=>{if(this.socket===socket)this.recover('closed');};
    socket.onerror=()=>{if(this.socket===socket)this.recover('socket-error');};
  }
  private detach(){
    clearTimeout(this.deadline);this.deadline=undefined;
    const socket=this.socket;this.socket=undefined;
    if(socket){socket.onopen=null;socket.onclose=null;socket.onerror=null;socket.close();}
  }
  private recover(reason:string){
    if(this.state==='failed'||this.state==='closed'||this.state==='reconnecting')return;
    this.detach();this.state='reconnecting';this.streamingSince=undefined;
    this.generation++;this.options.invalidate();
    const delay=RETRY_DELAYS_MS[this.attempts++];
    if(delay===undefined){
      this.state='failed';const error=new Error(`STREAM_MEDIA_RECONNECT_EXHAUSTED: ${reason}`);
      this.opened?.reject(error);this.opened=undefined;this.options.fail(error);return;
    }
    this.retry=setTimeout(()=>{this.retry=undefined;this.connect();},delay);
  }
  private publishConfig(){
    if(!this.config||!this.canCapture)return;
    // Only an open socket can be configured; config precedes the first keyframe.
    try{if(!this.options.publishConfig(this.generation,this.config)){this.recover('control-unavailable');return;}}
    catch{this.recover('config-send-error');return;}
    this.state='waiting-keyframe';
  }
  setConfig(config:CodecConfig){
    const changed=JSON.stringify(config)!==JSON.stringify(this.config);
    this.config=config;
    if(changed||this.state==='waiting-config')this.publishConfig();
  }
  requestKeyframe(){this.publishConfig();}
  /** Encoder replacement invalidates old outputs and its cached configuration. */
  resetEncoder(){
    this.generation++;this.config=undefined;this.options.invalidate();
    if(this.canCapture)this.state='waiting-config';
  }
  send(header:FrameHeader,payload:Uint8Array){
    if(header.mediaGeneration!==this.generation||!this.canCapture)return;
    if(this.state==='waiting-config'||(this.state==='waiting-keyframe'&&header.type!=='key'))return;
    if(this.socket!.bufferedAmount>MAX_MEDIA_BYTES){this.recover('backpressure');return;}
    try{this.socket!.send(encodeFrame(header,payload));}catch{this.recover('frame-send-error');return;}
    this.state='streaming';
    this.streamingSince??=performance.now();
    // Merely opening a socket does not reset the budget: a flapping connection
    // must eventually fail instead of retrying forever while appearing healthy.
    if(performance.now()-this.streamingSince>=STABLE_STREAM_MS)this.attempts=0;
  }
  dispose(){
    if(this.state==='closed')return;
    this.state='closed';clearTimeout(this.retry);this.retry=undefined;this.detach();
    this.opened?.reject(new Error('STREAM_MEDIA_CLOSED'));this.opened=undefined;
  }
}
