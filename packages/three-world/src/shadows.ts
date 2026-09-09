import * as THREE from 'three';
import type {ShadowSettings} from './contracts';

const SHADOW_TYPES={basic:THREE.BasicShadowMap,pcf:THREE.PCFShadowMap,vsm:THREE.VSMShadowMap} as const;

/** Apply once; captures can temporarily change renderer state without being overwritten. */
export function applyRendererShadows(renderer:THREE.WebGLRenderer,scene:THREE.Scene,settings:Readonly<ShadowSettings>):()=>void{
 const previous={enabled:renderer.shadowMap.enabled,type:renderer.shadowMap.type};
 const apply=(enabled:boolean,type:THREE.ShadowMapType)=>{
  // Three skips static lights before checking for algorithm changes. Invalidate
  // their cached maps too, without changing authored light settings or ownership.
  if(renderer.shadowMap.type!==type)scene.traverse(object=>{
   const light=object as THREE.DirectionalLight;
   if(light.isLight&&light.shadow)light.shadow.needsUpdate=true;
  });
  renderer.shadowMap.enabled=enabled;renderer.shadowMap.type=type;renderer.shadowMap.needsUpdate=true;
 };
 apply(settings.enabled,SHADOW_TYPES[settings.type]);
 return()=>apply(previous.enabled,previous.type);
}

/** Configure the selected light only. Scene code keeps placement, tracking and disposal. */
export function applyDirectionalShadows(light:THREE.DirectionalLight,settings:Readonly<ShadowSettings>):void{
 if(!light?.isDirectionalLight)throw new Error('SHADOW_LIGHT_UNSUPPORTED: expected DirectionalLight');
 const shadow=light.shadow,half=settings.coverageMeters/2;
 if(shadow.mapSize.x!==settings.mapSizePixels||shadow.mapSize.y!==settings.mapSizePixels){
  shadow.dispose();shadow.map=null;shadow.mapPass=null;
 }
 light.castShadow=settings.enabled;shadow.mapSize.set(settings.mapSizePixels,settings.mapSizePixels);
 Object.assign(shadow.camera,{left:-half,right:half,top:half,bottom:-half,near:settings.nearMeters,far:settings.farMeters});
 shadow.camera.updateProjectionMatrix();
 shadow.bias=settings.bias;shadow.normalBias=settings.normalBiasMeters;shadow.radius=settings.radius;shadow.intensity=settings.intensity;
 shadow.needsUpdate=true;
}
