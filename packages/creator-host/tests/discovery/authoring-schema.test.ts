import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {describe,expect, it} from 'vitest';
import {AUTHORING_TOPICS, guideTopic, publicContractTopic,humanoidFactoryContractSource,runtimeContractSource} from '../../src/discovery/authoring-schema.js';
import {SDK_EXAMPLE} from '../../src/discovery/examples.js';

const contracts = readFileSync(new URL('../../../three-world/src/contracts.ts', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../../../three-world/README.md', import.meta.url), 'utf8');

it('publishes native water binding, signed diving input and observable mode to the action guide',()=>{
 const selected=guideTopic(guide,'character-actions');
 for(const text of ['map.water','humanoid.lift','water.contact.swimmingMode','underwater','C/Ctrl'])expect(selected).toContain(text);
});

it('publishes configuration-only camera authoring',()=>{
 const selected=publicContractTopic(contracts,'getting-started');
 expect(selected).toContain('setCameraView');expect(selected).toContain('CameraDocument');
 expect(selected).not.toContain('setCameraPerspective');
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

it('keeps quality inspection contracts tied to current source declarations',()=>{
 const original=declarations(contracts),selected=declarations(publicContractTopic(contracts,'quality'));
 const members=({file,byName}:ReturnType<typeof declarations>)=>{
  const world=byName.get('World');
  if(!world||!ts.isInterfaceDeclaration(world))throw new Error('World interface is missing');
  return new Map(world.members.map(member=>[member.name?.getText(file),member.getText(file)]));
 };
 const actual=members(original),published=members(selected);
 for(const name of ['getEntityState','describe','snapshot','setCaptureTargets'])expect(published.get(name)).toBe(actual.get(name));
 expect(published.get('getKeyBindings')).toBe(actual.get('getKeyBindings')?.replace("import('./humanoid-runtime/input')", "import('@worldkit/three').humanoid"));
 expect(published.has('registerMovement')).toBe(false);
});

it('publishes createWorld with the actual optional options and full SDK return type',()=>{
 const factories=['getting-started','nonhuman-subject'].map(topic=>{
  const file=ts.createSourceFile('contract.ts',publicContractTopic(contracts,topic as 'getting-started'|'nonhuman-subject'),ts.ScriptTarget.Latest,true);
  const factory=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='createWorld');
  if(!factory)throw new Error('Missing createWorld declaration');
  return factory.getText(file);
 });
 expect(factories[0]).toBe(factories[1]);
 const filename=fileURLToPath(new URL('.world-factory-consumer.ts',import.meta.url));
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
 host.getSourceFile=(name,version,onError,fresh)=>name.replace(/\\/g,'/')===filename.replace(/\\/g,'/')?ts.createSourceFile(name,source,version,true):readSource(name,version,onError,fresh);
 const program=ts.createProgram([filename],options,host),consumer=program.getSourceFile(filename);
 if(!consumer)throw new Error('Missing factory consumer');
 expect(ts.getPreEmitDiagnostics(program,consumer).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'))).toEqual([]);
},20_000);

describe('Agent presentation contract',()=>{
 it('typechecks source-derived object color declarations against the exported SDK',()=>{
  const source=runtimeContractSource(readFileSync(new URL('../../../three-world/src/object-color.ts',import.meta.url),'utf8'));
  const filename=fileURLToPath(new URL('.color-consumer.ts',import.meta.url));
  const body=`${source}\nimport {setObjectColor as actual} from '@worldkit/three';
declare const object:Object3D;declare const color:string;
const implementation:typeof setObjectColor=actual;
const published:typeof actual=setObjectColor;
const binding=setObjectColor(object,color);binding.setColor(color);binding.dispose();
// @ts-expect-error Colors are explicit sRGB hex strings, not roles or numeric enums.
setObjectColor(object,123);`;
  const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,noEmit:true,types:[]};
  const host=ts.createCompilerHost(options),readSource=host.getSourceFile.bind(host);
  host.getSourceFile=(name,version,onError,fresh)=>name.replace(/\\/g,'/')===filename.replace(/\\/g,'/')?ts.createSourceFile(name,body,version,true):readSource(name,version,onError,fresh);
  const program=ts.createProgram([filename],options,host),consumer=program.getSourceFile(filename)!;
  expect(ts.getPreEmitDiagnostics(program,consumer).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'))).toEqual([]);
 },20000);
 it('exposes shadow configuration contracts and their source reference',()=>{
  const source=publicContractTopic(contracts,'presentation');
  expect(source).toContain('interface ShadowSettings');
  expect(source).toContain('readonly shadowSettings');
  expect(source).toContain('configureShadowLight');
  const selected=guideTopic(guide,'presentation');
  expect(selected).toContain('resolveShadowSettings');
  expect(selected).toContain('world.configureShadowLight');
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
  const filename=fileURLToPath(new URL('.authoring-example-typecheck.ts',import.meta.url));
  const source=SDK_EXAMPLE+`
// @ts-expect-error The actual humanoid factory requires a collision map.
createHumanoidWorld({scene,camera,canvas});
// @ts-expect-error The actual map uses numeric XYZ spawn coordinates.
const invalidSpawn:EnvironmentDefinition['playerSpawn']=['x',0,0];
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
 const source=readFileSync(new URL('../../../three-world/src/humanoid.ts',import.meta.url),'utf8');
 const contract=humanoidFactoryContractSource(source);
 for(const field of ['map:','characterId?:','characterFacingYawRadians?:','characterLoadOptions?:','resourceUrl?:','vehicles?:','profile?:','character?:','assetDefinitions?:'])expect(contract).toContain(field);
 expect(contract).toMatch(/export declare function createHumanoidWorld\(options:\s*HumanoidWorldOptions\):\s*Promise<ThreeWorld>/);
 expect(contract).not.toContain('await character.load');
 const filename=fileURLToPath(new URL('.humanoid-contract-typecheck.ts',import.meta.url));
 const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,noEmit:true,types:[]};
 const host=ts.createCompilerHost(options),readSource=host.getSourceFile.bind(host);
 host.getSourceFile=(name,version,onError,fresh)=>name.replace(/\\/g,'/')===filename.replace(/\\/g,'/')
  ? ts.createSourceFile(name,contract,version,true) : readSource(name,version,onError,fresh);
 const program=ts.createProgram([filename],options,host);
 expect(ts.getPreEmitDiagnostics(program,program.getSourceFile(filename)).map(diagnostic=>
  ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n'))).toEqual([]);

});

it('publishes Player runtime methods as declarations consumable beside their real source imports',()=>{
 const runtimeUrl=new URL('../../../three-world/src/humanoid-runtime/runtime.ts',import.meta.url);
 const runtimeSource=readFileSync(runtimeUrl,'utf8');
 expect(runtimeContractSource(runtimeSource)).toContain('createCharacter(): Promise<Character>');
 const parsed=ts.createSourceFile('runtime.ts',runtimeSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const imports=parsed.statements.filter(ts.isImportDeclaration).map(node=>node.getText(parsed)).join('\n');
 const filename=fileURLToPath(new URL('../../../three-world/src/humanoid-runtime/.authoring-runtime-contract.ts',import.meta.url));
 const source=`${imports}\n${runtimeContractSource(runtimeSource)}
declare const runtime: HumanoidRuntime;
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
 if(!consumer)throw new Error('Player contract consumer is missing from the TypeScript program');
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
export class HumanoidRuntime {
 prepareCharacter(position:Vec3,yaw=Math.PI):boolean{return true}
 prepare(id=Number.EPSILON,position:Vec3):boolean{return true}
 approach(id=DEFAULT_ID):boolean{return true}
 interact(enabled=!0):boolean{return enabled}
 setInput(input:string):()=>void;
 setInput(input:undefined):void;
 setInput(input:string|undefined):(()=>void)|void{return undefined}
}
export class HorseVisual {
 constructor(speed:number=1){}
 sample(rate:number=1):void{}
}
export async function createHumanoidWorld(options:HumanoidWorldOptions={map:'default'}):Promise<ThreeWorld>{throw new Error()}
`;
 const player=runtimeContractSource(source);
 const humanoid=humanoidFactoryContractSource(source);
 expect(player).toMatch(/prepareCharacter\(position: Vec3, yaw\?: number\): boolean/);
 expect(player).toMatch(/prepare\(id: number \| undefined, position: Vec3\): boolean/);
 expect(player).not.toContain('prepare(id?:');
 expect(player).toContain('Declaration unavailable for approach');
 expect(player).toContain('consult the workspace source');
 expect(player).toMatch(/interact\(enabled\?: boolean\): boolean/);
 expect(player.match(/setInput\(/g)).toHaveLength(2);
 expect(player).toMatch(/constructor\(speed\?: number\)/);
 expect(player).toMatch(/sample\(rate\?: number\): void/);
 expect(humanoid).toMatch(/createHumanoidWorld\(options\?: HumanoidWorldOptions\): Promise<ThreeWorld>/);
 for(const contract of [player,humanoid]){
  const file=ts.createSourceFile('contract.ts',contract,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const initializers:string[]=[];
  const visit=(node:ts.Node)=>{if(ts.isParameter(node)&&node.initializer)initializers.push(node.getText(file));ts.forEachChild(node,visit);};
  visit(file);expect(initializers).toEqual([]);
 }
 const consumer=`${player}
declare const runtime:HumanoidRuntime;
runtime.interact();
runtime.interact(true);
// @ts-expect-error enabled must remain boolean.
runtime.interact(1);
`;
 const compiled=ts.createSourceFile('player-contract.ts',consumer,ts.ScriptTarget.Latest,true);
 const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,strict:true,noEmit:true,types:[]};
 const host=ts.createCompilerHost(options),readSource=host.getSourceFile.bind(host);
 host.getSourceFile=(fileName,languageVersion,onError,shouldCreateNewSourceFile)=>fileName==='player-contract.ts'
  ? compiled:readSource(fileName,languageVersion,onError,shouldCreateNewSourceFile);
 const program=ts.createProgram(['player-contract.ts'],options,host);
 expect(ts.getPreEmitDiagnostics(program,compiled).map(diagnostic=>({code:diagnostic.code,
  message:ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n')}))).toEqual([]);
 const parameterProperty=runtimeContractSource('export class HorseVisual { constructor(readonly speed:number=1){} }');
 expect(parameterProperty).toContain('Declaration unavailable for constructor');
 expect(parameterProperty).toContain('consult the workspace source');
 expect(parameterProperty).not.toContain('constructor(readonly');
});

it('publishes portable humanoid namespace references for generated authoring contracts',()=>{
 const selected=publicContractTopic(contracts,'humanoid');
 expect(selected).toContain("import('@worldkit/three').humanoid.HumanoidRuntime");
 expect(selected).not.toContain("import('./humanoid-runtime/");
});

it('publishes interaction slot definitions with their real entity and command consumers',()=>{
 const selected=publicContractTopic(contracts,'character-actions');
 expect(selected).toContain('addEntity(');expect(selected).toContain('registerPrototype(');
 expect(selected).toContain('export interface InteractionSlot');
 for(const field of ['positionLocalMetersXYZ','approachLocalMetersXYZ','rotationLocalRadiansXYZ','capacity'])expect(selected).toContain(field);
 expect(selected).not.toContain("from './interaction-contracts'");
});

it('keeps shared conventions at the entry point and returns every matching topic section',()=>{
 const markdown='Shared conventions\n<!-- topic:getting-started -->Start\n<!-- topic:humanoid -->First\n<!-- topic:observation -->Observe\n<!-- topic:humanoid -->Second';
 expect(guideTopic(markdown,'getting-started')).toBe('Shared conventions\nStart');
 expect(guideTopic(markdown,'humanoid')).toBe('First\nSecond');
 expect(guideTopic(markdown,'all')).toBe(markdown);
});
