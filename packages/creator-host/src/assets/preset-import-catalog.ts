/** Translate names from the pinned donor at the import boundary, not runtime aliases. */
export function presetImportIdentity(sourceId: string) {
  const names: Readonly<Record<string,string>> = {
    bike:'motorcycle', 'touring-bike':'touring-motorcycle', slide:'skateboard',
    sub:'submarine', 'observation-sub':'observation-submarine',
    space:'spacecraft', 'survey-space':'survey-spacecraft',
    hover:'hovercraft', 'rescue-hover':'rescue-hovercraft', dragon:'dragon-evolved',
  };
  const specId=names[sourceId]??sourceId;
  return {assetId:`${sourceId==='horse'||sourceId==='dragon'?'creature':'vehicle'}.${specId}`,specId};
}

interface PresetImportSpec {
  id: string;
  seat: readonly [number, number, number];
}

interface CuratedPresetMetadata {
  limitations?: readonly string[];
  recommendedFor?: readonly string[];
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
    ...(previous?.recommendedFor ? {recommendedFor:[...previous.recommendedFor]} : {}),
    ...(previous?.integrationMetadata ? { integrationMetadata: structuredClone(previous.integrationMetadata) } : {}),
  };
}
