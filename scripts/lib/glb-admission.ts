import { createHash } from "node:crypto";

import validator, {
  type ValidationMessage,
  type ValidationReport,
} from "gltf-validator";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const MAX_GLB_BYTE_LENGTH_BYTES = 128 * 1024 * 1024;

export type GlbAdmissionProfileIdV1 =
  | "subject-source-archive.v1"
  | "subject-rigged-model.v1"
  | "subject-animation-clip.v1"
  | "subject-runtime-bundle.v1"
  | "subject-static-ready.v1";

export type GlbAdmissionErrorCodeV1 =
  | "GLB_ADMISSION_ENVELOPE_INVALID"
  | "GLB_ADMISSION_VALIDATOR_ERROR"
  | "GLB_ADMISSION_VALIDATOR_FAILURE"
  | "GLB_ADMISSION_EXTERNAL_URI_FORBIDDEN"
  | "GLB_ADMISSION_EXTENSION_UNSUPPORTED"
  | "GLB_ADMISSION_PROFILE_MISMATCH"
  | "GLB_ADMISSION_INVENTORY_MISMATCH"
  | "GLB_ADMISSION_LIMIT_EXCEEDED";

export class GlbAdmissionErrorV1 extends Error {
  public constructor(
    public readonly code: GlbAdmissionErrorCodeV1,
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(code);
    this.name = "GlbAdmissionErrorV1";
  }
}

export interface GlbAdmissionInventoryV1 {
  readonly meshCount: number;
  readonly skinCount: number;
  readonly animationClipCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly cameraCount: number;
  readonly lightCount: number;
  readonly totalVertexCount: number;
  readonly totalTriangleCount: number;
}

export interface GlbAdmissionReceiptV1 {
  readonly kind: "glb-admission-receipt";
  readonly schemaVersion: 1;
  readonly profileId: GlbAdmissionProfileIdV1;
  readonly byteLengthBytes: number;
  readonly contentHash: `sha256:${string}`;
  readonly validatorName: "Khronos glTF Validator";
  readonly validatorVersion: string;
  readonly extensionsUsed: readonly string[];
  readonly extensionsRequired: readonly string[];
  readonly inventory: GlbAdmissionInventoryV1;
  readonly issues: {
    readonly errorCount: number;
    readonly warningCount: number;
    readonly informationCount: number;
    readonly hintCount: number;
    readonly messages: readonly {
      readonly severity: "error" | "warning" | "information" | "hint";
      readonly code: string;
      readonly pointer: string;
      readonly resourceUri: string;
    }[];
  };
  readonly isSelfContained: true;
  readonly admitted: true;
}

export interface ValidateGlbAdmissionOptionsV1 {
  readonly profileId: GlbAdmissionProfileIdV1;
  readonly allowedExtensions?: readonly string[];
  readonly expectedInventory?: Partial<GlbAdmissionInventoryV1>;
}

interface GlbJsonV2 {
  readonly buffers?: readonly { readonly uri?: unknown }[];
  readonly images?: readonly { readonly uri?: unknown }[];
  readonly meshes?: readonly {
    readonly primitives?: readonly {
      readonly indices?: unknown;
      readonly mode?: unknown;
    }[];
  }[];
  readonly skins?: readonly unknown[];
  readonly animations?: readonly unknown[];
  readonly materials?: readonly unknown[];
  readonly textures?: readonly unknown[];
  readonly cameras?: readonly unknown[];
  readonly extensions?: {
    readonly KHR_lights_punctual?: {
      readonly lights?: readonly unknown[];
    };
  };
  readonly extensionsUsed?: readonly unknown[];
  readonly extensionsRequired?: readonly unknown[];
}

let validationTail: Promise<void> = Promise.resolve();

function fail(
  code: GlbAdmissionErrorCodeV1,
  details: Readonly<Record<string, unknown>> = {},
): never {
  throw new GlbAdmissionErrorV1(code, details);
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseGlbJson(bytes: Uint8Array): GlbJsonV2 {
  if (bytes.byteLength > MAX_GLB_BYTE_LENGTH_BYTES) {
    return fail("GLB_ADMISSION_LIMIT_EXCEEDED", {
      byteLengthBytes: bytes.byteLength,
      maximumByteLengthBytes: MAX_GLB_BYTE_LENGTH_BYTES,
    });
  }
  if (bytes.byteLength < 20) return fail("GLB_ADMISSION_ENVELOPE_INVALID");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== GLB_MAGIC ||
    view.getUint32(4, true) !== GLB_VERSION ||
    view.getUint32(8, true) !== bytes.byteLength
  ) return fail("GLB_ADMISSION_ENVELOPE_INVALID");

  let cursor = 12;
  let chunkIndex = 0;
  let json: GlbJsonV2 | undefined;
  while (cursor < bytes.byteLength) {
    if (cursor + 8 > bytes.byteLength) return fail("GLB_ADMISSION_ENVELOPE_INVALID");
    const chunkLength = view.getUint32(cursor, true);
    const chunkType = view.getUint32(cursor + 4, true);
    const chunkEnd = cursor + 8 + chunkLength;
    if (chunkLength === 0 || chunkLength % 4 !== 0 || chunkEnd > bytes.byteLength) {
      return fail("GLB_ADMISSION_ENVELOPE_INVALID");
    }
    if (chunkType === GLB_JSON_CHUNK_TYPE) {
      if (chunkIndex !== 0 || json !== undefined) {
        return fail("GLB_ADMISSION_ENVELOPE_INVALID");
      }
      try {
        const decoded = new TextDecoder("utf-8", { fatal: true })
          .decode(bytes.subarray(cursor + 8, chunkEnd))
          .replace(/[\u0000\u0020\t\r\n]+$/u, "");
        const parsed = JSON.parse(decoded) as unknown;
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return fail("GLB_ADMISSION_ENVELOPE_INVALID");
        }
        json = parsed as GlbJsonV2;
      } catch (error) {
        if (error instanceof GlbAdmissionErrorV1) throw error;
        return fail("GLB_ADMISSION_ENVELOPE_INVALID");
      }
    }
    cursor = chunkEnd;
    chunkIndex += 1;
  }
  if (cursor !== bytes.byteLength || json === undefined) {
    return fail("GLB_ADMISSION_ENVELOPE_INVALID");
  }
  return json;
}

function stringSet(value: readonly unknown[] | undefined): readonly string[] {
  if (value === undefined) return [];
  if (value.some((entry) => typeof entry !== "string")) {
    return fail("GLB_ADMISSION_EXTENSION_UNSUPPORTED");
  }
  const strings = value as readonly string[];
  if (new Set(strings).size !== strings.length) {
    return fail("GLB_ADMISSION_EXTENSION_UNSUPPORTED");
  }
  return [...strings].sort();
}

function validateSelfContainment(json: GlbJsonV2): void {
  const containsUri = [...(json.buffers ?? []), ...(json.images ?? [])]
    .some((entry) => entry !== null && typeof entry === "object" && "uri" in entry);
  if (containsUri) return fail("GLB_ADMISSION_EXTERNAL_URI_FORBIDDEN");
}

function validateExtensions(
  json: GlbJsonV2,
  options: ValidateGlbAdmissionOptionsV1,
): Readonly<{ used: readonly string[]; required: readonly string[] }> {
  const used = stringSet(json.extensionsUsed);
  const required = stringSet(json.extensionsRequired);
  const allowed = options.profileId === "subject-source-archive.v1"
    ? new Set(options.allowedExtensions ?? [])
    : new Set<string>();
  const supported = new Set(validator.supportedExtensions());
  if (
    [...used, ...required].some((extension) =>
      !allowed.has(extension) || !supported.has(extension)
    ) ||
    required.some((extension) => !used.includes(extension))
  ) {
    return fail("GLB_ADMISSION_EXTENSION_UNSUPPORTED", { used, required });
  }
  return { used, required };
}

function count(value: readonly unknown[] | undefined): number {
  return Array.isArray(value) ? value.length : 0;
}

function inventory(json: GlbJsonV2, report: ValidationReport): GlbAdmissionInventoryV1 {
  return {
    meshCount: count(json.meshes),
    skinCount: count(json.skins),
    animationClipCount: count(json.animations),
    materialCount: count(json.materials),
    textureCount: count(json.textures),
    cameraCount: count(json.cameras),
    lightCount: count(json.extensions?.KHR_lights_punctual?.lights),
    totalVertexCount: report.info?.totalVertexCount ?? 0,
    totalTriangleCount: report.info?.totalTriangleCount ?? 0,
  };
}

function hasOnlyIndexedTriangles(json: GlbJsonV2): boolean {
  return (json.meshes ?? []).every((mesh) =>
    Array.isArray(mesh.primitives) && mesh.primitives.length > 0 &&
    mesh.primitives.every((primitive) =>
      Number.isInteger(primitive.indices) &&
      (primitive.mode === undefined || primitive.mode === 4)
    )
  );
}

function validateProfile(
  profileId: GlbAdmissionProfileIdV1,
  json: GlbJsonV2,
  actual: GlbAdmissionInventoryV1,
): void {
  if (profileId === "subject-source-archive.v1") return;
  const noCameraOrLight = actual.cameraCount === 0 && actual.lightCount === 0;
  let matches = false;
  switch (profileId) {
    case "subject-rigged-model.v1":
      matches = actual.meshCount >= 1 && actual.animationClipCount === 0 &&
        actual.skinCount <= 1 && noCameraOrLight && hasOnlyIndexedTriangles(json);
      break;
    case "subject-animation-clip.v1":
      matches = actual.animationClipCount === 1 && actual.meshCount === 0 &&
        actual.materialCount === 0 && actual.textureCount === 0 && noCameraOrLight;
      break;
    case "subject-runtime-bundle.v1":
      matches = actual.meshCount >= 1 && actual.skinCount === 1 &&
        noCameraOrLight && hasOnlyIndexedTriangles(json);
      break;
    case "subject-static-ready.v1":
      matches = actual.meshCount >= 1 && actual.skinCount === 0 &&
        actual.animationClipCount === 0 && actual.totalTriangleCount > 0 &&
        noCameraOrLight && hasOnlyIndexedTriangles(json);
      break;
  }
  if (!matches) return fail("GLB_ADMISSION_PROFILE_MISMATCH", { profileId, inventory: actual });
}

function validateExpectedInventory(
  actual: GlbAdmissionInventoryV1,
  expected: Partial<GlbAdmissionInventoryV1> | undefined,
): void {
  if (expected === undefined) return;
  for (const key of Object.keys(expected) as Array<keyof GlbAdmissionInventoryV1>) {
    const expectedValue = expected[key];
    if (
      expectedValue === undefined ||
      !Number.isSafeInteger(expectedValue) ||
      expectedValue < 0 ||
      actual[key] !== expectedValue
    ) {
      return fail("GLB_ADMISSION_INVENTORY_MISMATCH", {
        key,
        expected: expectedValue,
        actual: actual[key],
      });
    }
  }
}

function severityName(value: number): "error" | "warning" | "information" | "hint" {
  if (value === 0) return "error";
  if (value === 1) return "warning";
  if (value === 2) return "information";
  return "hint";
}

function stableMessages(messages: readonly ValidationMessage[]): GlbAdmissionReceiptV1["issues"]["messages"] {
  return messages.map((message) => ({
    severity: severityName(message.severity),
    code: message.code,
    pointer: message.pointer ?? "",
    resourceUri: message.uri ?? "",
  })).sort((left, right) =>
    left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    left.pointer.localeCompare(right.pointer) ||
    left.resourceUri.localeCompare(right.resourceUri)
  );
}

async function serializedValidation(bytes: Uint8Array): Promise<ValidationReport> {
  const run = async () => validator.validateBytes(bytes, {
    uri: "artifact.glb",
    format: "glb",
    writeTimestamp: false,
    maxIssues: 0,
  });
  const pending = validationTail.then(run, run);
  validationTail = pending.then(() => undefined, () => undefined);
  try {
    return await pending;
  } catch {
    return fail("GLB_ADMISSION_VALIDATOR_FAILURE");
  }
}

export async function validateGlbAdmissionV1(
  bytes: Uint8Array,
  options: ValidateGlbAdmissionOptionsV1,
): Promise<GlbAdmissionReceiptV1> {
  const json = parseGlbJson(bytes);
  validateSelfContainment(json);
  const extensions = validateExtensions(json, options);
  const report = await serializedValidation(bytes);
  if (
    typeof report.validatorVersion !== "string" ||
    report.validatorVersion !== validator.version() ||
    report.issues?.truncated !== false ||
    !Array.isArray(report.issues.messages)
  ) return fail("GLB_ADMISSION_VALIDATOR_FAILURE");
  if (report.issues.numErrors > 0) {
    return fail("GLB_ADMISSION_VALIDATOR_ERROR", {
      issueCodes: report.issues.messages
        .filter((message) => message.severity === 0)
        .map((message) => message.code)
        .sort(),
    });
  }
  const actualInventory = inventory(json, report);
  validateExpectedInventory(actualInventory, options.expectedInventory);
  validateProfile(options.profileId, json, actualInventory);
  return {
    kind: "glb-admission-receipt",
    schemaVersion: 1,
    profileId: options.profileId,
    byteLengthBytes: bytes.byteLength,
    contentHash: sha256(bytes),
    validatorName: "Khronos glTF Validator",
    validatorVersion: report.validatorVersion,
    extensionsUsed: extensions.used,
    extensionsRequired: extensions.required,
    inventory: actualInventory,
    issues: {
      errorCount: report.issues.numErrors,
      warningCount: report.issues.numWarnings,
      informationCount: report.issues.numInfos,
      hintCount: report.issues.numHints,
      messages: stableMessages(report.issues.messages),
    },
    isSelfContained: true,
    admitted: true,
  };
}
