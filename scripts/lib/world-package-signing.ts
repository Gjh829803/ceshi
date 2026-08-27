import { canonicalJsonBytes } from "@whitebox-world/protocol";
import {
  assembleWorldPackageDirectoryV2,
  assertWorldPackageHostCompatibilityV2,
  canonicalWorldPackageSignatureEnvelopeV1,
  verifyWorldPackageDirectoryV2,
  worldPackageSignatureEnvelopeBytesV1,
  type VerifiedWorldPackageDirectoryV2,
  type WorldPackageDirectoryFileV2,
  type WorldPackageDirectoryV2,
  type WorldPackageHostPolicyV1,
  type WorldPackageSignatureEnvelopeV1,
} from "@whitebox-world/world-package";
import {
  KeyObject,
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes,
} from "node:crypto";
import { isEmpty, isNil, isPlainObject } from "lodash-es";

const SIGNATURE_FILE_FIELDS = [
  "kind",
  "schemaVersion",
  "envelope",
  "signatureBase64",
] as const;
const TRUSTED_PUBLIC_KEY_FIELDS = [
  "keyId",
  "trustDomain",
  "publicKey",
] as const;
const SIGNATURE_FILE_MEDIA_TYPE = "application/json";
const TRANSPORT_METADATA_PATHS = new Set([
  "integrity.json",
  "world-package-build-receipt.json",
]);
const SAFE_KEY_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;

type UnknownRecord = Record<string, unknown>;
export type WorldPackageNodePrivateKeyV1 = KeyObject | string | Buffer;
export type WorldPackageNodePublicKeyV1 = KeyObject | string | Buffer;

export interface WorldPackageSignatureFileV1 {
  readonly kind: "worldkit-package-signature";
  readonly schemaVersion: 1;
  readonly envelope: WorldPackageSignatureEnvelopeV1;
  readonly signatureBase64: string;
}

export interface WorldPackageTrustedPublicKeyV1 {
  readonly keyId: string;
  readonly trustDomain: string;
  readonly publicKey: WorldPackageNodePublicKeyV1;
}

export interface SignWorldPackageDirectoryV2Input {
  readonly directory: WorldPackageDirectoryV2;
  readonly keyId: string;
  readonly trustDomain: string;
  readonly signedAt: string;
  readonly privateKey: WorldPackageNodePrivateKeyV1;
}

export interface VerifyWorldPackageForHostV2Input {
  readonly directory: WorldPackageDirectoryV2;
  readonly hostPolicy: WorldPackageHostPolicyV1;
  readonly trustedPublicKeys: readonly WorldPackageTrustedPublicKeyV1[];
}

function signatureRequired(): never {
  throw new Error(
    "WORLD_PACKAGE_SIGNATURE_REQUIRED: Host policy requires one trusted signature",
  );
}

function signatureEnvelopeInvalid(message: string): never {
  throw new Error(`WORLD_PACKAGE_SIGNATURE_ENVELOPE_INVALID: ${message}`);
}

function signatureUntrusted(message: string): never {
  throw new Error(`WORLD_PACKAGE_SIGNATURE_UNTRUSTED: ${message}`);
}

function hostIncompatible(message: string): never {
  throw new Error(`WORLD_PACKAGE_HOST_INCOMPATIBLE: ${message}`);
}

function requireCanonicalString(value: unknown, path: string): string {
  if (typeof value !== "string" || isEmpty(value) || value.trim() !== value) {
    signatureEnvelopeInvalid(`${path} must be a non-empty canonical string`);
  }
  return value;
}

function requireSafeKeyId(value: unknown, path = "keyId"): string {
  const keyId = requireCanonicalString(value, path);
  if (!SAFE_KEY_ID_PATTERN.test(keyId)) {
    signatureEnvelopeInvalid(`${path} must be a safe signature file identity`);
  }
  return keyId;
}

function exactRecord(
  value: unknown,
  fields: readonly string[],
  path: string,
): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) {
    signatureEnvelopeInvalid(`${path} must be a plain object`);
  }
  const record = value as UnknownRecord;
  const allowed = new Set(fields);
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknown)) {
    signatureEnvelopeInvalid(`${path} contains unknown field '${unknown}'`);
  }
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(record, field);
    if (isNil(descriptor) || !("value" in descriptor) || isNil(descriptor.value)) {
      signatureEnvelopeInvalid(`${path} is missing data field '${field}'`);
    }
  }
  return record;
}

function asEd25519PrivateKey(value: WorldPackageNodePrivateKeyV1): KeyObject {
  let key: KeyObject;
  try {
    key = value instanceof KeyObject ? value : createPrivateKey(value);
  } catch {
    return signatureUntrusted("private key material is invalid");
  }
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") {
    signatureUntrusted("private key must be Ed25519");
  }
  return key;
}

function asEd25519PublicKey(value: WorldPackageNodePublicKeyV1): KeyObject {
  let key: KeyObject;
  try {
    key = value instanceof KeyObject ? value : createPublicKey(value);
  } catch {
    return signatureUntrusted("public key material is invalid");
  }
  if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") {
    signatureUntrusted("trusted public key must be Ed25519");
  }
  return key;
}

function canonicalSignatureBytes(value: unknown): Uint8Array {
  const signatureBase64 = requireCanonicalString(value, "signatureBase64");
  let bytes: Buffer;
  try {
    bytes = Buffer.from(signatureBase64, "base64");
  } catch {
    return signatureEnvelopeInvalid("signatureBase64 is invalid");
  }
  if (
    bytes.byteLength !== 64 ||
    bytes.toString("base64") !== signatureBase64
  ) {
    signatureEnvelopeInvalid(
      "signatureBase64 must be canonical base64 for one 64-byte Ed25519 signature",
    );
  }
  return new Uint8Array(bytes);
}

function parseSignatureFile(
  file: WorldPackageDirectoryFileV2,
  directory: WorldPackageDirectoryV2,
): Readonly<{
  envelope: WorldPackageSignatureEnvelopeV1;
  signatureBytes: Uint8Array;
}> {
  let candidate: unknown;
  try {
    candidate = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(file.bytes));
  } catch {
    return signatureEnvelopeInvalid(`${file.path} must contain UTF-8 JSON`);
  }
  const record = exactRecord(candidate, SIGNATURE_FILE_FIELDS, file.path);
  if (record.kind !== "worldkit-package-signature" || record.schemaVersion !== 1) {
    signatureEnvelopeInvalid(`${file.path} has an invalid signature file identity`);
  }
  let envelope;
  try {
    envelope = canonicalWorldPackageSignatureEnvelopeV1(record.envelope);
  } catch {
    return signatureEnvelopeInvalid(`${file.path} has an invalid envelope`);
  }
  const expectedPath = `signatures/${requireSafeKeyId(
    envelope.keyId,
    `${file.path}/envelope/keyId`,
  )}.json`;
  if (
    file.path !== expectedPath ||
    envelope.packageRootHash !== directory.receipt.worldPackageRootHash ||
    envelope.packageId !== directory.receipt.manifest.id ||
    envelope.packageFormatVersion !==
      directory.receipt.manifest.packageFormatVersion ||
    envelope.runtimeTarget !== directory.receipt.manifest.runtimeTarget
  ) {
    signatureEnvelopeInvalid(
      `${file.path} does not bind its path and exact Package Root identity`,
    );
  }
  return Object.freeze({
    envelope,
    signatureBytes: canonicalSignatureBytes(record.signatureBase64),
  });
}

function canonicalTrustedPublicKeys(
  value: readonly WorldPackageTrustedPublicKeyV1[],
): readonly Readonly<{
  keyId: string;
  trustDomain: string;
  publicKey: KeyObject;
}>[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertyNames(value).length !== value.length + 1
  ) {
    signatureUntrusted("trustedPublicKeys must be a plain dense array");
  }
  const rows = value.map((candidate, index) => {
    if (isNil(candidate) || !isPlainObject(candidate)) {
      return signatureUntrusted(`trustedPublicKeys/${index} must be a plain object`);
    }
    const record = candidate as unknown as UnknownRecord;
    const fields = Object.keys(record);
    if (
      fields.length !== TRUSTED_PUBLIC_KEY_FIELDS.length ||
      fields.some((field) => !TRUSTED_PUBLIC_KEY_FIELDS.includes(
        field as typeof TRUSTED_PUBLIC_KEY_FIELDS[number],
      ))
    ) {
      return signatureUntrusted(`trustedPublicKeys/${index} has an invalid shape`);
    }
    for (const field of TRUSTED_PUBLIC_KEY_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(record, field);
      if (isNil(descriptor) || !("value" in descriptor) || isNil(descriptor.value)) {
        return signatureUntrusted(
          `trustedPublicKeys/${index}/${field} must be an own data field`,
        );
      }
    }
    let keyId;
    let trustDomain;
    try {
      keyId = requireSafeKeyId(record.keyId, `trustedPublicKeys/${index}/keyId`);
      trustDomain = requireCanonicalString(
        record.trustDomain,
        `trustedPublicKeys/${index}/trustDomain`,
      );
    } catch {
      return signatureUntrusted(`trustedPublicKeys/${index} identity is invalid`);
    }
    return {
      keyId,
      trustDomain,
      publicKey: asEd25519PublicKey(
        record.publicKey as WorldPackageNodePublicKeyV1,
      ),
    };
  });
  const identities = rows.map((row) => `${row.trustDomain}\u0000${row.keyId}`);
  if (new Set(identities).size !== identities.length) {
    signatureUntrusted("trustedPublicKeys contains duplicate key identities");
  }
  return Object.freeze(rows);
}

function verifyDirectoryWithSignatureErrorMapping(
  directory: WorldPackageDirectoryV2,
): VerifiedWorldPackageDirectoryV2 {
  try {
    return verifyWorldPackageDirectoryV2(directory);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("signatureFiles") ||
        error.message.includes("signatures/"))
    ) {
      return signatureEnvelopeInvalid("signature file transport is invalid");
    }
    throw error;
  }
}

function requireHostSignaturePolicy(
  hostPolicy: WorldPackageHostPolicyV1,
): WorldPackageHostPolicyV1["signaturePolicy"] {
  if (isNil(hostPolicy) || !isPlainObject(hostPolicy)) {
    hostIncompatible("Host policy must be a plain object");
  }
  const descriptor = Object.getOwnPropertyDescriptor(hostPolicy, "signaturePolicy");
  if (
    isNil(descriptor) ||
    !("value" in descriptor) ||
    isNil(descriptor.value) ||
    !isPlainObject(descriptor.value)
  ) {
    hostIncompatible("signaturePolicy must be an own plain data object");
  }
  const signaturePolicy = descriptor.value as UnknownRecord;
  const modeDescriptor = Object.getOwnPropertyDescriptor(signaturePolicy, "mode");
  if (isNil(modeDescriptor) || !("value" in modeDescriptor)) {
    hostIncompatible("signaturePolicy/mode must be an own data field");
  }
  if (modeDescriptor.value === "not-required") {
    if (!isEqualStringKeys(signaturePolicy, ["mode"])) {
      hostIncompatible("not-required signaturePolicy must contain only mode");
    }
    return { mode: "not-required" };
  }
  if (modeDescriptor.value === "required") {
    if (!isEqualStringKeys(signaturePolicy, ["mode", "trustDomain"])) {
      hostIncompatible(
        "required signaturePolicy must contain only mode and trustDomain",
      );
    }
    const trustDomainDescriptor = Object.getOwnPropertyDescriptor(
      signaturePolicy,
      "trustDomain",
    );
    if (
      isNil(trustDomainDescriptor) ||
      !("value" in trustDomainDescriptor) ||
      typeof trustDomainDescriptor.value !== "string" ||
      isEmpty(trustDomainDescriptor.value) ||
      trustDomainDescriptor.value.trim() !== trustDomainDescriptor.value
    ) {
      hostIncompatible("signaturePolicy/trustDomain is invalid");
    }
    return {
      mode: "required",
      trustDomain: trustDomainDescriptor.value,
    };
  }
  return hostIncompatible("signaturePolicy/mode is invalid");
}

function isEqualStringKeys(
  record: UnknownRecord,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(record).sort();
  const canonicalExpected = [...expected].sort();
  return keys.length === canonicalExpected.length && keys.every((key, index) =>
    key === canonicalExpected[index]
  );
}

export function signWorldPackageDirectoryV2(
  input: SignWorldPackageDirectoryV2Input,
): WorldPackageDirectoryV2 {
  verifyDirectoryWithSignatureErrorMapping(input.directory);
  const keyId = requireSafeKeyId(input.keyId);
  const envelope = canonicalWorldPackageSignatureEnvelopeV1({
    kind: "worldkit-package-signature-envelope",
    schemaVersion: 1,
    packageRootHash: input.directory.receipt.worldPackageRootHash,
    packageId: input.directory.receipt.manifest.id,
    packageFormatVersion: 2,
    runtimeTarget: input.directory.receipt.manifest.runtimeTarget,
    signatureAlgorithm: "ed25519",
    keyId,
    trustDomain: input.trustDomain,
    signedAt: input.signedAt,
  });
  const path = `signatures/${keyId}.json`;
  if (input.directory.signatureFiles.some((file) => file.path === path)) {
    signatureEnvelopeInvalid(`signature identity '${keyId}' already exists`);
  }
  const signatureBase64 = signBytes(
    null,
    worldPackageSignatureEnvelopeBytesV1(envelope),
    asEd25519PrivateKey(input.privateKey),
  ).toString("base64");
  const signatureFile: WorldPackageSignatureFileV1 = {
    kind: "worldkit-package-signature",
    schemaVersion: 1,
    envelope,
    signatureBase64,
  };
  const rootFiles = input.directory.files.filter((file) =>
    !TRANSPORT_METADATA_PATHS.has(file.path)
  );
  return assembleWorldPackageDirectoryV2({
    receipt: input.directory.receipt,
    files: rootFiles,
    signatureFiles: [
      ...input.directory.signatureFiles,
      {
        path,
        mediaType: SIGNATURE_FILE_MEDIA_TYPE,
        bytes: canonicalJsonBytes(signatureFile),
      },
    ],
  });
}

export function verifyWorldPackageForHostV2(
  input: VerifyWorldPackageForHostV2Input,
): VerifiedWorldPackageDirectoryV2 {
  const verified = verifyDirectoryWithSignatureErrorMapping(input.directory);
  const signaturePolicy = requireHostSignaturePolicy(input.hostPolicy);
  if (isEmpty(input.directory.signatureFiles)) {
    if (signaturePolicy.mode === "required") {
      signatureRequired();
    }
    assertWorldPackageHostCompatibilityV2(
      verified.receipt.manifest,
      input.hostPolicy,
    );
    return verified;
  }
  const trustedPublicKeys = canonicalTrustedPublicKeys(input.trustedPublicKeys);
  let hasRequiredTrustDomainSignature = false;
  for (const file of input.directory.signatureFiles) {
    const signature = parseSignatureFile(file, input.directory);
    const trustedKey = trustedPublicKeys.find((candidate) =>
      candidate.keyId === signature.envelope.keyId &&
      candidate.trustDomain === signature.envelope.trustDomain
    );
    if (isNil(trustedKey)) {
      signatureUntrusted(`${file.path} has no matching trusted public key`);
    }
    if (!verifyBytes(
      null,
      worldPackageSignatureEnvelopeBytesV1(signature.envelope),
      trustedKey.publicKey,
      signature.signatureBytes,
    )) {
      signatureUntrusted(`${file.path} signature verification failed`);
    }
    if (
      signaturePolicy.mode === "required" &&
      signature.envelope.trustDomain ===
        signaturePolicy.trustDomain
    ) {
      hasRequiredTrustDomainSignature = true;
    }
  }
  if (
    signaturePolicy.mode === "required" &&
    !hasRequiredTrustDomainSignature
  ) {
    signatureUntrusted("no signature belongs to the required trust domain");
  }
  assertWorldPackageHostCompatibilityV2(
    verified.receipt.manifest,
    input.hostPolicy,
  );
  return verified;
}
