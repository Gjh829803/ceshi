import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { sha256Bytes, sha256CanonicalJson, stringifyCanonicalJson } from "@whitebox-world/protocol";
import { parseFormalWorldCaptureReceiptV1 } from "@whitebox-world/runtime-contracts";
import {
  NATIVE_SEMANTIC_GEOMETRY_FIXTURES_V1,
  NATIVE_SEMANTIC_GEOMETRY_PIXEL_CLAIMS_V1,
  NATIVE_SEMANTIC_GEOMETRY_TARGET_REF_V1,
} from "../reconstruction/native-semantic-geometry.test-support.js";
import { measureFormalIdentityMaskV1 } from "../reconstruction/formal-identity-mask-measurement.js";
import {
  assertNativeSemanticPixelClaimsV1, type NativeSemanticTargetMaskV1,
} from "./native-semantic-pixel-claims.test-support.js";

// Explicit, read-only comparison of retained real Browser evidence. This never
// starts a model, Browser or production job and adds no production threshold.
const [outputPath, ...evidenceDirectories] = process.argv.slice(2);
assert(outputPath !== undefined && evidenceDirectories.length === Object.keys(NATIVE_SEMANTIC_GEOMETRY_FIXTURES_V1).length,
  "Usage: verify:native-semantic-pixel-claims <new-report.json> <six-evidence-directories>");
const masks: NativeSemanticTargetMaskV1[] = [];
const fixtures = new Set<string>();
const sources = [];
for (const evidenceDirectory of evidenceDirectories) {
  const evidenceBytes = await readFile(path.join(evidenceDirectory, "evidence.json"));
  const evidence = JSON.parse(evidenceBytes.toString("utf8"));
  assert.equal(evidence.kind, "native-no-script-capture-browser-regression");
  assert.equal(evidence.outcome, "passed");
  assert.equal(evidence.scope, "stubbed-generation-real-native-package-browser-capture");
  assert.deepEqual(evidence.cleanupOutcomes, { hostedBrowserSession: "completed", viteServer: "completed" });
  const fixtureId: unknown = evidence.geometryFixtureId;
  assert(typeof fixtureId === "string" && Object.hasOwn(NATIVE_SEMANTIC_GEOMETRY_FIXTURES_V1, fixtureId));
  assert(!fixtures.has(fixtureId), `Duplicate fixture ${fixtureId}`);
  fixtures.add(fixtureId);
  const receiptBytes = await readFile(path.join(evidenceDirectory, "capture/formal-world-capture-receipt.json"));
  const receipt = parseFormalWorldCaptureReceiptV1(JSON.parse(receiptBytes.toString("utf8")));
  assert.equal(receipt.worldPackageRootHash, evidence.worldPackageRootHash);
  const target = receipt.formalRequest.semanticCaptureMap.bindings.find(
    ({ acceptanceTargetRef }) => acceptanceTargetRef === NATIVE_SEMANTIC_GEOMETRY_TARGET_REF_V1,
  );
  assert(target !== undefined);
  const identityColor = Number.parseInt(target.identityColor.slice(1), 16);
  const views = [];
  for (const view of receipt.views) {
    const pngBytes = await readFile(path.join(evidenceDirectory, "capture", `${view.viewId}-identity-mask.png`));
    // Exercise the actual production decoder's hash/dimension/palette admission,
    // then use sharp independently for the test-only binary occupancy oracle.
    const projection = measureFormalIdentityMaskV1({ pngBytes, view,
      targets: receipt.formalRequest.semanticCaptureMap.bindings }).get(target.acceptanceTargetRef);
    assert(projection !== undefined);
    const { data, info } = await sharp(pngBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, view.request.widthPixels);
    assert.equal(info.height, view.request.heightPixels);
    assert.equal(info.channels, 4);
    const occupancy = new Uint8Array(info.width * info.height);
    for (let index = 0; index < occupancy.length; index += 1) {
      const offset = index * 4;
      const color = data[offset]! * 65536 + data[offset + 1]! * 256 + data[offset + 2]!;
      occupancy[index] = data[offset + 3]! >= 128 && color === identityColor ? 1 : 0;
    }
    // The perspective view request deliberately inherits the real ready Camera;
    // comparing only requestHash would miss an opening pose/FOV difference.
    const cameraSignature = sha256CanonicalJson({ request: view.request,
      ...(view.viewId === "opening" ? { camera: receipt.readySnapshot.view.camera } : {}),
    });
    masks.push({ fixtureId, viewId: view.viewId, widthPixels: info.width,
      heightPixels: info.height, occupancy, cameraSignature });
    views.push({ viewId: view.viewId, identityMaskPngContentHash: view.identityMaskPngContentHash,
      cameraSignature, pixelCount: occupancy.reduce((sum, value) => sum + value, 0), projection });
  }
  sources.push({ fixtureId, evidenceDirectory: path.resolve(evidenceDirectory),
    evidenceContentHash: sha256Bytes(evidenceBytes), captureReceiptContentHash: sha256Bytes(receiptBytes),
    worldPackageRootHash: receipt.worldPackageRootHash, views });
}
let failure: unknown;
try {
  assertNativeSemanticPixelClaimsV1({ claims: NATIVE_SEMANTIC_GEOMETRY_PIXEL_CLAIMS_V1, masks });
} catch (error) { failure = error; }
const report = { kind: "native-semantic-pixel-claims-browser-regression",
  outcome: failure === undefined ? "passed" : "failed",
  scope: "retained-real-browser-pixels-no-production-policy-change",
  claims: NATIVE_SEMANTIC_GEOMETRY_PIXEL_CLAIMS_V1, sources,
  ...(failure === undefined ? {} : { error: String(failure) }),
};
await writeFile(outputPath, stringifyCanonicalJson(report), { flag: "wx" });
console.log(JSON.stringify({ outcome: report.outcome, claimCount: report.claims.length,
  reportPath: path.resolve(outputPath) }));
if (failure !== undefined) throw failure;
