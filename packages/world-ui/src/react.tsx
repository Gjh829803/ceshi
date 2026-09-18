import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as Motion from 'motion/react';
import { Renderer, StateProvider, VisibilityProvider, ActionProvider, type ComponentRegistry,type StateStore,type Spec } from '@json-render/react';
import { evaluateAnimation } from './core.js';
import { readPath,clone,resolveValue,validateDocument,resolveUiLayout,validateUiInsets,type UiLayout,type UiLayoutReference,type UiInsets,type JsonValue,type UiCatalog,type UiDocument,type UiSnapshot } from './schema.js';

export interface WorldUiComponentContext<P=Record<string,JsonValue>,E extends string=string> {
  props:Readonly<P>;nodeInstanceId:string;children?:React.ReactNode;slots?:Record<string,React.ReactNode>;
  emit:(event:E)=>void;
}
export type WorldUiComponents=Record<string,React.ComponentType<WorldUiComponentContext>>;
export interface WorldUiModule {components:WorldUiComponents;dispose?:()=>void}
export interface WorldUiRuntime {
  assetBaseUrl:string;
  react:typeof React;jsxRuntime:typeof jsxRuntime;motion:typeof Motion;
  worldUi:{usePresentedMotionValue:typeof usePresentedMotionValue};
}
export function createWorldUiRuntime(assetBaseUrl:string):WorldUiRuntime{return {assetBaseUrl,react:React,jsxRuntime,motion:Motion,worldUi:{usePresentedMotionValue}};}

/** Presentation-only store; frame selection belongs to stream-player. */
export class PresentedUiStore {
  private snapshot:UiSnapshot={revision:0,effectiveSourceTimeUs:0,completeThroughUs:0,state:{},activeAnimations:[]};
  private timeUs=0;
  private readonly stateListeners=new Set<()=>void>();
  private readonly frameListeners=new Set<()=>void>();
  private initialized=false;
  readonly stateStore:StateStore={
    get:path=>readPath(this.snapshot.state,path),getSnapshot:()=>this.snapshot.state,
    set:()=>{throw new Error('WORLD_UI_STATE_READONLY');},update:()=>{throw new Error('WORLD_UI_STATE_READONLY');},
    subscribe:listener=>{this.stateListeners.add(listener);return()=>this.stateListeners.delete(listener);},
  };
  present(snapshot:UiSnapshot,sourceTimeUs:number):void {
    if(sourceTimeUs<snapshot.effectiveSourceTimeUs)throw new Error('WORLD_UI_FUTURE_SNAPSHOT');
    const changed=!this.initialized||snapshot.revision!==this.snapshot.revision;
    this.snapshot=changed?clone(snapshot):{...snapshot,state:this.snapshot.state};this.timeUs=sourceTimeUs;this.initialized=true;
    if(changed)for(const f of this.stateListeners)f();for(const f of this.frameListeners)f();
  }
  value(node:string,property:string,fallback:number):number {
    const track=this.snapshot.activeAnimations.find(t=>t.nodeInstanceId===node&&t.property===property&&t.startSourceTimeUs<=this.timeUs);
    return track?evaluateAnimation(track,this.timeUs):fallback;
  }
  subscribeFrame(listener:()=>void):()=>void{this.frameListeners.add(listener);return()=>{this.frameListeners.delete(listener);};}
  reset():void{this.initialized=false;}
  dispose():void{this.stateListeners.clear();this.frameListeners.clear();}
}
const Context=React.createContext<PresentedUiStore|null>(null);
export function usePresentedMotionValue(options:{nodeInstanceId:string;property:string;fallback:number}):Motion.MotionValue<number> {
  const store=React.useContext(Context);if(!store)throw new Error('WORLD_UI_PRESENTATION_REQUIRED');
  const latest=React.useRef(options);latest.current=options;
  const value=Motion.useMotionValue(store.value(options.nodeInstanceId,options.property,options.fallback));
  React.useLayoutEffect(()=>{
    const refresh=()=>{const o=latest.current;value.set(store.value(o.nodeInstanceId,o.property,o.fallback));};
    refresh();return store.subscribeFrame(refresh);
  },[store,value]);
  React.useLayoutEffect(()=>value.set(store.value(options.nodeInstanceId,options.property,options.fallback)),[store,value,options.nodeInstanceId,options.property,options.fallback]);
  return value;
}

interface LayoutViewport {width:number;height:number;safeArea:UiInsets}
const LayoutContext=React.createContext<LayoutViewport>({width:1280,height:720,safeArea:{}});
function LayoutNode({layout,reference,id,children}:{layout:UiLayout;reference?:UiLayoutReference|undefined;id:string;children:React.ReactNode}){
  const viewport=React.useContext(LayoutContext),resolved=resolveUiLayout(layout,viewport,viewport.safeArea,reference),box=resolved.referenceBox;
  return <div data-world-ui-layout-boundary={id} style={{position:'absolute',...box,zIndex:layout.zIndex??0,overflow:'hidden',pointerEvents:'none',...(box.width===0||box.height===0?{display:'none'}:{})}}>
    <div data-world-ui-node={id} style={{...resolved.style,boxSizing:'border-box',pointerEvents:'none'}}>{children}</div>
  </div>;
}

export function WorldUiRenderer({document,catalog,module,store,onAction,viewport,safeAreaInsets={}}:{
  document:UiDocument;catalog:UiCatalog;module:WorldUiModule;store:PresentedUiStore;
  viewport?:{width:number;height:number};safeAreaInsets?:UiInsets;
  onAction:(name:string,params:Record<string,JsonValue>)=>void;
}):React.ReactElement {
  validateUiInsets(safeAreaInsets);
  const layoutViewport={...(viewport??document.designViewport),safeArea:safeAreaInsets};
  const built=React.useMemo(()=>{
    validateDocument(document,catalog);
    const expected=Object.keys(catalog.components).sort(),actual=Object.keys(module.components).sort();
    if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error('UI_REGISTRY_CATALOG_MISMATCH');
    const components:WorldUiComponents={
      HudLayer:({children})=><div style={{position:'absolute',inset:0,pointerEvents:'none'}}>{children}</div>,
      Text:({props})=><span>{String(props.text??'')}</span>,...module.components,
    };
    const registry:ComponentRegistry={};
    for(const [name,Component]of Object.entries(components)){
      registry[name]=function WorldComponent({element,children,slots}){
        const {__worldNodeInstanceId,...props}=element.props as Record<string,JsonValue>;
        const nodeInstanceId=String(__worldNodeInstanceId);
        const emit=(event:string)=>{
          const binding=document.spec.elements[nodeInstanceId]?.on?.[event];if(!binding)return;
          const params=resolveValue(binding.params??{},store.stateStore.getSnapshot() as Record<string,JsonValue>);
          onAction(binding.action,params as Record<string,JsonValue>);
        };
        const content=<Component props={props} nodeInstanceId={nodeInstanceId} emit={emit} {...(slots?{slots}:{})}>{children}</Component>;
        const layout=document.spec.elements[nodeInstanceId]?.layout;
        return layout?<LayoutNode layout={layout} reference={document.spec.elements[nodeInstanceId]?.layoutReference} id={nodeInstanceId}>{content}</LayoutNode>:content;
      };
    }
    const spec=clone(document.spec);
    for(const [id,node]of Object.entries(spec.elements)){node.props.__worldNodeInstanceId=id;delete node.layout;delete node.layoutReference;}
    return {registry,spec:spec as Spec};
  },[document,catalog,module,store,onAction]);
  return <LayoutContext.Provider value={layoutViewport}><Context.Provider value={store}><StateProvider store={store.stateStore}><VisibilityProvider><ActionProvider handlers={{}}>
    <Renderer spec={built.spec} registry={built.registry}/>
  </ActionProvider></VisibilityProvider></StateProvider></Context.Provider></LayoutContext.Provider>;
}
