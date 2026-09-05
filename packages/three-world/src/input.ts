import type { WorldInput } from './contracts.js';

export const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE']);
export class WorldKeyboard {
  readonly held = new Set<string>();
  private jumpQueued = false;
  private interactQueued = false;
  private abort: AbortController | undefined;
  enabled = false;
  readonly transcript: { type: 'keydown' | 'keyup' | 'blur'; code: string; repeat: boolean; simulationTick: number }[] = [];
  constructor(private readonly getTick: () => number, private readonly reset: () => void) {}
  attach(target: Window): void {
    this.detach(); this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    target.addEventListener('keydown', event => {
      if (!this.enabled || (event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)))) return;
      if (MOVEMENT_KEYS.has(event.code) || event.code === 'KeyR') event.preventDefault();
      if (event.code === 'KeyR' && !event.repeat) { this.reset(); return; }
      this.keyDown(event.code, event.repeat);
    }, options);
    target.addEventListener('keyup', event => this.keyUp(event.code), options);
    target.addEventListener('blur', () => { this.record('blur', '', false); this.clear(); }, options);
  }
  keyDown(code: string, repeat = false): void {
    if (!this.enabled || !MOVEMENT_KEYS.has(code)) return;
    this.record('keydown', code, repeat);
    if (repeat && !this.held.has(code)) return;
    if (!this.held.has(code)) {
      if (code === 'Space') this.jumpQueued = true;
      if (code === 'KeyE') this.interactQueued = true;
    }
    this.held.add(code);
  }
  keyUp(code: string): void { if (MOVEMENT_KEYS.has(code)) this.record('keyup', code, false); this.held.delete(code); }
  private record(type: 'keydown' | 'keyup' | 'blur', code: string, repeat: boolean): void {
    if (this.transcript.length < 100_000) this.transcript.push({ type, code, repeat, simulationTick: this.getTick() });
  }
  sample(): WorldInput {
    const has = (...codes: string[]) => codes.some(code => this.held.has(code));
    const result: WorldInput = {
      moveXRatio: Number(has('KeyD', 'ArrowRight')) - Number(has('KeyA', 'ArrowLeft')),
      moveZRatio: Number(has('KeyS', 'ArrowDown')) - Number(has('KeyW', 'ArrowUp')),
      run: has('ShiftLeft', 'ShiftRight'),
      jump: this.jumpQueued || has('Space'),
      jumpPressed: this.jumpQueued,
      interact: this.interactQueued || has('KeyE'),
      interactPressed: this.interactQueued,
    };
    this.jumpQueued = false; this.interactQueued = false; return result;
  }
  clear(): void { this.held.clear(); this.jumpQueued = false; this.interactQueued = false; }
  detach(): void { this.abort?.abort(); this.abort = undefined; this.clear(); }
}
