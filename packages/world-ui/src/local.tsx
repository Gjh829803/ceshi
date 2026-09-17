import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {UiRecorder} from './core.js';
import {PresentedUiStore,WorldUiRenderer,type WorldUiModule} from './react.js';
import {compileStateSchema,requireValid,type UiCatalog,type UiDocument,type UiState,type JsonSchema,type JsonValue} from './schema.js';

/** DOM composition driven by the caller's existing world clock; no render loop. */
export function mountLocalWorldUi(options:{
  container:HTMLElement;document:UiDocument;catalog:UiCatalog;module:WorldUiModule;
  stateSchema:JsonSchema;initialState:UiState;styles?:readonly string[];
  onAction:(name:string,params:Record<string,JsonValue>)=>void;
}) {
  const {container,document:definition,catalog,module}=options;
  const validate=compileStateSchema(options.stateSchema);
  requireValid(validate,options.initialState,'UI_STATE');
  let recorder=new UiRecorder(definition,catalog,options.initialState),disposed=false;
  const store=new PresentedUiStore();store.present(recorder.snapshot(),0);
  const shadow=container.attachShadow({mode:'open'}),mount=container.ownerDocument.createElement('div');
  mount.style.cssText='position:absolute;inset:0;transform-origin:top left;pointer-events:none';
  const interactive=container.ownerDocument.createElement('style');
  interactive.textContent=':is(button,input,textarea,select,a[href],[contenteditable],[tabindex],[role="button"]){pointer-events:auto}';
  shadow.append(interactive);
  for(const href of options.styles??[]){const link=container.ownerDocument.createElement('link');link.rel='stylesheet';link.href=href;shadow.append(link);}
  shadow.append(mount);const root=createRoot(mount);
  let width=0,height=0;
  const layout=()=>{
    const rect=container.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;
    const scale=rect.width/definition.designViewport.width,nextHeight=rect.height/scale;
    mount.style.width=`${definition.designViewport.width}px`;mount.style.height=`${nextHeight}px`;mount.style.transform=`scale(${scale})`;
    if(width===rect.width&&height===rect.height)return;width=rect.width;height=rect.height;
    root.render(<WorldUiRenderer document={definition} catalog={catalog} module={module} store={store} onAction={options.onAction} viewport={{width:definition.designViewport.width,height:nextHeight}}/>);
  };
  const observer=new ResizeObserver(layout);observer.observe(container);layout();
  return {
    present(state:UiState,sourceTimeUs:number){if(disposed)return;requireValid(validate,state,'UI_STATE');store.present(recorder.sample(state,sourceTimeUs).snapshot,sourceTimeUs);},
    reset(state:UiState){if(disposed)return;requireValid(validate,state,'UI_STATE');recorder=new UiRecorder(definition,catalog,state);store.reset();store.present(recorder.snapshot(),0);},
    dispose(){if(disposed)return;disposed=true;observer.disconnect();root.unmount();store.dispose();shadow.replaceChildren();module.dispose?.();},
  };
}
