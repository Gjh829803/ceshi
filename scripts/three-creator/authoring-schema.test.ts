import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';
import {AUTHORING_TOPICS, guideTopic, publicContractTopic,humanoidContractSource,trainingContractSource} from './authoring-schema.js';
import {SDK_EXAMPLE} from './examples.js';

const contracts = readFileSync(new URL('../../packages/three-world/src/contracts.ts', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../../packages/three-world/README.md', import.meta.url), 'utf8');

function declarations(source:string) {
 const file = ts.createSourceFile('contracts.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 return {file,byName:new Map(file.statements.flatMap(statement=>
  ts.isInterfaceDeclaration(statement)||ts.isTypeAliasDeclaration(statement)
   ? [[statement.name.text,statement] as const] : []))};
}

it.each(['getting-started','nonhuman-subject','extensions'] as const)('exposes existing lifecycle hooks to the %s authoring consumer',topic=>{
 const original=declarations(contracts),selected=declarations(publicContractTopic(contracts,topic));
 const methods=({file,byName}:ReturnType<typeof declarations>)=>{
  const world=byName.get('World');
  if(!world||!ts.isInterfaceDeclaration(world))throw new Error('World interface is missing');
  return new Map(world.members.map(member=>[member.name?.getText(file),member.getText(file)]));
 };
 const actual=methods(original),published=methods(selected);
 for(const name of ['onReset','onDispose']){
  expect(actual.has(name)).toBe(true);
  expect(published.get(name)).toBe(actual.get(name));
 }
});

describe('Agent presentation contract',()=>{
 it('exposes shared shadow settings, light application and the JSON usage path',()=>{
  const source=publicContractTopic(contracts,'presentation');
  expect(source).toContain('interface ShadowSettings');
  expect(source).toContain('readonly shadowSettings');
  expect(source).toContain('configureShadowLight');
  const selected=guideTopic(guide,'presentation');
  expect(selected).toContain('resolveShadowSettings(config.shadows)');
  expect(selected).toContain('world.configureShadowLight(sun)');
 });
 it('publishes the real presentation port with all source identity and binding dependencies',()=>{
  expect(AUTHORING_TOPICS).toContain('presentation');
  const {file,byName}=declarations(publicContractTopic(contracts,'presentation'));
  const original=declarations(contracts).byName;
  for(const name of ['WorldPresentation','PresentationOptions','PresentationStatus',
   'PresentationUI','UIBinding','UIContext','UIAnchor','ModelInput','ModelInputFrame',
   'ModelOutput','SourceFrame','SourceFrameKey']) expect(byName.has(name),name).toBe(true);
  const missing=new Set<string>();
  const visit=(node:ts.Node)=>{
   if ((ts.isTypeReferenceNode(node)||ts.isExpressionWithTypeArguments(node))) {
    const name=ts.isTypeReferenceNode(node)?node.typeName:node.expression;
    if(ts.isIdentifier(name)&&original.has(name.text)&&!byName.has(name.text)) missing.add(name.text);
   }
   ts.forEachChild(node,visit);
  };
  visit(file);
  expect([...missing]).toEqual([]);
  const world=byName.get('World');
  expect(world&&ts.isInterfaceDeclaration(world)).toBe(true);
  if(!world||!ts.isInterfaceDeclaration(world)) throw new Error('World interface is missing');
  const members=world.members.map(member=>member.name?.getText(file));
  expect(members).toContain('createPresentation');
  expect(members).toContain('execute');
  expect(members).not.toContain('registerMovement');
 });

 it('typechecks the default humanoid example against the actual SDK entry point',()=>{
  const filename=fileURLToPath(new URL('./.authoring-example-typecheck.ts',import.meta.url));
  const source=SDK_EXAMPLE+`
// @ts-expect-error The actual humanoid factory requires a collision map.
createHumanoidWorld({scene,camera,canvas});
// @ts-expect-error The actual map uses numeric XYZ spawn coordinates.
const invalidSpawn:TrainingMap['playerSpawn']=['x',0,0];
// @ts-expect-error The returned world accepts entity IDs as capture targets.
world.setCaptureTargets([1]);
`;
  const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
   moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,noEmit:true,types:[]};
  const host=ts.createCompilerHost(options),readSource=host.getSourceFile.bind(host);
  host.getSourceFile=(fileName,languageVersion,onError,shouldCreateNewSourceFile)=>fileName.replaceAll('\\','/')===filename.replaceAll('\\','/')
   ? ts.createSourceFile(fileName,source,languageVersion,true)
   : readSource(fileName,languageVersion,onError,shouldCreateNewSourceFile);
  const program=ts.createProgram([filename],options,host);
  const example=program.getSourceFile(filename);
  if(!example) throw new Error('Default example source is missing from the TypeScript program');
  // Resolve real SDK types, but check this consumer rather than every runtime
  // implementation body. The workspace typecheck owns those implementation checks.
  const diagnostics=ts.getPreEmitDiagnostics(program,example).map(diagnostic=>
   ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n'));
  expect(diagnostics).toEqual([]);
 // Allow cold TypeScript initialization on CI without changing other test budgets.
 },20_000);

 it('gives the presentation topic its usage boundary without unrelated movement recipes',()=>{
  const selected=guideTopic(guide,'presentation');
  expect(selected).toContain('world.createPresentation()');
  expect(selected).toContain("clock:'presented'");
  expect(selected).toContain('resolveSourceFrame');
  expect(selected).toContain('tracking of generated geometry');
  expect(selected).not.toContain("world.registerMovement({id:'hover'");
 });
});

it('exposes the actual humanoid factory options and signature without runtime implementation',()=>{
 const source=readFileSync(new URL('../../packages/three-world/src/humanoid.ts',import.meta.url),'utf8');
 const contract=humanoidContractSource(source);
 for(const field of ['map:','characterId?:','resourceUrl?:','vehicles?:','profile?:','character?:','assetDefinitions?:'])expect(contract).toContain(field);
 expect(contract).toMatch(/export declare function createHumanoidWorld\(options:\s*HumanoidWorldOptions\):\s*Promise<ThreeWorld>/);
 expect(contract).not.toContain('await character.load');
});

it('publishes Training runtime methods as declarations consumable beside their real source imports',()=>{
 const runtimeUrl=new URL('../../packages/three-world/src/training/runtime.ts',import.meta.url);
 const runtimeSource=readFileSync(runtimeUrl,'utf8');
 const parsed=ts.createSourceFile('runtime.ts',runtimeSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const imports=parsed.statements.filter(ts.isImportDeclaration).map(node=>node.getText(parsed)).join('\n');
 const filename=fileURLToPath(new URL('../../packages/three-world/src/training/.authoring-runtime-contract.ts',import.meta.url));
 const source=`${imports}\n${trainingContractSource(runtimeSource)}
declare const runtime: TrainingRuntime;
runtime.prepareCharacter([0, 0, 0]);
runtime.prepareCharacter([0, 0, 0], 0.5);
// @ts-expect-error yaw must remain numeric.
runtime.prepareCharacter([0, 0, 0], 'east');
runtime.setInput(undefined);
`;
 const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,noEmit:true,types:[]};
 const host=ts.createCompilerHost(options),readSource=host.getSourceFile.bind(host);
 host.getSourceFile=(fileName,languageVersion,onError,shouldCreateNewSourceFile)=>fileName.replaceAll('\\','/')===filename.replaceAll('\\','/')
  ? ts.createSourceFile(fileName,source,languageVersion,true)
  : readSource(fileName,languageVersion,onError,shouldCreateNewSourceFile);
 const program=ts.createProgram([filename],options,host);
 const consumer=program.getSourceFile(filename);
 if(!consumer)throw new Error('Training contract consumer is missing from the TypeScript program');
 const diagnostics=ts.getPreEmitDiagnostics(program,consumer).map(diagnostic=>({
  code:diagnostic.code,message:ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n'),
 }));
 expect(diagnostics).toEqual([]);
},20_000);

it('normalizes default parameters and implementation overloads for runtime, horse and factory declarations',()=>{
 const source=`
import {DEFAULT_ID} from './defaults';
export type Vec3=readonly [number,number,number];
export interface HumanoidWorldOptions { readonly map:string }
export class TrainingRuntime {
 prepareCharacter(position:Vec3,yaw=Math.PI):boolean{return true}
 prepare(id=Number.EPSILON,position:Vec3):boolean{return true}
 approach(id=DEFAULT_ID):boolean{return true}
 interact(enabled=!0):boolean{return enabled}
 setInput(input:string):()=>void;
 setInput(input:undefined):void;
 setInput(input:string|undefined):(()=>void)|void{return undefined}
}
export class TrainingHorse {
 constructor(speed:number=1){}
 sample(rate:number=1):void{}
}
export async function createHumanoidWorld(options:HumanoidWorldOptions={map:'default'}):Promise<ThreeWorld>{throw new Error()}
`;
 const training=trainingContractSource(source);
 const humanoid=humanoidContractSource(source);
 expect(training).toMatch(/prepareCharacter\(position: Vec3, yaw\?: number\): boolean/);
 expect(training).toMatch(/prepare\(id: number \| undefined, position: Vec3\): boolean/);
 expect(training).not.toContain('prepare(id?:');
 expect(training).toContain('Declaration unavailable for approach');
 expect(training).toContain('consult the workspace source');
 expect(training).toMatch(/interact\(enabled\?: boolean\): boolean/);
 expect(training.match(/setInput\(/g)).toHaveLength(2);
 expect(training).toMatch(/constructor\(speed\?: number\)/);
 expect(training).toMatch(/sample\(rate\?: number\): void/);
 expect(humanoid).toMatch(/createHumanoidWorld\(options\?: HumanoidWorldOptions\): Promise<ThreeWorld>/);
 for(const contract of [training,humanoid]){
  const file=ts.createSourceFile('contract.ts',contract,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const initializers:string[]=[];
  const visit=(node:ts.Node)=>{if(ts.isParameter(node)&&node.initializer)initializers.push(node.getText(file));ts.forEachChild(node,visit);};
  visit(file);expect(initializers).toEqual([]);
 }
 const consumer=`${training}
declare const runtime:TrainingRuntime;
runtime.interact();
runtime.interact(true);
// @ts-expect-error enabled must remain boolean.
runtime.interact(1);
`;
 const compiled=ts.createSourceFile('training-contract.ts',consumer,ts.ScriptTarget.Latest,true);
 const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,strict:true,noEmit:true,types:[]};
 const host=ts.createCompilerHost(options),readSource=host.getSourceFile.bind(host);
 host.getSourceFile=(fileName,languageVersion,onError,shouldCreateNewSourceFile)=>fileName==='training-contract.ts'
  ? compiled:readSource(fileName,languageVersion,onError,shouldCreateNewSourceFile);
 const program=ts.createProgram(['training-contract.ts'],options,host);
 expect(ts.getPreEmitDiagnostics(program,compiled).map(diagnostic=>({code:diagnostic.code,
  message:ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n')}))).toEqual([]);
 const parameterProperty=trainingContractSource('export class TrainingHorse { constructor(readonly speed:number=1){} }');
 expect(parameterProperty).toContain('Declaration unavailable for constructor');
 expect(parameterProperty).toContain('consult the workspace source');
 expect(parameterProperty).not.toContain('constructor(readonly');
});
