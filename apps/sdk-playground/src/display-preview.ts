import * as T from 'three';
import { createDisplayScene, type DisplayContext } from './display-scene';
import { defaultDisplaySettings, isDisplayPreviewActive, resolveDisplaySettings, type DisplaySettings, type DisplayRenderSettings } from './display-settings';

type DisplayOverlay = { root: T.Group; update(settings: DisplayRenderSettings, context:DisplayContext): void; dispose(): void };
export function createDisplayPreview(options: {
  scene: T.Scene; camera: T.Camera; source: T.WebGLRenderer; mount: HTMLElement;
  context(): DisplayContext; overlay?: DisplayOverlay; onError(error: unknown): void;
}) {
  const { scene, camera, source, overlay } = options;
  const transaction = createDisplayScene(scene);
  let renderer: T.WebGLRenderer | undefined, settings = defaultDisplaySettings(), failed = false, disposed = false;
  const previous = scene.onAfterRender;
  const size = new T.Vector2();
  function draw() {
    if (disposed || failed || !isDisplayPreviewActive(settings)) { if (renderer) renderer.domElement.hidden = true; return; }
    try {
      const renderSettings=resolveDisplaySettings(settings);
      if (!renderer) {
        renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
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
      const context = options.context(), helpers = overlay ? [overlay.root] : [];
      overlay?.update(renderSettings,context);
      if (overlay) overlay.root.visible = true;
      transaction.render(renderSettings, context, () => renderer!.render(scene, camera), helpers);
      if (renderSettings.wireframe && !['wireframe', 'collision', 'depth', 'normal', 'semantic'].includes(renderSettings.mode)) {
        if (overlay) overlay.root.visible = false;
        transaction.render({ ...renderSettings, mode: 'wireframe' }, context, () => {
          const background = scene.background; scene.background = null; renderer!.autoClear = false;
          try { renderer!.render(scene, camera); } finally { renderer!.autoClear = true; scene.background = background; }
        }, helpers);
      }
    } catch (error) {
      failed = true; if (renderer) renderer.domElement.hidden = true;
      options.onError(error);
    } finally { if (overlay) overlay.root.visible = false; }
  }
  const afterRender: typeof scene.onAfterRender = function (...args) {
    const [renderedBy, , renderedCamera] = args;
    if (renderedBy === renderer) return;
    previous.apply(scene, args);
    if (renderedBy === source && renderedCamera === camera && source.getRenderTarget() === null) draw();
  };
  scene.onAfterRender = afterRender;
  return {
    get canvas() { return renderer?.domElement; },
    setSettings(next: DisplaySettings) { settings = structuredClone(next); failed = false; if (renderer && !isDisplayPreviewActive(settings)) renderer.domElement.hidden = true; },
    clearMaterials: transaction.clearMaterials,
    dispose() {
      if (disposed) return; disposed = true;
      if (scene.onAfterRender === afterRender) scene.onAfterRender = previous;
      overlay?.dispose(); transaction.dispose(); renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
    },
  };
}
