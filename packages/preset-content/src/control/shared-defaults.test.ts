import { describe, expect, it } from 'vitest';
import { SPECS } from '../config';
import { getDefaultControlProfile } from './profiles';
import { getSharedControlDefaults } from './shared-defaults';

describe('shared control defaults', () => {
  it('owns the resolved static handling values for powered boats without owning their hull specifications', () => {
    for (const assetId of ['boat', 'patrol-boat', 'jetski', 'canoe', 'kayak', 'raft', 'submarine', 'observation-submarine', 'atv', 'unicycle', 'ski', 'sled', 'tank', 'bus', 'rover', 'racer', 'trail-rover', 'supercar', 'kart', 'motorcycle', 'touring-motorcycle', 'skateboard', 'hovercraft', 'rescue-hovercraft', 'plane', 'trainer-plane', 'pusher-plane', 'helicopter', 'multirotor', 'tiltrotor', 'glider', 'paraglider', 'wingsuit', 'balloon', 'spacecraft', 'survey-spacecraft', 'horse', 'carriage', 'dragon']) {
      const control = getSharedControlDefaults(assetId)!;
      const spec = SPECS.find(candidate => candidate.id === assetId)!;
      expect(spec).toMatchObject(control);
      expect(spec.envelope).toBeDefined();
      expect(spec.seat).toBeDefined();
    }
  });

  it('returns independent mutable settings to vehicle setup', () => {
    const first = getSharedControlDefaults('boat')!;
    first.speed = 1;
    expect(getSharedControlDefaults('boat')!.speed).toBe(24);
  });

  it('keeps the asset-to-profile reference explicit without making the SDK resolve content data', () => {
    for (const spec of SPECS) {
      expect(spec.controlProfileId).toBe(`preset.${spec.id}`);
      expect(getDefaultControlProfile(spec.id)!.profileId).toBe(spec.controlProfileId);
    }
  });
});
