import {parseCameraDocument,serializeCameraDocument,type CameraDocument,type CameraPreset} from '@worldkit/three';
import variantPresets from '@worldkit/preset-content/cameras/dragon-variants.json';
import type {CameraConfigurationId} from './project-files';
export function cameraConfigurationId(sceneId:string):CameraConfigurationId{return sceneId==='indoor-lab'||sceneId==='npc-workshop'?sceneId:'campus';}
/** Variant selection is an explicit document edit, preserving existing project overrides. */
export function selectDragonCameraVariant(document:CameraDocument,variantId:string):CameraDocument {
 const snapshots=(variantPresets as unknown as Record<string,Record<string,CameraPreset>>)[variantId];
 if(!snapshots)throw new Error('CAMERA_VARIANT_UNKNOWN');
 const old=document.binding.subjectOverrides?.dragon;
 const views={...old?.views};
 const presets={...document.presets};
 for(const [viewId,preset] of Object.entries(snapshots)){
  if(!document.views[viewId]||document.views[viewId].kind!==preset.kind)continue;
  const presetId=`dragon.${variantId}.${viewId}`;
  presets[presetId]=preset;views[viewId]={...views[viewId],presetId};
 }
 return parseCameraDocument({...document,presets,binding:{...document.binding,subjectOverrides:{...document.binding.subjectOverrides,dragon:{views}}}});
}

/** Pure document state. Callers supply the source document; no build identity is inferred. */
export function createCameraProjectState(configurationId:CameraConfigurationId,source:unknown,variantId:string){
 const savedDocument=parseCameraDocument(source);
 const document=selectDragonCameraVariant(savedDocument,variantId);
 return {configurationId,document,savedDocument,unsaved:serializeCameraDocument(document)!==serializeCameraDocument(savedDocument)};
}
