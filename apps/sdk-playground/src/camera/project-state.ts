import {parseCameraDocument,serializeCameraDocument,type CameraDocument,type CameraPreset} from '@worldkit/three';
import variantPresets from '@worldkit/preset-content/cameras/dragon-variants.json';
import type {CameraConfigurationId} from './project-files';
export function cameraConfigurationId(sceneId:string):CameraConfigurationId{return sceneId==='indoor-lab'||sceneId==='npc-workshop'?sceneId:'campus';}
function dragonCameraDocument(document:CameraDocument,variantId:string,intent:'load'|'select'):CameraDocument {
 const snapshots=(variantPresets as unknown as Record<string,Record<string,CameraPreset>>)[variantId];
 if(!snapshots)throw new Error('CAMERA_VARIANT_UNKNOWN');
 const old=document.binding.subjectOverrides?.dragon;
 const views={...old?.views};
 const presets={...document.presets};
 for(const [viewId,preset] of Object.entries(snapshots)){
  const view=document.views[viewId];
  if(!view)continue;
  if(view.kind!==preset.kind)throw new Error(`CAMERA_VARIANT_VIEW_KIND_MISMATCH: ${viewId}`);
  const boundId=views[viewId]?.presetId;
  const boundPreset=boundId?presets[boundId]:undefined;
  if(boundPreset&&boundPreset.kind!==view.kind)throw new Error(`CAMERA_VARIANT_PRESET_KIND_MISMATCH: ${boundId}`);
  // Reloading the selected variant preserves its exact saved snapshot, including renamed IDs.
  const identity=`dragon.${variantId}`;
  if(boundPreset?.sourceIdentity?.id===identity)continue;
  const variantBinding=Object.keys(variantPresets).some(id=>boundId===`dragon.${id}.${viewId}`||boundPreset?.sourceIdentity?.id===`dragon.${id}`);
  const initialBinding=boundId===`dragon.${viewId}`&&boundPreset?.sourceIdentity?.id==='calibration.dragon';
  if(intent==='load'&&boundPreset&&!variantBinding&&!initialBinding)continue;
  let presetId=`${identity}.${viewId}`;
  const existing=presets[presetId];
  if(existing&&existing.kind!==view.kind)throw new Error(`CAMERA_VARIANT_PRESET_KIND_MISMATCH: ${presetId}`);
  if(!presets[presetId]){
   const saved=Object.entries(presets).filter(([,value])=>value.sourceIdentity?.id===identity&&value.kind===view.kind);
   if(saved.length>1)throw new Error(`CAMERA_VARIANT_PRESET_AMBIGUOUS: ${identity} ${viewId}`);
   presetId=saved[0]?.[0]??presetId;
  }
  presets[presetId]??=preset;
  views[viewId]={...views[viewId],presetId};
 }
 return parseCameraDocument({...document,presets,binding:{...document.binding,subjectOverrides:{...document.binding.subjectOverrides,dragon:{views}}}});
}

/** Select a variant's project snapshot; only unseen variants import library defaults. */
export function selectDragonCameraVariant(document:CameraDocument,variantId:string):CameraDocument {
 return dragonCameraDocument(document,variantId,'select');
}

/** Pure document state. Callers supply the source document; no build identity is inferred. */
export function createCameraProjectState(configurationId:CameraConfigurationId,source:unknown,variantId:string){
 const savedDocument=parseCameraDocument(source);
 const document=dragonCameraDocument(savedDocument,variantId,'load');
 return {configurationId,document,savedDocument,unsaved:serializeCameraDocument(document)!==serializeCameraDocument(savedDocument)};
}
