import {validateUiLayout,type UiLayout,type UiLayoutReference} from './layout.js';
export {validateUiLayout,validateUiInsets,resolveUiLayout,type UiLayout,type UiInsets,type UiLayoutReference,type UiLength,type UiSize,type ResolvedUiLayout} from './layout.js';
import Ajv, { type ValidateFunction } from 'ajv';

export type JsonValue = null | boolean | number | string | JsonValue[] | {[key:string]:JsonValue};
export type UiState = Record<string, JsonValue>;
export type JsonSchema = Record<string, unknown>;
export type Easing = 'linear' | 'easeOut';
export interface ComponentDefinition {
  description?:string;
  propsSchema:JsonSchema;
  bindableProps:string[];
  animatableProps:Record<string,{presentationProperty:string;fallbackProp:string;interpolation:'number'}>;
  slots:string[];
  events:string[];
}
export interface UiCatalog {
  schemaVersion:1;catalogId:string;
  components:Record<string,ComponentDefinition>;
  actions:Record<string,{paramsSchema:JsonSchema;description?:string}>;
}
export interface UiElement {
  type:string;props:Record<string,JsonValue>;children:string[];
  layout?:UiLayout;
  layoutReference?:UiLayoutReference;
  visible?:boolean|{$state:string};
  on?:Record<string,{action:string;params?:Record<string,JsonValue>}>;
}
export interface UiDocument {
  schemaVersion:1;catalogId:string;designViewport:{width:number;height:number};
  spec:{root:string;elements:Record<string,UiElement>};
  transitions:Record<string,Record<string,{targetProperty:string;durationMs:number;easing:Easing;interrupt:'from-current'}>>;
}
export interface AnimationTrack {
  animationId:string;nodeInstanceId:string;property:string;startSourceTimeUs:number;durationUs:number;
  from:number;to:number;easing:Easing;fill:'forwards';
}
export interface UiSnapshot {
  revision:number;effectiveSourceTimeUs:number;completeThroughUs:number;
  state:UiState;activeAnimations:AnimationTrack[];
}
export interface UiPatch {op:'add'|'replace'|'remove';path:string;value?:JsonValue}
export interface UiCommit {
  baseRevision:number;revision:number;effectiveSourceTimeUs:number;statePatch:UiPatch[];
  animationOps:({op:'replace';track:AnimationTrack}|{op:'cancel';nodeInstanceId:string;property:string})[];
}
export interface UiBundleManifest {
  kind:'worldkit-ui-bundle';schemaVersion:1;runtimeAbiVersion:'world-ui-web/1';
  catalog:{path:string;sha256:string};definition:{path:string;sha256:string};stateSchema:{path:string;sha256:string};
  module:{path:string;sha256:string};styles:{path:string;sha256:string}[];assets:{path:string;sha256:string}[];
}
const ajv=new Ajv({allErrors:true,strict:true});
const forbidden=new Set(['__proto__','prototype','constructor']);
export function assertJson(value:unknown,depth=0):asserts value is JsonValue {
  if(depth>32)throw new Error('UI_JSON_DEPTH');
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'&&Number.isFinite(value))return;
  if(Array.isArray(value)){for(const v of value)assertJson(v,depth+1);return;}
  if(typeof value==='object'&&value&&[Object.prototype,null].includes(Object.getPrototypeOf(value))){
    for(const [key,v] of Object.entries(value)){if(forbidden.has(key))throw new Error('UI_UNSAFE_KEY');assertJson(v,depth+1);}return;
  }
  throw new Error('UI_JSON_INVALID');
}
export function clone<T>(value:T):T {assertJson(value);return structuredClone(value);}
export function pointerParts(path:string):string[] {
  if(path==='')return [];
  if(!path.startsWith('/')||/~(?:[^01]|$)/.test(path))throw new Error('UI_POINTER_INVALID');
  const parts=path.slice(1).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'));
  if(parts.some(p=>forbidden.has(p)))throw new Error('UI_UNSAFE_PATH');return parts;
}
export function readPath(root:unknown,path:string):unknown {
  let value=root;for(const key of pointerParts(path)){if(value===null||typeof value!=='object'||!Object.hasOwn(value,key))return undefined;value=(value as Record<string,unknown>)[key];}return value;
}
export function resolveValue(value:JsonValue,state:UiState):JsonValue {
  if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,'$state')){
    if(Object.keys(value).length!==1||typeof value.$state!=='string')throw new Error('UI_BINDING_INVALID');
    const resolved=readPath(state,value.$state);assertJson(resolved);return resolved;
  }
  if(Array.isArray(value))return value.map(v=>resolveValue(v,state));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveValue(v,state)]));
  return value;
}
export function compileStateSchema(schema:JsonSchema):ValidateFunction {
  assertJson(schema);return ajv.compile(schema);
}
export function requireValid(check:ValidateFunction,value:unknown,label:string):void {
  if(!check(value))throw new Error(`${label}: ${ajv.errorsText(check.errors,{separator:'; '})}`);
}
export const BUILTIN_COMPONENTS:Record<string,ComponentDefinition>={
  HudLayer:{propsSchema:{type:'object',additionalProperties:false,properties:{}},bindableProps:[],animatableProps:{},slots:['default'],events:[]},
  Text:{propsSchema:{type:'object',additionalProperties:false,required:['text'],properties:{text:{type:'string'}}},bindableProps:['text'],animatableProps:{},slots:[],events:[]},
};
export function validateCatalog(catalog:UiCatalog):void {
  assertJson(catalog);
  if(catalog.schemaVersion!==1||!catalog.catalogId||!catalog.components||!catalog.actions)throw new Error('UI_CATALOG_INVALID');
  for(const [name,c] of Object.entries(catalog.components)){
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)||Object.hasOwn(BUILTIN_COMPONENTS,name))throw new Error(`UI_COMPONENT_NAME: ${name}`);
    if(c.propsSchema.type!=='object'||!Array.isArray(c.bindableProps)||!Array.isArray(c.slots)||!Array.isArray(c.events)||!c.animatableProps)throw new Error(`UI_COMPONENT_SCHEMA: ${name}`);
    compileStateSchema(c.propsSchema);
    const properties=c.propsSchema.properties as Record<string,JsonSchema>|undefined;
    for(const p of c.bindableProps)if(!properties?.[p])throw new Error(`UI_BINDABLE_PROP: ${name}.${p}`);
    for(const [p,a] of Object.entries(c.animatableProps))if(!c.bindableProps.includes(p)||a.interpolation!=='number'||properties?.[p]?.type!=='number'||properties?.[a.fallbackProp]?.type!=='number'||!a.presentationProperty)throw new Error(`UI_ANIMATABLE_PROP: ${name}.${p}`);
  }
  for(const action of Object.values(catalog.actions))compileStateSchema(action.paramsSchema);
}
export function validateDocument(document:UiDocument,catalog:UiCatalog,state?:UiState):void {
  assertJson(document);validateCatalog(catalog);
  if(document.schemaVersion!==1||document.catalogId!==catalog.catalogId||!document.spec?.elements?.[document.spec.root]||!document.transitions||
    ![document.designViewport?.width,document.designViewport?.height].every(v=>Number.isFinite(v)&&v>0&&v<=8192))throw new Error('UI_DOCUMENT_INVALID');
  const components={...BUILTIN_COMPONENTS,...catalog.components};
  const visited=new Set<string>(),visiting=new Set<string>();
  const visit=(id:string,parent?:string)=>{if(visiting.has(id))throw new Error('UI_TREE_CYCLE');if(visited.has(id))throw new Error('UI_NODE_MULTIPLE_PARENTS');
    const node=document.spec.elements[id],def=node&&components[node.type];
    if(!node||!def||!Array.isArray(node.children)||!node.props)throw new Error(`UI_NODE_INVALID: ${id}`);
    if(Object.keys(node).some(k=>!['type','props','children','visible','on','layout','layoutReference'].includes(k)))throw new Error(`UI_NODE_UNSUPPORTED_FIELD: ${id}`);
    if(node.layoutReference!==undefined&&(!['safe-area','viewport'].includes(node.layoutReference)||node.layout===undefined))throw new Error(`UI_LAYOUT_REFERENCE_INVALID: ${id}`);
    if(node.layout!==undefined){
      try{validateUiLayout(node.layout);}catch(error){throw new Error(`UI_LAYOUT: ${id}: ${error instanceof Error?error.message:String(error)}`);}
      if(node.type==='HudLayer'||(parent!==undefined&&(parent!==document.spec.root||document.spec.elements[parent]?.type!=='HudLayer')))throw new Error(`UI_LAYOUT_REQUIRES_HUD_ROOT: ${id}`);
    }
    if(Object.hasOwn(node.props,'__worldNodeInstanceId'))throw new Error('UI_RESERVED_PROP');
    if(node.children.length&&!def.slots.includes('default'))throw new Error(`UI_CHILDREN_NOT_SUPPORTED: ${id}`);
    for(const [p,v] of Object.entries(node.props))if(v&&typeof v==='object'&&!Array.isArray(v)&&'$state' in v){if(!def.bindableProps.includes(p))throw new Error(`UI_PROP_NOT_BINDABLE: ${id}.${p}`);pointerParts(String(v.$state));}
    if(state)requireValid(compileStateSchema(def.propsSchema),resolveValue(node.props,state),`UI_PROPS: ${id}`);
    for(const [event,binding]of Object.entries(node.on??{}))if(!def.events.includes(event)||!catalog.actions[binding.action])throw new Error(`UI_EVENT_INVALID: ${id}.${event}`);
    visiting.add(id);for(const child of node.children)visit(child,id);visiting.delete(id);visited.add(id);
  };visit(document.spec.root);
  if(visited.size!==Object.keys(document.spec.elements).length)throw new Error('UI_ORPHAN_NODE');
  for(const [id,transitions]of Object.entries(document.transitions))for(const [p,t]of Object.entries(transitions)){
    const node=document.spec.elements[id],a=node&&components[node.type]?.animatableProps[p];
    if(!a||a.presentationProperty!==t.targetProperty||t.interrupt!=='from-current'||!['linear','easeOut'].includes(t.easing)||!Number.isFinite(t.durationMs)||t.durationMs<0||t.durationMs>60_000)throw new Error(`UI_TRANSITION_INVALID: ${id}.${p}`);
  }
}
export function validateTrack(track:AnimationTrack):void {
  assertJson(track);
  if(!track.animationId||!track.nodeInstanceId||!track.property||!Number.isSafeInteger(track.startSourceTimeUs)||track.startSourceTimeUs<0||!Number.isSafeInteger(track.durationUs)||track.durationUs<0||track.durationUs>60_000_000||![track.from,track.to].every(Number.isFinite)||!['linear','easeOut'].includes(track.easing)||track.fill!=='forwards')throw new Error('UI_TRACK_INVALID');
}
export function trackKey(node:string,property:string):string{return JSON.stringify([node,property]);}
