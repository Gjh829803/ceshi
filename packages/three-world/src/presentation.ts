import * as THREE from 'three';
import { cloneJson } from './control-support.js';
import type * as API from './contracts.js';

/** Private adapter: the world remains the only owner of entities, camera and time. */
export interface PresentationHost {
 canvas:HTMLCanvasElement;camera:THREE.Camera;
 render():void;
 stamp():{simulationTick:number;worldRevision:number};
 object(entityId:string):THREE.Object3D|undefined;
 onRender(callback:()=>void):()=>void;
 onChange(callback:()=>void):()=>void;
 bindInput(surface:HTMLElement,uiRoot:HTMLElement):()=>void;
 focus():void;
 released():void;
}
type Sample = {source:API.SourceFrame;values:Map<symbol,API.JsonValue>;anchors:Map<symbol,{x:number;y:number}|null>};
type Binding = {token:symbol;definition:API.UIBinding<API.JsonValue>};
type Anchor = {token:symbol;definition:API.UIAnchor};
const fail=(code:string):never=>{throw new Error(`WORLD_PRESENTATION_${code}`);};

/** Browser composition only. No requestAnimationFrame loop or second world renderer. */
export class ThreePresentation implements API.WorldPresentation {
 readonly ui:API.PresentationUI;
 readonly modelInput:API.ModelInput;
 readonly output:API.ModelOutput;
 private readonly presentationId=Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
 private epoch=0;private nextFrameId=0;private disposed=false;private lastError:string|undefined;
 private mode:API.PresentationStatus['mode']='world';private displayed:Sample|undefined;
 private readonly history=new Map<number,Sample>();
 private readonly capacity:number;
 private readonly stage:HTMLDivElement;private readonly surface:HTMLDivElement;private readonly uiRoot:HTMLDivElement;
 private readonly video:HTMLVideoElement;private readonly outputCanvas:HTMLCanvasElement;
 private readonly outputContext:CanvasRenderingContext2D;
 private readonly container:HTMLElement;
 private readonly bindings=new Map<string,Binding>();private readonly anchors=new Map<string,Anchor>();
 private readonly mounts=new Map<HTMLElement,()=>void>();private readonly streams=new Set<{stream:MediaStream;close():void}>();
 private readonly cleanups=new Set<()=>void>();
 private videoCallback:number|undefined;private outputGeneration=0;private highestFrameId=0;
 private flushing=false;private capturing=false;

 constructor(private readonly host:PresentationHost,options:API.PresentationOptions={}) {
  const canvas=host.canvas;const parent=canvas.parentElement;
  if(!parent||options.container&&options.container!==parent)fail('CONTAINER_MUST_BE_CANVAS_PARENT');
  this.container=parent!;this.capacity=options.historyFrames??240;
  if(!Number.isInteger(this.capacity)||this.capacity<1||this.capacity>3600)fail('HISTORY_LIMIT_INVALID');
  const doc=canvas.ownerDocument;const win=doc.defaultView!;
  this.stage=doc.createElement('div');this.stage.dataset.worldkitPresentation=this.presentationId;
  this.stage.style.cssText='position:absolute;pointer-events:none;overflow:hidden;isolation:isolate;z-index:1';
  this.surface=doc.createElement('div');this.surface.dataset.worldkitSurface='';
  this.surface.style.cssText='position:absolute;inset:0;pointer-events:auto;outline:none';
  this.video=doc.createElement('video');this.video.dataset.worldkitOutput='video';this.video.autoplay=true;this.video.muted=true;this.video.playsInline=true;
  this.video.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:black;pointer-events:none;display:none';
  this.outputCanvas=doc.createElement('canvas');this.outputCanvas.dataset.worldkitOutput='frame';
  this.outputCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:black;pointer-events:none;display:none';
  this.outputContext=this.outputCanvas.getContext('2d')??fail('OUTPUT_CONTEXT_UNAVAILABLE');
  this.uiRoot=doc.createElement('div');this.uiRoot.dataset.worldkitUi=this.presentationId;
  this.uiRoot.style.cssText='position:absolute;inset:0;pointer-events:none';
  const style=doc.createElement('style');
  style.textContent=`[data-worldkit-ui="${this.presentationId}"] :is(button,input,textarea,select,a[href],[contenteditable],[tabindex],[role="button"]) {pointer-events:auto}`;
  this.surface.append(this.video,this.outputCanvas);this.stage.append(style,this.surface,this.uiRoot);
  const previousPosition=this.container.style.position;const previousFit=canvas.style.objectFit;
  if(win.getComputedStyle(this.container).position==='static')this.container.style.position='relative';
  canvas.style.objectFit='contain';this.container.append(this.stage);
  this.cleanups.add(()=>{this.container.style.position=previousPosition;canvas.style.objectFit=previousFit;});
  try {
   this.cleanups.add(host.bindInput(this.surface,this.uiRoot));
   this.cleanups.add(host.onRender(()=>this.refresh()));
   this.cleanups.add(host.onChange(()=>this.refresh()));
   const observer=new ResizeObserver(()=>this.refresh());observer.observe(canvas);observer.observe(this.container);
   this.cleanups.add(()=>observer.disconnect());
   const relayout=()=>this.refresh();win.addEventListener('resize',relayout);win.addEventListener('scroll',relayout,true);
   this.cleanups.add(()=>{win.removeEventListener('resize',relayout);win.removeEventListener('scroll',relayout,true);});
  } catch(error) {this.dispose();throw error;}
  this.ui={root:this.uiRoot,mount:(element,settings)=>this.mount(element,settings),bind:definition=>this.bind(definition),anchor:definition=>this.anchor(definition)};
  this.modelInput={captureFrame:()=>this.captureFrame(),createStream:settings=>this.createStream(settings)};
  this.output={attachStream:(stream,settings)=>this.attachStream(stream,settings),presentFrame:frame=>this.presentFrame(frame),showWorld:()=>this.showWorld()};
  this.refresh();
 }
 private alive():void {if(this.disposed)fail('DISPOSED');}
 private error(error:unknown):void {this.lastError=error instanceof Error?error.message:String(error);}
 status():API.PresentationStatus {
  return {mode:this.mode,synchronization:this.mode==='world'?'live':this.displayed?'mapped':'unmapped',presentationId:this.presentationId,epoch:this.epoch,historyFrames:this.history.size,
   ...(this.displayed?{sourceFrame:{...this.displayed.source}}:{}),...(this.lastError?{lastError:this.lastError}:{})};
 }
 focus():void {this.alive();this.host.focus();}
 get inputSurface():HTMLElement {this.alive();return this.surface;}
 private mount(element:HTMLElement,options:{readonly interactive?:boolean}={}):()=>void {
  this.alive();if(element.ownerDocument!==this.uiRoot.ownerDocument||element.contains(this.stage)||element===this.stage)fail('UI_ELEMENT_INVALID');
  if(this.mounts.has(element))fail('UI_ELEMENT_ALREADY_MOUNTED');
  const parent=element.parentNode;const next=element.nextSibling;const pointerEvents=element.style.pointerEvents;
  if(options.interactive)element.style.pointerEvents='auto';this.uiRoot.append(element);
  let active=true;const release=()=>{if(!active)return;active=false;this.mounts.delete(element);element.style.pointerEvents=pointerEvents;
   if(parent)parent.insertBefore(element,next?.parentNode===parent?next:null);else element.remove();};
  this.mounts.set(element,release);return release;
 }
 private bind<T extends API.JsonValue>(definition:API.UIBinding<T>):()=>void {
  this.alive();if(!definition.id||this.bindings.has(definition.id))fail('UI_BINDING_ID_INVALID');
  const unmount=this.mount(definition.element);const hidden=definition.element.hidden;const record={token:Symbol(),definition:definition as unknown as API.UIBinding<API.JsonValue>};
  this.bindings.set(definition.id,record);this.refresh();let active=true;
  const release=()=>{if(!active)return;active=false;this.cleanups.delete(release);this.bindings.delete(definition.id);definition.element.hidden=hidden;unmount();};
  this.cleanups.add(release);return release;
 }
 private anchor(definition:API.UIAnchor):()=>void {
  this.alive();if(!definition.id||this.anchors.has(definition.id))fail('UI_ANCHOR_ID_INVALID');
  if(definition.offsetLocalMetersXYZ&&(definition.offsetLocalMetersXYZ.length!==3||!definition.offsetLocalMetersXYZ.every(Number.isFinite)))fail('ANCHOR_OFFSET_INVALID');
  const element=definition.element;const unmount=this.mount(element);const hidden=element.hidden;
  const prior={position:element.style.position,left:element.style.left,top:element.style.top,transform:element.style.transform};
  element.style.position='absolute';element.style.transform='translate(-50%,-100%)';
  this.anchors.set(definition.id,{token:Symbol(),definition});this.refresh();let active=true;
  const release=()=>{if(!active)return;active=false;this.cleanups.delete(release);this.anchors.delete(definition.id);element.hidden=hidden;Object.assign(element.style,prior);unmount();};
  this.cleanups.add(release);return release;
 }
 private project(definition:API.UIAnchor):{x:number;y:number}|null {
  const object=this.host.object(definition.entityId);if(!object)return null;
  for(let current:THREE.Object3D|null=object;current;current=current.parent)if(!current.visible)return null;
  object.updateWorldMatrix(true,false);this.host.camera.updateWorldMatrix(true,false);
  const p=new THREE.Vector3(...(definition.offsetLocalMetersXYZ??[0,0,0])).applyMatrix4(object.matrixWorld).project(this.host.camera);
  return [p.x,p.y,p.z].every(Number.isFinite)&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1&&p.z>=-1&&p.z<=1?{x:(p.x+1)/2,y:(1-p.y)/2}:null;
 }
 private sample(source:API.SourceFrame):Sample {
  const values=new Map<symbol,API.JsonValue>();const anchors=new Map<symbol,{x:number;y:number}|null>();
  for(const binding of this.bindings.values())if(binding.definition.clock!=='live')try{values.set(binding.token,cloneJson(binding.definition.read()));}catch(error){this.error(error);}
  for(const anchor of this.anchors.values())try{anchors.set(anchor.token,this.project(anchor.definition));}catch(error){this.error(error);}
  return {source,values,anchors};
 }
 private imageRect(width:number,height:number):{left:number;top:number;width:number;height:number} {
  const w=this.stage.clientWidth;const h=this.stage.clientHeight;const scale=Math.min(w/width,h/height);
  return {left:(w-width*scale)/2,top:(h-height*scale)/2,width:width*scale,height:height*scale};
 }
 private refresh():void {
  if(this.disposed||this.flushing)return;this.flushing=true;
  try {
   const rect=this.host.canvas.getBoundingClientRect();const parent=this.container.getBoundingClientRect();
   Object.assign(this.stage.style,{left:`${rect.left-parent.left-this.container.clientLeft+this.container.scrollLeft}px`,top:`${rect.top-parent.top-this.container.clientTop+this.container.scrollTop}px`,width:`${rect.width}px`,height:`${rect.height}px`});
   const context:API.UIContext={synchronization:this.mode==='world'?'live':this.displayed?'mapped':'unmapped',...(this.displayed?{sourceFrame:{...this.displayed.source}}:{})};
   for(const {token,definition} of [...this.bindings.values()]) {
    try {
     const live=this.mode==='world'||definition.clock==='live';const value=live?cloneJson(definition.read()):this.displayed?.values.get(token);
     definition.element.hidden=value===undefined;
     if(value!==undefined)definition.render(cloneJson(value),context);
    } catch(error){definition.element.hidden=true;this.error(error);}
   }
   const frame=this.displayed?.source;const area=this.imageRect(frame?.widthPixels??this.host.canvas.width,frame?.heightPixels??this.host.canvas.height);
   for(const {token,definition} of [...this.anchors.values()])try {
    const point=this.mode==='world'?this.project(definition):this.displayed?.anchors.get(token);
    definition.element.hidden=!point;
    if(point){definition.element.style.left=`${area.left+point.x*area.width}px`;definition.element.style.top=`${area.top+point.y*area.height}px`;}
   } catch(error){definition.element.hidden=true;this.error(error);}
  } finally {this.flushing=false;}
 }
 private async captureFrame():Promise<API.ModelInputFrame> {
  this.alive();if(this.capturing)fail('CAPTURE_REENTRANT');this.capturing=true;
  let pending:Promise<ImageBitmap>;let sample:Sample;
  try {
   this.host.render();const canvas=this.host.canvas;
   const source:API.SourceFrame={presentationId:this.presentationId,epoch:this.epoch,sourceFrameId:++this.nextFrameId,...this.host.stamp(),capturedAtMilliseconds:performance.now(),widthPixels:canvas.width,heightPixels:canvas.height};
   if(!canvas.width||!canvas.height)fail('EMPTY_SOURCE');
   // Freeze the source synchronously; asynchronous bitmap decoding must not race the next render.
   const copy=canvas.ownerDocument.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
   const context=copy.getContext('2d')??fail('CAPTURE_CONTEXT_UNAVAILABLE');context.drawImage(canvas,0,0);
   sample=this.sample(source);pending=createImageBitmap(copy);
   this.history.set(source.sourceFrameId,sample);
   while(this.history.size>this.capacity)this.history.delete(this.history.keys().next().value!);
  } finally {this.capturing=false;}
  const image=await pending!;
  if(this.disposed||sample!.source.epoch!==this.epoch){image.close();fail('STALE_CAPTURE');}
  return {image,source:{...sample!.source}};
 }
 private createStream(options:{readonly framesPerSecond?:number}={}):{stream:MediaStream;close():void} {
  this.alive();const rate=options.framesPerSecond??24;
  if(!Number.isFinite(rate)||rate<=0||rate>120)fail('FRAME_RATE_INVALID');
  this.host.render();const stream=this.host.canvas.captureStream(rate);let active=true;
  const owned={stream,close:()=>{if(!active)return;active=false;for(const track of stream.getTracks())track.stop();this.streams.delete(owned);}};
  this.streams.add(owned);return owned;
 }
 private lookup(key:API.SourceFrameKey):Sample|undefined {
  if(key.presentationId!==this.presentationId||key.epoch!==this.epoch||!Number.isSafeInteger(key.sourceFrameId))return undefined;
  return this.history.get(key.sourceFrameId);
 }
 private detachOutput():void {
  this.outputGeneration++;if(this.videoCallback!==undefined)this.video.cancelVideoFrameCallback?.(this.videoCallback);this.videoCallback=undefined;
  this.video.pause();this.video.srcObject=null;this.video.style.display='none';this.outputCanvas.style.display='none';this.displayed=undefined;
 }
 private attachStream(stream:MediaStream,options:{readonly resolveSourceFrame?:(metadata:VideoFrameCallbackMetadata)=>API.SourceFrameKey|null}={}):void {
  this.alive();if(!stream.getVideoTracks().length)fail('VIDEO_TRACK_REQUIRED');
  this.detachOutput();this.mode='video';this.video.srcObject=stream;this.video.style.display='block';this.highestFrameId=0;
  const generation=this.outputGeneration;this.refresh();
  void this.video.play().catch(error=>{if(!this.disposed&&generation===this.outputGeneration)this.error(error);});
  const receive=(_now:number,metadata:VideoFrameCallbackMetadata)=>{
   if(this.disposed||generation!==this.outputGeneration)return;
   this.video.style.display='block';this.displayed=undefined;
   try {const key=options.resolveSourceFrame?.(metadata);const sample=key?this.lookup(key):undefined;
    if(sample&&sample.source.sourceFrameId>=this.highestFrameId&&metadata.width*sample.source.heightPixels===metadata.height*sample.source.widthPixels){this.displayed=sample;this.highestFrameId=sample.source.sourceFrameId;}
   } catch(error){this.error(error);}
   this.refresh();this.videoCallback=this.video.requestVideoFrameCallback(receive);
  };
  if(this.video.requestVideoFrameCallback)this.videoCallback=this.video.requestVideoFrameCallback(receive);
  else {this.video.style.display='block';this.error(new Error('Video frame callbacks unavailable; model UI mapping disabled'));}
 }
 private presentFrame(frame:{readonly image:CanvasImageSource;readonly source:API.SourceFrameKey}):void {
  this.alive();const sample=this.lookup(frame.source)??fail('UNKNOWN_OR_STALE_OUTPUT_FRAME');
  if(sample.source.sourceFrameId<this.highestFrameId)fail('UNKNOWN_OR_STALE_OUTPUT_FRAME');
  // Frame correspondence assumes the source image rectangle is preserved, never silently stretch it.
  const image=frame.image;
  const size='displayWidth' in image?[image.displayWidth,image.displayHeight]:
   'videoWidth' in image?[image.videoWidth,image.videoHeight]:
   'naturalWidth' in image?[image.naturalWidth,image.naturalHeight]:
   typeof image.width==='number'?[image.width,image.height]:[image.width.baseVal.value,(image as SVGImageElement).height.baseVal.value];
  const [width,height]=size as [number,number];
  if(!width||!height||width*sample.source.heightPixels!==height*sample.source.widthPixels)fail('OUTPUT_ASPECT_MISMATCH');
  // Validate before replacing the currently visible output; never draw model pixels into the source.
  const copy=this.host.canvas.ownerDocument.createElement('canvas');copy.width=sample.source.widthPixels;copy.height=sample.source.heightPixels;
  (copy.getContext('2d')??fail('OUTPUT_CONTEXT_UNAVAILABLE')).drawImage(frame.image,0,0,copy.width,copy.height);
  this.detachOutput();this.mode='frame';this.highestFrameId=sample.source.sourceFrameId;this.displayed=sample;
  this.outputCanvas.width=copy.width;this.outputCanvas.height=copy.height;this.outputContext.drawImage(copy,0,0);this.outputCanvas.style.display='block';this.refresh();
 }
 private showWorld():void {this.alive();this.detachOutput();this.mode='world';this.highestFrameId=0;this.refresh();}
 /** Called at reset admission, before any asynchronous reset preparation. */
 reset():void {if(this.disposed)return;this.epoch++;this.history.clear();this.showWorld();}
 dispose():void {
  if(this.disposed)return;this.disposed=true;this.detachOutput();
  for(const owned of [...this.streams])owned.close();
  for(const cleanup of [...this.cleanups].reverse())try{cleanup();}catch(error){this.error(error);}
  for(const cleanup of [...this.mounts.values()])try{cleanup();}catch(error){this.error(error);}
  this.cleanups.clear();this.bindings.clear();this.anchors.clear();this.history.clear();this.stage.remove();this.host.released();
 }
}
