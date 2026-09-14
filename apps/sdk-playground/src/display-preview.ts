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
  onRender?(callback:()=>void):()=>void;
  inputSurface?:HTMLElement; focusGameplay?():void;
  context(): DisplayContext; overlay?: DisplayOverlay; onError(error: unknown): void;
}) {
  const { scene, camera, source, overlay } = options;
  const transaction = createDisplayScene(scene);
  const cameraDisplay = createCameraDisplay({collisionDiagnostics:()=>options.collisionDiagnostics?.(),source:camera,mount:options.inputSurface??options.mount,focusGameplay:()=>options.focusGameplay?.(),redraw:()=>draw()});
  const monitor=createCameraMonitor(source.domElement,options.inputSurface??options.mount,()=>options.focusGameplay?.(),{locate:()=>cameraDisplay.locate(),setFollowing:value=>cameraDisplay.setFollowing(value)});
  let renderer: T.WebGLRenderer | undefined, settings = defaultDisplaySettings(), failed = false, disposed = false;
  const previous = scene.onAfterRender;
  const size = new T.Vector2();
  function draw() {
    if (disposed || failed || !isDisplayPreviewActive(settings)) { if (renderer) renderer.domElement.hidden = true; return; }
    try {
      const renderSettings=resolveDisplaySettings(settings);
      if (!renderer) {
        renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha:true });
        renderer.domElement.dataset.displayPreview = '';
        renderer.domElement.setAttribute('aria-label', '诊断预览');
        renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
        options.mount.append(renderer.domElement);
      }
      source.getSize(size);
      if (renderer.domElement.width !== source.domElement.width || renderer.domElement.height !== source.domElement.height) {
        renderer.setPixelRatio(source.getPixelRatio()); renderer.setSize(size.x, size.y, false);
      }
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
      if(renderSettings.cameras)cameraDisplay.render(scene,camera,renderSettings,context.subjects??[],size.x,size.y,drawScene);
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
      monitor.copyFrame();
      // Picture overlays stay aligned with the source's display sample. The world
      // observer waits for SDK restoration so first-person clipping and subject
      // fading never leak into its committed subjects. The source camera retains
      // its actual display pose, which also identifies the displayed probe sample.
      if(!resolveDisplaySettings(settings).cameras||!options.onRender)draw();
    }
  };
  scene.onAfterRender = afterRender;
  const releaseRender=options.onRender?.(()=>{if(resolveDisplaySettings(settings).cameras)draw();});
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
