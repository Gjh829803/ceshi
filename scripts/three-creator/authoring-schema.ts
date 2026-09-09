import ts from 'typescript';

export const AUTHORING_TOPICS = ['getting-started', 'assets', 'control', 'extensions', 'training', 'character-actions', 'mounted-interaction', 'nonhuman-subject', 'presentation', 'observation', 'all'] as const;
export type AuthoringTopic = typeof AUTHORING_TOPICS[number];
export const COMMON_OBSERVATION = `import type * as THREE from 'three';
export interface WorldObservation {
 readonly ready:boolean;
 readonly scene:THREE.Scene;
 readonly camera:THREE.Camera;
 readonly renderer:THREE.WebGLRenderer;
 readonly player:THREE.Object3D;
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
 presentation: ['createPresentation','state','execute','getEntityState','reset'],
 training:['training','assets','execute','snapshot','describe','createPresentation','setCaptureTargets','start','stop','reset'],
 'mounted-interaction':['training','assets','execute','snapshot','setCaptureTargets','start','stop','reset'],
 'character-actions':['training','assets','execute','operations','snapshot','getEntityState','createPresentation','setCaptureTargets','start','stop','reset'],
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
 return `import type * as THREE from 'three';\n${ordered.join('\n').replace(/import\('\.\/training\/[^']+'\)/g,"import('@worldkit/three').training")}\n${['getting-started','nonhuman-subject'].includes(topic)&&options.includeHostFactory!==false?'export declare function createWorld(options:{scene:THREE.Scene;camera:THREE.Camera;canvas?:HTMLCanvasElement;renderer?:THREE.WebGLRenderer}):Promise<World>;':''}`;
}
export function guideTopic(markdown: string, topic: AuthoringTopic): string {
 if (topic==='all') return markdown;
 const sections=markdown.split(/<!-- topic:([a-z-]+) -->/);
 let selected=sections[0]??'';
 for(let i=1;i<sections.length;i+=2) if(sections[i]===topic) selected+=sections[i+1]??'';
 return selected.trim();
}

/** Extract the public shapes, not the runtime implementation or bundled datasets. */
export function trainingContractSource(source:string):string {
 const file=ts.createSourceFile('training.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const declarations=file.statements.filter(statement=>(ts.isInterfaceDeclaration(statement)||ts.isTypeAliasDeclaration(statement))&&statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).map(node=>node.getText(file));
 const runtime=file.statements.find((node):node is ts.ClassDeclaration=>ts.isClassDeclaration(node)&&node.name?.text==='TrainingRuntime');
 if(runtime){const allowed=new Set(['characterCapabilities','snapshot','prepare','approach','enter','exit','interact','prepareCharacter','switchMap','setCameraMode','setInput','clearInput','applyProfile','exportProfile','inspectConfiguration','onVisualUpdate']);
  const signatures=runtime.members.filter((member):member is ts.MethodDeclaration=>ts.isMethodDeclaration(member)&&allowed.has(member.name.getText(file))).map(method=>{
   const end=method.body?.pos??method.end;return source.slice(method.getStart(file),end).trim()+';';
  });declarations.push(`export interface TrainingRuntime {\n${signatures.join('\n')}\n}`);}
 const horse=file.statements.find((node):node is ts.ClassDeclaration=>ts.isClassDeclaration(node)&&node.name?.text==='TrainingHorse');
 if(horse){const printer=ts.createPrinter();const members=horse.members.filter(member=>!(ts.canHaveModifiers(member)?ts.getModifiers(member):undefined)?.some(m=>m.kind===ts.SyntaxKind.PrivateKeyword||m.kind===ts.SyntaxKind.ProtectedKeyword));
  const signatures=members.map(member=>{
   if(ts.isPropertyDeclaration(member))return `${member.modifiers?.some(m=>m.kind===ts.SyntaxKind.ReadonlyKeyword)?'readonly ':''}${member.name.getText(file)}: ${member.type?.getText(file)};`;
   if(ts.isGetAccessorDeclaration(member))return `get ${member.name.getText(file)}(): ${member.type?.getText(file)};`;
   if(ts.isMethodDeclaration(member)||ts.isConstructorDeclaration(member))return source.slice(member.getStart(file),member.body?.pos??member.end).trim()+';';
   return printer.printNode(ts.EmitHint.Unspecified,member,file);
  });declarations.push(`export declare class TrainingHorse {\n${signatures.join('\n')}\n}`);}
 return declarations.join('\n');
}

/** The factory shape follows its implementation; aliases point at public SDK types. */
export function humanoidContractSource(source:string):string {
 const file=ts.createSourceFile('humanoid.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const factory=file.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='createHumanoidWorld');
 if(!factory?.body)throw new Error('THREE_HUMANOID_FACTORY_MISSING');
 const signature=source.slice(factory.getStart(file),factory.body.pos).trim().replace('export async function','export declare function')+';';
 return `import type {WorldOptions,ThreeWorld,TrainingMap,TrainingCharacter,training} from '@worldkit/three';
type MapDefinition=TrainingMap;
type Character=TrainingCharacter;
type TrainingProfile=training.TrainingProfile;
type TrainingVehicleInstance=training.TrainingVehicleInstance;
type AssetDefinition=NonNullable<WorldOptions['assetDefinitions']>[string];
${trainingContractSource(source)}
${signature}`;
}
