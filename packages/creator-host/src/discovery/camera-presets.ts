import { createHash } from 'node:crypto';
import presets from '@worldkit/preset-content/cameras/presets.json';
import variants from '@worldkit/preset-content/cameras/dragon-variants.json';
import type { CameraPreset } from '@worldkit/three';

type PresetReference = {
  presetId: string;
  source: 'presets' | 'dragon-variants';
  key: string;
  viewId: CameraPreset['kind'];
};
type SnapshotSource = { module: string; key: string; sha256: string };

function isReference(value: unknown): value is PresetReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const reference = value as Record<string, unknown>;
  return typeof reference.presetId === 'string' && reference.presetId.length > 0
    && typeof reference.key === 'string' && reference.key.length > 0
    && typeof reference.viewId === 'string' && ['third-person', 'first-person', 'shoulder'].includes(reference.viewId)
    && typeof reference.source === 'string' && ['presets', 'dragon-variants'].includes(reference.source);
}

function ownEntry(collection: unknown, key: string): unknown {
  if (!collection || typeof collection !== 'object' || !Object.hasOwn(collection, key)) return;
  return (collection as Record<string, unknown>)[key];
}

/** Selected content data, never a runtime configuration or an implicit application. */
export function cameraPresetSnapshots(references: unknown, workspaceRuntime: boolean) {
  const unavailable = (reason: string) => ({ status: 'unavailable' as const, reason });
  if (!Array.isArray(references) || !references.length) return unavailable('no-registered-camera-presets');
  const snapshots = new Map<string, CameraPreset>();
  const sources = new Map<string, SnapshotSource>();
  for (const reference of references) {
    if (!isReference(reference) || snapshots.has(reference.presetId)) {
      return unavailable('invalid-camera-preset-reference');
    }
    const collection = reference.source === 'presets' ? presets : variants;
    const entry = ownEntry(collection, reference.key);
    const selected = reference.source === 'presets' ? entry : ownEntry(entry, reference.viewId);
    if (!selected || typeof selected !== 'object' || (selected as CameraPreset).kind !== reference.viewId) {
      return unavailable('missing-or-incompatible-camera-preset');
    }
    snapshots.set(reference.presetId, structuredClone(selected as CameraPreset));
    sources.set(reference.presetId, {
      module: `@worldkit/preset-content/cameras/${reference.source}.json`,
      key: reference.key,
      sha256: createHash('sha256').update(JSON.stringify(selected)).digest('hex'),
    });
  }
  return {
    status: 'available' as const,
    compatibility: workspaceRuntime ? 'unverified-workspace-runtime' : 'content-calibration',
    presets: Object.fromEntries(snapshots),
    sources: Object.fromEntries(sources),
    binding: 'Embed these snapshots in CameraDocument.presets and reference their preset IDs from the intended binding.subjectOverrides views. They are content calibration, not the current camera state; resolve and inspect the actual subject with the selected SDK.',
  };
}
