import { createHash } from "node:crypto";

// Keep serialized identities compatible with previously delivered worlds.
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function sha256Canonical(value) {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}
