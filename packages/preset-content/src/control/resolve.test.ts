import { describe, expect, it } from 'vitest';
import { getDefaultControlProfile, parseControlProfile } from './profiles';
import { resolveControlProfile } from './resolve';

describe('control profile resolution', () => {
  it('keeps collision envelopes out of the saved control form', () => {
    const boat = getDefaultControlProfile('boat')!;
    expect(boat).not.toHaveProperty('envelope');
    expect(() => parseControlProfile({ ...boat, envelope: { kind: 'box' } })).toThrow('unknown control profile field');
  });

  it('resolves shared, project, instance and debug layers with field provenance', () => {
    const shared = getDefaultControlProfile('plane')!;
    const projectAsset = structuredClone(shared);
    projectAsset.control.maxSpeed = 30;
    const projectInstance = { ...structuredClone(shared), instanceId: 'plane-01' };
    projectInstance.control.maxSpeed = 27;
    const debugInstance = { ...structuredClone(projectInstance) };
    debugInstance.control.maxSpeed = 22;
    const resolved = resolveControlProfile({ shared, projectAsset, projectInstance, debugInstance });

    expect(resolved.profile).toMatchObject({ assetId: 'plane', instanceId: 'plane-01' });
    expect(resolved.profile.control.maxSpeed).toBe(22);
    expect(resolved.sources['control.maxSpeed']).toBe('debug-instance');
    expect(resolved.sources['aircraftFlight.pitchGain']).toBe('debug-instance');
  });
});
