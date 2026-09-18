import type {humanoid} from '@worldkit/three';
export interface ContentFacts {asset_version: string; parameters: Record<string, unknown>}
export interface RuntimeAssetContext {
  runtime_id: string; runtime_version: string; adapter_id: string; adapter_version: string;
  preset_digest: string; overrides_digest: string; supported_contracts: {contract_id: string; version: string}[];
}
export type ComposedCatalogEntry<T extends {id: string}> = T extends {vehicle: infer Vehicle}
  ? Omit<T, 'contentVersion' | 'vehicle'> & {id: T['id']; vehicle: Omit<Vehicle, 'spec'> & {spec: humanoid.VehicleSpec}}
  : Omit<T, 'contentVersion' | 'vehicle'> & {id: T['id']; vehicle?: {schemaVersion: 1; spec: humanoid.VehicleSpec}};
export interface ContentAdapter {
  composeContentSpec(assetId: string, facts: ContentFacts): Record<string, unknown>;
  composeAssetCatalog<T extends {id: string}>(entries: T[]): ComposedCatalogEntry<T>[];
  runtimeAssetContext(assetIds: string[]): RuntimeAssetContext;
}
export interface EngineConfiguration {
  presets: Record<string, {parameters: Record<string, unknown>; camera: Record<string, unknown>}>;
  integrations: Record<string, unknown>;
}
export interface PresetAuthoringContext {
  selection: Record<string, unknown>;
  composeContentSpec: ContentAdapter['composeContentSpec'];
  cameraPresets: Record<string, Record<string, unknown>>;
}
export function createContentAdapter(configuration: EngineConfiguration): ContentAdapter;
export function composeContentSpec(assetId: string, facts: ContentFacts): Record<string, unknown>;
export function composeAssetCatalog<T extends {id: string}>(entries: T[]): ComposedCatalogEntry<T>[];
export function runtimeAssetContext(assetIds: string[]): RuntimeAssetContext;
export function presetAuthoringContext(configuration?: EngineConfiguration, selection?: Record<string, unknown>): PresetAuthoringContext;
