import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { episodeStyleVariantIds, EPISODE_STYLE_VARIANT_SEGMENT_IDS } from '../lib/episode-style-variants.mjs';

export const THREE_EPISODE_STYLE_IDS = episodeStyleVariantIds(10);
export const THREE_EPISODE_SEGMENT_IDS = EPISODE_STYLE_VARIANT_SEGMENT_IDS;
export const THREE_EPISODE_VISUAL_VERSION = 'three-episode-visual@1';
// Same five independent visual-event slots as the existing Episode production policy.
// These schedule video-only effects; they do not claim SDK commands were executed.
export const THREE_EPISODE_EVENT_SLOTS = Object.freeze([
  ['segment-00', 8], ['segment-00', 20], ['segment-02', 8], ['segment-02', 20], ['segment-04', 14],
].map(([segmentId, segmentRelativeSeconds], index) => Object.freeze({
  id: `prompt-event-0${index}`, segmentId, segmentRelativeSeconds,
})));
// Entity IDs use the SDK contract. Provider request IDs are a separate transport
// concern and must not constrain names authored in the source world.
const entityId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && value === value.trim() && !/[\u0000-\u001f]/.test(value);
const HASH = /^(?:sha256:)?[a-f0-9]{64}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
function assert(condition, message) { if (!condition) throw new Error(`THREE_EPISODE_VISUAL_INVALID: ${message}`); }
function ordered(items, expected, field, label) {
  assert(Array.isArray(items) && items.length === expected.length && items.every((item, index) => item?.[field] === expected[index]), `${label} must include every ordered ID`);
}
export function normalizeVisualHash(value) {
  assert(HASH.test(value ?? ''), 'invalid content hash');
  return value.replace(/^sha256:/, '');
}
export function hashVisualInput(value) {
  const canonical = item => Array.isArray(item) ? item.map(canonical) : object(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])])) : item;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function assertThreeEpisodeVisualInputs(source, capture) {
  assert(object(source) && text(source.worldId), 'source worldId missing');
  for (const name of ['sourceHash', 'worldBuildHash', 'runtimeHash']) normalizeVisualHash(source[name]);
  assert(Array.isArray(source.targets), 'source targets missing');
  const ids = source.targets.map(target => target?.id);
  assert(ids.every(entityId) && new Set(ids).size === ids.length, 'target IDs invalid or duplicated');
  for (const target of source.targets) {
    assert(text(target.name) && object(target.whiteboxTriview) && text(target.whiteboxTriview.path), `target ${target.id} needs its complete whitebox tri-view`);
    normalizeVisualHash(target.whiteboxTriview.sha256);
  }
  if (source.referenceImage) { assert(text(source.referenceImage.path), 'user reference image path missing'); normalizeVisualHash(source.referenceImage.sha256); }
  assert(normalizeVisualHash(capture?.worldBuildHash) === normalizeVisualHash(source.worldBuildHash), 'capture belongs to another world');
  assert(normalizeVisualHash(capture?.runtimeHash) === normalizeVisualHash(source.runtimeHash), 'capture belongs to another runtime');
  ordered(capture?.segments, THREE_EPISODE_SEGMENT_IDS, 'id', 'capture segments');
  for (const segment of capture.segments) {
    for (const name of ['video', 'firstFrame']) {
      assert(text(segment[name]?.path), `${segment.id} ${name} missing`);
      normalizeVisualHash(segment[name].sha256);
    }
    assert(segment.status === 'completed', `${segment.id} has not completed recording`);
  }
}
export function assertThreeEpisodeStylePlan(plan, {worldId, episodeId, inputHash, targetIds, referenceImageSha256, referenceStyleVariantId = 'style-00'}) {
  assert(plan?.kind === 'worldkit-three-episode-style-plan' && plan.schemaVersion === 1 && plan.worldId === worldId && plan.episodeId === episodeId && plan.inputHash === inputHash, 'style plan identity mismatch');
  ordered(plan.variants, THREE_EPISODE_STYLE_IDS, 'id', 'ten styles');
  for (const style of plan.variants) {
    for (const field of ['name', 'styleFamily', 'worldIdentity', 'subjectIdentity', 'diversityRationale', 'concept', 'visualPrompt', 'geminiEventPrompt', 'negativeConstraints']) assert(text(style[field]), `${style.id}.${field} missing`);
    ordered(style.targetInterpretations, targetIds, 'visualTargetId', `${style.id} targets`);
    for (const target of style.targetInterpretations) assert(text(target.finalIdentity) && text(target.appearance), `${style.id} target identity/appearance missing`);
  }
  const originals = plan.variants.filter(style => style.styleMode === 'source-reference');
  if (referenceImageSha256) {
    assert(originals.length === 1 && originals[0].id === referenceStyleVariantId && originals[0].referenceImageSha256 === normalizeVisualHash(referenceImageSha256), 'exactly one hash-bound original-reference style is required in its reserved slot');
  } else assert(originals.length === 0, 'original-reference style requires an actual user image');
  for (const style of plan.variants) {
    assert(['source-reference','reinterpretation'].includes(style.styleMode ?? 'reinterpretation'), 'invalid style mode');
    if (style.styleMode !== 'source-reference') assert(style.referenceImageSha256 == null, 'reinterpretation cannot claim original-reference binding');
  }
  for (const field of ['concept', 'styleFamily', 'worldIdentity', 'subjectIdentity']) assert(new Set(plan.variants.map(style => style[field].trim().toLowerCase())).size === 10, `duplicate ${field}`);
  return plan;
}
export function assertThreeEpisodeAppearanceLock(lock, {worldId, episodeId, inputHash, styleVariantId, anchorSha256, targetIds}) {
  assert(lock?.kind === 'worldkit-three-episode-appearance-lock' && lock.schemaVersion === 1 && lock.worldId === worldId && lock.episodeId === episodeId && lock.inputHash === inputHash && lock.styleVariantId === styleVariantId && lock.anchorSha256 === anchorSha256, 'appearance lock identity mismatch');
  for (const key of ['subjectAppearance', 'environmentAppearance', 'lighting', 'palette', 'negativeConstraints']) assert(text(lock[key]), `appearance lock ${key} missing`);
  ordered(lock.targetAppearances, targetIds, 'targetId', 'appearance lock targets');
  for (const target of lock.targetAppearances) assert(text(target.appearance) && ['anchor-visible', 'planned-hidden'].includes(target.basis), 'appearance lock target binding missing');
  return lock;
}
export function assertThreeEpisodeVisualReview(review, {worldId, episodeId, inputHash, styleVariantId, imageIds, mode}) {
  assert(review?.kind === 'worldkit-three-episode-visual-review' && review.schemaVersion === 1 && review.reviewer === 'cloud-codex' && review.worldId === worldId && review.episodeId === episodeId && review.inputHash === inputHash && review.mode === mode && review.styleVariantId === (styleVariantId ?? null), 'visual review identity mismatch');
  ordered(review.imageReviews, imageIds, 'id', 'reviewed images');
  for (const item of review.imageReviews) assert(['passed', 'needs-repair'].includes(item.verdict) && text(item.observations), `review ${item.id} missing findings`);
  const expected = review.imageReviews.every(item => item.verdict === 'passed') ? 'passed' : 'needs-repair';
  assert(review.verdict === expected && text(review.summary), 'visual review verdict inconsistent');
  if (expected === 'needs-repair') assert(text(review.repairInstructions), 'failed review needs actionable repair instructions');
  return review;
}
export function assertThreeEpisodeDiversityReview(review, {worldId, episodeId, inputHash}) {
  assert(review?.kind === 'worldkit-three-episode-diversity-review' && review.schemaVersion === 1 && review.reviewer === 'cloud-codex' && review.worldId === worldId && review.episodeId === episodeId && review.inputHash === inputHash, 'diversity review identity mismatch');
  ordered(review.variantReviews, THREE_EPISODE_STYLE_IDS, 'styleVariantId', 'diversity review styles');
  const dimensions = ['spatial-registration', 'subjects', 'environments', 'landmarks', 'overall-read'];
  ordered(review.dimensionReviews, dimensions, 'dimension', 'diversity dimensions');
  for (const item of [...review.variantReviews, ...review.dimensionReviews]) assert(['passed', 'needs-repair'].includes(item.verdict) && text(item.observations), 'diversity finding missing');
  for (const item of review.variantReviews) {
    assert(Array.isArray(item.confusableWith) && item.confusableWith.every(id => THREE_EPISODE_STYLE_IDS.includes(id) && id !== item.styleVariantId), 'invalid confusable style');
    if (item.verdict === 'needs-repair') assert(text(item.repairInstructions), 'diversity repair missing');
  }
  const expected = [...review.variantReviews, ...review.dimensionReviews].every(item => item.verdict === 'passed') ? 'passed' : 'needs-repair';
  assert(review.verdict === expected && text(review.summary), 'diversity verdict inconsistent');
  if (expected === 'needs-repair') assert(text(review.repairInstructions) && review.variantReviews.some(item => item.verdict === 'needs-repair'), 'diversity failure must identify styles to repair');
  return review;
}
export function normalizeThreeEpisodeEvents(raw) {
  assert(Array.isArray(raw?.events) && raw.events.length === 5, 'Gemini must return five events');
  const allowed = ['targetNames', 'eventClass', 'magnitude', 'frameImpact', 'dominantChange', 'targetContext', 'beforeState', 'transitionDescription', 'afterState', 'spatialContinuity', 'audioDescription', 'negativeConstraints', 'timing'];
  return raw.events.map((event, index) => {
    assert(object(event) && Object.keys(event).every(key => allowed.includes(key)), 'Gemini returned unsupported event fields');
    assert(Array.isArray(event.targetNames) && event.targetNames.length > 0 && event.targetNames.every(text), 'event targets missing');
    assert(['subject-transformation', 'ability-manifestation', 'environment-transformation', 'atmospheric-spectacle'].includes(event.eventClass), 'eventClass invalid');
    assert(event.magnitude === 'large-scale' && ['subject-dominant', 'environment-dominant', 'sky-dominant'].includes(event.frameImpact?.scope) && event.frameImpact.coverage === 'large' && event.frameImpact.contrast === 'dramatic', 'event magnitude/frameImpact invalid');
    for (const key of ['dominantChange', 'targetContext', 'beforeState', 'transitionDescription', 'afterState', 'spatialContinuity', 'audioDescription', 'negativeConstraints']) assert(text(event[key]), `event ${key} missing`);
    assert(Number.isFinite(event.timing?.transitionDurationSeconds) && event.timing.transitionDurationSeconds >= 1.5 && event.timing.transitionDurationSeconds <= 4 && ['hold', 'fade', 'settle'].includes(event.timing.ending) && Number.isFinite(event.timing.endingDurationSeconds) && event.timing.endingDurationSeconds >= 0, 'event timing invalid');
    assert(THREE_EPISODE_EVENT_SLOTS[index].segmentRelativeSeconds + event.timing.transitionDurationSeconds + event.timing.endingDurationSeconds <= 30, 'event extends beyond capture');
    return {...event, ...THREE_EPISODE_EVENT_SLOTS[index], application: 'video-render-only', actionCoupling: '按指定秒数独立发生；保留真实白模的全部根运动、按键动作与镜头轨迹。'};
  });
}
export function assertAnchorHashesUnchanged(before, after) {
  assert(isDeepStrictEqual(before, after), 'accepted opening anchor bytes changed');
}
export function buildThreeEpisodeRenderPrompt({variant, segment, styledTriviews, events}) {
  const camera = segment.camera ?? segment.cameraFacts ?? null;
  const references = styledTriviews.map((target, index) => `@图片${index + 2} = ${target.targetId}（${target.name}）完整正面、右侧面、背面外观。`).join('\n');
  const timeline = events.length ? events.map(event => `第${event.segmentRelativeSeconds}秒开始，${event.timing.transitionDurationSeconds}秒完成：${event.beforeState} → ${event.transitionDescription} → ${event.afterState}。结束方式：${event.timing.ending}，结束持续${event.timing.endingDurationSeconds}秒。空间：${event.spatialContinuity}。声音：${event.audioDescription}。禁止：${event.negativeConstraints}`).join('\n') : '本段没有视觉事件，保持基础外观、天气和灯光连续稳定。';
  return `@视频1是本片唯一的空间、运动、动作时序和相机路径权威。逐帧保持地形高度、道路边界、物体锚点与数量、近中远景关系、遮挡、开口、运动通道、人物根轨迹、跳跃起落、镜头透视、裁切、占屏比例和首尾构图。不得改变地图或为展示设计移动镜头。\n\n@图片1是该段最终样式首帧，是人物身份、材质、色彩、灯光、天气和风格权威。保留主体当前可见侧，背面不得翻成正面。白模原颜色只用于对象识别，不是不可更改的语义色；简化网格、辅助线、UI和白模材质不得出现在最终成片。允许自然表面和外观细化，保留宏观空间和运动边界。\n\n${references}\n三视图是条件式外观字典，不是场景清单。只在真实视频当前画面存在对应实体时使用；不得新增未出现的目标，也不得为了展示完整外观改变可见比例、遮挡或裁切。\n\n当前世界：${variant.worldIdentity}\n当前主体：${variant.subjectIdentity}\n外观：${variant.visualPrompt}\n禁止：${variant.negativeConstraints}\n\n摄影：严格复现真实视频的投影、机位、俯仰、拍摄侧、跟随距离和速度；不得自行添加切镜、推拉或环绕。${camera ? `录制器提供的相机事实：${JSON.stringify(camera)}。` : '相机参数未额外声明，以实际视频为准。'}不得假定固定焦段或第三人称模式。\n\n视觉事件（只修改视频外观，不代表白模发生了世界命令）：\n${timeline}\n\n动作细节可在原有根运动内部自然补全重量、惯性、步态和衣物滞后，不能新增起跳、移动、转向或改变实际时序。只生成同步的环境音和动作音，无音乐、歌声、对白或旁白。无文字、Logo、水印、时间码、界面、穿模、闪烁、身份漂移。`;
}
