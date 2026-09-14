import type { CameraDocument } from '@worldkit/three';
import type { CameraConfigurationId } from './project-files';
import type { CameraFileRead, CameraFileSave } from './file-contract';
export interface CameraFileClient {
  read(configurationId: CameraConfigurationId): Promise<CameraFileRead>;
  save(configurationId: CameraConfigurationId, expectedFileSha256: string | null, document: CameraDocument): Promise<CameraFileSave>;
}
/** null means this page has no local write capability; retain import/export. */
export async function createCameraFileClient(transport: typeof fetch = fetch): Promise<CameraFileClient | null> {
  if (import.meta.env.PROD) return null;
  const call = (route: string, body: unknown, session?: string) => transport(`/__camera-config/${route}`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(session ? { 'X-Camera-Session': session } : {}) },
    body: JSON.stringify(body),
  });
  const response = await call('session', {});
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`CAMERA_FILE_SERVICE_${response.status}`);
  const { session } = await response.json() as { session: string };
  async function request<T>(route: string, body: unknown): Promise<T> {
    const result = await call(route, body, session);
    if (!result.ok && result.status !== 409) throw new Error(`CAMERA_FILE_SERVICE_${result.status}`);
    return result.json() as Promise<T>;
  }
  return {
    read: configurationId => request<CameraFileRead>('read', { configurationId }),
    save: (configurationId, expectedFileSha256, document) => request<CameraFileSave>('save', { configurationId, expectedFileSha256, document }),
  };
}
