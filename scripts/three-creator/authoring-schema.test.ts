import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';
import {AUTHORING_TOPICS, guideTopic, publicContractTopic,humanoidContractSource,trainingContractSource} from './authoring-schema.js';
import {SDK_EXAMPLE} from './examples.js';
import {training} from '@worldkit/three';
const {CAMERA_PARAMETERS,CAMERA_SCHEMA_PROPERTIES,CAMERA_DISTANCE_METERS_SCHEMA,VEHICLE_CAMERA_DISTANCE_SCHEMA,DEFAULT_CAMERA_TUNING,parseCameraTuning}=training;

const contracts = readFileSync(new URL('../../packages/three-world/src/contracts.ts', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../../packages/three-world/README.md', import.meta.url), 'utf8');

describe('Agent camera authoring contract',()=>{
 it('publishes additive offset defaults without narrowing existing values or changing unrelated schema fields',()=>{
  const properties=CAMERA_SCHEMA_PROPERTIES as Record<string,Record<string,unknown>>;
  for(const [key,minimum,maximum] of [['targetHeightOffset',-2,5],['horizontalOffset',-3,3]] as const){
   expect(properties[key]).toMatchObject({type:'number',minimum,maximum,default:0});
   const definition=CAMERA_PARAMETERS[key] as typeof CAMERA_PARAMETERS[typeof key]&{description:string};
   expect(properties[key]!.description).toBe(definition.description);
   expect(definition.description).toMatch(/increment.*meters/i);
   expect(definition.description).toContain('mode 0');expect(definition.description).toContain('mode 2');
   expect(definition.description).toMatch(/mode 1.*ignor/i);
   for(const value of [minimum,maximum,1.1])expect(parseCameraTuning({...DEFAULT_CAMERA_TUNING,[key]:value})[key]).toBe(value);
  }
  expect(properties.targetHeightOffset!.description).toMatch(/not.*eye height.*absolute/i);
  expect(properties.baseFovDegrees).toEqual({type:'number',minimum:30,maximum:100,description:'基础视野 (degrees)'});
  expect(properties.collisionEnabled).toEqual({type:'boolean',description:'启用碰撞检测'});
  expect(CAMERA_DISTANCE_METERS_SCHEMA).toMatchObject({type:'number',exclusiveMinimum:0,maximum:100,description:expect.stringMatching(/only.*mode 0/i)});
  expect(VEHICLE_CAMERA_DISTANCE_SCHEMA).toMatchObject({type:'number',minimum:0,description:expect.stringMatching(/only.*mode 0/i)});
 });
 it('retains field JSDoc inside the AST-discovered CameraTuning contract',()=>{
  const source=readFileSync(new URL('../../packages/three-world/src/config/camera.ts',import.meta.url),'utf8');
  const {file,byName}=declarations(trainingContractSource(source));
  const tuning=byName.get('CameraTuning');
  if(!tuning||!ts.isInterfaceDeclaration(tuning))throw new Error('CameraTuning is missing');
  for(const key of ['targetHeightOffset','horizontalOffset']){
   const member=tuning.members.find(member=>member.name?.getText(file)===key)!;
   const docs=ts.getJSDocCommentsAndTags(member).map(doc=>doc.getText(file)).join('\n');
   expect(docs).toMatch(/increment.*meters/i);expect(docs).toContain('Default 0');
   expect(docs).toContain('mode 0');expect(docs).toContain('mode 2');expect(docs).toMatch(/mode 1.*ignor/i);
  }
 });
 it('gives Training readers a default-first camera recipe and distinguishes current preview from reset opening',()=>{
  const selected=guideTopic(guide,'training');
  for(const text of ['targetHeightOffset','horizontalOffset','useAuthoredCamera','training.camera',"view:'current'","view:'opening'",'configuration.effective.camera.framing'])expect(selected).toContain(text);
  expect(selected).toMatch(/opening.*reset/i);
  expect(selected).toMatch(/projection does not\s+prove pixel visibility/i);
  expect(guideTopic(guide,'observation')).toContain('opening, current, top-down and entity-triview');
 });
});

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

it('publishes createWorld with the actual optional options and full SDK return type',()=>{
 const factories=['getting-started','nonhuman-subject'].map(topic=>{
  const file=ts.createSourceFile('contract.ts',publicContractTopic(contracts,topic as 'getting-started'|'nonhuman-subject'),ts.ScriptTarget.Latest,true);
  const factory=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='createWorld');
  if(!factory)throw new Error('Missing createWorld declaration');
  return factory.getText(file);
 });
 expect(factories[0]).toBe(factories[1]);
 const filename=fileURLToPath(new URL('./.world-factory-consumer.ts',import.meta.url));
 const source=`import type * as THREE from 'three';
import {createWorld as actualFactory,type World,type WorldOptions,type ThreeWorld} from '@worldkit/three';
${factories[0]}
createWorld(); createWorld(undefined); createWorld({});
declare const scene:THREE.Scene;
createWorld({scene});
createWorld({fixedTimeStepSeconds:1/60,navigation:true,assetDefinitions:{},shadows:{enabled:false}});
const acceptsActual:typeof createWorld=actualFactory;
const acceptsPublished:typeof actualFactory=createWorld;
const actualResult:Promise<ThreeWorld>=createWorld();
// @ts-expect-error A timestep must remain numeric.
createWorld({fixedTimeStepSeconds:'fast'});
// @ts-expect-error A camera must remain a Three camera.
createWorld({camera:'front'});
`;
 const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,noEmit:true,types:[]};
 const host=ts.createCompilerHost(options),readSource=host.getSourceFile.bind(host);
 host.getSourceFile=(name,version,onError,fresh)=>name===filename?ts.createSourceFile(name,source,version,true):readSource(name,version,onError,fresh);
 const program=ts.createProgram([filename],options,host),consumer=program.getSourceFile(filename);
 if(!consumer)throw new Error('Missing factory consumer');
 expect(ts.getPreEmitDiagnostics(program,consumer).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'))).toEqual([]);
},20_000);

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
