import { isNil } from "lodash-es";

export function assertAccessorFreeDataGraph(
  value: unknown,
  errorCode: string,
  visited: WeakSet<object> = new WeakSet<object>(),
): void {
  if (isNil(value) || typeof value !== "object") return;
  if (visited.has(value)) return;
  visited.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(descriptors)) {
    if (!isNil(descriptor.get) || !isNil(descriptor.set)) {
      throw new Error(errorCode);
    }
    if (Object.prototype.hasOwnProperty.call(descriptor, "value")) {
      assertAccessorFreeDataGraph(descriptor.value, errorCode, visited);
    }
  }
}
