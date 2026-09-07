// This module is loaded only by a derived production page, never the published world.
let marked;
function selectWorldCanvas(){
 const canvas=window.__WORLDKIT_EVAL__?.renderer?.domElement;
 if(!(canvas instanceof HTMLCanvasElement)||canvas===marked)return;
 marked?.removeAttribute('data-worldkit-episode-surface');
 canvas.setAttribute('data-worldkit-episode-surface','');marked=canvas;
}
// Author code keeps its DOM references; dynamic menus and extra canvases stay hidden by CSS.
const changes=new MutationObserver(selectWorldCanvas);
changes.observe(document.documentElement,{childList:true,subtree:true});
const ready=setInterval(()=>{selectWorldCanvas();if(marked)clearInterval(ready);},25);
window.addEventListener('pagehide',()=>{clearInterval(ready);changes.disconnect();},{once:true});
selectWorldCanvas();
