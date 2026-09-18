import type { RemoteInputLease, RemoteInputState } from './contracts.js';
import type { WorldKeyboard } from './input.js';

/** One admission queue, consumed only by WorldEngine's existing live fixed step. */
export class QueuedRemoteInput implements RemoteInputLease {
  private sequence = -1;
  private packets: RemoteInputState[] = [];
  private disposed = false;
  constructor(private readonly keyboard: WorldKeyboard,
    private readonly pointer: (value: {yawDeltaRadians:number;pitchDeltaRadians:number;distanceDeltaMeters:number}) => void,
    private readonly released: () => void) { keyboard.remoteMode = true; }
  submit(input: RemoteInputState): boolean {
    if (this.disposed) throw new Error('WORLD_REMOTE_INPUT_RELEASED');
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 0 || !Array.isArray(input.heldKeys) || input.heldKeys.length > 64 ||
      !Array.isArray(input.keyEdges) || input.keyEdges.length > 128 || input.heldKeys.some(key => typeof key !== 'string' || key.length > 32) ||
      input.keyEdges.some(edge => !edge || !['down','up'].includes(edge.kind) || typeof edge.code !== 'string' || edge.code.length > 32) ||
      [input.yawDeltaRadians,input.pitchDeltaRadians,input.distanceDeltaMeters].some(value => value !== undefined && (!Number.isFinite(value) || Math.abs(value)>100)))
      throw new Error('WORLD_REMOTE_INPUT_INVALID');
    if (input.sequence <= this.sequence) return false;
    if (this.packets.length >= 128) { this.clear();throw new Error('WORLD_REMOTE_INPUT_OVERFLOW'); }
    this.sequence = input.sequence;
    this.packets.push(structuredClone(input));return true;
  }
  drain(): void {
    let yawDeltaRadians=0,pitchDeltaRadians=0,distanceDeltaMeters=0;
    for (const packet of this.packets) {
      for (const edge of packet.keyEdges) {
        if (edge.kind === 'down') this.keyboard.keyDown(edge.code);else this.keyboard.keyUp(edge.code);
      }
      this.keyboard.reconcileHeld(packet.heldKeys);
      yawDeltaRadians+=packet.yawDeltaRadians??0;pitchDeltaRadians+=packet.pitchDeltaRadians??0;distanceDeltaMeters+=packet.distanceDeltaMeters??0;
    }
    this.packets=[];
    if(yawDeltaRadians||pitchDeltaRadians||distanceDeltaMeters)this.pointer({yawDeltaRadians,pitchDeltaRadians,distanceDeltaMeters});
  }
  clear(): void { this.packets=[];this.keyboard.clear(); }
  dispose(): void {
    if(this.disposed)return;this.disposed=true;this.clear();this.keyboard.remoteMode=false;this.released();
  }
}
