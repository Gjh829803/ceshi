/** Internal real-time lifecycle. Simulation, presentation and resource ownership
 * remain with the world and its existing subsystems. No second clock is created. */
export class WorldLifecycle {
  private state: 'stopped' | 'running' | 'disposed' = 'stopped';
  private frameGeneration = 0;
  private frameId = 0;
  private lastFrameTime = 0;

  constructor(private readonly hooks: {
    prepareStart(): void;
    activate(): void;
    deactivate(): void;
    frame(elapsedSeconds: number): void;
  }) {}

  get running(): boolean { return this.state === 'running'; }
  get disposed(): boolean { return this.state === 'disposed'; }
  assertAlive(): void { if (this.disposed) throw new Error('WORLD_DISPOSED'); }

  start(): void {
    this.assertAlive();
    if (this.running) return;
    this.hooks.prepareStart();
    this.state = 'running';
    this.hooks.activate();
    const generation = ++this.frameGeneration;
    // Headless callers keep using the world's explicit advance/step methods.
    if (typeof requestAnimationFrame === 'undefined') return;
    // Preserve the existing first-frame and timestamp semantics on every start.
    this.lastFrameTime = 0;
    const frame = (time: number) => {
      if (!this.running || this.disposed || generation !== this.frameGeneration) return;
      const elapsed = this.lastFrameTime ? Math.max(0, (time - this.lastFrameTime) / 1000) : 0;
      this.lastFrameTime = time;
      this.hooks.frame(elapsed);
      // A callback may stop, dispose, or restart the world. An old frame must
      // never schedule a second loop after that transition.
      if (this.running && generation === this.frameGeneration) this.frameId = requestAnimationFrame(frame);
    };
    this.frameId = requestAnimationFrame(frame);
  }

  stop(): void {
    if (!this.disposed) this.state = 'stopped';
    this.hooks.deactivate();
    this.frameGeneration += 1;
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  /** Mark disposal before subsystem cleanup so re-entrant calls cannot repeat it. */
  beginDisposal(): boolean {
    if (this.disposed) return false;
    this.stop();
    this.state = 'disposed';
    return true;
  }
}