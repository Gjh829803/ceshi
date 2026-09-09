interface PresetImportSpec {
  id: string;
  seat: readonly [number, number, number];
}

interface CuratedPresetMetadata {
  limitations?: readonly string[];
  integrationMetadata?: Record<string, unknown>;
}

/** Import mechanics own resource/socket declarations; the catalog owns usage guidance. */
export function presetImportDetails(spec: PresetImportSpec, previous?: CuratedPresetMetadata) {
  const importedCreature = spec.id === 'horse' || spec.id === 'dragon';
  const model = spec.id === 'dragon' ? 'dragon' : spec.id === 'horse' || spec.id === 'carriage' ? 'horse' : undefined;
  const dependencyPaths = model ? [
    `creatures/${model}.glb`,
    // The shared provenance manifest describes both source packs; retain its notices.
    'creatures/manifest.json',
    'creatures/LICENSE-ANIMALS.txt',
    'creatures/LICENSE-MONSTERS.txt',
  ] : [];
  return {
    dependencyPaths,
    // Only the procedural export branch creates and names this node. Raw
    // horse/dragon GLBs use vehicle.spec.seat, not an invented GLB socket.
    sockets: importedCreature ? [] : [{ id: 'driver', node: 'seat.driver', positionMetersXYZ: [...spec.seat] }],
    limitations: [...(previous?.limitations ?? [])],
    ...(previous?.integrationMetadata ? { integrationMetadata: structuredClone(previous.integrationMetadata) } : {}),
  };
}
