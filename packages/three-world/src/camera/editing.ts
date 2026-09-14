import type {CameraDocument, CameraOpeningConfiguration} from '../config/camera/index';
import type {CameraController} from './controller';
import type {CameraCheckpoint, CameraInspection} from './state';
import {failure} from '../control-support';

/** Maintainer-only camera transaction. Draft creation never applies or seals it. */
export interface CameraEditSession {
  applyDraft(document:CameraDocument, expectedConfigurationRevision:number):CameraInspection;
  commitBaseline(expectedConfigurationRevision:number):CameraInspection;
  createOpeningDraft(document:CameraDocument, options:{readonly viewId:string; readonly opening?:CameraOpeningConfiguration}):CameraDocument;
  cancel():void;
  dispose():void;
}

/** World supplies its existing lifecycle/lease guards; checkpoints stay with the owner. */
export function createCameraEditSession(controller:CameraController, host:{
  readonly check:(mutation:boolean)=>void;
  readonly apply:(document:CameraDocument)=>void;
  readonly undo:(document:CameraDocument)=>void;
  readonly commit:()=>void;
  readonly changed:()=>void;
  readonly opening:(document:CameraDocument, options:{readonly viewId:string; readonly opening?:CameraOpeningConfiguration})=>CameraDocument;
}):CameraEditSession {
  let baseline=controller.baselineIdentity();
  if(!baseline)throw failure('CAMERA_BASELINE_REQUIRED');
  let checkpoint:CameraCheckpoint|undefined=controller.captureCheckpoint();
  let revision=checkpoint.inspection.configurationRevision;
  let commitRevision=checkpoint.inspection.cameraCommitRevision;
  let closed=false;
  // A later draft must not disguise input that occurred between earlier drafts.
  let precise=true;
  const conflict=()=>({
    ...failure('CAMERA_EDIT_CONFLICT',`Camera edit conflict; current configurationRevision=${controller.inspect().configurationRevision}`),
    configurationRevision:controller.inspect().configurationRevision,
  });
  const open=()=>{
    if(closed)throw failure('CAMERA_EDIT_CLOSED');
    if(!checkpoint||!controller.hasCheckpoint(checkpoint))throw failure('CAMERA_EDIT_STALE');
    return checkpoint;
  };
  const check=(expected=revision)=>{
    host.check(true);
    const base=open();
    if(controller.baselineIdentity()!==baseline||controller.inspect().configurationRevision!==revision||expected!==revision)throw conflict();
    return base;
  };
  const adopted=()=>{
    const inspection=controller.inspect();
    revision=inspection.configurationRevision;
    commitRevision=inspection.cameraCommitRevision;
    return inspection;
  };
  const close=()=>{closed=true;checkpoint=undefined;baseline=undefined;};
  return Object.freeze({
    applyDraft(document:CameraDocument, expectedConfigurationRevision:number){
      check(expectedConfigurationRevision);
      const unchanged=controller.inspect().cameraCommitRevision===commitRevision;
      host.apply(document);
      precise=precise&&unchanged;
      return adopted();
    },
    commitBaseline(expectedConfigurationRevision:number){
      check(expectedConfigurationRevision);
      host.commit();
      baseline=controller.baselineIdentity();
      checkpoint=controller.captureCheckpoint();
      precise=true;
      return adopted();
    },
    createOpeningDraft(document:CameraDocument, options:{readonly viewId:string;readonly opening?:CameraOpeningConfiguration}){
      host.check(false);
      open();
      return host.opening(document,options);
    },
    cancel(){
      if(closed)return;
      const baseCheckpoint=check(), current=controller.inspect(), base=baseCheckpoint.inspection;
      const sameSubject=base.mode==='authored'||(base.current?.resolvedSubjectId===current.current?.resolvedSubjectId&&base.current?.subjectGeneration===current.current?.subjectGeneration);
      if(precise&&sameSubject&&current.cameraCommitRevision===commitRevision){
        controller.restoreCheckpoint(baseCheckpoint,commitRevision);
        host.changed();
      }else if(current.documentHash!==base.documentHash){
        if(!base.document||base.mode==='authored'||current.mode==='authored')throw conflict();
        try{host.undo(base.document);}catch(error){
          if(error&&typeof error==='object'&&'code' in error&&['CAMERA_ACTIVE_VIEW_CHANGED','CAMERA_INTENT_OUT_OF_RANGE','CAMERA_CONFIGURATION_INVALID','CAMERA_TARGET_UNAVAILABLE'].includes(String(error.code)))throw conflict();
          throw error;
        }
      }
      close();
    },
    dispose:close,
  });
}
