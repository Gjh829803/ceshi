/** 显示同帧的范围预览，不拥有游玩相机或独立渲染循环。 */
export function createCameraMonitor(source:HTMLCanvasElement,mount:HTMLElement,focusGameplay:()=>void,navigation:{locate():void;setFollowing(enabled:boolean):void}){
  const panel=document.createElement('section');panel.dataset.cameraMonitor='';panel.setAttribute('aria-label','实时取景预览');
  panel.style.cssText='position:absolute;right:16px;bottom:52px;width:min(360px,calc(100% - 32px));max-height:calc(100% - 112px);flex-direction:column;overflow:hidden;border:1px solid #547578;border-radius:8px;background:#0b252d;color:#d7e3de;box-shadow:0 8px 28px #0005;pointer-events:auto;font:12px sans-serif';
  const header=document.createElement('div');header.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:6px;padding:8px 10px;flex:none;flex-wrap:wrap';
  const title=document.createElement('span');title.textContent='游玩摄像机 · 范围预览';
  const toggle=document.createElement('button');toggle.type='button';toggle.textContent='放大';toggle.setAttribute('aria-label','放大取景窗口');toggle.setAttribute('aria-expanded','false');
  toggle.style.cssText='padding:4px 10px;border:1px solid #547578;border-radius:4px;background:#183b40;color:inherit;cursor:pointer;font:inherit';
  const canvas=document.createElement('canvas');canvas.dataset.cameraMonitorFrame='';canvas.setAttribute('aria-label','游玩摄像机画面');
  canvas.style.cssText='display:block;width:100%;min-height:0;object-fit:contain;background:#000;flex:0 1 auto';
  title.style.flex='1';
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:6px;flex-basis:100%';
  const locate=document.createElement('button');locate.type='button';locate.textContent='定位摄像机';locate.style.cssText=toggle.style.cssText;
  locate.title='世界视角定位到当前游玩摄像机与角色附近';
  const follow=document.createElement('button');follow.type='button';follow.setAttribute('role','switch');follow.setAttribute('aria-label','跟随位置');follow.setAttribute('aria-checked','false');follow.textContent='跟随位置：关';follow.style.cssText=toggle.style.cssText;
  let following=false;
  locate.addEventListener('click',()=>{navigation.locate();focusGameplay();});
  follow.addEventListener('click',()=>{following=!following;follow.setAttribute('aria-checked',String(following));follow.textContent=following?'跟随位置：开':'跟随位置：关';follow.style.background=following?'#35625a':'#183b40';navigation.setFollowing(following);focusGameplay();});
  actions.append(locate,follow);
  header.append(title,toggle,actions);panel.append(header,canvas);mount.append(panel);
  let expanded=false,enabled=false;
  panel.hidden=true;panel.style.display='none';
  const context=canvas.getContext('2d');
  panel.addEventListener('pointerdown',event=>{event.stopPropagation();if(!(event.target instanceof HTMLElement)||!event.target.closest('button'))focusGameplay();});
  panel.addEventListener('wheel',event=>{event.stopPropagation();event.preventDefault();},{passive:false});
  toggle.addEventListener('click',()=>{
    expanded=!expanded;panel.style.width=expanded?'min(780px,calc(100% - 32px))':'min(360px,calc(100% - 32px))';
    toggle.textContent=expanded?'还原':'放大';toggle.setAttribute('aria-label',expanded?'还原取景窗口':'放大取景窗口');toggle.setAttribute('aria-expanded',String(expanded));focusGameplay();
  });
  return {
    get width(){return canvas.clientWidth||360;},
    setRange(meters:number){title.textContent=`游玩摄像机 · 范围预览 ${Number(meters.toFixed(2))} m`;},
    setEnabled(value:boolean){enabled=value;panel.hidden=!value;panel.style.display=value?'flex':'none';},
    // Copy before the shared diagnostic renderer draws its full world viewport.
    copyFrame(frame=source,region={x:0,y:0,width:frame.width,height:frame.height}){
      if(!enabled||!context||!region.width||!region.height)return;
      if(canvas.width!==region.width||canvas.height!==region.height){canvas.width=region.width;canvas.height=region.height;}
      context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(frame,region.x,region.y,region.width,region.height,0,0,canvas.width,canvas.height);
    },
    dispose(){enabled=false;panel.remove();canvas.width=canvas.height=1;},
  };
}
