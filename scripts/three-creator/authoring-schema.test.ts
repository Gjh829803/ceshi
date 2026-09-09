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
 expect(contract).toContain('export declare function createHumanoidWorld(options:HumanoidWorldOptions):Promise<ThreeWorld>');
 expect(contract).not.toContain('await character.load');
});
