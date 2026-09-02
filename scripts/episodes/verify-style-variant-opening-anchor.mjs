#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  sha256File,
  validateStyleVariantOpeningAnchorManifest,
} from "../lib/episode-style-variants.mjs";

const arguments_ = process.argv.slice(2);
const value = (name) => {
  const index = arguments_.indexOf(name);
  if (index < 0 || !arguments_[index + 1]) throw new Error(`Missing ${name}.`);
  return arguments_[index + 1];
};
const sceneId = value("--scene-id");
const episodeId = value("--episode-id");
const episodeRoot = path.resolve(value("--episode-root"));
const styleVariantId = value("--style-variant-id");
const requiredApprovalMode = arguments_.includes("--required-approval-mode")
  ? value("--required-approval-mode")
  : null;
const styleRoot = path.join(episodeRoot, "style-variants");
const manifest = JSON.parse(await readFile(
  path.join(styleRoot, "opening-anchor-manifest.json"),
  "utf8",
));
const validation = validateStyleVariantOpeningAnchorManifest(manifest, {
  sceneId,
  episodeId,
  planHash: await sha256File(path.join(styleRoot, "style-variant-plan.json")),
  whiteboxHash: await sha256File(path.join(
    episodeRoot,
    "whitebox/segment-00-first-frame.png",
  )),
  variantCount: 10,
});
if (!validation.ok) {
  throw new Error(`STYLE_VARIANT_OPENING_ANCHOR_INVALID ${JSON.stringify(validation.diagnostics)}`);
}
if (requiredApprovalMode !== null && manifest.approval.mode !== requiredApprovalMode) {
  throw new Error(
    `STYLE_VARIANT_OPENING_ANCHOR_APPROVAL_MODE_REQUIRED ${requiredApprovalMode}`,
  );
}
const anchor = manifest.anchors.find((item) => item.styleVariantId === styleVariantId);
if (!anchor || await sha256File(path.join(styleRoot, anchor.path)) !== anchor.contentHash) {
  throw new Error(`STYLE_VARIANT_OPENING_ANCHOR_STALE ${styleVariantId}`);
}
process.stdout.write(
  `WORLDKIT_STYLE_OPENING_ANCHOR_OK variant=${styleVariantId} hash=${anchor.contentHash}\n`,
);
