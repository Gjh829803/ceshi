import { failure } from "../../control-support";
import type { CameraJsonValue } from "./types";
export function cameraConfigurationError(path: string, message: string): never {
  throw failure("CAMERA_CONFIGURATION_INVALID", `${path || "/"}: ${message}`);
}
/** Reject values JSON.stringify would silently omit/coerce, including accessors. */
export function assertCameraJson(
  value: unknown,
  path = "",
  ancestors = new Set<object>(),
): asserts value is CameraJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object")
    cameraConfigurationError(path, "expected finite JSON data");
  const objectValue = value as object;
  if (ancestors.has(objectValue))
    cameraConfigurationError(path, "cyclic JSON data");
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    cameraConfigurationError(path, "expected a plain JSON object");
  ancestors.add(objectValue);
  if (Reflect.ownKeys(objectValue).some((key) => typeof key === "symbol"))
    cameraConfigurationError(path, "symbol keys are not JSON");
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype)
      cameraConfigurationError(
        path,
        "expected a standard JSON array prototype",
      );
    // A JSON array has only length and its own indexed data items. Count all
    // descriptors so non-enumerable hooks cannot reach the detached clone.
    if (Reflect.ownKeys(value).length !== value.length + 1)
      cameraConfigurationError(path, "sparse or decorated array");
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
        cameraConfigurationError(
          `${path}/${i}`,
          "expected an enumerable array data item",
        );
      assertCameraJson(descriptor.value, `${path}/${i}`, ancestors);
    }
  } else
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(objectValue),
    )) {
      if (!descriptor.enumerable || !("value" in descriptor))
        cameraConfigurationError(
          `${path}/${key}`,
          "expected an enumerable data property",
        );
      assertCameraJson(descriptor.value, `${path}/${key}`, ancestors);
    }
  ancestors.delete(objectValue);
}
export function cloneCameraData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
