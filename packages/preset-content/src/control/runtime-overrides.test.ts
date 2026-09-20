import { describe, expect, it } from 'vitest';
import { getDefaultControlProfile } from './profiles';
import { resolveControlProfile } from './resolve';
import { applyRuntimeControlOverrides, RuntimeControlOverrideStore } from './runtime-overrides';

describe('runtime control overrides', () => {
  it('applies named transient limits after static layers and records their source', () => {
    const shared = getDefaultControlProfile('plane')!;
    const resolved = applyRuntimeControlOverrides(resolveControlProfile({ shared }), [{
      id: 'landing-limit', reason: 'landing mode', assetId: 'plane', control: { maxSpeed: 20 }, aircraftFlight: { pitchGain: 4 },
    }]);
    expect(resolved.profile.control.maxSpeed).toBe(20);
    expect(resolved.profile.aircraftFlight?.pitchGain).toBe(4);
    expect(resolved.sources['control.maxSpeed']).toBe('runtime-override');
  });

  it('clears target-scoped overrides and rejects runtime state fields', () => {
    const store = new RuntimeControlOverrideStore();
    store.set({ id: 'limit', reason: 'damage', assetId: 'boat', instanceId: 'boat-01', control: { maxSpeed: 5 } });
    store.clearTarget('boat', 'boat-01');
    expect(store.values()).toEqual([]);
    expect(() => store.set({ id: 'state', reason: 'invalid', assetId: 'boat', control: { throttle: 1 } as never })).toThrow('unknown runtime control key');
  });
});
