import {
  KeyObject,
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";

import { canonicalJsonBytes } from "@whitebox-world/protocol";
import type {
  UnsignedWhiteboxCaptureReceiptV1,
  WhiteboxCaptureReceiptV1,
} from "@whitebox-world/runtime-contracts";

export type WhiteboxCapturePrivateKeyV1 = KeyObject | string | Buffer;
export type WhiteboxCapturePublicKeyV1 = KeyObject | string | Buffer;

function privateKey(value: WhiteboxCapturePrivateKeyV1): KeyObject {
  const key = value instanceof KeyObject ? value : createPrivateKey(value);
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") {
    throw new Error("WHITEBOX_CAPTURE_SIGNING_KEY_INVALID: private key must be Ed25519.");
  }
  return key;
}

function publicKey(value: WhiteboxCapturePublicKeyV1): KeyObject {
  const key = value instanceof KeyObject ? value : createPublicKey(value);
  if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") {
    throw new Error("WHITEBOX_CAPTURE_TRUST_KEY_INVALID: public key must be Ed25519.");
  }
  return key;
}

export function whiteboxCaptureSignerKeyIdV1(
  value: WhiteboxCapturePrivateKeyV1 | WhiteboxCapturePublicKeyV1,
): string {
  const key = value instanceof KeyObject && value.type === "public"
    ? value
    : createPublicKey(value);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("WHITEBOX_CAPTURE_TRUST_KEY_INVALID: key must be Ed25519.");
  }
  const fingerprint = createHash("sha256").update(
    key.export({ type: "spki", format: "der" }),
  ).digest("hex");
  return `capture-${fingerprint.slice(0, 24)}`;
}

export function unsignedWhiteboxCaptureReceiptV1(
  receipt: WhiteboxCaptureReceiptV1,
): UnsignedWhiteboxCaptureReceiptV1 {
  const {
    signatureAlgorithm: _signatureAlgorithm,
    signerKeyId: _signerKeyId,
    signatureBase64: _signatureBase64,
    ...unsigned
  } = receipt;
  return unsigned;
}

export function signWhiteboxCaptureReceiptV1(
  receipt: UnsignedWhiteboxCaptureReceiptV1,
  signingPrivateKey: WhiteboxCapturePrivateKeyV1,
): WhiteboxCaptureReceiptV1 {
  const key = privateKey(signingPrivateKey);
  const signerKeyId = whiteboxCaptureSignerKeyIdV1(key);
  const signatureBase64 = sign(
    null,
    canonicalJsonBytes(receipt),
    key,
  ).toString("base64");
  return {
    ...receipt,
    signatureAlgorithm: "ed25519",
    signerKeyId,
    signatureBase64,
  };
}

export function verifyWhiteboxCaptureReceiptSignatureV1(
  receipt: WhiteboxCaptureReceiptV1,
  trustedPublicKey: WhiteboxCapturePublicKeyV1,
): boolean {
  const key = publicKey(trustedPublicKey);
  if (receipt.signerKeyId !== whiteboxCaptureSignerKeyIdV1(key)) return false;
  const signature = Buffer.from(receipt.signatureBase64, "base64");
  if (
    signature.byteLength !== 64 ||
    signature.toString("base64") !== receipt.signatureBase64
  ) return false;
  return verify(
    null,
    canonicalJsonBytes(unsignedWhiteboxCaptureReceiptV1(receipt)),
    key,
    signature,
  );
}
