import * as THREE from 'three';

/** Fit an SDK-owned canvas to its stage; caller-owned renderers retain their sizing policy. */
export function ownViewport(renderer:THREE.WebGLRenderer,camera:THREE.Camera,canvas:HTMLCanvasElement):()=>void {
 if(typeof window==='undefined')return()=>{};
 const parent=canvas.parentElement;
 const fullscreen=!parent||parent===document.body||parent===document.documentElement;
 const originalWidth=canvas.style.width,originalHeight=canvas.style.height,originalDisplay=canvas.style.display;
 const authoredCanvasSize=Boolean(originalWidth||originalHeight||canvas.hasAttribute('width')||canvas.hasAttribute('height'));
 const abort=new AbortController();let closed=false;let previousWidth=0,previousHeight=0;
 const resize=()=>{
  if(closed)return;
  const bounds=authoredCanvasSize?canvas.getBoundingClientRect():!fullscreen?parent!.getBoundingClientRect():undefined;
  const width=Math.max(1,Math.round(bounds?.width||window.innerWidth));
  const height=Math.max(1,Math.round(bounds?.height||window.innerHeight));
  if(width===previousWidth&&height===previousHeight)return;previousWidth=width;previousHeight=height;
  renderer.setSize(width,height,!authoredCanvasSize);
  if(!authoredCanvasSize)canvas.style.display='block';
  if(camera instanceof THREE.PerspectiveCamera){camera.aspect=width/height;camera.updateProjectionMatrix();}
 };
 resize();window.addEventListener('resize',resize,{signal:abort.signal});
 const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(resize);
 if(parent&&!fullscreen)observer?.observe(parent);
 return()=>{if(closed)return;closed=true;abort.abort();observer?.disconnect();canvas.style.width=originalWidth;canvas.style.height=originalHeight;canvas.style.display=originalDisplay;};
}
