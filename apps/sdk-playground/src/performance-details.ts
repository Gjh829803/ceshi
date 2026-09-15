import type { Camera, Scene, WebGLRenderer } from 'three';
import type { ThreeWorld } from '@worldkit/three';

type GpuStatus = 'unsupported' | 'pending' | 'available' | 'invalid' | 'lost';
export type PerformanceDetailsReading = Readonly<{
  width: number; height: number; pixelRatio: number;
  cpuUpdate: number | null; cpuSubmit: number | null; gpu: number | null;
  gpuStatus: GpuStatus; status: 'sampling' | 'live' | 'idle' | 'hidden';
}>;
type TimerExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

/** App-owned diagnostics. Hooks the existing renderer only while details are open. */
export class PerformanceDetailsMonitor {
  private reading: PerformanceDetailsReading | null = null;
  private listeners = new Set<() => void>();
  private activate: (() => () => void) | undefined;
  private stop: (() => void) | undefined;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.reading;
  private publish(reading: PerformanceDetailsReading | null) {
    this.reading = reading;
    for (const listener of this.listeners) listener();
  }
  setEnabled(enabled: boolean) {
    if (enabled && !this.stop) this.stop = this.activate?.();
    if (!enabled) { this.stop?.(); this.stop = undefined; this.publish(null); }
  }
  dispose() { this.setEnabled(false); this.activate = undefined; }

  attach(renderer: WebGLRenderer, world: ThreeWorld, scene: Scene, camera: Camera) {
    this.activate = () => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      let extension: TimerExtension | null = null;
      try { extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null; } catch { /* unsupported */ }
      let gpuStatus: GpuStatus = extension ? 'pending' : 'unsupported';
      let query: WebGLQuery | null = null, queryAt = 0;
      let gpu: number | null = null, gpuAt = 0, lastFrame = 0;
      let cpuUpdate = 0, updateCount = 0, cpuSubmit = 0, submitCount = 0;
      const started = performance.now();
      const clearQuery = () => { if (query) gl.deleteQuery(query); query = null; };
      const resetSamples = () => {
        cpuUpdate = cpuSubmit = updateCount = submitCount = lastFrame = gpuAt = 0;
        gpu = null; clearQuery();
      };
      const release = world.onFrameTiming(sample => {
        if (document.hidden) return;
        lastFrame = sample.sampledAtMilliseconds;
        cpuUpdate += sample.cpuUpdateMilliseconds; updateCount++;
      });
      const original = renderer.render;
      const wrapped: WebGLRenderer['render'] = (object, view) => {
        // Exclude offscreen captures and external inspection cameras.
        if (object !== scene || view !== camera || renderer.getRenderTarget() !== null || document.hidden) {
          return original.call(renderer, object, view);
        }
        let active = false;
        try {
          if (gl.isContextLost()) { gpuStatus = 'lost'; gpu = null; query = null; }
          else if (extension) {
            if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
              clearQuery(); gpu = null; gpuStatus = 'invalid';
            } else {
              if (query && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
                const elapsed = Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
                gpu = Number.isFinite(elapsed) && elapsed >= 0 ? elapsed / 1e6 : null;
                gpuAt = queryAt; gpuStatus = gpu === null ? 'invalid' : 'available'; clearQuery();
              }
              // One outstanding asynchronous query, no waits or gl.finish().
              if (!query && !gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
                query = gl.createQuery();
                if (query) { queryAt = performance.now(); gl.beginQuery(extension.TIME_ELAPSED_EXT, query); active = true; }
              }
            }
          }
        } catch { clearQuery(); gpu = null; gpuStatus = 'invalid'; }
        const before = performance.now();
        let completed = false;
        try { original.call(renderer, object, view); completed = true; }
        finally {
          const elapsed = performance.now() - before;
          if (completed) { cpuSubmit += elapsed; submitCount++; }
          if (active && extension) {
            try { gl.endQuery(extension.TIME_ELAPSED_EXT); } catch { clearQuery(); gpu = null; gpuStatus = 'invalid'; }
          }
        }
      };
      renderer.render = wrapped;
      const update = () => {
        const now = performance.now();
        const status = document.hidden ? 'hidden' : lastFrame && now - lastFrame < 1000 ? 'live' : now - started < 1000 ? 'sampling' : 'idle';
        this.publish({
          width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, pixelRatio: renderer.getPixelRatio(),
          cpuUpdate: status === 'live' && updateCount ? cpuUpdate / updateCount : null,
          cpuSubmit: status === 'live' && submitCount ? cpuSubmit / submitCount : null,
          gpu: status === 'live' && gpuAt && now - gpuAt < 2000 ? gpu : null,
          gpuStatus, status,
        });
        cpuUpdate = cpuSubmit = updateCount = submitCount = 0;
      };
      const visibility = () => { resetSamples(); update(); };
      const lost = () => { query = null; resetSamples(); gpuStatus = 'lost'; update(); };
      const restored = () => {
        resetSamples();
        try { extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null; } catch { extension = null; }
        gpuStatus = extension ? 'pending' : 'unsupported'; update();
      };
      document.addEventListener('visibilitychange', visibility);
      renderer.domElement.addEventListener('webglcontextlost', lost);
      renderer.domElement.addEventListener('webglcontextrestored', restored);
      const timer = setInterval(update, 500);
      update();
      return () => {
        clearInterval(timer); release(); document.removeEventListener('visibilitychange', visibility);
        renderer.domElement.removeEventListener('webglcontextlost', lost);
        renderer.domElement.removeEventListener('webglcontextrestored', restored);
        if (renderer.render === wrapped) renderer.render = original;
        clearQuery();
      };
    };
  }
}

export const performanceDetails = new PerformanceDetailsMonitor();
