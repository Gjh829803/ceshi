import {hashVisualInput, THREE_EPISODE_STYLE_IDS} from './visual-contracts.mjs';
export const THREE_EPISODE_REVIEW_POLICY_ID = 'three-episode-review@2-practical-correspondence';
const hash = value => /^[a-f0-9]{64}$/.test(value ?? '');
export function validateReviewCalibration(calibration) {
  if (calibration == null) return null;
  if (calibration.kind !== 'three-episode-user-review-calibration' || calibration.schemaVersion !== 1 || calibration.reviewPolicyId !== THREE_EPISODE_REVIEW_POLICY_ID || !Array.isArray(calibration.decisions)) throw new Error('EPISODE_REVIEW_CALIBRATION_INVALID');
  const ids = new Set();
  for (const d of calibration.decisions) {
    if (!d.id || ids.has(d.id) || d.authority !== 'user' || d.scope !== 'opening-anchor-only' || !d.userInstruction?.trim() || !d.worldId || ![d.worldBuildHash,d.planHash,d.whiteboxOpeningSha256].every(hash) || !Array.isArray(d.approvedAnchors) || !d.approvedAnchors.length) throw new Error('EPISODE_USER_ACCEPTANCE_INVALID');
    ids.add(d.id); const styles = new Set();
    for (const a of d.approvedAnchors) {
      if (!THREE_EPISODE_STYLE_IDS.includes(a.styleVariantId) || styles.has(a.styleVariantId) || !hash(a.imageSha256)) throw new Error('EPISODE_USER_ACCEPTANCE_IMAGE_INVALID');
      styles.add(a.styleVariantId);
    }
  }
  return calibration;
}
/** Only exact user-selected opening bytes qualify; no style-wide or later-frame approval. */
export function resolveUserAnchorAcceptance(calibration, identity) {
  validateReviewCalibration(calibration);
  if (identity.scope !== 'opening-anchor-only') return null;
  for (const d of [...(calibration?.decisions ?? [])].reverse()) {
    if (d.worldId !== identity.worldId || d.worldBuildHash !== identity.worldBuildHash || d.planHash !== identity.planHash || d.whiteboxOpeningSha256 !== identity.whiteboxOpeningSha256) continue;
    const approved = d.approvedAnchors.find(a=>a.styleVariantId===identity.styleVariantId && a.imageSha256===identity.imageSha256);
    if (approved) return {kind:'three-episode-user-anchor-acceptance',schemaVersion:1,authority:'user',scope:d.scope,mode:'anchors',verdict:'passed',reviewPolicyId:calibration.reviewPolicyId,decisionId:d.id,decisionHash:hashVisualInput(d),worldId:d.worldId,worldBuildHash:d.worldBuildHash,planHash:d.planHash,whiteboxOpeningSha256:d.whiteboxOpeningSha256,styleVariantId:approved.styleVariantId,imageSha256:approved.imageSha256};
  }
  return null;
}
