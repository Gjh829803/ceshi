import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
/** Audited extension: desiredDirectionWorldXYZ is the SDK camera-relative basis;
 * the author's Space listener temporarily selects SDK ground jumping. */
export const ARBORIST_CAPTURE_ADAPTER='arborist-ground-steps-space-v1';
export async function customMovementAdapter(root:string,movementId:string):Promise<string|undefined>{
 if(movementId!=='arborist.ground-with-steps')return undefined;
 const pinned:Record<string,string>={'world/movement.ts':'af21dbea87dc3a414be73cde3eabf3d84d34613ca9ffe51a63c4573304be90da','main.ts':'05f777b150ee4bf72ff5ced331c72892bb16746e1771f9300ecc1abc38ba0ecd'};
 for(const [file,expected]of Object.entries(pinned))if(createHash('sha256').update(await readFile(path.join(root,file))).digest('hex')!==expected)throw Error('EPISODE_CUSTOM_MOVEMENT_ADAPTER_SOURCE_CHANGED');
 return ARBORIST_CAPTURE_ADAPTER;
}
