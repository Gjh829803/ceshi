import type {Camera, WebGLRenderer} from 'three';

export interface ViewportSize { width: number; height: number }
export interface ViewportWarning { code: string; message: string }
export interface ViewportDiagnostics {
  advisory: true;
  status: 'measured' | 'unavailable';
  reason?: string;
  clock: 'browser-performance';
  sampledAtMilliseconds: number | null;
  evidence: {
    drawingBufferPixels: ViewportSize;
    canvasBoundsCssPixels: ViewportSize;
    displayedImageCssPixels: ViewportSize;
    parentBoundsCssPixels: ViewportSize | null;
    browserViewportCssPixels: ViewportSize;
    devicePixelRatio: number;
    pixelsPerCssPixel: {x: number; y: number};
    nativeResolutionRatio: {x: number; y: number};
    cameraAspect: number | null;
    objectFit: string;
  } | null;
  warnings: ViewportWarning[];
}

export const unavailableViewport = (reason: string): ViewportDiagnostics => ({
  advisory: true, status: 'unavailable', reason, clock: 'browser-performance', sampledAtMilliseconds: null, evidence: null, warnings: [],
});

/** Read the live canvas, never screenshot/export dimensions or temporary capture targets. */
export function inspectViewport(renderer: WebGLRenderer, camera: Camera): ViewportDiagnostics {
  try {
    const canvas = renderer.domElement, win = canvas.ownerDocument.defaultView;
    if (!win || !canvas.isConnected) return unavailableViewport('CANVAS_NOT_ATTACHED');
    const rect = canvas.getBoundingClientRect(), style = win.getComputedStyle(canvas);
    // Exclude borders/padding: only the replaced element's content displays pixels.
    const css = (value: string) => Number.parseFloat(value) || 0;
    const width = rect.width - css(style.borderLeftWidth) - css(style.borderRightWidth) - css(style.paddingLeft) - css(style.paddingRight);
    const height = rect.height - css(style.borderTopWidth) - css(style.borderBottomWidth) - css(style.paddingTop) - css(style.paddingBottom);
    const devicePixelRatio = win.devicePixelRatio;
    if (![width, height, canvas.width, canvas.height, devicePixelRatio].every(value => Number.isFinite(value) && value > 0)) {
      return unavailableViewport('CANVAS_SIZE_UNAVAILABLE');
    }
    let imageWidth = width, imageHeight = height;
    const objectFit = style.objectFit || 'fill';
    if (objectFit !== 'fill') {
      const contain = Math.min(width / canvas.width, height / canvas.height);
      const scale = objectFit === 'cover' ? Math.max(width / canvas.width, height / canvas.height)
        : objectFit === 'none' ? 1 : objectFit === 'scale-down' ? Math.min(1, contain) : contain;
      imageWidth = canvas.width * scale; imageHeight = canvas.height * scale;
    }
    const density = {x: canvas.width / imageWidth, y: canvas.height / imageHeight};
    const perspective = camera as Camera & {isPerspectiveCamera?: boolean; aspect?: number};
    const cameraAspect = perspective.isPerspectiveCamera && Number.isFinite(perspective.aspect) && perspective.aspect! > 0 ? perspective.aspect! : null;
    const warnings: ViewportWarning[] = [];
    // Allow one pixel of rounding; deliberate low resolution remains a valid author choice.
    if (canvas.width + 1 < imageWidth || canvas.height + 1 < imageHeight) warnings.push({
      code: 'CANVAS_UNDERSAMPLED', message: 'The displayed image has less than one render pixel per CSS pixel. Check blur against the intended performance or pixel-art choice.',
    });
    if (cameraAspect !== null && Math.abs(cameraAspect * canvas.height - canvas.width) > 1) warnings.push({
      code: 'CAMERA_ASPECT_MISMATCH', message: 'Perspective camera aspect differs from the drawing buffer. Check camera projection updates when the viewport changes.',
    });
    if (objectFit === 'fill' && Math.abs(width / height * canvas.height - canvas.width) > 1) warnings.push({
      code: 'CANVAS_DISPLAY_ASPECT_MISMATCH', message: 'CSS stretches the drawing buffer to a different aspect ratio. Check canvas sizing and resize handling.',
    });
    const parent = canvas.parentElement?.getBoundingClientRect();
    return {
      advisory: true, status: 'measured', clock: 'browser-performance', sampledAtMilliseconds: performance.now(),
      evidence: {
        drawingBufferPixels: {width: canvas.width, height: canvas.height},
        canvasBoundsCssPixels: {width: rect.width, height: rect.height},
        displayedImageCssPixels: {width: imageWidth, height: imageHeight},
        parentBoundsCssPixels: parent ? {width: parent.width, height: parent.height} : null,
        browserViewportCssPixels: {width: win.innerWidth, height: win.innerHeight}, devicePixelRatio,
        pixelsPerCssPixel: density,
        nativeResolutionRatio: {x: density.x / devicePixelRatio, y: density.y / devicePixelRatio},
        cameraAspect, objectFit,
      }, warnings,
    };
  } catch { return unavailableViewport('VIEWPORT_DIAGNOSTICS_UNAVAILABLE'); }
}
