import type {World} from '@worldkit/three';
import {mountLocalWorldUi} from '@worldkit/world-ui/local';
import {createWorldUiRuntime,type WorldUiModule} from '@worldkit/world-ui/react';
import {compileStateSchema,requireValid,type UiBundleManifest,type UiCatalog,type UiDocument,type JsonSchema,type UiState,type JsonValue} from '@worldkit/world-ui/schema';

type Binding={world:World;readUiState:()=>UiState;actions:Record<string,(params:Record<string,JsonValue>)=>unknown>};
export async function startLocalPreview(base:URL):Promise<void>{
  let cancelled=false;const cancel=()=>{cancelled=true;};window.addEventListener('pagehide',cancel,{once:true});
  const {manifest,catalog,document,stateSchema,factory}=await loadUiBundle(base);
  const deadline=performance.now()+30000;
  let binding:Binding|undefined;
  while(!(binding=(window as unknown as {__WORLDKIT_STREAM_WORLD__?:Binding}).__WORLDKIT_STREAM_WORLD__)){
    if(cancelled)return;if(performance.now()>deadline)throw new Error('UI_PREVIEW_WORLD_BINDING_TIMEOUT');
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  if(cancelled)return;
  const {world}=binding,readState=binding.readUiState,actions=binding.actions;
  const presentation=world.createPresentation(),element=window.document.createElement('div');
  element.dataset.worldUiLocal='';element.style.cssText='position:absolute;inset:0;pointer-events:none';
  const unmount=presentation.ui.mount(element);
  const validators=Object.fromEntries(Object.entries(catalog.actions).map(([name,action])=>[name,compileStateSchema(action.paramsSchema)]));
  const ui=mountLocalWorldUi({container:element,document,catalog,stateSchema,initialState:readState(),
    module:factory.createWorldUiModule(createWorldUiRuntime(new URL(manifest.module.path,base).href)),
    styles:manifest.styles.map(style=>new URL(style.path,base).href),
    onAction:(name,params)=>{
      const action=actions[name],validate=validators[name];if(!action||!validate){console.error('UI_ACTION_UNKNOWN',name);return;}
      try{requireValid(validate,params,'UI_ACTION_PARAMS');Promise.resolve(action(params)).then(refresh).catch(report);}catch(error){report(error);}
    },
  });
  let epoch=presentation.status().epoch;
  const refresh=()=>{
    const state=readState(),nextEpoch=presentation.status().epoch;
    // SDK reset renders once before onReset notifications; the presentation
    // epoch already changed, so discard old animation time before that frame.
    if(epoch!==nextEpoch){epoch=nextEpoch;ui.reset(state);}
    ui.present(state,Math.max(0,Math.round(world.snapshot().simulationSeconds*1000000)));
  };
  const report=(error:unknown)=>console.error('UI_PREVIEW_ERROR',error);
  const render=world.onRender(refresh),reset=world.onReset(refresh);
  let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;render();reset();offDispose();window.removeEventListener('pagehide',dispose);window.removeEventListener('pagehide',cancel);ui.dispose();unmount();presentation.dispose();};
  const offDispose=world.onDispose(dispose);window.addEventListener('pagehide',dispose,{once:true});
  refresh();presentation.focus();
}
type ReturnTypeFactory=(runtime:ReturnType<typeof createWorldUiRuntime>)=>WorldUiModule;

async function loadUiBundle(base:URL){
  const read=async<T>(file:string):Promise<T>=>{const response=await fetch(new URL(file,base));if(!response.ok)throw new Error(`UI_PREVIEW_FETCH_${response.status}`);return response.json();};
  const manifest=await read<UiBundleManifest>('manifest.json');
  const [catalog,document,stateSchema,factory]=await Promise.all([
    read<UiCatalog>(manifest.catalog.path),read<UiDocument>(manifest.definition.path),read<JsonSchema>(manifest.stateSchema.path),
    import(/* @vite-ignore */ new URL(manifest.module.path,base).href) as Promise<{createWorldUiModule:ReturnTypeFactory}>,
  ]);
  return {manifest,catalog,document,stateSchema,factory};
}

/** An observational still: freeze pixels and state together, never acquire input/presentation. */
export async function prepareUiPreviewCapture(base:URL,view:'opening'|'current'){
  const {manifest,catalog,document:definition,stateSchema,factory}=await loadUiBundle(base);
  const binding=(window as unknown as {__WORLDKIT_STREAM_WORLD__?:Binding}).__WORLDKIT_STREAM_WORLD__;
  if(!binding)throw new Error('UI_PREVIEW_WORLD_BINDING_MISSING');
  // All three reads are synchronous; asynchronous font/image/layout work happens afterward.
  const result=window.__THREE_CREATOR_HOST__!.capture(view);
  const state=structuredClone(binding.readUiState());
  const snapshot=binding.world.snapshot();
  const sample={simulationTick:snapshot.simulationTick,simulationSeconds:snapshot.simulationSeconds};
  const rect=window.__WORLDKIT_EVAL__!.renderer.domElement.getBoundingClientRect();
  if(rect.width<=0||rect.height<=0)throw new Error('UI_PREVIEW_CANVAS_NOT_VISIBLE');
  const element=window.document.createElement('div');element.dataset.worldUiCapture='';
  element.style.cssText=`all:initial;position:fixed;left:0;top:0;width:${rect.width}px;height:${rect.height}px;z-index:2147483647;pointer-events:none;overflow:hidden;isolation:isolate`;
  const shadow=element.attachShadow({mode:'open'}),image=window.document.createElement('img'),overlay=window.document.createElement('div');
  image.style.cssText='position:absolute;inset:0;width:100%;height:100%';image.src=result.image;
  overlay.style.cssText='position:absolute;inset:0;pointer-events:none';shadow.append(image,overlay);window.document.body.append(element);
  let ui:ReturnType<typeof mountLocalWorldUi>|undefined;
  let renderError:unknown;
  const onError=(event:ErrorEvent)=>{renderError=event.error??new Error(event.message);};
  window.addEventListener('error',onError);
  const dispose=()=>{window.removeEventListener('error',onError);try{ui?.dispose();}finally{element.remove();}};
  try{
    ui=mountLocalWorldUi({container:overlay,document:definition,catalog,stateSchema,initialState:state,
      module:factory.createWorldUiModule(createWorldUiRuntime(new URL(manifest.module.path,base).href)),
      styles:manifest.styles.map(style=>new URL(style.path,base).href),onAction:()=>{},
    });
    ui.present(state,Math.max(0,Math.round(sample.simulationSeconds*1000000)));
    const stylesReady=Promise.all([...overlay.shadowRoot!.querySelectorAll<HTMLLinkElement>('link')].map(link=>link.sheet?Promise.resolve():new Promise<void>((resolve,reject)=>{
      link.onload=()=>resolve();link.onerror=()=>reject(new Error('UI_PREVIEW_STYLESHEET_FAILED'));
    })));
    await Promise.all([image.decode(),stylesReady]);
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    await window.document.fonts.ready;
    await Promise.all([...overlay.shadowRoot!.querySelectorAll('img')].map(image=>image.decode()));
    if(renderError)throw renderError;
    return {result:{...result,image:undefined,ui:{included:true,sample,animation:'state-snapshot'}},element,dispose};
  }catch(error){dispose();throw error;}
}
