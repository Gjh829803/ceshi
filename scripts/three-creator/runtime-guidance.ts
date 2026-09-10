import {readFile} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import type {CreatorProfile} from './contracts.js';
import {REPOSITORY_ROOT,type ThreeCompiler} from './compiler.js';
import {readWorkspaceRuntime,type WorkspaceRuntime} from './workspace-runtime.js';

const OPTIONAL_GUIDANCE_FILES=new Set(['humanoid-runtime/aircraft-spec.ts','humanoid-runtime/vehicle-inspection.ts','humanoid-runtime/solver-sample.ts']);
const DEFINITION_FILES = ['humanoid-runtime/aircraft-spec.ts','humanoid-runtime/vehicle-inspection.ts','humanoid-runtime/solver-sample.ts','config/aircraft.ts','humanoid-runtime/road-vehicle.ts','humanoid-runtime/wheel-physics.ts','humanoid-runtime/powertrain.ts','config/input.ts','config/actions.ts','config/control.ts','config/control-fields.ts','config/camera.ts','humanoid-runtime/humanoid/action-schema.ts','humanoid-runtime/input.ts','humanoid-runtime/input-guidance.ts','humanoid-runtime/character-capabilities.ts','humanoid-runtime/runtime.ts'] as const;

/** One validated source snapshot per discovery call; never import author modules. */
export class RuntimeGuidance {
  constructor(private readonly runtime:WorkspaceRuntime|undefined,private readonly profile:CreatorProfile) {}
  get isWorkspace(){return this.runtime!==undefined;}
  get provenance(){
    return {
      kind:this.isWorkspace?'workspace-sdk-source':this.profile==='three-sdk'?'host-sdk-baseline':'raw-author',
      runtimeSourceHash:this.runtime?.sourceHash??null,
      sourceRoot:this.isWorkspace?'sdk/three-world/src':'packages/three-world/src',
      definitionsAre:'source-declarations-not-evaluated-capabilities',
      hostContracts:'Asset policy, project/episode validation and command transport remain Host-owned.',
      runtimeCheck:{tool:'world_inspect',arguments:{},instruction:'Match runtimeSourceHash to this source snapshot; inspect current capability eligibility and rejection reasons. Source edits require rebuilding the current world.'},
    };
  }
  shouldDescribeSource(relative:string):boolean { return !OPTIONAL_GUIDANCE_FILES.has(relative)||!this.runtime||this.runtime.files.has(`three-world/src/${relative}`); }
  async source(relative:string):Promise<string>{
    if(this.runtime){
      const bytes=this.runtime.files.get(`three-world/src/${relative}`);
      if(!bytes)throw new Error(`THREE_RUNTIME_GUIDANCE_SOURCE_MISSING: sdk/three-world/src/${relative}`);
      return bytes.toString('utf8');
    }
    return readFile(path.join(REPOSITORY_ROOT,'packages/three-world/src',relative),'utf8');
  }
  async definitions(includeHumanoid=true){
    return Object.fromEntries(await Promise.all(['world.ts','config/presentation.ts',...(includeHumanoid?DEFINITION_FILES:[])].filter(name=>this.shouldDescribeSource(name)).map(async name=>{
      const source=await this.source(name);
      // Small config modules are returned whole so helper/type dependencies stay readable.
      if(name.startsWith('config/')||['humanoid-runtime/road-vehicle.ts','humanoid-runtime/aircraft-spec.ts','humanoid-runtime/vehicle-inspection.ts','humanoid-runtime/solver-sample.ts'].includes(name))return [name,source];
      const file=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
      // Keep imports so references are traceable. Initializers are displayed as
      // source, not interpreted: arbitrary workspace code never runs on the Host.
      const declarations=file.statements.filter(node=>ts.isImportDeclaration(node)||
        ts.isVariableStatement(node)&&node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)||
        ts.isFunctionDeclaration(node)&&node.name?.text==='createWorld'&&node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword));
      return [name,declarations.map(node=>node.getText(file)).join('\n')];
    })));
  }
}
export async function readRuntimeGuidance(compiler:ThreeCompiler):Promise<RuntimeGuidance>{
  const runtime=await readWorkspaceRuntime(REPOSITORY_ROOT,compiler.workspace);
  if(runtime&&compiler.profile!=='three-sdk')throw new Error('THREE_RUNTIME_SOURCE_REQUIRES_SDK');
  return new RuntimeGuidance(runtime,compiler.profile);
}
