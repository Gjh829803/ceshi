import {cameraPresetSnapshots} from './camera-presets.js';
import {bindingExample,type BindingVariant} from './binding-examples.js';
import {agentDocument,AGENT_READING_GUIDE,readAgentDocument,AGENT_DOCUMENT_PATHS,documentNavigation,topicDocument,type AgentDocumentPath} from './agent-docs.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ThreeCompiler, REPOSITORY_ROOT, publicAsset } from '../compiler/compiler.js';
import { EPISODE_SCHEMA, PROJECT_SCHEMA } from '../contracts.js';
import { AUTHORING_TOPICS, COMMON_OBSERVATION, guideTopic, publicContractTopic, runtimeContractSource, humanoidFactoryContractSource, type AuthoringTopic } from './authoring-schema.js';
import { humanoid } from '@worldkit/three';
import { WORLD_COMMAND_SCHEMA } from '../schema/command-schema.js';
import { RAW_EXAMPLE, sdkExample } from './examples.js';
import { EXAMPLE_REGISTRY, EXAMPLE_TOPICS, readExampleFiles, type ExampleTopic } from './example-files.js';
import { mountUsage } from './mount-guidance.js';
import { readRuntimeGuidance, type RuntimeGuidance } from './runtime-guidance.js';
import {subjectAuthoringGuidance} from './subject-guidance.js';
import { characterUsage, humanAuthoringGuidance } from './character-guidance.js';
import {cameraConfiguration,CAMERA_CONTRACT_FILES} from './camera-configuration.js';
import {cameraAuthoringGuidance} from './camera-guidance.js';
import {qualityAuthoringGuidance} from './quality-guidance.js';

export const SCHEMA_SECTIONS = ['guide', 'contracts', 'project', 'episode', 'observation', 'commands', 'humanoid', 'all'] as const;
export type SchemaSection = typeof SCHEMA_SECTIONS[number];
const sectionFields = {
  guide: ['navigation','assetIndex','readingGuide','entryPoint', 'sdkGuide', 'cameraAuthoring', 'qualityAuthoring', 'episodeNote', 'humanoidExampleTopic', 'runtimeSource', 'humanAuthoring', 'subjectAuthoring', 'exampleTopic'],
  contracts: ['cameraConfiguration','cameraSourceContracts','sdkContracts', 'sdkFactoryContracts', 'runtimeDefinitions', 'boundaryContracts', 'objectColorContracts'], project: ['project'], episode: ['episode', 'episodeNote'],
  observation: ['observation', 'observationScope'], commands: ['worldCommandSchema', 'cameraAuthoring', 'characterCapabilities', 'controlBindings', 'humanoidInputGuides', 'runtimeDefinitions'],
  humanoid: ['aircraftConfigurations', 'roadVehicleConfigurations', 'humanoidSourceContracts', 'humanoidExampleTopic', 'cameraAuthoring', 'characterCapabilities', 'controlBindings', 'humanoidInputGuides', 'runtimeDefinitions','objectColorContracts'],
} as const;

/** Read-only guidance over the compiler's frozen catalog; no browser/evidence ownership. */
export class CreatorDiscovery {
  constructor(private readonly compiler: ThreeCompiler) {}
  private get profile() { return this.compiler.profile; }
  async schema(topic: AuthoringTopic = 'getting-started', requestedFields?: ReadonlySet<string>) {
    const wants = (field: string) => !requestedFields || requestedFields.has(field);
    if (!AUTHORING_TOPICS.includes(topic)) throw new Error('THREE_SCHEMA_TOPIC_UNKNOWN');
    const guidance=await readRuntimeGuidance(this.compiler);
    const policy = this.compiler.assetPolicy().policy;
    const isSdk = this.profile === 'three-sdk';
    const nonhuman=topic==='nonhuman-subject';
    const cameraAuthoring=cameraAuthoringGuidance(this.profile,guidance.isWorkspace,nonhuman?'nonhuman':'humanoid');
    const humanoidTopic=['humanoid','character-actions','mounted-interaction'].includes(topic);
    const includesHumanoid = isSdk && ['humanoid', 'character-actions', 'mounted-interaction', 'all'].includes(topic);
    const includesCommands = isSdk && ['control', 'extensions', 'humanoid', 'character-actions', 'mounted-interaction', 'all'].includes(topic);
    const suggestedExample = topic === 'mounted-interaction' ? 'mounted-interaction' :
      topic === 'character-actions' ? 'character-actions' : 'getting-started';
    const humanoidExampleTopic = includesHumanoid && await this.exampleAvailable(suggestedExample) ? suggestedExample : undefined;
    const sourceFiles = ['humanoid-runtime/config.ts', 'config/control.ts', 'config/camera/types.ts', 'config/input.ts', 'humanoid-runtime/environment/types.ts', 'humanoid-runtime/runtime.ts'];
    if (topic === 'mounted-interaction' || topic === 'all') sourceFiles.push('humanoid-runtime/horse.ts');
    if (['humanoid','mounted-interaction','all'].includes(topic)) sourceFiles.push('humanoid-runtime/aircraft-spec.ts','humanoid-runtime/vehicle-inspection.ts','humanoid-runtime/solver-sample.ts','humanoid-runtime/road-vehicle.ts','humanoid-runtime/motion-families/ground-vehicle/wheel-physics.ts','humanoid-runtime/powertrain.ts','humanoid-runtime/vehicle-animation.ts');
    if (['character-actions', 'mounted-interaction', 'all'].includes(topic)) sourceFiles.push('humanoid-runtime/humanoid/action-schema.ts', 'humanoid-runtime/simulation.ts');
    const humanoidSourceContracts = includesHumanoid && wants('humanoidSourceContracts') ? Object.fromEntries(await Promise.all(
      sourceFiles.filter(name=>guidance.shouldDescribeSource(name)).map(async name => [name, runtimeContractSource(await guidance.source(name))]),
    )) : undefined;
    const sdk:{sdkContracts?:string;sdkFactoryContracts?:string;sdkGuide?:string} = isSdk ? {
      ...(wants('sdkContracts') ? {sdkContracts: publicContractTopic(await guidance.source('contracts.ts'), topic,{includeHostFactory:!guidance.isWorkspace})} : {}),
      ...(!nonhuman&&wants('sdkFactoryContracts')?{sdkFactoryContracts: humanoidFactoryContractSource(await guidance.source('humanoid.ts'))}:{}),
      ...(topic!=='quality'&&wants('sdkGuide') ? {sdkGuide: ['getting-started','programming','assets'].includes(topic)?agentDocument(topic as 'getting-started'|'programming'|'assets'):guidance.isWorkspace
        ? 'This project uses workspace SDK source. Request contracts/humanoid sections for current declarations and runtimeDefinitions. Capability conditions and bindings must come from this source or world_inspect, not Host baseline examples. Host command transport and admission rules stay fixed.'
        : guideTopic(await readFile(path.join(REPOSITORY_ROOT, 'packages/three-world/README.md'), 'utf8'), topic)
        .replace(/<!-- asset-info:([a-zA-Z0-9._,+-]+) -->([\s\S]*?)<!-- \/asset-info -->/g,
          (_match, ids: string, body: string) => ids.split(',').every(id => policy.allowedAssetIds.includes(id)) ? body : '')} : {}),
    } : (['getting-started','programming','assets'].includes(topic)&&wants('sdkGuide')?{sdkGuide:agentDocument(topic as 'getting-started'|'programming'|'assets')} : {});
    const result = {
      topic, availableTopics: AUTHORING_TOPICS, runtimeGuidance:guidance.provenance,
      ...(topicDocument(topic)?{navigation:documentNavigation(topicDocument(topic)!)}:{}),
      ...(['getting-started','all'].includes(topic)?{readingGuide:AGENT_READING_GUIDE}:{}),
      ...(cameraAuthoring?{cameraAuthoring}:{}),
      ...(!nonhuman?{humanAuthoring:humanAuthoringGuidance(policy,this.profile)}:{}),
      ...(['getting-started','all'].includes(topic)?{subjectAuthoring:subjectAuthoringGuidance(this.profile)}:{}),
      ...(['getting-started','quality','all'].includes(topic)?{qualityAuthoring:qualityAuthoringGuidance(topic!=='getting-started')}:{}),
      ...(nonhuman&&isSdk?{exampleTopic:'nonhuman-subject'}:{}),
      ...(topic==='assets'?{assetIndex:this.compiler.allowedAssets().map(asset=>({id:asset.id,name:asset.displayName,details:{tool:'assets_describe',arguments:{assetId:asset.id}}}))}:{}),
      project: PROJECT_SCHEMA, episode: EPISODE_SCHEMA, observation: COMMON_OBSERVATION,
      ...(isSdk ? {
        entryPoint: humanoidTopic
          ? { module: '@worldkit/three', name: 'createHumanoidWorld', optionsType: 'HumanoidWorldOptions', mapType: 'EnvironmentDefinition' }
          : { module: '@worldkit/three', name: 'createWorld', optionsType: 'WorldOptions' },
        ...(!guidance.isWorkspace&&['character-actions', 'control', 'all'].includes(topic) ? { characterCapabilities: humanoid.CHARACTER_CAPABILITIES, controlBindings: humanoid.INPUT_BINDINGS, humanoidInputGuides: humanoid.HUMANOID_INPUT_GUIDES } : {}),
        ...(['extensions', 'all'].includes(topic) ? { runtimeSource: { tool: 'creator_materialize_runtime', sourceRoot: 'sdk', buildTool: 'world_validate', entry: 'sdk/three-world/src/index.ts' } } : {}),
      } : {}),
      observationScope: 'Shared minimal same-scene observer. SDK telemetry and commands are only available in the SDK profile.',
      ...sdk,
      ...(isSdk&&wants('cameraConfiguration')?{cameraConfiguration:await cameraConfiguration(guidance)}:{}),
      ...(isSdk&&wants('cameraSourceContracts')?{cameraSourceContracts:Object.fromEntries(await Promise.all(CAMERA_CONTRACT_FILES.map(async name=>[name,runtimeContractSource(await guidance.source(name))])))}:{}),
      ...(isSdk&&['boundaries','all'].includes(topic)?{boundaryContracts:Object.fromEntries(await Promise.all(
        ['boundaries.ts','humanoid-runtime/environment/types.ts'].map(async name=>[name,runtimeContractSource(await guidance.source(name))]),
      ))}:{}),
      ...(includesCommands ? { worldCommandSchema: WORLD_COMMAND_SCHEMA } : {}),
      ...(guidance.isWorkspace&&wants('runtimeDefinitions')?{runtimeDefinitions:await guidance.definitions(includesHumanoid||includesCommands)}:{}),
      ...(humanoidSourceContracts ? { humanoidSourceContracts } : {}),
      ...(isSdk&&wants('objectColorContracts')&&guidance.shouldDescribeSource('object-color.ts')?{objectColorContracts:{
        'object-color.ts':runtimeContractSource(await guidance.source('object-color.ts')),
        'humanoid-runtime/character.ts':runtimeContractSource(await guidance.source('humanoid-runtime/character.ts')),
      }}:{}),
      ...(isSdk&&!guidance.isWorkspace&&['humanoid','mounted-interaction','all'].includes(topic)?{aircraftConfigurations:{plane:humanoid.createAircraftSpec('plane')},roadVehicleConfigurations:{car:humanoid.createRoadVehicleSpec('car'),motorcycle:humanoid.createRoadVehicleSpec('motorcycle')}}:{}),
      ...(humanoidExampleTopic ? { humanoidExampleTopic } : {}),
      episodeNote: "Real-time steps; keys persist until keysUp. v2 adds commands/lifecycle. Targets measure proximity. Read sections:['episode'].",
    };
    // Advertise available declarations even when this request did not materialize them.
    const availableFields = new Set(Object.entries(result).filter(([, value]) => value !== undefined).map(([key]) => key));
    if (isSdk) { availableFields.add('sdkContracts'); availableFields.add('sdkGuide'); }
    if (isSdk && !nonhuman) availableFields.add('sdkFactoryContracts');
    if (includesHumanoid) availableFields.add('humanoidSourceContracts');
    if (guidance.isWorkspace) availableFields.add('runtimeDefinitions');
    const availableSections = Object.entries(sectionFields)
      .filter(([, fields]) => fields.some(field => availableFields.has(field))).map(([section]) => section);
    return {...result, availableSections};
  }

  private exampleRoot(topic: ExampleTopic, variant?:'car'|'motorcycle') {
    return path.join(REPOSITORY_ROOT, EXAMPLE_REGISTRY[topic==='custom-vehicle'&&variant==='car'?'vehicle-camera':topic].root);
  }

  private async missingExampleAssets(topic: ExampleTopic, variant?:'car'|'motorcycle') {
    const project = JSON.parse(await readFile(path.join(this.exampleRoot(topic,variant), 'project.json'), 'utf8')) as { assetIds: string[] };
    const allowed = this.compiler.assetPolicy().policy.allowedAssetIds;
    return project.assetIds.filter(id => !allowed.includes(id));
  }

  private async exampleAvailable(topic: ExampleTopic) {
    if(topic==='getting-started')return this.compiler.assetPolicy().policy.allowedAssetIds.includes(this.compiler.assetPolicy().policy.defaultHumanoidAssetId);
    return (await this.missingExampleAssets(topic)).length === 0;
  }

  async bindingExamples(topic:ExampleTopic='getting-started',files?:readonly string[],variant?:BindingVariant) {
    if(variant==='flying-creature'){const allowed=this.compiler.allowedAssets();if(!allowed.some(asset=>asset.id==='humanoid.uefn-mannequin')||!allowed.some(asset=>asset.integrationMetadata?.classification==='flying-mount'))throw new Error('THREE_EXAMPLE_ASSETS_UNAVAILABLE');}
    else if(topic!=='getting-started'&&(await this.missingExampleAssets(topic,variant==='plane'?undefined:variant)).length)throw new Error('THREE_EXAMPLE_ASSETS_UNAVAILABLE');
    const runtime=await readRuntimeGuidance(this.compiler);
    const cameraAuthoring=cameraAuthoringGuidance(this.profile,runtime.isWorkspace,topic==='nonhuman-subject'?'nonhuman':'humanoid');
    return {...await bindingExample(this.profile,topic,files,variant),exampleAuthority:'host-baseline',
      runtimeGuidance:runtime.provenance,...(cameraAuthoring?{cameraAuthoring}:{})};
  }

  async examples(topic: ExampleTopic = 'getting-started', selectedFiles?: readonly string[], variant?:'car'|'motorcycle') {
    if(!EXAMPLE_TOPICS.includes(topic))throw new Error('THREE_EXAMPLE_TOPIC_UNKNOWN');
    if(variant!==undefined&&topic!=='custom-vehicle')throw new Error('THREE_EXAMPLE_VARIANT_UNSUPPORTED');
    const guidance=await readRuntimeGuidance(this.compiler);
    const cameraAuthoring=cameraAuthoringGuidance(this.profile,guidance.isWorkspace,topic==='nonhuman-subject'?'nonhuman':'humanoid');
    const authority={exampleAuthority:'host-baseline',runtimeGuidance:guidance.provenance,...(cameraAuthoring?{cameraAuthoring}:{})};
    if (topic !== 'getting-started') {
      if (this.profile !== 'three-sdk') throw new Error('THREE_SDK_EXAMPLE_UNSUPPORTED');
      const missing = await this.missingExampleAssets(topic,variant);
      if (missing.length) throw new Error(`THREE_EXAMPLE_ASSETS_UNAVAILABLE: ${topic}: ${missing.join(', ')}`);
      return {
        ...authority, profile: this.profile, topic,...(topic==='custom-vehicle'?{variant:variant??'motorcycle'}:{}),
        ...await readExampleFiles(this.exampleRoot(topic,variant), topic==='custom-vehicle'&&variant==='car'?'vehicle-camera':topic, selectedFiles),
        sdkExample: (guidance.isWorkspace?'Host baseline example; verify compatibility with the workspace SDK before reuse. ':'')+(topic==='nonhuman-subject'?'A standalone nonhuman actor with SDK movement, camera, collision, reset and capture.':'Supplied humanoid and task-specific binding example.')+' Compilation is not behavioral acceptance.',
      };
    }
    const isSdk = this.profile === 'three-sdk';
    const defaultHumanoid = this.compiler.assetPolicy().policy.defaultHumanoidAssetId;
    return {
      ...authority, profile: this.profile, subjectAuthoring:subjectAuthoringGuidance(this.profile),
      exampleUse:isSdk?'getting-started demonstrates a human. Choose nonhuman-subject when the protagonist is an animal or creature.':'Raw input/observation example; adapt the visual subject and controls to the request.',
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
        ? 'Read the exported contracts and the installed SDK example before using createHumanoidWorld. Use setCaptureTargets and await world.start(); the SDK prepares initial materials and renders the opening before starting simulation and publishing the common observer. Keep loading UI visible until start resolves. The main script owns ordinary Three scene geometry and camera composition.'
        : 'Use normal Three scene, camera and renderer. Your loop and keyboard handlers remain yours. Expose a ready observer with scene/camera/renderer/controlledObject/targets and startLive/stopLive/reset. The Host does not provide a movement or physics implementation to the raw baseline.',
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

  async document(document:AgentDocumentPath) {
    const guide=readAgentDocument(document),runtime=await readRuntimeGuidance(this.compiler);
    const all=this.compiler.allowedAssets().map(asset=>({id:asset.id,name:asset.displayName,
      category:asset.id.startsWith('humanoid.')?'humans':/^(creature|quadruped)\./.test(asset.id)?'animals':asset.id.startsWith('vehicle.')?'vehicles':'scene',
      details:{tool:'assets_describe',arguments:{assetId:asset.id}}}));
    const category=document.split('/')[1],flying=document==='assets/animals/flying-mounts.md';
    const flyingIds=new Set(this.compiler.allowedAssets().filter(asset=>asset.integrationMetadata?.classification==='flying-mount').map(asset=>asset.id));
    const groups:Record<string,readonly string[]>={
      'assets/humans/movement.md':['move','jump','crouch','prone','swim','swimStyle'],
      'assets/humans/actions.md':['slide','roll','jump','climb','releaseClimb'],
      'assets/humans/interactions.md':['pickup','putDown','sit','standUp'],
    };
    const ids=groups[document];
    const permittedHuman=this.compiler.assetPolicy().policy.allowedAssetIds.includes('humanoid.uefn-mannequin');
    const cards=ids&&permittedHuman&&this.profile==='three-sdk'&&!runtime.isWorkspace;
    return {document,source:`packages/creator-host/docs/agent/${document}`,guide,
      runtimeGuidance:runtime.provenance,navigation:documentNavigation(document),
      ...(document.startsWith('assets/')?{assetIndex:all.filter(asset=>document==='assets/README.md'||asset.category===category&&category!=='vehicles'&&(!flying||flyingIds.has(asset.id)))}:{}),
      ...(cards?{capabilities:humanoid.CHARACTER_CAPABILITIES.filter(card=>ids.includes(card.id)),
        controlBindings:humanoid.HUMANOID_BINDINGS}:{}),
      ...(ids?{currentDetails:{tool:'creator_get_authoring_schema',arguments:{topic:'character-actions',sections:['commands','humanoid']},
        note:runtime.isWorkspace?'Read current workspace source and observed eligibility.':'Cards describe baseline capability; inspect current eligibility before execution.'}}:{}),
      readHint:'Choose a child document or selected asset, then its required capability. Read deeper topic/sections only for missing interfaces.',
    };
  }

  async selectedSchema(topic: AuthoringTopic = 'getting-started', sections: readonly SchemaSection[] = ['guide']) {
    const requestedFields = sections.includes('all') ? undefined : new Set<string>(
      sections.flatMap(section => section === 'all' ? [] : sectionFields[section]));
    const full = await this.schema(topic, requestedFields);
    const source: Record<string, unknown> = full;
    const availableSections = full.availableSections;
    const selected = sections.includes('all') ? source : Object.fromEntries(
      sections.flatMap(section => section === 'all' ? [] : sectionFields[section])
        .filter(field => source[field] !== undefined).map(field => [field, source[field]]),
    );
    return { topic, availableTopics: AUTHORING_TOPICS, availableSections, runtimeGuidance:full.runtimeGuidance, ...selected,
      readHint: 'General conventions: topic getting-started. Request only needed sections; sections:["all"] returns the complete topic. Read creator_get_examples for minimal binding snippets.',
    };
  }

  async describeAsset(assetId: string) {
    const guidance=await readRuntimeGuidance(this.compiler);
    const result = this.assetResults('', assetId,guidance);
    if (!result.assets.length) throw new Error(`THREE_ASSET_UNAVAILABLE: ${assetId}`);
    const category=assetId.startsWith('humanoid.')?'humans':/^(creature|quadruped)\./.test(assetId)?'animals':assetId.startsWith('vehicle.')?'vehicles':'scene';
    const metadata=this.compiler.allowedAssets().find(asset=>asset.id===assetId)?.integrationMetadata;
    const flying=metadata?.classification==='flying-mount',document=metadata?.documentation;
    const mount=result.mountUsage.find(usage=>usage.assetId===assetId);
    const registeredDocument=typeof document==='string'&&AGENT_DOCUMENT_PATHS.includes(document as AgentDocumentPath)?document:undefined;
    return {...result,cameraPresetSnapshots:cameraPresetSnapshots(metadata?.cameraPresetReferences,guidance.isWorkspace),documentation:{tool:'creator_get_authoring_schema',arguments:{document:registeredDocument??`assets/${category}/README.md`}},
      ...(flying&&mount?.integrationReady?{bindingExample:{tool:'creator_get_examples',arguments:{topic:mount.exampleTopic,variant:mount.exampleVariant}}}:{}),
      ...(guidance.isWorkspace?{runtimeDefinitions:await guidance.definitions()}:{}),runtimeGuidance:guidance.provenance};
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
        animationClips: (asset.animationClips ?? []).map((action: { id: string }) => action.id),
        vehicle: { mode: asset.vehicle?.spec?.mode, hint: asset.vehicle?.spec?.hint,
          locomotionBindingIds: asset.locomotionBindingIds },
        recommendedFor: asset.recommendedFor, useWhen: usage?.useWhen, skills: usage?.skillRequests, bindings: usage?.controlBindings,
        hints: usage?.controlHints, capabilities: usage?.capabilities,
        mount: mount ? {useWhen:mount.useWhen,capabilities:mount.capabilities} : undefined }).normalize('NFKC').toLowerCase();
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
        ...(usage?.useWhen || mount?.useWhen || asset.recommendedFor?.length || asset.vehicle?.spec?.hint
          ? { useWhen: usage?.useWhen ?? mount?.useWhen ?? (asset.recommendedFor?.length ? asset.recommendedFor.join(' ') : asset.vehicle?.spec?.hint) } : {}),
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
