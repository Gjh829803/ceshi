import { isNil } from "lodash-es";

export function splitJsonPointerV1(pointer: string): readonly string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) {
    throw new RangeError(`JSON Pointer must start with '/': ${pointer}`);
  }
  return pointer.slice(1).split("/").map((segment) =>
    segment.replaceAll("~1", "/").replaceAll("~0", "~")
  );
}

export function readJsonPointerV1(root: unknown, pointer: string): unknown {
  let current: unknown = root;
  for (const segment of splitJsonPointerV1(pointer)) {
    if (isNil(current) || typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function deleteJsonPointerV1(
  root: Record<string, unknown>,
  pointer: string,
): void {
  const segments = splitJsonPointerV1(pointer);
  if (segments.length === 0) return;
  let parent: unknown = root;
  for (const segment of segments.slice(0, -1)) {
    if (isNil(parent) || typeof parent !== "object") return;
    parent = Array.isArray(parent)
      ? parent[Number(segment)]
      : (parent as Record<string, unknown>)[segment];
  }
  const last = segments[segments.length - 1];
  if (isNil(last) || isNil(parent) || typeof parent !== "object" || Array.isArray(parent)) {
    return;
  }
  delete (parent as Record<string, unknown>)[last];
}
