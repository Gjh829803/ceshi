import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  parseCanonicalJson,
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/authoring";
import {
  parseWorldRuntimeSnapshotV4,
  validateWhiteboxCaptureReceiptV1,
  validateWhiteboxTriviewManifestV1,
  type WhiteboxCaptureReceiptV1,
  type WhiteboxTriviewManifestV1,
} from "@whitebox-world/runtime-contracts";

import { createWorldBuildArtifactV4 } from "../cli/build-world-artifact.js";
import { verifyWhiteboxCaptureReceiptSignatureV1 } from "./whitebox-capture-signing.js";

export interface HostedWhiteboxArtifactVerificationDiagnosticV1 {
  readonly code: string;
  readonly instancePath: string;
  readonly message: string;
}

export interface HostedWhiteboxArtifactVerificationOptionsV1 {
  readonly sceneId: string;
  readonly authoringPath: string;
  readonly buildPath: string;
  readonly openingFramePath: string;
  readonly runtimeSnapshotPath: string;
  readonly captureReceiptPath: string;
  /** Trusted Host key. It must live outside the imported artifact bundle. */
  readonly trustedCapturePublicKeyPath: string;
  readonly requireTriview: boolean;
  readonly whiteboxTriviewManifestPath?: string;
  readonly whiteboxTriviewRoot?: string;
}

export interface HostedWhiteboxArtifactVerificationResultV1 {
  readonly kind: "worldkit-hosted-whitebox-artifact-verification";
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly sceneId: string;
  readonly worldBuildIdentityHash?: string;
  readonly diagnostics: readonly HostedWhiteboxArtifactVerificationDiagnosticV1[];
}

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

function diagnostic(
  code: string,
  instancePath: string,
  message: string,
): HostedWhiteboxArtifactVerificationDiagnosticV1 {
  return { code, instancePath, message };
}

function sha256Bytes(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function readCanonicalJson(filePath: string): Promise<unknown> {
  const source = await readFile(filePath, "utf8");
  const parsed = parseCanonicalJson(source);
  if (!parsed.ok || parsed.value === undefined) {
    throw new Error(`Artifact is not valid canonical JSON: ${filePath}`);
  }
  return parsed.value;
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return stringifyCanonicalJson(left) === stringifyCanonicalJson(right);
}

export async function verifyHostedWhiteboxArtifactsV1(
  options: HostedWhiteboxArtifactVerificationOptionsV1,
): Promise<HostedWhiteboxArtifactVerificationResultV1> {
  const diagnostics: HostedWhiteboxArtifactVerificationDiagnosticV1[] = [];
  let authoring: unknown;
  let actualBuild: unknown;
  let snapshot: unknown;
  let receipt: unknown;
  let openingFrameBytes: Buffer;
  let trustedCapturePublicKeyBytes: Buffer;
  try {
    [
      authoring,
      actualBuild,
      snapshot,
      receipt,
      openingFrameBytes,
      trustedCapturePublicKeyBytes,
    ] = await Promise.all([
      readCanonicalJson(options.authoringPath),
      readCanonicalJson(options.buildPath),
      readCanonicalJson(options.runtimeSnapshotPath),
      readCanonicalJson(options.captureReceiptPath),
      readFile(options.openingFramePath),
      readFile(options.trustedCapturePublicKeyPath),
    ]);
  } catch (error) {
    return {
      kind: "worldkit-hosted-whitebox-artifact-verification",
      schemaVersion: 1,
      ok: false,
      sceneId: options.sceneId,
      diagnostics: [diagnostic(
        "HOSTED_WHITEBOX_ARTIFACT_READ_FAILED",
        "",
        error instanceof Error ? error.message : String(error),
      )],
    };
  }

  const authoringRecord = authoring as Record<string, unknown>;
  if (
    authoringRecord.kind !== "worldkit-authoring-spec" ||
    authoringRecord.schemaVersion !== 4 ||
    authoringRecord.id !== options.sceneId
  ) {
    diagnostics.push(diagnostic(
      "HOSTED_WHITEBOX_AUTHORING_IDENTITY_INVALID",
      "/authoring",
      "AuthoringSpec kind, schemaVersion, and scene ID must match the admitted world.",
    ));
  }

  const expectedBuild = await createWorldBuildArtifactV4(options.authoringPath);
  if (!expectedBuild.ok) {
    diagnostics.push(...expectedBuild.result.diagnostics.map((entry) => diagnostic(
      entry.code,
      entry.instancePath ?? "/build",
      entry.message,
    )));
  } else if (!sameCanonicalValue(actualBuild, expectedBuild.artifact)) {
    diagnostics.push(diagnostic(
      "HOSTED_WHITEBOX_WORLD_BUILD_IDENTITY_MISMATCH",
      "/build",
      "world.build.json must exactly match the trusted Host rebuild from AuthoringSpec.",
    ));
  }

  try {
    const parsedSnapshot = parseWorldRuntimeSnapshotV4(snapshot);
    if (parsedSnapshot.runtime.phase !== "ready" || parsedSnapshot.resources.phase !== "ready") {
      diagnostics.push(diagnostic(
        "HOSTED_WHITEBOX_RUNTIME_NOT_READY",
        "/runtimeSnapshot",
        "Runtime Snapshot must report ready Runtime and resource phases.",
      ));
    }
  } catch (error) {
    diagnostics.push(diagnostic(
      "HOSTED_WHITEBOX_RUNTIME_SNAPSHOT_INVALID",
      "/runtimeSnapshot",
      error instanceof Error ? error.message : String(error),
    ));
  }

  if (!openingFrameBytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    diagnostics.push(diagnostic(
      "HOSTED_WHITEBOX_OPENING_FRAME_INVALID",
      "/openingFrame",
      "Opening frame must be a PNG artifact.",
    ));
  }

  const receiptDiagnostics = validateWhiteboxCaptureReceiptV1(receipt);
  diagnostics.push(...receiptDiagnostics);
  const typedReceipt = receipt as WhiteboxCaptureReceiptV1;
  try {
    if (!verifyWhiteboxCaptureReceiptSignatureV1(
      typedReceipt,
      trustedCapturePublicKeyBytes,
    )) {
      diagnostics.push(diagnostic(
        "HOSTED_WHITEBOX_CAPTURE_SIGNATURE_UNTRUSTED",
        "/captureReceipt/signatureBase64",
        "Capture receipt signature is not valid for the trusted Host key.",
      ));
    }
  } catch (error) {
    diagnostics.push(diagnostic(
      "HOSTED_WHITEBOX_CAPTURE_SIGNATURE_UNTRUSTED",
      "/captureReceipt/signatureBase64",
      error instanceof Error ? error.message : String(error),
    ));
  }
  const actualBuildRecord = actualBuild as Record<string, unknown>;
  if (
    typedReceipt.sceneId !== options.sceneId ||
    typedReceipt.worldBuildIdentityHash !== actualBuildRecord.worldBuildIdentityHash ||
    typedReceipt.authoringSpecHash !== sha256CanonicalJson(authoring) ||
    typedReceipt.openingFrameContentHash !== sha256Bytes(openingFrameBytes) ||
    typedReceipt.runtimeSnapshotContentHash !== sha256Bytes(
      Buffer.from(`${stringifyCanonicalJson(snapshot)}\n`, "utf8"),
    )
  ) {
    diagnostics.push(diagnostic(
      "HOSTED_WHITEBOX_CAPTURE_RECEIPT_BINDING_MISMATCH",
      "/captureReceipt",
      "Capture receipt does not bind this scene, trusted World Build, opening frame, and Runtime Snapshot.",
    ));
  }

  if (options.requireTriview) {
    if (
      typedReceipt.phase !== "triview-ready" ||
      options.whiteboxTriviewManifestPath === undefined ||
      options.whiteboxTriviewRoot === undefined
    ) {
      diagnostics.push(diagnostic(
        "HOSTED_WHITEBOX_TRIVIEW_RECEIPT_REQUIRED",
        "/captureReceipt/phase",
        "Trusted tri-view admission requires a triview-ready capture receipt.",
      ));
    } else {
      try {
        const manifest = await readCanonicalJson(options.whiteboxTriviewManifestPath);
        diagnostics.push(...validateWhiteboxTriviewManifestV1(manifest));
        const typedManifest = manifest as WhiteboxTriviewManifestV1;
        const manifestBytes = Buffer.from(`${stringifyCanonicalJson(manifest)}\n`, "utf8");
        if (
          typedManifest.worldBuildIdentityHash !== typedReceipt.worldBuildIdentityHash ||
          typedReceipt.whiteboxTriviewManifestContentHash !== sha256Bytes(manifestBytes)
        ) {
          diagnostics.push(diagnostic(
            "HOSTED_WHITEBOX_TRIVIEW_RECEIPT_BINDING_MISMATCH",
            "/captureReceipt/whiteboxTriviewManifestContentHash",
            "Tri-view manifest is not bound to this capture receipt and World Build.",
          ));
        }
        const expectedTargetIds = new Set<string>();
        for (const target of typedManifest.whiteboxTriviews) {
          expectedTargetIds.add(target.visualTargetId);
          const imagePath = path.join(options.whiteboxTriviewRoot, target.imageUri);
          const imageBytes = await readFile(imagePath);
          if (
            !imageBytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
            typedReceipt.whiteboxTriviewImageContentHashesByVisualTargetId[
              target.visualTargetId
            ] !== sha256Bytes(imageBytes)
          ) {
            diagnostics.push(diagnostic(
              "HOSTED_WHITEBOX_TRIVIEW_IMAGE_BINDING_MISMATCH",
              `/captureReceipt/whiteboxTriviewImageContentHashesByVisualTargetId/${target.visualTargetId}`,
              "Tri-view image is missing, invalid, or not bound to the capture receipt.",
            ));
          }
        }
        const receiptTargetIds = Object.keys(
          typedReceipt.whiteboxTriviewImageContentHashesByVisualTargetId,
        );
        if (
          receiptTargetIds.length !== expectedTargetIds.size ||
          receiptTargetIds.some((id) => !expectedTargetIds.has(id))
        ) {
          diagnostics.push(diagnostic(
            "HOSTED_WHITEBOX_TRIVIEW_TARGET_SET_MISMATCH",
            "/captureReceipt/whiteboxTriviewImageContentHashesByVisualTargetId",
            "Capture receipt and tri-view manifest must bind the same visual target set.",
          ));
        }
      } catch (error) {
        diagnostics.push(diagnostic(
          "HOSTED_WHITEBOX_TRIVIEW_READ_FAILED",
          "/triviews",
          error instanceof Error ? error.message : String(error),
        ));
      }
    }
  }

  return {
    kind: "worldkit-hosted-whitebox-artifact-verification",
    schemaVersion: 1,
    ok: diagnostics.length === 0,
    sceneId: options.sceneId,
    ...(typeof actualBuildRecord.worldBuildIdentityHash === "string"
      ? { worldBuildIdentityHash: actualBuildRecord.worldBuildIdentityHash }
      : {}),
    diagnostics,
  };
}
