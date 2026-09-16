import {createBrowserDebugStore,mountDebugPanel} from '@worldkit/three/debug';
import type {WorldObservation,ThreeWorld} from '@worldkit/three';

/** Emitted only for explicit test builds. Never imported by the production bridge. */
const identityElement=document.getElementById('worldkit-debug-identity');
if(identityElement){
 const identity=JSON.parse(identityElement.textContent??'{}') as {worldBuildHash:string;runtimeHash:string;sourceHash:string};
 if(![identity.worldBuildHash,identity.runtimeHash,identity.sourceHash].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)))throw Error('DEBUG_BUILD_IDENTITY_INVALID');
 const target=window as Window&{__WORLDKIT_EVAL__?:WorldObservation;__WORLDKIT_DEBUG__?:unknown};
 let active:ThreeWorld|undefined,dispose=()=>{},failed:ThreeWorld|undefined;
 const attach=()=>{
  const observer=target.__WORLDKIT_EVAL__,world=observer?.world;
  if(!observer?.ready||!world||world===active||world===failed||(!world.isRunning&&world.simulationTick===0))return;
  dispose();
  let cleanup=()=>{};
  try{
   const owned=!observer.presentation,presentation=observer.presentation??world.createPresentation();
   const store=createBrowserDebugStore({sourceHash:identity.worldBuildHash,authorSourceHash:identity.sourceHash,runtimeHash:identity.runtimeHash,worldBuildHash:identity.worldBuildHash});
   cleanup=()=>{if(owned)presentation.dispose();void store.dispose().catch(()=>{});};
   const panel=mountDebugPanel({world,presentation,store,sceneId:world.humanoid?.environment.map.id??'creator-world',registerTools:true,downloadIncident:id=>store.download(id),readIncident:id=>store.readIncident(id),listIncidents:sceneId=>store.listIncidents(sceneId),importIncident:text=>store.importIncident(text)});
   active=world;target.__WORLDKIT_DEBUG__={identity,panel};
   dispose=()=>{panel.dispose();cleanup();if(active===world){active=undefined;delete target.__WORLDKIT_DEBUG__;}};
  }catch(error){cleanup();failed=world;console.warn('SDK debug tools unavailable; gameplay continues.',error);}
 };
 // Discovery polling only; all simulation remains under the existing SDK clock.
 const timer=window.setInterval(attach,500);attach();
 window.addEventListener('pagehide',()=>{clearInterval(timer);dispose();},{once:true});
}
