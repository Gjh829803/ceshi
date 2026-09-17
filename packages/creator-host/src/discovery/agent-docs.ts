import {readFileSync} from 'node:fs';

export const AGENT_DOCUMENT_PATHS = [
  'README.md','programming.md','ui.md','sdk.md','sdk/basics.md','assets/README.md',
  'assets/humans/README.md','assets/humans/movement.md','assets/humans/actions.md',
  'assets/humans/interactions.md','assets/humans/integration.md',
  'assets/animals/README.md','assets/animals/flying-mounts.md','assets/vehicles/README.md','assets/scene/README.md',
] as const;
export type AgentDocumentPath = typeof AGENT_DOCUMENT_PATHS[number];
const names = {quality:'README.md',programming:'programming.md','getting-started':'sdk.md',assets:'assets/README.md'} as const;
const children:Partial<Record<AgentDocumentPath,readonly AgentDocumentPath[]>>={
  'programming.md':['ui.md'],
  'sdk.md':['sdk/basics.md','assets/README.md'],
  'assets/README.md':['assets/humans/README.md','assets/animals/README.md','assets/vehicles/README.md','assets/scene/README.md'],
  'assets/animals/README.md':['assets/animals/flying-mounts.md'],
  'assets/humans/README.md':['assets/humans/movement.md','assets/humans/actions.md','assets/humans/interactions.md','assets/humans/integration.md'],
};
export function readAgentDocument(document:AgentDocumentPath):string {
  if(!AGENT_DOCUMENT_PATHS.includes(document))throw new Error('THREE_AGENT_DOCUMENT_UNKNOWN');
  return readFileSync(new URL(`../../docs/agent/${document}`,import.meta.url),'utf8');
}
export function agentDocument(topic:keyof typeof names):string {
  return readAgentDocument(names[topic]);
}
export function documentNavigation(document:AgentDocumentPath){
  const parent=(Object.entries(children).find(([,paths])=>paths?.includes(document))?.[0]??null) as AgentDocumentPath|null;
  const link=(file:AgentDocumentPath)=>({document:file,source:`packages/creator-host/docs/agent/${file}`,tool:'creator_get_authoring_schema',arguments:{document:file}});
  return {parent:parent?link(parent):null,children:(children[document]??[]).map(link)};
}
export function topicDocument(topic:string):AgentDocumentPath|undefined {
  return Object.hasOwn(names,topic)?names[topic as keyof typeof names]:undefined;
}
export const AGENT_READING_GUIDE = Object.entries(names).map(([topic,file])=>({
  topic,source:`packages/creator-host/docs/agent/${file}`,
  tool:'creator_get_authoring_schema',arguments:{topic,sections:['guide']},
}));
