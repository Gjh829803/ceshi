import {readFile} from 'node:fs/promises';
import {sha256,type CreatorProfile} from './contracts.js';
import {type ExampleTopic} from './example-files.js';

export type BindingVariant='car'|'motorcycle'|'plane'|'flying-creature';
export const BINDING_EXAMPLE_TOPICS=['getting-started','character-actions','mounted-interaction','custom-vehicle','nonhuman-subject'] as const;
const sources = {'getting-started':'humanoid.ts','character-actions':'actions.ts',
  'mounted-interaction':'mount.ts','custom-vehicle':'vehicle.ts','nonhuman-subject':'nonhuman.ts'} as const;
export async function bindingExample(profile:CreatorProfile,topic:ExampleTopic='getting-started',files?:readonly string[],variant?:BindingVariant) {
  if(!BINDING_EXAMPLE_TOPICS.includes(topic as typeof BINDING_EXAMPLE_TOPICS[number]))throw new Error('THREE_EXAMPLE_TOPIC_UNKNOWN');
  if(variant!==undefined&&!((topic==='custom-vehicle'&&variant!=='flying-creature')||(topic==='mounted-interaction'&&variant==='flying-creature')))throw new Error('THREE_EXAMPLE_VARIANT_UNSUPPORTED');
  if(profile==='three-raw'&&topic!=='getting-started')throw new Error('THREE_SDK_EXAMPLE_UNSUPPORTED');
  const name=variant==='flying-creature'?'assets/animals/flying-mounts.ts':`examples/${profile==='three-raw'?'raw.ts':sources[topic as keyof typeof sources]}`;
  const source=await readFile(new URL(`./agent/${name}`,import.meta.url),'utf8');
  if(files?.some(file=>file!=='main.ts'))throw new Error('THREE_EXAMPLE_FILE_UNKNOWN');
  return {profile,topic,exampleKind:'binding-snippet',requiresAuthoredScene:true,
    source:`scripts/three-creator/agent/${name}`,
    ...(variant!==undefined||topic==='custom-vehicle'?{variant:variant??'motorcycle'}:{}),
    files:files?.length===0?{}:{'main.ts':source},
    fileManifest:[{path:'main.ts',byteLength:Buffer.byteLength(source),sha256:sha256(source),readable:true}],
    readHint:'Supply the values marked declare from your authored project, then use the shown SDK calls. Create the world once; asset snippets prepare bindings and action snippets use that existing world. This is a binding snippet, not a complete runnable world. Select assets through project.json; author the real input plan in episode.json.',
  };
}
