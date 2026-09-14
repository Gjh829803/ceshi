import type { CameraDocument } from '@worldkit/three';
export type CameraFileRead = { status: 'missing' } | {
  status: 'present'; document: CameraDocument; fileSha256: string;
};
export type CameraFileSave = {
  status: 'saved'; document: CameraDocument; fileSha256: string;
} | { status: 'conflict'; current: CameraFileRead };
/** Imported bytes identify source adoption only; runtime inspection must also match. */
export interface CameraImportIdentity { importedFileSha256: string }
