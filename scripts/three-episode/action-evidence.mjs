import { readFile } from 'node:fs/promises';
import { hashVisualInput } from './visual-contracts.mjs';

export function actionTimelineIdentity(segment) {
  return { actionTimelineHash: hashVisualInput(segment.actionTimeline ?? []), actionEvidence: segment.actionEvidence?.sha256 ?? null };
}
export function actionEvidenceText(segments) {
  const evidence = segments.map(segment => ({ segmentId: segment.id, actionTimeline: segment.actionTimeline ?? [] }));
  return `实际 SDK 动作证据（60Hz 模拟 tick，24fps 视频帧；tick 从该段开头计数）：${JSON.stringify(evidence)}。startTick 是命令发出时间，stateChanges 是逐 tick 观察到的实际状态变化；accepted 仅表示已受理。仅 succeeded 可描述为完成；failed、cancelled、missing 均不得补成成功动作。保留证据中的动作、目标和时序，稀疏视频采样未显示短动作时仍须保留这些已观测事实。空数组表示没有声明的动作目标，普通运动仍以真实视频为准。`;
}
export async function verifyActionEvidence(segment) {
  if (!segment.actionEvidence) {
    if (segment.actionTimeline?.length) throw new Error('EPISODE_VISUAL_ACTION_EVIDENCE_MISSING');
    return;
  }
  const document = JSON.parse(await readFile(segment.actionEvidence.path, 'utf8'));
  if (document.kind !== 'three-episode-action-timeline' || document.schemaVersion !== 1 || hashVisualInput(document.actionTimeline) !== hashVisualInput(segment.actionTimeline)) throw new Error('EPISODE_VISUAL_ACTION_EVIDENCE_CHANGED');
}
