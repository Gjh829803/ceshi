import {createHash} from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import type {RuntimeGuidance} from './runtime-guidance.js';

/** JSON only. Source hashes and the relative import graph invalidate stale derived data. */
export async function cameraConfiguration(guidance:RuntimeGuidance) {
 const unavailable=(reason:string)=>({status:'unavailable' as const,reason});
 let artifact:any;
 try { artifact=JSON.parse(await guidance.source('config/camera/discovery.generated.json')); }
 catch { return unavailable('artifact-missing-or-invalid'); }
 if(artifact?.schemaVersion!==1||artifact.entry!=='config/camera/index.ts'||!artifact.sources||!artifact.schema||!Array.isArray(artifact.fields))return unavailable('artifact-missing-or-invalid');
 const pending=[artifact.entry],visited=new Set<string>();
 while(pending.length){
  const name=pending.pop()!;if(visited.has(name))continue;visited.add(name);
  if(name.startsWith('../')||path.posix.normalize(name)!==name||name.includes('\\')||path.posix.isAbsolute(name)||!name.endsWith('.ts')||typeof artifact.sources[name]!=='string')return unavailable('source-closure-mismatch');
  let source:string;try{source=await guidance.source(name);}catch{return unavailable('source-mismatch');}
  if(createHash('sha256').update(source).digest('hex')!==artifact.sources[name])return unavailable('source-mismatch');
  const file=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true);
  let uncovered=false;
  const include=(specifier:string)=>{
   if(!specifier.startsWith('.'))return;
   const base=path.posix.normalize(path.posix.join(path.posix.dirname(name),specifier)).replace(/\.js$/,'');
   const dependency=[base,base+'.ts',base+'/index.ts'].find(candidate=>Object.hasOwn(artifact.sources,candidate));
   if(!dependency)uncovered=true;else pending.push(dependency);
  };
  const visit=(node:ts.Node):void=>{
   if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){
    // esbuild erases type-only edges; actual public declarations remain separately discoverable.
    const typeOnly=ts.isImportDeclaration(node)?node.importClause?.isTypeOnly:node.isTypeOnly;
    if(!typeOnly&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))include(node.moduleSpecifier.text);
   }
   if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')){
    const argument=node.arguments[0];
    if(argument&&ts.isStringLiteral(argument))include(argument.text);else uncovered=true;
   }
   ts.forEachChild(node,visit);
  };
  visit(file);if(uncovered)return unavailable('source-closure-mismatch');
 }
 // Verify all recorded sources, including modules erased by tree-shaking.
 for(const [name,hash] of Object.entries(artifact.sources)){
  if(name.startsWith('../')||path.posix.normalize(name)!==name||name.includes('\\')||path.posix.isAbsolute(name))return unavailable('source-closure-mismatch');
  try{if(createHash('sha256').update(await guidance.source(name)).digest('hex')!==hash)return unavailable('source-mismatch');}catch{return unavailable('source-mismatch');}
 }
 return {status:'available' as const,schema:artifact.schema,fields:artifact.fields,sourceInventory:artifact.sources};
}
export const CAMERA_CONTRACT_FILES=['config/camera/types.ts','config/camera/fields.ts','config/camera/serialization.ts','config/camera/humanoid.ts','config/camera/resolve.ts','camera/state.ts','camera/subject.ts'] as const;
