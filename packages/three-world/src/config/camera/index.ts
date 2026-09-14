export type * from "./types";
export {
  CAMERA_DOCUMENT_SCHEMA,
  CAMERA_VALUE_SCHEMAS,
  CAMERA_OVERRIDE_SCHEMAS,
  CAMERA_FIELD_METADATA,
} from "./fields";
export type { CameraFieldMetadata } from "./fields";
export {
  CAMERA_DOCUMENT_DEFAULTS,
  CAMERA_STRATEGY_DEFAULTS,
  CAMERA_THIRD_PERSON_DEFAULTS,
  CAMERA_FIRST_PERSON_DEFAULTS,
  CAMERA_SHOULDER_DEFAULTS,
} from "./defaults";
export { resolveCameraConfiguration } from "./resolve";
export {
  parseCameraDocument,
  serializeCameraDocument,
  hashCameraDocument,
} from "./serialization";

export {HUMANOID_CAMERA_PRESETS,createHumanoidCameraDocument} from './humanoid';
