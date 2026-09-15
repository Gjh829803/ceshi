import type {Page} from 'playwright';
import {unavailableViewport, type ViewportDiagnostics, type ViewportSize, type ViewportWarning} from '../browser/viewport-diagnostics.js';

const sameSize = (a: ViewportSize, b: ViewportSize) => Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;

/** Explicit browser resize probe. No world lifecycle, camera writes or recording eligibility changes. */
export async function checkViewport(page: Page, target: ViewportSize, read: () => Promise<ViewportDiagnostics>) {
  const sample = async () => { try { return await read(); } catch { return unavailableViewport('VIEWPORT_READ_FAILED'); } };
  const before = await sample(), original = page.viewportSize();
  let resized = unavailableViewport('RESIZE_NOT_MEASURED'), restored = unavailableViewport('RESTORE_NOT_MEASURED');
  let resizeStatus: 'measured' | 'unavailable' = 'unavailable';
  let restorationStatus: 'restored' | 'unavailable' | 'changed' = 'unavailable';
  const warnings: ViewportWarning[] = [];
  // A bounded wait permits resize/ResizeObserver/debounced handlers without waiting on the simulation clock.
  const settle = () => page.waitForTimeout(250);
  if (original) {
    try {
      await page.setViewportSize(target); await settle(); resized = await sample();
      resizeStatus = resized.status;
    } catch { resized = unavailableViewport('RESIZE_PROBE_FAILED'); }
    finally {
      try {
        await page.setViewportSize(original); await settle(); restored = await sample();
        const a = before.evidence, b = restored.evidence;
        if (a && b) restorationStatus = sameSize(a.browserViewportCssPixels, b.browserViewportCssPixels)
          && sameSize(a.canvasBoundsCssPixels, b.canvasBoundsCssPixels) && sameSize(a.drawingBufferPixels, b.drawingBufferPixels)
          && a.cameraAspect === b.cameraAspect ? 'restored' : 'changed';
      } catch { restored = unavailableViewport('VIEWPORT_RESTORE_FAILED'); }
    }
  }
  const a = before.evidence, b = resized.evidence;
  if (a && b && !sameSize(a.displayedImageCssPixels, b.displayedImageCssPixels) && sameSize(a.drawingBufferPixels, b.drawingBufferPixels)) {
    warnings.push({code: 'RENDER_SIZE_UNCHANGED_AFTER_RESIZE', message: 'The displayed image changed size but the drawing buffer did not. Check whether fixed render resolution is intentional.'});
  }
  if (restorationStatus === 'changed') warnings.push({code: 'VIEWPORT_STATE_NOT_RESTORED', message: 'The browser size was restored but canvas sizing or camera aspect did not return to its initial value. Inspect the authored resize handler.'});
  return {advisory: true as const, resizeStatus, restorationStatus, requestedViewportCssPixels: target,
    settleMilliseconds: 250, before, resized, restored, warnings};
}
