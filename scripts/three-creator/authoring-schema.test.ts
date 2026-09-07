import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';
import {AUTHORING_TOPICS, guideTopic, publicContractTopic} from './authoring-schema.js';
import {SDK_EXAMPLE} from './examples.js';

const contracts = readFileSync(new URL('../../packages/three-world/src/contracts.ts', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../../packages/three-world/README.md', import.meta.url), 'utf8');

function declarations(source:string) {
 const file = ts.createSourceFile('contracts.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 return {file,byName:new Map(file.statements.flatMap(statement=>
  ts.isInterfaceDeclaration(statement)||ts.isTypeAliasDeclaration(statement)
   ? [[statement.name.text,statement] as const] : []))};
}

describe('Agent presentation contract',()=>{
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

 it('typechecks the runnable default UI example against only the default public topic',()=>{
  const filename=fileURLToPath(new URL('./.authoring-example-typecheck.ts',import.meta.url));
  const publicTypes=publicContractTopic(contracts,'getting-started').replace("import type * as THREE from 'three';",'');
  const source=publicTypes+'\n'+SDK_EXAMPLE.replace("import {createWorld} from '@worldkit/three';",'');
  const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
   moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,noEmit:true,types:[]};
  const host=ts.createCompilerHost(options),readSource=host.getSourceFile.bind(host);
  host.getSourceFile=(fileName,languageVersion,onError,shouldCreateNewSourceFile)=>fileName.replaceAll('\\','/')===filename.replaceAll('\\','/')
   ? ts.createSourceFile(fileName,source,languageVersion,true)
   : readSource(fileName,languageVersion,onError,shouldCreateNewSourceFile);
  const program=ts.createProgram([filename],options,host);
  const diagnostics=ts.getPreEmitDiagnostics(program).map(diagnostic=>
   ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n'));
  expect(diagnostics).toEqual([]);
 });

 it('gives the presentation topic its usage boundary without unrelated movement recipes',()=>{
  const selected=guideTopic(guide,'presentation');
  expect(selected).toContain('world.createPresentation()');
  expect(selected).toContain("clock:'presented'");
  expect(selected).toContain('resolveSourceFrame');
  expect(selected).toContain('tracking of generated geometry');
  expect(selected).not.toContain("world.registerMovement({id:'hover'");
 });
});
