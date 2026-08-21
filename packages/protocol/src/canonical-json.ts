import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

function canonicalJsonPath(path: string): string {
  return path || "/";
}

function rejectOwnSymbolKeys(value: object, path: string): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(
      `Symbol-keyed property at ${canonicalJsonPath(path)} is unsupported canonical JSON.`,
    );
  }
}

function hasCanonicalArrayShape(value: unknown[]): boolean {
  const ownPropertyNames = Object.getOwnPropertyNames(value);
  if (ownPropertyNames.length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  return lengthDescriptor?.enumerable === false &&
    ownPropertyNames.every((key) => key === "length" || /^\d+$/.test(key));
}

function canonicalize(value: unknown, path: string): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Non-finite number at ${canonicalJsonPath(path)}.`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError(
        `Non-plain array at ${canonicalJsonPath(path)} is unsupported canonical JSON.`,
      );
    }
    rejectOwnSymbolKeys(value, path);
    if (!hasCanonicalArrayShape(value)) {
      throw new TypeError(
        `Non-canonical array shape at ${canonicalJsonPath(path)} is unsupported canonical JSON.`,
      );
    }
    return value.map((item, index) => canonicalize(item, `${path}/${index}`));
  }
  if (typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError(
        `Non-plain object at ${canonicalJsonPath(path)} is unsupported canonical JSON.`,
      );
    }
    rejectOwnSymbolKeys(value, path);
    const source = value as Record<string, unknown>;
    const entries: [string, unknown][] = [];
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      entries.push([key, canonicalize(source[key], `${path}/${key}`)]);
    }
    return Object.fromEntries(entries);
  }
  throw new TypeError(`Unsupported canonical JSON value at ${canonicalJsonPath(path)}.`);
}

export function stringifyCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, ""));
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(stringifyCanonicalJson(value));
}

export function sha256Bytes(bytes: Uint8Array): string {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

export function sha256CanonicalJson(value: unknown): string {
  return sha256Bytes(canonicalJsonBytes(value));
}
