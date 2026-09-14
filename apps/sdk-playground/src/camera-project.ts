import campus, {fileSha256 as campusSha} from '../config/camera.json?camera-document';
import indoor, {fileSha256 as indoorSha} from '../config/cameras/indoor-lab.json?camera-document';
import workshop, {fileSha256 as workshopSha} from '../config/cameras/npc-workshop.json?camera-document';
import {cameraConfigurationId,createCameraProjectState} from './camera/project-state';
export { CAMERA_PROJECT_FILES, type CameraConfigurationId } from './camera/project-files';
const importedHashes={campus:campusSha,'indoor-lab':indoorSha,'npc-workshop':workshopSha};
const documents={campus,'indoor-lab':indoor,'npc-workshop':workshop};
/** Vite-only adapter. Missing loader support cannot masquerade as imported identity. */
export function loadCameraProject(sceneId:string,variantId:string){
 const configurationId=cameraConfigurationId(sceneId);
 const importedFileSha256=importedHashes[configurationId];
 if(typeof importedFileSha256!=='string'||!/^[a-f0-9]{64}$/.test(importedFileSha256))throw new Error('CAMERA_IMPORT_IDENTITY_UNAVAILABLE');
 return {...createCameraProjectState(configurationId,documents[configurationId],variantId),importedFileSha256};
}
