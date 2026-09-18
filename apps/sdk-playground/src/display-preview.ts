import * as T from 'three';
import {createCameraDisplay} from './display-camera';
import type {CameraProbeSample} from './display-camera-probes';
import {createCameraMonitor} from './display-camera-monitor';
import { createDisplayScene, type DisplayContext } from './display-scene';
import { defaultDisplaySettings, isDisplayPreviewActive, resolveDisplaySettings, type DisplaySettings, type DisplayRenderSettings } from './display-settings';

type DisplayOverlay = { root: T.Group; update(settings: DisplayRenderSettings, context:DisplayContext): void; dispose(): void };
export function createDisplayPreview(options: {
  scene: T.Scene; camera: T.Camera; source: T.WebGLRenderer; mount: HTMLElement;
  collisionDiagnostics?():CameraProbeSample|undefined;
  /** SDK render completion, after its camera/body display transaction restores. */
  onRender?(callback:(interpolationAlpha:number)=>void):()=>void;
  /** SDK-owned display resampling with full subject visibility for the world observer. */
  withPresentation?(draw:()=>void,interpolationAlpha:number):void;
  inputSurface?:HTMLElement; focusGameplay?():void;
  context(): DisplayContext; overlay?: DisplayOverlay; onError(error: unknown): void;
}) {
  const { scene, camera, source, overlay } = options;
  const transaction = createDisplayScene(scene);
  const cameraDisplay = createCameraDisplay({collisionDiagnostics:()=>options.collisionDiagnostics?.(),source:camera,mount:options.inputSurface??options.mount,focusGameplay:()=>options.focusGameplay?.(),redraw:()=>draw()});
  const monitor=createCameraMonitor(source.domElement,options.inputSurface??options.mount,()=>options.focusGameplay?.(),{locate:()=>cameraDisplay.locate(),setFollowing:value=>cameraDisplay.setFollowing(value)});
  let renderer: T.WebGLRenderer | undefined, settings = defaultDisplaySettings(), failed = false, disposed = false;
  let interpolationAlpha=1;
  const previous = scene.onAfterRender;
  const size = new T.Vector2();
  let monitorCamera:T.PerspectiveCamera|T.OrthographicCamera|undefined;
  function prepareRenderer(){
    if (!renderer) {
      renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha:true });
      renderer.domElement.dataset.displayPreview = '';
      renderer.domElement.setAttribute('aria-label', '诊断预览');
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
      options.mount.append(renderer.domElement);
      // Diagnostic passes must not rewrite shadow maps owned by the source.
      renderer.shadowMap.enabled = false;
    }
    source.getSize(size);
    if (renderer.domElement.width !== source.domElement.width || renderer.domElement.height !== source.domElement.height) {
      renderer.setPixelRatio(source.getPixelRatio()); renderer.setSize(size.x, size.y, false);
    }
    return renderer;
  }
  function drawMonitor(){
    if(disposed||failed||!resolveDisplaySettings(settings).cameras)return;
    if(!(camera instanceof T.PerspectiveCamera||camera instanceof T.OrthographicCamera)){monitor.copyFrame();return;}
    try{
      const diagnostic=prepareRenderer();
      monitorCamera??=camera.clone();
      if(monitorCamera instanceof T.PerspectiveCamera&&camera instanceof T.PerspectiveCamera)monitorCamera.copy(camera,false);
      else if(monitorCamera instanceof T.OrthographicCamera&&camera instanceof T.OrthographicCamera)monitorCamera.copy(camera,false);
      camera.getWorldPosition(monitorCamera.position);camera.getWorldQuaternion(monitorCamera.quaternion);monitorCamera.scale.setScalar(1);
      monitorCamera.matrixAutoUpdate=true;monitorCamera.matrixWorldAutoUpdate=true;
      monitorCamera.far=Math.max(camera.near+.01,Math.min(camera.far,settings.cameraRange));
      monitorCamera.updateProjectionMatrix();monitorCamera.updateMatrixWorld(true);
      monitor.setRange(monitorCamera.far);
      // Render only the monitor's pixel area using the existing diagnostic
      // renderer, during the source's display transaction (including body fade).
      const width=Math.min(size.x,monitor.width),height=width*size.y/size.x;
      const viewport=diagnostic.getViewport(new T.Vector4()),scissor=diagnostic.getScissor(new T.Vector4()),scissorTest=diagnostic.getScissorTest();
      diagnostic.outputColorSpace=source.outputColorSpace;diagnostic.toneMapping=source.toneMapping;diagnostic.toneMappingExposure=source.toneMappingExposure;
      diagnostic.setClearColor(source.getClearColor(new T.Color()),source.getClearAlpha());
      try{
        diagnostic.setViewport(0,0,width,height);diagnostic.setScissor(0,0,width,height);diagnostic.setScissorTest(true);
        diagnostic.render(scene,monitorCamera);
        const pixelsWide=Math.round(width*diagnostic.getPixelRatio()),pixelsHigh=Math.round(height*diagnostic.getPixelRatio());
        monitor.copyFrame(diagnostic.domElement,{x:0,y:diagnostic.domElement.height-pixelsHigh,width:pixelsWide,height:pixelsHigh});
      }finally{diagnostic.setViewport(viewport);diagnostic.setScissor(scissor);diagnostic.setScissorTest(scissorTest);}
    }catch(error){
      cameraDisplay.setEnabled(false);monitor.setEnabled(false);failed=true;if(renderer)renderer.domElement.hidden=true;
      options.onError(error);
    }
  }
  function draw() {
    if (disposed || failed || !isDisplayPreviewActive(settings)) { if (renderer) renderer.domElement.hidden = true; return; }
    try {
      const renderSettings=resolveDisplaySettings(settings);
      renderer=prepareRenderer();
      renderer.outputColorSpace = renderSettings.mode === 'depth' ? T.LinearSRGBColorSpace : source.outputColorSpace;
      renderer.toneMapping = renderSettings.mode === 'material' || renderSettings.mode === 'clay' ? source.toneMapping : T.NoToneMapping;
      renderer.toneMappingExposure = source.toneMappingExposure;
      // Shadow maps belong to the source renderer; a diagnostic pass must not rewrite them.
      renderer.shadowMap.enabled = false;
      renderer.domElement.hidden = false;
      const context=options.context(),helpers=overlay?[overlay.root]:[];
      overlay?.update(renderSettings,context);
      const drawScene=(view:T.Camera,cameraHelper?:T.Object3D)=>{
        const allHelpers=cameraHelper?[...helpers,cameraHelper]:helpers;
        if(overlay)overlay.root.visible=true;
        transaction.render(renderSettings,context,()=>renderer!.render(scene,view),allHelpers);
        if(renderSettings.wireframe&&!['wireframe','collision','depth','normal','semantic'].includes(renderSettings.mode)){
          if(overlay)overlay.root.visible=false;
          const helperVisible=cameraHelper?.visible;if(cameraHelper)cameraHelper.visible=false;
          try {transaction.render({...renderSettings,mode:'wireframe'},context,()=>{
            const background=scene.background;scene.background=null;renderer!.autoClear=false;
            try{renderer!.render(scene,view);}finally{renderer!.autoClear=true;scene.background=background;}
          },allHelpers);}finally{if(cameraHelper)cameraHelper.visible=helperVisible!;}
        }
      };
      if(renderSettings.cameras){
        const drawWorld=()=>cameraDisplay.render(scene,camera,renderSettings,context.subjects??[],size.x,size.y,drawScene,context.followTarget);
        // The source camera keeps its interpolated pose after SDK restoration,
        // but subject roots do not. Resample both at that frame's alpha, retaining
        // full bodies rather than first-person clipping or gameplay camera fade.
        if(options.withPresentation){
          // Renderer/helper failures stay local; let the SDK restore successfully
          // before reporting them, rather than stopping its gameplay clock.
          let failure:{error:unknown}|undefined;
          options.withPresentation(()=>{try{drawWorld();}catch(error){failure={error};}},interpolationAlpha);
          if(failure)throw failure.error;
        }
        else drawWorld();
      }
      else drawScene(camera);
    } catch (error) {
      cameraDisplay.setEnabled(false);monitor.setEnabled(false);failed = true; if (renderer) renderer.domElement.hidden = true;
      options.onError(error);
    } finally { if (overlay) overlay.root.visible = false; }
  }
  const afterRender: typeof scene.onAfterRender = function (...args) {
    const [renderedBy, , renderedCamera] = args;
    if (renderedBy === renderer) return;
    previous.apply(scene, args);
    if (renderedBy === source && renderedCamera === camera && source.getRenderTarget() === null) {
      drawMonitor();
      // Picture overlays stay aligned with the source's display sample. The world
      // observer waits for SDK restoration, then resamples with full bodies so
      // first-person clipping and subject fading never leak. The source camera retains
      // its actual display pose, which also identifies the displayed probe sample.
      if(!resolveDisplaySettings(settings).cameras||!options.onRender)draw();
    }
  };
  scene.onAfterRender = afterRender;
  const releaseRender=options.onRender?.(alpha=>{interpolationAlpha=alpha;if(resolveDisplaySettings(settings).cameras)draw();});
  function setSettings(next:DisplaySettings){
    settings=structuredClone(next);failed=false;cameraDisplay.setEnabled(resolveDisplaySettings(settings).cameras);
    monitor.setEnabled(resolveDisplaySettings(settings).cameras);
    if(renderer&&!isDisplayPreviewActive(settings))renderer.domElement.hidden=true;
  }
  return {
    get canvas() { return renderer?.domElement; },
    setSettings,
    get worldCamera(){return cameraDisplay.camera;},
    clearMaterials: transaction.clearMaterials,
    dispose() {
      if (disposed) return; disposed = true;
      releaseRender?.();
      if (scene.onAfterRender === afterRender) scene.onAfterRender = previous;
      monitor.dispose();cameraDisplay.dispose(); overlay?.dispose(); transaction.dispose(); renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
    },
  };
}
