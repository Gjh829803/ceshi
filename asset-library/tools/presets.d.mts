export interface PresetAuthoringContext {
  selection: Record<string, unknown>;
  composeContentSpec(assetId: string, facts: {asset_version: string; parameters: Record<string, unknown>}): Record<string, unknown>;
  cameraPresets: Record<string, Record<string, unknown>>;
}
export function buildPresetContent(libraryRoot: string, authoring: PresetAuthoringContext): Record<string, unknown>;
export function syncContentOwnership(libraryRoot: string, packageRoot: string, check?: boolean): string;
export function syncPresetContent(libraryRoot: string, packageRoot: string, check: boolean | undefined, authoring: PresetAuthoringContext): {checked: boolean; files: string[]};
