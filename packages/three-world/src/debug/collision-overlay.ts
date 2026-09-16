import {Matrix4,Quaternion,Vector3,Vector4} from 'three';
import type {RuntimeSample,ThreeWorld,PresentationUI} from '../index.js';

/** Clip in homogeneous space, including the near plane; never join lines across the camera. */
export function clipCollisionSegment(a:Vector4,b:Vector4):[Vector4,Vector4]|null{
 const planes=(v:Vector4)=>[v.w+v.x,v.w-v.x,v.w+v.y,v.w-v.y,v.w+v.z,v.w-v.z];
 const from=planes(a),to=planes(b);let low=0,high=1;
 for(let i=0;i<6;i++){
  const p=from[i]!,q=to[i]!;if(p<0&&q<0)return null;
  if(p<0)low=Math.max(low,p/(p-q));else if(q<0)high=Math.min(high,p/(p-q));
 }
 if(low>high)return null;
 const start=a.clone().lerp(b,low),end=a.clone().lerp(b,high);
 return start.w>1e-8&&end.w>1e-8?[start,end]:null;
}

/** Separate DOM overlay: pure renderer pixels and the active camera are untouched. */
export function createCollisionOverlay(world:ThreeWorld,ui:PresentationUI){
 if(!world.renderer)throw Error('DEBUG_OVERLAY_REQUIRES_RENDERER');
 const canvas=world.renderer.domElement.ownerDocument.createElement('canvas'),context=canvas.getContext('2d');
 if(!context)throw Error('DEBUG_OVERLAY_CONTEXT_UNAVAILABLE');
 canvas.setAttribute('aria-hidden','true');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
 const unmount=ui.mount(canvas);let enabled=false,disposed=false,lastError:string|null=null;
 let latest:Extract<RuntimeSample,{kind:'rendered-frame'}>|undefined;
 let geometryTick:number|null=null,segments=0,omittedSegments=0;
 const draw=(frame:NonNullable<typeof latest>)=>{
  if(!enabled||disposed)return;
  try{
   const scale=Math.min(1,1600/Math.max(frame.widthPixels,frame.heightPixels));
   const width=Math.max(1,Math.round(frame.widthPixels*scale)),height=Math.max(1,Math.round(frame.heightPixels*scale));
   if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
   context.clearRect(0,0,width,height);
   const geometry=world.inspectCollisionGeometry();geometryTick=geometry.simulationTick;omittedSegments=geometry.omittedSegments;segments=0;
   const view=new Matrix4().compose(new Vector3(...frame.camera.positionWorldMetersXYZ),new Quaternion(...frame.camera.quaternionWorldXYZW),new Vector3(1,1,1)).invert();
   const projection=new Matrix4().fromArray(frame.camera.projectionMatrix).multiply(view);
   context.lineWidth=1;context.strokeStyle='#66ffbb';context.beginPath();
   for(let n=0;n<geometry.verticesWorldMeters.length;n+=6){
    const v=geometry.verticesWorldMeters;
    const clipped=clipCollisionSegment(new Vector4(v[n]!,v[n+1]!,v[n+2]!,1).applyMatrix4(projection),new Vector4(v[n+3]!,v[n+4]!,v[n+5]!,1).applyMatrix4(projection));
    if(!clipped)continue;const [a,b]=clipped;
    context.moveTo((a.x/a.w+1)*width/2,(1-a.y/a.w)*height/2);context.lineTo((b.x/b.w+1)*width/2,(1-b.y/b.w)*height/2);segments++;
   }
   context.stroke();lastError=null;
  }catch(error){lastError=String(error);enabled=false;context.clearRect(0,0,canvas.width,canvas.height);}
 };
 const unsubscribe=world.onRuntimeSample(sample=>{if(sample.kind==='rendered-frame'){latest=sample;draw(sample);}});
 const dispose=()=>{if(disposed)return;disposed=true;unsubscribe();unmount();releaseDispose();canvas.width=canvas.height=0;};
 const releaseDispose=world.onDispose(dispose);
 return {
  setEnabled(value:boolean){if(disposed)throw Error('DEBUG_OVERLAY_DISPOSED');enabled=value;if(value&&latest)draw(latest);else context.clearRect(0,0,canvas.width,canvas.height);},
  inspect:()=>({enabled,source:'committed-physics' as const,geometrySimulationTick:geometryTick,displayFrameId:latest?.frameId??null,segments,omittedSegments,lastError}),
  dispose,
 };
}
