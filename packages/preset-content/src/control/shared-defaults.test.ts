import { describe, expect, it } from 'vitest';
import { SPECS } from '../config';
import { CREATURE_SPECS } from '../creatures/specs';
import { ATV_SPEC } from '../vehicles/atv/spec';
import { BUS_SPEC } from '../vehicles/bus/spec';
import { CANOE_SPEC } from '../vehicles/canoe/spec';
import { JETSKI_SPEC } from '../vehicles/jetski/spec';
import { KAYAK_SPEC } from '../vehicles/kayak/spec';
import { RAFT_SPEC } from '../vehicles/raft/spec';
import { SKI_SPEC } from '../vehicles/ski/spec';
import { SLED_SPEC } from '../vehicles/sled/spec';
import { SUBMERSIBLE_SPEC } from '../vehicles/submersible/spec';
import { TANK_SPEC } from '../vehicles/tank/spec';
import { UNICYCLE_SPEC } from '../vehicles/unicycle/spec';
import { getDefaultControlProfile } from './profiles';
import { getSharedControlDefaults } from './shared-defaults';

const DIRECT_ENTRY_SPECS = [
  ATV_SPEC, BUS_SPEC, CANOE_SPEC, JETSKI_SPEC, KAYAK_SPEC, RAFT_SPEC,
  SKI_SPEC, SLED_SPEC, SUBMERSIBLE_SPEC, TANK_SPEC, UNICYCLE_SPEC,
  ...CREATURE_SPECS,
];

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

  it('declares the profile reference in every direct public spec entry', () => {
    for (const spec of DIRECT_ENTRY_SPECS) {
      expect(spec.controlProfileId).toBe(`preset.${spec.id}`);
    }
  });
});
