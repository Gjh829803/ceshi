import ts from 'typescript';

export const AUTHORING_TOPICS = ['getting-started', 'assets', 'control', 'extensions', 'presentation', 'observation', 'all'] as const;
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
 'getting-started': ['scene','camera','cameraMode','assets','createPresentation','addEntity','addCharacter','setControlledEntity','setCameraFollow','useAuthoredCamera','setCaptureTargets','onUpdate','getEntityState','start','stop','reset','dispose'],
 assets: ['assets','addCharacter','registerPrototype','runTask','start'],
 control: ['state','operations','defineParameter','registerAction','setAutonomy','onInteract','execute','runTask','describe','snapshot','getEntityState'],
 extensions: ['state','registerMovement','registerGeometry','replaceGeometry','defineParameter','registerAction','execute','runTask','describe','getEntityState','onUpdate'],
 presentation: ['createPresentation','state','execute','getEntityState','reset'],
};
/** Select declarations and their referenced public types from the real source AST. */
export function publicContractTopic(source: string, topic: AuthoringTopic): string {
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
 return `import type * as THREE from 'three';\n${ordered.join('\n')}\n${topic==='getting-started'?'export declare function createWorld(options:{scene:THREE.Scene;camera:THREE.Camera;canvas?:HTMLCanvasElement;renderer?:THREE.WebGLRenderer}):Promise<World>;':''}`;
}
export function guideTopic(markdown: string, topic: AuthoringTopic): string {
 if (topic==='all') return markdown;
 const sections=markdown.split(/<!-- topic:([a-z-]+) -->/);
 let selected=sections[0]??'';
 for(let i=1;i<sections.length;i+=2) if(sections[i]===topic) selected+=sections[i+1]??'';
 return selected.trim();
}
