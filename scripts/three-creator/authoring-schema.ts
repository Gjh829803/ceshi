import ts from 'typescript';

export const AUTHORING_TOPICS = ['getting-started', 'assets', 'control', 'extensions', 'humanoid', 'character-actions', 'mounted-interaction', 'nonhuman-subject', 'presentation', 'observation', 'all'] as const;
export type AuthoringTopic = typeof AUTHORING_TOPICS[number];
export const COMMON_OBSERVATION = `import type * as THREE from 'three';
export interface WorldObservation {
 readonly ready:boolean;
 readonly scene:THREE.Scene;
 readonly camera:THREE.Camera;
 readonly renderer:THREE.WebGLRenderer;
 readonly controlledObject:THREE.Object3D;
 readonly targets:Readonly<Record<string,THREE.Object3D>>;
 readonly targetFrontYawRadiansById?:Readonly<Record<string,number>>;
 startLive():void|Promise<void>;
 stopLive():void|Promise<void>;
 reset():void|Promise<void>;
}`;
const worldMembers: Record<Exclude<AuthoringTopic, 'all'|'observation'>, string[]> = {
 'getting-started': ['scene','camera','cameraMode','getKeyBindings','setKeyBindings','assets','createPresentation','addEntity','addCharacter','setControlledEntity','setCameraFollow','setCameraPerspective','useAuthoredCamera','setCaptureTargets','onUpdate','onReset','onDispose','getEntityState','start','stop','reset','dispose'],
 'nonhuman-subject': ['scene','camera','assets','getKeyBindings','setKeyBindings','createPresentation','addEntity','addCharacter','registerMovement','setControlledEntity','setCameraFollow','setCameraPerspective','setCaptureTargets','onUpdate','onReset','onDispose','getEntityState','describe','snapshot','start','stop','reset','dispose'],
 assets: ['assets','addCharacter','registerPrototype','runTask','start'],
 control: ['getKeyBindings','setKeyBindings','state','operations','defineParameter','registerAction','setAutonomy','onInteract','execute','runTask','describe','snapshot','getEntityState'],
 extensions: ['state','registerMovement','registerGeometry','replaceGeometry','defineParameter','registerAction','execute','runTask','describe','getEntityState','onUpdate','onReset','onDispose'],
 presentation: ['shadowSettings','configureShadowLight','createPresentation','state','execute','getEntityState','reset'],
 humanoid:['humanoid','assets','execute','snapshot','describe','createPresentation','setCaptureTargets','start','stop','reset'],
 'mounted-interaction':['humanoid','assets','execute','snapshot','setCaptureTargets','start','stop','reset'],
 'character-actions':['humanoid','assets','execute','operations','snapshot','getEntityState','createPresentation','setCaptureTargets','start','stop','reset'],
};
/** Select declarations and their referenced public types from the real source AST. */
export function publicContractTopic(source: string, topic: AuthoringTopic, options:{includeHostFactory?:boolean}={}): string {
 if (topic === 'all') return source;
 const file = ts.createSourceFile('contracts.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
 const declarations = new Map<string, ts.InterfaceDeclaration|ts.TypeAliasDeclaration>();
 for (const statement of file.statements) if ((ts.isInterfaceDeclaration(statement)||ts.isTypeAliasDeclaration(statement))) declarations.set(statement.name.text,statement);
 const required = new Set<string>(), texts = new Map<string,string>();
 const visit = (node: ts.Node) => { if (ts.isIdentifier(node) && declarations.has(node.text)) add(node.text); ts.forEachChild(node,visit); };
 const add = (name: string) => {
  if (required.has(name)) return; required.add(name);
  const declaration=declarations.get(name); if (!declaration) throw new Error(`THREE_PUBLIC_TYPE_MISSING: ${name}`);
  if (name==='World' && topic!=='observation' && ts.isInterfaceDeclaration(declaration)) {
   const wanted=worldMembers[topic];
   const members=declaration.members.filter(member=>member.name && wanted.includes(member.name.getText(file)));
   texts.set(name, `export interface World {\n${members.map(member=>member.getText(file)).join('\n')}\n}`);
   members.forEach(visit);
  } else { texts.set(name,declaration.getText(file)); ts.forEachChild(declaration,visit); }
 };
 add(topic==='observation'?'WorldObservation':'World');
 const ordered=[...declarations.keys()].filter(name=>required.has(name)).map(name=>texts.get(name));
 return `import type * as THREE from 'three';\n${ordered.join('\n').replace(/import\('\.\/humanoid-runtime\/[^']+'\)/g,"import('@worldkit/three').humanoid")}\n${['getting-started','nonhuman-subject'].includes(topic)&&options.includeHostFactory!==false?"export declare function createWorld(options?:import('@worldkit/three').WorldOptions):Promise<import('@worldkit/three').ThreeWorld>;":''}`;
}
export function guideTopic(markdown: string, topic: AuthoringTopic): string {
 if (topic==='all') return markdown;
 const sections=markdown.split(/<!-- topic:([a-z-]+) -->/);
 let selected=topic==='getting-started'?sections[0]??'':'';
 for(let i=1;i<sections.length;i+=2) if(sections[i]===topic) selected+=sections[i+1]??'';
 return selected.trim();
}

const declarationPrinter=ts.createPrinter({removeComments:false});
function sourceChecker(file:ts.SourceFile):ts.TypeChecker {
 const options:ts.CompilerOptions={target:ts.ScriptTarget.Latest,noResolve:true,types:[]};
 const host=ts.createCompilerHost(options),getSourceFile=host.getSourceFile.bind(host);
 host.getSourceFile=(fileName,languageVersion,onError,shouldCreateNewSourceFile)=>fileName===file.fileName
  ? file:getSourceFile(fileName,languageVersion,onError,shouldCreateNewSourceFile);
 return ts.createProgram([file.fileName],options,host).getTypeChecker();
}
function staticInitializerType(initializer:ts.Expression):ts.TypeNode|undefined {
 if(ts.isNumericLiteral(initializer)||(ts.isPrefixUnaryExpression(initializer)&&ts.isNumericLiteral(initializer.operand)&&
  [ts.SyntaxKind.PlusToken,ts.SyntaxKind.MinusToken,ts.SyntaxKind.TildeToken].includes(initializer.operator)))
  return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
 if(ts.isStringLiteralLike(initializer))return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
 if(initializer.kind===ts.SyntaxKind.TrueKeyword||initializer.kind===ts.SyntaxKind.FalseKeyword)
  return ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
 return undefined;
}
function declarationParameters(parameters:ts.NodeArray<ts.ParameterDeclaration>,checker:()=>ts.TypeChecker):ts.ParameterDeclaration[]{
 return parameters.map((parameter,index)=>{
  let type=parameter.type;
  if(parameter.initializer&&!type){
   type=staticInitializerType(parameter.initializer);
   const inferred=type?undefined:checker().getTypeAtLocation(parameter);
   if(inferred&&(inferred.flags&(ts.TypeFlags.Any|ts.TypeFlags.Unknown)))throw new Error(`THREE_PUBLIC_PARAMETER_TYPE_UNRESOLVED: ${parameter.name.getText()}`);
   type??=inferred&&checker().typeToTypeNode(inferred,undefined,ts.NodeBuilderFlags.NoTruncation);
   if(!type)throw new Error(`THREE_PUBLIC_PARAMETER_TYPE_UNRESOLVED: ${parameter.name.getText()}`);
  }
  const followedByRequired=parameters.slice(index+1).some(next=>!next.questionToken&&!next.initializer&&!next.dotDotDotToken);
  const optional=parameter.questionToken??(parameter.initializer&&!followedByRequired?ts.factory.createToken(ts.SyntaxKind.QuestionToken):undefined);
  if(parameter.initializer&&followedByRequired&&type&&!ts.isUnionTypeNode(type))type=ts.factory.createUnionTypeNode([type,ts.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword)]);
  else if(parameter.initializer&&followedByRequired&&type&&ts.isUnionTypeNode(type)&&!type.types.some(member=>member.kind===ts.SyntaxKind.UndefinedKeyword))
   type=ts.factory.createUnionTypeNode([...type.types,ts.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword)]);
  return ts.factory.updateParameterDeclaration(parameter,parameter.modifiers,parameter.dotDotDotToken,parameter.name,optional,type,undefined);
 });
}
function methodDeclaration(method:ts.MethodDeclaration,file:ts.SourceFile,checker:()=>ts.TypeChecker):string {
 return declarationPrinter.printNode(ts.EmitHint.Unspecified,ts.factory.createMethodSignature(undefined,method.name,
  method.questionToken,method.typeParameters,declarationParameters(method.parameters,checker),method.type),file);
}
function methodDeclarationOrUnavailable(method:ts.MethodDeclaration,file:ts.SourceFile,checker:()=>ts.TypeChecker,owner:string):string {
 try{return methodDeclaration(method,file,checker);}catch(error){
  if(!(error instanceof Error)||!error.message.startsWith('THREE_PUBLIC_PARAMETER_TYPE_UNRESOLVED:'))throw error;
  return `/** Declaration unavailable for ${method.name.getText(file)}: a default parameter type could not be resolved statically at ${owner}.${method.name.getText(file)} in this source excerpt; consult the workspace source. */`;
 }
}
function publicMethods(members:ts.NodeArray<ts.ClassElement>,allowed?:ReadonlySet<string>):ts.MethodDeclaration[]{
 const methods=members.filter((member):member is ts.MethodDeclaration=>ts.isMethodDeclaration(member)&&
  (!allowed||allowed.has(member.name.getText()))&&
  !(ts.canHaveModifiers(member)?ts.getModifiers(member):undefined)?.some(modifier=>
   modifier.kind===ts.SyntaxKind.PrivateKeyword||modifier.kind===ts.SyntaxKind.ProtectedKeyword));
 const overloaded=new Set(methods.filter(method=>!method.body).map(method=>method.name.getText()));
 return methods.filter(method=>!method.body||!overloaded.has(method.name.getText()));
}

/** Extract the public shapes, not the runtime implementation or bundled datasets. */
export function runtimeContractSource(source:string):string {
 const file=ts.createSourceFile('humanoid.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 let resolvedChecker:ts.TypeChecker|undefined;const checker=()=>resolvedChecker??=sourceChecker(file);
 const declarations=file.statements.filter(statement=>(ts.isInterfaceDeclaration(statement)||ts.isTypeAliasDeclaration(statement))&&statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).map(node=>node.getText(file));
 for(const node of file.statements)if(ts.isFunctionDeclaration(node)&&node.name?.text==='createRoadVehicleSpec'){
  declarations.push(declarationPrinter.printNode(ts.EmitHint.Unspecified,ts.factory.updateFunctionDeclaration(node,
   [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
   node.asteriskToken,node.name,node.typeParameters,node.parameters,node.type,undefined),file));
 }
 const runtime=file.statements.find((node):node is ts.ClassDeclaration=>ts.isClassDeclaration(node)&&node.name?.text==='HumanoidRuntime');
 if(runtime){const allowed=new Set(['characterCapabilities','snapshot','prepare','approach','enter','exit','interact','prepareCharacter','switchMap','setCameraMode','setInput','clearInput','applyProfile','exportProfile','inspectConfiguration','inspectBoarding','inspectControls','inputGuide','onVisualUpdate']);
  const signatures=publicMethods(runtime.members,allowed).map(method=>methodDeclarationOrUnavailable(method,file,checker,'HumanoidRuntime'));
  declarations.push(`export interface HumanoidRuntime {\n${signatures.join('\n')}\n}`);}
 const horse=file.statements.find((node):node is ts.ClassDeclaration=>ts.isClassDeclaration(node)&&node.name?.text==='HorseVisual');
 if(horse){const methods=new Set(publicMethods(horse.members));const members=horse.members.filter(member=>!(ts.canHaveModifiers(member)?ts.getModifiers(member):undefined)?.some(m=>m.kind===ts.SyntaxKind.PrivateKeyword||m.kind===ts.SyntaxKind.ProtectedKeyword));
  const signatures=members.map(member=>{
   if(ts.isPropertyDeclaration(member))return `${member.modifiers?.some(m=>m.kind===ts.SyntaxKind.ReadonlyKeyword)?'readonly ':''}${member.name.getText(file)}: ${member.type?.getText(file)};`;
   if(ts.isGetAccessorDeclaration(member))return `get ${member.name.getText(file)}(): ${member.type?.getText(file)};`;
   if(ts.isMethodDeclaration(member))return methods.has(member)?methodDeclarationOrUnavailable(member,file,checker,'HorseVisual'):'';
   if(ts.isConstructorDeclaration(member))try {
    if(member.parameters.some(parameter=>parameter.modifiers?.some(modifier=>[
     ts.SyntaxKind.PublicKeyword,ts.SyntaxKind.PrivateKeyword,ts.SyntaxKind.ProtectedKeyword,ts.SyntaxKind.ReadonlyKeyword,ts.SyntaxKind.OverrideKeyword,
    ].includes(modifier.kind))))return '/** Declaration unavailable for constructor: parameter properties require their public property shape at HorseVisual.constructor in this source excerpt; consult the workspace source. */';
    const parameters=declarationParameters(member.parameters,checker).map(parameter=>ts.factory.updateParameterDeclaration(parameter,
     undefined,parameter.dotDotDotToken,parameter.name,parameter.questionToken,parameter.type,undefined));
    return declarationPrinter.printNode(ts.EmitHint.Unspecified,ts.factory.createConstructorDeclaration(undefined,parameters,undefined),file);
   } catch(error) {
    if(!(error instanceof Error)||!error.message.startsWith('THREE_PUBLIC_PARAMETER_TYPE_UNRESOLVED:'))throw error;
    return '/** Declaration unavailable for constructor: a default parameter type could not be resolved statically at HorseVisual.constructor in this source excerpt; consult the workspace source. */';
   }
   return declarationPrinter.printNode(ts.EmitHint.Unspecified,member,file);
  }).filter(Boolean);declarations.push(`export declare class HorseVisual {\n${signatures.join('\n')}\n}`);}
 return declarations.join('\n');
}

/** The factory shape follows its implementation; aliases point at public SDK types. */
export function humanoidFactoryContractSource(source:string):string {
 const file=ts.createSourceFile('humanoid.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 let resolvedChecker:ts.TypeChecker|undefined;const checker=()=>resolvedChecker??=sourceChecker(file);
 const factory=file.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='createHumanoidWorld');
 if(!factory?.body)throw new Error('THREE_HUMANOID_FACTORY_MISSING');
 let signature:string;
 try {signature=declarationPrinter.printNode(ts.EmitHint.Unspecified,ts.factory.createFunctionDeclaration(
   [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
   factory.asteriskToken,factory.name,factory.typeParameters,declarationParameters(factory.parameters,checker),factory.type,undefined),file);
 } catch(error) {
  if(!(error instanceof Error)||!error.message.startsWith('THREE_PUBLIC_PARAMETER_TYPE_UNRESOLVED:'))throw error;
  signature='/** Declaration unavailable for createHumanoidWorld: a default parameter type could not be resolved statically at createHumanoidWorld in this source excerpt; consult the workspace source. */';
 }
 return `import type {WorldOptions,ThreeWorld,EnvironmentDefinition,HumanoidCharacter,humanoid} from '@worldkit/three';
type Character=HumanoidCharacter;
type HumanoidProfile=humanoid.HumanoidProfile;
type VehicleInstance=humanoid.VehicleInstance;
type AssetDefinition=NonNullable<WorldOptions['assetDefinitions']>[string];
${runtimeContractSource(source)}
${signature}`;
}
