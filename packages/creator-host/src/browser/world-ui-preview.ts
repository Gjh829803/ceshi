import type {World} from '@worldkit/three';
import {mountLocalWorldUi} from '@worldkit/world-ui/local';
import {createWorldUiRuntime,type WorldUiModule} from '@worldkit/world-ui/react';
import {compileStateSchema,requireValid,type UiBundleManifest,type UiCatalog,type UiDocument,type JsonSchema,type UiState,type JsonValue} from '@worldkit/world-ui/schema';

type Binding={world:World;readUiState:()=>UiState;actions:Record<string,(params:Record<string,JsonValue>)=>unknown>};
export async function startLocalPreview(base:URL):Promise<void>{
  let cancelled=false;const cancel=()=>{cancelled=true;};window.addEventListener('pagehide',cancel,{once:true});
  const read=async<T>(file:string):Promise<T>=>{const response=await fetch(new URL(file,base));if(!response.ok)throw new Error(`UI_PREVIEW_FETCH_${response.status}`);return response.json();};
  const manifest=await read<UiBundleManifest>('manifest.json');
  const [catalog,document,stateSchema,factory]=await Promise.all([
    read<UiCatalog>(manifest.catalog.path),read<UiDocument>(manifest.definition.path),read<JsonSchema>(manifest.stateSchema.path),
    import(/* @vite-ignore */ new URL(manifest.module.path,base).href) as Promise<{createWorldUiModule:ReturnTypeFactory}>,
  ]);
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
