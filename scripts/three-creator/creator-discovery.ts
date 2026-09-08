import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ThreeCompiler, REPOSITORY_ROOT, publicAsset } from './compiler.js';
import { EPISODE_SCHEMA, PROJECT_SCHEMA } from './contracts.js';
import { AUTHORING_TOPICS, COMMON_OBSERVATION, guideTopic, publicContractTopic, trainingContractSource, humanoidContractSource, type AuthoringTopic } from './authoring-schema.js';
import { training } from '@worldkit/three';
import { WORLD_COMMAND_SCHEMA } from './command-schema.js';
import { RAW_EXAMPLE, sdkExample } from './examples.js';
import { readExampleFiles, type ExampleTopic } from './example-files.js';
import { mountUsage } from './mount-guidance.js';
import { readRuntimeGuidance, type RuntimeGuidance } from './runtime-guidance.js';
import { characterUsage, humanAuthoringGuidance } from './character-guidance.js';

export const SCHEMA_SECTIONS = ['guide', 'contracts', 'project', 'episode', 'observation', 'commands', 'training', 'all'] as const;
export type SchemaSection = typeof SCHEMA_SECTIONS[number];
const sectionFields = {
  guide: ['entryPoint', 'sdkGuide', 'episodeNote', 'trainingExampleTopic', 'runtimeSource', 'humanAuthoring'],
  contracts: ['sdkContracts', 'sdkFactoryContracts', 'runtimeDefinitions'], project: ['project'], episode: ['episode', 'episodeNote'],
  observation: ['observation', 'observationScope'], commands: ['worldCommandSchema', 'characterCapabilities', 'controlBindings', 'runtimeDefinitions'],
  training: ['trainingSourceContracts', 'trainingExampleTopic', 'characterCapabilities', 'controlBindings', 'runtimeDefinitions'],
} as const;

/** Read-only guidance over the compiler's frozen catalog; no browser/evidence ownership. */
export class CreatorDiscovery {
  constructor(private readonly compiler: ThreeCompiler) {}
  private get profile() { return this.compiler.profile; }
  async schema(topic: AuthoringTopic = 'getting-started') {
    if (!AUTHORING_TOPICS.includes(topic)) throw new Error('THREE_SCHEMA_TOPIC_UNKNOWN');
    const guidance=await readRuntimeGuidance(this.compiler);
    const policy = this.compiler.assetPolicy().policy;
    const isSdk = this.profile === 'three-sdk';
    const includesTraining = isSdk && ['training', 'character-actions', 'mounted-interaction', 'all'].includes(topic);
    const includesCommands = isSdk && ['control', 'extensions', 'training', 'character-actions', 'mounted-interaction', 'all'].includes(topic);
    const suggestedExample = topic === 'mounted-interaction' ? 'mounted-interaction' :
      topic === 'character-actions' ? 'character-actions' : 'independent-world';
    const trainingExampleTopic = includesTraining && await this.exampleAvailable(suggestedExample) ? suggestedExample : undefined;
    const sourceFiles = ['config.ts', 'control-tuning.ts', 'environment/types.ts', 'platform/session.ts', 'runtime.ts'];
    if (topic === 'mounted-interaction' || topic === 'all') sourceFiles.push('horse.ts');
    if (['character-actions', 'mounted-interaction', 'all'].includes(topic)) sourceFiles.push('humanoid/action-schema.ts', 'simulation.ts');
    const trainingSourceContracts = includesTraining ? Object.fromEntries(await Promise.all(
      sourceFiles.map(async name => [name, trainingContractSource(await guidance.source(`training/${name}`))]),
    )) : undefined;
    const sdk = isSdk ? {
      sdkContracts: publicContractTopic(await guidance.source('contracts.ts'), topic,{includeHostFactory:!guidance.isWorkspace}),
      sdkFactoryContracts: humanoidContractSource(await guidance.source('humanoid.ts')),
      sdkGuide: guidance.isWorkspace
        ? 'This project uses workspace SDK source. Request contracts/training sections for current declarations and runtimeDefinitions. Capability conditions and bindings must come from this source or world_inspect, not Host baseline examples. Host command transport and admission rules stay fixed.'
        : guideTopic(await readFile(path.join(REPOSITORY_ROOT, 'packages/three-world/README.md'), 'utf8'), topic)
        .replace(/<!-- asset-info:([a-zA-Z0-9._,+-]+) -->([\s\S]*?)<!-- \/asset-info -->/g,
          (_match, ids: string, body: string) => ids.split(',').every(id => policy.allowedAssetIds.includes(id)) ? body : ''),
    } : {};
    return {
      topic, availableTopics: AUTHORING_TOPICS, runtimeGuidance:guidance.provenance, humanAuthoring:humanAuthoringGuidance(policy,this.profile),
      project: PROJECT_SCHEMA, episode: EPISODE_SCHEMA, observation: COMMON_OBSERVATION,
      ...(isSdk ? {
        entryPoint: { module: '@worldkit/three', name: 'createHumanoidWorld', optionsType: 'HumanoidWorldOptions', mapType: 'TrainingMap' },
        ...(!guidance.isWorkspace&&['character-actions', 'control', 'all'].includes(topic) ? { characterCapabilities: training.CHARACTER_CAPABILITIES, controlBindings: training.INPUT_BINDINGS } : {}),
        ...(['extensions', 'all'].includes(topic) ? { runtimeSource: { tool: 'creator_materialize_runtime', sourceRoot: 'sdk', buildTool: 'world_validate', entry: 'sdk/three-world/src/index.ts' } } : {}),
      } : {}),
      observationScope: 'Shared minimal same-scene observer. SDK telemetry and commands are only available in the SDK profile.',
      ...sdk,
      ...(includesCommands ? { worldCommandSchema: WORLD_COMMAND_SCHEMA } : {}),
      ...(guidance.isWorkspace?{runtimeDefinitions:await guidance.definitions(includesTraining||includesCommands)}:{}),
      ...(trainingSourceContracts ? { trainingSourceContracts } : {}),
      ...(trainingExampleTopic ? { trainingExampleTopic } : {}),
      episodeNote: 'Keys persist until keysUp; repeated keysDown generate trusted browser repeat. v2 episode can execute commands and explicit start/pause/reset. Command receipts and state are recorded separately from actual keyboard inputs. Active-play time excludes paused/reset time. A complete nonempty episode can be submitted regardless of its length. Fixed XYZ targets measure proximity, never steer or teleport.',
    };
  }

  private exampleRoot(topic: ExampleTopic) {
    const folder = topic === 'custom-vehicle' ? 'custom-vehicle' : topic === 'mounted-interaction' ? 'horse-riding' :
      topic === 'character-actions' ? 'character-actions' :
      topic === 'independent-world' ? 'training-independent' : 'sdk-capabilities';
    return path.join(REPOSITORY_ROOT, 'examples/three-creator', folder);
  }

  private async missingExampleAssets(topic: ExampleTopic) {
    const project = JSON.parse(await readFile(path.join(this.exampleRoot(topic), 'project.json'), 'utf8')) as { assetIds: string[] };
    const allowed = this.compiler.assetPolicy().policy.allowedAssetIds;
    return project.assetIds.filter(id => !allowed.includes(id));
  }

  private async exampleAvailable(topic: ExampleTopic) {
    return (await this.missingExampleAssets(topic)).length === 0;
  }

  async examples(topic: ExampleTopic = 'getting-started', selectedFiles?: readonly string[]) {
    const guidance=await readRuntimeGuidance(this.compiler);
    const authority={exampleAuthority:'host-baseline',runtimeGuidance:guidance.provenance};
    if (topic !== 'getting-started') {
      if (this.profile !== 'three-sdk') throw new Error('THREE_SDK_EXAMPLE_UNSUPPORTED');
      const missing = await this.missingExampleAssets(topic);
      if (missing.length) throw new Error(`THREE_EXAMPLE_ASSETS_UNAVAILABLE: ${topic}: ${missing.join(', ')}`);
      return {
        ...authority, profile: this.profile, topic,
        ...await readExampleFiles(this.exampleRoot(topic), topic, selectedFiles),
        sdkExample: (guidance.isWorkspace?'Host baseline example; verify compatibility with the workspace SDK before reuse. ':'')+'Whitebox training runtime: one SDK clock, supplied humanoid and reusable vehicle families. Compilation is not behavioral acceptance.',
      };
    }
    const isSdk = this.profile === 'three-sdk';
    const defaultHumanoid = this.compiler.assetPolicy().policy.defaultHumanoidAssetId;
    return {
      ...authority, profile: this.profile,
      files: {
        'main.ts': isSdk ? sdkExample(defaultHumanoid) : RAW_EXAMPLE,
        'index.html': '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script type="module" src="./main.ts"></script></body></html>',
        'project.json': JSON.stringify({ schemaVersion: 1, assetIds: isSdk ? [defaultHumanoid] : [] }),
        'episode.json': JSON.stringify({ schemaVersion: 1, steps: [
          { keysDown: ['w'], durationSeconds: 2 },
          { keysDown: ['Shift'], durationSeconds: 2 },
          { keysUp: ['w', 'Shift'], durationSeconds: 1 },
          { keysDown: ['ArrowLeft'], durationSeconds: 1 },
          { keysUp: ['ArrowLeft'], keysDown: ['Space'], durationSeconds: 0.2 },
          { keysUp: ['Space'], durationSeconds: 1 },
        ], targets: [] }, null, 2),
      },
      sdkExample: guidance.isWorkspace?'Host baseline example; adapt it to the current workspace SDK declarations before use.':isSdk
        ? 'Read the exported contracts and the installed SDK example before using createHumanoidWorld. Use setCaptureTargets and await world.start() to install the common observer after preparation. The main script owns ordinary Three scene geometry and camera composition.'
        : 'Use normal Three scene, camera and renderer. Your loop and keyboard handlers remain yours. Expose a ready observer with scene/camera/renderer/player/targets and startLive/stopLive/reset. The Host does not provide a movement or physics implementation to the raw baseline.',
    };
  }

  private assetGuidanceRows(workspaceRuntime=false) {
    const allowed = this.compiler.allowedAssets();
    const ids = allowed.map(asset => asset.id);
    return allowed.map(asset => ({
      asset,
      usage: characterUsage(asset, this.profile, ids,workspaceRuntime),
      mount: mountUsage(asset, this.profile, ids,workspaceRuntime),
    }));
  }

  async assets(query = '', assetId?: string) {
    return this.assetResults(query,assetId,await readRuntimeGuidance(this.compiler));
  }
  private assetResults(query:string,assetId:string|undefined,guidance:RuntimeGuidance) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = this.assetGuidanceRows(guidance.isWorkspace).map(row => ({ ...row, asset: publicAsset(row.asset) }));
    // Preserve full-response service consumers, including their existing metadata search.
    const selected = rows.filter(({ asset, usage, mount }) => {
      if (assetId && asset.id !== assetId) return false;
      const searchable = JSON.stringify({ asset, useWhen: usage?.useWhen, skills: usage?.skillRequests,
        bindings: usage?.controlBindings, hints: usage?.controlHints, capabilities: usage?.capabilities, mount }).toLowerCase();
      return words.every(word => searchable.includes(word));
    });
    return {
      schemaVersion: 1, runtimeGuidance:guidance.provenance,
      humanAuthoring:humanAuthoringGuidance(this.compiler.assetPolicy().policy,this.profile),
      assets: selected.map(row => row.asset),
      mountUsage: selected.flatMap(row => row.mount ? [row.mount] : []),
      characterUsage: selected.flatMap(row => row.usage ? [row.usage] : []),
    };
  }

  async selectedSchema(topic: AuthoringTopic = 'getting-started', sections: readonly SchemaSection[] = ['guide']) {
    const full = await this.schema(topic);
    const source: Record<string, unknown> = full;
    const availableSections = Object.entries(sectionFields)
      .filter(([, fields]) => fields.some(field => source[field] !== undefined))
      .map(([section]) => section);
    const selected = sections.includes('all') ? source : Object.fromEntries(
      sections.flatMap(section => section === 'all' ? [] : sectionFields[section])
        .filter(field => source[field] !== undefined).map(field => [field, source[field]]),
    );
    return { topic, availableTopics: AUTHORING_TOPICS, availableSections, runtimeGuidance:full.runtimeGuidance, ...selected,
      readHint: 'Request sections for only the contracts you need; sections:["all"] returns the complete topic. Read creator_get_examples for runnable source.',
    };
  }

  async describeAsset(assetId: string) {
    const guidance=await readRuntimeGuidance(this.compiler);
    const result = this.assetResults('', assetId,guidance);
    if (!result.assets.length) throw new Error(`THREE_ASSET_UNAVAILABLE: ${assetId}`);
    return {...result,...(guidance.isWorkspace?{runtimeDefinitions:await guidance.definitions()}:{}),runtimeGuidance:guidance.provenance};
  }

  async searchAssets(query = '', limit = 5, offset = 0) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20 || !Number.isInteger(offset) || offset < 0) {
      throw new Error('THREE_ASSET_SEARCH_RANGE_INVALID');
    }
    const guidance=await readRuntimeGuidance(this.compiler);
    const normalized = query.normalize('NFKC').toLowerCase().trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    const ranked = this.assetGuidanceRows().map(({ asset, usage, mount }) => {
      const identity = `${asset.id} ${asset.displayName}`.normalize('NFKC').toLowerCase();
      // Search meanings and controls, not filenames, provenance hashes or bundled resource bytes.
      const semantics = JSON.stringify({ actions: Object.entries(asset.actions ?? {}).map(([id, value]) => ({ id, clipName: (value as { clipName?: string }).clipName })),
        runtimeActions: (asset.runtimeActions ?? []).map((action: { id: string }) => action.id),
        vehicle: { mode: asset.training?.spec?.mode, hint: asset.training?.spec?.hint,
          locomotionBindingIds: asset.locomotionBindingIds },
        useWhen: usage?.useWhen, skills: usage?.skillRequests, bindings: usage?.controlBindings,
        hints: usage?.controlHints, capabilities: usage?.capabilities, mount }).normalize('NFKC').toLowerCase();
      const matches = words.every(word => identity.includes(word) || semantics.includes(word));
      const score = asset.id.toLowerCase() === normalized ? 1000 :
        words.reduce((sum, word) => sum + (identity.includes(word) ? 10 : 1), 0);
      return { asset, usage, mount, matches, score };
    }).filter(row => row.matches).sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id));
    const selected = ranked.slice(offset, offset + limit).map(row=>({...row,usage:characterUsage(row.asset,this.profile,[],guidance.isWorkspace),mount:mountUsage(row.asset,this.profile,this.compiler.assetPolicy().policy.allowedAssetIds,guidance.isWorkspace)}));
    return {
      schemaVersion: 1, runtimeGuidance:guidance.provenance, format: 'summary', query, total: ranked.length, offset, limit,
      nextOffset: offset + selected.length < ranked.length ? offset + selected.length : null,
      assets: selected.map(({ asset, usage, mount }) => ({
        id: asset.id, displayName: asset.displayName,
        ...(usage?.useWhen || mount?.useWhen || asset.training?.spec?.hint
          ? { useWhen: usage?.useWhen ?? mount?.useWhen ?? asset.training.spec.hint } : {}),
        details: { tool: 'assets_describe', arguments: { assetId: asset.id } },
      })),
      characterUsage: selected.flatMap(({ usage }) => usage ? [{ assetId: usage.assetId,
        integration: usage.integration, clipCount: usage.clipCount, useWhen: usage.useWhen,runtimeAuthority:usage.runtimeAuthority,
        ...(usage.schemaTopic ? { schemaTopic: usage.schemaTopic } : {}),
        ...(usage.exampleTopic ? { exampleTopic: usage.exampleTopic } : {}),
      }] : []),
      mountUsage: selected.flatMap(({ mount }) => mount ? [mount] : []),
      searchAuthority:'host-catalog-index',
      readHint: 'Search uses catalog and Host baseline terms, not proof of current workspace capabilities. These are search summaries. Call assets_describe with the selected assetId for resources, animation mappings and integration conditions.',
    };
  }
}
