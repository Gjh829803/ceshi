/** Application-owned fixed IDs. Neither HTTP callers nor author code supply paths. */
export const CAMERA_PROJECT_FILES = {
  campus: 'config/camera.json',
  'indoor-lab': 'config/cameras/indoor-lab.json',
  'npc-workshop': 'config/cameras/npc-workshop.json',
} as const;
export type CameraConfigurationId = keyof typeof CAMERA_PROJECT_FILES;
