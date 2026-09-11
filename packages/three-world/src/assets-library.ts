import type { AssetInstance, Assets, CharacterBody } from './contracts.js';
import type { AssetDefinition, AssetInstance as EngineAssetInstance } from './engine-contracts.js';
import { cloneAsset, loadAsset, validateAssetDefinition } from './assets.js';
import type {ModelLoadOptions} from './contracts.js';

type AssetSearchResult = ReturnType<Assets['search']>[number];
type Entry = { definition: AssetDefinition; raw: EngineAssetInstance; managed: EngineAssetInstance };

function bodyOf(definition: AssetDefinition): CharacterBody | null {
  const body = definition.recommendedBody;
  if (body === undefined || body === null) return null;
  if (!Number.isFinite(body.heightMeters) || !Number.isFinite(body.radiusMeters) ||
      body.radiusMeters <= 0 || body.heightMeters < body.radiusMeters * 2) {
    throw new Error(`ASSET_RECOMMENDED_BODY_INVALID: ${definition.id}`);
  }
  return Object.freeze({ heightMeters: body.heightMeters, radiusMeters: body.radiusMeters });
}

/** Per-World asset ownership; public handles deliberately omit animation and disposal engines. */
export class WorldAssets implements Assets {
  private readonly definitions = new Map<string, AssetDefinition>();
  private readonly descriptions: readonly AssetSearchResult[];
  private readonly entries = new Map<AssetInstance, Entry>();
  private readonly released = new WeakSet<AssetInstance>();
  private readonly baseUri: string | undefined;
  private disposed = false;

  constructor(options: { definitions: Record<string, AssetDefinition>; baseUri?: string }) {
    this.baseUri = options.baseUri;
    const descriptions: AssetSearchResult[] = [];
    for (const [id, source] of Object.entries(options.definitions)) {
      if (!source || source.id !== id) throw new Error(`ASSET_CATALOG_ID_INVALID: ${id}`);
      const definition = structuredClone(source);
      validateAssetDefinition(definition);
      const recommendedBody = bodyOf(definition);
      const bindings = definition.locomotionBindingIds ?? [];
      if (!Array.isArray(bindings) || new Set(bindings).size !== bindings.length || bindings.some(value => typeof value !== 'string' || !value.trim())) {
        throw new Error(`ASSET_LOCOMOTION_BINDING_INVALID: ${id}`);
      }
      if (bindings.includes('ground.standard') && ['idle', 'walk', 'run', 'jump'].some(actionId => !Object.hasOwn(definition.actions, actionId))) {
        throw new Error(`ASSET_LOCOMOTION_ACTION_MISSING: ${id}`);
      }
      this.definitions.set(id, definition);
      descriptions.push(Object.freeze({
        assetId: id, name: definition.displayName,
        description: [definition.displayName, ...definition.limitations].join(' '),
        limitations: Object.freeze([...definition.limitations]),
        actionIds: Object.freeze(Object.keys(definition.actions)), recommendedBody,
        locomotionBindingIds: Object.freeze([...bindings]),
      }));
    }
    this.descriptions = Object.freeze(descriptions);
  }

  search(query: string): readonly AssetSearchResult[] {
    this.alive();
    if (typeof query !== 'string') throw new Error('ASSET_SEARCH_QUERY_INVALID');
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return Object.freeze(this.descriptions.filter(row => {
      // Negative limitations such as "not a fox" must not recommend that asset for foxes.
      const searchable = [row.assetId, row.name, ...row.actionIds, ...row.locomotionBindingIds].join(' ').toLocaleLowerCase();
      return terms.every(term => searchable.includes(term));
    }));
  }

  async load(assetId: string, options:ModelLoadOptions={}): Promise<AssetInstance> {
    this.alive();
    const definition = this.definitions.get(assetId);
    if (!definition) throw new Error(`ASSET_NOT_FOUND: ${assetId}`);
    const raw = await loadAsset(definition, {...options,...(this.baseUri === undefined ? {} : { baseUri: this.baseUri })});
    return this.adoptOrRelease(raw, definition);
  }

  async clone(instance: AssetInstance): Promise<AssetInstance> {
    this.alive();
    const source = this.entry(instance);
    const raw = cloneAsset(source.raw);
    // Keep the same async lifecycle boundary as load; dispose during preparation
    // cannot publish a new owned instance afterwards.
    await Promise.resolve();
    return this.adoptOrRelease(raw, source.definition);
  }

  internal(instance: AssetInstance): EngineAssetInstance { this.alive(); return this.entry(instance).managed; }
  owns(instance: AssetInstance): boolean { return this.entries.has(instance); }

  release(instance: AssetInstance): void {
    const entry = this.entries.get(instance);
    if (entry) entry.managed.dispose();
    else if (!this.released.has(instance)) throw new Error('ASSET_INSTANCE_UNOWNED');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    let firstError: unknown;
    for (const entry of [...this.entries.values()]) {
      try { entry.managed.dispose(); } catch (error) { firstError ??= error; }
    }
    if (firstError) throw firstError;
  }

  private alive(): void { if (this.disposed) throw new Error('ASSET_LIBRARY_DISPOSED'); }
  private entry(instance: AssetInstance): Entry {
    const entry = this.entries.get(instance);
    if (!entry) throw new Error(this.released.has(instance) ? 'ASSET_INSTANCE_RELEASED' : 'ASSET_INSTANCE_UNOWNED');
    return entry;
  }

  private adoptOrRelease(raw: EngineAssetInstance, definition: AssetDefinition): AssetInstance {
    try {
      this.alive();
      if (raw.actionIds.includes('idle')) raw.play('idle');
      raw.update(0); raw.object.updateMatrixWorld(true);
      const instance: AssetInstance = Object.freeze({
        object: raw.object, assetId: definition.id,
        actionIds: Object.freeze([...raw.actionIds]), recommendedBody: bodyOf(definition),
      });
      let released = false;
      const managed: EngineAssetInstance = {
        object: raw.object, clips: raw.clips, mixer: raw.mixer, actionIds: raw.actionIds,
        get currentActionId() { return raw.currentActionId; },
        get currentClipName() { return raw.currentClipName; },
        get isActionComplete() { return raw.isActionComplete; },
        get timeSeconds() { return raw.timeSeconds; },
        play: raw.play.bind(raw), update: raw.update.bind(raw),
        dispose: () => {
          if (released) return;
          released = true; this.entries.delete(instance); this.released.add(instance);
          raw.dispose();
        },
      };
      this.entries.set(instance, { definition, raw, managed });
      return instance;
    } catch (error) {
      try { raw.dispose(); } catch { /* Preserve preparation failure. */ }
      throw error;
    }
  }
}
